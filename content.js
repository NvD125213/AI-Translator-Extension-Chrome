// Một listener duy nhất: xử lý cả dịch toàn trang và dịch đoạn được bôi đen
chrome.runtime.onMessage.addListener((msg) => {
  try {
    // Dịch toàn trang: cùng logic dịch đoạn chọn — lấy từng block, gọi API, chèn bản dịch bên dưới
    if (msg.action === "translatePage") {
      const segments = getAllBlocksWithText();
      if (!segments.length) {
        console.log("[AI Translator] Trang không có block text để dịch.");
        return;
      }

      const texts = segments.map((s) => s.text);
      const blocks = segments.map((s) => s.block);
      const loadingEls = showLoadingBelowEachBlock(blocks);

      chrome.runtime.sendMessage(
        {
          action: "translateSelections",
          texts,
          targetLang: "vi",
        },
        (response) => {
          removeLoadings(loadingEls);
          if (chrome.runtime.lastError) {
            console.error("[AI Translator]", chrome.runtime.lastError.message);
            alert("Lỗi kết nối. Mở trang web bình thường rồi thử lại.");
            return;
          }
          if (response && response.error) {
            console.error("[AI Translator]", response.error);
            alert(response.error);
            return;
          }
          const translated = response && response.translated;
          if (
            !Array.isArray(translated) ||
            translated.length !== blocks.length
          ) {
            console.error("[AI Translator] Số bản dịch không khớp số block.");
            alert("Dịch không hoàn tất (số đoạn không khớp).");
            return;
          }
          blocks.forEach((block, i) => {
            insertTranslationAfterElement(block, translated[i]);
          });
        },
      );
    }

    // Dịch đoạn text được bôi đen (theo từng block, mỗi block một bản dịch ngay bên dưới)
    if (msg.action === "translateSelection") {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        console.log("[AI Translator] Không có text được chọn.");
        return;
      }
      const range = selection.getRangeAt(0);
      const segments = getBlocksAndSelectedTextInRange(range);
      if (!segments.length) {
        console.log(
          "[AI Translator] Không tách được đoạn nào trong vùng chọn.",
        );
        return;
      }

      const texts = segments.map((s) => s.text);
      const blocks = segments.map((s) => s.block);
      const loadingEls = showLoadingBelowEachBlock(blocks);

      chrome.runtime.sendMessage(
        {
          action: "translateSelections",
          texts,
        },
        (response) => {
          removeLoadings(loadingEls);
          if (chrome.runtime.lastError) {
            console.error(
              "[AI Translator selection]",
              chrome.runtime.lastError.message,
            );
            return;
          }
          if (response && response.error) {
            console.error("[AI Translator selection]", response.error);
            alert(response.error);
            return;
          }
          const translated = response && response.translated;
          if (
            !Array.isArray(translated) ||
            translated.length !== blocks.length
          ) {
            console.error(
              "[AI Translator selection] Số bản dịch không khớp số đoạn.",
            );
            return;
          }
          blocks.forEach((block, i) => {
            insertTranslationAfterElement(block, translated[i]);
          });
        },
      );
    }
  } catch (err) {
    console.error("[AI Translator] Lỗi:", err);
    alert("Lỗi: " + (err && err.message));
  }
});

const BLOCK_SELECTOR =
  "p, div, h1, h2, h3, h4, h5, h6, li, td, th, section, article, blockquote, a";

/** Lấy tất cả block có text trên trang (chỉ block “trong cùng”), dùng cho dịch toàn trang */
function getAllBlocksWithText() {
  const blocks = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null,
    false,
  );
  let el;
  while ((el = walker.nextNode())) {
    if (!el.matches || !el.matches(BLOCK_SELECTOR)) continue;
    const text = (el.textContent || "").trim();
    if (!text) continue;
    blocks.push({ block: el, text });
  }
  const innermost = blocks.filter((b) => {
    return !blocks.some(
      (other) =>
        other.block !== b.block && b.block.contains(other.block),
    );
  });
  return innermost;
}

// Lấy danh sách block nằm trong range và đoạn text được chọn trong từng block (theo thứ tự document)
function getBlocksAndSelectedTextInRange(range) {
  const blocks = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null,
    false,
  );
  let el;
  while ((el = walker.nextNode())) {
    if (!el.matches || !el.matches(BLOCK_SELECTOR)) continue;
    if (!range.intersectsNode(el)) continue;
    const text = getRangeTextInBlock(range, el);
    if (text && text.trim()) blocks.push({ block: el, text: text.trim() });
  }
  // Chỉ giữ block “trong cùng” (không chứa block khác trong danh sách)
  const innermost = blocks.filter((b) => {
    return !blocks.some(
      (other) => other.block !== b.block && b.block.contains(other.block),
    );
  });
  return innermost;
}

// Lấy phần text của range nằm trong một block
function getRangeTextInBlock(range, block) {
  const blockStart = document.createRange();
  blockStart.setStart(block, 0);
  blockStart.setEnd(block, 0);
  const blockEnd = document.createRange();
  blockEnd.setStart(block, block.childNodes.length);
  blockEnd.setEnd(block, block.childNodes.length);
  const r = range.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, blockStart) < 0) {
    r.setStart(block, 0);
  } else {
    r.setStart(range.startContainer, range.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, blockEnd) > 0) {
    r.setEnd(block, block.childNodes.length);
  } else {
    r.setEnd(range.endContainer, range.endOffset);
  }
  if (r.collapsed) return "";
  return r.toString();
}

// Inject CSS cho vòng tròn xoay (chỉ một lần)
function injectSpinnerStyles() {
  if (document.getElementById("ai-translator-spinner-styles")) return;
  const style = document.createElement("style");
  style.id = "ai-translator-spinner-styles";
  style.textContent = `
    @keyframes ai-translator-spin {
      to { transform: rotate(360deg); }
    }
    .ai-translator-loading-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0 0;
      padding: 4px 0;
    }
    .ai-translator-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #e2e8f0;
      border-top-color: #0ea5e9;
      border-radius: 50%;
      animation: ai-translator-spin 0.7s linear infinite;
      flex-shrink: 0;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// Tạo một ô loading: vòng tròn xoay
function createSpinnerElement() {
  injectSpinnerStyles();
  const wrap = document.createElement("div");
  wrap.setAttribute("data-ai-translator", "loading");
  wrap.className = "ai-translator-loading-wrap";
  const circle = document.createElement("div");
  circle.className = "ai-translator-spinner";
  wrap.appendChild(circle);
  return wrap;
}

// Hiện một vòng tròn xoay ngay dưới mỗi block, trả về mảng element để sau xóa
function showLoadingBelowEachBlock(blocks) {
  const elements = [];
  for (const block of blocks) {
    const el = createSpinnerElement();
    if (block && block.parentNode) {
      block.parentNode.insertBefore(el, block.nextSibling);
    } else {
      document.body.appendChild(el);
    }
    elements.push(el);
  }
  return elements;
}

function removeLoadings(elements) {
  if (!Array.isArray(elements)) return;
  elements.forEach((el) => {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  });
}

// Chèn bản dịch vào thẻ <p> ngay dưới phần tử cho trước, giữ nguyên text gốc, màu khác
function insertTranslationAfterElement(insertAnchor, translated) {
  if (!translated) return;

  const p = document.createElement("p");
  p.textContent = translated;
  p.setAttribute("data-ai-translator", "translation");
  p.className = "ai-translator-result";
  p.style.cssText =
    "color:#0ea5e9;margin:4px 0 0;font-size:0.95em;line-height:1.4;padding:4px 0;border-left:3px solid #0ea5e9;padding-left:8px;";

  if (insertAnchor && insertAnchor.parentNode) {
    insertAnchor.parentNode.insertBefore(p, insertAnchor.nextSibling);
  } else {
    // Fallback: chèn cuối body nếu không xác định được vị trí
    document.body.appendChild(p);
  }
}

