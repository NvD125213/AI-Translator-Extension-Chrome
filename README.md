# AI Translator – Extension Chrome

Dịch trang web và đoạn text bằng AI (OpenAI, Gemini, Claude, DeepSeek). Bôi đen chữ → chuột phải để dịch. API key lưu trên thiết bị, theo dõi token và chi phí theo từng nhà cung cấp.

---

## Tính năng

- **Dịch đoạn được chọn**: Bôi đen văn bản → chuột phải → chọn **"AI Translator: Dịch đoạn được chọn"**. Bản dịch hiển thị ngay dưới đoạn gốc (không thay thế).
- **Dịch toàn trang**: Mở popup extension → nhấn **"Dịch toàn trang"** (dịch nội dung trang hiện tại).
- **Nhiều nhà cung cấp**: Chọn OpenAI, Gemini (Google), Claude (Anthropic) hoặc DeepSeek; chọn model tương ứng.
- **Bảo mật**: API key chỉ lưu trong Chrome Storage trên máy của bạn, không gửi đi nơi khác.
- **Theo dõi sử dụng**: Xem token đã dùng và số tiền ước tính (USD) theo từng nhà cung cấp, có nút đặt lại.

---

## Cài đặt (Chế độ nhà phát triển)

1. Mở Chrome → vào `chrome://extensions`.
2. Bật **Chế độ nhà phát triển** (góc trên bên phải).
3. Chọn **Tải tiện ích đã giải nén**.
4. Chọn thư mục chứa project (có file `manifest.json`).

Extension sẽ xuất hiện trên thanh công cụ; bạn có thể ghim icon để dùng nhanh.

---

## Hướng dẫn sử dụng

### 1. Cấu hình lần đầu

1. **Click icon extension** trên thanh công cụ để mở popup.
2. **Nhập API key** của nhà cung cấp bạn muốn dùng (OpenAI / Gemini / Claude / DeepSeek).
3. Nhấn **"Lưu API Key"** — key được lưu trên thiết bị.
4. Chọn **Nhà cung cấp** (OpenAI, Gemini, Claude, DeepSeek).
5. Chọn **Model** (danh sách thay đổi theo nhà cung cấp).
6. Nếu cần lấy API key mới, dùng link **"Lấy API key"** trong popup (link đổi theo nhà cung cấp đang chọn).

**Lưu ý**: Mỗi nhà cung cấp dùng API key riêng. Khi đổi nhà cung cấp, hãy nhập và lưu lại key tương ứng.

### 2. Dịch đoạn văn bản (trên trang web bất kỳ)

1. Mở trang web bình thường (http/https), **bôi đen** đoạn cần dịch (có thể nhiều đoạn liền kề).
2. **Chuột phải** vào vùng đã bôi đen.
3. Chọn **"AI Translator: Dịch đoạn được chọn"**.
4. Đợi vài giây — bản dịch xuất hiện **ngay dưới** từng đoạn gốc (màu xanh, có viền trái), gốc không bị xóa.

Extension không chạy trên một số trang đặc biệt (ví dụ `chrome://`, trang Chrome Web Store). Hãy thử trên trang web thông thường.

### 3. Dịch toàn trang

1. Mở trang cần dịch.
2. Click icon extension → nhấn **"Dịch toàn trang"**.
3. Extension gửi lệnh dịch cho trang; kết quả tùy cách trang đó xử lý.
   (Lưu ý: không khuyến khích sử dụng dịch toàn trang vì có thể vượt hạn mức)

### 4. Xem token và chi phí

- Trong popup: **"Token đã dùng"** và **"Số tiền đã tiêu (ước tính)"** hiển thị theo **nhà cung cấp đang chọn**.
- **"Đặt lại"**: Xóa token và số tiền đã tính cho nhà cung cấp đó (không ảnh hưởng nhà cung cấp khác).

---

## Cấu trúc thư mục (gợi ý)

```
├── manifest.json      # Khai báo extension
├── popup.html / popup.js / popup.css
├── background.js      # Service worker, gọi API AI
├── content.js         # Chạy trên trang, xử lý chọn text & chèn bản dịch
├── icons/             # Icon 16, 48, 128
└── README.md
```

---

## Yêu cầu

- Google Chrome (hoặc trình duyệt tương thích Chromium).
- API key từ ít nhất một trong: [OpenAI](https://platform.openai.com/api-keys), [Google AI Studio (Gemini)](https://aistudio.google.com/apikey), [Anthropic (Claude)](https://console.anthropic.com/settings/keys), [DeepSeek](https://platform.deepseek.com/api_keys).

---

## Bảo mật & quyền

- **API key**: Chỉ lưu trong `chrome.storage.local` trên máy bạn; extension không gửi key đến server của bên thứ ba (trừ khi gọi API của chính nhà cung cấp AI bạn chọn).
- **Quyền**: Extension cần quyền truy cập tab đang dùng, lưu trữ, và gửi request đến API của OpenAI / Google / Anthropic / DeepSeek khi bạn dùng tính năng dịch.

---

## Phiên bản

- **1.0** — Hỗ trợ OpenAI, Gemini, Claude, DeepSeek; dịch đoạn chọn + dịch toàn trang; theo dõi token và chi phí.
