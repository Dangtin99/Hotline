/**
 * scripts/cron-sync-edepot.js
 * Runner script chạy trên GitHub Actions (hoặc local cron/scheduler)
 * Tự động trích xuất dữ liệu eDepot trong 1 giờ vừa qua và lưu trực tiếp vào Cloud Supabase.
 * Hoàn toàn độc lập, không phụ thuộc vào Vercel.
 */

const path = require('path');
const fs = require('fs');

// Nạp file .env cục bộ nếu có (khi chạy test trên máy cá nhân)
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

const edepotSyncService = require('../services/edepotSyncService');

async function main() {
  console.log('=====================================================');
  console.log('🤖 GPG LOGISTICS - EDEPOT HOURLY SYNC TO SUPABASE');
  console.log(`⏱️ Thời gian bắt đầu: ${new Date().toISOString()}`);
  console.log('Node Version:', process.version);
  console.log('EDEPOT_USERNAME provided:', Boolean(process.env.EDEPOT_USERNAME));
  console.log('EDEPOT_PASSWORD provided:', Boolean(process.env.EDEPOT_PASSWORD));
  console.log('SUPABASE_HOST provided:', Boolean(process.env.SUPABASE_HOST));
  console.log('SUPABASE_USER provided:', Boolean(process.env.SUPABASE_USER));
  console.log('SUPABASE_PASSWORD provided:', Boolean(process.env.SUPABASE_PASSWORD));
  console.log('=====================================================');

  const rawUser = process.env.EDEPOT_USERNAME;
  const rawPass = process.env.EDEPOT_PASSWORD;
  const username = rawUser ? rawUser.trim() : '';
  const passLen = rawPass ? rawPass.trim().length : 0;

  console.log(`Thông tin xác thực eDepot: user="${username.slice(0, 2)}***" (len: ${username.length}), pass_len=${passLen}`);

  if (!username) {
    console.error('❌ Thiếu biến môi trường EDEPOT_USERNAME. Vui lòng cấu hình trong GitHub Secrets hoặc .env.');
    process.exit(1);
  }

  try {
    const customFrom = process.env.CUSTOM_FROM || process.env.INPUT_CUSTOMFROM || process.argv[2];
    const customTo = process.env.CUSTOM_TO || process.env.INPUT_CUSTOMTO || process.argv[3];

    const syncOptions = {};
    if (customFrom && customTo) {
      syncOptions.customFrom = customFrom.trim();
      syncOptions.customTo = customTo.trim();
      console.log(`🎯 Chạy đồng bộ theo khung giờ chỉ định: [${syncOptions.customFrom}] -> [${syncOptions.customTo}]`);
    } else {
      console.log('⏰ Chạy đồng bộ tự động theo khung giờ tròn gần nhất...');
    }

    // Chạy đồng bộ cho khung giờ
    const result = await edepotSyncService.syncOrdersWindow(syncOptions);
    
    if (result.success) {
      console.log('✅ ĐỒNG BỘ THÀNH CÔNG!');
      console.log(`- Khung giờ: [${result.log.fromDate}] -> [${result.log.toDate}]`);
      console.log(`- Số lượng đơn trích xuất và lưu vào Supabase: ${result.count} đơn`);
      console.log(`- Mã đợt nạp: ${result.uploadId}`);
      console.log(`- Thời gian xử lý: ${result.durationMs}ms`);
      process.exit(0);
    } else {
      console.error(`❌ ĐỒNG BỘ THẤT BẠI: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`💥 LỖI KHÔNG MONG MUỐN:`, err.stack || err.message || err);
    process.exit(1);
  }
}

main();
