const path = require('path');
const edepotClient = require('./edepotClient');
const db = require('./database');
const supabaseClient = require('./supabaseClient');
const rebookingAnalyzer = require('./rebookingAnalyzer');

// In-memory log of recent automatic sync executions
const recentSyncLogs = [];
const MAX_LOGS = 50;

/**
 * Định dạng Date object thành chuỗi 'YYYY-MM-DD HH:mm:ss' theo múi giờ Việt Nam
 */
function formatVnDateTime(date) {
  const d = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Tính toán khung giờ tròn (vd: lúc 14:00 lấy từ 13:00:00 đến 14:00:00)
 */
function getRoundHourWindow(refDate = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(refDate.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  // Làm tròn về đầu giờ hiện tại
  const endHour = new Date(d);
  endHour.setMinutes(0, 0, 0);
  
  // Đúng 1 tiếng trước (H - 1:00:00)
  const startHour = new Date(endHour.getTime() - 60 * 60 * 1000);
  
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  return {
    from: fmt(startHour),
    to: fmt(endHour)
  };
}

/**
 * Thực hiện đồng bộ dữ liệu eDepot trong khoảng thời gian xác định
 * Mặc định: Lọc đúng tròn 1 giờ trước (Ví dụ: Lúc 13:00 lọc 12:00:00 -> 13:00:00)
 * @param {Object} options
 * @param {number} [options.minutesBack] - Tùy chọn lùi theo số phút
 * @param {string} [options.customFrom] - Tùy chọn ngày bắt đầu cụ thể 'YYYY-MM-DD HH:mm:ss'
 * @param {string} [options.customTo] - Tùy chọn ngày kết thúc cụ thể 'YYYY-MM-DD HH:mm:ss'
 */
async function syncOrdersWindow(options = {}) {
  const startTime = Date.now();
  const now = new Date();

  let fromDate = options.customFrom;
  let toDate = options.customTo;

  if (!fromDate || !toDate) {
    if (options.minutesBack) {
      toDate = formatVnDateTime(now);
      fromDate = formatVnDateTime(new Date(now.getTime() - options.minutesBack * 60 * 1000));
    } else {
      // Mặc định chuẩn xác: Lọc đúng tròn 1 giờ trước (Hiện tại - 1 giờ)
      const roundWindow = getRoundHourWindow(now);
      fromDate = roundWindow.from;
      toDate = roundWindow.to;
    }
  }

  console.log(`[eDepot Sync] Bắt đầu đồng bộ tự động từ [${fromDate}] đến [${toDate}]...`);

  const logEntry = {
    id: 'SYNC-' + Date.now(),
    startedAt: new Date().toISOString(),
    fromDate,
    toDate,
    status: 'RUNNING',
    ordersFetched: 0,
    ordersSynced: 0,
    reconciliationUpdated: 0,
    durationMs: 0,
    error: null
  };

  try {
    // 1. Lấy dữ liệu trực tiếp từ eDepot API qua OAuth PKCE
    const { orders } = await edepotClient.fetchOrders({
      fromDate,
      toDate,
      page: 1,
      pageSize: 1000
    });

    logEntry.ordersFetched = orders.length;
    console.log(`[eDepot Sync] Trích xuất thành công ${orders.length} đơn hàng từ eDepot.`);

    if (orders.length === 0) {
      logEntry.status = 'SUCCESS';
      logEntry.durationMs = Date.now() - startTime;
      recentSyncLogs.unshift(logEntry);
      if (recentSyncLogs.length > MAX_LOGS) recentSyncLogs.pop();
      return { success: true, count: 0, message: 'Không có đơn mới trong khung giờ này', log: logEntry };
    }

    // 2. Tạo metadata upload
    const nowVn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const pad = (n) => String(n).padStart(2, '0');
    const dateTag = `${nowVn.getFullYear()}${pad(nowVn.getMonth() + 1)}${pad(nowVn.getDate())}`;
    const timeTag = `${pad(nowVn.getHours())}${pad(nowVn.getMinutes())}${pad(nowVn.getSeconds())}`;
    const uploadId = `VER-${dateTag}-${timeTag}-AUTO`;
    const fileName = `edepot_auto_${dateTag}_${pad(nowVn.getHours())}h.xlsx`;

    const metadata = {
      id: uploadId,
      uploadId,
      fileName,
      totalRows: orders.length,
      recordCount: orders.length,
      insertedCount: orders.length,
      updatedCount: 0,
      totalAccumulated: orders.length,
      uploadedBy: 'Vercel Cron (Auto)',
      uploadedAt: nowVn.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    };

    // Gắn uploadId vào từng đơn
    orders.forEach(o => { o.uploadId = uploadId; });

    // 3. Nạp vào Local Store & SQLite
    if (typeof db.insertVerificationRecordsAsync === 'function') {
      try {
        await db.insertVerificationRecordsAsync(orders, metadata);
        logEntry.ordersSynced = orders.length;
      } catch (dbErr) {
        console.warn('[eDepot Sync] Lỗi khi lưu vào local database:', dbErr.message);
      }
    }

    // 4. Đồng bộ lên Supabase Cloud Database (nếu có cấu hình)
    if (supabaseClient && supabaseClient.isSupabaseAvailable()) {
      try {
        const supaResult = await supabaseClient.syncVerificationOrdersToSupabase(orders, uploadId);
        console.log('[eDepot Sync] Đã đồng bộ lên Supabase:', supaResult);
        await supabaseClient.saveVerificationHistoryItemToSupabase(metadata);
      } catch (supaErr) {
        console.warn('[eDepot Sync] Lỗi khi lưu Supabase:', supaErr.message);
      }
    }

    // 5. Làm mới cache & kích hoạt tự động Pipeline Gom Đơn 4 Vòng
    try {
      rebookingAnalyzer.invalidateRebookingCache();
      if (typeof db.updateOrdersFromCheckDataAsync === 'function') {
        const updateRes = await db.updateOrdersFromCheckDataAsync();
        logEntry.reconciliationUpdated = updateRes && updateRes.updatedCount ? updateRes.updatedCount : 0;
        console.log(`[eDepot Sync] Rebooking reconciliation hoàn tất: Cập nhật ${logEntry.reconciliationUpdated} đơn.`);
      }
    } catch (recErr) {
      console.warn('[eDepot Sync] Lỗi khi chạy đối soát rebooking:', recErr.message);
    }

    logEntry.status = 'SUCCESS';
    logEntry.durationMs = Date.now() - startTime;
    recentSyncLogs.unshift(logEntry);
    if (recentSyncLogs.length > MAX_LOGS) recentSyncLogs.pop();

    console.log(`[eDepot Sync] Hoàn thành đồng bộ trong ${logEntry.durationMs}ms. Số đơn: ${orders.length}`);

    return {
      success: true,
      count: orders.length,
      uploadId,
      durationMs: logEntry.durationMs,
      log: logEntry
    };
  } catch (err) {
    logEntry.status = 'ERROR';
    logEntry.error = err.message;
    logEntry.durationMs = Date.now() - startTime;
    recentSyncLogs.unshift(logEntry);
    if (recentSyncLogs.length > MAX_LOGS) recentSyncLogs.pop();

    console.error('[eDepot Sync] Lỗi đồng bộ eDepot:', err.message);
    return {
      success: false,
      error: err.message,
      durationMs: logEntry.durationMs,
      log: logEntry
    };
  }
}

/**
 * Lấy lịch sử các lần đồng bộ gần nhất
 */
function getSyncLogs() {
  return recentSyncLogs;
}

module.exports = {
  syncOrdersWindow,
  getSyncLogs
};
