/**
 * services/supabaseClient.js
 * Quản trị kết nối và đồng bộ dữ liệu lên PostgreSQL trên Cloud Supabase
 * Đóng vai trò là Primary Cloud Database cho hệ thống (thay thế Turso bị quá tải)
 */

const path = require("path");
const fs = require("fs");

// Đọc cấu hình từ .env
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  const fallbackEnvPath = path.join(__dirname, "..", "..", "NewProject", ".env");
  const target = fs.existsSync(envPath) ? envPath : fallbackEnvPath;

  const config = {};
  if (fs.existsSync(target)) {
    const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        config[k] = v;
      }
    });
  }
  return config;
}

const env = loadEnv();

let Pool;
try {
  Pool = require("pg").Pool;
} catch (e1) {
  try {
    Pool = require(path.join(__dirname, "..", "..", "NewProject", "node_modules", "pg")).Pool;
  } catch (e2) {
    console.error("Không thể nạp thư viện pg:", e2.message);
  }
}

const DEFAULT_SUPABASE_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const DEFAULT_SUPABASE_PORT = "6543";
const DEFAULT_SUPABASE_DATABASE = "postgres";
const DEFAULT_SUPABASE_USER = "postgres.zuhvtxhyjgyasjublcam";
const DEFAULT_SUPABASE_PASSWORD = "Dangtin992004@";

let pool = null;

function getPool() {
  if (!Pool) return null;
  if (!pool) {
    const host = process.env.SUPABASE_HOST || env.SUPABASE_HOST || DEFAULT_SUPABASE_HOST;
    const port = parseInt(process.env.SUPABASE_PORT || env.SUPABASE_PORT || DEFAULT_SUPABASE_PORT, 10);
    const database = process.env.SUPABASE_DATABASE || env.SUPABASE_DATABASE || DEFAULT_SUPABASE_DATABASE;
    const user = process.env.SUPABASE_USER || env.SUPABASE_USER || DEFAULT_SUPABASE_USER;
    const password = process.env.SUPABASE_PASSWORD || env.SUPABASE_PASSWORD || DEFAULT_SUPABASE_PASSWORD;

    pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      max: 10
    });

    pool.on("connect", (client) => {
      client.on("error", (err) => {
        console.warn("[Supabase] Client warning (auto-handled):", err.message);
      });
    });

    pool.on("error", (err, client) => {
      console.warn("[Supabase] Pool warning (auto-handled):", err.message);
    });
  }
  return pool;
}

function isSupabaseAvailable() {
  const host = process.env.SUPABASE_HOST || env.SUPABASE_HOST || DEFAULT_SUPABASE_HOST;
  const user = process.env.SUPABASE_USER || env.SUPABASE_USER || DEFAULT_SUPABASE_USER;
  const password = process.env.SUPABASE_PASSWORD || env.SUPABASE_PASSWORD || DEFAULT_SUPABASE_PASSWORD;
  return Boolean(host && user && password);
}

/**
 * Kiểm tra kết nối Supabase
 */
async function testConnection() {
  const p = getPool();
  if (!p) return { success: false, message: "Thư viện pg chưa sẵn sàng" };

  try {
    const client = await p.connect();
    const res = await client.query("SELECT NOW() as current_time, current_database() as db_name, version() as version;");
    client.release();
    return {
      success: true,
      time: res.rows[0].current_time,
      database: res.rows[0].db_name,
      version: res.rows[0].version
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

let isSchemaInitialized = false;

/**
 * Tự động kiểm tra và khởi tạo toàn bộ cấu trúc bảng trên Supabase
 * Tối ưu hóa siêu tốc: Kiểm tra nhanh 1 round-trip (SELECT 1), tránh chạy lại các câu lệnh CREATE TABLE/INDEX gây statement timeout
 */
async function initSupabaseSchema() {
  if (isSchemaInitialized) return;
  const p = getPool();
  if (!p) throw new Error("Pool kết nối Supabase chưa khởi tạo");

  const client = await p.connect();
  try {
    // 1. Kiểm tra nhanh: Nếu bảng chính cancellation_orders đã tồn tại -> đánh dấu hoàn tất ngay lập tức
    try {
      await client.query("SELECT 1 FROM cancellation_orders LIMIT 1;");
      isSchemaInitialized = true;
      return;
    } catch (checkErr) {
      // Bảng chưa có -> Tiếp tục khởi tạo bên dưới
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS cancellation_orders (
        id BIGSERIAL PRIMARY KEY,
        row_key TEXT UNIQUE,
        upload_id TEXT,
        file_name TEXT,
        stt TEXT,
        depot TEXT,
        hang_tau TEXT,
        ngay_huy_don TEXT,
        ngay_duoc_duyet TEXT,
        so_booking TEXT,
        so_container TEXT,
        trang_thai_don_hang TEXT,
        trang_thai_kich_hoat TEXT,
        thoi_gian_kich_hoat TEXT,
        ly_do_huy TEXT,
        loai_container TEXT,
        loai_don_hang TEXT,
        size_teus NUMERIC(6,2) DEFAULT 0,
        ten_tai_xe TEXT,
        sdt_tai_xe TEXT,
        ten_nha_xe TEXT,
        sdt_nha_xe TEXT,
        ly_do_tu_choi TEXT,
        trang_thai_xu_ly TEXT,
        giai_trinh TEXT,
        giai_trinh_chi_tiet TEXT,
        original_trang_thai TEXT,
        is_auto_cancelled_3h INTEGER DEFAULT 0,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sup_cancellation_depot ON cancellation_orders(depot);
      CREATE INDEX IF NOT EXISTS idx_sup_cancellation_hang_tau ON cancellation_orders(hang_tau);
      CREATE INDEX IF NOT EXISTS idx_sup_cancellation_date ON cancellation_orders(ngay_duoc_duyet, ngay_huy_don);
      CREATE INDEX IF NOT EXISTS idx_sup_cancellation_booking_cont ON cancellation_orders(so_booking, so_container);

      CREATE TABLE IF NOT EXISTS eir_cancellation_orders (
        id BIGSERIAL PRIMARY KEY,
        row_key TEXT UNIQUE,
        upload_id TEXT,
        file_name TEXT,
        stt_file TEXT,
        depot TEXT,
        hang_tau TEXT,
        ngay_huy_don TEXT,
        ngay_duoc_duyet TEXT,
        so_booking TEXT,
        so_container TEXT,
        loai_container TEXT,
        loai_don_hang TEXT,
        size_teus NUMERIC(6,2) DEFAULT 0,
        trang_thai_don_hang TEXT,
        trang_thai_kich_hoat TEXT,
        thoi_gian_kich_hoat TEXT,
        ly_do_huy TEXT,
        ly_do_tu_choi TEXT,
        ly_do_huy_check TEXT,
        ten_tai_xe TEXT,
        sdt_tai_xe TEXT,
        ten_nha_xe TEXT,
        sdt_nha_xe TEXT,
        file_nguon TEXT,
        nguoi_tao TEXT,
        so_xe TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sup_eir_depot ON eir_cancellation_orders(depot);
      CREATE INDEX IF NOT EXISTS idx_sup_eir_date ON eir_cancellation_orders(ngay_duoc_duyet, ngay_huy_don);
      CREATE INDEX IF NOT EXISTS idx_sup_eir_booking_cont ON eir_cancellation_orders(so_booking, so_container);

      CREATE TABLE IF NOT EXISTS upload_history (
        id VARCHAR(100) PRIMARY KEY,
        file_name TEXT,
        file_size TEXT,
        uploaded_at TEXT,
        record_count INTEGER DEFAULT 0,
        teus_count NUMERIC(8,2) DEFAULT 0,
        match_percent NUMERIC(5,2) DEFAULT 100,
        is_valid INTEGER DEFAULT 1,
        validation_json TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS verification_upload_history (
        id VARCHAR(100) PRIMARY KEY,
        file_name TEXT,
        file_size TEXT,
        uploaded_at TEXT,
        record_count INTEGER DEFAULT 0,
        inserted_count INTEGER DEFAULT 0,
        updated_count INTEGER DEFAULT 0,
        total_accumulated INTEGER DEFAULT 0,
        uploaded_by TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_operational_state (
        row_key TEXT PRIMARY KEY,
        cskh_status TEXT DEFAULT '',
        explanation TEXT DEFAULT '',
        explanation_detail TEXT,
        is_pending INTEGER DEFAULT 0,
        pending_at TEXT,
        updated_by TEXT,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_metadata (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    isSchemaInitialized = true;
  } finally {
    client.release();
  }
}

function mapSupabaseOrderRow(r) {
  return {
    rowKey: r.row_key,
    uploadId: r.upload_id,
    fileName: r.file_name,
    stt: r.stt,
    depot: r.depot,
    hangTau: r.hang_tau,
    ngayHuyDon: r.ngay_huy_don,
    ngayDuocDuyet: r.ngay_duoc_duyet,
    soBooking: r.so_booking,
    soContainer: r.so_container,
    trangThaiDonHang: r.trang_thai_don_hang,
    trangThaiKichHoat: r.trang_thai_kich_hoat,
    thoiGianKichHoat: r.thoi_gian_kich_hoat,
    lyDoHuy: r.ly_do_huy,
    loaiContainer: r.loai_container,
    loaiDonHang: r.loai_don_hang,
    sizeTeus: Number(r.size_teus) || 0,
    tenTaiXe: r.ten_tai_xe,
    sdtTaiXe: r.sdt_tai_xe,
    tenNhaXe: r.ten_nha_xe,
    sdtNhaXe: r.sdt_nha_xe,
    lyDoTuChoi: r.ly_do_tu_choi,
    trangThaiXuLy: r.trang_thai_xu_ly,
    giaiTrinh: r.giai_trinh,
    giaiTrinhChiTiet: (r.giai_trinh_chi_tiet !== undefined && r.giai_trinh_chi_tiet !== null && r.giai_trinh_chi_tiet !== "") ? r.giai_trinh_chi_tiet : null,
    originalTrangThaiDonHang: r.original_trang_thai,
    isAutoCancelledBy3h: Number(r.is_auto_cancelled_3h) === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function mapSupabaseVerificationRow(r) {
  return {
    rowKey: r.row_key,
    uploadId: r.upload_id,
    fileName: r.file_name,
    sttFile: r.stt_file,
    depot: r.depot,
    hangTau: r.hang_tau,
    ngayHuyDon: r.ngay_huy_don,
    ngayDuocDuyet: r.ngay_duoc_duyet,
    soBooking: r.so_booking,
    soContainer: r.so_container,
    loaiContainer: r.loai_container,
    loaiDonHang: r.loai_don_hang,
    sizeTeus: Number(r.size_teus) || 0,
    trangThaiDonHang: r.trang_thai_don_hang,
    trangThaiKichHoat: r.trang_thai_kich_hoat,
    thoiGianKichHoat: r.thoi_gian_kich_hoat,
    lyDoHuy: r.ly_do_huy,
    lyDoTuChoi: r.ly_do_tu_choi,
    lyDoHuyCheck: r.ly_do_huy_check,
    tenTaiXe: r.ten_tai_xe,
    sdtTaiXe: r.sdt_tai_xe,
    tenNhaXe: r.ten_nha_xe,
    sdtNhaXe: r.sdt_nha_xe,
    fileNguon: r.file_nguon,
    nguoiTao: r.nguoi_tao,
    soXe: r.so_xe,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

/**
 * Lấy toàn bộ đơn hủy từ Supabase
 */
async function getAllOrdersFromSupabase() {
  const p = getPool();
  if (!p) return null;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const res = await client.query("SELECT * FROM cancellation_orders ORDER BY id ASC;");
      return res.rows.map(mapSupabaseOrderRow);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[Supabase] Lỗi getAllOrdersFromSupabase:", err.message);
    return null;
  }
}

/**
 * Lấy đơn theo khoảng ngày từ Supabase
 */
async function getOrdersByDateRangeFromSupabase(arg1, arg2, arg3) {
  const p = getPool();
  if (!p) return null;

  try {
    await initSupabaseSchema();
    let dateCol = "ngay_huy_don";
    let start = "";
    let end = "";

    if (arg3 !== undefined) {
      dateCol = arg1 === "ngayDuyet" ? "ngay_duoc_duyet" : (arg1 === "ngayHuy" ? "ngay_huy_don" : String(arg1 || "ngay_huy_don"));
      start = String(arg2 || "");
      end = String(arg3 || "");
    } else {
      start = String(arg1 || "");
      end = String(arg2 || "");
    }

    if (!start && !end) {
      return await getAllOrdersFromSupabase();
    }

    const client = await p.connect();
    try {
      let sql = `SELECT * FROM cancellation_orders WHERE `;
      const params = [];
      if (start && end) {
        sql += `${dateCol} >= $1 AND ${dateCol} <= $2 `;
        params.push(start, end);
      } else if (start) {
        sql += `${dateCol} >= $1 `;
        params.push(start);
      } else {
        sql += `${dateCol} <= $1 `;
        params.push(end);
      }
      sql += `ORDER BY ${dateCol} DESC;`;

      const res = await client.query(sql, params);
      return res.rows.map(mapSupabaseOrderRow);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[Supabase] Lỗi getOrdersByDateRangeFromSupabase:", err.message);
    return null;
  }
}

/**
 * Lấy ngày mới nhất từ Supabase
 */
async function getLatestDateFromSupabase(dateColumn = "ngay_duoc_duyet") {
  const p = getPool();
  if (!p) return null;
  try {
    await initSupabaseSchema();
    const col = dateColumn === "ngayDuyet" ? "ngay_duoc_duyet" : dateColumn;
    const client = await p.connect();
    try {
      const res = await client.query(`
        SELECT ${col} as d FROM cancellation_orders
        WHERE ${col} IS NOT NULL AND ${col} != ''
        ORDER BY ${col} DESC LIMIT 1;
      `);
      return res.rows && res.rows[0] ? res.rows[0].d : null;
    } finally {
      client.release();
    }
  } catch (e) {
    return null;
  }
}

/**
 * Đồng bộ danh sách đơn hủy mới/cập nhật lên Supabase (Batch Transaction)
 */
async function syncOrdersToSupabase(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return { synced: 0, total: 0 };
  const p = getPool();
  if (!p) throw new Error("Pool kết nối Supabase chưa khởi tạo");

  await initSupabaseSchema();
  const client = await p.connect();
  let synced = 0;

  try {
    await client.query("BEGIN;");

    for (const o of orders) {
      const rowKey = o.rowKey || `${o.depot || "DEPOT"}#${o.stt || o.sttFile || "NO_STT"}#${o.soBooking || "NO_BOOKING"}#${o.ngayHuyDon || ""}`;
      const sql = `
        INSERT INTO cancellation_orders (
          row_key, upload_id, file_name, stt, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
          so_booking, so_container, trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat,
          ly_do_huy, loai_container, loai_don_hang, size_teus, ten_tai_xe, sdt_tai_xe,
          ten_nha_xe, sdt_nha_xe, ly_do_tu_choi, trang_thai_xu_ly, giai_trinh, giai_trinh_chi_tiet,
          original_trang_thai, is_auto_cancelled_3h
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        )
        ON CONFLICT (row_key) DO UPDATE SET
          trang_thai_don_hang = EXCLUDED.trang_thai_don_hang,
          ngay_duoc_duyet = EXCLUDED.ngay_duoc_duyet,
          trang_thai_xu_ly = COALESCE(NULLIF(EXCLUDED.trang_thai_xu_ly, ''), cancellation_orders.trang_thai_xu_ly),
          giai_trinh = COALESCE(NULLIF(EXCLUDED.giai_trinh, ''), cancellation_orders.giai_trinh),
          giai_trinh_chi_tiet = COALESCE(NULLIF(EXCLUDED.giai_trinh_chi_tiet, ''), cancellation_orders.giai_trinh_chi_tiet),
          updated_at = CURRENT_TIMESTAMP;
      `;

      const vals = [
        rowKey, o.uploadId || "UP-SYNC", o.fileName || "", o.stt || o.sttFile || "",
        o.depot || "", o.hangTau || "", o.ngayHuyDon || "", o.ngayDuocDuyet || "",
        o.soBooking || "", o.soContainer || "", o.trangThaiDonHang || "", o.trangThaiKichHoat || "",
        o.thoiGianKichHoat || "", o.lyDoHuy || "", o.loaiContainer || "", o.loaiDonHang || "",
        Number(o.sizeTeus) || 0, o.tenTaiXe || "", o.sdtTaiXe || "", o.tenNhaXe || "",
        o.sdtNhaXe || "", o.lyDoTuChoi || "", o.trangThaiXuLy || "", o.giaiTrinh || "",
        o.giaiTrinhChiTiet || null, o.originalTrangThaiDonHang || o.originalTrangThai || "",
        o.isAutoCancelledBy3h || o.is_auto_cancelled_3h ? 1 : 0
      ];

      await client.query(sql, vals);
      synced++;
    }

    await client.query("COMMIT;");
    return { synced, total: orders.length };
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("[Supabase] Lỗi khi syncOrdersToSupabase:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Xóa danh sách đơn theo danh sách rowKey
 */
async function deleteOrderRowsInSupabase(rowKeys) {
  if (!Array.isArray(rowKeys) || rowKeys.length === 0) return;
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM cancellation_orders WHERE row_key = ANY($1);", [rowKeys]);
  } finally {
    client.release();
  }
}

/**
 * Xóa đơn theo uploadId
 */
async function deleteOrdersByUploadIdInSupabase(uploadId) {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM cancellation_orders WHERE upload_id = $1;", [uploadId]);
  } finally {
    client.release();
  }
}

/**
 * Xóa sạch toàn bộ đơn
 */
async function clearAllOrdersInSupabase() {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM cancellation_orders;");
  } finally {
    client.release();
  }
}

/**
 * Lấy toàn bộ đơn EIR từ Supabase
 */
async function getAllVerificationOrdersFromSupabase() {
  const p = getPool();
  if (!p) return null;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const res = await client.query("SELECT * FROM eir_cancellation_orders ORDER BY id ASC;");
      return res.rows.map(mapSupabaseVerificationRow);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[Supabase] Lỗi getAllVerificationOrdersFromSupabase:", err.message);
    return null;
  }
}

/**
 * Đồng bộ danh sách đơn EIR lên Supabase
 */
async function syncVerificationOrdersToSupabase(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return { synced: 0, total: 0 };
  const p = getPool();
  if (!p) throw new Error("Pool kết nối Supabase chưa khởi tạo");

  await initSupabaseSchema();
  const client = await p.connect();
  let synced = 0;

  try {
    await client.query("BEGIN;");

    for (const o of orders) {
      const rowKey = o.rowKey || `${o.depot || "DEPOT"}#${o.sttFile || o.stt || "NO_STT"}#${o.soBooking || "NO_BOOKING"}#${o.ngayHuyDon || ""}`;
      const sql = `
        INSERT INTO eir_cancellation_orders (
          row_key, upload_id, file_name, stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
          so_booking, so_container, loai_container, loai_don_hang, size_teus, trang_thai_don_hang,
          trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
          ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon, nguoi_tao, so_xe
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        )
        ON CONFLICT (row_key) DO UPDATE SET
          hang_tau = EXCLUDED.hang_tau,
          so_booking = EXCLUDED.so_booking,
          so_container = EXCLUDED.so_container,
          loai_container = EXCLUDED.loai_container,
          loai_don_hang = EXCLUDED.loai_don_hang,
          size_teus = EXCLUDED.size_teus,
          depot = EXCLUDED.depot,
          so_xe = EXCLUDED.so_xe,
          nguoi_tao = EXCLUDED.nguoi_tao,
          ten_tai_xe = EXCLUDED.ten_tai_xe,
          sdt_tai_xe = EXCLUDED.sdt_tai_xe,
          ten_nha_xe = EXCLUDED.ten_nha_xe,
          ly_do_huy = EXCLUDED.ly_do_huy,
          ly_do_tu_choi = EXCLUDED.ly_do_tu_choi,
          ly_do_huy_check = EXCLUDED.ly_do_huy_check,
          trang_thai_don_hang = EXCLUDED.trang_thai_don_hang,
          ngay_duoc_duyet = EXCLUDED.ngay_duoc_duyet,
          updated_at = CURRENT_TIMESTAMP;
      `;

      const vals = [
        rowKey, o.uploadId || "VER-SYNC", o.fileName || "", o.sttFile || o.stt || "",
        o.depot || "", o.hangTau || "", o.ngayHuyDon || "", o.ngayDuocDuyet || "",
        o.soBooking || "", o.soContainer || "", o.loaiContainer || "", o.loaiDonHang || "",
        Number(o.sizeTeus) || 0, o.trangThaiDonHang || "", o.trangThaiKichHoat || "",
        o.thoiGianKichHoat || "", o.lyDoHuy || "", o.lyDoTuChoi || "", o.lyDoHuyCheck || "",
        o.tenTaiXe || "", o.sdtTaiXe || "", o.tenNhaXe || "", o.sdtNhaXe || "",
        o.fileNguon || "", o.nguoiTao || "", o.soXe || ""
      ];

      await client.query(sql, vals);
      synced++;
    }

    await client.query("COMMIT;");
    return { synced, total: orders.length };
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("[Supabase] Lỗi khi syncVerificationOrdersToSupabase:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function deleteVerificationOrdersByUploadIdInSupabase(uploadId) {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM eir_cancellation_orders WHERE upload_id = $1;", [uploadId]);
  } finally {
    client.release();
  }
}

async function deleteVerificationOrderRowInSupabase(rowKey) {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM eir_cancellation_orders WHERE row_key = $1;", [rowKey]);
  } finally {
    client.release();
  }
}

async function deleteVerificationOrderRowsInSupabase(rowKeys) {
  if (!Array.isArray(rowKeys) || rowKeys.length === 0) return;
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM eir_cancellation_orders WHERE row_key = ANY($1);", [rowKeys]);
  } finally {
    client.release();
  }
}

async function clearAllVerificationOrdersInSupabase() {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM eir_cancellation_orders;");
  } finally {
    client.release();
  }
}

/**
 * Lịch sử Upload đơn hủy
 */
async function getUploadHistoryFromSupabase() {
  const p = getPool();
  if (!p) return null;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const res = await client.query("SELECT id, file_name, file_size, uploaded_at, record_count, teus_count, match_percent, is_valid, validation_json FROM upload_history ORDER BY created_at DESC, id DESC;");
      return res.rows.map(r => ({
        id: r.id,
        fileName: r.file_name,
        fileSize: r.file_size,
        uploadedAt: r.uploaded_at,
        recordCount: Number(r.record_count) || 0,
        teusCount: Number(r.teus_count) || 0,
        matchPercent: Number(r.match_percent) || 100,
        isValid: r.is_valid === 1,
        validation: r.validation_json ? JSON.parse(r.validation_json) : null,
        data: null
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi getUploadHistoryFromSupabase:", e.message);
    return null;
  }
}

async function saveUploadHistoryItemToSupabase(item) {
  const p = getPool();
  if (!p) return;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      await client.query(`
        INSERT INTO upload_history (
          id, file_name, file_size, uploaded_at, record_count, teus_count, match_percent, is_valid, validation_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO UPDATE SET
          file_name = EXCLUDED.file_name,
          file_size = EXCLUDED.file_size,
          uploaded_at = EXCLUDED.uploaded_at,
          record_count = EXCLUDED.record_count,
          teus_count = EXCLUDED.teus_count,
          match_percent = EXCLUDED.match_percent,
          is_valid = EXCLUDED.is_valid,
          validation_json = EXCLUDED.validation_json;
      `, [
        item.id, item.fileName || "", item.fileSize || "", item.uploadedAt || "",
        Number(item.recordCount) || 0, Number(item.teusCount) || 0,
        Number(item.matchPercent) || 100, item.isValid ? 1 : 0,
        item.validation ? JSON.stringify(item.validation) : ""
      ]);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi saveUploadHistoryItemToSupabase:", e.message);
  }
}

async function deleteUploadHistoryItemFromSupabase(id) {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM upload_history WHERE id = $1;", [id]);
  } finally {
    client.release();
  }
}

async function clearUploadHistoryInSupabase() {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM upload_history;");
  } finally {
    client.release();
  }
}

/**
 * Lịch sử kiểm tra
 */
async function getVerificationHistoryFromSupabase() {
  const p = getPool();
  if (!p) return null;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const res = await client.query("SELECT * FROM verification_upload_history ORDER BY created_at DESC, id DESC;");
      return res.rows.map(r => ({
        id: r.id,
        fileName: r.file_name,
        fileSize: r.file_size,
        uploadedAt: r.uploaded_at,
        recordCount: Number(r.record_count) || 0,
        insertedCount: Number(r.inserted_count) || 0,
        updatedCount: Number(r.updated_count) || 0,
        totalAccumulated: Number(r.total_accumulated) || 0,
        uploadedBy: r.uploaded_by || "Admin"
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi getVerificationHistoryFromSupabase:", e.message);
    return null;
  }
}

async function saveVerificationHistoryItemToSupabase(item) {
  const p = getPool();
  if (!p) return;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      await client.query(`
        INSERT INTO verification_upload_history (
          id, file_name, file_size, uploaded_at, record_count, inserted_count, updated_count, total_accumulated, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO UPDATE SET
          file_name = EXCLUDED.file_name,
          record_count = EXCLUDED.record_count,
          inserted_count = EXCLUDED.inserted_count,
          updated_count = EXCLUDED.updated_count,
          total_accumulated = EXCLUDED.total_accumulated;
      `, [
        item.id, item.fileName || "", item.fileSize || "", item.uploadedAt || "",
        Number(item.recordCount) || 0, Number(item.insertedCount) || 0,
        Number(item.updatedCount) || 0, Number(item.totalAccumulated) || 0,
        item.uploadedBy || ""
      ]);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi saveVerificationHistoryItemToSupabase:", e.message);
  }
}

async function deleteVerificationHistoryItemFromSupabase(id) {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query("DELETE FROM verification_upload_history WHERE id = $1;", [id]);
  } finally {
    client.release();
  }
}

/**
 * Quản trị trạng thái vận hành, ghi chú & Pending
 */
async function updateOrderNoteInSupabase(rowKey, noteData = {}) {
  const p = getPool();
  if (!p) return;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const status = noteData.trangThaiXuLy !== undefined ? noteData.trangThaiXuLy : (noteData.currentStatus || "");
      const exp = noteData.giaiTrinh !== undefined ? noteData.giaiTrinh : (noteData.currentExp || "");
      const expDetail = (noteData.giaiTrinhChiTiet !== undefined && noteData.giaiTrinhChiTiet !== null && noteData.giaiTrinhChiTiet !== "")
        ? noteData.giaiTrinhChiTiet
        : (noteData.currentExpDetail || null);
      const isPending = noteData.isPending ? 1 : 0;
      const pendingAt = noteData.pendingAt || (isPending ? new Date().toISOString() : null);

      await client.query(`
        INSERT INTO order_operational_state (
          row_key, cskh_status, explanation, explanation_detail, is_pending, pending_at, updated_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT(row_key) DO UPDATE SET
          cskh_status = EXCLUDED.cskh_status,
          explanation = EXCLUDED.explanation,
          explanation_detail = EXCLUDED.explanation_detail,
          is_pending = EXCLUDED.is_pending,
          pending_at = EXCLUDED.pending_at,
          updated_at = CURRENT_TIMESTAMP;
      `, [rowKey, status, exp, expDetail, isPending, pendingAt, noteData.updatedBy || ""]);

      await client.query(`
        UPDATE cancellation_orders
        SET trang_thai_xu_ly = $1, giai_trinh = $2, giai_trinh_chi_tiet = $3, updated_at = CURRENT_TIMESTAMP
        WHERE row_key = $4;
      `, [status, exp, expDetail, rowKey]);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi updateOrderNoteInSupabase:", e.message);
  }
}

async function syncPendingStateToSupabase(rowKey, isPending) {
  const p = getPool();
  if (!p) return;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const pVal = isPending ? 1 : 0;
      const pAt = isPending ? new Date().toISOString() : null;
      await client.query(`
        INSERT INTO order_operational_state (row_key, is_pending, pending_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT(row_key) DO UPDATE SET
          is_pending = EXCLUDED.is_pending,
          pending_at = EXCLUDED.pending_at,
          updated_at = CURRENT_TIMESTAMP;
      `, [rowKey, pVal, pAt]);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi syncPendingStateToSupabase:", e.message);
  }
}

async function getAllOperationalStatesFromSupabase() {
  const p = getPool();
  if (!p) return {};
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const res = await client.query("SELECT row_key, is_pending, cskh_status, explanation, explanation_detail, updated_at FROM order_operational_state;");
      const map = {};
      if (res.rows) {
        res.rows.forEach(r => {
          if (r.row_key) {
            map[r.row_key] = {
              trangThaiXuLy: r.cskh_status || "",
              giaiTrinh: r.explanation || "",
              giaiTrinhChiTiet: r.explanation_detail || null,
              isPending: Number(r.is_pending) === 1,
              updatedAt: r.updated_at || ""
            };
          }
        });
      }
      return map;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi getAllOperationalStatesFromSupabase:", e.message);
    return {};
  }
}

async function getOperationalUpdatesFromSupabase(since) {
  const p = getPool();
  if (!p) return null;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      let sql = "SELECT row_key, is_pending, cskh_status, explanation, explanation_detail, updated_at FROM order_operational_state";
      const params = [];
      if (since && typeof since === "string" && since.trim()) {
        sql += " WHERE updated_at > $1";
        params.push(since.trim());
      }
      const res = await client.query(sql, params);
      const updates = {};
      if (res.rows) {
        res.rows.forEach(r => {
          if (r.row_key) {
            updates[r.row_key] = {
              trangThaiXuLy: r.cskh_status || "",
              giaiTrinh: r.explanation || "",
              giaiTrinhChiTiet: r.explanation_detail || null,
              isPending: Number(r.is_pending) === 1,
              updatedAt: r.updated_at || ""
            };
          }
        });
      }
      return updates;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Supabase] Lỗi getOperationalUpdatesFromSupabase:", e.message);
    return null;
  }
}

async function getSupabaseRowCount() {
  const p = getPool();
  if (!p) return 0;
  try {
    const client = await p.connect();
    try {
      const res = await client.query("SELECT COUNT(*) as cnt FROM cancellation_orders;");
      return parseInt(res.rows[0].cnt, 10);
    } finally {
      client.release();
    }
  } catch (e) {
    return 0;
  }
}

async function bumpOperationalVersionInSupabase() {
  const p = getPool();
  if (!p) return;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const now = String(Date.now());
      await client.query(`
        INSERT INTO system_metadata (key, value, updated_at)
        VALUES ('operational_version', $1, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP;
      `, [now]);
    } finally {
      client.release();
    }
  } catch (e) {}
}

async function getOperationalVersionFromSupabase() {
  const p = getPool();
  if (!p) return null;
  try {
    await initSupabaseSchema();
    const client = await p.connect();
    try {
      const res = await client.query("SELECT value FROM system_metadata WHERE key = 'operational_version';");
      return res.rows && res.rows[0] ? res.rows[0].value : null;
    } finally {
      client.release();
    }
  } catch (e) {
    return null;
  }
}

module.exports = {
  isSupabaseAvailable,
  testConnection,
  initSupabaseSchema,
  getAllOrdersFromSupabase,
  getOrdersByDateRangeFromSupabase,
  getLatestDateFromSupabase,
  syncOrdersToSupabase,
  deleteOrderRowsInSupabase,
  deleteOrdersByUploadIdInSupabase,
  clearAllOrdersInSupabase,
  getAllVerificationOrdersFromSupabase,
  syncVerificationOrdersToSupabase,
  deleteVerificationOrderRowInSupabase,
  deleteVerificationOrderRowsInSupabase,
  deleteVerificationOrdersByUploadIdInSupabase,
  clearAllVerificationOrdersInSupabase,
  getUploadHistoryFromSupabase,
  saveUploadHistoryItemToSupabase,
  deleteUploadHistoryItemFromSupabase,
  clearUploadHistoryInSupabase,
  getVerificationHistoryFromSupabase,
  saveVerificationHistoryItemToSupabase,
  deleteVerificationHistoryItemFromSupabase,
  getSupabaseRowCount,
  updateOrderNoteInSupabase,
  syncPendingStateToSupabase,
  getAllOperationalStatesFromSupabase,
  getOperationalUpdatesFromSupabase,
  bumpOperationalVersionInSupabase,
  getOperationalVersionFromSupabase
};
