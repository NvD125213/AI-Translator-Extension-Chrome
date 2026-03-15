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

const SYSTEM_PROMPT = (targetLang) =>
  `You are a translation engine. Always translate the user text to ${targetLang}. Only return the translated text, no explanations.`;

/** OpenAI: https://api.openai.com/v1/chat/completions */
async function translateWithOpenAI(apiKey, model, text, targetLang) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT(targetLang) },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error("OpenAI: " + (await res.text()));
  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim() ?? "";
  const usage = data.usage || {};
  return {
    text: content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
  };
}

/** Google Gemini: https://generativelanguage.googleapis.com/v1beta/models/...:generateContent */
async function translateWithGemini(apiKey, model, text, targetLang) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT(targetLang) }],
      },
    }),
  });
  if (!res.ok) throw new Error("Gemini: " + (await res.text()));
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.[0];
  const content = part?.text?.trim() ?? "";
  const usage = data.usageMetadata || {};
  const promptTokens = usage.promptTokenCount || 0;
  const completionTokens = usage.candidatesTokenCount ?? usage.totalTokenCount ?? 0;
  return {
    text: content,
    promptTokens,
    completionTokens,
  };
}

/** Anthropic Claude: https://api.anthropic.com/v1/messages */
async function translateWithClaude(apiKey, model, text, targetLang) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT(targetLang),
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) throw new Error("Claude: " + (await res.text()));
  const data = await res.json();
  const block = data.content?.[0];
  const content = block?.type === "text" ? block.text?.trim() ?? "" : "";
  const usage = data.usage || {};
  return {
    text: content,
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
  };
}

/** DeepSeek: OpenAI-compatible, https://api.deepseek.com/v1/chat/completions */
async function translateWithDeepSeek(apiKey, model, text, targetLang) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT(targetLang) },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error("DeepSeek: " + (await res.text()));
  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim() ?? "";
  const usage = data.usage || {};
  return {
    text: content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
  };
}

async function translateWithGPT(text, targetLang) {
  const data = await getStorage([STORAGE_KEY, STORAGE_PROVIDER, STORAGE_MODEL]);
  const apiKey = (data[STORAGE_KEY] || "").trim();
  const provider = data[STORAGE_PROVIDER] || "openai";
  const model = data[STORAGE_MODEL] || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("Chưa cấu hình API key. Mở popup để lưu API key.");
  }

  let result;
  switch (provider) {
    case "openai":
      result = await translateWithOpenAI(apiKey, model, text, targetLang);
      break;
    case "gemini":
      result = await translateWithGemini(apiKey, model, text, targetLang);
      break;
    case "claude":
      result = await translateWithClaude(apiKey, model, text, targetLang);
      break;
    case "deepseek":
      result = await translateWithDeepSeek(apiKey, model, text, targetLang);
      break;
    default:
      throw new Error(`Chưa hỗ trợ nhà cung cấp "${provider}". Chọn: openai, gemini, claude, deepseek.`);
  }

  if (result.promptTokens > 0 || result.completionTokens > 0) {
    await addUsageByProvider(provider, result.promptTokens, result.completionTokens, model);
    const costUSD = getCostUSD(provider, model, result.promptTokens, result.completionTokens);
    console.log(
      "[AI Translator][Usage] provider=",
      provider,
      "totalTokens=",
      result.promptTokens + result.completionTokens,
      "≈ costUSD=",
      costUSD.toFixed(6),
    );
  }

  return result.text;
}
