/**
 * services/backupService.js
 * Quản trị Sao Lưu Cơ sở dữ liệu Cục bộ (Local Database Backup)
 * Lưu trữ bản sao lưu trực tiếp vào thư mục ngoài của người dùng (Documents/GPG_Database_Backups)
 * Tách biệt hoàn toàn khỏi mã nguồn và thư mục web, không tạo áp lực lưu trữ lên hệ thống.
 */

const fs = require("fs");
const path = require("path");

// Thư mục lưu trữ sao lưu nằm trực tiếp trên máy người dùng (ngoài project)
const USER_DOCUMENTS = path.join(process.env.USERPROFILE || "C:\\Users\\TinDD", "Documents");
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(USER_DOCUMENTS, "GPG_Database_Backups");
const SOURCE_DB_PATH = path.join(__dirname, "..", "data", "cancellation_orders.db");

// Số ngày giữ lại bản sao lưu (Xoay vòng tự động để không làm đầy ổ đĩa người dùng)
const RETENTION_DAYS = 30;

function ensureBackupDir() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[BackupService] Không thể tạo thư mục backup:", err.message);
  }
}

function formatBackupTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}_${h}${min}${s}`;
}

/**
 * Thực hiện tạo bản sao lưu mới từ cancellation_orders.db
 */
function createBackup(options = {}) {
  ensureBackupDir();

  if (!fs.existsSync(SOURCE_DB_PATH)) {
    throw new Error("Không tìm thấy file CSDL nguồn (cancellation_orders.db) để sao lưu.");
  }

  const timestampStr = formatBackupTimestamp(new Date());
  const backupFileName = `cancellation_orders_backup_${timestampStr}.db`;
  const destinationPath = path.join(BACKUP_DIR, backupFileName);

  // Sao chép an toàn
  fs.copyFileSync(SOURCE_DB_PATH, destinationPath);

  const stats = fs.statSync(destinationPath);
  const sizeMB = Number((stats.size / (1024 * 1024)).toFixed(2));

  // Tự động xoay vòng dọn dẹp các bản backup quá cũ (> RETENTION_DAYS)
  cleanOldBackups();

  return {
    success: true,
    fileName: backupFileName,
    filePath: destinationPath,
    backupDir: BACKUP_DIR,
    sizeMB,
    sizeBytes: stats.size,
    createdAt: new Date().toISOString()
  };
}

/**
 * Lấy danh sách các bản sao lưu hiện có trong thư mục máy tính
 */
function listBackups() {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backupFiles = files.filter(f => f.startsWith("cancellation_orders_backup_") && f.endsWith(".db"));

    return backupFiles.map(f => {
      const p = path.join(BACKUP_DIR, f);
      const s = fs.statSync(p);
      return {
        fileName: f,
        filePath: p,
        sizeMB: Number((s.size / (1024 * 1024)).toFixed(2)),
        createdAt: s.mtime.toISOString(),
        mtimeMs: s.mtimeMs
      };
    }).sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (err) {
    console.warn("[BackupService] Lỗi khi đọc danh sách sao lưu:", err.message);
    return [];
  }
}

/**
 * Tự động xóa các bản sao lưu quá cũ (> RETENTION_DAYS) để bảo vệ dung lượng ổ đĩa
 */
function cleanOldBackups() {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    files.forEach(f => {
      if (f.startsWith("cancellation_orders_backup_") && f.endsWith(".db")) {
        const p = path.join(BACKUP_DIR, f);
        const s = fs.statSync(p);
        if (now - s.mtimeMs > maxAgeMs) {
          try {
            fs.unlinkSync(p);
            console.log(`[BackupService] Đã tự động dọn bản sao lưu cũ quá ${RETENTION_DAYS} ngày: ${f}`);
          } catch (e) {}
        }
      }
    });
  } catch (err) {
    console.warn("[BackupService] Lỗi khi dọn bản sao lưu cũ:", err.message);
  }
}

/**
 * Tự động kiểm tra và chạy sao lưu hằng ngày khi khởi động server
 */
function checkAndRunDailyAutoBackup() {
  try {
    ensureBackupDir();
    const existing = listBackups();
    const todayPrefix = `cancellation_orders_backup_${formatBackupTimestamp().slice(0, 10)}`;
    const hasToday = existing.some(b => b.fileName.startsWith(todayPrefix));

    if (!hasToday && fs.existsSync(SOURCE_DB_PATH)) {
      console.log("[BackupService] Đang tạo bản sao lưu tự động đầu ngày...");
      const result = createBackup();
      console.log(`[BackupService] Đã tạo bản sao lưu an toàn tại: ${result.filePath} (${result.sizeMB} MB)`);
    } else {
      console.log(`[BackupService] Đã có bản sao lưu hôm nay (${existing.length} bản sao lưu trong thư mục máy tính: ${BACKUP_DIR})`);
    }
  } catch (err) {
    console.warn("[BackupService] Không thể chạy auto-backup:", err.message);
  }
}

module.exports = {
  BACKUP_DIR,
  SOURCE_DB_PATH,
  ensureBackupDir,
  createBackup,
  listBackups,
  cleanOldBackups,
  checkAndRunDailyAutoBackup
};
