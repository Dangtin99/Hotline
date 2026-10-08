-- ==============================================================================
-- BẢNG LƯU TRỮ DỮ LIỆU ĐƠN LỆNH EIR & ĐƠN HỦY (LOGISTICS & DEPOT ANALYTICS)
-- Hệ Quản Trị Cơ Sở Dữ Liệu: PostgreSQL 13+ / SQLite / Supabase Cloud
-- Nguồn dữ liệu đối chiếu: Báo cáo danh sách chi tiết đơn lệnh EIR (Gate IN / OUT)
-- ==============================================================================

-- 1. Tạo Bảng eir_cancellation_orders
DROP TABLE IF EXISTS eir_cancellation_orders CASCADE;

CREATE TABLE eir_cancellation_orders (
    -- Khóa chính tự tăng
    id BIGSERIAL PRIMARY KEY,
    
    -- Thông tin định danh & Phân loại
    stt_file VARCHAR(50),                                      -- Mã số EIR / STT từ file dữ liệu gốc
    depot VARCHAR(20) NOT NULL,                                 -- Mã Depot tiếp nhận (THT, BSD, SLD, EPD, ETD, AIC, SCD, EAD)
    hang_tau VARCHAR(20) NOT NULL,                             -- Mã Hãng tàu (COS, CMA, EVG, YML, WHL, HLC, HMM)
    
    -- Mốc thời gian vận hành
    ngay_huy_don TIMESTAMP WITHOUT TIME ZONE NOT NULL,          -- Mốc thời gian hủy đơn (hoặc Ngày tạo nếu là đơn tổng quát)
    ngay_duoc_duyet TIMESTAMP WITHOUT TIME ZONE,               -- Ngày giờ đơn được duyệt (NULL nếu chưa duyệt)
    
    -- Chứng từ & Container
    so_booking VARCHAR(100),                                   -- Số Booking / Số vận đơn (B/L)
    so_container VARCHAR(100),                                 -- Số container (hoặc mã EIR dự phòng nếu chưa có số cont)
    loai_container VARCHAR(100),                               -- Quy cách cont quy đổi: Cont 20' DC, Cont 40' HC, Cont 40' RF...
    loai_don_hang VARCHAR(10) CHECK (loai_don_hang IN ('IN', 'OUT', 'N/A')), -- Chiều vận hành: IN (Gate IN), OUT (Gate OUT)
    size_teus NUMERIC(4, 2) DEFAULT 0,                         -- Kích cỡ quy đổi TEUS: 20' = 1.0 TEU, 40'/45' = 2.0 TEUs
    
    -- Trạng thái đơn & Kích hoạt bãi
    trang_thai_don_hang VARCHAR(50) DEFAULT 'Chưa xác định',   -- Trạng thái: Đã thanh toán, Chưa thanh toán, Xếp tài, Đã hủy
    trang_thai_kich_hoat VARCHAR(50) DEFAULT 'Chưa kích hoạt', -- Trạng thái kích hoạt: Chưa kích hoạt, Đã kích hoạt
    thoi_gian_kich_hoat TIMESTAMP WITHOUT TIME ZONE,           -- Mốc thời gian tài xế vào xếp tài tại cổng bãi
    
    -- Nguyên nhân, Từ chối & Ghi chú đối soát
    ly_do_huy TEXT,                                            -- Lý do hủy đơn thực tế (từ cột Lý do Huỷ)
    ly_do_tu_choi TEXT,                                        -- Ghi chú từ chối của điều độ (từ cột Ghi chú từ chối duyệt)
    ly_do_huy_check TEXT,                                      -- Ghi chú vận hành bổ sung (từ cột Ghi chú thêm Gate OUT)
    
    -- Thông tin Tài xế & Nhà xe
    ten_tai_xe VARCHAR(150),                                   -- Họ và tên tài xế vận chuyển
    sdt_tai_xe VARCHAR(50),                                    -- Số điện thoại liên lạc tài xế
    ten_nha_xe VARCHAR(255),                                   -- Tên công ty / đơn vị vận tải
    sdt_nha_xe VARCHAR(50),                                    -- Số điện thoại liên lạc nhà xe (nếu có)
    
    -- Quản trị hệ thống & Nhật ký kiểm toán (Audit Trail)
    file_nguon VARCHAR(255),                                   -- Tên tệp dữ liệu nguồn tải lên
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 2. TẠO CÁC CHỈ MỤC (INDEXES) TỐI ƯU HÓA TRUY VẤN EXECUTIVE DASHBOARD
-- ==============================================================================

-- Chỉ mục lọc kết hợp Depot và Ngày phát sinh (Tối ưu cho bộ lọc trung tâm Dashboard)
CREATE INDEX idx_eir_depot_date ON eir_cancellation_orders (depot, ngay_huy_don DESC);

-- Chỉ mục lọc theo Hãng tàu
CREATE INDEX idx_eir_hang_tau ON eir_cancellation_orders (hang_tau);

-- Chỉ mục lọc theo Chiều vận hành IN/OUT và Sản lượng TEUS
CREATE INDEX idx_eir_direction_teus ON eir_cancellation_orders (loai_don_hang, size_teus);

-- Chỉ mục lọc theo Trạng thái đơn hàng và Trạng thái kích hoạt (Phát hiện Anomaly)
CREATE INDEX idx_eir_status_activation ON eir_cancellation_orders (trang_thai_don_hang, trang_thai_kich_hoat);

-- Chỉ mục tìm kiếm nhanh theo mã Booking và Container
CREATE INDEX idx_eir_booking_container ON eir_cancellation_orders (so_booking, so_container);

-- Chỉ mục lọc nhanh các đơn Chưa thanh toán kèm thời gian duyệt (Quản lý cảnh báo đếm ngược 3h)
CREATE INDEX idx_eir_unpaid_approval ON eir_cancellation_orders (trang_thai_don_hang, ngay_duoc_duyet)
WHERE trang_thai_don_hang = 'Chưa thanh toán';

-- ==============================================================================
-- 3. TRIGGER TỰ ĐỘNG CẬP NHẬT TRƯỜNG updated_at KHI CÓ THAY ĐỔI
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_eir_orders_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eir_orders_updated_at ON eir_cancellation_orders;
CREATE TRIGGER trg_eir_orders_updated_at
    BEFORE UPDATE ON eir_cancellation_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_eir_orders_timestamp();

-- ==============================================================================
-- 4. DỮ LIỆU MẪU ĐỐI CHIẾU THỰC TẾ (SAMPLE INSERTS)
-- ==============================================================================

-- Mẫu 1: Đơn Gate OUT lấy cont rỗng đã thanh toán (EIR33979091)
INSERT INTO eir_cancellation_orders (
    stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
    so_booking, so_container, loai_container, loai_don_hang, size_teus,
    trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat,
    ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
    ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon
) VALUES (
    'EIR33979091', 'THT', 'COS', '2026-10-03 09:59:00', '2026-10-03 09:59:00',
    '6467835160', 'EIR33979091', 'Cont 40'' HC', 'OUT', 2.0,
    'Đã thanh toán', 'Chưa kích hoạt', NULL,
    NULL, NULL, NULL,
    'Nguyễn văn Duẩn', '966269589', 'AN VƯỢNG (CTY CP THƯƠNG MẠI VẬN TẢI AN VƯỢNG)', NULL, 'eir_orders_20261003.csv'
);

-- Mẫu 2: Đơn Gate IN bị hủy sau khi duyệt (EIR33979072)
INSERT INTO eir_cancellation_orders (
    stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
    so_booking, so_container, loai_container, loai_don_hang, size_teus,
    trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat,
    ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
    ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon
) VALUES (
    'EIR33979072', 'SLD', 'CMA', '2026-10-03 09:56:00', '2026-10-03 09:54:00',
    'I226566143', 'YMMU7640389', 'Cont 40'' HC', 'IN', 2.0,
    'Đã hủy', 'Chưa kích hoạt', NULL,
    'Thay đổi kế hoạch nâng hạ.', NULL, NULL,
    'Nguyễn Nam Bắc', '387700992', 'Chi nhánh Công ty TNHH HANARO TNS Việt Nam Tại Tp.HCM', NULL, 'eir_orders_20261003.csv'
);

-- Mẫu 3: Đơn Gate OUT đã kích hoạt xếp tài vào bãi (EIR33979045)
INSERT INTO eir_cancellation_orders (
    stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
    so_booking, so_container, loai_container, loai_don_hang, size_teus,
    trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat,
    ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
    ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon
) VALUES (
    'EIR33979045', 'THT', 'CMA', '2026-10-03 09:44:00', '2026-10-03 09:46:00',
    'SGN3474167', 'EIR33979045', 'Cont 40'' DC', 'OUT', 2.0,
    'Xếp tài', 'Đã kích hoạt', '2026-10-03 09:46:00',
    NULL, NULL, NULL,
    'TRẦN QUỐC HOÀN', '914557971', 'CTY TNHH TV HOAN THAO', NULL, 'eir_orders_20261003.csv'
);

-- ==============================================================================
-- 5. CÁC TRUY VẤN BÁO CÁO ĐIỀU HÀNH PHỔ BIẾN (COMMON EXECUTIVE QUERIES)
-- ==============================================================================

-- Truy vấn A: Tổng hợp KPIs điều hành theo Depot
-- SELECT 
--     depot,
--     COUNT(*) AS tong_so_don,
--     SUM(size_teus) AS tong_teus,
--     COUNT(*) FILTER (WHERE loai_don_hang = 'IN') AS don_gate_in,
--     COUNT(*) FILTER (WHERE loai_don_hang = 'OUT') AS don_gate_out,
--     COUNT(*) FILTER (WHERE trang_thai_don_hang = 'Đã thanh toán') AS da_thanh_toan,
--     COUNT(*) FILTER (WHERE trang_thai_don_hang = 'Chưa thanh toán') AS chua_thanh_toan,
--     COUNT(*) FILTER (WHERE trang_thai_don_hang = 'Đã hủy') AS da_huy
-- FROM eir_cancellation_orders
-- GROUP BY depot
-- ORDER BY tong_so_don DESC;

-- Truy vấn B: Ma trận chéo số lượng đơn giữa Hãng Tàu và Depot
-- SELECT 
--     hang_tau,
--     COUNT(*) FILTER (WHERE depot = 'THT') AS tht,
--     COUNT(*) FILTER (WHERE depot = 'BSD') AS bsd,
--     COUNT(*) FILTER (WHERE depot = 'SLD') AS sld,
--     COUNT(*) FILTER (WHERE depot = 'EPD') AS epd,
--     COUNT(*) AS tong_cong
-- FROM eir_cancellation_orders
-- GROUP BY hang_tau
-- ORDER BY tong_cong DESC;
