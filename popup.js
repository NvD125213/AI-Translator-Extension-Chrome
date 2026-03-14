const STORAGE_KEY = "openai_api_key";
const STORAGE_PROVIDER = "ai_translator_provider";
const STORAGE_MODEL = "ai_translator_model";
const STORAGE_TOKEN_BY_PROVIDER = "token_usage_by_provider";
const STORAGE_COST_BY_PROVIDER = "cost_by_provider";

const PROVIDER_MODELS = {
  openai: [
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
  ],
  gemini: [
    { value: "gemini-1.5-flash", label: "gemini-1.5-flash" },
    { value: "gemini-1.5-flash-8b", label: "gemini-1.5-flash-8b" },
    { value: "gemini-1.5-pro", label: "gemini-1.5-pro" },
  ],
  claude: [
    { value: "claude-3-5-haiku-20241022", label: "claude-3-5-haiku" },
    { value: "claude-3-haiku-20240307", label: "claude-3-haiku" },
    { value: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "deepseek-chat" },
    { value: "deepseek-coder", label: "deepseek-coder" },
  ],
};

document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleKeyBtn = document.getElementById("toggleKey");
  const saveKeyBtn = document.getElementById("saveKey");
  const saveStatus = document.getElementById("saveStatus");
  const translateBtn = document.getElementById("translateBtn");
  const providerSelect = document.getElementById("provider");
  const modelSelect = document.getElementById("model");
  const tokenCountEl = document.getElementById("tokenCount");
  const costDisplayEl = document.getElementById("costDisplay");
  const resetTokensBtn = document.getElementById("resetTokens");
  const currentModelLabel = document.getElementById("currentModelLabel");

  function getModelLabel(provider, modelValue) {
    const models = PROVIDER_MODELS[provider] || PROVIDER_MODELS.openai;
    const m = models.find((x) => x.value === modelValue);
    return m ? m.label : modelValue;
  }

  function updateProviderStats(provider, modelValue, tokenByProvider, costByProvider) {
    const label = getModelLabel(provider, modelValue);
    const providerName =
      { openai: "OpenAI", gemini: "Gemini", claude: "Claude", deepseek: "DeepSeek" }[
        provider
      ] || provider;
    currentModelLabel.innerHTML =
      "Model đang dùng: <strong>" + providerName + " / " + label + "</strong>";
    const tokens =
      tokenByProvider && typeof tokenByProvider[provider] === "number"
        ? tokenByProvider[provider]
        : 0;
    const costUSD =
      costByProvider && typeof costByProvider[provider] === "number"
        ? costByProvider[provider]
        : 0;
    tokenCountEl.textContent = tokens.toLocaleString();
    costDisplayEl.textContent = "$" + costUSD.toFixed(4);
  }

  function fillModelSelect(provider) {
    const models = PROVIDER_MODELS[provider] || PROVIDER_MODELS.openai;
    const current = modelSelect.value;
    modelSelect.innerHTML = "";
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.value;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    });
    if (models.some((m) => m.value === current)) {
      modelSelect.value = current;
    } else if (models.length) {
      modelSelect.value = models[0].value;
    }
  }

  function loadStorage() {
    chrome.storage.local.get(
      [
        STORAGE_KEY,
        STORAGE_PROVIDER,
        STORAGE_MODEL,
        STORAGE_TOKEN_BY_PROVIDER,
        STORAGE_COST_BY_PROVIDER,
      ],
      (data) => {
        if (data[STORAGE_KEY]) {
          apiKeyInput.placeholder = "•••••••••••• (đã lưu)";
          apiKeyInput.value = "";
        }
        const provider = data[STORAGE_PROVIDER] || "openai";
        const model = data[STORAGE_MODEL] || "gpt-4o-mini";
        providerSelect.value = provider;
        fillModelSelect(provider);
        if (data[STORAGE_MODEL]) modelSelect.value = data[STORAGE_MODEL];
        const tokenByProvider = data[STORAGE_TOKEN_BY_PROVIDER] || {};
        const costByProvider = data[STORAGE_COST_BY_PROVIDER] || {};
        updateProviderStats(
          provider,
          modelSelect.value,
          tokenByProvider,
          costByProvider
        );
      }
    );
  }

  loadStorage();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_TOKEN_BY_PROVIDER] || changes[STORAGE_COST_BY_PROVIDER]) {
      chrome.storage.local.get(
        [STORAGE_TOKEN_BY_PROVIDER, STORAGE_COST_BY_PROVIDER],
        (data) => {
          updateProviderStats(
            providerSelect.value,
            modelSelect.value,
            data[STORAGE_TOKEN_BY_PROVIDER] || {},
            data[STORAGE_COST_BY_PROVIDER] || {}
          );
        }
      );
    }
  });

  providerSelect.addEventListener("change", () => {
    const provider = providerSelect.value;
    fillModelSelect(provider);
    const modelValue = modelSelect.value;
    chrome.storage.local.set({
      [STORAGE_PROVIDER]: provider,
      [STORAGE_MODEL]: modelValue,
    });
    chrome.storage.local.get(
      [STORAGE_TOKEN_BY_PROVIDER, STORAGE_COST_BY_PROVIDER],
      (data) => {
        updateProviderStats(
          provider,
          modelValue,
          data[STORAGE_TOKEN_BY_PROVIDER] || {},
          data[STORAGE_COST_BY_PROVIDER] || {}
        );
      }
    );
  });

  modelSelect.addEventListener("change", () => {
    const modelValue = modelSelect.value;
    chrome.storage.local.set({ [STORAGE_MODEL]: modelValue });
    chrome.storage.local.get(
      [STORAGE_TOKEN_BY_PROVIDER, STORAGE_COST_BY_PROVIDER],
      (data) => {
        updateProviderStats(
          providerSelect.value,
          modelValue,
          data[STORAGE_TOKEN_BY_PROVIDER] || {},
          data[STORAGE_COST_BY_PROVIDER] || {}
        );
      }
    );
  });

  toggleKeyBtn.addEventListener("click", () => {
    const type = apiKeyInput.type;
    apiKeyInput.type = type === "password" ? "text" : "password";
    toggleKeyBtn.textContent = type === "password" ? "🙈" : "👁";
  });

  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      setStatus("Vui lòng nhập API key.", "error");
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEY]: key }, () => {
      if (chrome.runtime.lastError) {
        setStatus("Lỗi: " + chrome.runtime.lastError.message, "error");
        return;
      }
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "•••••••••••• (đã lưu)";
      apiKeyInput.type = "password";
      toggleKeyBtn.textContent = "👁";
      setStatus("Đã lưu API key.", "success");
    });
  });

  resetTokensBtn.addEventListener("click", () => {
    const provider = providerSelect.value;
    chrome.storage.local.get(
      [STORAGE_TOKEN_BY_PROVIDER, STORAGE_COST_BY_PROVIDER],
      (data) => {
        const tokenByProvider = { ...(data[STORAGE_TOKEN_BY_PROVIDER] || {}) };
        const costByProvider = { ...(data[STORAGE_COST_BY_PROVIDER] || {}) };
        tokenByProvider[provider] = 0;
        costByProvider[provider] = 0;
        chrome.storage.local.set(
          {
            [STORAGE_TOKEN_BY_PROVIDER]: tokenByProvider,
            [STORAGE_COST_BY_PROVIDER]: costByProvider,
          },
          () => {
            updateProviderStats(
              provider,
              modelSelect.value,
              tokenByProvider,
              costByProvider
            );
            setStatus("Đã đặt lại token & số tiền (nhà cung cấp này).", "success");
          }
        );
      }
    );
  });

  translateBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        setStatus("Không tìm thấy tab.", "error");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: "translatePage" }, () => {
        if (chrome.runtime.lastError) {
          setStatus("Mở trang web bình thường rồi thử lại.", "error");
        }
      });
      setStatus("Đã gửi lệnh dịch trang.", "success");
    } catch (e) {
      setStatus("Lỗi: " + (e && e.message), "error");
    }
  });

  function setStatus(text, type) {
    saveStatus.textContent = text;
    saveStatus.className = "status " + (type || "");
  }
});
