/**
 * services/database.js
 * Quản trị Cơ sở dữ liệu SQL cho Hệ thống Phân tích Đơn Hủy Logistics (GPG Logistics)
 * Hỗ trợ:
 * 1. Tự động lưu trữ và tích lũy TOÀN BỘ dữ liệu từ mọi file tải lên vào SQL.
 * 2. SQLite (node:sqlite DatabaseSync) hoặc File-backed SQL Store tương thích 100%.
 * 3. Tự động tạo và duy trì file script SQL chuẩn: data/cancellation_orders.sql.
 * 4. Ngăn ngừa trùng lặp đơn hàng thông minh (dựa trên Container + Booking + Ngày hủy + Depot).
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_SQLITE_PATH = path.join(DATA_DIR, "cancellation_orders.db");
const DB_JSON_PATH = path.join(DATA_DIR, "cancellation_orders.json");
const SQL_DUMP_PATH = path.join(DATA_DIR, "cancellation_orders.sql");
const HISTORY_FILE = path.join(DATA_DIR, "upload_history.json");
const VERIFICATION_JSON_PATH = path.join(DATA_DIR, "verification_orders.json");
const VERIFICATION_SQL_DUMP_PATH = path.join(DATA_DIR, "eir_cancellation_orders.sql");

const { applyExpired3hCancellation } = require("./cancellationAnalyzer");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let supabaseClient = null;
try {
  supabaseClient = require("./supabaseClient");
} catch (e) {
  console.log("Supabase client chưa sẵn sàng:", e.message);
}

let tursoClient = null;
try {
  tursoClient = require("./tursoClient");
} catch (e) {
  console.log("Turso client chưa sẵn sàng:", e.message);
}

// Thử nạp module SQLite tích hợp của Node.js (v22.5+)
let sqliteEngine = null;
try {
  const { DatabaseSync } = require("node:sqlite");
  sqliteEngine = new DatabaseSync(DB_SQLITE_PATH);
  sqliteEngine.exec(`
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
      size_teus REAL,
      ten_tai_xe TEXT,
      sdt_tai_xe TEXT,
      ten_nha_xe TEXT,
      sdt_nha_xe TEXT,
      ly_do_tu_choi TEXT,
      trang_thai_xu_ly TEXT,
      giai_trinh TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_depot ON cancellation_orders(depot);
    CREATE INDEX IF NOT EXISTS idx_hang_tau ON cancellation_orders(hang_tau);
    CREATE INDEX IF NOT EXISTS idx_trang_thai ON cancellation_orders(trang_thai_don_hang);

    CREATE TABLE IF NOT EXISTS eir_cancellation_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_key TEXT UNIQUE,
      upload_id TEXT,
      file_name TEXT,
      stt_file TEXT,
      depot TEXT NOT NULL,
      hang_tau TEXT NOT NULL,
      ngay_huy_don TEXT NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_eir_depot ON eir_cancellation_orders(depot);
    CREATE INDEX IF NOT EXISTS idx_eir_hang_tau ON eir_cancellation_orders(hang_tau);
    CREATE INDEX IF NOT EXISTS idx_eir_trang_thai ON eir_cancellation_orders(trang_thai_don_hang);
    CREATE INDEX IF NOT EXISTS idx_eir_booking_container ON eir_cancellation_orders(so_booking, so_container);
  `);
  console.log("Đã kết nối cơ sở dữ liệu SQLite thành công (cancellation_orders.db)");
} catch (e) {
  console.log("Sử dụng File-backed SQL Store & Đồng bộ hóa SQL Dump script:", e.message);
  sqliteEngine = null;
}

// Quản lý bộ nhớ đệm và dữ liệu đồng bộ
let memoryOrders = [];

// Hàm tạo khóa duy nhất để nhận diện đơn hàng không bị trùng lặp
function generateOrderKey(r) {
  const cont = (r.soContainer || "").trim().toUpperCase();
  const book = (r.soBooking || "").trim().toUpperCase();
  const date = (r.ngayHuyDon || "").trim();
  const depot = (r.depot || "").trim().toUpperCase();

  if (cont || book) {
    return `${depot}#${cont}#${book}#${date}`;
  }
  // Đơn thủ công không có cont/booking: dùng manualId nếu có để đảm bảo duy nhất
  if (r._manualId) {
    return `${depot}#${r._manualId}#${date}`;
  }
  // Trường hợp không có cont/booking thì dùng stt + depot + ngày hủy
  return `${depot}#STT_${r.stt || "0"}#${date}`;
}

// Nạp dữ liệu ban đầu
function loadAllFromStore() {
  try {
    if (fs.existsSync(DB_JSON_PATH)) {
      const content = fs.readFileSync(DB_JSON_PATH, "utf8");
      memoryOrders = JSON.parse(content);
      return memoryOrders;
    }
  } catch (err) {
    console.warn("Chưa có file cancellation_orders.json hoặc lỗi đọc:", err.message);
  }

  // Nếu file JSON chưa có, kiểm tra và import từ lịch sử tải lên cũ
  memoryOrders = [];
  migrateFromUploadHistory();
  return memoryOrders;
}

// Lưu dữ liệu vào file JSON và xuất dump file .sql
function persistStore() {
  try {
    if (fs.existsSync(DATA_DIR)) {
      fs.writeFileSync(DB_JSON_PATH, JSON.stringify(memoryOrders, null, 2), "utf8");
      generateSqlDumpFile();
    }
  } catch (err) {
    // Trên Vercel Serverless filesystem là read-only, dữ liệu lưu vĩnh viễn trên Turso Cloud
  }

  // Đồng bộ ngầm lên Turso Cloud (fire-and-forget)
  if (tursoClient) {
    tursoClient.syncOrdersToTurso(memoryOrders).catch(err => {
      console.warn("[Turso] Dong bo len Turso that bai:", err.message);
    });
  }
}

// Tự động sinh file script SQL hoàn chỉnh (.sql) để người dùng có thể import vào bất kỳ hệ quản trị CSDL nào (Postgres, MySQL, SQL Server, SQLite)
function generateSqlDumpFile() {
  try {
    const lines = [];
    lines.push(`-- ====================================================================`);
    lines.push(`-- GPG LOGISTICS - CƠ SỞ DỮ LIỆU ĐƠN HỦY (CANCELLATION ORDERS DATABASE)`);
    lines.push(`-- Thời gian cập nhật: ${new Date().toISOString()}`);
    lines.push(`-- Tổng số bản ghi tích lũy: ${memoryOrders.length}`);
    lines.push(`-- ====================================================================`);
    lines.push(``);
    lines.push(`CREATE TABLE IF NOT EXISTS cancellation_orders (`);
    lines.push(`  id INT PRIMARY KEY,`);
    lines.push(`  row_key VARCHAR(255) UNIQUE,`);
    lines.push(`  upload_id VARCHAR(50),`);
    lines.push(`  file_name VARCHAR(255),`);
    lines.push(`  stt VARCHAR(20),`);
    lines.push(`  depot VARCHAR(50),`);
    lines.push(`  hang_tau VARCHAR(50),`);
    lines.push(`  ngay_huy_don VARCHAR(50),`);
    lines.push(`  ngay_duoc_duyet VARCHAR(50),`);
    lines.push(`  so_booking VARCHAR(100),`);
    lines.push(`  so_container VARCHAR(100),`);
    lines.push(`  trang_thai_don_hang VARCHAR(100),`);
    lines.push(`  trang_thai_kich_hoat VARCHAR(100),`);
    lines.push(`  thoi_gian_kich_hoat VARCHAR(50),`);
    lines.push(`  ly_do_huy TEXT,`);
    lines.push(`  loai_container VARCHAR(50),`);
    lines.push(`  loai_don_hang VARCHAR(20),`);
    lines.push(`  size_teus NUMERIC(5,2),`);
    lines.push(`  ten_tai_xe VARCHAR(150),`);
    lines.push(`  sdt_tai_xe VARCHAR(50),`);
    lines.push(`  ten_nha_xe VARCHAR(255),`);
    lines.push(`  sdt_nha_xe VARCHAR(50),`);
    lines.push(`  ly_do_tu_choi TEXT,`);
    lines.push(`  trang_thai_xu_ly VARCHAR(100),`);
    lines.push(`  giai_trinh TEXT,`);
    lines.push(`  created_at VARCHAR(50)`);
    lines.push(`);`);
    lines.push(``);

    const escapeSql = (val) => {
      if (val === null || val === undefined) return "NULL";
      return `'${String(val).replace(/'/g, "''")}'`;
    };

    memoryOrders.forEach((o, idx) => {
      lines.push(
        `INSERT INTO cancellation_orders (id, row_key, upload_id, file_name, stt, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet, so_booking, so_container, trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, loai_container, loai_don_hang, size_teus, ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, ly_do_tu_choi, trang_thai_xu_ly, giai_trinh, created_at) ` +
        `VALUES (${idx + 1}, ${escapeSql(o.rowKey)}, ${escapeSql(o.uploadId)}, ${escapeSql(o.fileName)}, ${escapeSql(o.stt)}, ${escapeSql(o.depot)}, ${escapeSql(o.hangTau)}, ${escapeSql(o.ngayHuyDon)}, ${escapeSql(o.ngayDuocDuyet)}, ${escapeSql(o.soBooking)}, ${escapeSql(o.soContainer)}, ${escapeSql(o.trangThaiDonHang)}, ${escapeSql(o.trangThaiKichHoat)}, ${escapeSql(o.thoiGianKichHoat)}, ${escapeSql(o.lyDoHuy)}, ${escapeSql(o.loaiContainer)}, ${escapeSql(o.loaiDonHang)}, ${Number(o.sizeTeus) || 0}, ${escapeSql(o.tenTaiXe)}, ${escapeSql(o.sdtTaiXe)}, ${escapeSql(o.tenNhaXe)}, ${escapeSql(o.sdtNhaXe)}, ${escapeSql(o.lyDoTuChoi)}, ${escapeSql(o.trangThaiXuLy)}, ${escapeSql(o.giaiTrinh)}, ${escapeSql(o.createdAt)});`
      );
    });

    fs.writeFileSync(SQL_DUMP_PATH, lines.join("\n"), "utf8");
  } catch (err) {
    console.error("Lỗi khi sinh file SQL DUMP:", err.message);
  }
}

// Chuyển đổi và nạp tất cả dữ liệu từ upload_history.json cũ vào cơ sở dữ liệu SQL
function migrateFromUploadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;
    const historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    if (!Array.isArray(historyData) || historyData.length === 0) return;

    // Duyệt từ cũ đến mới để bản ghi mới ghi đè/cập nhật bản ghi cũ
    const sortedHistory = [...historyData].reverse();
    let totalMigrated = 0;

    sortedHistory.forEach(item => {
      const records = item.data?.records || [];
      const meta = { uploadId: item.id, fileName: item.fileName, uploadedAt: item.uploadedAt };
      insertRecords(records, meta, false); // Chưa persist vội
      totalMigrated += records.length;
    });

    persistStore();
    console.log(`Đã tích lũy thành công ${memoryOrders.length} bản ghi đơn hàng vào cơ sở dữ liệu SQL từ các file trong lịch sử!`);
  } catch (err) {
    console.error("Lỗi khi migrate dữ liệu từ lịch sử cũ:", err.message);
  }
}

/**
 * Thêm hoặc Cập nhật danh sách đơn hàng vào cơ sở dữ liệu SQL
 * @param {Array} records Danh sách đơn hàng từ file vừa parse
 * @param {Object} metadata { uploadId, fileName, uploadedAt }
 * @param {Boolean} shouldPersist Có lưu ngay vào đĩa không
 */
function insertRecords(records, metadata = {}, shouldPersist = true) {
  if (!Array.isArray(records) || records.length === 0) {
    return { inserted: 0, updated: 0, total: memoryOrders.length };
  }

  applyExpired3hCancellation(records);

  const existingMap = new Map();
  memoryOrders.forEach((item, index) => {
    existingMap.set(item.rowKey, index);
  });

  let insertedCount = 0;
  let updatedCount = 0;
  const nowStr = metadata.uploadedAt || new Date().toISOString().replace("T", " ").substring(0, 19);

  records.forEach(r => {
    const rowKey = generateOrderKey(r);
    const orderData = {
      rowKey,
      uploadId: metadata.uploadId || `UP-${Date.now()}`,
      fileName: metadata.fileName || "unknown.xlsx",
      stt: r.stt || "",
      depot: r.depot || "",
      hangTau: r.hangTau || "",
      ngayHuyDon: r.ngayHuyDon || "",
      ngayDuocDuyet: r.ngayDuocDuyet || "",
      soBooking: r.soBooking || "",
      soContainer: r.soContainer || "",
      trangThaiDonHang: r.trangThaiDonHang || "",
      trangThaiKichHoat: r.trangThaiKichHoat || "",
      thoiGianKichHoat: r.thoiGianKichHoat || "",
      lyDoHuy: r.lyDoHuy || "",
      loaiContainer: r.loaiContainer || "",
      loaiDonHang: r.loaiDonHang || "",
      sizeTeus: Number(r.sizeTeus) || 0,
      tenTaiXe: r.tenTaiXe || "",
      sdtTaiXe: r.sdtTaiXe || "",
      tenNhaXe: r.tenNhaXe || "",
      sdtNhaXe: r.sdtNhaXe || "",
      lyDoTuChoi: r.lyDoTuChoi || "",
      trangThaiXuLy: r.trangThaiXuLy || "",
      giaiTrinh: r.giaiTrinh || "",
      createdAt: nowStr,
      updatedAt: nowStr
    };

    if (existingMap.has(rowKey)) {
      // Đã tồn tại -> Cập nhật thông tin mới nhất, bảo tồn ghi chú CSKH nếu đã có
      const existingIdx = existingMap.get(rowKey);
      const existing = memoryOrders[existingIdx];
      orderData.trangThaiXuLy = existing.trangThaiXuLy || orderData.trangThaiXuLy;
      orderData.giaiTrinh = existing.giaiTrinh || orderData.giaiTrinh;
      orderData.createdAt = existing.createdAt;
      memoryOrders[existingIdx] = orderData;
      updatedCount++;
    } else {
      // Bản ghi mới -> Thêm vào cơ sở dữ liệu
      memoryOrders.push(orderData);
      existingMap.set(rowKey, memoryOrders.length - 1);
      insertedCount++;
    }

    // Nếu có SQLite engine, đồng bộ câu lệnh INSERT OR REPLACE
    if (sqliteEngine) {
      try {
        const stmt = sqliteEngine.prepare(`
          INSERT INTO cancellation_orders (
            row_key, upload_id, file_name, stt, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
            so_booking, so_container, trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat,
            ly_do_huy, loai_container, loai_don_hang, size_teus, ten_tai_xe, sdt_tai_xe,
            ten_nha_xe, sdt_nha_xe, ly_do_tu_choi, trang_thai_xu_ly, giai_trinh, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(row_key) DO UPDATE SET
            upload_id=excluded.upload_id,
            file_name=excluded.file_name,
            trang_thai_don_hang=excluded.trang_thai_don_hang,
            ngay_duoc_duyet=excluded.ngay_duoc_duyet,
            updated_at=excluded.updated_at
        `);
        stmt.run(
          orderData.rowKey, orderData.uploadId, orderData.fileName, orderData.stt, orderData.depot,
          orderData.hangTau, orderData.ngayHuyDon, orderData.ngayDuocDuyet, orderData.soBooking,
          orderData.soContainer, orderData.trangThaiDonHang, orderData.trangThaiKichHoat,
          orderData.thoiGianKichHoat, orderData.lyDoHuy, orderData.loaiContainer,
          orderData.loaiDonHang, orderData.sizeTeus, orderData.tenTaiXe, orderData.sdtTaiXe,
          orderData.tenNhaXe, orderData.sdtNhaXe, orderData.lyDoTuChoi, orderData.trangThaiXuLy,
          orderData.giaiTrinh, orderData.createdAt, orderData.updatedAt
        );
      } catch (err) {
        // Bỏ qua lỗi sqliteEngine nếu có, file JSON & SQL dump vẫn hoạt động độc lập
      }
    }
  });

  if (shouldPersist) {
    persistStore();

    // Đồng bộ hóa ngầm lên Supabase Cloud
    if (supabaseClient) {
      supabaseClient.syncOrdersToSupabase(memoryOrders).catch(err => {
        console.warn("Đồng bộ ngầm lên Supabase cảnh báo:", err.message);
      });
    }
  }

  return {
    inserted: insertedCount,
    updated: updatedCount,
    total: memoryOrders.length
  };
}

/**
 * Lấy toàn bộ bản ghi tích lũy trong cơ sở dữ liệu SQL
 * STT được đánh số lại tuần tự từ 1 -> N để bảng hiển thị liền mạch
 */
function getAllRecords() {
  loadAllFromStore();
  applyExpired3hCancellation(memoryOrders);

  return memoryOrders.map((o, idx) => ({
    ...o,
    stt: String(idx + 1)
  }));
}

/**
 * Cập nhật trạng thái xử lý CSKH hoặc giải trình vào database
 */
function updateOrderNote(rowKey, noteData = {}) {
  let matched = memoryOrders.filter(o => o.rowKey === rowKey);
  if (matched.length === 0 && rowKey) {
    matched = memoryOrders.filter(o => {
      const altKey = `${o.stt}_${o.soBooking || ''}_${o.soContainer || ''}`;
      return altKey === rowKey || (o.soContainer && o.soBooking && rowKey.includes(o.soContainer) && rowKey.includes(o.soBooking));
    });
  }
  if (matched.length === 0) return false;

  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
  matched.forEach(item => {
    if (noteData.status !== undefined) item.trangThaiXuLy = noteData.status;
    if (noteData.giaiTrinh !== undefined) item.giaiTrinh = noteData.giaiTrinh;
    item.updatedAt = nowStr;

    if (sqliteEngine) {
      try {
        const stmt = sqliteEngine.prepare(`
          UPDATE cancellation_orders 
          SET trang_thai_xu_ly = ?, giai_trinh = ?, updated_at = ? 
          WHERE row_key = ?
        `);
        stmt.run(item.trangThaiXuLy || '', item.giaiTrinh || '', nowStr, item.rowKey);
      } catch (e) {}
    }
  });

  persistStore();
  return true;
}

/**
 * Thống kê tổng hợp cơ sở dữ liệu
 */
function getDatabaseStats() {
  if (memoryOrders.length === 0) {
    loadAllFromStore();
  }

  const files = [...new Set(memoryOrders.map(o => o.fileName).filter(Boolean))];
  const depots = [...new Set(memoryOrders.map(o => o.depot).filter(Boolean))];
  const totalTeus = memoryOrders.reduce((sum, o) => sum + (Number(o.sizeTeus) || 0), 0);

  return {
    totalRecords: memoryOrders.length,
    totalTeus,
    fileCount: files.length,
    depotCount: depots.length,
    files,
    sqlDumpPath: SQL_DUMP_PATH
  };
}

/**
 * Xóa các bản ghi theo upload_id khỏi cơ sở dữ liệu SQL (cancellation_orders)
 */
function deleteRecordsByUploadId(uploadId) {
  memoryOrders = memoryOrders.filter(o => o.uploadId !== uploadId);
  persistStore();
  if (sqliteEngine) {
    try {
      const stmt = sqliteEngine.prepare("DELETE FROM cancellation_orders WHERE upload_id = ?");
      stmt.run(uploadId);
    } catch (e) {}
  }
}

/**
 * Dọn sạch cơ sở dữ liệu
 */
function clearDatabase() {
  memoryOrders = [];
  persistStore();
  if (sqliteEngine) {
    try {
      sqliteEngine.exec("DELETE FROM cancellation_orders;");
    } catch (e) {}
  }
}

async function syncAllToSupabase() {
  if (!supabaseClient) throw new Error("Supabase client chưa được cấu hình.");
  if (memoryOrders.length === 0) {
    loadAllFromStore();
  }
  return await supabaseClient.syncOrdersToSupabase(memoryOrders);
}

// Khởi chạy nạp dữ liệu ngay khi import module
loadAllFromStore();

// =========================================================================
// QUẢN LÝ CƠ SỞ DỮ LIỆU SQL DÀNH CHO TAB KIỂM TRA ĐƠN (EIR CANCELLATION ORDERS)
// =========================================================================

let memoryVerificationOrders = [];

function generateVerificationKey(r) {
  const eir = (r.sttFile || "").trim().toUpperCase();
  const cont = (r.soContainer || "").trim().toUpperCase();
  const book = (r.soBooking || "").trim().toUpperCase();
  const date = (r.ngayHuyDon || "").trim();
  const depot = (r.depot || "").trim().toUpperCase();

  if (eir) return `${depot}#EIR_${eir}#${date}`;
  if (cont || book) return `${depot}#${cont}#${book}#${date}`;
  return `${depot}#VER_${Date.now()}_${Math.random()}`;
}

function loadVerificationFromStore() {
  try {
    if (fs.existsSync(VERIFICATION_JSON_PATH)) {
      const content = fs.readFileSync(VERIFICATION_JSON_PATH, "utf8");
      memoryVerificationOrders = JSON.parse(content);
      return memoryVerificationOrders;
    }
  } catch (err) {
    console.warn("Chưa có file verification_orders.json hoặc lỗi đọc:", err.message);
  }
  memoryVerificationOrders = [];
  return memoryVerificationOrders;
}

function persistVerificationStore() {
  try {
    if (fs.existsSync(DATA_DIR)) {
      fs.writeFileSync(VERIFICATION_JSON_PATH, JSON.stringify(memoryVerificationOrders, null, 2), "utf8");
      generateVerificationSqlDumpFile();
    }
  } catch (err) {
    // Trên Vercel Serverless filesystem là read-only
  }
  if (tursoClient) {
    tursoClient.syncVerificationOrdersToTurso(memoryVerificationOrders).catch(err => {
      console.warn("[Turso] Dong bo verification len Turso that bai:", err.message);
    });
  }
}

function generateVerificationSqlDumpFile() {
  try {
    const lines = [];
    lines.push(`-- ====================================================================`);
    lines.push(`-- GPG LOGISTICS - CƠ SỞ DỮ LIỆU KIỂM TRA ĐƠN (EIR CANCELLATION ORDERS)`);
    lines.push(`-- Thời gian cập nhật: ${new Date().toISOString()}`);
    lines.push(`-- Tổng số bản ghi tích lũy: ${memoryVerificationOrders.length}`);
    lines.push(`-- ====================================================================`);
    lines.push(``);
    lines.push(`CREATE TABLE IF NOT EXISTS eir_cancellation_orders (`);
    lines.push(`  id BIGSERIAL PRIMARY KEY,`);
    lines.push(`  row_key VARCHAR(255) UNIQUE,`);
    lines.push(`  upload_id VARCHAR(50),`);
    lines.push(`  file_name VARCHAR(255),`);
    lines.push(`  stt_file VARCHAR(50),`);
    lines.push(`  depot VARCHAR(20) NOT NULL,`);
    lines.push(`  hang_tau VARCHAR(20) NOT NULL,`);
    lines.push(`  ngay_huy_don TIMESTAMP WITHOUT TIME ZONE NOT NULL,`);
    lines.push(`  ngay_duoc_duyet TIMESTAMP WITHOUT TIME ZONE,`);
    lines.push(`  so_booking VARCHAR(100),`);
    lines.push(`  so_container VARCHAR(100),`);
    lines.push(`  loai_container VARCHAR(100),`);
    lines.push(`  loai_don_hang VARCHAR(10),`);
    lines.push(`  size_teus NUMERIC(4, 2) DEFAULT 0,`);
    lines.push(`  trang_thai_don_hang VARCHAR(50) DEFAULT 'Chưa xác định',`);
    lines.push(`  trang_thai_kich_hoat VARCHAR(50) DEFAULT 'Chưa kích hoạt',`);
    lines.push(`  thoi_gian_kich_hoat TIMESTAMP WITHOUT TIME ZONE,`);
    lines.push(`  ly_do_huy TEXT,`);
    lines.push(`  ly_do_tu_choi TEXT,`);
    lines.push(`  ly_do_huy_check TEXT,`);
    lines.push(`  ten_tai_xe VARCHAR(150),`);
    lines.push(`  sdt_tai_xe VARCHAR(50),`);
    lines.push(`  ten_nha_xe VARCHAR(255),`);
    lines.push(`  sdt_nha_xe VARCHAR(50),`);
    lines.push(`  file_nguon VARCHAR(255),`);
    lines.push(`  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,`);
    lines.push(`  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP`);
    lines.push(`);`);
    lines.push(``);

    const escapeSql = (val) => {
      if (val === null || val === undefined) return "NULL";
      return `'${String(val).replace(/'/g, "''")}'`;
    };

    memoryVerificationOrders.forEach((o, idx) => {
      lines.push(
        `INSERT INTO eir_cancellation_orders (id, row_key, upload_id, file_name, stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet, so_booking, so_container, loai_container, loai_don_hang, size_teus, trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, ly_do_tu_choi, ly_do_huy_check, ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon, created_at, updated_at) ` +
        `VALUES (${idx + 1}, ${escapeSql(o.rowKey)}, ${escapeSql(o.uploadId)}, ${escapeSql(o.fileName)}, ${escapeSql(o.sttFile)}, ${escapeSql(o.depot)}, ${escapeSql(o.hangTau)}, ${escapeSql(o.ngayHuyDon)}, ${escapeSql(o.ngayDuocDuyet)}, ${escapeSql(o.soBooking)}, ${escapeSql(o.soContainer)}, ${escapeSql(o.loaiContainer)}, ${escapeSql(o.loaiDonHang)}, ${Number(o.sizeTeus) || 0}, ${escapeSql(o.trangThaiDonHang)}, ${escapeSql(o.trangThaiKichHoat)}, ${escapeSql(o.thoiGianKichHoat)}, ${escapeSql(o.lyDoHuy)}, ${escapeSql(o.lyDoTuChoi)}, ${escapeSql(o.lyDoHuyCheck)}, ${escapeSql(o.tenTaiXe)}, ${escapeSql(o.sdtTaiXe)}, ${escapeSql(o.tenNhaXe)}, ${escapeSql(o.sdtNhaXe)}, ${escapeSql(o.fileName)}, ${escapeSql(o.createdAt)}, ${escapeSql(o.updatedAt)});`
      );
    });

    fs.writeFileSync(VERIFICATION_SQL_DUMP_PATH, lines.join("\n"), "utf8");
  } catch (err) {
    console.error("Lỗi khi sinh file eir_cancellation_orders.sql DUMP:", err.message);
  }
}

function insertVerificationRecords(records, metadata = {}, shouldPersist = true) {
  if (!Array.isArray(records) || records.length === 0) {
    return { inserted: 0, updated: 0, total: memoryVerificationOrders.length };
  }

  const existingMap = new Map();
  memoryVerificationOrders.forEach((item, index) => {
    existingMap.set(item.rowKey, index);
  });

  let insertedCount = 0;
  let updatedCount = 0;
  const nowStr = metadata.uploadedAt || new Date().toISOString().replace("T", " ").substring(0, 19);

  records.forEach(r => {
    const rowKey = generateVerificationKey(r);
    const orderData = {
      rowKey,
      uploadId: metadata.uploadId || `VER-${Date.now()}`,
      fileName: metadata.fileName || "verification.xlsx",
      sttFile: r.sttFile || "",
      depot: r.depot || "",
      hangTau: r.hangTau || "",
      ngayHuyDon: r.ngayHuyDon || "",
      ngayDuocDuyet: r.ngayDuocDuyet || "",
      soBooking: r.soBooking || "",
      soContainer: r.soContainer || "",
      loaiContainer: r.loaiContainer || "",
      loaiDonHang: r.loaiDonHang || "",
      sizeTeus: Number(r.sizeTeus) || 0,
      trangThaiDonHang: r.trangThaiDonHang || "Chưa xác định",
      trangThaiKichHoat: r.trangThaiKichHoat || "Chưa kích hoạt",
      thoiGianKichHoat: r.thoiGianKichHoat || "",
      lyDoHuy: r.lyDoHuy || "",
      lyDoTuChoi: r.lyDoTuChoi || "",
      lyDoHuyCheck: r.lyDoHuyCheck || "",
      tenTaiXe: r.tenTaiXe || "",
      sdtTaiXe: r.sdtTaiXe || "",
      tenNhaXe: r.tenNhaXe || "",
      sdtNhaXe: r.sdtNhaXe || "",
      createdAt: nowStr,
      updatedAt: nowStr
    };

    if (existingMap.has(rowKey)) {
      const existingIdx = existingMap.get(rowKey);
      const existing = memoryVerificationOrders[existingIdx];
      orderData.createdAt = existing.createdAt;
      memoryVerificationOrders[existingIdx] = orderData;
      updatedCount++;
    } else {
      memoryVerificationOrders.push(orderData);
      existingMap.set(rowKey, memoryVerificationOrders.length - 1);
      insertedCount++;
    }

    if (sqliteEngine) {
      try {
        const stmt = sqliteEngine.prepare(`
          INSERT INTO eir_cancellation_orders (
            row_key, upload_id, file_name, stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
            so_booking, so_container, loai_container, loai_don_hang, size_teus, trang_thai_don_hang,
            trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
            ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, file_nguon, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(row_key) DO UPDATE SET
            upload_id=excluded.upload_id,
            file_name=excluded.file_name,
            trang_thai_don_hang=excluded.trang_thai_don_hang,
            ngay_duoc_duyet=excluded.ngay_duoc_duyet,
            updated_at=excluded.updated_at
        `);
        stmt.run(
          orderData.rowKey, orderData.uploadId, orderData.fileName, orderData.sttFile, orderData.depot,
          orderData.hangTau, orderData.ngayHuyDon, orderData.ngayDuocDuyet, orderData.soBooking,
          orderData.soContainer, orderData.loaiContainer, orderData.loaiDonHang, orderData.sizeTeus,
          orderData.trangThaiDonHang, orderData.trangThaiKichHoat, orderData.thoiGianKichHoat,
          orderData.lyDoHuy, orderData.lyDoTuChoi, orderData.lyDoHuyCheck, orderData.tenTaiXe,
          orderData.sdtTaiXe, orderData.tenNhaXe, orderData.sdtNhaXe, orderData.fileName,
          orderData.createdAt, orderData.updatedAt
        );
      } catch (err) {}
    }
  });

  if (shouldPersist) {
    persistVerificationStore();
  }

  return {
    inserted: insertedCount,
    updated: updatedCount,
    total: memoryVerificationOrders.length
  };
}

function getAllVerificationRecords() {
  loadVerificationFromStore();
  return memoryVerificationOrders;
}

function deleteVerificationRecordsByUploadId(uploadId) {
  memoryVerificationOrders = memoryVerificationOrders.filter(o => o.uploadId !== uploadId);
  persistVerificationStore();
  if (sqliteEngine) {
    try {
      const stmt = sqliteEngine.prepare("DELETE FROM eir_cancellation_orders WHERE upload_id = ?");
      stmt.run(uploadId);
    } catch (e) {}
  }
}

function clearAllVerificationRecords() {
  memoryVerificationOrders = [];
  persistVerificationStore();
  if (sqliteEngine) {
    try {
      sqliteEngine.exec("DELETE FROM eir_cancellation_orders;");
    } catch (e) {}
  }
}

function getVerificationDatabaseStats() {
  if (memoryVerificationOrders.length === 0) {
    loadVerificationFromStore();
  }
  const files = [...new Set(memoryVerificationOrders.map(o => o.fileName).filter(Boolean))];
  const depots = [...new Set(memoryVerificationOrders.map(o => o.depot).filter(Boolean))];
  const totalTeus = memoryVerificationOrders.reduce((sum, o) => sum + (Number(o.sizeTeus) || 0), 0);

  return {
    totalRecords: memoryVerificationOrders.length,
    totalTeus,
    fileCount: files.length,
    depotCount: depots.length,
    files,
    sqlDumpPath: VERIFICATION_SQL_DUMP_PATH
  };
}

/**
 * Chức năng cập nhật dữ liệu đối soát từ Bảng check đơn (eir_cancellation_orders)
 * sang Bảng dữ liệu chi tiết (cancellation_orders)
 *
 * Luồng 1 (Chưa thanh toán):
 * - Xét các đơn có trangThaiDonHang = "Chưa thanh toán" (hoặc chứa "chua thanh toan")
 * - Điều kiện khớp: soBooking, soContainer, Số EIR (chi tiết) = soBooking, soContainer, Số EIR của check đơn (đã bỏ xét ngày được duyệt)
 * - Thay thế dữ liệu chi tiết bằng dữ liệu check đơn (ngoại trừ trangThaiXuLy)
 * - Nếu trangThaiDonHang sau thay thế = "Thanh toán thành công" -> trangThaiXuLy = "Thanh toán thành công" (Trạng thái 1)
 *
 * Luồng 2 (Đã hủy):
 * - Xét các đơn có trangThaiDonHang = "Đã hủy" (hoặc chứa "huy")
 * - Điều kiện khớp: soBooking = soBooking của check đơn,
 *   soContainer check <> soContainer chi tiết,
 *   Ngày phát sinh (check) - Ngày duyệt (chi tiết) > 5 phút (300.000 ms)
 * - Thay thế dữ liệu chi tiết bằng dữ liệu check đơn (số cont mới, ngày duyệt mới...)
 * - Cập nhật trangThaiXuLy:
 *   + Nếu trangThaiDonHang = "Thanh toán thành công" -> "Thanh toán thành công" (Trạng thái 1)
 *   + Nếu trangThaiDonHang <> "Thanh toán thành công" và trangThaiXuLy = null/rỗng -> "Tự động đặt lại" (Trạng thái 8)
 *   + Nếu trangThaiDonHang <> "Thanh toán thành công" và trangThaiXuLy là "Đã liên hệ - Đang chờ" (hoặc "Chờ đặt lại") -> "Đã liên hệ - Đã đặt lại" (Trạng thái 4)
 *
 * Thuật toán: Dòng check đơn sau khi thay thế sẽ bị XÓA khỏi bảng check đơn (eir_cancellation_orders)
 */
function updateOrdersFromCheckData() {
  if (memoryOrders.length === 0) {
    loadAllFromStore();
  }
  if (memoryVerificationOrders.length === 0) {
    loadVerificationFromStore();
  }

  if (memoryVerificationOrders.length === 0) {
    return {
      success: true,
      updatedUnpaid: 0,
      updatedCancelled: 0,
      deletedCheckRows: 0,
      remainingCheckRows: 0,
      updatedRecords: [],
      message: "Không có dữ liệu trong bảng check đơn để thực hiện đối soát."
    };
  }

  const clean = (s) => (s === null || s === undefined ? "" : String(s).trim().toUpperCase());
  
  const parseOrderEirAndCont = (order) => {
    let eir = "";
    let cont = "";
    const raw = (order.soContainer || "").trim();
    if (raw.includes("-")) {
      const parts = raw.split("-");
      eir = parts[0].trim().toUpperCase();
      cont = parts.slice(1).join("-").trim().toUpperCase();
    } else if (raw.toUpperCase().startsWith("EIR")) {
      eir = raw.toUpperCase();
      cont = "";
    } else {
      cont = raw.toUpperCase();
    }
    if (!eir && order.sttFile && String(order.sttFile).toUpperCase().startsWith("EIR")) {
      eir = String(order.sttFile).trim().toUpperCase();
    }
    if (!eir && order.rowKey) {
      const match = String(order.rowKey).match(/EIR\d+/i);
      if (match) eir = match[0].toUpperCase();
    }
    return { eir, cont, rawCont: raw.toUpperCase() };
  };

  const parseCheckEirAndCont = (check) => {
    let eir = (check.sttFile || "").trim().toUpperCase();
    let cont = (check.soContainer || "").trim().toUpperCase();
    if (cont.includes("-")) {
      const parts = cont.split("-");
      if (!eir) eir = parts[0].trim().toUpperCase();
      cont = parts.slice(1).join("-").trim().toUpperCase();
    }
    if (!eir && check.rowKey) {
      const match = String(check.rowKey).match(/EIR\d+/i);
      if (match) eir = match[0].toUpperCase();
    }
    // Nếu soContainer chính là mã EIR (fallback lúc upload) -> xem như chưa có cont thực
    if (cont === eir) {
      cont = "";
    }
    return { eir, cont, rawCont: (check.soContainer || "").trim().toUpperCase() };
  };

  const isSameCont = (orderInfo, checkInfo) => {
    if (orderInfo.cont && checkInfo.cont) {
      return orderInfo.cont === checkInfo.cont;
    }
    // Cả 2 đều chưa có số container cụ thể
    if (!orderInfo.cont && !checkInfo.cont) {
      return true;
    }
    if (orderInfo.rawCont && orderInfo.rawCont === checkInfo.rawCont) {
      return true;
    }
    // Đơn gốc ban đầu cont rỗng và check có cont trên cùng mã EIR
    if (!orderInfo.cont && checkInfo.cont && isSameEir(orderInfo, checkInfo)) {
      return true;
    }
    return false;
  };

  const isSameEir = (orderInfo, checkInfo) => {
    if (orderInfo.eir && checkInfo.eir) {
      return orderInfo.eir === checkInfo.eir;
    }
    return false;
  };

  const isDiffEir = (orderInfo, checkInfo) => {
    if (orderInfo.eir && checkInfo.eir) {
      return orderInfo.eir !== checkInfo.eir;
    }
    return Boolean(orderInfo.eir || checkInfo.eir);
  };

  const extractDateParts = (dateStr) => {
    if (!dateStr) return null;
    const str = String(dateStr).trim().replace("T", " ");
    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      return {
        y: parseInt(isoMatch[1], 10),
        m: parseInt(isoMatch[2], 10),
        d: parseInt(isoMatch[3], 10),
        h: parseInt(isoMatch[4] || "0", 10),
        min: parseInt(isoMatch[5] || "0", 10),
        s: parseInt(isoMatch[6] || "0", 10)
      };
    }
    const vnMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (vnMatch) {
      return {
        y: parseInt(vnMatch[3], 10),
        m: parseInt(vnMatch[2], 10),
        d: parseInt(vnMatch[1], 10),
        h: parseInt(vnMatch[4] || "0", 10),
        min: parseInt(vnMatch[5] || "0", 10),
        s: parseInt(vnMatch[6] || "0", 10)
      };
    }
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      const dt = new Date(parsed);
      return {
        y: dt.getUTCFullYear(),
        m: dt.getUTCMonth() + 1,
        d: dt.getUTCDate(),
        h: dt.getUTCHours(),
        min: dt.getUTCMinutes(),
        s: dt.getUTCSeconds()
      };
    }
    return null;
  };

  const parseDateMs = (dateStr) => {
    const p = extractDateParts(dateStr);
    if (!p) return null;
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  };

  const isSameDate = (d1, d2) => {
    if (!d1 && !d2) return true;
    if (!d1 || !d2) return false;
    if (String(d1).trim() === String(d2).trim()) return true;
    const p1 = extractDateParts(d1);
    const p2 = extractDateParts(d2);
    if (p1 && p2) {
      if (p1.y === p2.y && ((p1.m === p2.m && p1.d === p2.d) || (p1.m === p2.d && p1.d === p2.m))) {
        const diffH = Math.abs((p1.h * 60 + p1.min) - (p2.h * 60 + p2.min));
        return diffH < 2;
      }
    }
    const t1 = parseDateMs(d1);
    const t2 = parseDateMs(d2);
    if (t1 !== null && t2 !== null) {
      return Math.abs(t1 - t2) < 60000;
    }
    return false;
  };

  const diffMinutes = (checkPhatSinhStr, orderDuyetStr) => {
    const pCheck = extractDateParts(checkPhatSinhStr);
    const pOrder = extractDateParts(orderDuyetStr);
    if (!pCheck || !pOrder) return -999;

    let y1 = pCheck.y, m1 = pCheck.m, d1 = pCheck.d;
    let y2 = pOrder.y, m2 = pOrder.m, d2 = pOrder.d;

    // Tự động nhận diện và xử lý đảo ngược tháng / ngày (DD-MM vs MM-DD)
    if (y1 === y2 && m1 === d2 && d1 === m2) {
      m1 = m2;
      d1 = d2;
    }

    const tCheck = Date.UTC(y1, m1 - 1, d1, pCheck.h, pCheck.min, pCheck.s);
    const tOrder = Date.UTC(y2, m2 - 1, d2, pOrder.h, pOrder.min, pOrder.s);
    return (tCheck - tOrder) / (60 * 1000);
  };

  const isUnpaid = (val) => {
    if (!val) return false;
    const s = String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
    return s.includes("chua thanh toan") || s.includes("cho thanh toan");
  };

  const isCancelled = (val) => {
    if (!val) return false;
    const s = String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
    return s.includes("da huy") || s === "huy" || s.includes("tu choi duyet");
  };

  const isSuccessPayment = (val) => {
    if (!val) return false;
    const s = String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
    return s.includes("thanh toan thanh cong") || s.includes("thanh cong") || s.includes("da thanh toan") || s.includes("hoan thanh");
  };

  const usedCheckKeys = new Set();
  const updatedRecords = [];
  let updatedUnpaid = 0;
  let updatedCancelled = 0;
  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

  // 1. Duyệt qua từng đơn hàng trong memoryOrders
  memoryOrders.forEach(order => {
    const orderBooking = clean(order.soBooking);
    if (!orderBooking) return;
    const orderInfo = parseOrderEirAndCont(order);

    // --- LUỒNG 1: TRÙNG SỐ EIR (Cùng mã EIR - Cập nhật trạng thái mới nhất từ bảng check) ---
    const sameEirIndex = memoryVerificationOrders.findIndex(check => {
      if (usedCheckKeys.has(check.rowKey)) return false;
      if (clean(check.soBooking) !== orderBooking) return false;
      const checkInfo = parseCheckEirAndCont(check);
      // Trùng mã EIR
      if (orderInfo.eir && checkInfo.eir && orderInfo.eir === checkInfo.eir) return true;
      // Hoặc trùng container thực tế trên cùng booking
      if (orderInfo.cont && checkInfo.cont && orderInfo.cont === checkInfo.cont) return true;
      return false;
    });

    if (sameEirIndex !== -1) {
      const check = memoryVerificationOrders[sameEirIndex];
      const checkInfo = parseCheckEirAndCont(check);
      usedCheckKeys.add(check.rowKey);

      // Cập nhật số container mang mã EIR từ bảng check đơn
      if (checkInfo.eir) {
        order.soContainer = checkInfo.cont ? `${checkInfo.eir}-${checkInfo.cont}` : `${checkInfo.eir}-`;
      } else if (check.soContainer) {
        order.soContainer = check.soContainer;
      }

      if (order.isAutoCancelledBy3h) {
        order.isAutoCancelledBy3h = false;
      }

      if (check.depot) order.depot = check.depot;
      if (check.hangTau) order.hangTau = check.hangTau;
      if (check.ngayHuyDon) order.ngayHuyDon = check.ngayHuyDon;
      if (check.ngayDuocDuyet) order.ngayDuocDuyet = check.ngayDuocDuyet;
      if (check.loaiContainer) order.loaiContainer = check.loaiContainer;
      if (check.loaiDonHang) order.loaiDonHang = check.loaiDonHang;
      if (check.sizeTeus !== undefined && check.sizeTeus !== null) order.sizeTeus = Number(check.sizeTeus) || 0;
      if (check.trangThaiDonHang) order.trangThaiDonHang = check.trangThaiDonHang;
      if (check.trangThaiKichHoat) order.trangThaiKichHoat = check.trangThaiKichHoat;
      if (check.thoiGianKichHoat) order.thoiGianKichHoat = check.thoiGianKichHoat;
      if (check.lyDoHuy) order.lyDoHuy = check.lyDoHuy;
      if (check.lyDoTuChoi) order.lyDoTuChoi = check.lyDoTuChoi;
      if (check.lyDoHuyCheck) order.lyDoHuyCheck = check.lyDoHuyCheck;
      if (check.tenTaiXe) order.tenTaiXe = check.tenTaiXe;
      if (check.sdtTaiXe) order.sdtTaiXe = check.sdtTaiXe;
      if (check.tenNhaXe) order.tenNhaXe = check.tenNhaXe;
      if (check.sdtNhaXe) order.sdtNhaXe = check.sdtNhaXe;
      order.updatedAt = nowStr;

      // Nếu Trạng thái đơn sau thay thế = Thanh toán thành công -> cập nhật trạng thái CSKH = Thanh toán thành công
      if (isSuccessPayment(order.trangThaiDonHang)) {
        order.trangThaiXuLy = "Thanh toán thành công";
      }

      updatedUnpaid++;
      updatedRecords.push({
        rowKey: order.rowKey,
        stt: order.stt,
        soBooking: order.soBooking,
        soContainer: order.soContainer,
        trangThaiXuLy: order.trangThaiXuLy
      });
      return;
    }

    // --- LUỒNG 2: ĐƠN ĐẶT LẠI (Khác số EIR trên cùng Booking) ---
    const canRebook = isCancelled(order.trangThaiDonHang) || isUnpaid(order.trangThaiDonHang) || order.isAutoCancelledBy3h;
    if (canRebook) {
      const diffEirIndex = memoryVerificationOrders.findIndex(check => {
        if (usedCheckKeys.has(check.rowKey)) return false;
        if (clean(check.soBooking) !== orderBooking) return false;
        const checkInfo = parseCheckEirAndCont(check);
        // Khác mã EIR (chứng minh tài xế đã tạo đơn EIR mới cho cùng Booking)
        return Boolean(checkInfo.eir && orderInfo.eir !== checkInfo.eir);
      });

      if (diffEirIndex !== -1) {
        const check = memoryVerificationOrders[diffEirIndex];
        const checkInfo = parseCheckEirAndCont(check);
        usedCheckKeys.add(check.rowKey);

        // Cập nhật số container mang mã EIR mới từ bảng check đơn
        if (checkInfo.eir) {
          order.soContainer = checkInfo.cont ? `${checkInfo.eir}-${checkInfo.cont}` : `${checkInfo.eir}-`;
        } else if (check.soContainer) {
          order.soContainer = check.soContainer;
        }

        if (order.isAutoCancelledBy3h) {
          order.isAutoCancelledBy3h = false;
        }

        if (check.depot) order.depot = check.depot;
        if (check.hangTau) order.hangTau = check.hangTau;
        if (check.ngayHuyDon) order.ngayHuyDon = check.ngayHuyDon;
        if (check.ngayDuocDuyet) order.ngayDuocDuyet = check.ngayDuocDuyet;
        if (check.loaiContainer) order.loaiContainer = check.loaiContainer;
        if (check.loaiDonHang) order.loaiDonHang = check.loaiDonHang;
        if (check.sizeTeus !== undefined && check.sizeTeus !== null) order.sizeTeus = Number(check.sizeTeus) || 0;
        if (check.trangThaiDonHang) order.trangThaiDonHang = check.trangThaiDonHang;
        if (check.trangThaiKichHoat) order.trangThaiKichHoat = check.trangThaiKichHoat;
        if (check.thoiGianKichHoat) order.thoiGianKichHoat = check.thoiGianKichHoat;
        if (check.lyDoHuy) order.lyDoHuy = check.lyDoHuy;
        if (check.lyDoTuChoi) order.lyDoTuChoi = check.lyDoTuChoi;
        if (check.lyDoHuyCheck) order.lyDoHuyCheck = check.lyDoHuyCheck;
        if (check.tenTaiXe) order.tenTaiXe = check.tenTaiXe;
        if (check.sdtTaiXe) order.sdtTaiXe = check.sdtTaiXe;
        if (check.tenNhaXe) order.tenNhaXe = check.tenNhaXe;
        if (check.sdtNhaXe) order.sdtNhaXe = check.sdtNhaXe;
        order.updatedAt = nowStr;

        const isSucc = isSuccessPayment(order.trangThaiDonHang);
        const currXuLy = order.trangThaiXuLy ? String(order.trangThaiXuLy).trim() : "";

        if (isSucc) {
          order.trangThaiXuLy = "Thanh toán thành công";
        } else if (!currXuLy || currXuLy === "null" || currXuLy === "undefined") {
          order.trangThaiXuLy = "Tự động đặt lại";
        } else if (
          currXuLy === "Đã liên hệ - Đang chờ" || 
          currXuLy === "Đã liên hệ - Chờ" || 
          currXuLy === "Đã liên hệ - Chờ đặt lại"
        ) {
          order.trangThaiXuLy = "Đã liên hệ - Đã đặt lại";
        }

        updatedCancelled++;
        updatedRecords.push({
          rowKey: order.rowKey,
          stt: order.stt,
          soBooking: order.soBooking,
          soContainer: order.soContainer,
          trangThaiXuLy: order.trangThaiXuLy
        });
        return;
      }
    }
  });

  const deletedCount = usedCheckKeys.size;

  // 2. Xóa các dòng check đơn đã được thay thế khỏi bảng eir_cancellation_orders
  if (deletedCount > 0) {
    memoryVerificationOrders = memoryVerificationOrders.filter(o => !usedCheckKeys.has(o.rowKey));
    persistVerificationStore();

    if (sqliteEngine) {
      try {
        const stmtDel = sqliteEngine.prepare("DELETE FROM eir_cancellation_orders WHERE row_key = ?");
        for (const k of usedCheckKeys) {
          stmtDel.run(k);
        }
      } catch (err) {
        console.warn("Lỗi khi xóa dòng eir_cancellation_orders trong SQLite:", err.message);
      }
    }
  }

  // 3. Lưu trữ cập nhật cho bảng cancellation_orders
  if (updatedUnpaid > 0 || updatedCancelled > 0) {
    persistStore();

    if (sqliteEngine) {
      try {
        const stmtUpdate = sqliteEngine.prepare(`
          UPDATE cancellation_orders 
          SET depot = ?, hang_tau = ?, ngay_huy_don = ?, ngay_duoc_duyet = ?,
              so_booking = ?, so_container = ?, loai_container = ?, loai_don_hang = ?,
              size_teus = ?, trang_thai_don_hang = ?, trang_thai_kich_hoat = ?,
              thoi_gian_kich_hoat = ?, ly_do_huy = ?, ly_do_tu_choi = ?, ten_tai_xe = ?,
              sdt_tai_xe = ?, ten_nha_xe = ?, sdt_nha_xe = ?, trang_thai_xu_ly = ?,
              updated_at = ?
          WHERE row_key = ?
        `);
        memoryOrders.forEach(o => {
          stmtUpdate.run(
            o.depot, o.hangTau, o.ngayHuyDon, o.ngayDuocDuyet,
            o.soBooking, o.soContainer, o.loaiContainer, o.loaiDonHang,
            Number(o.sizeTeus) || 0, o.trangThaiDonHang, o.trangThaiKichHoat,
            o.thoiGianKichHoat, o.lyDoHuy, o.lyDoTuChoi, o.tenTaiXe,
            o.sdtTaiXe, o.tenNhaXe, o.sdtNhaXe, o.trangThaiXuLy,
            o.updatedAt, o.rowKey
          );
        });
      } catch (err) {
        console.warn("Lỗi cập nhật SQLite cancellation_orders:", err.message);
      }
    }

    if (supabaseClient) {
      syncAllToSupabase().catch(() => {});
    }
  }

  return {
    success: true,
    updatedUnpaid,
    updatedCancelled,
    deletedCheckRows: deletedCount,
    remainingCheckRows: memoryVerificationOrders.length,
    updatedRecords,
    usedCheckKeys: Array.from(usedCheckKeys),
    message: `Đã cập nhật thành công ${updatedUnpaid} đơn Chưa thanh toán và ${updatedCancelled} đơn Đã hủy. Đã xóa ${deletedCount} dòng khỏi bảng check đơn.`
  };
}

/**
 * Lọc đơn trùng theo số EIR:
 * Khi phát hiện có số EIR trùng nhau, tự động giữ lại dòng có Ngày được duyệt lớn nhất (mới nhất),
 * và tự động xóa đi dòng dữ liệu có Ngày được duyệt bé hơn.
 */
function deduplicateOrdersByEir() {
  if (!memoryOrders || memoryOrders.length === 0) {
    return {
      success: true,
      duplicatesFound: 0,
      deletedCount: 0,
      remainingCount: 0,
      deletedRecords: [],
      message: "Không có dữ liệu đơn hàng trong hệ thống để thực hiện lọc trùng."
    };
  }

  const extractDatePartsLocal = (dateStr) => {
    if (!dateStr) return null;
    const str = String(dateStr).trim().replace("T", " ");
    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      return {
        y: parseInt(isoMatch[1], 10),
        m: parseInt(isoMatch[2], 10),
        d: parseInt(isoMatch[3], 10),
        h: parseInt(isoMatch[4] || "0", 10),
        min: parseInt(isoMatch[5] || "0", 10),
        s: parseInt(isoMatch[6] || "0", 10)
      };
    }
    const vnMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (vnMatch) {
      return {
        y: parseInt(vnMatch[3], 10),
        m: parseInt(vnMatch[2], 10),
        d: parseInt(vnMatch[1], 10),
        h: parseInt(vnMatch[4] || "0", 10),
        min: parseInt(vnMatch[5] || "0", 10),
        s: parseInt(vnMatch[6] || "0", 10)
      };
    }
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      const dt = new Date(parsed);
      return {
        y: dt.getUTCFullYear(),
        m: dt.getUTCMonth() + 1,
        d: dt.getUTCDate(),
        h: dt.getUTCHours(),
        min: dt.getUTCMinutes(),
        s: dt.getUTCSeconds()
      };
    }
    return null;
  };

  const getTimestampMs = (order) => {
    const dateStr = order.ngayDuocDuyet || order.ngayHuyDon || order.createdAt || "";
    if (!dateStr) return 0;
    const p = extractDatePartsLocal(dateStr);
    if (!p) {
      const ms = Date.parse(dateStr);
      return isNaN(ms) ? 0 : ms;
    }
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  };

  // 1. Nhóm các đơn hàng theo mã số EIR
  const eirGroupMap = new Map();

  memoryOrders.forEach(order => {
    let eir = "";
    const rawCont = (order.soContainer || "").trim();
    if (rawCont.includes("-")) {
      eir = rawCont.split("-")[0].trim().toUpperCase();
    } else if (rawCont.toUpperCase().startsWith("EIR")) {
      eir = rawCont.toUpperCase();
    }
    if (!eir && order.sttFile && String(order.sttFile).toUpperCase().startsWith("EIR")) {
      eir = String(order.sttFile).trim().toUpperCase();
    }
    if (!eir && order.rowKey) {
      const match = String(order.rowKey).match(/EIR\d+/i);
      if (match) eir = match[0].toUpperCase();
    }

    if (!eir) return; // Bỏ qua đơn không có mã EIR hợp lệ

    if (!eirGroupMap.has(eir)) {
      eirGroupMap.set(eir, []);
    }
    eirGroupMap.get(eir).push(order);
  });

  const toDeleteKeys = new Set();
  const deletedRecords = [];
  let duplicatesFound = 0;

  // 2. Lặp qua các nhóm trùng để tìm dòng có Ngày được duyệt lớn nhất
  eirGroupMap.forEach((orders, eir) => {
    if (orders.length <= 1) return;

    duplicatesFound++;

    // Sắp xếp giảm dần theo mốc thời gian: lớn nhất (mới nhất) lên đầu
    orders.sort((a, b) => {
      const timeA = getTimestampMs(a);
      const timeB = getTimestampMs(b);
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      // Nếu thời gian duyệt bằng nhau, so sánh thời điểm cập nhật hoặc STT
      const updA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const updB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (updA !== updB) return updB - updA;
      return (Number(b.stt) || 0) - (Number(a.stt) || 0);
    });

    // Phần tử đầu tiên (index 0) là dòng có Ngày được duyệt lớn nhất -> GIỮ LẠI
    // Các phần tử từ index 1 trở đi có Ngày được duyệt bé hơn -> XÓA
    for (let i = 1; i < orders.length; i++) {
      const delOrder = orders[i];
      toDeleteKeys.add(delOrder.rowKey);
      deletedRecords.push({
        eir,
        rowKey: delOrder.rowKey,
        soBooking: delOrder.soBooking,
        soContainer: delOrder.soContainer,
        ngayDuocDuyet: delOrder.ngayDuocDuyet || delOrder.ngayHuyDon,
        stt: delOrder.stt
      });
    }
  });

  const deletedCount = toDeleteKeys.size;

  // 3. Thực hiện xóa bản ghi
  if (deletedCount > 0) {
    memoryOrders = memoryOrders.filter(o => !toDeleteKeys.has(o.rowKey));

    if (sqliteEngine) {
      try {
        const stmtDelete = sqliteEngine.prepare("DELETE FROM cancellation_orders WHERE row_key = ?");
        for (const key of toDeleteKeys) {
          stmtDelete.run(key);
        }
      } catch (err) {
        console.warn("Lỗi khi xóa đơn trùng trong SQLite:", err.message);
      }
    }

    persistStore();

    if (supabaseClient) {
      supabaseClient.syncOrdersToSupabase(memoryOrders).catch(() => {});
    }
  }

  return {
    success: true,
    duplicatesFound,
    deletedCount,
    remainingCount: memoryOrders.length,
    deletedRecords,
    message: deletedCount > 0 
      ? `Đã lọc thành công: Phát hiện ${duplicatesFound} cụm trùng số EIR, đã xóa ${deletedCount} dòng có ngày duyệt bé hơn. Còn lại ${memoryOrders.length} đơn.`
      : "Hệ thống không phát hiện đơn nào trùng số EIR."
  };
}

/**
 * Thêm một đơn hàng thủ công vào cơ sở dữ liệu
 */
function insertManualOrder(orderData) {
  const now = new Date();
  const nowStr = now.toISOString().replace("T", " ").substring(0, 19);

  // Tính số thứ tự mới
  let maxStt = 0;
  memoryOrders.forEach(o => {
    const n = parseInt(o.stt, 10);
    if (!isNaN(n) && n > maxStt) maxStt = n;
  });
  const newStt = String(maxStt + 1);

  // Ghép nối số Container và EIR nếu người dùng nhập riêng hoặc chung
  let soContainer = (orderData.soContainer || "").trim().toUpperCase();
  const soEir = (orderData.soEir || "").trim().toUpperCase();
  if (soEir && !soContainer.includes(soEir)) {
    if (soContainer) {
      soContainer = `${soEir}-${soContainer}`;
    } else {
      soContainer = `${soEir}-`;
    }
  }

  // Tạo manualId duy nhất để đảm bảo rowKey không bị xung đột
  // khi người dùng nhập nhiều đơn thiếu Container/Booking
  const manualId = `MANUAL_${Date.now()}`;

  const record = {
    stt: orderData.stt ? String(orderData.stt).trim() : newStt,
    depot: (orderData.depot || "BSD").trim().toUpperCase(),
    hangTau: (orderData.hangTau || "N/A").trim().toUpperCase(),
    ngayHuyDon: orderData.ngayHuyDon ? String(orderData.ngayHuyDon).trim() : "",
    ngayDuocDuyet: orderData.ngayDuocDuyet ? String(orderData.ngayDuocDuyet).trim() : "",
    soBooking: (orderData.soBooking || "").trim().toUpperCase(),
    soContainer: soContainer,
    trangThaiDonHang: (orderData.trangThaiDonHang || "Chưa thanh toán").trim(),
    trangThaiKichHoat: (orderData.trangThaiKichHoat || "Chưa kích hoạt").trim(),
    thoiGianKichHoat: orderData.thoiGianKichHoat ? String(orderData.thoiGianKichHoat).trim() : "",
    lyDoHuy: (orderData.lyDoHuy || "Không có lý do").trim(),
    loaiContainer: (orderData.loaiContainer || "Cont 20' DC").trim(),
    loaiDonHang: (orderData.loaiDonHang || "IN").trim().toUpperCase(),
    sizeTeus: Number(orderData.sizeTeus) || (orderData.loaiContainer && String(orderData.loaiContainer).includes("40") ? 2 : 1),
    tenTaiXe: (orderData.tenTaiXe || "").trim(),
    sdtTaiXe: (orderData.sdtTaiXe || "").trim(),
    tenNhaXe: (orderData.tenNhaXe || "").trim(),
    sdtNhaXe: (orderData.sdtNhaXe || "").trim(),
    lyDoTuChoi: (orderData.lyDoTuChoi || "").trim(),
    trangThaiXuLy: (orderData.trangThaiXuLy || "").trim(),
    giaiTrinh: (orderData.giaiTrinh || "").trim(),
    // Khi không có Container/Booking, dùng manualId để rowKey không bị trùng
    _manualId: (!soContainer && !orderData.soBooking) ? manualId : undefined
  };

  const metadata = {
    uploadId: `MANUAL-${Date.now()}`,
    fileName: "nhap_thu_cong",
    uploadedAt: nowStr
  };

  const res = insertRecords([record], metadata, true);
  return {
    success: true,
    record,
    total: res.total,
    message: "Đã thêm đơn hàng thủ công thành công!"
  };
}

/**
 * =========================================================================
 * ASYNC METHODS DÀNH CHO MÔI TRƯỜNG VERCEL SERVERLESS & TURSO CLOUD SQLITE
 * =========================================================================
 */

async function getAllRecordsAsync() {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const tursoRows = await tursoClient.getAllOrdersFromTurso();
      if (Array.isArray(tursoRows) && tursoRows.length > 0) {
        memoryOrders = tursoRows;
        applyExpired3hCancellation(memoryOrders);
        return memoryOrders.map((o, idx) => ({
          ...o,
          stt: String(idx + 1)
        }));
      }
    } catch (e) {
      console.warn("[Turso] Không thể đọc từ Turso, sử dụng memory store fallback:", e.message);
    }
  }
  return getAllRecords();
}

async function insertRecordsAsync(records, metadata = {}) {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const tursoRows = await tursoClient.getAllOrdersFromTurso();
      if (Array.isArray(tursoRows) && tursoRows.length > 0) {
        memoryOrders = tursoRows;
      }
    } catch (e) {}
  }

  const res = insertRecords(records, metadata, false);

  if (tursoClient) {
    try {
      await tursoClient.syncOrdersToTurso(memoryOrders);
    } catch (e) {
      console.error("[Turso] Lỗi đồng bộ orders lên Turso:", e.message);
    }
  }

  try {
    persistStore();
  } catch (e) {}

  return {
    ...res,
    total: memoryOrders.length
  };
}

async function updateOrderNoteAsync(rowKey, noteData = {}) {
  const res = updateOrderNote(rowKey, noteData);
  if (tursoClient) {
    try {
      await tursoClient.updateOrderNoteInTurso(rowKey, noteData);
    } catch (e) {}
  }
  return res;
}

async function deleteRecordsByUploadIdAsync(uploadId) {
  deleteRecordsByUploadId(uploadId);
  if (tursoClient) {
    try {
      await tursoClient.deleteOrdersByUploadIdInTurso(uploadId);
    } catch (e) {}
  }
}

async function clearDatabaseAsync() {
  clearDatabase();
  if (tursoClient) {
    try {
      await tursoClient.clearAllOrdersInTurso();
    } catch (e) {}
  }
}

async function getAllVerificationRecordsAsync() {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const tursoRows = await tursoClient.getAllVerificationOrdersFromTurso();
      if (Array.isArray(tursoRows) && tursoRows.length > 0) {
        memoryVerificationOrders = tursoRows;
        return memoryVerificationOrders;
      }
    } catch (e) {
      console.warn("[Turso] Không thể đọc verification từ Turso:", e.message);
    }
  }
  return getAllVerificationRecords();
}

async function insertVerificationRecordsAsync(records, metadata = {}) {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const tursoRows = await tursoClient.getAllVerificationOrdersFromTurso();
      if (Array.isArray(tursoRows) && tursoRows.length > 0) {
        memoryVerificationOrders = tursoRows;
      }
    } catch (e) {}
  }

  const res = insertVerificationRecords(records, metadata, false);

  if (tursoClient) {
    try {
      await tursoClient.syncVerificationOrdersToTurso(memoryVerificationOrders);
    } catch (e) {
      console.error("[Turso] Lỗi đồng bộ verification orders lên Turso:", e.message);
    }
  }

  try {
    persistVerificationStore();
  } catch (e) {}

  return {
    ...res,
    total: memoryVerificationOrders.length
  };
}

async function deleteVerificationRecordsByUploadIdAsync(uploadId) {
  deleteVerificationRecordsByUploadId(uploadId);
  if (tursoClient) {
    try {
      await tursoClient.deleteVerificationOrdersByUploadIdInTurso(uploadId);
    } catch (e) {}
  }
}

async function clearAllVerificationRecordsAsync() {
  clearAllVerificationRecords();
  if (tursoClient) {
    try {
      await tursoClient.clearAllVerificationOrdersInTurso();
    } catch (e) {}
  }
}

async function updateOrdersFromCheckDataAsync() {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const [orders, verOrders] = await Promise.all([
        tursoClient.getAllOrdersFromTurso(),
        tursoClient.getAllVerificationOrdersFromTurso()
      ]);
      if (Array.isArray(orders) && orders.length > 0) memoryOrders = orders;
      if (Array.isArray(verOrders)) memoryVerificationOrders = verOrders;
    } catch (e) {
      console.warn("[Turso] Lỗi tải dữ liệu đối soát:", e.message);
    }
  }

  const res = updateOrdersFromCheckData();

  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const syncPromises = [];
      if (res.updatedUnpaid > 0 || res.updatedCancelled > 0) {
        syncPromises.push(tursoClient.syncOrdersToTurso(memoryOrders));
      }
      if (res.usedCheckKeys && res.usedCheckKeys.length > 0) {
        syncPromises.push(tursoClient.deleteVerificationOrderRowsInTurso(res.usedCheckKeys));
      }
      if (syncPromises.length > 0) {
        await Promise.all(syncPromises);
      }
    } catch (e) {
      console.error("[Turso] Lỗi đồng bộ sau đối soát:", e.message);
    }
  }

  return res;
}

async function deduplicateOrdersByEirAsync() {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const orders = await tursoClient.getAllOrdersFromTurso();
      if (Array.isArray(orders) && orders.length > 0) memoryOrders = orders;
    } catch (e) {}
  }

  const res = deduplicateOrdersByEir();

  if (tursoClient) {
    try {
      await tursoClient.syncOrdersToTurso(memoryOrders);
    } catch (e) {}
  }

  return res;
}

async function insertManualOrderAsync(orderData) {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const orders = await tursoClient.getAllOrdersFromTurso();
      if (Array.isArray(orders) && orders.length > 0) memoryOrders = orders;
    } catch (e) {}
  }

  const res = insertManualOrder(orderData);

  if (tursoClient) {
    try {
      await tursoClient.syncOrdersToTurso(memoryOrders);
    } catch (e) {}
  }

  return res;
}

// Khởi chạy nạp dữ liệu kiểm tra đơn từ store
loadVerificationFromStore();

module.exports = {
  insertRecords,
  insertRecordsAsync,
  getAllRecords,
  getAllRecordsAsync,
  updateOrderNote,
  updateOrderNoteAsync,
  getDatabaseStats,
  generateSqlDumpFile,
  clearDatabase,
  clearDatabaseAsync,
  deleteRecordsByUploadId,
  deleteRecordsByUploadIdAsync,
  syncAllToSupabase,
  SQL_DUMP_PATH,
  insertVerificationRecords,
  insertVerificationRecordsAsync,
  getAllVerificationRecords,
  getAllVerificationRecordsAsync,
  deleteVerificationRecordsByUploadId,
  deleteVerificationRecordsByUploadIdAsync,
  clearAllVerificationRecords,
  clearAllVerificationRecordsAsync,
  getVerificationDatabaseStats,
  VERIFICATION_SQL_DUMP_PATH,
  updateOrdersFromCheckData,
  updateOrdersFromCheckDataAsync,
  deduplicateOrdersByEir,
  deduplicateOrdersByEirAsync,
  insertManualOrder,
  insertManualOrderAsync
};
