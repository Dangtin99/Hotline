# QUY CHUẨN HOẠT ĐỘNG & NGUYÊN TẮC HỆ THỐNG
# DỰ ÁN: LOGISTICS CANCELLATION ANALYTICS (HỆ THỐNG PHÂN TÍCH ĐƠN HỦY 24/7)

Tài liệu này ghi nhớ các nguyên tắc cốt lõi bắt buộc AI Assistant phải luôn tuân thủ khi phát triển, chỉnh sửa và bảo trì mã nguồn trong dự án này.

---

## 1. NGUYÊN TẮC GIAO DIỆN: ĐƠN GIẢN HÓA & KHÔNG ICON (STRICT NO-ICON & MINIMALIST UI)

1. **Tuyệt đối KHÔNG sử dụng ký tự icon / emoji:**
   - Không chèn thêm bất kỳ ký tự icon, emoji Unicode (như 📦, 📊, 📑, 🔍, ⚠️, ✅, 🔴, 🟡, ⏳, v.v.), icon font hay biểu tượng trang trí vào bất kỳ đâu trong dự án.
   - Áp dụng trên toàn bộ phạm vi: HTML, CSS, mã nguồn JavaScript (Frontend & Backend), SQL schema, chuỗi log (`console.log`, `console.warn`), và tệp tài liệu (`README.md`).

2. **Dùng nhãn văn bản thuần túy (Text-Only Labels & Badges):**
   - Thay vì dùng icon để biểu thị cấp độ hoặc trạng thái, luôn sử dụng từ ngữ chuyên nghiệp, rõ ràng:
     - Mức độ cảnh báo: `[NGHIÊM TRỌNG]`, `[CẢNH BÁO]`, `[LƯU Ý]`.
     - Trạng thái đếm ngược / xử lý: `Đã xử lý`, `Quá 3h (Đã hủy)`, `Còn {thời gian}`, `Chưa kích hoạt`, `Đã kích hoạt`.
     - Nút bấm và hành động: `Tải File Khác`, `Xuất CSV`, `Xem Bảng Đầy Đủ`, `Chọn File Từ Máy Tính`, `Kiểm Tra Form SQL`, `Import Dữ Liệu`, `Đăng xuất`.

3. **Giao diện tinh gọn, không quá màu mè (Clean, Functional & Restrained Styling):**
   - Giữ phong cách thiết kế phẳng, trực quan, chuyên nghiệp phục vụ báo cáo điều hành và vận hành Logistics.
   - Sử dụng bảng màu chuẩn mực: Nền trắng / xám nhạt (`#f8fafc`, `#f0f4f8`), tông xanh dương chủ đạo (`#1d4ed8`), màu chữ có độ tương phản cao và dễ đọc.
   - Hạn chế tối đa việc lạm dụng dải màu gradient sặc sỡ, đổ bóng quá dày hoặc các hiệu ứng chuyển động không cần thiết gây rối mắt người dùng.

---

## 2. QUY CHUẨN XỬ LÝ DỮ LIỆU & PHÁT TRIỂN TÍNH NĂNG

1. **Độ chính xác và tính toàn vẹn:**
   - Luôn bảo toàn tính chuẩn xác của các cột dữ liệu theo bảng `cancellation_orders` (PostgreSQL / SQLite / Supabase).
   - Đảm bảo cơ chế kiểm tra `null`, `undefined`, chuỗi rỗng trước khi xử lý logic hoặc tính toán.

2. **Tốc độ và tính ổn định:**
   - Ưu tiên các giải pháp xử lý cục bộ, nhanh chóng, không làm chậm tốc độ render bảng và biểu đồ.
   - Khi chỉnh sửa file, chỉ thay đổi đúng phạm vi cần thiết, giữ gìn cấu trúc gốc của hệ thống.

---

## 3. QUY CHUẨN TỐC ĐỘ PHẢN HỒI & BẢO VỆ VECTOR INDEXING

1. **Bảo toàn 4 tệp cấu hình loại trừ (Four-Tier Exclusion Defense):**
   - Luôn duy trì và bảo vệ: `.gitignore`, `.geminiignore`, `.ignore`, `.vscode/settings.json`.
   - Ngăn chặn hoàn toàn việc quét, nạp vào bộ nhớ Vector Indexing hoặc local search các tệp dữ liệu lớn trong `data/` (> 35MB), `node_modules/`, `sample-data/`, `scratch/`.

2. **Quy chuẩn đọc mã nguồn cục bộ (Targeted Reading):**
   - Với các tệp đơn khối lớn (`app.js`, `data-table.js`, `database.js`), AI luôn sử dụng tìm kiếm chuỗi mục tiêu và chỉ đọc từ 30–60 dòng xung quanh phần cần sửa, tuyệt đối không đọc toàn bộ tệp để đảm bảo thời gian phản hồi siêu tốc (5–15 giây).

---

## 4. QUY CHUẨN TUÂN THỦ PHẠM VI YÊU CẦU (STRICT SCOPE BOUNDARY & EXPLICIT CONFIRMATION)

1. **Tuyệt đối không tự ý mở rộng phạm vi (Strict Scope Boundary / No Over-Engineering):**
   - AI Agent chỉ được phép can thiệp và thực hiện chính xác các nội dung, thành phần, tệp và chức năng mà người dùng trực tiếp yêu cầu.
   - Tuyệt đối không tự ý sửa đổi ngoài lề, tái cấu trúc (refactor), đổi màu sắc, đổi nhãn chữ, xóa mã nguồn hoặc thêm các tính năng phát sinh không có trong yêu cầu của người dùng.

2. **Bắt buộc hỏi ý kiến trước khi thực hiện bất kỳ chỉnh sửa nào nằm ngoài yêu cầu:**
   - Nếu trong quá trình xử lý, phát hiện các điểm liên đới kỹ thuật hoặc có đề xuất cải tiến nằm ngoài phạm vi yêu cầu trực tiếp, AI **BẮT BUỘC PHẢI HỎI Ý KIẾN VÀ NÊU RÕ VẤN ĐỀ CHO NGƯỜI DÙNG TRƯỚC**.
   - Chỉ được phép triển khai chỉnh sửa khi đã nhận được sự đồng thuận rõ ràng từ người dùng.


