# HỆ THỐNG TRỢ LÝ AI - PHÂN TÍCH BÁO CÁO ĐƠN HỦY 24/7 (LOGISTICS & DEPOT)

Dự án độc lập chuyên sâu về **Phân tích dữ liệu Logistics, Quản trị Kho Bãi (Depot) & Hãng tàu**. Hệ thống tự động tiếp nhận file báo cáo danh sách đơn hủy (Excel `.xlsx`, `.xls` hoặc `.csv`), dò tiêu đề thông minh, làm sạch dữ liệu, tổng hợp chỉ số KPIs và tự động phát hiện các bất thường (Anomalies).

---

## Cấu Trúc Dự Án (Directory Structure)

```text
Logistics-Cancellation-Analytics/
├── package.json                   # Cấu hình dự án & thư viện (Express, Multer, XLSX, CORS)
├── server.js                      # Web Server & REST API (Port 5050)
├── schema_cancellation_orders.sql # Kịch bản tạo bảng PostgreSQL chuẩn hóa
├── services/
│   └── cancellationAnalyzer.js    # Core Engine: Dò Header, làm sạch, thẩm định SQL, phát hiện Anomaly
├── public/                        # Giao diện Web Trắng & Xanh Dương
│   ├── index.html                 # Màn hình Bảng Điều Hành Phân Tích (Dashboard)
│   ├── upload.html                # Màn hình Đăng Tải & Quản Lý Lịch Sử Dữ Liệu riêng biệt
│   ├── style.css                  # Tông màu Trắng & Xanh dương chuẩn Logistics
│   ├── app.js                     # Xử lý hiển thị Dashboard & Biểu đồ Chart.js
│   └── upload.js                  # Xử lý thẩm định form SQL & Quản lý lịch sử nạp
├── sample-data/
│   └── mau_bao_cao_don_huy.csv   # Dữ liệu thực tế 67 đơn hủy ca đêm/sáng ngày 02/10/2026
└── README.md                      # Hướng dẫn chi tiết
```

---

## Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Mở Terminal / PowerShell tại thư mục dự án:
```powershell
cd "c:\Users\TinDD\Documents\Porfolio website\Logistics-Cancellation-Analytics"
```

### 2. Cài đặt các thư viện phụ thuộc:
```powershell
npm install
```

### 3. Khởi chạy hệ thống:
```powershell
npm start
```

### 4. Truy cập giao diện Web:
Mở trình duyệt bất kỳ và truy cập địa chỉ:
**`http://localhost:5050`**

- Bạn có thể nhấn ngay nút **"Dữ Liệu Mẫu (Demo)"** trên giao diện để xem kết quả phân tích 67 đơn hủy mẫu.
- Hoặc kéo thả file Excel/CSV báo cáo mới vào vùng tải lên.

---

## Tài Liệu Tích Hợp REST API

### 1. Phân tích file tải lên (Multipart Form)
- **Endpoint:** `POST /api/analyze`
- **Body:** `multipart/form-data` với key `file` (chọn file `.xlsx`, `.xls` hoặc `.csv`).
- **Query Params:**
  - `?format=json` (mặc định): Trả về cấu trúc JSON sạch theo schema.
  - `?format=markdown`: Trả về toàn bộ nội dung báo cáo định dạng Markdown tiếng Việt.

### 2. Lấy dữ liệu mẫu kiểm thử
- **Endpoint:** `GET /api/sample`
- **Output:** Dữ liệu phân tích chuẩn của tệp 67 đơn hủy.

### 3. Kiểm tra trạng thái máy chủ
- **Endpoint:** `GET /health`

---

## Các Quy Tắc Nghiệp Vụ Xử Lý Dữ Liệu

1. **Dò dòng Header tự động (Auto Header Detection):**
   - Quét từ trên xuống để nhận diện dòng chứa các cột khóa: `STT`, `Depot`, `Hãng tàu`, `Ngày hủy đơn`, `Số booking`, `Trạng thái đơn hàng`, `Lý do hủy`.
   - Bỏ qua các hàng tiêu đề báo cáo, dòng trống, hoặc ghi chú phụ ở đầu tệp.

2. **Làm sạch & Chuẩn hóa:**
   - Chuẩn hóa ngày giờ sang chuẩn `YYYY-MM-DD HH:mm:ss`.
   - Cắt bỏ khoảng trắng thừa (`trim`), chuyển đổi các giá trị `NaN`, `null`, `undefined` thành chuỗi rỗng an toàn.
   - Ép kiểu số cho `SizeTEUS` (cont 20' = 1 TEU, cont 40' = 2 TEUs).

3. **Thuật toán phát hiện bất thường (Anomaly Engine):**
   - **ACTIVATED_BUT_CANCELLED (Nghiêm trọng):** Đơn đã kích hoạt vào bãi nhưng vẫn bị hủy (nguy cơ kẹt bãi, quá TAT, cổng sự cố).
   - **CONTAINER_GRADE_REJECTED (Cảnh báo):** Vỏ cont không đủ tiêu chuẩn đóng hàng (lỗi phân loại của Giám định M&R).
   - **INVENTORY_OR_QUOTA_ISSUE (Cảnh báo):** Depot hết cont cấp hoặc Booking vượt quá hạn ngạch hãng tàu.
   - **TRUCK_BREAKDOWN (Lưu ý):** Sự cố hỏng xe hoặc tài xế nhập nhầm thông tin.
