/**
 * services/tursoClient.js
 * Quản trị kết nối và đồng bộ dữ liệu lên Turso Cloud SQLite (libSQL)
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

// Đọc cấu hình từ .env
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

const TURSO_URL = env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

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

/**
 * Khởi tạo cấu trúc bảng trên Turso Cloud
 */
async function initTursoSchema() {
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

  // 2. Bảng verification_orders
  await client.execute(`
    CREATE TABLE IF NOT EXISTS verification_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_key TEXT UNIQUE,
      upload_id TEXT,
      file_name TEXT,
      stt_file TEXT,
      so_eir TEXT,
      don_tong TEXT,
      kieu_don_hang TEXT,
      loai_don_hang TEXT,
      so_bl_so_van_don TEXT,
      depot TEXT,
      hang_tau TEXT,
      size_cont TEXT,
      so_container TEXT,
      trang_thai_don_hang TEXT,
      trang_thai_kich_hoat TEXT,
      thoi_gian_kich_hoat TEXT,
      ly_do_huy TEXT,
      ly_do_tu_choi TEXT,
      ten_tai_xe TEXT,
      sdt_tai_xe TEXT,
      ten_nha_xe TEXT,
      sdt_nha_xe TEXT,
      ngay_duoc_duyet TEXT,
      ngay_huy_don TEXT,
      size_teus REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Index
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_depot ON cancellation_orders(depot);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_line ON cancellation_orders(hang_tau);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_turso_cancel_status ON cancellation_orders(trang_thai_don_hang);`);
}

/**
 * Đồng bộ toàn bộ dữ liệu đơn duyệt lên Turso
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
  testConnection,
  initTursoSchema,
  syncOrdersToTurso,
  getTursoRowCount
};
