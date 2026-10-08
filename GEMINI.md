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
