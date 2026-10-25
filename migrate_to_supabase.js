/**
 * migrate_to_supabase.js
 * Đồng bộ toàn bộ dữ liệu từ Turso Cloud sang Supabase PostgreSQL
 * Tự động tối ưu: loại bỏ hoàn toàn 13MB cột rác data_json, nạp dữ liệu sạch 100%
 */

const path = require("path");
const fs = require("fs");
const { Pool } = require(path.join(__dirname, "..", "NewProject", "node_modules", "pg"));
const turso = require("./services/tursoClient");

// 1. Đọc biến môi trường từ .env
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
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
const pool = new Pool({
  host: env.SUPABASE_HOST || "aws-0-ap-southeast-1.pooler.supabase.com",
  port: parseInt(env.SUPABASE_PORT || "6543", 10),
  database: env.SUPABASE_DATABASE || "postgres",
  user: env.SUPABASE_USER || "postgres.zuhvtxhyjgyasjublcam",
  password: env.SUPABASE_PASSWORD || process.env.SUPABASE_PASSWORD || "",
  ssl: { rejectUnauthorized: false },
  max: 10
});

async function initAllSupabaseSchemas(client) {
  console.log("[1/5] Khởi tạo các bảng cấu trúc trên Supabase PostgreSQL...");

  await client.query(`
    -- 1. Bảng cancellation_orders
    CREATE TABLE IF NOT EXISTS cancellation_orders (
      id BIGSERIAL PRIMARY KEY,
      row_key VARCHAR(255) UNIQUE,
      upload_id VARCHAR(100),
      file_name VARCHAR(255),
      stt VARCHAR(50),
      depot VARCHAR(50),
      hang_tau VARCHAR(50),
      ngay_huy_don VARCHAR(50),
      ngay_duoc_duyet VARCHAR(50),
      so_booking VARCHAR(150),
      so_container VARCHAR(150),
      trang_thai_don_hang VARCHAR(100),
      trang_thai_kich_hoat VARCHAR(100),
      thoi_gian_kich_hoat VARCHAR(50),
      ly_do_huy TEXT,
      loai_container VARCHAR(100),
      loai_don_hang VARCHAR(50),
      size_teus NUMERIC(6,2) DEFAULT 0,
      ten_tai_xe VARCHAR(255),
      sdt_tai_xe VARCHAR(100),
      ten_nha_xe VARCHAR(255),
      sdt_nha_xe VARCHAR(100),
      ly_do_tu_choi TEXT,
      trang_thai_xu_ly VARCHAR(100),
      giai_trinh TEXT,
      giai_trinh_chi_tiet TEXT,
      original_trang_thai VARCHAR(100),
      is_auto_cancelled_3h INTEGER DEFAULT 0,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE cancellation_orders ADD COLUMN IF NOT EXISTS giai_trinh_chi_tiet TEXT;
    ALTER TABLE cancellation_orders ADD COLUMN IF NOT EXISTS original_trang_thai VARCHAR(100);
    ALTER TABLE cancellation_orders ADD COLUMN IF NOT EXISTS is_auto_cancelled_3h INTEGER DEFAULT 0;
    ALTER TABLE cancellation_orders ADD COLUMN IF NOT EXISTS size_teus NUMERIC(6,2) DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_sup_cancellation_depot ON cancellation_orders(depot);
    CREATE INDEX IF NOT EXISTS idx_sup_cancellation_hang_tau ON cancellation_orders(hang_tau);
    CREATE INDEX IF NOT EXISTS idx_sup_cancellation_date ON cancellation_orders(ngay_duoc_duyet, ngay_huy_don);
    CREATE INDEX IF NOT EXISTS idx_sup_cancellation_booking_cont ON cancellation_orders(so_booking, so_container);

    -- 2. Bảng eir_cancellation_orders
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
    ALTER TABLE eir_cancellation_orders
      ALTER COLUMN row_key TYPE TEXT,
      ALTER COLUMN upload_id TYPE TEXT,
      ALTER COLUMN file_name TYPE TEXT,
      ALTER COLUMN stt_file TYPE TEXT,
      ALTER COLUMN depot TYPE TEXT,
      ALTER COLUMN hang_tau TYPE TEXT,
      ALTER COLUMN ngay_huy_don TYPE TEXT,
      ALTER COLUMN ngay_duoc_duyet TYPE TEXT,
      ALTER COLUMN so_booking TYPE TEXT,
      ALTER COLUMN so_container TYPE TEXT,
      ALTER COLUMN loai_container TYPE TEXT,
      ALTER COLUMN loai_don_hang TYPE TEXT,
      ALTER COLUMN trang_thai_don_hang TYPE TEXT,
      ALTER COLUMN trang_thai_kich_hoat TYPE TEXT,
      ALTER COLUMN thoi_gian_kich_hoat TYPE TEXT,
      ALTER COLUMN ten_tai_xe TYPE TEXT,
      ALTER COLUMN sdt_tai_xe TYPE TEXT,
      ALTER COLUMN ten_nha_xe TYPE TEXT,
      ALTER COLUMN sdt_nha_xe TYPE TEXT,
      ALTER COLUMN file_nguon TYPE TEXT,
      ALTER COLUMN nguoi_tao TYPE TEXT,
      ALTER COLUMN so_xe TYPE TEXT;
    CREATE INDEX IF NOT EXISTS idx_sup_eir_depot ON eir_cancellation_orders(depot);
    CREATE INDEX IF NOT EXISTS idx_sup_eir_date ON eir_cancellation_orders(ngay_duoc_duyet, ngay_huy_don);
    CREATE INDEX IF NOT EXISTS idx_sup_eir_booking_cont ON eir_cancellation_orders(so_booking, so_container);

    -- 3. Bảng upload_history (Sạch, không có cột data_json 13MB)
    CREATE TABLE IF NOT EXISTS upload_history (
      id VARCHAR(100) PRIMARY KEY,
      file_name VARCHAR(255),
      file_size VARCHAR(50),
      uploaded_at VARCHAR(50),
      record_count INTEGER DEFAULT 0,
      teus_count NUMERIC(8,2) DEFAULT 0,
      match_percent NUMERIC(5,2) DEFAULT 100,
      is_valid INTEGER DEFAULT 1,
      validation_json TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Bảng verification_upload_history
    CREATE TABLE IF NOT EXISTS verification_upload_history (
      id VARCHAR(100) PRIMARY KEY,
      file_name VARCHAR(255),
      file_size VARCHAR(50),
      uploaded_at VARCHAR(50),
      record_count INTEGER DEFAULT 0,
      inserted_count INTEGER DEFAULT 0,
      updated_count INTEGER DEFAULT 0,
      total_accumulated INTEGER DEFAULT 0,
      uploaded_by VARCHAR(100),
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Bảng order_operational_state
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
    ALTER TABLE order_operational_state
      ALTER COLUMN row_key TYPE TEXT,
      ALTER COLUMN cskh_status TYPE TEXT,
      ALTER COLUMN pending_at TYPE TEXT,
      ALTER COLUMN updated_by TYPE TEXT;
  `);
  console.log("[OK] Tất cả cấu trúc bảng và indexes đã sẵn sàng trên Supabase!");
}

async function migrateCancellationOrders(tursoClient, pgClient) {
  console.log("\n[2/5] Đang nạp dữ liệu cancellation_orders từ Turso...");
  const countRes = await tursoClient.execute("SELECT COUNT(*) as cnt FROM cancellation_orders");
  const total = Number(countRes.rows[0].cnt);
  console.log(`-> Tìm thấy ${total} đơn hàng trên Turso.`);

  const pgCountRes = await pgClient.query("SELECT COUNT(*) as cnt FROM cancellation_orders");
  const currentPgCount = Number(pgCountRes.rows[0].cnt);
  if (currentPgCount >= total) {
    console.log(`[OK] Supabase đã có đủ ${currentPgCount}/${total} đơn cancellation_orders! Bỏ qua nạp lại.`);
    return;
  }

  const batchSize = 500;
  let offset = 0;
  let synced = 0;

  while (offset < total) {
    const chunkRes = await tursoClient.execute({
      sql: `SELECT * FROM cancellation_orders ORDER BY id ASC LIMIT ? OFFSET ?`,
      args: [batchSize, offset]
    });

    const rows = chunkRes.rows;
    if (rows.length === 0) break;

    await pgClient.query("BEGIN;");
    for (const r of rows) {
      await pgClient.query(`
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
      `, [
        r.row_key, r.upload_id, r.file_name, r.stt, r.depot, r.hang_tau, r.ngay_huy_don, r.ngay_duoc_duyet,
        r.so_booking, r.so_container, r.trang_thai_don_hang, r.trang_thai_kich_hoat, r.thoi_gian_kich_hoat,
        r.ly_do_huy, r.loai_container, r.loai_don_hang, Number(r.size_teus) || 0, r.ten_tai_xe, r.sdt_tai_xe,
        r.ten_nha_xe, r.sdt_nha_xe, r.ly_do_tu_choi, r.trang_thai_xu_ly, r.giai_trinh, r.giai_trinh_chi_tiet,
        r.original_trang_thai, Number(r.is_auto_cancelled_3h) || 0
      ]);
      synced++;
    }
    await pgClient.query("COMMIT;");
    offset += rows.length;
    process.stdout.write(`   -> Tiến độ: ${synced}/${total} đơn (${Math.round((synced/total)*100)}%)\r`);
  }
  console.log(`\n[OK] Đã đồng bộ hoàn tất ${synced} đơn cancellation_orders lên Supabase!`);
}

async function migrateEirOrders(tursoClient, pgClient) {
  console.log("\n[3/5] Đang nạp dữ liệu eir_cancellation_orders từ Turso...");
  const countRes = await tursoClient.execute("SELECT COUNT(*) as cnt FROM eir_cancellation_orders");
  const total = Number(countRes.rows[0].cnt);
  console.log(`-> Tìm thấy ${total} đơn EIR trên Turso.`);

  const batchSize = 500;
  let offset = 0;
  let synced = 0;

  while (offset < total) {
    const chunkRes = await tursoClient.execute({
      sql: `SELECT * FROM eir_cancellation_orders ORDER BY id ASC LIMIT ? OFFSET ?`,
      args: [batchSize, offset]
    });

    const rows = chunkRes.rows;
    if (rows.length === 0) break;

    await pgClient.query("BEGIN;");
    for (const r of rows) {
      await pgClient.query(`
        INSERT INTO eir_cancellation_orders (
          row_key, upload_id, file_name, stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
          so_booking, so_container, loai_container, loai_don_hang, size_teus, trang_thai_don_hang,
          trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
          ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon, nguoi_tao, so_xe
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        )
        ON CONFLICT (row_key) DO UPDATE SET
          trang_thai_don_hang = EXCLUDED.trang_thai_don_hang,
          ngay_duoc_duyet = EXCLUDED.ngay_duoc_duyet,
          updated_at = CURRENT_TIMESTAMP;
      `, [
        r.row_key, r.upload_id, r.file_name, r.stt_file, r.depot, r.hang_tau, r.ngay_huy_don, r.ngay_duoc_duyet,
        r.so_booking, r.so_container, r.loai_container, r.loai_don_hang, Number(r.size_teus) || 0,
        r.trang_thai_don_hang, r.trang_thai_kich_hoat, r.thoi_gian_kich_hoat, r.ly_do_huy, r.ly_do_tu_choi,
        r.ly_do_huy_check, r.ten_tai_xe, r.sdt_tai_xe, r.ten_nha_xe, r.sdt_nha_xe, r.file_nguon,
        r.nguoi_tao, r.so_xe
      ]);
      synced++;
    }
    await pgClient.query("COMMIT;");
    offset += rows.length;
    process.stdout.write(`   -> Tiến độ: ${synced}/${total} đơn EIR (${Math.round((synced/total)*100)}%)\r`);
  }
  console.log(`\n[OK] Đã đồng bộ hoàn tất ${synced} đơn eir_cancellation_orders lên Supabase!`);
}

async function migrateOperationalState(tursoClient, pgClient) {
  console.log("\n[4/5] Đang nạp dữ liệu order_operational_state (giải trình CSKH)...");
  const countRes = await tursoClient.execute("SELECT COUNT(*) as cnt FROM order_operational_state");
  const total = Number(countRes.rows[0].cnt);
  console.log(`-> Tìm thấy ${total} bản ghi giải trình trên Turso.`);

  const batchSize = 500;
  let offset = 0;
  let synced = 0;

  while (offset < total) {
    const chunkRes = await tursoClient.execute({
      sql: `SELECT * FROM order_operational_state LIMIT ? OFFSET ?`,
      args: [batchSize, offset]
    });

    const rows = chunkRes.rows;
    if (rows.length === 0) break;

    await pgClient.query("BEGIN;");
    for (const r of rows) {
      await pgClient.query(`
        INSERT INTO order_operational_state (
          row_key, cskh_status, explanation, explanation_detail, is_pending, pending_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (row_key) DO UPDATE SET
          cskh_status = EXCLUDED.cskh_status,
          explanation = EXCLUDED.explanation,
          explanation_detail = EXCLUDED.explanation_detail,
          is_pending = EXCLUDED.is_pending,
          pending_at = EXCLUDED.pending_at,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP;
      `, [
        r.row_key, r.cskh_status, r.explanation, r.explanation_detail,
        Number(r.is_pending) || 0, r.pending_at, r.updated_by
      ]);
      synced++;
    }
    await pgClient.query("COMMIT;");
    offset += rows.length;
    process.stdout.write(`   -> Tiến độ: ${synced}/${total} (${Math.round((synced/total)*100)}%)\r`);
  }
  console.log(`\n[OK] Đã đồng bộ hoàn tất ${synced} bản ghi order_operational_state lên Supabase!`);
}

async function migrateUploadHistories(tursoClient, pgClient) {
  console.log("\n[5/5] Đang nạp lịch sử upload_history & verification_upload_history...");

  // upload_history (loại bỏ cột data_json 13MB)
  const uhRes = await tursoClient.execute("SELECT id, file_name, file_size, uploaded_at, record_count, teus_count, match_percent, is_valid, validation_json FROM upload_history");
  console.log(`-> Tìm thấy ${uhRes.rows.length} lịch sử upload đơn hủy.`);
  await pgClient.query("BEGIN;");
  for (const r of uhRes.rows) {
    await pgClient.query(`
      INSERT INTO upload_history (
        id, file_name, file_size, uploaded_at, record_count, teus_count, match_percent, is_valid, validation_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        record_count = EXCLUDED.record_count,
        teus_count = EXCLUDED.teus_count;
    `, [
      r.id, r.file_name, r.file_size, r.uploaded_at,
      Number(r.record_count) || 0, Number(r.teus_count) || 0,
      Number(r.match_percent) || 100, Number(r.is_valid) || 1,
      r.validation_json || ""
    ]);
  }
  await pgClient.query("COMMIT;");

  // verification_upload_history
  const vhRes = await tursoClient.execute("SELECT * FROM verification_upload_history");
  console.log(`-> Tìm thấy ${vhRes.rows.length} lịch sử upload kiểm tra.`);
  await pgClient.query("BEGIN;");
  for (const r of vhRes.rows) {
    await pgClient.query(`
      INSERT INTO verification_upload_history (
        id, file_name, file_size, uploaded_at, record_count, inserted_count, updated_count, total_accumulated, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        record_count = EXCLUDED.record_count,
        inserted_count = EXCLUDED.inserted_count,
        updated_count = EXCLUDED.updated_count,
        total_accumulated = EXCLUDED.total_accumulated;
    `, [
      r.id, r.file_name, r.file_size, r.uploaded_at,
      Number(r.record_count) || 0, Number(r.inserted_count) || 0,
      Number(r.updated_count) || 0, Number(r.total_accumulated) || 0,
      r.uploaded_by || ""
    ]);
  }
  await pgClient.query("COMMIT;");
  console.log("[OK] Đã đồng bộ hoàn tất toàn bộ lịch sử tải tệp lên Supabase!");
}

async function run() {
  console.log("======================================================================");
  console.log("  TIẾN TRÌNH ĐỒNG BỘ DỮ LIỆU TỪ TURSO SANG SUPABASE POSTGRESQL (CLOUD) ");
  console.log("======================================================================");

  const tursoClient = turso.getTursoClient();
  if (!tursoClient) {
    throw new Error("Không thể khởi tạo Turso Client!");
  }

  const pgClient = await pool.connect();
  try {
    await initAllSupabaseSchemas(pgClient);
    await migrateCancellationOrders(tursoClient, pgClient);
    await migrateEirOrders(tursoClient, pgClient);
    await migrateOperationalState(tursoClient, pgClient);
    await migrateUploadHistories(tursoClient, pgClient);

    console.log("\n======================================================================");
    console.log("  [THÀNH CÔNG RỰC RỠ] ĐÃ ĐỒNG BỘ 100% DỮ LIỆU SẠCH LÊN SUPABASE CLOUD!");
    console.log("======================================================================");
  } finally {
    pgClient.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("\n[LỖI ĐỒNG BỘ]:", err);
  process.exit(1);
});
