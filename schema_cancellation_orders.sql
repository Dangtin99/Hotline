-- ==============================================================================
-- BẢNG LƯU TRỮ DỮ LIỆU BÁO CÁO ĐƠN HỦY 24/7 (LOGISTICS & DEPOT)
-- Hệ Quản Trị Cơ Sở Dữ Liệu: PostgreSQL 13+
-- ==============================================================================

-- 1. Tạo Bảng cancellation_orders
DROP TABLE IF EXISTS cancellation_orders CASCADE;

CREATE TABLE cancellation_orders (
    id BIGSERIAL PRIMARY KEY,
    
    -- Thông tin cơ bản
    stt_file VARCHAR(50),                                      -- STT trong file Excel/CSV gốc
    depot VARCHAR(20) NOT NULL,                                 -- Mã Depot (BSD, SLD, THT, AIC, SCD, PMCM, ETD, GKP, EPD...)
    hang_tau VARCHAR(20) NOT NULL,                             -- Mã Hãng tàu (YML, CMA, COS, EVG, WHL, HLC, KHG, MSK...)
    
    -- Mốc thời gian
    ngay_huy_don TIMESTAMP WITHOUT TIME ZONE NOT NULL,          -- Ngày giờ phát sinh hủy đơn
    ngay_duoc_duyet TIMESTAMP WITHOUT TIME ZONE,               -- Ngày giờ đơn được duyệt (NULL nếu chưa duyệt)
    
    -- Chứng từ & Container
    so_booking VARCHAR(100),                                   -- Số Booking / Số Bill
    so_container VARCHAR(100),                                 -- Số container & Mã EIR (vd: EIR33976051-UTCU4812986)
    loai_container VARCHAR(100),                               -- Quy cách cont (Cont 40' HC - cao Khô, Cont 20'DC...)
    loai_don_hang VARCHAR(10) CHECK (loai_don_hang IN ('IN', 'OUT', 'N/A')), -- Chiều vận hành (IN: Hạ cont, OUT: Lấy cont)
    size_teus NUMERIC(4, 2) DEFAULT 0,                         -- Kích cỡ quy đổi TEUS (20' = 1 TEU, 40' = 2 TEUs)
    
    -- Trạng thái đơn & Kích hoạt
    trang_thai_don_hang VARCHAR(50) DEFAULT 'Đã hủy',          -- Trạng thái: Đã hủy, Đã hoàn tiền, Đang hoàn tiền
    trang_thai_kich_hoat VARCHAR(50) DEFAULT 'Chưa kích hoạt', -- Trạng thái: Chưa kích hoạt, Đã kích hoạt
    thoi_gian_kich_hoat TIMESTAMP WITHOUT TIME ZONE,           -- Thời gian tài xế kích hoạt vào bãi
    
    -- Nguyên nhân & Ghi chú từ chối
    ly_do_huy TEXT,                                            -- Lý do hủy đơn thực tế
    ly_do_tu_choi TEXT,                                        -- Phản hồi từ chối của Điều độ (nếu có)
    ly_do_huy_check TEXT,                                      -- Ghi chú đối soát nội bộ
    
    -- Thông tin Tài xế & Nhà xe
    ten_tai_xe VARCHAR(150),                                   -- Họ tên tài xế
    sdt_tai_xe VARCHAR(50),                                    -- Số điện thoại tài xế
    ten_nha_xe VARCHAR(255),                                   -- Tên công ty / đơn vị vận tải
    sdt_nha_xe VARCHAR(50),                                    -- Số điện thoại nhà xe
    
    -- Quản trị hệ thống & Audit Trail
    file_nguon VARCHAR(255),                                   -- Tên file nguồn upload
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 2. TẠO CÁC CHỈ MỤC (INDEXES) TỐI ƯU HÓA TRUY VẤN EXECUTIVE DASHBOARD
-- ==============================================================================

-- Chỉ mục lọc theo Depot & Thời gian hủy (Dùng nhiều nhất cho Dashboard)
CREATE INDEX idx_cancellation_depot_date ON cancellation_orders (depot, ngay_huy_don DESC);

-- Chỉ mục lọc theo Hãng tàu
CREATE INDEX idx_cancellation_hang_tau ON cancellation_orders (hang_tau);

-- Chỉ mục lọc theo Chiều vận hành IN/OUT & Kích thước TEUS
CREATE INDEX idx_cancellation_direction_teus ON cancellation_orders (loai_don_hang, size_teus);

-- Chỉ mục lọc theo Trạng thái đơn & Trạng thái kích hoạt (Phát hiện Anomaly)
CREATE INDEX idx_cancellation_status ON cancellation_orders (trang_thai_don_hang, trang_thai_kich_hoat);

-- Chỉ mục tìm kiếm nhanh theo mã Booking / Container
CREATE INDEX idx_cancellation_booking_cont ON cancellation_orders (so_booking, so_container);

-- ==============================================================================
-- 3. TRIGGER TỰ ĐỘNG CẬP NHẬT updated_at
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_cancellation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cancellation_updated_at ON cancellation_orders;
CREATE TRIGGER trg_cancellation_updated_at
    BEFORE UPDATE ON cancellation_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_cancellation_timestamp();

-- ==============================================================================
-- 4. VÍ DỤ TRUY VẤN BÁO CÁO THỐNG KÊ (COMMON ANALYTICS QUERIES)
-- ==============================================================================

/*
-- A. Tổng quan KPIs theo ngày
SELECT 
    COUNT(*) AS tong_so_don,
    SUM(size_teus) AS tong_teus,
    COUNT(*) FILTER (WHERE loai_don_hang = 'OUT') AS don_out,
    COUNT(*) FILTER (WHERE loai_don_hang = 'IN') AS don_in,
    COUNT(*) FILTER (WHERE trang_thai_don_hang = 'Đã hủy') AS da_huy,
    COUNT(*) FILTER (WHERE trang_thai_don_hang = 'Đã hoàn tiền') AS da_hoan_tien,
    COUNT(*) FILTER (WHERE trang_thai_don_hang = 'Đang hoàn tiền') AS dang_hoan_tien,
    COUNT(*) FILTER (WHERE trang_thai_kich_hoat = 'Đã kích hoạt') AS da_kich_hoat_vao_bai
FROM cancellation_orders
WHERE ngay_huy_don >= '2026-10-02 00:00:00' AND ngay_huy_don < '2026-10-03 00:00:00';

-- B. Báo cáo phân bố sản lượng hủy theo từng Depot
SELECT 
    depot,
    COUNT(*) AS so_don_huy,
    SUM(size_teus) AS tong_teus,
    COUNT(*) FILTER (WHERE loai_don_hang = 'IN') AS don_in,
    COUNT(*) FILTER (WHERE loai_don_hang = 'OUT') AS don_out,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS ty_le_phan_tram
FROM cancellation_orders
GROUP BY depot
ORDER BY so_don_huy DESC;

-- C. Top 5 lý do hủy phổ biến nhất
SELECT 
    ly_do_huy,
    COUNT(*) AS so_luong,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS ty_le_phan_tram
FROM cancellation_orders
GROUP BY ly_do_huy
ORDER BY so_luong DESC
LIMIT 5;

-- D. Cảnh báo bất thường: Đơn đã kích hoạt vào bãi nhưng vẫn phát sinh hủy
SELECT 
    stt_file, depot, hang_tau, so_booking, so_container, 
    trang_thai_don_hang, thoi_gian_kich_hoat, ngay_huy_don, ly_do_huy
FROM cancellation_orders
WHERE trang_thai_kich_hoat = 'Đã kích hoạt'
ORDER BY ngay_huy_don DESC;
*/

-- ==============================================================================
-- 5. BẢNG QUẢN LÝ TÀI KHOẢN NGƯỜI DÙNG & PHÂN QUYỀN (USERS & AUTHENTICATION)
-- ==============================================================================

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    ten VARCHAR(150) NOT NULL,                                 -- Tên người dùng (full_name)
    tai_khoan VARCHAR(100) UNIQUE NOT NULL,                    -- Tài khoản đăng nhập (username)
    mat_khau VARCHAR(255) NOT NULL,                            -- Mật khẩu (password)
    quyen VARCHAR(50) NOT NULL DEFAULT 'user',                 -- Quyền hạn ('admin' hoặc 'user')
    assigned_depots VARCHAR(255) NOT NULL DEFAULT 'ALL',       -- Danh sách Depot trực thuộc ('ALL' hoặc phân tách bởi dấu phẩy, ví dụ 'BSD,SLD')
    is_active SMALLINT NOT NULL DEFAULT 1,                     -- Trạng thái kích hoạt (1: Active, 0: Inactive)
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_tai_khoan ON users (tai_khoan);
CREATE INDEX idx_users_quyen ON users (quyen);
CREATE INDEX idx_users_is_active ON users (is_active);

-- 6. BẢNG LIÊN KẾT PHÂN QUYỀN DEPOT CHO NGƯỜI DÙNG (USER_DEPOTS)
DROP TABLE IF EXISTS user_depots CASCADE;

CREATE TABLE user_depots (
    id BIGSERIAL PRIMARY KEY,
    tai_khoan VARCHAR(100) NOT NULL REFERENCES users(tai_khoan) ON DELETE CASCADE,
    depot VARCHAR(20) NOT NULL,                                 -- Mã Depot (BSD, SLD, THT, PMCM, ETD, AIC, SCD, GKP, EPD, EAD, RCS, ALL)
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_depots_tai_khoan_depot UNIQUE (tai_khoan, depot)
);

CREATE INDEX idx_user_depots_lookup ON user_depots(tai_khoan, depot);

-- Dữ liệu khởi tạo 7 tài khoản hệ thống chuẩn kèm phân quyền Depot trực thuộc:
-- 1. ADMIN | admin | 123456789@ | admin | ALL
-- 2. Đặng Đức Tín | user01 | 123456789@ | user | BSD,SLD
-- 3. Võ Ngọc Bảo Châu | user02 | 123456789@ | user | THT,PMCM
-- 4. Lý Gia Huy | user03 | 123456789@ | user | AIC,ETD
-- 5. User 04 | user04 | 123456789@ | user | SCD,GKP
-- 6. User 05 | user05 | 123456789@ | user | EPD
-- 7. User 06 | user06 | 123456789@ | user | ALL
INSERT INTO users (ten, tai_khoan, mat_khau, quyen, assigned_depots, is_active) VALUES
('ADMIN', 'admin', '123456789@', 'admin', 'ALL', 1),
('Đặng Đức Tín', 'user01', '123456789@', 'user', 'BSD,SLD', 1),
('Võ Ngọc Bảo Châu', 'user02', '123456789@', 'user', 'THT,PMCM', 1),
('Lý Gia Huy', 'user03', '123456789@', 'user', 'AIC,ETD', 1),
('User 04', 'user04', '123456789@', 'user', 'SCD,GKP', 1),
('User 05', 'user05', '123456789@', 'user', 'EPD', 1),
('User 06', 'user06', '123456789@', 'user', 'ALL', 1)
ON CONFLICT (tai_khoan) DO UPDATE SET
    ten = EXCLUDED.ten,
    mat_khau = EXCLUDED.mat_khau,
    quyen = EXCLUDED.quyen,
    assigned_depots = EXCLUDED.assigned_depots,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

-- Khởi tạo chi tiết phân quyền trong bảng user_depots
INSERT INTO user_depots (tai_khoan, depot) VALUES
('admin', 'ALL'),
('user01', 'BSD'), ('user01', 'SLD'),
('user02', 'THT'), ('user02', 'PMCM'),
('user03', 'AIC'), ('user03', 'ETD'),
('user04', 'SCD'), ('user04', 'GKP'),
('user05', 'EPD'),
('user06', 'ALL')
ON CONFLICT (tai_khoan, depot) DO NOTHING;

-- ==============================================================================
-- 7. STORED FUNCTION LỌC ĐƠN HÀNG THEO PHÂN QUYỀN DEPOT TRỰC THUỘC
-- ==============================================================================
CREATE OR REPLACE FUNCTION sp_get_cancellation_orders_by_user(
    p_username VARCHAR(100),
    p_from_date TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    p_to_date TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    p_hang_tau VARCHAR(20) DEFAULT NULL,
    p_trang_thai VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    id BIGINT,
    stt_file VARCHAR(50),
    depot VARCHAR(20),
    hang_tau VARCHAR(20),
    ngay_huy_don TIMESTAMP WITHOUT TIME ZONE,
    ngay_duoc_duyet TIMESTAMP WITHOUT TIME ZONE,
    so_booking VARCHAR(100),
    so_container VARCHAR(100),
    loai_container VARCHAR(100),
    loai_don_hang VARCHAR(10),
    size_teus NUMERIC(4, 2),
    trang_thai_don_hang VARCHAR(50),
    trang_thai_kich_hoat VARCHAR(50),
    thoi_gian_kich_hoat TIMESTAMP WITHOUT TIME ZONE,
    ly_do_huy TEXT,
    ly_do_tu_choi TEXT,
    ten_tai_xe VARCHAR(150),
    sdt_tai_xe VARCHAR(50),
    ten_nha_xe VARCHAR(255),
    sdt_nha_xe VARCHAR(50),
    file_nguon VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_role VARCHAR(50);
    v_is_all_depots BOOLEAN := FALSE;
BEGIN
    -- 1. Xác định quyền hạn và trạng thái kích hoạt của người dùng
    SELECT quyen INTO v_user_role
    FROM users
    WHERE tai_khoan = p_username AND is_active = 1;

    -- Nếu tài khoản không hợp lệ hoặc đã bị khóa -> Không trả về dữ liệu
    IF v_user_role IS NULL THEN
        RETURN;
    END IF;

    -- Nếu là Admin hoặc có gán ALL trong phân quyền depot
    IF v_user_role = 'admin' THEN
        v_is_all_depots := TRUE;
    ELSE
        IF EXISTS (SELECT 1 FROM user_depots WHERE tai_khoan = p_username AND depot = 'ALL') THEN
            v_is_all_depots := TRUE;
        END IF;
    END IF;

    -- 2. Truy vấn dữ liệu có lọc chặt chẽ theo danh sách Depot được cấp quyền
    RETURN QUERY
    SELECT 
        c.id, c.stt_file, c.depot, c.hang_tau, c.ngay_huy_don, c.ngay_duoc_duyet,
        c.so_booking, c.so_container, c.loai_container, c.loai_don_hang, c.size_teus,
        c.trang_thai_don_hang, c.trang_thai_kich_hoat, c.thoi_gian_kich_hoat,
        c.ly_do_huy, c.ly_do_tu_choi, c.ten_tai_xe, c.sdt_tai_xe,
        c.ten_nha_xe, c.sdt_nha_xe, c.file_nguon, c.created_at, c.updated_at
    FROM cancellation_orders c
    WHERE 
        -- Điều kiện phân quyền Depot
        (v_is_all_depots = TRUE OR c.depot IN (
            SELECT ud.depot FROM user_depots ud WHERE ud.tai_khoan = p_username
        ))
        -- Các điều kiện lọc bổ sung (nếu có truyền vào)
        AND (p_from_date IS NULL OR c.ngay_huy_don >= p_from_date)
        AND (p_to_date IS NULL OR c.ngay_huy_don <= p_to_date)
        AND (p_hang_tau IS NULL OR c.hang_tau = p_hang_tau)
        AND (p_trang_thai IS NULL OR c.trang_thai_don_hang = p_trang_thai)
    ORDER BY c.ngay_huy_don DESC;
END;
$$;

