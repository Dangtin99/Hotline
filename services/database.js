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
const crypto = require("crypto");

// Fix #6: Hàng đợi thực thi ghi dữ liệu để phòng chống race condition khi upload đồng thời
let _dbWriteQueue = Promise.resolve();
function enqueueDbWrite(fn) {
  const next = _dbWriteQueue.then(() => fn(), () => fn());
  _dbWriteQueue = next.catch(() => {});
  return next;
}

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_SQLITE_PATH = path.join(DATA_DIR, "cancellation_orders.db");
const DB_JSON_PATH = path.join(DATA_DIR, "cancellation_orders.json");
const SQL_DUMP_PATH = path.join(DATA_DIR, "cancellation_orders.sql");
const HISTORY_FILE = path.join(DATA_DIR, "upload_history.json");
const VERIFICATION_JSON_PATH = path.join(DATA_DIR, "verification_orders.json");
const VERIFICATION_SQL_DUMP_PATH = path.join(DATA_DIR, "eir_cancellation_orders.sql");

const { applyExpired3hCancellation } = require("./cancellationAnalyzer");

/**
 * Định dạng thời gian theo múi giờ chuẩn Việt Nam (Asia/Ho_Chi_Minh, GMT+7)
 * Cấu trúc ngày: DD/MM/YYYY HH:mm:ss
 */
function formatToVietnamParts(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(dateObj);
  const p = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

function formatVietnamDateTime(val = new Date(), id) {
  if (id && /^UP-(\d{12,14})$/.test(String(id).trim())) {
    const ms = Number(String(id).trim().replace("UP-", ""));
    if (!isNaN(ms)) {
      return formatToVietnamParts(new Date(ms));
    }
  }
  if (!val) return "";
  if (val instanceof Date || typeof val === "number") {
    return formatToVietnamParts(new Date(val));
  }
  const str = String(val).trim();
  if (str.includes("T") || str.endsWith("Z")) {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      return formatToVietnamParts(dt);
    }
  }
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ymdMatch) {
    const time = ymdMatch[4] !== undefined
      ? ` ${ymdMatch[4].padStart(2, "0")}:${ymdMatch[5].padStart(2, "0")}:${(ymdMatch[6] || "00").padStart(2, "0")}`
      : "";
    return `${ymdMatch[3].padStart(2, "0")}/${ymdMatch[2].padStart(2, "0")}/${ymdMatch[1]}${time}`;
  }
  return str;
}

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
    CREATE INDEX IF NOT EXISTS idx_cancellation_ngay_huy ON cancellation_orders(ngay_huy_don);
    CREATE INDEX IF NOT EXISTS idx_cancellation_ngay_duyet ON cancellation_orders(ngay_duoc_duyet);

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
      nguoi_tao TEXT,
      so_xe TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_eir_depot ON eir_cancellation_orders(depot);
    CREATE INDEX IF NOT EXISTS idx_eir_hang_tau ON eir_cancellation_orders(hang_tau);
    CREATE INDEX IF NOT EXISTS idx_eir_trang_thai ON eir_cancellation_orders(trang_thai_don_hang);
    CREATE INDEX IF NOT EXISTS idx_eir_booking_container ON eir_cancellation_orders(so_booking, so_container);

    -- 3. Bảng order_operational_state: Tách riêng trạng thái CSKH, Giải trình, và Cờ Pending
    CREATE TABLE IF NOT EXISTS order_operational_state (
      row_key TEXT PRIMARY KEY,
      cskh_status TEXT DEFAULT '',
      explanation TEXT DEFAULT '',
      is_pending INTEGER DEFAULT 0,
      pending_at TEXT,
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_op_pending ON order_operational_state(is_pending);

    -- 4. Bảng order_status_audit_log: Lịch sử thay đổi trạng thái CSKH / Giải trình / Pending
    CREATE TABLE IF NOT EXISTS order_status_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_key TEXT,
      action TEXT,
      old_status TEXT,
      new_status TEXT,
      old_explanation TEXT,
      new_explanation TEXT,
      changed_by TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_rowkey ON order_status_audit_log(row_key);

    -- 5. Các bảng Danh mục (Master Dimension Tables)
    CREATE TABLE IF NOT EXISTS dim_depots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS dim_shipping_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS dim_container_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      size_teus REAL DEFAULT 1.0,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS system_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Composite Indexes tối ưu truy vấn
    CREATE INDEX IF NOT EXISTS idx_cancel_depot_date ON cancellation_orders(depot, ngay_huy_don DESC);
    CREATE INDEX IF NOT EXISTS idx_cancel_book_cont ON cancellation_orders(so_booking, so_container);
  `);
  try { sqliteEngine.prepare("ALTER TABLE cancellation_orders ADD COLUMN giai_trinh_chi_tiet TEXT;").run(); } catch (e) {}
  try { sqliteEngine.prepare("ALTER TABLE cancellation_orders ADD COLUMN nguoi_tao TEXT;").run(); } catch (e) {}
  try { sqliteEngine.prepare("ALTER TABLE cancellation_orders ADD COLUMN so_xe TEXT;").run(); } catch (e) {}
  try { sqliteEngine.prepare("ALTER TABLE order_operational_state ADD COLUMN explanation_detail TEXT;").run(); } catch (e) {}
  try { sqliteEngine.prepare("ALTER TABLE eir_cancellation_orders ADD COLUMN nguoi_tao TEXT;").run(); } catch (e) {}
  try { sqliteEngine.prepare("ALTER TABLE eir_cancellation_orders ADD COLUMN so_xe TEXT;").run(); } catch (e) {}
  console.log("Đã kết nối cơ sở dữ liệu SQLite thành công (cancellation_orders.db)");
} catch (e) {
  console.log("Sử dụng File-backed SQL Store & Đồng bộ hóa SQL Dump script:", e.message);
  sqliteEngine = null;
}

// Quản lý bộ nhớ đệm và dữ liệu đồng bộ
let memoryOrders = [];
let memoryOpMap = {};
let operationalVersion = Date.now();
let lastVersionFetchTime = 0;
let lastOrdersCachedVersion = 0;
let lastOpMapCachedVersion = 0;
const VERSION_CACHE_TTL_MS = 2500; // Bộ đệm 2.5s giảm tải I/O Turso khi polling 5s

function bumpOperationalVersion() {
  operationalVersion = Date.now();
  lastVersionFetchTime = operationalVersion;

  if (sqliteEngine) {
    try {
      sqliteEngine.prepare(`
        INSERT INTO system_metadata (key, value, updated_at)
        VALUES ('operational_version', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(String(operationalVersion));
    } catch (e) {}
  }

  if (tursoClient && tursoClient.isTursoAvailable()) {
    tursoClient.bumpOperationalVersionInTurso().catch(() => {});
  }

  return operationalVersion;
}

function getOperationalVersion() {
  return operationalVersion;
}

async function getOperationalVersionAsync() {
  const now = Date.now();
  // Nếu trong khoảng 2.5s từ lần kiểm tra trước, dùng bộ nhớ đệm RAM để phản hồi siêu tốc (< 1ms)
  if (now - lastVersionFetchTime < VERSION_CACHE_TTL_MS && operationalVersion > 0) {
    return operationalVersion;
  }

  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const remoteVer = await tursoClient.getOperationalVersionFromTurso();
      if (remoteVer) {
        const num = Number(remoteVer);
        if (!isNaN(num) && num > 0) {
          operationalVersion = Math.max(operationalVersion, num);
          lastVersionFetchTime = now;
          return operationalVersion;
        }
      }
    } catch (e) {}
  }

  if (sqliteEngine) {
    try {
      const row = sqliteEngine.prepare("SELECT value FROM system_metadata WHERE key = 'operational_version'").get();
      if (row && row.value) {
        const num = Number(row.value);
        if (!isNaN(num) && num > 0) {
          operationalVersion = Math.max(operationalVersion, num);
          lastVersionFetchTime = now;
          return operationalVersion;
        }
      }
    } catch (e) {}
  }

  lastVersionFetchTime = now;
  return operationalVersion;
}

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
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        memoryOrders = parsed;
        return memoryOrders;
      }
    }
  } catch (err) {
    console.warn("Chưa có file cancellation_orders.json hoặc lỗi đọc:", err.message);
  }

  // Fix #10: Chỉ reset và migrate khi thực sự chưa có dữ liệu trong memory
  const beforeReset = memoryOrders.length;
  memoryOrders = [];
  try {
    migrateFromUploadHistory();
  } catch (migErr) {
    console.error("Lỗi migrate dữ liệu từ lịch sử:", migErr.message);
    if (beforeReset > 0) {
      console.warn(`[Cảnh báo] Migration thất bại, ${beforeReset} bản ghi trong RAM bị reset.`);
    }
  }
  return memoryOrders;
}

// Lưu dữ liệu vào file JSON và xuất dump file .sql (Tối ưu I/O: lưu compact, chỉ sinh dump khi upload file mới hoặc người dùng yêu cầu)
function persistStore(options = {}) {
  try {
    if (fs.existsSync(DATA_DIR)) {
      // Lưu dạng compact không dùng null, 2 để giảm 50% dung lượng và tăng tốc độ I/O
      fs.writeFileSync(DB_JSON_PATH, JSON.stringify(memoryOrders), "utf8");
      if (options.generateDump === true) {
        generateSqlDumpFile();
      }
    }
  } catch (err) {
    // Trên Vercel Serverless filesystem là read-only, dữ liệu lưu vĩnh viễn trên Turso Cloud
  }

  // Đồng bộ ngầm lên Turso Cloud (fire-and-forget)
  if (tursoClient && options.syncFullToTurso !== false) {
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
  const nowStr = metadata.uploadedAt || formatVietnamDateTime(new Date());
  const processedRecords = [];

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
    processedRecords.push(orderData);

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
    total: memoryOrders.length,
    processedRecords
  };
}

/**
 * Lấy toàn bộ bản ghi tích lũy trong cơ sở dữ liệu SQL
 * STT được đánh số lại tuần tự từ 1 -> N để bảng hiển thị liền mạch
 */
function getAllRecords() {
  loadAllFromStore();
  applyExpired3hCancellation(memoryOrders);

  // Lấy trạng thái tác nghiệp từ bảng order_operational_state nếu có
  let opMap = new Map();
  if (sqliteEngine) {
    try {
      const rows = sqliteEngine.prepare("SELECT row_key, is_pending, cskh_status, explanation FROM order_operational_state").all();
      rows.forEach(r => {
        opMap.set(r.row_key, r);
      });
    } catch (e) {}
  }

  return memoryOrders.map((o, idx) => {
    const op = opMap.get(o.rowKey);
    return {
      ...o,
      stt: String(idx + 1),
      isPending: op ? op.is_pending === 1 : Boolean(o.isPending),
      trangThaiXuLy: (op && op.cskh_status !== undefined && op.cskh_status !== null) ? op.cskh_status : (o.trangThaiXuLy || ""),
      giaiTrinh: (op && op.explanation !== undefined && op.explanation !== null) ? op.explanation : (o.giaiTrinh || ""),
      giaiTrinhChiTiet: (op && op.explanation_detail !== undefined) ? op.explanation_detail : (o.giaiTrinhChiTiet !== undefined ? o.giaiTrinhChiTiet : null)
    };
  });
}

/**
 * Cập nhật trạng thái xử lý CSKH hoặc giải trình vào database (Tối ưu: cập nhật cả bảng chuẩn hóa order_operational_state)
 */
function updateOrderNote(rowKey, noteData = {}) {
  let matched = memoryOrders.filter(o => o.rowKey === rowKey);
  // Fix #11: Khớp chính xác theo altKey (STT_Booking_Container)
  if (matched.length === 0 && rowKey) {
    matched = memoryOrders.filter(o => {
      const altKey = `${o.stt}_${o.soBooking || ''}_${o.soContainer || ''}`;
      return altKey === rowKey;
    });
  }
  // Khớp chính xác cả Container và Booking nếu rowKey có cấu trúc DEPOT#CONTAINER#BOOKING#DATE
  if (matched.length === 0 && rowKey && typeof rowKey === "string" && rowKey.includes("#")) {
    const parts = rowKey.split("#");
    if (parts.length >= 3) {
      const contPart = (parts[1] || "").trim().toUpperCase();
      const bookPart = (parts[2] || "").trim().toUpperCase();
      if (contPart && bookPart) {
        matched = memoryOrders.filter(o =>
          (o.soContainer || "").trim().toUpperCase() === contPart &&
          (o.soBooking || "").trim().toUpperCase() === bookPart
        );
      }
    }
  }
  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
  const hasStatus = noteData.status !== undefined;
  const hasExp = noteData.giaiTrinh !== undefined;
  const hasExpDetail = noteData.giaiTrinhChiTiet !== undefined;
  const statusVal = hasStatus ? (noteData.status || "") : "";
  const expVal = hasExp ? (noteData.giaiTrinh || "") : "";
  const expDetailVal = hasExpDetail ? (noteData.giaiTrinhChiTiet !== null && String(noteData.giaiTrinhChiTiet).trim() !== "" ? String(noteData.giaiTrinhChiTiet).trim() : null) : null;

  if (matched.length === 0 && rowKey) {
    if (sqliteEngine) {
      try {
        const stmtOp = sqliteEngine.prepare(`
          INSERT INTO order_operational_state (row_key, cskh_status, explanation, explanation_detail, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(row_key) DO UPDATE SET
            cskh_status = CASE WHEN ? = 1 THEN excluded.cskh_status ELSE order_operational_state.cskh_status END,
            explanation = CASE WHEN ? = 1 THEN excluded.explanation ELSE order_operational_state.explanation END,
            explanation_detail = CASE WHEN ? = 1 THEN excluded.explanation_detail ELSE order_operational_state.explanation_detail END,
            updated_at = excluded.updated_at
        `);
        stmtOp.run(rowKey, statusVal, expVal, expDetailVal, nowStr, hasStatus ? 1 : 0, hasExp ? 1 : 0, hasExpDetail ? 1 : 0);
      } catch (e) {}
    }
    if (tursoClient) {
      tursoClient.updateOrderNoteInTurso(rowKey, noteData).catch(() => {});
    }
    return true;
  }
  if (matched.length === 0) return false;

  matched.forEach(item => {
    const oldStatus = item.trangThaiXuLy || "";
    const oldExp = item.giaiTrinh || "";

    if (hasStatus) item.trangThaiXuLy = statusVal;
    if (hasExp) item.giaiTrinh = expVal;
    if (hasExpDetail) item.giaiTrinhChiTiet = expDetailVal;
    item.updatedAt = nowStr;

    if (sqliteEngine) {
      try {
        // 1. Cập nhật bảng cancellation_orders (tương thích ngược)
        const stmt = sqliteEngine.prepare(`
          UPDATE cancellation_orders 
          SET trang_thai_xu_ly = CASE WHEN ? = 1 THEN ? ELSE trang_thai_xu_ly END,
              giai_trinh = CASE WHEN ? = 1 THEN ? ELSE giai_trinh END,
              giai_trinh_chi_tiet = CASE WHEN ? = 1 THEN ? ELSE giai_trinh_chi_tiet END,
              updated_at = ? 
          WHERE row_key = ?
        `);
        stmt.run(hasStatus ? 1 : 0, statusVal, hasExp ? 1 : 0, expVal, hasExpDetail ? 1 : 0, expDetailVal, nowStr, item.rowKey);

        // 2. Cập nhật bảng chuẩn hóa order_operational_state
        const stmtOp = sqliteEngine.prepare(`
          INSERT INTO order_operational_state (row_key, cskh_status, explanation, explanation_detail, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(row_key) DO UPDATE SET
            cskh_status = CASE WHEN ? = 1 THEN excluded.cskh_status ELSE order_operational_state.cskh_status END,
            explanation = CASE WHEN ? = 1 THEN excluded.explanation ELSE order_operational_state.explanation END,
            explanation_detail = CASE WHEN ? = 1 THEN excluded.explanation_detail ELSE order_operational_state.explanation_detail END,
            updated_at = excluded.updated_at
        `);
        const insertStatus = hasStatus ? statusVal : (item.trangThaiXuLy || "");
        const insertExp = hasExp ? expVal : (item.giaiTrinh || "");
        const insertExpDetail = hasExpDetail ? expDetailVal : (item.giaiTrinhChiTiet || null);
        stmtOp.run(item.rowKey, insertStatus, insertExp, insertExpDetail, nowStr, hasStatus ? 1 : 0, hasExp ? 1 : 0, hasExpDetail ? 1 : 0);

        // 3. Ghi audit log
        const stmtAudit = sqliteEngine.prepare(`
          INSERT INTO order_status_audit_log (row_key, action, old_status, new_status, old_explanation, new_explanation, changed_by, changed_at)
          VALUES (?, 'UPDATE_NOTE', ?, ?, ?, ?, ?, ?)
        `);
        stmtAudit.run(item.rowKey, oldStatus, item.trangThaiXuLy || '', oldExp, item.giaiTrinh || '', noteData.user || 'admin', nowStr);
      } catch (e) {}
    }
  });

  // Tối ưu I/O: lưu file JSON nhưng không chạy nối chuỗi SQL Dump 300KB
  persistStore({ generateDump: false, syncFullToTurso: false });

  // Đồng bộ riêng bản ghi này lên Turso
  if (tursoClient) {
    tursoClient.updateOrderNoteInTurso(rowKey, noteData).catch(() => {});
  }

  bumpOperationalVersion();
  return true;
}

/**
 * Cập nhật trạng thái Chờ Xử Lý (Pending) cho 1 đơn hàng vào Database
 */
function setOrderPending(rowKey, isPending = true) {
  let matched = memoryOrders.filter(o => o.rowKey === rowKey);
  if (matched.length === 0 && rowKey) {
    matched = memoryOrders.filter(o => (o.id && String(o.id) === String(rowKey)) || (o.soEir && o.soEir === rowKey) || (o.soContainer && o.soContainer === rowKey));
  }
  if (matched.length === 0) return false;

  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
  matched.forEach(item => {
    item.isPending = Boolean(isPending);
    item.pendingAt = isPending ? nowStr : null;

    if (sqliteEngine) {
      try {
        const stmt = sqliteEngine.prepare(`
          INSERT INTO order_operational_state (row_key, is_pending, pending_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(row_key) DO UPDATE SET
            is_pending = excluded.is_pending,
            pending_at = excluded.pending_at,
            updated_at = excluded.updated_at
        `);
        stmt.run(item.rowKey, isPending ? 1 : 0, isPending ? nowStr : null, nowStr);
      } catch (e) {}
    }

    if (tursoClient) {
      tursoClient.syncPendingStateToTurso(item.rowKey, isPending).catch(() => {});
    }
  });

  persistStore({ generateDump: false, syncFullToTurso: false });
  bumpOperationalVersion();
  return true;
}

/**
 * Lấy toàn bộ bản đồ trạng thái tác nghiệp (CSKH status, explanation, pending) để đồng bộ nhanh
 */
function getOperationalUpdates() {
  const updates = {};
  if (sqliteEngine) {
    try {
      const rows = sqliteEngine.prepare("SELECT row_key, is_pending, cskh_status, explanation, explanation_detail, updated_at FROM order_operational_state").all();
      rows.forEach(r => {
        if (r.row_key) {
          updates[r.row_key] = {
            trangThaiXuLy: r.cskh_status || "",
            giaiTrinh: r.explanation || "",
            giaiTrinhChiTiet: (r.explanation_detail !== undefined && r.explanation_detail !== null && r.explanation_detail !== "") ? r.explanation_detail : null,
            isPending: r.is_pending === 1,
            updatedAt: r.updated_at || ""
          };
        }
      });
      return {
        version: operationalVersion,
        updates
      };
    } catch (e) {}
  }

  // Fallback từ memoryOrders
  memoryOrders.forEach(o => {
    if (o.rowKey) {
      updates[o.rowKey] = {
        trangThaiXuLy: o.trangThaiXuLy || "",
        giaiTrinh: o.giaiTrinh || "",
        giaiTrinhChiTiet: (o.giaiTrinhChiTiet !== undefined && o.giaiTrinhChiTiet !== null && o.giaiTrinhChiTiet !== "") ? o.giaiTrinhChiTiet : null,
        isPending: Boolean(o.isPending),
        updatedAt: o.updatedAt || ""
      };
    }
  });

  return {
    version: operationalVersion,
    updates
  };
}

/**
 * Đồng bộ ngược các thay đổi nhận từ Turso Cloud vào RAM và SQLite cục bộ
 */
function syncOperationalUpdatesToMemoryAndLocalSql(updates = {}) {
  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) return;
  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

  Object.entries(updates).forEach(([rowKey, item]) => {
    if (!rowKey || !item) return;
    const matched = memoryOrders.filter(o => o.rowKey === rowKey);
    matched.forEach(rec => {
      if (item.trangThaiXuLy !== undefined) rec.trangThaiXuLy = item.trangThaiXuLy || "";
      if (item.giaiTrinh !== undefined) rec.giaiTrinh = item.giaiTrinh || "";
      if (item.giaiTrinhChiTiet !== undefined) rec.giaiTrinhChiTiet = item.giaiTrinhChiTiet || null;
      if (item.isPending !== undefined) rec.isPending = Boolean(item.isPending);
      rec.updatedAt = item.updatedAt || nowStr;
    });

    if (sqliteEngine) {
      try {
        const hasStatus = item.trangThaiXuLy !== undefined;
        const hasExp = item.giaiTrinh !== undefined;
        const hasExpDetail = item.giaiTrinhChiTiet !== undefined;
        const hasPending = item.isPending !== undefined;

        sqliteEngine.prepare(`
          INSERT INTO order_operational_state (row_key, cskh_status, explanation, explanation_detail, is_pending, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(row_key) DO UPDATE SET
            cskh_status = CASE WHEN ? = 1 THEN excluded.cskh_status ELSE order_operational_state.cskh_status END,
            explanation = CASE WHEN ? = 1 THEN excluded.explanation ELSE order_operational_state.explanation END,
            explanation_detail = CASE WHEN ? = 1 THEN excluded.explanation_detail ELSE order_operational_state.explanation_detail END,
            is_pending = CASE WHEN ? = 1 THEN excluded.is_pending ELSE order_operational_state.is_pending END,
            updated_at = excluded.updated_at
        `).run(
          rowKey,
          item.trangThaiXuLy || "",
          item.giaiTrinh || "",
          item.giaiTrinhChiTiet || null,
          item.isPending ? 1 : 0,
          item.updatedAt || nowStr,
          hasStatus ? 1 : 0,
          hasExp ? 1 : 0,
          hasExpDetail ? 1 : 0,
          hasPending ? 1 : 0
        );

        if (hasStatus || hasExp || hasExpDetail) {
          sqliteEngine.prepare(`
            UPDATE cancellation_orders 
            SET trang_thai_xu_ly = CASE WHEN ? = 1 THEN ? ELSE trang_thai_xu_ly END,
                giai_trinh = CASE WHEN ? = 1 THEN ? ELSE giai_trinh END,
                giai_trinh_chi_tiet = CASE WHEN ? = 1 THEN ? ELSE giai_trinh_chi_tiet END,
                updated_at = ? 
            WHERE row_key = ?
          `).run(
            hasStatus ? 1 : 0, item.trangThaiXuLy || "",
            hasExp ? 1 : 0, item.giaiTrinh || "",
            hasExpDetail ? 1 : 0, item.giaiTrinhChiTiet || null,
            item.updatedAt || nowStr,
            rowKey
          );
        }
      } catch (e) {}
    }
  });
}

/**
 * Lấy toàn bộ trạng thái tác nghiệp đa máy chủ từ Turso Cloud (với fallback SQLite/Memory)
 */
async function getOperationalUpdatesAsync(since) {
  let updates = null;
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      updates = await tursoClient.getOperationalUpdatesFromTurso(since);
      if (updates && typeof updates === "object") {
        syncOperationalUpdatesToMemoryAndLocalSql(updates);
      }
    } catch (e) {}
  }

  if (!updates || Object.keys(updates).length === 0) {
    const local = getOperationalUpdates();
    updates = local.updates || {};
  }

  const currentVer = await getOperationalVersionAsync();
  return {
    version: currentVer,
    updates
  };
}

/**
 * Cập nhật hàng loạt danh sách đơn vào/ra khỏi Chờ Xử Lý (Pending)
 */
function batchSetOrdersPending(rowKeys = [], isPending = true) {
  if (!Array.isArray(rowKeys) || rowKeys.length === 0) return { updated: 0 };
  let count = 0;
  rowKeys.forEach(key => {
    if (setOrderPending(key, isPending)) count++;
  });
  return { updated: count, total: rowKeys.length };
}

/**
 * Lấy danh sách các rowKey đang ở trạng thái Chờ Xử Lý (Pending) từ Database
 */
function getPendingOrderKeys() {
  if (sqliteEngine) {
    try {
      const stmt = sqliteEngine.prepare("SELECT row_key FROM order_operational_state WHERE is_pending = 1");
      const rows = stmt.all();
      return rows.map(r => r.row_key);
    } catch (e) {}
  }
  return memoryOrders.filter(o => o.isPending).map(o => o.rowKey);
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
 * Lấy danh sách bản ghi theo upload_id trực tiếp từ SQLite Database (hoặc memoryOrders)
 */
function getRecordsByUploadId(uploadId) {
  if (sqliteEngine) {
    try {
      const rows = sqliteEngine.prepare(
        "SELECT * FROM cancellation_orders WHERE upload_id = ? ORDER BY id ASC"
      ).all(uploadId);
      if (rows && rows.length > 0) {
        return rows.map(r => ({
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
          sizeTeus: r.size_teus,
          tenTaiXe: r.ten_tai_xe,
          sdtTaiXe: r.sdt_tai_xe,
          tenNhaXe: r.ten_nha_xe,
          sdtNhaXe: r.sdt_nha_xe,
          lyDoTuChoi: r.ly_do_tu_choi,
          trangThaiXuLy: r.trang_thai_xu_ly,
          giaiTrinh: r.giai_trinh,
          giaiTrinhChiTiet: r.giai_trinh_chi_tiet || null,
          soXe: r.so_xe || null,
          nguoiTao: r.nguoi_tao || null,
          createdAt: r.created_at
        }));
      }
    } catch (e) {}
  }
  return memoryOrders.filter(o => o.uploadId === uploadId);
}

/**
 * Thu hồi phân mảnh đĩa và nén SQLite
 */
function vacuumDatabase() {
  if (sqliteEngine) {
    try {
      sqliteEngine.exec("VACUUM;");
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
  const hangTau = (r.hangTau || "").trim().toUpperCase();
  const lyDo = (r.lyDoHuy || "").trim().substring(0, 30);

  if (eir) return `${depot}#EIR_${eir}#${date}`;
  if (cont || book) return `${depot}#${cont}#${book}#${date}`;

  // Fix #9: Fallback có tính xác định (deterministic) dựa trên mã băm MD5 thay vì random
  const hashInput = `${depot}|${hangTau}|${date}|${lyDo}`;
  const hash = crypto.createHash("md5").update(hashInput).digest("hex").substring(0, 12);
  return `${depot}#VER_FALLBACK_${hash}`;
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

function persistVerificationStore(options = {}) {
  try {
    if (fs.existsSync(DATA_DIR)) {
      fs.writeFileSync(VERIFICATION_JSON_PATH, JSON.stringify(memoryVerificationOrders, null, 2), "utf8");
      if (options.generateDump !== false) {
        generateVerificationSqlDumpFile();
      }
    }
  } catch (err) {
    // Trên Vercel Serverless filesystem là read-only
  }
  if (tursoClient && options.syncFullToTurso !== false) {
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
    lines.push(`  nguoi_tao VARCHAR(150),`);
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
        `INSERT INTO eir_cancellation_orders (id, row_key, upload_id, file_name, stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet, so_booking, so_container, loai_container, loai_don_hang, size_teus, trang_thai_don_hang, trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, ly_do_tu_choi, ly_do_huy_check, ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, so_xe, file_nguon, nguoi_tao, created_at, updated_at) ` +
        `VALUES (${idx + 1}, ${escapeSql(o.rowKey)}, ${escapeSql(o.uploadId)}, ${escapeSql(o.fileName)}, ${escapeSql(o.sttFile)}, ${escapeSql(o.depot)}, ${escapeSql(o.hangTau)}, ${escapeSql(o.ngayHuyDon)}, ${escapeSql(o.ngayDuocDuyet)}, ${escapeSql(o.soBooking)}, ${escapeSql(o.soContainer)}, ${escapeSql(o.loaiContainer)}, ${escapeSql(o.loaiDonHang)}, ${Number(o.sizeTeus) || 0}, ${escapeSql(o.trangThaiDonHang)}, ${escapeSql(o.trangThaiKichHoat)}, ${escapeSql(o.thoiGianKichHoat)}, ${escapeSql(o.lyDoHuy)}, ${escapeSql(o.lyDoTuChoi)}, ${escapeSql(o.lyDoHuyCheck)}, ${escapeSql(o.tenTaiXe)}, ${escapeSql(o.sdtTaiXe)}, ${escapeSql(o.tenNhaXe)}, ${escapeSql(o.sdtNhaXe)}, ${escapeSql(o.soXe)}, ${escapeSql(o.fileName)}, ${escapeSql(o.nguoiTao)}, ${escapeSql(o.createdAt)}, ${escapeSql(o.updatedAt)});`
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
  const nowStr = metadata.uploadedAt || formatVietnamDateTime(new Date());
  const processedRecords = [];

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
      soXe: r.soXe || "",
      nguoiTao: r.nguoiTao || "",
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
    processedRecords.push(orderData);

    if (sqliteEngine) {
      try {
        const stmt = sqliteEngine.prepare(`
          INSERT INTO eir_cancellation_orders (
            row_key, upload_id, file_name, stt_file, depot, hang_tau, ngay_huy_don, ngay_duoc_duyet,
            so_booking, so_container, loai_container, loai_don_hang, size_teus, trang_thai_don_hang,
            trang_thai_kich_hoat, thoi_gian_kich_hoat, ly_do_huy, ly_do_tu_choi, ly_do_huy_check,
            ten_tai_xe, sdt_tai_xe, ten_nha_xe, sdt_nha_xe, so_xe, file_nguon, nguoi_tao, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(row_key) DO UPDATE SET
            upload_id=excluded.upload_id,
            file_name=excluded.file_name,
            trang_thai_don_hang=excluded.trang_thai_don_hang,
            ngay_duoc_duyet=excluded.ngay_duoc_duyet,
            so_xe=excluded.so_xe,
            nguoi_tao=excluded.nguoi_tao,
            updated_at=excluded.updated_at
        `);
        stmt.run(
          orderData.rowKey, orderData.uploadId, orderData.fileName, orderData.sttFile, orderData.depot,
          orderData.hangTau, orderData.ngayHuyDon, orderData.ngayDuocDuyet, orderData.soBooking,
          orderData.soContainer, orderData.loaiContainer, orderData.loaiDonHang, orderData.sizeTeus,
          orderData.trangThaiDonHang, orderData.trangThaiKichHoat, orderData.thoiGianKichHoat,
          orderData.lyDoHuy, orderData.lyDoTuChoi, orderData.lyDoHuyCheck, orderData.tenTaiXe,
          orderData.sdtTaiXe, orderData.tenNhaXe, orderData.sdtNhaXe, orderData.soXe, orderData.fileName,
          orderData.nguoiTao, orderData.createdAt, orderData.updatedAt
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
    total: memoryVerificationOrders.length,
    processedRecords
  };
}

function getAllVerificationRecords() {
  loadVerificationFromStore();
  return memoryVerificationOrders;
}

function getVerificationRecordsByUploadId(uploadId) {
  loadVerificationFromStore();
  return memoryVerificationOrders.filter(o => o.uploadId === uploadId);
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
  const cleanTruck = (t) => (!t || t === "-" || t === "null" || t === "undefined" ? "" : String(t).toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const cleanGate = (v) => {
    if (!v) return "";
    const s = String(v).toUpperCase().trim();
    if (s.includes("OUT")) return "OUT";
    if (s.includes("IN")) return "IN";
    return s;
  };

  const parseOrderEirAndCont = (order) => {
    let eir = "";
    let cont = "";
    const raw = (order.soContainer || order.so_container || "").trim();
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
    let eir = (check.sttFile || check.stt_file || "").trim().toUpperCase();
    let cont = (check.soContainer || check.so_container || "").trim().toUpperCase();
    if (cont.includes("-")) {
      const parts = cont.split("-");
      if (!eir) eir = parts[0].trim().toUpperCase();
      cont = parts.slice(1).join("-").trim().toUpperCase();
    }
    if (!eir && check.rowKey) {
      const match = String(check.rowKey).match(/EIR\d+/i);
      if (match) eir = match[0].toUpperCase();
    }
    if (cont === eir) {
      cont = "";
    }
    return { eir, cont, rawCont: (check.soContainer || check.so_container || "").trim().toUpperCase() };
  };

  const isSameCont = (orderInfo, checkInfo) => {
    if (orderInfo.cont && checkInfo.cont) {
      return orderInfo.cont === checkInfo.cont;
    }
    if (!orderInfo.cont && !checkInfo.cont) {
      return true;
    }
    if (orderInfo.rawCont && orderInfo.rawCont === checkInfo.rawCont) {
      return true;
    }
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
    const timeFirstMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (timeFirstMatch) {
      return {
        y: parseInt(timeFirstMatch[6], 10),
        m: parseInt(timeFirstMatch[5], 10),
        d: parseInt(timeFirstMatch[4], 10),
        h: parseInt(timeFirstMatch[1], 10),
        min: parseInt(timeFirstMatch[2], 10),
        s: parseInt(timeFirstMatch[3] || "0", 10)
      };
    }
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
    return s.includes("da huy") || s === "huy" || s.includes("tu choi duyet") || s.includes("dang hoan tien") || s.includes("da hoan tien");
  };

  const isSuccessPayment = (val) => {
    if (!val) return false;
    const s = String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
    return s.includes("thanh toan thanh cong") || s.includes("thanh cong") || s.includes("da thanh toan") || s.includes("hoan thanh") || s.includes("da hoan thanh");
  };

  const usedCheckKeys = new Set();
  const updatedRecords = [];
  let updatedUnpaid = 0;
  let updatedCancelled = 0;
  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

  // -------------------------------------------------------------------------
  // BƯỚC 0: LÀM GIÀU DỮ LIỆU (DATA ENRICHMENT QUA MÃ EIR)
  // Bổ sung soXe và nguoiTao từ eir_cancellation_orders sang cancellation_orders
  // -------------------------------------------------------------------------
  const checkEirMap = new Map();
  memoryVerificationOrders.forEach(check => {
    const eir = clean(check.sttFile);
    if (eir) checkEirMap.set(eir, check);
    const info = parseCheckEirAndCont(check);
    if (info.eir && !checkEirMap.has(info.eir)) checkEirMap.set(info.eir, check);
  });

  memoryOrders.forEach(order => {
    const orderInfo = parseOrderEirAndCont(order);
    order._eir = orderInfo.eir;
    order._cont = orderInfo.cont;
    order._bk = clean(order.soBooking);
    order._dir = cleanGate(order.loaiDonHang);

    if (!order.soXe || !order.nguoiTao) {
      if (orderInfo.eir && checkEirMap.has(orderInfo.eir)) {
        const c = checkEirMap.get(orderInfo.eir);
        if (!order.soXe && c.soXe) order.soXe = c.soXe;
        if (!order.nguoiTao && c.nguoiTao) order.nguoiTao = c.nguoiTao;
      }
    }
    order._truck = cleanTruck(order.soXe);
    order._creator = clean(order.nguoiTao);
    order._depot = clean(order.depot);
    order._line = clean(order.hangTau);
  });

  // -------------------------------------------------------------------------
  // PHASE 1 (ƯU TIÊN 1): XỬ LÝ CÁC ĐƠN CHƯA THANH TOÁN (GIỮ NGUYÊN 100%)
  // -------------------------------------------------------------------------
  const bookingOrdersMap = new Map();
  memoryOrders.forEach(order => {
    const booking = clean(order.soBooking);
    if (!booking) return;
    if (!bookingOrdersMap.has(booking)) {
      bookingOrdersMap.set(booking, []);
    }
    bookingOrdersMap.get(booking).push(order);
  });

  for (const [orderBooking, ordersInBooking] of bookingOrdersMap.entries()) {
    ordersInBooking.forEach(order => {
      const isUnpaidOrder = isUnpaid(order.trangThaiDonHang);
      if (!isUnpaidOrder) return;

      const orderGate = cleanGate(order.loaiDonHang);
      const orderInfo = parseOrderEirAndCont(order);
      const orderStatusNorm = clean(order.trangThaiDonHang);

      const matchedIndex = memoryVerificationOrders.findIndex(check => {
        if (usedCheckKeys.has(check.rowKey)) return false;
        if (clean(check.soBooking) !== orderBooking) return false;

        const checkStatusNorm = clean(check.trangThaiDonHang);
        if (orderStatusNorm === checkStatusNorm) return false;

        const checkGate = cleanGate(check.loaiDonHang);
        if (orderGate && checkGate && orderGate !== checkGate) return false;

        const checkInfo = parseCheckEirAndCont(check);
        if (isSameCont(orderInfo, checkInfo) || isSameEir(orderInfo, checkInfo)) {
          return true;
        }
        return false;
      });

      if (matchedIndex !== -1) {
        const check = memoryVerificationOrders[matchedIndex];
        const checkInfo = parseCheckEirAndCont(check);
        usedCheckKeys.add(check.rowKey);

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
        if (check.soXe) order.soXe = check.soXe;
        if (check.nguoiTao) order.nguoiTao = check.nguoiTao;
        order.updatedAt = nowStr;

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
      }
    });
  }

  // -------------------------------------------------------------------------
  // PHASE 2 (ƯU TIÊN 2): PIPELINE 3 VÒNG CHO ĐƠN ĐÃ HỦY & MULTI-ATTEMPT PROPAGATION
  // -------------------------------------------------------------------------
  const availableChecks = memoryVerificationOrders.filter(c => {
    if (usedCheckKeys.has(c.rowKey)) return false;
    return !isCancelled(c.trangThaiDonHang);
  });

  availableChecks.forEach(c => {
    c._info = parseCheckEirAndCont(c);
    c._bk = clean(c.soBooking);
    c._dir = cleanGate(c.loaiDonHang);
    c._truck = cleanTruck(c.soXe);
    c._creator = clean(c.nguoiTao);
    c._depot = clean(c.depot);
    c._line = clean(c.hangTau);
    c._ts = parseDateMs(c.ngayDuocDuyet || c.ngayHuyDon) || 0;
  });

  // Bước 1.5: Chuẩn hóa Booking cho các đơn check rỗng booking dựa trên cùng cont và chiều
  const contWithBkMap = new Map();
  availableChecks.forEach(c => {
    if (c._bk && c._info.cont) {
      const key = `${c._info.cont}__${c._dir}`;
      if (!contWithBkMap.has(key)) contWithBkMap.set(key, c._bk);
    }
  });
  availableChecks.forEach(c => {
    if (!c._bk && c._info.cont) {
      const key = `${c._info.cont}__${c._dir}`;
      if (contWithBkMap.has(key)) c._bk = contWithBkMap.get(key);
    }
  });

  // Tập hợp các đơn hủy trong cancellation_orders
  const cancelledOrders = memoryOrders.filter(o => isCancelled(o.trangThaiDonHang) || o.isAutoCancelledBy3h);
  cancelledOrders.forEach(o => {
    o._ts = parseDateMs(o.ngayHuyDon || o.ngayDuocDuyet) || 0;
    if (!o._bk && o._cont) {
      const key = `${o._cont}__${o._dir}`;
      if (contWithBkMap.has(key)) o._bk = contWithBkMap.get(key);
    }
  });

  // Xây dựng Indexed Maps cho các đơn hủy để tra cứu tức thì theo 4 VÒNG TUẦN TỰ
  const v1Map = new Map(); // key: bk__cont__dir__depot__line -> [orders]
  const v2Map = new Map(); // key: bk__dir__depot__line -> [orders] (đổi vỏ cont)
  const v3Map = new Map(); // key: cont__dir__creator__truck__depot__line -> [orders] (đổi booking)
  const v4Map = new Map(); // key: creator__depot__line__truck -> [orders] (đơn OUT trong 24h)

  cancelledOrders.forEach(o => {
    if (o._bk && o._cont && o._depot && o._line) {
      const k1 = `${o._bk}__${o._cont}__${o._dir}__${o._depot}__${o._line}`;
      if (!v1Map.has(k1)) v1Map.set(k1, []);
      v1Map.get(k1).push(o);
    }
    if (o._bk && o._depot && o._line) {
      const k2 = `${o._bk}__${o._dir}__${o._depot}__${o._line}`;
      if (!v2Map.has(k2)) v2Map.set(k2, []);
      v2Map.get(k2).push(o);
    }
    if (o._cont && o._creator && o._truck && o._depot && o._line) {
      const k3 = `${o._cont}__${o._dir}__${o._creator}__${o._truck}__${o._depot}__${o._line}`;
      if (!v3Map.has(k3)) v3Map.set(k3, []);
      v3Map.get(k3).push(o);
    }
    if (o._dir === "OUT" && o._creator && o._depot && o._line && o._truck) {
      const k4 = `${o._creator}__${o._depot}__${o._line}__${o._truck}`;
      if (!v4Map.has(k4)) v4Map.set(k4, []);
      v4Map.get(k4).push(o);
    }
  });

  const updatedOrderKeys = new Set();

  // Sắp xếp availableChecks theo timestamp tăng dần (đơn hoàn thành sau cùng xét trước)
  availableChecks.sort((a, b) => b._ts - a._ts);

  availableChecks.forEach(check => {
    if (usedCheckKeys.has(check.rowKey)) return;
    const cInfo = check._info;

    let matchedCancelledList = null;

    // --- VÒNG 1: Cùng Booking + Cùng Cont + Cùng Chiều + Cùng Depot + Cùng Hãng tàu ---
    if (check._bk && cInfo.cont && check._depot && check._line) {
      const k1 = `${check._bk}__${cInfo.cont}__${check._dir}__${check._depot}__${check._line}`;
      const candidates = v1Map.get(k1);
      if (candidates && candidates.length > 0) {
        const fresh = candidates.filter(o => !updatedOrderKeys.has(o.rowKey) && o._eir !== cInfo.eir);
        if (fresh.length > 0) {
          matchedCancelledList = fresh;
        }
      }
    }

    // --- VÒNG 2 (MỚI): Cùng Booking + Cùng Chiều + Cùng Depot + Cùng Hãng tàu + KHÁC Cont ---
    if (!matchedCancelledList && check._bk && check._depot && check._line) {
      const k2 = `${check._bk}__${check._dir}__${check._depot}__${check._line}`;
      const candidates = v2Map.get(k2);
      if (candidates && candidates.length > 0) {
        const fresh = candidates.filter(o => 
          !updatedOrderKeys.has(o.rowKey) && 
          o._eir !== cInfo.eir &&
          o._cont !== cInfo.cont &&
          (isCancelled(o.trangThaiDonHang) || o.isAutoCancelledBy3h)
        );
        if (fresh.length > 0) {
          matchedCancelledList = fresh;
        }
      }
    }

    // --- VÒNG 3: Cùng Cont + Cùng Chiều + Cùng Người tạo + Cùng Số xe + Cùng Depot + Cùng Hãng tàu ---
    if (!matchedCancelledList && cInfo.cont && check._truck && check._creator && check._depot && check._line) {
      const k3 = `${cInfo.cont}__${check._dir}__${check._creator}__${check._truck}__${check._depot}__${check._line}`;
      const candidates = v3Map.get(k3);
      if (candidates && candidates.length > 0) {
        const fresh = candidates.filter(o => !updatedOrderKeys.has(o.rowKey) && o._eir !== cInfo.eir && o._bk !== check._bk);
        if (fresh.length > 0) {
          matchedCancelledList = fresh;
        }
      }
    }

    // --- VÒNG 4: Đơn OUT + Cùng Người tạo + Cùng Depot + Cùng Hãng tàu + Cùng Số xe trong 24h ---
    if (!matchedCancelledList && check._dir === "OUT" && check._truck && check._creator && check._depot && check._line) {
      const k4 = `${check._creator}__${check._depot}__${check._line}__${check._truck}`;
      const candidates = v4Map.get(k4);
      if (candidates && candidates.length > 0) {
        const fresh = candidates.filter(o => {
          if (updatedOrderKeys.has(o.rowKey)) return false;
          if (o._eir === cInfo.eir) return false;
          if (o._cont === cInfo.cont) return false;
          if (o._bk === check._bk) return false;
          if (check._ts > 0 && o._ts > 0) {
            const diffMs = Math.abs(check._ts - o._ts);
            if (diffMs > 24 * 3600 * 1000) return false;
          }
          return true;
        });
        if (fresh.length > 0) {
          matchedCancelledList = fresh;
        }
      }
    }

    // NẾU KHỚP THÀNH CÔNG: Xử lý Multi-attempt và cập nhật
    if (matchedCancelledList && matchedCancelledList.length > 0) {
      usedCheckKeys.add(check.rowKey);

      // Sắp xếp các đơn hủy theo timestamp tăng dần (đơn hủy gần nhất với check nằm ở cuối)
      matchedCancelledList.sort((a, b) => (a._ts || 0) - (b._ts || 0));

      const latestCancelled = matchedCancelledList[matchedCancelledList.length - 1];
      const priorCancelled = matchedCancelledList.slice(0, matchedCancelledList.length - 1);

      // 1. Cập nhật đơn hủy gần nhất bằng dữ liệu mới từ check
      updatedOrderKeys.add(latestCancelled.rowKey);
      if (cInfo.eir) {
        latestCancelled.soContainer = cInfo.cont ? `${cInfo.eir}-${cInfo.cont}` : `${cInfo.eir}-`;
      } else if (check.soContainer) {
        latestCancelled.soContainer = check.soContainer;
      }

      if (latestCancelled.isAutoCancelledBy3h) {
        latestCancelled.isAutoCancelledBy3h = false;
      }

      if (check.depot) latestCancelled.depot = check.depot;
      if (check.hangTau) latestCancelled.hangTau = check.hangTau;
      if (check.soBooking) latestCancelled.soBooking = check.soBooking;
      if (check.ngayHuyDon) latestCancelled.ngayHuyDon = check.ngayHuyDon;
      if (check.ngayDuocDuyet) latestCancelled.ngayDuocDuyet = check.ngayDuocDuyet;
      if (check.loaiContainer) latestCancelled.loaiContainer = check.loaiContainer;
      if (check.loaiDonHang) latestCancelled.loaiDonHang = check.loaiDonHang;
      if (check.sizeTeus !== undefined && check.sizeTeus !== null) latestCancelled.sizeTeus = Number(check.sizeTeus) || 0;
      if (check.trangThaiDonHang) latestCancelled.trangThaiDonHang = check.trangThaiDonHang;
      if (check.trangThaiKichHoat) latestCancelled.trangThaiKichHoat = check.trangThaiKichHoat;
      if (check.thoiGianKichHoat) latestCancelled.thoiGianKichHoat = check.thoiGianKichHoat;
      if (check.lyDoHuy) latestCancelled.lyDoHuy = check.lyDoHuy;
      if (check.lyDoTuChoi) latestCancelled.lyDoTuChoi = check.lyDoTuChoi;
      if (check.lyDoHuyCheck) latestCancelled.lyDoHuyCheck = check.lyDoHuyCheck;
      if (check.tenTaiXe) latestCancelled.tenTaiXe = check.tenTaiXe;
      if (check.sdtTaiXe) latestCancelled.sdtTaiXe = check.sdtTaiXe;
      if (check.tenNhaXe) latestCancelled.tenNhaXe = check.tenNhaXe;
      if (check.sdtNhaXe) latestCancelled.sdtNhaXe = check.sdtNhaXe;
      if (check.soXe) latestCancelled.soXe = check.soXe;
      if (check.nguoiTao) latestCancelled.nguoiTao = check.nguoiTao;
      latestCancelled.updatedAt = nowStr;

      const isSucc = isSuccessPayment(latestCancelled.trangThaiDonHang);
      const currXuLy = latestCancelled.trangThaiXuLy ? String(latestCancelled.trangThaiXuLy).trim() : "";

      if (isSucc) {
        latestCancelled.trangThaiXuLy = "Thanh toán thành công";
      } else if (!currXuLy || currXuLy === "null" || currXuLy === "undefined") {
        latestCancelled.trangThaiXuLy = "Đặt lại thành công";
      } else if (
        currXuLy === "Đã liên hệ - Đang chờ" || 
        currXuLy === "Đã liên hệ - Chờ" || 
        currXuLy === "Đã liên hệ - Chờ đặt lại"
      ) {
        latestCancelled.trangThaiXuLy = "Đã liên hệ - Đã đặt lại";
      }

      latestCancelled.giaiTrinh = `Lệnh mới hoàn tất theo ${cInfo.eir || check.sttFile || ""}`;

      updatedCancelled++;
      updatedRecords.push({
        rowKey: latestCancelled.rowKey,
        stt: latestCancelled.stt,
        soBooking: latestCancelled.soBooking,
        soContainer: latestCancelled.soContainer,
        trangThaiXuLy: latestCancelled.trangThaiXuLy
      });

      // 2. Lan truyền trạng thái CSKH cho các đơn hủy trước đó của cùng chuỗi
      priorCancelled.forEach(prior => {
        updatedOrderKeys.add(prior.rowKey);
        prior.trangThaiXuLy = "Đặt lại thành công";
        prior.giaiTrinh = `Cont đã hoàn thành ở lệnh mới ${cInfo.eir || check.sttFile || ""}`;
        prior.updatedAt = nowStr;
        updatedCancelled++;
        updatedRecords.push({
          rowKey: prior.rowKey,
          stt: prior.stt,
          soBooking: prior.soBooking,
          soContainer: prior.soContainer,
          trangThaiXuLy: prior.trangThaiXuLy
        });
      });
    }
  });

  const deletedCount = usedCheckKeys.size;

  // -------------------------------------------------------------------------
  // BƯỚC 3: XÓA CÁC DÒNG CHECK ĐÃ SỬ DỤNG KHỎI BẢNG eir_cancellation_orders
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // BƯỚC 3.5: TỰ ĐỘNG GHI ĐÈ & XÓA BẢN GHI CŨ TRÙNG LẶP (DEDUPLICATE & PURGE)
  // Quét toàn bộ để tự động giữ lại bản ghi mới nhất/đã hoàn thành,
  // xóa vĩnh viễn các dòng cũ trùng lặp (ví dụ dòng Đã hủy cũ cùng số EIR).
  // -------------------------------------------------------------------------
  const dedupRes = deduplicateOrdersByEir();
  const deletedDuplicates = dedupRes.deletedCount || 0;
  const deletedOrderKeys = dedupRes.deletedKeys || [];

  // -------------------------------------------------------------------------
  // BƯỚC 4: LƯU TRỮ VÀ ĐỒNG BỘ CHO BẢNG cancellation_orders
  // -------------------------------------------------------------------------
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
              giai_trinh = ?, nguoi_tao = ?, so_xe = ?, updated_at = ?
          WHERE row_key = ?
        `);
        memoryOrders.forEach(o => {
          stmtUpdate.run(
            o.depot, o.hangTau, o.ngayHuyDon, o.ngayDuocDuyet,
            o.soBooking, o.soContainer, o.loaiContainer, o.loaiDonHang,
            Number(o.sizeTeus) || 0, o.trangThaiDonHang, o.trangThaiKichHoat,
            o.thoiGianKichHoat, o.lyDoHuy, o.lyDoTuChoi, o.tenTaiXe,
            o.sdtTaiXe, o.tenNhaXe, o.sdtNhaXe, o.trangThaiXuLy,
            o.giaiTrinh || "", o.nguoiTao || "", o.soXe || "",
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
    deletedDuplicateRows: deletedDuplicates,
    deletedOrderKeys,
    remainingCheckRows: memoryVerificationOrders.length,
    updatedRecords,
    usedCheckKeys: Array.from(usedCheckKeys),
    message: `Đã cập nhật thành công ${updatedUnpaid} đơn Chưa thanh toán và ${updatedCancelled} đơn Đã hủy.${deletedDuplicates > 0 ? ` Đã ghi đè và xóa ${deletedDuplicates} dòng dữ liệu cũ trùng lặp.` : ''} Đã xóa ${deletedCount} dòng khỏi bảng check đơn.`
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
    const timeFirstMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (timeFirstMatch) {
      return {
        y: parseInt(timeFirstMatch[6], 10),
        m: parseInt(timeFirstMatch[5], 10),
        d: parseInt(timeFirstMatch[4], 10),
        h: parseInt(timeFirstMatch[1], 10),
        min: parseInt(timeFirstMatch[2], 10),
        s: parseInt(timeFirstMatch[3] || "0", 10)
      };
    }
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

  const isSuccessPaymentLocal = (val) => {
    if (!val) return false;
    const s = String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
    return s.includes("thanh toan thanh cong") || s.includes("thanh cong") || s.includes("da thanh toan") || s.includes("hoan thanh") || s.includes("da hoan thanh");
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

  // 2. Lặp qua các nhóm trùng để tìm dòng mới nhất / trạng thái đã hoàn thành
  eirGroupMap.forEach((orders, eir) => {
    if (orders.length <= 1) return;

    duplicatesFound++;

    // Sắp xếp giảm dần theo mức độ ưu tiên:
    // 1. Đơn hoàn thành/thanh toán thành công LUÔN được ưu tiên giữ lại hàng đầu
    // 2. Mốc thời gian duyệt/hủy lớn nhất (mới nhất) lên đầu
    // 3. Thời điểm cập nhật hoặc STT
    orders.sort((a, b) => {
      const succA = isSuccessPaymentLocal(a.trangThaiDonHang) ? 1 : 0;
      const succB = isSuccessPaymentLocal(b.trangThaiDonHang) ? 1 : 0;
      if (succA !== succB) return succB - succA;

      const timeA = getTimestampMs(a);
      const timeB = getTimestampMs(b);
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      const updA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const updB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (updA !== updB) return updB - updA;
      return (Number(b.stt) || 0) - (Number(a.stt) || 0);
    });

    // Phần tử đầu tiên (index 0) là dòng có trạng thái mới nhất / hoàn thành -> GIỮ LẠI
    // Các phần tử từ index 1 trở đi là dòng cũ / trạng thái hủy cũ -> XÓA
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

  // 2b. Lọc trùng tiếp cho các đơn không có EIR nhưng cùng Depot + Container + Booking
  const contBookGroupMap = new Map();
  memoryOrders.forEach(order => {
    if (toDeleteKeys.has(order.rowKey)) return;
    const rawCont = (order.soContainer || "").trim().toUpperCase();
    const rawBook = (order.soBooking || "").trim().toUpperCase();
    const depot = (order.depot || "").trim().toUpperCase();
    if (rawCont && rawBook && !rawCont.startsWith("EIR")) {
      const key = `${depot}#${rawCont}#${rawBook}`;
      if (!contBookGroupMap.has(key)) contBookGroupMap.set(key, []);
      contBookGroupMap.get(key).push(order);
    }
  });

  contBookGroupMap.forEach((orders, key) => {
    if (orders.length <= 1) return;
    duplicatesFound++;
    orders.sort((a, b) => {
      const succA = isSuccessPaymentLocal(a.trangThaiDonHang) ? 1 : 0;
      const succB = isSuccessPaymentLocal(b.trangThaiDonHang) ? 1 : 0;
      if (succA !== succB) return succB - succA;

      const timeA = getTimestampMs(a);
      const timeB = getTimestampMs(b);
      if (timeA !== timeB) return timeB - timeA;

      const updA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const updB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (updA !== updB) return updB - updA;
      return (Number(b.stt) || 0) - (Number(a.stt) || 0);
    });

    for (let i = 1; i < orders.length; i++) {
      const delOrder = orders[i];
      toDeleteKeys.add(delOrder.rowKey);
      deletedRecords.push({
        eir: key,
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
    deletedKeys: Array.from(toDeleteKeys),
    message: deletedCount > 0 
      ? `Đã lọc thành công: Phát hiện ${duplicatesFound} cụm trùng số EIR/Container, đã ghi đè và xóa ${deletedCount} dòng cũ. Còn lại ${memoryOrders.length} đơn.`
      : "Hệ thống không phát hiện đơn nào trùng số EIR."
  };
}

/**
 * Thêm một đơn hàng thủ công vào cơ sở dữ liệu
 */
function insertManualOrder(orderData) {
  const now = new Date();
  const nowStr = formatVietnamDateTime(now);

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
    giaiTrinhChiTiet: (orderData.giaiTrinhChiTiet !== undefined && orderData.giaiTrinhChiTiet !== null && String(orderData.giaiTrinhChiTiet).trim() !== "") ? String(orderData.giaiTrinhChiTiet).trim() : null,
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

async function getAllRecordsAsync(forceRefresh = false) {
  // 1. Nếu Turso Cloud khả dụng -> Turso là Nguồn Chân Lý duy nhất (Source of Truth) trên Vercel & Web
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const currentVer = await getOperationalVersionAsync();
      const hasValidCache = !forceRefresh && memoryOrders.length > 0 && lastOrdersCachedVersion === currentVer;

      if (!hasValidCache) {
        const [tursoRows, tursoOps] = await Promise.all([
          tursoClient.getAllOrdersFromTurso(),
          tursoClient.getAllOperationalStatesFromTurso()
        ]);
        if (Array.isArray(tursoRows)) {
          memoryOrders = tursoRows;
          applyExpired3hCancellation(memoryOrders);
          lastOrdersCachedVersion = currentVer;
        }
        if (tursoOps) {
          memoryOpMap = tursoOps;
          lastOpMapCachedVersion = currentVer;
        }
      }

      if (Array.isArray(memoryOrders) && memoryOrders.length > 0) {
        // Lấy trạng thái tác nghiệp từ bảng order_operational_state nếu chưa có
        if (lastOpMapCachedVersion !== currentVer || !memoryOpMap || Object.keys(memoryOpMap).length === 0) {
          try {
            memoryOpMap = await tursoClient.getAllOperationalStatesFromTurso() || {};
            lastOpMapCachedVersion = currentVer;
          } catch (opErr) {
            memoryOpMap = memoryOpMap || {};
          }
        }
        const opMap = memoryOpMap;

        return memoryOrders.map((o, idx) => {
          const op = opMap[o.rowKey];
          return {
            ...o,
            stt: String(idx + 1),
            isPending: op ? op.isPending : Boolean(o.isPending),
            trangThaiXuLy: (op && op.cskhStatus !== undefined && op.cskhStatus !== null) ? op.cskhStatus : (o.trangThaiXuLy || ""),
            giaiTrinh: (op && op.explanation !== undefined && op.explanation !== null) ? op.explanation : (o.giaiTrinh || ""),
            giaiTrinhChiTiet: (op && op.explanationDetail !== undefined) ? (op.explanationDetail || null) : (o.giaiTrinhChiTiet || null)
          };
        });
      }
    } catch (e) {
      console.warn("[Turso] Không thể đọc từ Turso, sử dụng memory store fallback:", e.message);
    }
  }

  // 2. Fallback offline / local khi không có kết nối Turso
  if (memoryOrders.length === 0) {
    loadAllFromStore();
  }
  return getAllRecords();
}

async function insertRecordsAsync(records, metadata = {}) {
  return enqueueDbWrite(async () => {
    // 1. Chỉ nạp dữ liệu từ Turso Cloud/Local nếu memory chưa được khởi tạo
    if (memoryOrders.length === 0) {
      if (tursoClient && tursoClient.isTursoAvailable()) {
        try {
          const existingTurso = await tursoClient.getAllOrdersFromTurso();
          if (Array.isArray(existingTurso) && existingTurso.length > 0) {
            memoryOrders = existingTurso;
          }
        } catch (e) {
          console.warn("[Turso] Không thể đọc từ Turso trước khi insert:", e.message);
        }
      }
      if (memoryOrders.length === 0) {
        loadAllFromStore();
      }
    }

    // 2. Thêm trực tiếp vào local store & memory
    const res = insertRecords(records, metadata, false);

    // 3. Đồng bộ hóa Delta (chỉ các đơn mới hoặc cập nhật từ file vừa nạp) lên Turso Cloud
    if (tursoClient && tursoClient.isTursoAvailable()) {
      try {
        const recordsToSync = (res.processedRecords && res.processedRecords.length > 0) ? res.processedRecords : records;
        await tursoClient.syncOrdersToTurso(recordsToSync);
      } catch (e) {
        console.error("[Cloud] Lỗi đồng bộ orders:", e.message);
        throw new Error(`Lỗi đồng bộ lên CSDL đám mây: ${e.message}`);
      }
    }

    try {
      persistStore({ syncFullToTurso: false });
    } catch (e) {}

    bumpOperationalVersion();

    return {
      ...res,
      total: memoryOrders.length
    };
  });
}

async function updateOrderNoteAsync(rowKey, noteData = {}) {
  const existing = memoryOrders.find(o => o.rowKey === rowKey || (o.stt && rowKey && rowKey.includes(o.stt))) || {};
  const enrichedNoteData = {
    ...noteData,
    currentStatus: existing.trangThaiXuLy || "",
    currentExp: existing.giaiTrinh || "",
    currentExpDetail: existing.giaiTrinhChiTiet || null
  };
  const res = updateOrderNote(rowKey, noteData);
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      await tursoClient.updateOrderNoteInTurso(rowKey, enrichedNoteData);
    } catch (e) {}
  }
  bumpOperationalVersion();
  return res;
}

async function deleteRecordsByUploadIdAsync(uploadId) {
  deleteRecordsByUploadId(uploadId);
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      await tursoClient.deleteOrdersByUploadIdInTurso(uploadId);
    } catch (e) {}
  }
  bumpOperationalVersion();
}

async function clearDatabaseAsync() {
  clearDatabase();
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      await tursoClient.clearAllOrdersInTurso();
    } catch (e) {}
  }
  bumpOperationalVersion();
}

async function getAllVerificationRecordsAsync(forceRefresh = false) {
  // 0. Tối ưu siêu tốc (In-Memory Cache): Trả về ngay nếu cache RAM đã có sẵn và không yêu cầu forceRefresh
  if (!forceRefresh && Array.isArray(memoryVerificationOrders) && memoryVerificationOrders.length > 0) {
    return memoryVerificationOrders.map((o, idx) => ({
      ...o,
      sttFile: String(idx + 1)
    }));
  }

  // 1. Nếu Turso Cloud khả dụng -> Turso là Nguồn Chân Lý duy nhất
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const tursoRows = await tursoClient.getAllVerificationOrdersFromTurso();
      if (Array.isArray(tursoRows)) {
        memoryVerificationOrders = tursoRows;
        return memoryVerificationOrders.map((o, idx) => ({
          ...o,
          sttFile: String(idx + 1)
        }));
      }
    } catch (e) {
      console.warn("[Turso] Không thể đọc verification từ Turso:", e.message);
    }
  }

  // 2. Fallback offline / local
  if (memoryVerificationOrders.length === 0) {
    loadVerificationFromStore();
  }
  return getAllVerificationRecords();
}

async function insertVerificationRecordsAsync(records, metadata = {}) {
  return enqueueDbWrite(async () => {
    if (memoryVerificationOrders.length === 0) {
      if (tursoClient && tursoClient.isTursoAvailable()) {
        try {
          const tursoRows = await tursoClient.getAllVerificationOrdersFromTurso();
          if (Array.isArray(tursoRows) && tursoRows.length > 0) {
            memoryVerificationOrders = tursoRows;
          }
        } catch (e) {}
      }
      if (memoryVerificationOrders.length === 0) {
        loadVerificationFromStore();
      }
    }

    const res = insertVerificationRecords(records, metadata, false);

    if (tursoClient && tursoClient.isTursoAvailable()) {
      try {
        const recordsToSync = (res.processedRecords && res.processedRecords.length > 0) ? res.processedRecords : records;
        await tursoClient.syncVerificationOrdersToTurso(recordsToSync);
      } catch (e) {
        console.error("[Turso] Lỗi đồng bộ verification orders lên Turso:", e.message);
      }
    }

    try {
      persistVerificationStore({ syncFullToTurso: false, generateDump: false });
    } catch (e) {}

    return {
      ...res,
      total: memoryVerificationOrders.length
    };
  });
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
      if (res.deletedOrderKeys && res.deletedOrderKeys.length > 0) {
        syncPromises.push(tursoClient.deleteOrderRowsInTurso(res.deletedOrderKeys));
      }
      if (syncPromises.length > 0) {
        await Promise.all(syncPromises);
      }
    } catch (e) {
      console.error("[Turso] Lỗi đồng bộ sau đối soát:", e.message);
    }
  }

  bumpOperationalVersion();
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
      const syncPromises = [];
      if (res.deletedKeys && res.deletedKeys.length > 0) {
        syncPromises.push(tursoClient.deleteOrderRowsInTurso(res.deletedKeys));
      }
      syncPromises.push(tursoClient.syncOrdersToTurso(memoryOrders));
      await Promise.all(syncPromises);
    } catch (e) {
      console.warn("[Turso] Lỗi đồng bộ deduplicate:", e.message);
    }
  }

  bumpOperationalVersion();
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

  bumpOperationalVersion();
  return res;
}

// =========================================================================
// CÁC HÀM TRUY VẤN DỮ LIỆU DASHBOARD PHÂN TRANG & TỐI ƯU HIỆU NĂNG
// =========================================================================

function extractDateOnly(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const mYmd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (mYmd) return `${mYmd[1]}-${mYmd[2].padStart(2, "0")}-${mYmd[3].padStart(2, "0")}`;
  const mDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mDmy) return `${mDmy[3]}-${mDmy[2].padStart(2, "0")}-${mDmy[1].padStart(2, "0")}`;
  return null;
}

function extractTimeOnly(dateStr) {
  if (!dateStr) return "00:00";
  const str = String(dateStr).trim();
  const match = str.match(/(?:^|\s|T)(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return "00:00";
}

function normalizeHour(hourStr, defaultVal = "00:00") {
  if (!hourStr) return defaultVal;
  const s = String(hourStr).trim();
  if (!s) return defaultVal;
  if (s === "24:00") return "23:59";
  const parts = s.split(":");
  const h = (parts[0] || "0").padStart(2, "0");
  const m = (parts[1] || "00").padStart(2, "0");
  return `${h}:${m}`;
}

function extractDateTime(dateStr) {
  if (!dateStr || dateStr === "-" || dateStr === "null" || dateStr === "undefined") return null;
  const str = String(dateStr).trim().replace("T", " ");
  // Format YYYY-MM-DD HH:mm:ss
  const mYmd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (mYmd) {
    const y = mYmd[1];
    const m = mYmd[2].padStart(2, "0");
    const d = mYmd[3].padStart(2, "0");
    const h = (mYmd[4] !== undefined ? mYmd[4] : "00").padStart(2, "0");
    const min = (mYmd[5] !== undefined ? mYmd[5] : "00").padStart(2, "0");
    const s = (mYmd[6] !== undefined ? mYmd[6] : "00").padStart(2, "0");
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }
  // Format DD/MM/YYYY HH:mm:ss
  const mDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (mDmy) {
    const y = mDmy[3];
    const m = mDmy[2].padStart(2, "0");
    const d = mDmy[1].padStart(2, "0");
    const h = (mDmy[4] !== undefined ? mDmy[4] : "00").padStart(2, "0");
    const min = (mDmy[5] !== undefined ? mDmy[5] : "00").padStart(2, "0");
    const s = (mDmy[6] !== undefined ? mDmy[6] : "00").padStart(2, "0");
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }
  const dObj = new Date(str);
  if (!isNaN(dObj.getTime())) {
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, "0");
    const day = String(dObj.getDate()).padStart(2, "0");
    const h = String(dObj.getHours()).padStart(2, "0");
    const min = String(dObj.getMinutes()).padStart(2, "0");
    const s = String(dObj.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  }
  return null;
}

function getVietnamTodayYmd() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnTime = new Date(utc + (7 * 3600000));
  const y = vnTime.getFullYear();
  const m = String(vnTime.getMonth() + 1).padStart(2, "0");
  const d = String(vnTime.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeComparisonDateRange(fromStr, toStr) {
  const dFrom = new Date(fromStr + "T00:00:00Z");
  const dTo = new Date(toStr + "T00:00:00Z");
  const diffDays = Math.max(1, Math.round((dTo - dFrom) / (24 * 3600 * 1000)) + 1);

  const prevToTime = dFrom.getTime() - (24 * 3600 * 1000);
  const prevFromTime = prevToTime - ((diffDays - 1) * 24 * 3600 * 1000);
  const prevDFrom = new Date(prevFromTime);
  const prevDTo = new Date(prevToTime);

  const formatYmd = d => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    diffDays,
    prevFrom: formatYmd(prevDFrom),
    prevTo: formatYmd(prevDTo)
  };
}

async function getLatestDateAsync(dateType = "ngayHuy") {
  const dateColumn = dateType === "ngayDuyet" ? "ngay_duoc_duyet" : "ngay_huy_don";
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const d = await tursoClient.getLatestDateFromTurso(dateColumn);
      if (d) return d;
    } catch (e) {}
  }

  // Fallback memory
  let maxD = "";
  const prop = dateType === "ngayDuyet" ? "ngayDuocDuyet" : "ngayHuyDon";
  memoryOrders.forEach(o => {
    const raw = o[prop];
    const d = extractDateOnly(raw);
    if (d && (!maxD || d > maxD)) maxD = d;
  });
  return maxD || getVietnamTodayYmd();
}

async function getDashboardDataAsync(params = {}) {
  const {
    dateType = "ngayHuy",
    dateFrom: reqDateFrom,
    dateTo: reqDateTo,
    hourFrom = "00:00",
    hourTo = "23:59"
  } = params;

  const dateColumn = dateType === "ngayDuyet" ? "ngay_duoc_duyet" : "ngay_huy_don";
  const dateProp = dateType === "ngayDuyet" ? "ngayDuocDuyet" : "ngayHuyDon";

  const latestDate = await getLatestDateAsync(dateType);
  const todayYmd = getVietnamTodayYmd();

  let dateFrom = reqDateFrom;
  let dateTo = reqDateTo;

  if (!dateFrom || !dateTo) {
    dateFrom = todayYmd;
    dateTo = todayYmd;
  }

  const { diffDays, prevFrom, prevTo } = computeComparisonDateRange(dateFrom, dateTo);

  // Khoảng bao phủ cả kỳ liền trước và kỳ hiện tại để lấy trong 1 query duy nhất
  const fullStart = `${prevFrom} 00:00:00`;
  const fullEnd = `${dateTo} 23:59:59`;

  let rawOrders = [];
  let opMap = {};

  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const [tursoOrders, tursoOps] = await Promise.all([
        tursoClient.getOrdersByDateRangeFromTurso(dateColumn, fullStart, fullEnd),
        tursoClient.getAllOperationalStatesFromTurso()
      ]);
      rawOrders = tursoOrders || [];
      opMap = tursoOps || {};
    } catch (e) {
      console.warn("[Turso] Lỗi query date range, fallback local store:", e.message);
    }
  }

  // Fallback SQLite hoặc memory nếu Turso không trả về hoặc bị lỗi
  if (rawOrders.length === 0 && memoryOrders.length === 0) {
    loadAllFromStore();
  }
  if (rawOrders.length === 0) {
    if (sqliteEngine) {
      try {
        const rows = sqliteEngine.prepare(
          `SELECT * FROM cancellation_orders WHERE ${dateColumn} >= ? AND ${dateColumn} <= ? ORDER BY ${dateColumn} DESC`
        ).all(fullStart, fullEnd);
        rawOrders = rows.map(r => ({
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
          sizeTeus: r.size_teus,
          tenTaiXe: r.ten_tai_xe,
          sdtTaiXe: r.sdt_tai_xe,
          tenNhaXe: r.ten_nha_xe,
          sdtNhaXe: r.sdt_nha_xe,
          lyDoTuChoi: r.ly_do_tu_choi,
          trangThaiXuLy: r.trang_thai_xu_ly,
          giaiTrinh: r.giai_trinh,
          giaiTrinhChiTiet: r.giai_trinh_chi_tiet || null,
          soXe: r.so_xe || null,
          nguoiTao: r.nguoi_tao || null,
          createdAt: r.created_at
        }));
      } catch (e) {}
    }
    if (rawOrders.length === 0) {
      rawOrders = memoryOrders.filter(o => {
        const d = o[dateProp];
        return d && d >= fullStart && d <= fullEnd;
      });
    }
  }

  // Map trạng thái CSKH / pending
  const orders = rawOrders.map(o => {
    const op = opMap[o.rowKey];
    return {
      ...o,
      isPending: op ? op.isPending : Boolean(o.isPending),
      trangThaiXuLy: (op && op.cskhStatus !== undefined && op.cskhStatus !== null) ? op.cskhStatus : (o.trangThaiXuLy || ""),
      giaiTrinh: (op && op.explanation !== undefined && op.explanation !== null) ? op.explanation : (o.giaiTrinh || ""),
      giaiTrinhChiTiet: (op && op.explanationDetail !== undefined) ? op.explanationDetail : (o.giaiTrinhChiTiet !== undefined ? o.giaiTrinhChiTiet : null)
    };
  });

  applyExpired3hCancellation(orders);

  // Phân chia thành currentRecords và previousRecords
  const currentRecords = [];
  const previousRecords = [];

  const hStart = normalizeHour(hourFrom, "00:00");
  const hEnd = normalizeHour(hourTo, "23:59");

  const currStart = `${dateFrom} ${hStart}:00`;
  const currEnd = `${dateTo} ${hEnd}:59`;
  const prevStart = `${prevFrom} ${hStart}:00`;
  const prevEnd = `${prevTo} ${hEnd}:59`;

  orders.forEach(o => {
    const rawVal = o[dateProp];
    const itemDateTime = extractDateTime(rawVal);
    if (!itemDateTime) return;

    if (itemDateTime >= currStart && itemDateTime <= currEnd) {
      currentRecords.push(o);
    } else if (itemDateTime >= prevStart && itemDateTime <= prevEnd) {
      previousRecords.push(o);
    }
  });

  // Đánh số lại stt 1..N cho currentRecords
  currentRecords.forEach((o, idx) => {
    o.stt = String(idx + 1);
  });

  return {
    success: true,
    filter: {
      dateType,
      dateFrom,
      dateTo,
      hourFrom: hStart,
      hourTo: hEnd,
      prevFrom,
      prevTo,
      diffDays
    },
    latestDate,
    today: todayYmd,
    currentRecords,
    previousRecords,
    totalRecords: currentRecords.length
  };
}

// Lấy danh sách tất cả các Depot hiện có trong hệ thống dữ liệu
function getAllDepotsFromDatabase() {
  const set = new Set(["AIC", "BSD", "CPD", "EAD", "EPD", "ETD", "GKP", "PMCM", "RCS", "SCD", "SLD", "TES", "THT"]);
  if (sqliteEngine) {
    try {
      const rows = sqliteEngine.prepare("SELECT DISTINCT depot FROM cancellation_orders WHERE depot IS NOT NULL AND trim(depot) != ''").all();
      if (rows && rows.length > 0) {
        rows.forEach(r => {
          if (r && r.depot) set.add(String(r.depot).trim().toUpperCase());
        });
      }
    } catch (e) {}
  }
  if (Array.isArray(memoryOrders)) {
    memoryOrders.forEach(o => {
      if (o && o.depot) set.add(String(o.depot).trim().toUpperCase());
    });
  }
  return Array.from(set).filter(Boolean).sort();
}

// Khởi chạy nạp dữ liệu kiểm tra đơn từ store
loadVerificationFromStore();

module.exports = {
  getAllDepotsFromDatabase,
  insertRecords,
  insertRecordsAsync,
  getAllRecords,
  getAllRecordsAsync,
  getDashboardDataAsync,
  getLatestDateAsync,
  updateOrderNote,
  updateOrderNoteAsync,
  getDatabaseStats,
  generateSqlDumpFile,
  clearDatabase,
  clearDatabaseAsync,
  deleteRecordsByUploadId,
  deleteRecordsByUploadIdAsync,
  getRecordsByUploadId,
  vacuumDatabase,
  syncAllToSupabase,
  SQL_DUMP_PATH,
  insertVerificationRecords,
  insertVerificationRecordsAsync,
  getAllVerificationRecords,
  getAllVerificationRecordsAsync,
  getVerificationRecordsByUploadId,
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
  insertManualOrderAsync,
  setOrderPending,
  batchSetOrdersPending,
  getPendingOrderKeys,
  getOperationalVersion,
  getOperationalVersionAsync,
  bumpOperationalVersion,
  getOperationalUpdates,
  getOperationalUpdatesAsync,
  formatVietnamDateTime,
  formatToVietnamParts,
  getVietnamTodayYmd
};
