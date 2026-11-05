/**
 * scripts/cron-update-orders.js
 * Runner script chạy trên GitHub Actions hoặc Local Scheduler
 * Tự động thực hiện Cập Nhật Dữ Liệu đối soát từ Bảng Check Đơn và đồng bộ lên Cloud Supabase.
 */

const path = require('path');
const fs = require('fs');

// Nạp file .env cục bộ nếu có
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const db = require('../services/database');
let rebookingAnalyzer = null;
try {
  rebookingAnalyzer = require('../services/rebookingAnalyzer');
} catch (e) {}

async function main() {
  console.log('=====================================================');
  console.log('🤖 GPG LOGISTICS - AUTO RECONCILE & UPDATE ORDERS');
  console.log(`⏱️ Thời gian bắt đầu: ${new Date().toISOString()}`);
  console.log('Node Version:', process.version);
  console.log('=====================================================');

  const startTime = Date.now();

  try {
    const result = await db.updateOrdersFromCheckDataAsync();

    if (rebookingAnalyzer && typeof rebookingAnalyzer.invalidateRebookingCache === 'function') {
      try {
        rebookingAnalyzer.invalidateRebookingCache();
      } catch (cacheErr) {
        console.warn('Lỗi làm mới cache:', cacheErr.message);
      }
    }

    const durationMs = Date.now() - startTime;
    console.log('✅ TỰ ĐỘNG CẬP NHẬT ĐỐI SOÁT THÀNH CÔNG!');
    console.log(`- Đơn Chưa thanh toán cập nhật: ${result.updatedUnpaid || 0} đơn`);
    console.log(`- Đơn Đã hủy cập nhật: ${result.updatedCancelled || 0} đơn`);
    console.log(`- Tổng số đơn thay đổi: ${result.modifiedOrders ? result.modifiedOrders.length : 0} đơn`);
    console.log(`- Thời gian xử lý: ${durationMs}ms`);
    process.exit(0);
  } catch (err) {
    console.error(`💥 LỖI CẬP NHẬT:`, err.stack || err.message || err);
    process.exit(1);
  }
}

main();
