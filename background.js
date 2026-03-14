chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Page Translator background service worker installed.");

  // Tạo menu chuột phải cho AI Translator
  chrome.contextMenus.create({
    id: "ai-translator-selection",
    title: "AI Translator: Dịch đoạn được chọn",
    contexts: ["selection"],
  });
});

// Click vào menu chuột phải → gửi lệnh dịch đoạn chọn
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "ai-translator-selection" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action: "translateSelection" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[AI Translator] Mở trang web bình thường (http/https) rồi bôi đen và thử lại.");
    }
  });
});

// Lắng nghe message từ content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Dịch toàn trang (echo demo)
  if (msg.action === "translateText") {
    const texts = msg.texts || [];
    const translated = texts.map(
      (t) => "[Dịch: " + (t || "").slice(0, 30) + "...]",
    );
    sendResponse({ translated });
    return true;
  }

  // Dịch một đoạn (giữ tương thích cũ)
  if (msg.action === "translateSelection") {
    const text = msg.text || "";
    translateWithGPT(text, "vi")
      .then((translated) => {
        sendResponse({ translated });
      })
      .catch((err) => {
        console.error("[AI Translator][GPT error]", err);
        sendResponse({ error: err && err.message });
      });
    return true;
  }

  // Dịch nhiều đoạn: mảng texts → mảng translated (mỗi đoạn chèn dưới đúng block)
  if (msg.action === "translateSelections") {
    const texts = Array.isArray(msg.texts) ? msg.texts : [];
    const targetLang = msg.targetLang || "vi";
    Promise.all(texts.map((t) => translateWithGPT(t || "", targetLang)))
      .then((translated) => {
        sendResponse({ translated });
      })
      .catch((err) => {
        console.error("[AI Translator][GPT error]", err);
        sendResponse({ error: err && err.message });
      });
    return true;
  }
});

const STORAGE_KEY = "openai_api_key";
const STORAGE_PROVIDER = "ai_translator_provider";
const STORAGE_MODEL = "ai_translator_model";
const STORAGE_TOKEN_BY_PROVIDER = "token_usage_by_provider";
const STORAGE_COST_BY_PROVIDER = "cost_by_provider";

// Bảng giá USD / 1M token (input, output) – tham khảo từng nhà cung cấp
const PRICING = {
  openai: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  },
  gemini: {
    "gemini-1.5-flash": { input: 0.075, output: 0.3 },
    "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15 },
    "gemini-1.5-pro": { input: 1.25, output: 5 },
  },
  claude: {
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
    "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  },
  deepseek: {
    "deepseek-chat": { input: 0.14, output: 0.28 },
    "deepseek-coder": { input: 0.14, output: 0.28 },
  },
};

async function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function getCostUSD(provider, model, promptTokens, completionTokens) {
  const byProvider = PRICING[provider];
  if (!byProvider) return 0;
  const prices = byProvider[model] || Object.values(byProvider)[0];
  if (!prices) return 0;
  const inputCost = (promptTokens / 1e6) * prices.input;
  const outputCost = (completionTokens / 1e6) * prices.output;
  return inputCost + outputCost;
}

async function addUsageByProvider(provider, promptTokens, completionTokens, model) {
  const totalTokens = promptTokens + completionTokens;
  const costUSD = getCostUSD(provider, model, promptTokens, completionTokens);
  const data = await getStorage([STORAGE_TOKEN_BY_PROVIDER, STORAGE_COST_BY_PROVIDER]);
  const tokenByProvider =
    data[STORAGE_TOKEN_BY_PROVIDER] && typeof data[STORAGE_TOKEN_BY_PROVIDER] === "object"
      ? { ...data[STORAGE_TOKEN_BY_PROVIDER] }
      : {};
  const costByProvider =
    data[STORAGE_COST_BY_PROVIDER] && typeof data[STORAGE_COST_BY_PROVIDER] === "object"
      ? { ...data[STORAGE_COST_BY_PROVIDER] }
      : {};
  tokenByProvider[provider] = (tokenByProvider[provider] || 0) + totalTokens;
  costByProvider[provider] = (costByProvider[provider] || 0) + costUSD;
  await new Promise((r) =>
    chrome.storage.local.set(
      {
        [STORAGE_TOKEN_BY_PROVIDER]: tokenByProvider,
        [STORAGE_COST_BY_PROVIDER]: costByProvider,
      },
      r
    )
  );
}

async function translateWithGPT(text, targetLang) {
  const data = await getStorage([STORAGE_KEY, STORAGE_PROVIDER, STORAGE_MODEL]);
  const apiKey = data[STORAGE_KEY] || "";
  const provider = data[STORAGE_PROVIDER] || "openai";
  const model = data[STORAGE_MODEL] || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("Chưa cấu hình API key. Mở popup để lưu API key.");
  }

  if (provider !== "openai") {
    throw new Error(`Chưa hỗ trợ nhà cung cấp "${provider}". Hiện chỉ dùng OpenAI.`);
  }

  const body = {
    model: model,
    messages: [
      {
        role: "system",
        content: `You are a translation engine. Always translate the user text to ${targetLang}. Only return the translated text, no explanations.`,
      },
      {
        role: "user",
        content: text,
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error("OpenAI error: " + errText);
  }

  const responseData = await res.json();

  // Log raw response để debug nếu cần
  console.log("[AI Translator][GPT raw response]", responseData);

  // Lưu token và số tiền theo nhà cung cấp (bảng giá từng model)
  if (responseData.usage) {
    const promptTokens = responseData.usage.prompt_tokens || 0;
    const completionTokens = responseData.usage.completion_tokens || 0;
    const totalTokens =
      responseData.usage.total_tokens || promptTokens + completionTokens;
    await addUsageByProvider(provider, promptTokens, completionTokens, model);
    const costUSD = getCostUSD(provider, model, promptTokens, completionTokens);
    console.log(
      "[AI Translator][Usage] provider=",
      provider,
      "totalTokens=",
      totalTokens,
      "≈ costUSD=",
      costUSD.toFixed(6),
    );
  }

  const choice = responseData.choices && responseData.choices[0];
  return choice && choice.message && choice.message.content
    ? choice.message.content.trim()
    : "";
}
