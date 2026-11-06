/**
 * scripts/deduplicate-eir-orders.js
 * Script lọc trùng dứt điểm các đơn EIR trong bảng eir_cancellation_orders trên Supabase Cloud
 */

const path = require('path');
const fs = require('fs');

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

const supabaseClient = require('../services/supabaseClient');
const rebookingAnalyzer = require('../services/rebookingAnalyzer');

async function main() {
  console.log('=====================================================');
  console.log('🧹 GPG LOGISTICS - DEDUPLICATE EIR ORDERS IN SUPABASE');
  console.log(`⏱️ Thời gian bắt đầu: ${new Date().toISOString()}`);
  console.log('=====================================================');

  if (!supabaseClient.isSupabaseAvailable()) {
    console.error('❌ Supabase chưa được cấu hình hoặc không sẵn sàng kết nối.');
    process.exit(1);
  }

  try {
    console.log('🔍 Đang kiểm tra số lượng đơn trùng trước khi xử lý...');
    const p = supabaseClient.getPool();
    const client = await p.connect();
    
    let dupBefore = 0;
    let totalBefore = 0;
    try {
      const resCount = await client.query('SELECT COUNT(*) as total FROM eir_cancellation_orders;');
      totalBefore = parseInt(resCount.rows[0].total, 10);

      const resDup = await client.query(`
        SELECT COUNT(*) as dup_eir_count FROM (
          SELECT UPPER(TRIM(stt_file)) FROM eir_cancellation_orders
          WHERE stt_file ILIKE 'EIR%'
          GROUP BY UPPER(TRIM(stt_file)) HAVING COUNT(*) > 1
        ) t;
      `);
      dupBefore = parseInt(resDup.rows[0].dup_eir_count, 10);
    } finally {
      client.release();
    }

    console.log(`- Tổng số dòng trước khi lọc: ${totalBefore}`);
    console.log(`- Số mã EIR bị trùng lặp: ${dupBefore}`);

    if (dupBefore === 0) {
      console.log('✅ Hệ thống không có đơn EIR nào bị trùng lặp!');
      process.exit(0);
    }

    console.log('\n🚀 Bắt đầu thực thi lọc trùng và chuẩn hóa row_key...');
    const result = await supabaseClient.deduplicateVerificationOrdersInSupabase();

    console.log('\n📊 KẾT QUẢ XỬ LÝ:');
    console.log(`- Đã xóa: ${result.deletedCount} bản ghi trùng lặp.`);
    console.log(`- Đã chuẩn hóa row_key: ${result.standardizedCount} bản ghi.`);

    // Xác minh lại
    const checkClient = await p.connect();
    try {
      const resCountAfter = await checkClient.query('SELECT COUNT(*) as total FROM eir_cancellation_orders;');
      const totalAfter = parseInt(resCountAfter.rows[0].total, 10);

      const resDupAfter = await checkClient.query(`
        SELECT COUNT(*) as dup_eir_count FROM (
          SELECT UPPER(TRIM(stt_file)) FROM eir_cancellation_orders
          WHERE stt_file ILIKE 'EIR%'
          GROUP BY UPPER(TRIM(stt_file)) HAVING COUNT(*) > 1
        ) t;
      `);
      const dupAfter = parseInt(resDupAfter.rows[0].dup_eir_count, 10);

      const checkEIR = await checkClient.query(`
        SELECT id, row_key, stt_file, depot, hang_tau, trang_thai_don_hang, file_name, created_at
        FROM eir_cancellation_orders
        WHERE stt_file = 'EIR34070241';
      `);

      console.log(`\n✅ Tổng số dòng sau khi lọc: ${totalAfter}`);
      console.log(`✅ Số mã EIR trùng lặp còn lại: ${dupAfter}`);
      console.log(`✅ Kiểm tra số EIR34070241: còn ${checkEIR.rows.length} bản ghi duy nhất:`);
      console.log(JSON.stringify(checkEIR.rows[0], null, 2));
    } finally {
      checkClient.release();
    }

    // Xóa cache rebooking để dashboard cập nhật ngay dữ liệu mới nhất
    try {
      rebookingAnalyzer.invalidateRebookingCache();
      console.log('🔄 Đã làm mới cache rebooking!');
    } catch (e) {}

    console.log('\n🎉 HOÀN THÀNH LỌC TRÙNG DỮ LIỆU ĐƠN EIR THÀNH CÔNG!');
    process.exit(0);
  } catch (err) {
    console.error('❌ LỖI TRONG QUÁ TRÌNH LỌC TRÙNG:', err.message);
    process.exit(1);
  }
}

main();
