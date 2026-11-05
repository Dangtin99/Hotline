// api/cron/update-orders.js
// Vercel Cron Endpoint - Tự động thực hiện Cập Nhật Dữ Liệu đối soát từ Bảng Check Đơn vào phút 30 mỗi giờ
const db = require('../../services/database');
let rebookingAnalyzer = null;
try {
  rebookingAnalyzer = require('../../services/rebookingAnalyzer');
} catch (e) {}

module.exports = async (req, res) => {
  // 1. Kiểm tra phương thức
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ chấp nhận phương thức GET hoặc POST' });
  }

  // 2. Bảo mật xác thực CRON_SECRET (nếu có cấu hình)
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const querySecret = req.query ? req.query.secret : null;

    if (bearerToken !== expectedSecret && querySecret !== expectedSecret) {
      console.warn('[Vercel Cron] Yêu cầu bị từ chối: CRON_SECRET không chính xác hoặc thiếu header Authorization');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Mã CRON_SECRET không hợp lệ.'
      });
    }
  }

  // 3. Thực thi đối soát và đồng bộ lên Supabase
  try {
    const startTime = Date.now();
    console.log('[Auto Reconcile Cron] Bắt đầu tự động cập nhật dữ liệu đối soát...');

    const result = await db.updateOrdersFromCheckDataAsync();

    if (rebookingAnalyzer && typeof rebookingAnalyzer.invalidateRebookingCache === 'function') {
      try {
        rebookingAnalyzer.invalidateRebookingCache();
      } catch (cacheErr) {
        console.warn('[Auto Reconcile Cron] Lỗi xóa cache rebooking:', cacheErr.message);
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Auto Reconcile Cron] Hoàn thành cập nhật trong ${durationMs}ms:`, {
      updatedUnpaid: result.updatedUnpaid || 0,
      updatedCancelled: result.updatedCancelled || 0,
      modifiedCount: result.modifiedOrders ? result.modifiedOrders.length : 0
    });

    return res.status(200).json({
      success: true,
      status: 'success',
      message: `Tự động cập nhật thành công: ${result.updatedUnpaid || 0} đơn Chưa thanh toán, ${result.updatedCancelled || 0} đơn Đã hủy.`,
      durationMs,
      timestamp: new Date().toISOString(),
      updatedUnpaid: result.updatedUnpaid || 0,
      updatedCancelled: result.updatedCancelled || 0,
      deletedCheckRows: result.deletedCheckRows || 0,
      modifiedCount: result.modifiedOrders ? result.modifiedOrders.length : 0
    });
  } catch (err) {
    console.error('[Auto Reconcile Cron Error]', err);
    return res.status(500).json({
      success: false,
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};
