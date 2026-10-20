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

---

## 5. QUY CHUẨN THUẬT TOÁN GOM ĐƠN ĐẶT LẠI & BỘ NHỚ ĐỆM (REBOOKING VERIFICATION & BUFFER CACHING)

### A. KIẾN TRÚC PIPELINE GOM ĐƠN 3 VÒNG TUẦN TỰ (SEQUENTIAL PIPELINE)
Luôn tuân thủ nguyên tắc xử lý tuần tự: Vòng sau lấy toàn bộ kết quả đầu ra đã lọc/gom của Vòng trước làm đầu vào.

1. **VÒNG 1 - Gom sơ bộ (Booking + Container + Chiều)**:
   - Khóa gom: `soBooking + soContainer + loaiDonHang (IN/OUT)`.
   - Tiền xử lý (Pass 1.5): Ghép và cập nhật số Booking cho các đơn ban đầu chưa có Booking dựa trên số Container và Chiều của các đơn có Booking thực gần nhất.

2. **VÒNG 2 - Gom theo dấu vết xe & người tạo (Container + Chiều + Người tạo + Biển số xe)**:
   - Đầu vào: Toàn bộ danh sách nhóm đã xử lý từ Vòng 1.
   - Khóa gom: `soContainer + loaiDonHang + nguoiTao + soXe (chuẩn hóa)`.
   - Nghiệp vụ: Gom các đơn bị hủy/thất bại sau đó đổi Booking mới với cùng Cont và cùng Nhà xe/Tài xế. Cập nhật số Booking mới nhất và Trạng thái mới nhất của đơn đó.

3. **VÒNG 3 - Gom chuyên biệt đơn OUT đặt lại (Chiều OUT + Người tạo + Depot + Hãng tàu + Số xe)**:
   - Đầu vào: Toàn bộ danh sách nhóm đã xử lý từ Vòng 2.
   - Khóa gom: CHỈ áp dụng cho đơn `loaiDonHang = "OUT"`, kết hợp `nguoiTao + depot + hangTau + soXe`.
   - **Ràng buộc an toàn cốt lõi**:
     - Các đơn thành viên BẮT BUỘC phải **KHÁC Số Booking** VÀ **KHÁC Số Container**.
     - Đơn trước đó BẮT BUỘC phải có trạng thái Hủy/Thất bại (`HỦY`, `FAILED`, `CANCEL`).
     - **Tuyệt đối không gom các container khác nhau thuộc cùng một Booking nhiều cont** (bảo toàn đơn nhiều cont xuất phát từ cùng một Booking).

### B. QUY CHUẨN QUẢN LÝ BỘ NHỚ ĐỆM (BUFFER CACHE & FALLBACK MECHANISM)

1. **Bộ nhớ đệm Backend (Server In-Memory Buffer Cache - `services/rebookingAnalyzer.js`)**:
   - Lưu trữ kết quả gom nhóm hoàn chỉnh trong RAM server (`cachedGroups`, `cachedRecordsHash`, `lastComputedTime`).
   - TTL bộ nhớ đệm: 10 phút.
   - Cơ chế tự động hủy đệm (`invalidateRebookingCache()`): Bắt buộc kích hoạt ngay lập tức khi:
     - Tải lên tệp mới (`POST /api/verification/upload`).
     - Xóa một đợt upload dữ liệu (`DELETE /api/verification/history/:id`).
     - Dọn dẹp sạch toàn bộ dữ liệu (`POST /api/verification/clear-all`).
   - Hỗ trợ cờ làm mới tức thì qua URL: `?refresh=1`.

2. **Cơ chế Fallback 2 lớp tại Frontend (`public/rebooking-analytics.js`)**:
   - Mặc định ưu tiên gọi endpoint Server-side `/api/rebooking/grouped-orders` để lấy kết quả tính sẵn (tối ưu hóa 100% CPU trình duyệt, tốc độ tải tức thì).
   - Nếu endpoint máy chủ trả về `404` (do máy chủ chưa kịp khởi động lại) hoặc gặp lỗi mạng: Hệ thống tự động chuyển tiếp liền mạch (Graceful Fallback) sang `/api/verification/all-data` và chạy gom nhóm bằng hàm `groupOrders()` cục bộ phía Client.
   - Lưu cache phiên làm việc vào `sessionStorage` (`rebooking_analytics_cache_v2`) để hiển thị dữ liệu ngay khi mở tab mới.



