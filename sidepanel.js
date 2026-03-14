const STORAGE_KEY = "openai_api_key";

document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleKeyBtn = document.getElementById("toggleKey");
  const saveKeyBtn = document.getElementById("saveKey");
  const saveStatus = document.getElementById("saveStatus");

  chrome.storage.local.get([STORAGE_KEY], (data) => {
    if (data[STORAGE_KEY]) {
      apiKeyInput.placeholder = "•••••••••••• (đã lưu)";
    }
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

  function setStatus(text, type) {
    saveStatus.textContent = text;
    saveStatus.className = "status " + (type || "");
  }
});
