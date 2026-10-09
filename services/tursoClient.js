/**
 * services/tursoClient.js
 * Quản trị kết nối và đồng bộ dữ liệu lên Turso Cloud SQLite (libSQL)
 * Nguồn dữ liệu vĩnh viễn (Source of Truth) cho môi trường Vercel Serverless
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

// Đọc cấu hình từ .env nếu có
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  const config = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        config[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
      }
    });
  }
  return config;
}

const env = loadEnv();

// Cấu hình dự phòng chuẩn xác bảo đảm hoạt động ngay lập tức trên Vercel Serverless
const DEFAULT_TURSO_URL = "libsql://hotline-analytics-dangtin99.aws-ap-southeast-2.turso.io";
const DEFAULT_TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE0MzI1ODQsImlkIjoiMDFhMTE5YjMtNTYwMS03ZTI1LTg1MTktNGQ2YmVjMDlhNzQ4Iiwia2lkIjoiZlZKSGN6YVRLMHZEWFhIc1czc1M2X2F5SlZHM1p6eTIxcEd2Si1rY0lYVSIsInJpZCI6IjUxMjVmZDA4LWJmY2MtNGZkMS1iOWViLTQ0YjYwN2Q3ZTA1OCJ9.c8ONqNk3rxLEvnnZKCSV2gxVWnrkWnaORRNhetk4iA9aw2nAdNv7wGcwJiZQM1dqBBpsdHyV9U9-nXesAnybBA";

const TURSO_URL = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || DEFAULT_TURSO_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || DEFAULT_TURSO_AUTH_TOKEN;

let tursoClient = null;

function getTursoClient() {
  if (!tursoClient && TURSO_URL && TURSO_AUTH_TOKEN) {
    tursoClient = createClient({
      url: TURSO_URL,
      authToken: TURSO_AUTH_TOKEN
    });
  }
  return tursoClient;
}

function isTursoAvailable() {
  return Boolean(TURSO_URL && TURSO_AUTH_TOKEN);
}

/**
 * Kiểm tra kết nối Turso
 */
async function testConnection() {
  const client = getTursoClient();
  if (!client) return { success: false, message: "Chưa cấu hình TURSO_DATABASE_URL hoặc TURSO_AUTH_TOKEN" };

  try {
    const res = await client.execute("SELECT datetime('now') as current_time, sqlite_version() as version;");
    return {
      success: true,
      time: res.rows[0].current_time,
      version: res.rows[0].version
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

let isSchemaInitialized = false;

/**
 * Khởi tạo cấu trúc bảng trên Turso Cloud
 */
async function initTursoSchema() {
  if (isSchemaInitialized) return;
  const client = getTursoClient();
  if (!client) throw new Error("Chưa khởi tạo client Turso");

  // 1. Bảng cancellation_orders
  await client.execute(`
    CREATE TABLE IF NOT EXISTS cancellation_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      size_teus REAL DEFAULT 0,
      ten_tai_xe TEXT,
      sdt_tai_xe TEXT,
      ten_nha_xe TEXT,
      sdt_nha_xe TEXT,
      ly_do_tu_choi TEXT,
      trang_thai_xu_ly TEXT,
      giai_trinh TEXT,
      original_trang_thai TEXT,
      is_auto_cancelled_3h INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 2. Bảng eir_cancellation_orders (kiểm tra đơn)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS eir_cancellation_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      size_teus REAL DEFAULT 0,
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 3. Bảng upload_history (lịch sử đăng tải đơn hủy)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS upload_history (
      id TEXT PRIMARY KEY,
      file_name TEXT,
      file_size TEXT,
      uploaded_at TEXT,
      record_count INTEGER DEFAULT 0,
      teus_count REAL DEFAULT 0,
      match_percent REAL DEFAULT 100,
      is_valid INTEGER DEFAULT 1,
      validation_json TEXT,
      data_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 4. Bảng verification_upload_history (lịch sử đăng tải kiểm tra đơn)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS verification_upload_history (
      id TEXT PRIMARY KEY,
      file_name TEXT,
      file_size TEXT,
      uploaded_at TEXT,
      record_count INTEGER DEFAULT 0,
      inserted_count INTEGER DEFAULT 0,
      updated_count INTEGER DEFAULT 0,
      total_accumulated INTEGER DEFAULT 0,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 5. Bảng order_operational_state: Tách riêng trạng thái CSKH, Giải trình, và Cờ Pending
  await client.execute(`
    CREATE TABLE IF NOT EXISTS order_operational_state (
      row_key TEXT PRIMARY KEY,
      cskh_status TEXT DEFAULT '',
      explanation TEXT DEFAULT '',
      is_pending INTEGER DEFAULT 0,
      pending_at TEXT,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 6. Bảng order_status_audit_log: Lịch sử thay đổi trạng thái CSKH / Giải trình / Pending
  await client.execute(`
    CREATE TABLE IF NOT EXISTS order_status_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_key TEXT,
      action TEXT,
      old_status TEXT,
      new_status TEXT,
      old_explanation TEXT,
      new_explanation TEXT,
      changed_by TEXT,
      changed_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 7. Các bảng Danh mục (Master Dimension Tables)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS dim_depots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT,
      is_active INTEGER DEFAULT 1
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS dim_shipping_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT,
      is_active INTEGER DEFAULT 1
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS dim_container_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      size_teus REAL DEFAULT 1.0,
      is_active INTEGER DEFAULT 1
    );
  `);

  // Indexes Tối Ưu Hóa Truy Vấn
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_depot ON cancellation_orders(depot);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_line ON cancellation_orders(hang_tau);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_status ON cancellation_orders(trang_thai_don_hang);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_depot_date ON cancellation_orders(depot, ngay_huy_don DESC);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_book_cont ON cancellation_orders(so_booking, so_container);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_eir_depot ON eir_cancellation_orders(depot);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_eir_booking_cont ON eir_cancellation_orders(so_booking, so_container);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_op_pending ON order_operational_state(is_pending);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_audit_key ON order_status_audit_log(row_key);`);

  isSchemaInitialized = true;
}

/**
 * Lấy toàn bộ đơn hủy từ Turso Cloud SQLite
 */
async function getAllOrdersFromTurso() {
  const client = getTursoClient();
  if (!client) return null;

  try {
    await initTursoSchema();
    const res = await client.execute("SELECT * FROM cancellation_orders ORDER BY id ASC;");
    return res.rows.map(r => ({
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
      originalTrangThaiDonHang: r.original_trang_thai,
      isAutoCancelledBy3h: r.is_auto_cancelled_3h === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  } catch (err) {
    console.error("[Turso] Lỗi khi lấy cancellation_orders:", err.message);
    return null;
  }
}

/**
 * Đồng bộ / lưu đơn hủy lên Turso Cloud SQLite
 */
async function syncOrdersToTurso(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return { synced: 0, total: 0 };
  const client = getTursoClient();
  if (!client) throw new Error("Chưa khởi tạo client Turso");

  await initTursoSchema();

  const batchSize = 50;
  let synced = 0;

  for (let i = 0; i < orders.length; i += batchSize) {
    const chunk = orders.slice(i, i + batchSize);
    const statements = chunk.map(o => ({
      sql: `
        INSERT INTO cancellation_orders (
          row_key, upload_id, file_name, stt, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
          so_booking, so_container, trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat,
          ly_do_huy, loai_container, loai_don_hang, size_teus, ten_tai_xe, sdt_tai_xe,
          ten_nha_xe, sdt_nha_xe, ly_do_tu_choi, trang_thai_xu_ly, giai_trinh,
          original_trang_thai, is_auto_cancelled_3h, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(row_key) DO UPDATE SET
          trang_thai_don_hang = excluded.trang_thai_don_hang,
          ngay_duoc_duyet = excluded.ngay_duoc_duyet,
          trang_thai_xu_ly = COALESCE(NULLIF(excluded.trang_thai_xu_ly, ''), cancellation_orders.trang_thai_xu_ly),
          giai_trinh = COALESCE(NULLIF(excluded.giai_trinh, ''), cancellation_orders.giai_trinh),
          is_auto_cancelled_3h = excluded.is_auto_cancelled_3h,
          updated_at = datetime('now');
      `,
      args: [
        o.rowKey, o.uploadId || "UP-MIGRATE", o.fileName || "", o.stt || "", o.depot || "",
        o.hangTau || "", o.ngayHuyDon || "", o.ngayDuocDuyet || "", o.soBooking || "",
        o.soContainer || "", o.trangThaiDonHang || "", o.trangThaiKichHoat || "",
        o.thoiGianKichHoat || "", o.lyDoHuy || "", o.loaiContainer || "", o.loaiDonHang || "",
        Number(o.sizeTeus) || 0, o.tenTaiXe || "", o.sdtTaiXe || "", o.tenNhaXe || "",
        o.sdtNhaXe || "", o.lyDoTuChoi || "", o.trangThaiXuLy || "", o.giaiTrinh || "",
        o.originalTrangThaiDonHang || "", o.isAutoCancelledBy3h ? 1 : 0
      ]
    }));

    await client.batch(statements, "write");
    synced += chunk.length;
  }

  return { synced, total: orders.length };
}

/**
 * Cập nhật ghi chú CSKH hoặc giải trình trong Turso
 */
async function updateOrderNoteInTurso(rowKey, noteData = {}) {
  const client = getTursoClient();
  if (!client) return false;
  try {
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
    // 1. Cập nhật vào cancellation_orders (tương thích ngược)
    await client.execute({
      sql: `UPDATE cancellation_orders 
            SET trang_thai_xu_ly = COALESCE(?, trang_thai_xu_ly),
                giai_trinh = COALESCE(?, giai_trinh),
                updated_at = ?
            WHERE row_key = ?`,
      args: [
        noteData.status !== undefined ? noteData.status : null,
        noteData.giaiTrinh !== undefined ? noteData.giaiTrinh : null,
        nowStr,
        rowKey
      ]
    });

    // 2. Cập nhật vào bảng chuẩn hóa order_operational_state
    await client.execute({
      sql: `INSERT INTO order_operational_state (row_key, cskh_status, explanation, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(row_key) DO UPDATE SET
              cskh_status = COALESCE(NULLIF(excluded.cskh_status, ''), order_operational_state.cskh_status),
              explanation = COALESCE(NULLIF(excluded.explanation, ''), order_operational_state.explanation),
              updated_at = excluded.updated_at;`,
      args: [
        rowKey,
        noteData.status !== undefined ? noteData.status : "",
        noteData.giaiTrinh !== undefined ? noteData.giaiTrinh : "",
        nowStr
      ]
    });

    // 3. Ghi nhật ký kiểm toán vào order_status_audit_log
    await client.execute({
      sql: `INSERT INTO order_status_audit_log (row_key, action, new_status, new_explanation, changed_by, changed_at)
            VALUES (?, 'UPDATE_NOTE', ?, ?, ?, ?)`,
      args: [
        rowKey,
        noteData.status || "",
        noteData.giaiTrinh || "",
        noteData.user || "admin",
        nowStr
      ]
    });

    return true;
  } catch (e) {
    console.error("[Turso] Lỗi updateOrderNoteInTurso:", e.message);
    return false;
  }
}

/**
 * Cập nhật trạng thái Chờ Xử Lý (Pending) vào Turso
 */
async function syncPendingStateToTurso(rowKey, isPending) {
  const client = getTursoClient();
  if (!client) return false;
  try {
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
    await client.execute({
      sql: `INSERT INTO order_operational_state (row_key, is_pending, pending_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(row_key) DO UPDATE SET
              is_pending = excluded.is_pending,
              pending_at = excluded.pending_at,
              updated_at = excluded.updated_at;`,
      args: [rowKey, isPending ? 1 : 0, isPending ? nowStr : null, nowStr]
    });
    return true;
  } catch (e) {
    console.error("[Turso] Lỗi syncPendingStateToTurso:", e.message);
    return false;
  }
}

/**
 * Lấy toàn bộ trạng thái tác nghiệp nội bộ từ Turso
 */
async function getAllOperationalStatesFromTurso() {
  const client = getTursoClient();
  if (!client) return {};
  try {
    await initTursoSchema();
    const res = await client.execute("SELECT * FROM order_operational_state;");
    const map = {};
    res.rows.forEach(r => {
      map[r.row_key] = {
        rowKey: r.row_key,
        cskhStatus: r.cskh_status,
        explanation: r.explanation,
        isPending: r.is_pending === 1,
        pendingAt: r.pending_at,
        updatedAt: r.updated_at
      };
    });
    return map;
  } catch (e) {
    console.error("[Turso] Lỗi getAllOperationalStatesFromTurso:", e.message);
    return {};
  }
}

/**
 * Xóa đơn theo uploadId trong Turso
 */
async function deleteOrdersByUploadIdInTurso(uploadId) {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute({
      sql: "DELETE FROM cancellation_orders WHERE upload_id = ?",
      args: [uploadId]
    });
  } catch (e) {
    console.error("[Turso] Lỗi deleteOrdersByUploadIdInTurso:", e.message);
  }
}

/**
 * Xóa sạch toàn bộ đơn hủy trong Turso
 */
async function clearAllOrdersInTurso() {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute("DELETE FROM cancellation_orders;");
  } catch (e) {}
}

/**
 * Lấy toàn bộ bản ghi kiểm tra đơn (eir_cancellation_orders) từ Turso
 */
async function getAllVerificationOrdersFromTurso() {
  const client = getTursoClient();
  if (!client) return null;

  try {
    await initTursoSchema();
    const res = await client.execute("SELECT * FROM eir_cancellation_orders ORDER BY id ASC;");
    return res.rows.map(r => ({
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
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  } catch (err) {
    console.error("[Turso] Lỗi lấy eir_cancellation_orders:", err.message);
    return null;
  }
}

/**
 * Đồng bộ / lưu bản ghi kiểm tra đơn lên Turso
 */
async function syncVerificationOrdersToTurso(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return { synced: 0, total: 0 };
  const client = getTursoClient();
  if (!client) throw new Error("Chưa khởi tạo client Turso");

  await initTursoSchema();

  const batchSize = 50;
  let synced = 0;

  for (let i = 0; i < orders.length; i += batchSize) {
    const chunk = orders.slice(i, i + batchSize);
    const statements = chunk.map(o => ({
      sql: `
        INSERT INTO eir_cancellation_orders (
          row_key, upload_id, file_name, stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
          so_booking, so_container, loai_container, loai_don_hang, size_teus, trang_thai_don_hang,
          trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
          ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(row_key) DO UPDATE SET
          upload_id = excluded.upload_id,
          file_name = excluded.file_name,
          trang_thai_don_hang = excluded.trang_thai_don_hang,
          ngay_duoc_duyet = excluded.ngay_duoc_duyet,
          updated_at = datetime('now');
      `,
      args: [
        o.rowKey, o.uploadId || "VER-UP", o.fileName || "", o.sttFile || "", o.depot || "",
        o.hangTau || "", o.ngayHuyDon || "", o.ngayDuocDuyet || "", o.soBooking || "",
        o.soContainer || "", o.loaiContainer || "", o.loaiDonHang || "", Number(o.sizeTeus) || 0,
        o.trangThaiDonHang || "Chưa xác định", o.trangThaiKichHoat || "Chưa kích hoạt",
        o.thoiGianKichHoat || "", o.lyDoHuy || "", o.lyDoTuChoi || "", o.lyDoHuyCheck || "",
        o.tenTaiXe || "", o.sdtTaiXe || "", o.tenNhaXe || "", o.sdtNhaXe || "", o.fileName || ""
      ]
    }));

    await client.batch(statements, "write");
    synced += chunk.length;
  }

  return { synced, total: orders.length };
}

/**
 * Xóa 1 dòng kiểm tra đơn theo rowKey (khi đã đối soát thành công)
 */
async function deleteVerificationOrderRowInTurso(rowKey) {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute({
      sql: "DELETE FROM eir_cancellation_orders WHERE row_key = ?",
      args: [rowKey]
    });
  } catch (e) {}
}

/**
 * Xóa danh sách các dòng kiểm tra đơn theo rowKeys (khi đã đối soát thành công)
 */
async function deleteVerificationOrderRowsInTurso(rowKeys) {
  if (!Array.isArray(rowKeys) || rowKeys.length === 0) return;
  const client = getTursoClient();
  if (!client) return;
  try {
    const batchSize = 50;
    for (let i = 0; i < rowKeys.length; i += batchSize) {
      const chunk = rowKeys.slice(i, i + batchSize);
      const placeholders = chunk.map(() => "?").join(",");
      await client.execute({
        sql: `DELETE FROM eir_cancellation_orders WHERE row_key IN (${placeholders});`,
        args: chunk
      });
    }
  } catch (e) {
    console.error("[Turso] Lỗi deleteVerificationOrderRowsInTurso:", e.message);
  }
}

/**
 * Xóa đợt kiểm tra đơn theo uploadId
 */
async function deleteVerificationOrdersByUploadIdInTurso(uploadId) {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute({
      sql: "DELETE FROM eir_cancellation_orders WHERE upload_id = ?",
      args: [uploadId]
    });
  } catch (e) {}
}

/**
 * Xóa sạch bảng kiểm tra đơn trong Turso
 */
async function clearAllVerificationOrdersInTurso() {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute("DELETE FROM eir_cancellation_orders;");
  } catch (e) {}
}

/**
 * Quản lý lịch sử đăng tải trên Turso
 */
async function getUploadHistoryFromTurso() {
  const client = getTursoClient();
  if (!client) return null;
  try {
    await initTursoSchema();
    const res = await client.execute("SELECT * FROM upload_history ORDER BY datetime(uploaded_at) DESC;");
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
      data: r.data_json ? JSON.parse(r.data_json) : null
    }));
  } catch (e) {
    console.error("[Turso] Lỗi getUploadHistoryFromTurso:", e.message);
    return null;
  }
}

async function saveUploadHistoryItemToTurso(item) {
  const client = getTursoClient();
  if (!client) return;
  try {
    await initTursoSchema();
    await client.execute({
      sql: `
        INSERT INTO upload_history (
          id, file_name, file_size, uploaded_at, record_count, teus_count, match_percent,
          is_valid, validation_json, data_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          uploaded_at = excluded.uploaded_at,
          record_count = excluded.record_count,
          teus_count = excluded.teus_count,
          match_percent = excluded.match_percent,
          is_valid = excluded.is_valid,
          validation_json = excluded.validation_json,
          data_json = excluded.data_json;
      `,
      args: [
        item.id,
        item.fileName || "",
        item.fileSize || "",
        item.uploadedAt || "",
        item.recordCount || 0,
        item.teusCount || 0,
        item.matchPercent || 100,
        item.isValid ? 1 : 0,
        item.validation ? JSON.stringify(item.validation) : "",
        item.data ? JSON.stringify(item.data) : ""
      ]
    });
  } catch (e) {
    console.error("[Turso] Lỗi saveUploadHistoryItemToTurso:", e.message);
  }
}

async function deleteUploadHistoryItemFromTurso(id) {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute({
      sql: "DELETE FROM upload_history WHERE id = ?",
      args: [id]
    });
  } catch (e) {}
}

async function clearUploadHistoryInTurso() {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute("DELETE FROM upload_history;");
  } catch (e) {}
}

async function getVerificationHistoryFromTurso() {
  const client = getTursoClient();
  if (!client) return null;
  try {
    await initTursoSchema();
    const res = await client.execute("SELECT * FROM verification_upload_history ORDER BY datetime(uploaded_at) DESC;");
    return res.rows.map(r => ({
      id: r.id,
      fileName: r.file_name,
      fileSize: r.file_size,
      uploadedAt: r.uploaded_at,
      recordCount: Number(r.record_count) || 0,
      insertedCount: Number(r.inserted_count) || 0,
      updatedCount: Number(r.updated_count) || 0,
      totalAccumulated: Number(r.total_accumulated) || 0,
      uploadedBy: r.uploaded_by || "system"
    }));
  } catch (e) {
    console.error("[Turso] Lỗi getVerificationHistoryFromTurso:", e.message);
    return null;
  }
}

async function saveVerificationHistoryItemToTurso(item) {
  const client = getTursoClient();
  if (!client) return;
  try {
    await initTursoSchema();
    await client.execute({
      sql: `
        INSERT INTO verification_upload_history (
          id, file_name, file_size, uploaded_at, record_count, inserted_count, updated_count,
          total_accumulated, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          uploaded_at = excluded.uploaded_at,
          record_count = excluded.record_count,
          inserted_count = excluded.inserted_count,
          updated_count = excluded.updated_count,
          total_accumulated = excluded.total_accumulated,
          uploaded_by = excluded.uploaded_by;
      `,
      args: [
        item.id,
        item.fileName || "",
        item.fileSize || "",
        item.uploadedAt || "",
        item.recordCount || 0,
        item.insertedCount || 0,
        item.updatedCount || 0,
        item.totalAccumulated || 0,
        item.uploadedBy || "system"
      ]
    });
  } catch (e) {
    console.error("[Turso] Lỗi saveVerificationHistoryItemToTurso:", e.message);
  }
}

async function deleteVerificationHistoryItemFromTurso(id) {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute({
      sql: "DELETE FROM verification_upload_history WHERE id = ?",
      args: [id]
    });
  } catch (e) {}
}

/**
 * Lấy số lượng bản ghi từ Turso
 */
async function getTursoRowCount() {
  const client = getTursoClient();
  if (!client) return 0;
  try {
    const res = await client.execute("SELECT COUNT(*) as cnt FROM cancellation_orders;");
    return Number(res.rows[0].cnt);
  } catch (e) {
    return 0;
  }
}

module.exports = {
  getTursoClient,
  isTursoAvailable,
  testConnection,
  initTursoSchema,
  getAllOrdersFromTurso,
  syncOrdersToTurso,
  updateOrderNoteInTurso,
  deleteOrdersByUploadIdInTurso,
  clearAllOrdersInTurso,
  getAllVerificationOrdersFromTurso,
  syncVerificationOrdersToTurso,
  deleteVerificationOrderRowInTurso,
  deleteVerificationOrderRowsInTurso,
  deleteVerificationOrdersByUploadIdInTurso,
  clearAllVerificationOrdersInTurso,
  getUploadHistoryFromTurso,
  saveUploadHistoryItemToTurso,
  deleteUploadHistoryItemFromTurso,
  clearUploadHistoryInTurso,
  getVerificationHistoryFromTurso,
  saveVerificationHistoryItemToTurso,
  deleteVerificationHistoryItemFromTurso,
  getTursoRowCount,
  syncPendingStateToTurso,
  getAllOperationalStatesFromTurso
};
