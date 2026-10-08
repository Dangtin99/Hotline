/**
 * services/supabaseClient.js
 * Quản trị kết nối và đồng bộ dữ liệu lên PostgreSQL trên Cloud Supabase
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

let pool = null;

function getPool() {
  if (!Pool) return null;
  if (!pool) {
    const host = env.SUPABASE_HOST || env.DB_SERVER || "aws-0-ap-southeast-1.pooler.supabase.com";
    const port = parseInt(env.SUPABASE_PORT || env.DB_PORT || "6543", 10);
    const database = env.SUPABASE_DATABASE || env.DB_DATABASE || "postgres";
    const user = env.SUPABASE_USER || env.DB_USER || "postgres.qdhkuafxdfxahkrmgcem";
    const password = env.SUPABASE_PASSWORD || env.DB_PASSWORD || "Dangtin992004@";

    pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 5000, // Tự động đóng kết nối nhàn rỗi sau 5s để tránh ECONNRESET từ Supavisor
      max: 5
    });

    // Ngăn chặn unhandled error event trên Client khi Supabase pooler ngắt kết nối nhàn rỗi
    pool.on("connect", (client) => {
      client.on("error", (err) => {
        console.warn("Supabase Client connection warning (auto-handled):", err.message);
      });
    });

    pool.on("error", (err, client) => {
      console.warn("Supabase Pool Error (auto-handled):", err.message);
    });
  }
  return pool;
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

/**
 * Tự động tạo bảng cancellation_orders trên Supabase nếu chưa tồn tại
 */
async function initSupabaseSchema() {
  const p = getPool();
  if (!p) throw new Error("Pool kết nối chưa khởi tạo");

  const query = `
    CREATE TABLE IF NOT EXISTS cancellation_orders (
      id SERIAL PRIMARY KEY,
      row_key VARCHAR(255) UNIQUE,
      upload_id VARCHAR(50),
      file_name VARCHAR(255),
      stt VARCHAR(20),
      depot VARCHAR(50),
      hang_tau VARCHAR(50),
      ngay_huy_don VARCHAR(50),
      ngay_duoc_duyet VARCHAR(50),
      so_booking VARCHAR(100),
      so_container VARCHAR(100),
      trang_thai_don_hang VARCHAR(100),
      trang_thai_kich_hoat VARCHAR(100),
      thoi_gian_kich_hoat VARCHAR(50),
      ly_do_huy TEXT,
      loai_container VARCHAR(50),
      loai_don_hang VARCHAR(20),
      size_teus NUMERIC(5,2),
      ten_tai_xe VARCHAR(150),
      sdt_tai_xe VARCHAR(50),
      ten_nha_xe VARCHAR(255),
      sdt_nha_xe VARCHAR(50),
      ly_do_tu_choi TEXT,
      trang_thai_xu_ly VARCHAR(100),
      giai_trinh TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cancellation_depot ON cancellation_orders(depot);
    CREATE INDEX IF NOT EXISTS idx_cancellation_hang_tau ON cancellation_orders(hang_tau);
    CREATE INDEX IF NOT EXISTS idx_cancellation_status ON cancellation_orders(trang_thai_don_hang);
  `;

  const client = await p.connect();
  try {
    await client.query(query);
    console.log("Đã kiểm tra và khởi tạo cấu trúc bảng [cancellation_orders] trên Supabase Cloud!");
  } finally {
    client.release();
  }
}

/**
 * Đồng bộ toàn bộ danh sách đơn hàng lên Supabase Cloud
 */
async function syncOrdersToSupabase(orders) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { synced: 0, total: 0 };
  }

  const p = getPool();
  if (!p) throw new Error("Không có kết nối Supabase Pool");

  await initSupabaseSchema();

  const client = await p.connect();
  let synced = 0;

  try {
    await client.query("BEGIN;");

    for (const o of orders) {
      const sql = `
        INSERT INTO cancellation_orders (
          row_key, upload_id, file_name, stt, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
          so_booking, so_container, trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat,
          ly_do_huy, loai_container, loai_don_hang, size_teus, ten_tai_xe, sdt_tai_xe,
          ten_nha_xe, sdt_nha_xe, ly_do_tu_choi, trang_thai_xu_ly, giai_trinh
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        ON CONFLICT (row_key) DO UPDATE SET
          upload_id = EXCLUDED.upload_id,
          file_name = EXCLUDED.file_name,
          trang_thai_don_hang = EXCLUDED.trang_thai_don_hang,
          ngay_duoc_duyet = EXCLUDED.ngay_duoc_duyet,
          trang_thai_xu_ly = COALESCE(NULLIF(EXCLUDED.trang_thai_xu_ly, ''), cancellation_orders.trang_thai_xu_ly),
          giai_trinh = COALESCE(NULLIF(EXCLUDED.giai_trinh, ''), cancellation_orders.giai_trinh),
          updated_at = CURRENT_TIMESTAMP;
      `;

      const values = [
        o.rowKey, o.uploadId || "UP-MIGRATE", o.fileName || "", o.stt || "", o.depot || "",
        o.hangTau || "", o.ngayHuyDon || "", o.ngayDuocDuyet || "", o.soBooking || "",
        o.soContainer || "", o.trangThaiDonHang || "", o.trangThaiKichHoat || "",
        o.thoiGianKichHoat || "", o.lyDoHuy || "", o.loaiContainer || "", o.loaiDonHang || "",
        Number(o.sizeTeus) || 0, o.tenTaiXe || "", o.sdtTaiXe || "", o.tenNhaXe || "",
        o.sdtNhaXe || "", o.lyDoTuChoi || "", o.trangThaiXuLy || "", o.giaiTrinh || ""
      ];

      await client.query(sql, values);
      synced++;
    }

    await client.query("COMMIT;");
    console.log(`Đã đồng bộ thành công ${synced} đơn hàng lên Cloud Supabase!`);
    return { synced, total: orders.length };
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("Lỗi khi đồng bộ lên Supabase:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lấy số lượng bản ghi hiện có trên Supabase
 */
async function getSupabaseRowCount() {
  const p = getPool();
  if (!p) return 0;

  try {
    const client = await p.connect();
    const res = await client.query("SELECT COUNT(*) as cnt FROM cancellation_orders;");
    client.release();
    return parseInt(res.rows[0].cnt, 10);
  } catch (err) {
    return null;
  }
}

module.exports = {
  testConnection,
  initSupabaseSchema,
  syncOrdersToSupabase,
  getSupabaseRowCount
};
