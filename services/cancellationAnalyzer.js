/**
 * cancellationAnalyzer.js
 * Core Engine: Xử lý, làm sạch và tổng hợp dữ liệu đơn hủy cho hệ thống Logistics & Depot
 */

const XLSX = require("xlsx");

// Từ khóa để dò tìm dòng tiêu đề chính
const REQUIRED_KEYWORDS = ["stt", "depot", "hãng tàu", "ngày hủy đơn", "trạng thái đơn hàng", "lý do hủy"];

/**
 * Làm sạch chuỗi văn bản, loại bỏ khoảng trắng thừa và ký tự rác
 */
function cleanString(val) {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (str === "NaN" || str === "null" || str === "undefined") return "";
  return str;
}

/**
 * Chuẩn hóa ngày tháng sang định dạng YYYY-MM-DD HH:mm:ss
 */
function normalizeDate(val) {
  const str = cleanString(val);
  if (!str) return null;

  // Xử lý số ngày của Excel (Serial Date)
  if (typeof val === "number" || (!isNaN(str) && Number(str) > 30000 && Number(str) < 60000)) {
    const d = new Date(Math.round((Number(str) - 25569) * 86400 * 1000));
    return d.toISOString().replace("T", " ").substring(0, 19);
  }

  const s = str.replace(/\//g, "-").trim();
  // Khớp định dạng DD-MM-YYYY HH:mm:ss hoặc DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3];
    const time = ddmmyyyy[4] !== undefined 
      ? ` ${ddmmyyyy[4].padStart(2, "0")}:${ddmmyyyy[5].padStart(2, "0")}:${(ddmmyyyy[6] || "00").padStart(2, "0")}`
      : "";
    return `${year}-${month}-${day}${time}`;
  }

  // Khớp định dạng YYYY-MM-DD HH:mm:ss
  const yyyymmdd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, "0");
    const day = yyyymmdd[3].padStart(2, "0");
    const time = yyyymmdd[4] !== undefined 
      ? ` ${yyyymmdd[4].padStart(2, "0")}:${yyyymmdd[5].padStart(2, "0")}:${(yyyymmdd[6] || "00").padStart(2, "0")}`
      : "";
    return `${year}-${month}-${day}${time}`;
  }

  return s;
}

/**
 * Phân tích dấu thời gian ngày duyệt (chuẩn múi giờ Việt Nam UTC+7)
 */
function parseApprovalTimestamp(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim().replace("T", " ");
  let parts = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (parts) {
    const y = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10) - 1;
    const d = parseInt(parts[3], 10);
    const h = parseInt(parts[4] || "0", 10);
    const min = parseInt(parts[5] || "0", 10);
    const s = parseInt(parts[6] || "0", 10);
    return Date.UTC(y, m, d, h - 7, min, s);
  }
  parts = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (parts) {
    const d = parseInt(parts[1], 10);
    const m = parseInt(parts[2], 10) - 1;
    const y = parseInt(parts[3], 10);
    const h = parseInt(parts[4] || "0", 10);
    const min = parseInt(parts[5] || "0", 10);
    const s = parseInt(parts[6] || "0", 10);
    return Date.UTC(y, m, d, h - 7, min, s);
  }
  return null;
}

/**
 * Kiểm tra trạng thái CSKH nhóm 1, 3, 6 (Đã xử lý)
 */
function isProcessed3hStatus(trangThaiXuLy) {
  if (!trangThaiXuLy) return false;
  const s = String(trangThaiXuLy).trim();
  if (s === "1" || s === "3" || s === "6") return true;
  if (s === "Thanh toán thành công") return true;
  if (s === "Đã liên hệ - Chờ thanh toán") return true;
  if (s === "Không liên hệ được - Chờ thanh toán" || s === "Không liên hệ được") return true;
  return false;
}

/**
 * Kiểm tra trạng thái Chưa thanh toán
 */
function isUnpaidStatus(val) {
  if (!val) return false;
  const s = String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
  return s.includes("chua thanh toan");
}

/**
 * Cập nhật tự động: Đối với các đơn hàng chưa thanh toán, nếu hạn hủy đơn (3h) quá thời hạn thì cập nhật Trạng thái đơn = Đã hủy
 */
function applyExpired3hCancellation(records) {
  if (!Array.isArray(records)) return records;
  const now = Date.now();
  const THREE_HOURS = 3 * 3600 * 1000;

  records.forEach(r => {
    const isUnpaid = isUnpaidStatus(r.trangThaiDonHang) || r.isAutoCancelledBy3h;
    if (isUnpaid) {
      if (isProcessed3hStatus(r.trangThaiXuLy)) {
        if (r.isAutoCancelledBy3h) {
          r.isAutoCancelledBy3h = false;
        }
        return;
      }
      const appTime = parseApprovalTimestamp(r.ngayDuocDuyet);
      if (appTime && (now - appTime >= THREE_HOURS)) {
        if (!r.originalTrangThaiDonHang) {
          r.originalTrangThaiDonHang = r.trangThaiDonHang;
        }
        r.trangThaiDonHang = "Đã hủy";
        r.isAutoCancelledBy3h = true;
      }
    }
  });
  return records;
}

/**
 * Tự động xác định hàng chứa tiêu đề chính
 */
function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const rowText = row.map(c => cleanString(c).toLowerCase()).join(" ");
    const matchCount = REQUIRED_KEYWORDS.filter(kw => rowText.includes(kw)).length;
    if (matchCount >= 3) {
      return i;
    }
  }
  return 0;
}

/**
 * Đọc file từ Buffer hoặc chuỗi CSV, chuẩn hóa danh sách bản ghi
 */
function parseCancellationFile(input) {
  let workbook;
  if (Buffer.isBuffer(input)) {
    workbook = XLSX.read(input, { type: "buffer", codepage: 65001 });
  } else if (typeof input === "string") {
    workbook = XLSX.read(input, { type: "string", codepage: 65001 });
  } else {
    throw new Error("Đầu vào không hợp lệ. Cần Buffer hoặc Text CSV.");
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("Tệp không chứa dữ liệu!");
  }

  const headerIdx = detectHeaderRow(rawRows);
  const headerRow = rawRows[headerIdx].map(h => cleanString(h));

  const records = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every(c => cleanString(c) === "")) continue; // Bỏ qua dòng trống

    const item = {};
    headerRow.forEach((colName, idx) => {
      if (colName) {
        item[colName] = row[idx] !== undefined ? cleanString(row[idx]) : "";
      }
    });

    if (item["STT"] || item["Depot"] || item["Số booking"]) {
      records.push({
        stt: item["STT"] || String(records.length + 1),
        depot: cleanString(item["Depot"]).toUpperCase(),
        hangTau: cleanString(item["Hãng tàu"]).toUpperCase(),
        ngayHuyDon: normalizeDate(item["Ngày hủy đơn"]),
        ngayDuocDuyet: normalizeDate(item["Ngày được duyệt"]),
        soBooking: cleanString(item["Số booking"]),
        soContainer: cleanString(item["Số container"]),
        trangThaiDonHang: cleanString(item["Trạng thái đơn hàng"]) || "Chưa xác định",
        trangThaiKichHoat: cleanString(item["Trạng thái kích hoạt"]) || "Chưa kích hoạt",
        thoiGianKichHoat: normalizeDate(item["Thời gian kích hoạt"]),
        lyDoHuy: cleanString(item["Lý do hủy"]) || "Không có lý do",
        loaiContainer: cleanString(item["Loại container"]),
        loaiDonHang: cleanString(item["Loại đơn hàng (IN/OUT)"]).toUpperCase() || "N/A",
        sizeTeus: Number(cleanString(item["SizeTEUS"])) || 0,
        tenTaiXe: cleanString(item["Tên tài xế"]),
        sdtTaiXe: cleanString(item["Số điện thoại tài xế"]),
        tenNhaXe: cleanString(item["Tên nhà xe"]),
        sdtNhaXe: cleanString(item["Số điện thoại nhà xe"]),
        lyDoTuChoi: cleanString(item["Lý do từ chối"]),
        lyDoHuyCheck: cleanString(item["Lý do hủy_Check"])
      });
    }
  }

  return applyExpired3hCancellation(records);
}

/**
 * Tổng hợp toàn diện các chỉ số và phát hiện bất thường
 */
function aggregateCancellationData(records) {
  applyExpired3hCancellation(records);
  const totalOrders = records.length;
  const totalTeus = records.reduce((sum, r) => sum + (r.sizeTeus || 0), 0);

  // 1. KPIs Tổng quan
  const byStatus = { "Đã hủy": 0, "Đã hoàn tiền": 0, "Đang hoàn tiền": 0 };
  const byActivation = { "Chưa kích hoạt": 0, "Đã kích hoạt": 0 };
  const byDirection = { "OUT": 0, "IN": 0 };
  const byContainerType = {};

  records.forEach(r => {
    byStatus[r.trangThaiDonHang] = (byStatus[r.trangThaiDonHang] || 0) + 1;
    byActivation[r.trangThaiKichHoat] = (byActivation[r.trangThaiKichHoat] || 0) + 1;
    if (r.loaiDonHang === "IN" || r.loaiDonHang === "OUT") {
      byDirection[r.loaiDonHang] = (byDirection[r.loaiDonHang] || 0) + 1;
    } else {
      byDirection["KHAC"] = (byDirection["KHAC"] || 0) + 1;
    }
    if (r.loaiContainer) {
      byContainerType[r.loaiContainer] = (byContainerType[r.loaiContainer] || 0) + 1;
    }
  });

  // 2. Phân bố theo Depot
  const depotMap = {};
  records.forEach(r => {
    const d = r.depot || "KHAC";
    if (!depotMap[d]) {
      depotMap[d] = { depot: d, totalOrders: 0, totalTeus: 0, inOrders: 0, outOrders: 0 };
    }
    depotMap[d].totalOrders += 1;
    depotMap[d].totalTeus += r.sizeTeus || 0;
    if (r.loaiDonHang === "IN") depotMap[d].inOrders += 1;
    if (r.loaiDonHang === "OUT") depotMap[d].outOrders += 1;
  });
  const byDepot = Object.values(depotMap).sort((a, b) => b.totalOrders - a.totalOrders);

  // Phân bố theo Hãng tàu
  const lineMap = {};
  records.forEach(r => {
    const l = r.hangTau || "KHAC";
    lineMap[l] = (lineMap[l] || 0) + 1;
  });
  const byShippingLine = Object.entries(lineMap)
    .map(([hangTau, count]) => ({
      hangTau,
      count,
      percentage: Number(((count / (totalOrders || 1)) * 100).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count);

  // 3. Top lý do hủy phổ biến
  const cancelReasonMap = {};
  records.forEach(r => {
    const reason = r.lyDoHuy;
    cancelReasonMap[reason] = (cancelReasonMap[reason] || 0) + 1;
  });
  const topCancelReasons = Object.entries(cancelReasonMap)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: Number(((count / (totalOrders || 1)) * 100).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count);

  // Top lý do từ chối của điều độ
  const rejectReasonMap = {};
  records.forEach(r => {
    if (r.lyDoTuChoi) {
      rejectReasonMap[r.lyDoTuChoi] = (rejectReasonMap[r.lyDoTuChoi] || 0) + 1;
    }
  });
  const topRejectReasons = Object.entries(rejectReasonMap)
    .map(([reason, count]) => ({
      reason,
      count
    }))
    .sort((a, b) => b.count - a.count);

  // 4. Phát hiện bất thường (Anomaly Detection)
  const anomalies = [];
  records.forEach(r => {
    // Đã kích hoạt nhưng bị hủy/hoàn tiền
    if (r.trangThaiKichHoat.toLowerCase().includes("đã kích hoạt")) {
      anomalies.push({
        type: "ACTIVATED_BUT_CANCELLED",
        severity: "HIGH",
        stt: r.stt,
        booking: r.soBooking,
        container: r.soContainer,
        depot: r.depot,
        hangTau: r.hangTau,
        moTa: `Đơn đã kích hoạt vào bãi lúc ${r.thoiGianKichHoat || "N/A"} nhưng bị hủy. Trạng thái: ${r.trangThaiDonHang}. Lý do: ${r.lyDoHuy}`
      });
    }

    // Cont không đủ tiêu chuẩn đóng hàng
    if (r.lyDoHuy.toLowerCase().includes("không đủ tiêu chuẩn")) {
      anomalies.push({
        type: "CONTAINER_GRADE_REJECTED",
        severity: "MEDIUM",
        stt: r.stt,
        booking: r.soBooking,
        container: r.soContainer,
        depot: r.depot,
        hangTau: r.hangTau,
        moTa: `Vỏ container không đủ điều kiện đóng hàng tại Depot ${r.depot}. Cần kiểm tra khâu giám định Grade M&R.`
      });
    }

    // Depot không đủ vỏ / Booking hết quota
    if (
      (r.lyDoTuChoi && (r.lyDoTuChoi.includes("KHÔNG ĐỦ CONT CẤP") || r.lyDoTuChoi.includes("ĐÃ ĐỦ SỐ LƯỢNG"))) ||
      (r.lyDoHuy && r.lyDoHuy.includes("chọn cont không đúng"))
    ) {
      anomalies.push({
        type: "INVENTORY_OR_QUOTA_ISSUE",
        severity: "MEDIUM",
        stt: r.stt,
        booking: r.soBooking,
        container: r.soContainer,
        depot: r.depot,
        hangTau: r.hangTau,
        moTa: `Vấn đề hạn ngạch hoặc tồn kho tại ${r.depot}: ${r.lyDoTuChoi || r.lyDoHuy}`
      });
    }

    // Sự cố xe
    if (r.lyDoHuy.toLowerCase().includes("xe bị hư")) {
      anomalies.push({
        type: "TRUCK_BREAKDOWN",
        severity: "LOW",
        stt: r.stt,
        booking: r.soBooking,
        container: r.soContainer,
        depot: r.depot,
        hangTau: r.hangTau,
        moTa: `Nhà xe ${r.tenNhaXe} báo sự cố hư hỏng xe.`
      });
    }
  });

  return {
    records,
    kpis: {
      totalOrders,
      totalTeus,
      byStatus,
      byActivation,
      byDirection,
      byContainerType
    },
    byDepot,
    byShippingLine,
    topCancelReasons,
    topRejectReasons,
    anomalies
  };
}

/**
 * Xuất báo cáo Markdown tiếng Việt chuẩn mực
 */
function generateMarkdownReport(result) {
  const { kpis, byDepot, byShippingLine, topCancelReasons, anomalies } = result;

  let md = `# BÁO CÁO PHÂN TÍCH ĐƠN HỦY 24/7 (LOGISTICS & DEPOT)\n\n`;

  md += `### 1. Tổng Quan (KPIs)\n\n`;
  md += `| Chỉ số | Giá trị | Tỷ lệ (%) |\n`;
  md += `| :--- | :---: | :---: |\n`;
  md += `| **Tổng số đơn hủy** | **${kpis.totalOrders} đơn** | 100% |\n`;
  md += `| **Tổng sản lượng quy đổi** | **${kpis.totalTeus} TEUs** | — |\n`;
  md += `| Chiều OUT (Lấy cont rỗng) | ${kpis.byDirection["OUT"] || 0} đơn | ${((kpis.byDirection["OUT"] || 0) / (kpis.totalOrders || 1) * 100).toFixed(1)}% |\n`;
  md += `| Chiều IN (Hạ cont/trả vỏ) | ${kpis.byDirection["IN"] || 0} đơn | ${((kpis.byDirection["IN"] || 0) / (kpis.totalOrders || 1) * 100).toFixed(1)}% |\n`;
  md += `| Trạng thái: Đã hủy | ${kpis.byStatus["Đã hủy"] || 0} đơn | ${((kpis.byStatus["Đã hủy"] || 0) / (kpis.totalOrders || 1) * 100).toFixed(1)}% |\n`;
  md += `| Trạng thái: Đã hoàn tiền | ${kpis.byStatus["Đã hoàn tiền"] || 0} đơn | ${((kpis.byStatus["Đã hoàn tiền"] || 0) / (kpis.totalOrders || 1) * 100).toFixed(1)}% |\n`;
  md += `| Trạng thái: Đang hoàn tiền | ${kpis.byStatus["Đang hoàn tiền"] || 0} đơn | ${((kpis.byStatus["Đang hoàn tiền"] || 0) / (kpis.totalOrders || 1) * 100).toFixed(1)}% |\n`;
  md += `| Đã kích hoạt trước hủy | ${kpis.byActivation["Đã kích hoạt"] || 0} đơn | ${((kpis.byActivation["Đã kích hoạt"] || 0) / (kpis.totalOrders || 1) * 100).toFixed(1)}% |\n\n`;

  md += `### 2. Phân Bố Theo Depot\n\n`;
  md += `| Depot | Số đơn hủy | Sản lượng (TEUs) | Chiều IN | Chiều OUT | Tỷ lệ đơn (%) |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
  byDepot.forEach(d => {
    const pct = ((d.totalOrders / (kpis.totalOrders || 1)) * 100).toFixed(1);
    md += `| **${d.depot}** | ${d.totalOrders} | ${d.totalTeus} | ${d.inOrders} | ${d.outOrders} | ${pct}% |\n`;
  });
  md += `\n`;

  md += `### 3. Top Lý Do Hủy Phổ Biến\n\n`;
  md += `| STT | Lý do hủy | Số lượng | Tỷ lệ (%) |\n`;
  md += `| :---: | :--- | :---: | :---: |\n`;
  topCancelReasons.slice(0, 5).forEach((r, idx) => {
    md += `| ${idx + 1} | ${r.reason} | ${r.count} | ${r.percentage}% |\n`;
  });
  md += `\n`;

  md += `### 4. Chi Tiết Bất Thường Cần Lưu Ý (${anomalies.length} trường hợp)\n\n`;
  if (anomalies.length === 0) {
    md += `*Không ghi nhận bất thường nghiêm trọng.*\n`;
  } else {
    anomalies.forEach(a => {
      const badge = a.severity === "HIGH" ? "[NGHIÊM TRỌNG]" : a.severity === "MEDIUM" ? "[CẢNH BÁO]" : "[LƯU Ý]";
      md += `- ${badge} **Đơn #${a.stt}** (Depot ${a.depot} - ${a.hangTau} - Booking: \`${a.booking || "N/A"}\`): ${a.moTa}\n`;
    });
  }

  return md;
}

/**
 * Kiểm tra file dữ liệu có khớp với form mẫu của bảng PostgreSQL cancellation_orders không
 */
function validateAgainstSqlSchema(input) {
  let workbook;
  if (Buffer.isBuffer(input)) {
    workbook = XLSX.read(input, { type: "buffer", codepage: 65001 });
  } else if (typeof input === "string") {
    workbook = XLSX.read(input, { type: "string", codepage: 65001 });
  } else {
    throw new Error("Đầu vào không hợp lệ. Cần Buffer hoặc Text CSV.");
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!rawRows || rawRows.length === 0) {
    return {
      isValid: false,
      message: "Tệp không chứa dữ liệu!",
      columnsCheck: [],
      missingRequired: ["Tất cả"],
      dataRowsCount: 0,
      errors: ["File rỗng, không tìm thấy hàng dữ liệu nào."]
    };
  }

  const headerIdx = detectHeaderRow(rawRows);
  const headerRow = rawRows[headerIdx].map(h => cleanString(h));
  const headerRowLower = headerRow.map(h => h.toLowerCase());

  // Định nghĩa Schema PostgreSQL chuẩn cần kiểm tra
  const EXPECTED_COLUMNS = [
    { key: "stt", excelHeader: "STT", sqlColumn: "stt_file", type: "VARCHAR(50)", required: true },
    { key: "depot", excelHeader: "Depot", sqlColumn: "depot", type: "VARCHAR(20)", required: true },
    { key: "hang_tau", excelHeader: "Hãng tàu", sqlColumn: "hang_tau", type: "VARCHAR(20)", required: true },
    { key: "ngay_huy_don", excelHeader: "Ngày hủy đơn", sqlColumn: "ngay_huy_don", type: "TIMESTAMP", required: true },
    { key: "trang_thai_don_hang", excelHeader: "Trạng thái đơn hàng", sqlColumn: "trang_thai_don_hang", type: "VARCHAR(50)", required: true },
    { key: "ly_do_huy", excelHeader: "Lý do hủy", sqlColumn: "ly_do_huy", type: "TEXT", required: true },
    { key: "so_booking", excelHeader: "Số booking", sqlColumn: "so_booking", type: "VARCHAR(100)", required: false },
    { key: "so_container", excelHeader: "Số container", sqlColumn: "so_container", type: "VARCHAR(100)", required: false },
    { key: "loai_container", excelHeader: "Loại container", sqlColumn: "loai_container", type: "VARCHAR(100)", required: false },
    { key: "loai_don_hang", excelHeader: "Loại đơn hàng (IN/OUT)", sqlColumn: "loai_don_hang", type: "VARCHAR(10)", required: false },
    { key: "size_teus", excelHeader: "SizeTEUS", sqlColumn: "size_teus", type: "NUMERIC(4,2)", required: false },
    { key: "ten_tai_xe", excelHeader: "Tên tài xế", sqlColumn: "ten_tai_xe", type: "VARCHAR(150)", required: false },
    { key: "sdt_tai_xe", excelHeader: "Số điện thoại tài xế", sqlColumn: "sdt_tai_xe", type: "VARCHAR(50)", required: false },
    { key: "ten_nha_xe", excelHeader: "Tên nhà xe", sqlColumn: "ten_nha_xe", type: "VARCHAR(255)", required: false },
    { key: "sdt_nha_xe", excelHeader: "Số điện thoại nhà xe", sqlColumn: "sdt_nha_xe", type: "VARCHAR(50)", required: false },
    { key: "ly_do_tu_choi", excelHeader: "Lý do từ chối", sqlColumn: "ly_do_tu_choi", type: "TEXT", required: false }
  ];

  const columnsCheck = [];
  const missingRequired = [];

  EXPECTED_COLUMNS.forEach(col => {
    const idx = headerRowLower.findIndex(h => h.includes(col.excelHeader.toLowerCase()) || col.excelHeader.toLowerCase().includes(h));
    const found = idx !== -1;
    if (!found && col.required) {
      missingRequired.push(col.excelHeader);
    }
    columnsCheck.push({
      excelHeader: col.excelHeader,
      sqlColumn: col.sqlColumn,
      type: col.type,
      required: col.required,
      status: found ? "MATCHED" : (col.required ? "MISSING" : "OPTIONAL_MISSING"),
      matchedName: found ? headerRow[idx] : null
    });
  });

  // Đếm và thẩm định số dòng dữ liệu thực tế
  let dataRowsCount = 0;
  let invalidDateCount = 0;
  const sampleRows = [];

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every(c => cleanString(c) === "")) continue;
    dataRowsCount++;

    if (sampleRows.length < 3) {
      const sampleItem = {};
      headerRow.forEach((colName, cIdx) => {
        if (colName) sampleItem[colName] = cleanString(row[cIdx]);
      });
      sampleRows.push(sampleItem);
    }
  }

  const isValid = missingRequired.length === 0 && dataRowsCount > 0;
  const errors = [];
  const warnings = [];

  if (missingRequired.length > 0) {
    errors.push(`Thiếu các cột bắt buộc của form SQL: ${missingRequired.join(", ")}`);
  }
  if (dataRowsCount === 0) {
    errors.push("Không tìm thấy hàng dữ liệu nào sau dòng tiêu đề.");
  }

  const matchPercent = Math.round((columnsCheck.filter(c => c.status === "MATCHED").length / EXPECTED_COLUMNS.length) * 100);

  return {
    isValid,
    tableName: "cancellation_orders",
    headerRowIndex: headerIdx + 1,
    matchPercent,
    totalExpectedColumns: EXPECTED_COLUMNS.length,
    matchedColumnsCount: columnsCheck.filter(c => c.status === "MATCHED").length,
    columnsCheck,
    missingRequired,
    dataRowsCount,
    sampleRows,
    errors,
    warnings
  };
}

/**
 * Phân tích và trích xuất dữ liệu tệp kiểm tra đơn (Báo cáo danh sách chi tiết đơn lệnh EIR)
 * Chuẩn hóa các trường tương thích 100% với bảng eir_cancellation_orders trong SQL
 */
function parseVerificationFile(input) {
  let workbook;
  if (Buffer.isBuffer(input)) {
    workbook = XLSX.read(input, { type: "buffer", codepage: 65001 });
  } else if (typeof input === "string") {
    workbook = XLSX.read(input, { type: "string" });
  } else {
    return [];
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!rawRows || rawRows.length === 0) return [];

  // Tìm hàng chứa tiêu đề chính
  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const text = rawRows[i].map(c => cleanString(c).toLowerCase()).join(" ");
    if (text.includes("số eir") || (text.includes("depot") && text.includes("hãng tàu"))) {
      headerIdx = i;
      break;
    }
  }

  const headers = rawRows[headerIdx].map(h => cleanString(h));

  const getVal = (row, keyKeywords) => {
    for (let k of keyKeywords) {
      const kNorm = k.toLowerCase().replace(/[\s_\-\/]+/g, "");
      const idx = headers.findIndex(h => {
        const hLower = h.toLowerCase();
        if (hLower.includes(k.toLowerCase())) return true;
        const hNorm = hLower.replace(/[\s_\-\/]+/g, "");
        return hNorm.includes(kNorm);
      });
      if (idx !== -1 && row[idx] !== undefined && cleanString(row[idx]) !== "") {
        return cleanString(row[idx]);
      }
    }
    return "";
  };

  const records = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every(c => cleanString(c) === "")) continue;

    const soEir = getVal(row, ["Số EIR", "STT"]);
    const depot = getVal(row, ["Depot"]);
    const hangTau = getVal(row, ["Hãng tàu check", "Hãng tàu"]);
    // Nghiêm cấm lấy từ cột "Số B/L //Số vận đơn", chỉ lấy từ cột "BK check" hoặc "Số booking"
    const booking = getVal(row, ["BK check", "BK_check", "BKCheck", "Booking check", "Số booking", "Booking"]);
    const soCont = getVal(row, ["Số cont"]) || soEir;
    const size = getVal(row, ["Size Check", "Size"]);
    const loaiDon = getVal(row, ["Loại đơn hàng"]);
    const ngayTao = normalizeDate(getVal(row, ["Ngày tạo"]));
    const thoiDiemTuChoi = normalizeDate(getVal(row, ["Thời điểm từ chối", "Thời điểm BC từ chối", "Thời điểm hoàn tiền"]));
    const ngayHuyDon = thoiDiemTuChoi || ngayTao;
    const ngayDuyet = normalizeDate(getVal(row, ["Ngày được duyệt"]));
    const trangThaiDon = getVal(row, ["Trạng thái đơn hàng"]);
    const thoiDiemXepTai = normalizeDate(getVal(row, ["Thời điểm xếp tài"]));
    const lyDoHuy = getVal(row, ["Lý do Huỷ"]);
    const lyDoTuChoi = getVal(row, ["Ghi chú (Lý do từ chối duyệt)"]);
    const lyDoCheck = getVal(row, ["Ghi chú thêm (Gate OUT)"]);
    const taiXe = getVal(row, ["Họ tên tài xế"]);
    const sdtTaiXe = getVal(row, ["SĐT"]);
    const nhaXe = getVal(row, ["Đơn vị vận tải", "Tên công ty"]);

    let loaiDonHang = "N/A";
    if (loaiDon.toUpperCase().includes("OUT")) loaiDonHang = "OUT";
    else if (loaiDon.toUpperCase().includes("IN")) loaiDonHang = "IN";

    let sizeTeus = 0;
    if (size.startsWith("2")) sizeTeus = 1.0;
    else if (size.startsWith("4") || size.startsWith("45")) sizeTeus = 2.0;

    let loaiCont = size;
    if (size === "4500") loaiCont = "Cont 40' HC";
    else if (size === "4200") loaiCont = "Cont 40' DC";
    else if (size === "2200" || size === "2000") loaiCont = "Cont 20' DC";
    else if (size === "4532") loaiCont = "Cont 40' RF";

    records.push({
      sttFile: soEir || String(records.length + 1),
      depot: depot || "N/A",
      hangTau: hangTau || "N/A",
      ngayHuyDon: ngayHuyDon || new Date().toISOString().replace("T", " ").substring(0, 19),
      ngayDuocDuyet: ngayDuyet || null,
      soBooking: booking,
      soContainer: soCont,
      loaiContainer: loaiCont,
      loaiDonHang: loaiDonHang,
      sizeTeus: sizeTeus,
      trangThaiDonHang: trangThaiDon || "Chưa xác định",
      trangThaiKichHoat: thoiDiemXepTai ? "Đã kích hoạt" : "Chưa kích hoạt",
      thoiGianKichHoat: thoiDiemXepTai || null,
      lyDoHuy: lyDoHuy || null,
      lyDoTuChoi: lyDoTuChoi || null,
      lyDoHuyCheck: lyDoCheck || null,
      tenTaiXe: taiXe || null,
      sdtTaiXe: sdtTaiXe || null,
      tenNhaXe: nhaXe || null,
      sdtNhaXe: null
    });
  }

  return records;
}

module.exports = {
  parseCancellationFile,
  aggregateCancellationData,
  generateMarkdownReport,
  validateAgainstSqlSchema,
  parseVerificationFile,
  applyExpired3hCancellation,
  parseApprovalTimestamp,
  isProcessed3hStatus,
  isUnpaidStatus
};
