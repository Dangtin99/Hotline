// api/cron/edepot-sync.js
// Vercel Cron Job endpoint - Chạy tự động hàng giờ để đồng bộ dữ liệu eDepot
const edepotSyncService = require('../../services/edepotSyncService');

module.exports = async (req, res) => {
  // 1. Kiểm tra phương thức
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ chấp nhận phương thức GET hoặc POST' });
  }

  // 2. Bảo mật xác thực CRON_SECRET
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

  // 3. Thực thi đồng bộ
  try {
    const options = { triggerSource: 'Cron Job (Auto)' };
    if (req.query && req.query.minutes) {
      options.minutesBack = parseInt(req.query.minutes, 10);
    }
    const result = await edepotSyncService.syncOrdersWindow(options);

    return res.status(result.success ? 200 : 500).json({
      success: result.success,
      message: result.success ? `Đã đồng bộ thành công ${result.count} đơn hàng từ eDepot` : result.error,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (err) {
    console.error('[Vercel Cron Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
