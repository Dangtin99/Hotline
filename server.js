const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const {
  parseCancellationFile,
  aggregateCancellationData,
  generateMarkdownReport,
  validateAgainstSqlSchema,
  parseVerificationFile,
  applyExpired3hCancellation
} = require("./services/cancellationAnalyzer");
const {
  insertRecords,
  insertRecordsAsync,
  getAllRecords,
  getAllRecordsAsync,
  updateOrderNote,
  updateOrderNoteAsync,
  getDatabaseStats,
  deleteRecordsByUploadId,
  deleteRecordsByUploadIdAsync,
  clearDatabase,
  clearDatabaseAsync,
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
} = require("./services/database");
const tursoClient = require("./services/tursoClient");
const {
  authenticate,
  verifyToken,
  getAllUsers,
  setUserActive,
  resetPassword,
  changePassword
} = require("./services/authService");

const app = express();
const PORT = process.env.PORT || 5050;

// Đường dẫn lưu trữ lịch sử tải lên
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "upload_history.json");
const VERIFICATION_HISTORY_FILE = path.join(DATA_DIR, "verification_history.json");

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

// Hàm hỗ trợ đọc / ghi lịch sử đơn duyệt
async function loadHistoryAsync() {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const items = await tursoClient.getUploadHistoryFromTurso();
      if (Array.isArray(items) && items.length > 0) return items;
    } catch (e) {}
  }
  return loadHistory();
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("Không thể đọc lịch sử, khởi tạo mới:", err.message);
  }
  return [];
}

async function saveHistoryAsync(historyItem) {
  if (tursoClient) {
    try {
      await tursoClient.saveUploadHistoryItemToTurso(historyItem);
    } catch (e) {}
  }
  try {
    const list = loadHistory();
    list.unshift(historyItem);
    saveHistory(list);
  } catch (e) {}
}

function saveHistory(historyList) {
  try {
    if (fs.existsSync(DATA_DIR)) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyList, null, 2), "utf8");
    }
  } catch (err) {
    // Read-only filesystem trên serverless
  }
}

// Hàm hỗ trợ đọc / ghi lịch sử kiểm tra đơn
async function loadVerificationHistoryAsync() {
  if (tursoClient && tursoClient.isTursoAvailable()) {
    try {
      const items = await tursoClient.getVerificationHistoryFromTurso();
      if (Array.isArray(items) && items.length > 0) return items;
    } catch (e) {}
  }
  return loadVerificationHistory();
}

function loadVerificationHistory() {
  try {
    if (fs.existsSync(VERIFICATION_HISTORY_FILE)) {
      const data = fs.readFileSync(VERIFICATION_HISTORY_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("Không thể đọc lịch sử kiểm tra đơn, khởi tạo mới:", err.message);
  }
  return [];
}

async function saveVerificationHistoryAsync(historyItem) {
  if (tursoClient) {
    try {
      await tursoClient.saveVerificationHistoryItemToTurso(historyItem);
    } catch (e) {}
  }
  try {
    const list = loadVerificationHistory();
    list.unshift(historyItem);
    saveVerificationHistory(list);
  } catch (e) {}
}

function saveVerificationHistory(historyList) {
  try {
    if (fs.existsSync(DATA_DIR)) {
      fs.writeFileSync(VERIFICATION_HISTORY_FILE, JSON.stringify(historyList, null, 2), "utf8");
    }
  } catch (err) {
    // Read-only filesystem trên serverless
  }
}

// Khởi tạo bản ghi mẫu ban đầu vào lịch sử nếu trống hoặc cập nhật records
(function initDefaultSample() {
  let history = loadHistory();
  const sampleFilePath = path.join(__dirname, "sample-data", "mau_bao_cao_don_huy.csv");
  if (fs.existsSync(sampleFilePath)) {
    try {
      const content = fs.readFileSync(sampleFilePath, "utf8");
      const validation = validateAgainstSqlSchema(content);
      const records = parseCancellationFile(content);
      const analytics = aggregateCancellationData(records);

      let updated = false;
      if (history.length === 0) {
        history.push({
          id: "UP-20261002-001",
          fileName: "mau_bao_cao_don_huy.csv",
          fileSize: "15.4 KB",
          uploadedAt: "2026-10-02 08:30:00",
          recordCount: records.length,
          teusCount: analytics.kpis.totalTeus,
          matchPercent: validation.matchPercent,
          isValid: validation.isValid,
          validation: validation,
          data: analytics
        });
        updated = true;
      } else {
        // Cập nhật records nếu lịch sử cũ chưa có mảng records
        history.forEach(item => {
          if (!item.data || !item.data.records || item.data.records.length === 0) {
            item.data = { ...item.data, records };
            updated = true;
          }
        });
      }
      if (updated) {
        saveHistory(history);
      }

      // Đảm bảo CSDL SQL có dữ liệu ban đầu nếu còn trống
      if (getAllRecords().length === 0) {
        insertRecords(records, {
          uploadId: "UP-20261002-001",
          fileName: "mau_bao_cao_don_huy.csv",
          uploadedAt: "2026-10-02 08:30:00"
        });
      }
    } catch (e) {
      console.error("Lỗi khởi tạo mẫu:", e.message);
    }
  }
})();

// Cấu hình Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
});

/**
 * Middleware: Xác thực quyền truy cập qua Bearer Token
 */
function authRequired(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập. Vui lòng cung cấp mã xác thực Bearer token." });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: "Phiên làm việc không hợp lệ hoặc đã hết hạn." });
  }

  req.user = payload;
  next();
}

/**
 * Middleware: Xác thực quyền Quản trị viên (admin)
 */
function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user && req.user.role === "admin") {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền thực hiện thao tác này. Yêu cầu quyền Quản trị viên (admin)."
    });
  });
}

/**
 * =========================================================================
 * AUTHENTICATION APIs
 * =========================================================================
 */

/**
 * API: Đăng nhập hệ thống
 */
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên đăng nhập và mật khẩu." });
    }

    const result = authenticate(username, password);
    if (!result || !result.success) {
      const statusCode = (result && result.code === "ACCOUNT_INACTIVE") ? 403 : 401;
      return res.status(statusCode).json({
        success: false,
        code: result ? result.code : undefined,
        message: result ? result.message : "Tên đăng nhập hoặc mật khẩu không chính xác."
      });
    }

    return res.json({
      success: true,
      message: "Đăng nhập thành công.",
      token: result.token,
      user: result.user
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * API: Lấy thông tin tài khoản hiện tại
 */
app.get("/api/auth/me", authRequired, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

/**
 * API: Người dùng tự đổi mật khẩu
 */
app.post("/api/auth/change-password", authRequired, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const result = changePassword(req.user.username, currentPassword, newPassword);
    return res.json({ success: true, message: result.message });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * API: Đăng xuất
 */
app.post("/api/auth/logout", (req, res) => {
  return res.json({ success: true, message: "Đã đăng xuất thành công." });
});

/**
 * =========================================================================
 * ADMIN USER MANAGEMENT APIs (Dành riêng cho Admin)
 * =========================================================================
 */

/**
 * API: Danh sách toàn bộ tài khoản
 */
app.get("/api/admin/users", adminRequired, (req, res) => {
  try {
    const users = getAllUsers();
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * API: Admin điều chỉnh trạng thái isActive của user
 */
app.post("/api/admin/users/:id/toggle-active", adminRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    // Tránh admin tự vô hiệu hóa tài khoản của chính mình
    if (String(id).toLowerCase() === String(req.user.username).toLowerCase() && !isActive) {
      return res.status(400).json({
        success: false,
        message: "Không thể tự vô hiệu hóa tài khoản quản trị viên đang đăng nhập."
      });
    }

    const updated = setUserActive(id, isActive);
    return res.json({
      success: true,
      message: `Đã ${updated.isActive ? "kích hoạt" : "vô hiệu hóa"} tài khoản ${updated.username} thành công.`,
      user: updated
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * API: Admin đặt lại mật khẩu cho user
 */
app.post("/api/admin/users/:id/reset-password", adminRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    const result = resetPassword(id, newPassword);
    return res.json({
      success: true,
      message: `Đã đặt lại mật khẩu cho tài khoản ${result.username} thành công.`
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * API: Kiểm tra cấu trúc file có khớp với form SQL không (Không lưu)
 */
app.post("/api/validate", authRequired, upload.single("file"), (req, res) => {
  try {
    let inputBufferOrText;
    if (req.file) {
      inputBufferOrText = req.file.buffer;
    } else if (req.body && req.body.csvText) {
      inputBufferOrText = req.body.csvText;
    } else {
      return res.status(400).json({ status: "error", message: "Vui lòng chọn file để kiểm tra." });
    }

    const validation = validateAgainstSqlSchema(inputBufferOrText);
    return res.json({
      status: "success",
      fileName: req.file ? req.file.originalname : "data.csv",
      validation
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Import & Lưu dữ liệu vào hệ thống (Sau khi kiểm tra hoặc import trực tiếp)
 */
app.post("/api/upload", authRequired, upload.single("file"), async (req, res) => {
  try {
    let inputBufferOrText;
    let fileName = "data.csv";
    let fileSizeStr = "0 KB";

    if (req.file) {
      inputBufferOrText = req.file.buffer;
      fileName = req.file.originalname;
      fileSizeStr = `${(req.file.size / 1024).toFixed(1)} KB`;
    } else if (req.body && req.body.csvText) {
      inputBufferOrText = req.body.csvText;
      fileSizeStr = `${(Buffer.byteLength(inputBufferOrText, 'utf8') / 1024).toFixed(1)} KB`;
    } else {
      return res.status(400).json({ status: "error", message: "Vui lòng tải lên file Excel hoặc CSV." });
    }

    // 1. Kiểm tra cấu trúc SQL
    const validation = validateAgainstSqlSchema(inputBufferOrText);

    // 2. Phân tích & Làm sạch
    const records = parseCancellationFile(inputBufferOrText);
    const analytics = aggregateCancellationData(records);

    const newId = `UP-${Date.now()}`;
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

    // 3. Tự động lưu trữ và tích lũy TOÀN BỘ dữ liệu vào SQL Database (Chờ Turso Cloud hoàn tất)
    const dbResult = await insertRecordsAsync(records, {
      uploadId: newId,
      fileName,
      uploadedAt: nowStr
    });

    // 4. Ghi vào lịch sử từng đợt tải (lưu trữ đồng bộ lên Turso Cloud)
    const historyItem = {
      id: newId,
      fileName,
      fileSize: fileSizeStr,
      uploadedAt: nowStr,
      recordCount: records.length,
      teusCount: analytics.kpis.totalTeus,
      matchPercent: validation.matchPercent,
      isValid: validation.isValid,
      validation: validation,
      data: analytics
    };

    await saveHistoryAsync(historyItem);

    return res.json({
      status: "success",
      message: `Đã lưu thành công ${records.length} đơn hàng vào SQL Database! (Tổng tích lũy hiện tại: ${dbResult.total} đơn)`,
      uploadId: newId,
      totalAccumulated: dbResult.total,
      inserted: dbResult.inserted,
      updated: dbResult.updated,
      validation,
      data: analytics
    });
  } catch (err) {
    console.error("Lỗi khi import file:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Lấy toàn bộ dữ liệu tích lũy trong Cơ sở dữ liệu SQL (Tất cả các file đã tải)
 */
app.get("/api/all-data", authRequired, async (req, res) => {
  try {
    const allRecords = await getAllRecordsAsync();
    const analytics = aggregateCancellationData(allRecords);
    const stats = getDatabaseStats();

    return res.json({
      status: "success",
      isAllData: true,
      fileName: `Toàn bộ CSDL SQL (${stats.fileCount} file đã tải, ${allRecords.length} đơn)`,
      totalRecords: allRecords.length,
      totalTeus: stats.totalTeus,
      stats,
      records: allRecords,
      data: analytics
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Tải file SQL Dump (.sql) của toàn bộ cơ sở dữ liệu
 */
app.get("/api/download-sql", authRequired, (req, res) => {
  try {
    if (fs.existsSync(SQL_DUMP_PATH)) {
      res.setHeader("Content-Disposition", 'attachment; filename="cancellation_orders.sql"');
      res.setHeader("Content-Type", "application/sql");
      return res.sendFile(SQL_DUMP_PATH);
    }
    return res.status(404).json({ status: "error", message: "Chưa có file script SQL." });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Tải file Excel bản mẫu theo từng loại tab
 * - approved: Mẫu Đăng Tải Dữ Liệu Đơn Duyệt (mau_dang_tai_don_duyet.xlsx)
 * - verification: Mẫu Đăng Tải Dữ Liệu Kiểm Tra Đơn (mau_kiem_tra_don.xlsx)
 */
app.get("/api/template/:type", (req, res) => {
  try {
    const { type } = req.params;
    let filePath = "";
    let downloadFileName = "";

    if (type === "approved" || type === "cancellation") {
      filePath = path.join(__dirname, "sample-data", "mau_dang_tai_don_duyet.xlsx");
      downloadFileName = "mau_dang_tai_don_duyet.xlsx";
    } else if (type === "verification" || type === "eir") {
      filePath = path.join(__dirname, "sample-data", "mau_kiem_tra_don.xlsx");
      downloadFileName = "mau_kiem_tra_don.xlsx";
    } else {
      return res.status(404).json({ status: "error", message: "Loại bản mẫu không hợp lệ." });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ status: "error", message: "Tệp bản mẫu chưa được tạo trên máy chủ." });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Cập nhật ghi chú CSKH hoặc giải trình trực tiếp vào database
 */
app.post("/api/orders/note", authRequired, async (req, res) => {
  try {
    const { rowKey, status, giaiTrinh } = req.body || {};
    if (!rowKey) {
      return res.status(400).json({ status: "error", message: "Thiếu rowKey." });
    }
    await updateOrderNoteAsync(rowKey, { status, giaiTrinh });
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Cập nhật dữ liệu đối soát từ Bảng check đơn (eir_cancellation_orders)
 * Kích hoạt khi người dùng chọn nút Cập Nhật Dữ Liệu ở trang chi tiết
 */
app.post("/api/orders/update-from-check", authRequired, async (req, res) => {
  try {
    const result = await updateOrdersFromCheckDataAsync();
    return res.json({
      status: "success",
      ...result
    });
  } catch (err) {
    console.error("Lỗi khi cập nhật đối soát từ bảng check đơn:", err);
    return res.status(500).json({
      status: "error",
      message: `Lỗi hệ thống khi cập nhật: ${err.message}`
    });
  }
});

/**
 * API: Lọc đơn trùng theo số EIR
 * Giữ lại đơn có Ngày được duyệt lớn nhất, tự động xóa các dòng có ngày duyệt bé hơn
 */
app.post("/api/orders/deduplicate-by-eir", authRequired, async (req, res) => {
  try {
    const result = await deduplicateOrdersByEirAsync();
    return res.json({
      status: "success",
      ...result
    });
  } catch (err) {
    console.error("Lỗi khi lọc đơn trùng theo EIR:", err);
    return res.status(500).json({
      status: "error",
      message: `Lỗi hệ thống khi lọc đơn trùng: ${err.message}`
    });
  }
});

/**
 * API: Thêm đơn hàng thủ công trực tiếp từ giao diện bảng
 */
app.post("/api/orders/manual", authRequired, async (req, res) => {
  try {
    const orderData = req.body;
    if (!orderData || typeof orderData !== "object") {
      return res.status(400).json({
        status: "error",
        message: "Dữ liệu gửi lên không hợp lệ."
      });
    }

    if (!orderData.soBooking && !orderData.soContainer && !orderData.soEir) {
      return res.status(400).json({
        status: "error",
        message: "Vui lòng nhập ít nhất Số Booking, Số Container hoặc Số EIR."
      });
    }

    const result = await insertManualOrderAsync(orderData);
    return res.json({
      status: "success",
      ...result
    });
  } catch (err) {
    console.error("Lỗi khi thêm đơn hàng thủ công:", err);
    return res.status(500).json({
      status: "error",
      message: `Lỗi hệ thống khi thêm đơn thủ công: ${err.message}`
    });
  }
});

/**
 * API: Kiểm tra trạng thái liên kết Turso Cloud SQLite
 */
app.get("/api/turso/status", authRequired, async (req, res) => {
  try {
    const turso = require("./services/tursoClient");
    const conn = await turso.testConnection();
    const rowCount = await turso.getTursoRowCount();
    const allRecords = getAllRecords();

    return res.json({
      status: "success",
      connected: conn.success,
      version: conn.version,
      serverTime: conn.time,
      tursoRowCount: rowCount,
      localTotalCount: allRecords.length,
      error: conn.message
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Kích hoạt đồng bộ hóa toàn bộ dữ liệu SQL lên Turso Cloud SQLite
 */
app.post("/api/turso/sync", authRequired, async (req, res) => {
  try {
    const turso = require("./services/tursoClient");
    const allRecords = getAllRecords();
    const result = await turso.syncOrdersToTurso(allRecords);

    return res.json({
      status: "success",
      message: `Đã đồng bộ thành công ${result.synced}/${result.total} đơn hàng lên Turso Cloud SQLite!`,
      syncedCount: result.synced,
      totalCount: result.total
    });
  } catch (err) {
    console.error("Lỗi đồng bộ Turso:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Lấy danh sách lịch sử đăng tải
 */
app.get("/api/history", authRequired, async (req, res) => {
  try {
    const history = await loadHistoryAsync();
    // Ẩn chi tiết data lớn khi chỉ lấy danh sách lịch sử
    const summary = history.map(item => ({
      id: item.id,
      fileName: item.fileName,
      fileSize: item.fileSize,
      uploadedAt: item.uploadedAt,
      recordCount: item.recordCount,
      teusCount: item.teusCount,
      matchPercent: item.matchPercent,
      isValid: item.isValid
    }));
    return res.json({ status: "success", data: summary });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Lấy chi tiết phân tích của 1 lần đăng tải trong lịch sử
 */
app.get("/api/history/:id", authRequired, async (req, res) => {
  try {
    const history = await loadHistoryAsync();
    const item = history.find(h => h.id === req.params.id);
    if (!item) {
      return res.status(404).json({ status: "error", message: "Không tìm thấy dữ liệu đã tải!" });
    }

    if (item.data && Array.isArray(item.data.records)) {
      applyExpired3hCancellation(item.data.records);
    }

    if (req.query.format === "markdown") {
      const markdown = generateMarkdownReport(item.data);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      return res.send(markdown);
    }

    return res.json({
      status: "success",
      fileName: item.fileName,
      uploadedAt: item.uploadedAt,
      validation: item.validation,
      data: item.data
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Xóa 1 lần đăng tải khỏi lịch sử
 */
app.delete("/api/history/:id", authRequired, async (req, res) => {
  try {
    let history = await loadHistoryAsync();
    const beforeCount = history.length;
    history = history.filter(h => h.id !== req.params.id);
    if (history.length === beforeCount) {
      return res.status(404).json({ status: "error", message: "Bản ghi không tồn tại hoặc đã bị xóa." });
    }
    saveHistory(history);
    if (tursoClient) {
      await tursoClient.deleteUploadHistoryItemFromTurso(req.params.id);
    }
    await deleteRecordsByUploadIdAsync(req.params.id);
    return res.json({ status: "success", message: "Đã xóa dữ liệu đăng tải thành công!" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Xóa toàn bộ lịch sử đăng tải
 */
app.delete("/api/history", authRequired, async (req, res) => {
  try {
    saveHistory([]);
    if (tursoClient) {
      await tursoClient.clearUploadHistoryInTurso();
    }
    await clearDatabaseAsync();
    return res.json({ status: "success", message: "Đã dọn dẹp sạch toàn bộ lịch sử dữ liệu." });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * =========================================================================
 * VERIFICATION ORDERS APIs (ĐĂNG TẢI & QUẢN LÝ DỮ LIỆU KIỂM TRA ĐƠN)
 * =========================================================================
 */

/**
 * API: Đăng tải tệp dữ liệu kiểm tra đơn & Lưu trữ vào Bảng SQL (eir_cancellation_orders)
 */
app.post("/api/verification/upload", authRequired, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "Vui lòng chọn file kiểm tra đơn (.xlsx, .xls, .csv) để tải lên." });
    }

    const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const fileSizeStr = req.file.size > 1024 * 1024
      ? (req.file.size / (1024 * 1024)).toFixed(2) + " MB"
      : (req.file.size / 1024).toFixed(1) + " KB";

    // 1. Phân tích và trích xuất dữ liệu chuẩn form SQL eir_cancellation_orders
    const records = parseVerificationFile(req.file.buffer);

    const now = new Date();
    const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ` +
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const newId = `VER-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Date.now()).slice(-4)}`;

    // 2. Lưu trữ toàn bộ bảng SQL lên hệ thống cơ sở dữ liệu (Chờ Turso Cloud hoàn tất)
    const dbResult = await insertVerificationRecordsAsync(records, {
      uploadId: newId,
      fileName,
      uploadedAt: nowStr
    });

    const historyItem = {
      id: newId,
      fileName,
      fileSize: fileSizeStr,
      uploadedAt: nowStr,
      recordCount: records.length,
      insertedCount: dbResult.inserted,
      updatedCount: dbResult.updated,
      totalAccumulated: dbResult.total,
      uploadedBy: req.user ? req.user.username : "system"
    };

    await saveVerificationHistoryAsync(historyItem);

    return res.json({
      status: "success",
      message: `Đã lưu thành công ${records.length} đơn kiểm tra vào bảng SQL (eir_cancellation_orders)! (Tổng tích lũy hiện tại: ${dbResult.total} đơn)`,
      uploadId: newId,
      totalAccumulated: dbResult.total,
      inserted: dbResult.inserted,
      updated: dbResult.updated,
      data: historyItem
    });
  } catch (err) {
    console.error("Lỗi khi tải file kiểm tra đơn:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Lấy danh sách lịch sử đăng tải kiểm tra đơn
 */
app.get("/api/verification/history", authRequired, async (req, res) => {
  try {
    const history = await loadVerificationHistoryAsync();
    return res.json({ status: "success", data: history });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Lấy toàn bộ dữ liệu kiểm tra đơn đã tích lũy trong Bảng SQL (eir_cancellation_orders)
 */
app.get("/api/verification/all-data", authRequired, async (req, res) => {
  try {
    const allRecords = await getAllVerificationRecordsAsync();
    const stats = getVerificationDatabaseStats();

    return res.json({
      status: "success",
      totalRecords: allRecords.length,
      stats,
      records: allRecords
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Tải file SQL Dump (.sql) của bảng dữ liệu kiểm tra đơn
 */
app.get("/api/verification/download-sql", authRequired, (req, res) => {
  try {
    if (fs.existsSync(VERIFICATION_SQL_DUMP_PATH)) {
      res.setHeader("Content-Disposition", 'attachment; filename="eir_cancellation_orders.sql"');
      res.setHeader("Content-Type", "application/sql");
      return res.sendFile(VERIFICATION_SQL_DUMP_PATH);
    }
    return res.status(404).json({ status: "error", message: "Chưa có file script SQL cho dữ liệu kiểm tra đơn." });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Xóa 1 đợt tải kiểm tra đơn khỏi lịch sử và cơ sở dữ liệu SQL
 */
app.delete("/api/verification/history/:id", authRequired, async (req, res) => {
  try {
    let history = await loadVerificationHistoryAsync();
    const beforeCount = history.length;
    history = history.filter(h => h.id !== req.params.id);
    if (history.length === beforeCount) {
      return res.status(404).json({ status: "error", message: "Bản ghi không tồn tại hoặc đã bị xóa." });
    }
    saveVerificationHistory(history);
    if (tursoClient) {
      await tursoClient.deleteVerificationHistoryItemFromTurso(req.params.id);
    }
    await deleteVerificationRecordsByUploadIdAsync(req.params.id);
    return res.json({ status: "success", message: "Đã xóa dữ liệu kiểm tra đơn khỏi hệ thống SQL thành công!" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Xóa toàn bộ lịch sử và bảng SQL dữ liệu kiểm tra đơn
 */
app.delete("/api/verification/history", authRequired, async (req, res) => {
  try {
    saveVerificationHistory([]);
    if (tursoClient) {
      await tursoClient.clearAllVerificationOrdersInTurso();
    }
    await clearAllVerificationRecordsAsync();
    return res.json({ status: "success", message: "Đã dọn dẹp sạch toàn bộ lịch sử và bảng SQL dữ liệu kiểm tra đơn." });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Phân tích nhanh trực tiếp
 */
app.post("/api/analyze", authRequired, upload.single("file"), (req, res) => {
  try {
    let inputBufferOrText;
    if (req.file) {
      inputBufferOrText = req.file.buffer;
    } else if (req.body && req.body.csvText) {
      inputBufferOrText = req.body.csvText;
    } else {
      return res.status(400).json({ status: "error", message: "Vui lòng đính kèm file." });
    }

    const records = parseCancellationFile(inputBufferOrText);
    const analytics = aggregateCancellationData(records);

    if (req.query.format === "markdown") {
      const markdown = generateMarkdownReport(analytics);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      return res.send(markdown);
    }

    return res.json({ status: "success", filename: req.file ? req.file.originalname : "data.csv", data: analytics });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * API: Lấy dữ liệu mẫu ban đầu (Fallback khi chưa có upload)
 */
app.get("/api/sample", authRequired, (req, res) => {
  try {
    const history = loadHistory();
    if (history.length > 0) {
      return res.json({
        status: "success",
        fileName: history[0].fileName,
        uploadedAt: history[0].uploadedAt,
        data: history[0].data
      });
    }

    const sampleFilePath = path.join(__dirname, "sample-data", "mau_bao_cao_don_huy.csv");
    if (fs.existsSync(sampleFilePath)) {
      const content = fs.readFileSync(sampleFilePath, "utf8");
      const records = parseCancellationFile(content);
      const analytics = aggregateCancellationData(records);
      return res.json({
        status: "success",
        fileName: "mau_bao_cao_don_huy.csv",
        uploadedAt: "2026-10-02 08:30:00",
        data: analytics
      });
    }

    return res.status(404).json({ status: "error", message: "Chưa có dữ liệu mẫu." });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "Logistics Cancellation Analytics Engine", time: new Date() });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=====================================================`);
    console.log(`Hệ thống Phân tích Đơn Hủy Logistics đang chạy tại:`);
    console.log(`http://localhost:${PORT}`);
    console.log(`=====================================================`);
  });
}

module.exports = app;

// Phòng chống crash máy chủ khi có lỗi mạng đột ngột (như ECONNRESET từ Supabase / Cloudflare)
process.on("uncaughtException", (err) => {
  if (err.code === "ECONNRESET" || err.code === "EPIPE") {
    console.warn("Cảnh báo mạng ngoại vi (đã được cách ly tự động):", err.message);
  } else {
    console.error("Uncaught Exception:", err);
  }
});

process.on("unhandledRejection", (reason) => {
  console.warn("Unhandled Rejection (đã được cách ly tự động):", reason);
});

