// app.js - Logic dành riêng cho trang Bảng Điều Hành (Dashboard)

let chartReasonsInstance = null;
let chartDepotsInstance = null;
let chartLinesInstance = null;
let currentAnalyticsData = null;
let currentRecords = [];
let currentMatrixStatus = "ALL";
let allMatrixStatuses = [];

// Bộ lọc Dashboard Toàn Diện
let currentDatasetId = "sql_all";
let masterDashboardRecords = [];
let allDashboardDepots = [];
let selectedDashboardDepots = [];
let allDashboardStatuses = [];
let selectedDashboardStatuses = [];
let currentFrozenDetailCount = 0;
let dashboardFiltersInitialized = false;
let currentComparisonInfo = null;

// DOM Elements
const alertBox = document.getElementById("alertBox");
const currentDatasetName = document.getElementById("currentDatasetName");
const btnExportMarkdown = document.getElementById("btnExportMarkdown");
const btnExportJson = document.getElementById("btnExportJson");

// DOM Elements Bộ Lọc Dashboard
const selectFreezeCols = document.getElementById("selectFreezeCols");
const depotDropdownBtn = document.getElementById("depotDropdownBtn");
const depotDropdownPanel = document.getElementById("depotDropdownPanel");
const depotSelectedLabel = document.getElementById("depotSelectedLabel");
const depotSelectAll = document.getElementById("depotSelectAll");
const depotOptionsList = document.getElementById("depotOptionsList");

const filterLine = document.getElementById("filterLine");
const filterDirection = document.getElementById("filterDirection");

const statusDropdownBtn = document.getElementById("statusDropdownBtn");
const statusDropdownPanel = document.getElementById("statusDropdownPanel");
const statusSelectedLabel = document.getElementById("statusSelectedLabel");
const statusSelectAll = document.getElementById("statusSelectAll");
const statusOptionsList = document.getElementById("statusOptionsList");

const filterApprovedHour = document.getElementById("filterApprovedHour");
const filterWarning3h = document.getElementById("filterWarning3h");
const filterContactStatus = document.getElementById("filterContactStatus");
const filterDateType = document.getElementById("filterDateType");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const filterHourFrom = document.getElementById("filterHourFrom");
const filterHourTo = document.getElementById("filterHourTo");
const btnClearDateFilter = document.getElementById("btnClearDateFilter");
const dashboardDateFilterGroup = document.getElementById("dashboardDateFilterGroup");
const btnResetFilter = document.getElementById("btnResetFilter");

document.addEventListener("DOMContentLoaded", () => {
  if (btnExportMarkdown) btnExportMarkdown.onclick = copyMarkdownReport;
  if (btnExportJson) btnExportJson.onclick = downloadJsonData;
  initModalEvents();
  initExportPngEvents();

  // Khôi phục tùy chọn ghim cột đã lưu
  try {
    const savedFreeze = localStorage.getItem("gpg_dashboard_frozen_cols");
    if (savedFreeze !== null && selectFreezeCols) {
      currentFrozenDetailCount = parseInt(savedFreeze, 10) || 0;
      selectFreezeCols.value = String(currentFrozenDetailCount);
    }
  } catch (e) {}

  window.addEventListener("resize", () => {
    applyFrozenColumnsToDetailTable();
  });

  // Load data based on URL parameter or fallback to latest history/sample
  loadDashboardData();

  // Khởi động cơ chế đồng bộ thời gian thực siêu nhẹ 5 giây giữa các người dùng
  startRealtimeDashboardSync();
});

// Quản lý đồng bộ thời gian thực siêu nhẹ (5s polling) cho dashboard tổng quan
let localDashboardOperationalVersion = 0;
let isSyncingDashboardOperational = false;

function startRealtimeDashboardSync() {
  setTimeout(checkAndSyncDashboardUpdates, 2000);

  setInterval(() => {
    if (document.visibilityState === "visible") {
      checkAndSyncDashboardUpdates();
    }
  }, 5000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkAndSyncDashboardUpdates();
    }
  });
}

async function checkAndSyncDashboardUpdates() {
  if (isSyncingDashboardOperational || !currentRecords || currentRecords.length === 0) return;
  try {
    isSyncingDashboardOperational = true;
    const resVer = await fetch("/api/orders/operational-version");
    if (!resVer.ok) return;
    const dataVer = await resVer.json();
    const serverVer = dataVer.version;

    if (!localDashboardOperationalVersion) {
      localDashboardOperationalVersion = serverVer;
      return;
    }

    if (serverVer > localDashboardOperationalVersion) {
      const resUpd = await fetch("/api/orders/operational-updates");
      if (!resUpd.ok) return;
      const dataUpd = await resUpd.json();
      const updates = dataUpd.updates || {};

      let hasChanged = false;
      Object.entries(updates).forEach(([rowKey, item]) => {
        const matched = currentRecords.filter(r => (r.rowKey === rowKey || (r.stt && rowKey.includes(r.stt))));
        matched.forEach(rec => {
          if (rec.trangThaiXuLy !== item.trangThaiXuLy || rec.giaiTrinh !== item.giaiTrinh) {
            rec.trangThaiXuLy = item.trangThaiXuLy || "";
            rec.giaiTrinh = item.giaiTrinh || "";
            hasChanged = true;
          }
        });
      });

      if (hasChanged) {
        applyDashboardFilters();
      }
      localDashboardOperationalVersion = serverVer;
    }
  } catch (e) {
  } finally {
    isSyncingDashboardOperational = false;
  }
}

function showAlert(msg, isError = true) {
  alertBox.hidden = false;
  alertBox.textContent = msg;
  alertBox.style.background = isError ? "#fef2f2" : "#ecfdf5";
  alertBox.style.color = isError ? "var(--danger)" : "var(--success)";
  alertBox.style.borderColor = isError ? "#fecaca" : "#a7f3d0";
}

function clearAlert() {
  alertBox.hidden = true;
  alertBox.textContent = "";
}

// Nạp dữ liệu Dashboard
async function loadDashboardData() {
  clearAlert();
  const urlParams = new URLSearchParams(window.location.search);
  const uploadId = urlParams.get("id");
  if (uploadId) {
    const navDataTable = document.getElementById("navDataTable");
    if (navDataTable) navDataTable.href = `data-table.html?id=${encodeURIComponent(uploadId)}`;
    const navUnpaid = document.getElementById("navUnpaid");
    if (navUnpaid) navUnpaid.href = `data-table.html?id=${encodeURIComponent(uploadId)}&tab=unpaid`;
  }

  try {
    if (uploadId) {
      currentDatasetId = uploadId;
      // 1. Nếu có ID trên URL, tải đúng đợt đó
      currentDatasetName.textContent = `Đang nạp dữ liệu đợt ${uploadId}...`;
      const res = await fetch(`/api/history/${uploadId}`);
      const result = await res.json();
      if (!res.ok || result.status !== "success") {
        throw new Error(result.message || "Không tìm thấy dữ liệu đợt này.");
      }

      currentDatasetName.textContent = `${result.fileName} (${result.uploadedAt})`;
      currentRecords = (result.data && result.data.records) || [];
      applyExpired3hCancellation(currentRecords);
      renderDashboard(result.data, currentRecords);
    } else {
      currentDatasetId = "sql_all";
      // 2. Mặc định: Nạp toàn bộ dữ liệu tích lũy từ CSDL SQL (Tất cả file đã tải)
      const resAll = await fetch("/api/all-data");
      const resultAll = await resAll.json();

      if (resAll.ok && resultAll.status === "success" && resultAll.totalRecords > 0) {
        currentDatasetName.innerHTML = `<strong>Toàn bộ CSDL SQL</strong> <span style="font-size: 13px; font-weight: normal; color: var(--text-muted);">(${resultAll.totalRecords} đơn tích lũy từ ${resultAll.stats?.fileCount || 1} file đã tải)</span>`;
        currentRecords = resultAll.records || (resultAll.data && resultAll.data.records) || [];
        applyExpired3hCancellation(currentRecords);
        renderDashboard(resultAll.data, currentRecords);
        return;
      }

      // Fallback nếu CSDL trống: nạp mẫu
      const resSample = await fetch("/api/sample");
      const resultSample = await resSample.json();
      if (resSample.ok && resultSample.status === "success") {
        currentDatasetName.textContent = `Dữ liệu mẫu 67 đơn hủy thực tế`;
        currentRecords = (resultSample.data && resultSample.data.records) || [];
        applyExpired3hCancellation(currentRecords);
        renderDashboard(resultSample.data, currentRecords);
      }
    }
  } catch (err) {
    showAlert(err.message || "Lỗi khi nạp dữ liệu dashboard.");
  }
}

// Lấy ghi chú & trạng thái xử lý CSKH từ localStorage
function getSavedNotes() {
  try {
    const key = `gpg_order_notes_${currentDatasetId}`;
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {
    return {};
  }
}

function normalizeStr(s) {
  if (s === null || s === undefined) return "";
  return String(s).normalize("NFC").trim();
}

function isUnpaidStatus(val) {
  if (!val) return false;
  const s = String(val).toLowerCase();
  return s.includes("chưa thanh toán") || s.includes("chua thanh toan");
}

function isUnpaidOrder(r) {
  if (!r || !r.trangThaiDonHang) return false;
  return isUnpaidStatus(r.trangThaiDonHang);
}

// Kiểm tra trạng thái có thuộc nhóm Đã Hủy / Từ chối duyệt hay không
function isCancelledStatus(val) {
  if (!val) return false;
  const raw = String(val).trim().toLowerCase();
  if (raw === "đã hủy" || raw === "đã huỷ" || raw === "hủy" || raw === "huỷ" || raw === "từ chối duyệt") return true;
  const s = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
  return s === "da huy" || s === "huy" || s.includes("da huy") || s.includes("tu choi duyet");
}

// Kiểm tra xem đơn hàng có trạng thái Đã Hủy hay không
function isCancelledOrder(r) {
  if (!r) return false;
  if (!r.trangThaiDonHang) return false;
  return isCancelledStatus(r.trangThaiDonHang);
}

// Kiểm tra xem đơn hàng có bị tự động hủy do quá hạn 3h hay không (Đã vô hiệu hóa tự động hủy)
function isAutoCancelledBy3h(r) {
  return false;
}

function parseApprovalTimestamp(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim().replace("T", " ");
  const parts = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!parts) return null;
  const y = parseInt(parts[1], 10);
  const m = parseInt(parts[2], 10) - 1;
  const d = parseInt(parts[3], 10);
  const h = parseInt(parts[4] || "0", 10);
  const min = parseInt(parts[5] || "0", 10);
  const s = parseInt(parts[6] || "0", 10);
  return Date.UTC(y, m, d, h - 7, min, s);
}

function extractHour(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const match = str.match(/(?:^|\s|T)(\d{1,2}):(\d{2})/);
  if (match) {
    const hour = parseInt(match[1], 10);
    if (!isNaN(hour) && hour >= 0 && hour <= 23) {
      return hour;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.getHours();
  }
  return null;
}

// Chuẩn hóa và trích xuất chuỗi ngày giờ YYYY-MM-DD HH:mm:ss
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

// Chuẩn hóa và trích xuất chuỗi ngày YYYY-MM-DD
function extractDateOnly(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const mYmd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (mYmd) {
    return `${mYmd[1]}-${mYmd[2].padStart(2, "0")}-${mYmd[3].padStart(2, "0")}`;
  }
  const mDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mDmy) {
    return `${mDmy[3]}-${mDmy[2].padStart(2, "0")}-${mDmy[1].padStart(2, "0")}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

// Định dạng chuỗi ngày hiển thị sang dạng DD/MM/YYYY hoặc DD/MM/YYYY HH:mm:ss
function formatDateDisplay(val) {
  if (!val || val === "-" || val === "null" || val === "undefined") return "-";
  const str = String(val).trim();
  if (!str) return "-";

  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, "0");
    const d = ymdMatch[3].padStart(2, "0");
    const time = ymdMatch[4] !== undefined
      ? ` ${ymdMatch[4].padStart(2, "0")}:${ymdMatch[5].padStart(2, "0")}:${(ymdMatch[6] || "00").padStart(2, "0")}`
      : "";
    return `${d}/${m}/${y}${time}`;
  }

  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, "0");
    const m = dmyMatch[2].padStart(2, "0");
    const y = dmyMatch[3];
    const time = dmyMatch[4] !== undefined
      ? ` ${dmyMatch[4].padStart(2, "0")}:${dmyMatch[5].padStart(2, "0")}:${(dmyMatch[6] || "00").padStart(2, "0")}`
      : "";
    return `${d}/${m}/${y}${time}`;
  }

  return str;
}

// Tính khoảng thời gian cùng kỳ trước liền kề dựa trên Từ ngày và Đến ngày
function getComparisonPeriodRange(dateFromStr, dateToStr) {
  if (!dateFromStr && !dateToStr) return null;

  const fromStr = dateFromStr || dateToStr;
  const toStr = dateToStr || dateFromStr;

  const dFrom = new Date(fromStr + "T00:00:00");
  const dTo = new Date(toStr + "T00:00:00");
  if (isNaN(dFrom.getTime()) || isNaN(dTo.getTime())) return null;

  // Tính số ngày của khoảng thời gian hiện tại
  const diffTime = dTo.getTime() - dFrom.getTime();
  const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);

  // Khoảng thời gian cùng kỳ liền trước
  const prevToTime = dFrom.getTime() - (1 * 24 * 60 * 60 * 1000);
  const prevFromTime = prevToTime - ((diffDays - 1) * 24 * 60 * 60 * 1000);

  const prevDFrom = new Date(prevFromTime);
  const prevDTo = new Date(prevToTime);

  const formatYMD = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    diffDays,
    currentFrom: fromStr,
    currentTo: toStr,
    prevFrom: formatYMD(prevDFrom),
    prevTo: formatYMD(prevDTo)
  };
}

// Tìm ngày mới nhất trong danh sách bản ghi
function getLatestRecordDate(records, dateType = "ngayHuy") {
  if (!records || records.length === 0) {
    return new Date().toISOString().substring(0, 10);
  }
  let maxDate = "";
  records.forEach(r => {
    const raw = dateType === "ngayDuyet" ? r.ngayDuocDuyet : r.ngayHuyDon;
    const d = extractDateOnly(raw);
    if (d && (!maxDate || d > maxDate)) {
      maxDate = d;
    }
  });
  return maxDate || new Date().toISOString().substring(0, 10);
}

// Hàm chuẩn hóa giá trị trạng thái CSKH cũ sang danh mục trạng thái mới
function normalizeCskhStatus(rawStatus, isUnpaid = false) {
  if (rawStatus === null || rawStatus === undefined) return "";
  let st = String(rawStatus).trim();
  if (!st || st === "null" || st === "undefined") return "";

  if (st === "Đã liên hệ - Chờ đặt lại" || st === "Đã liên hệ - Chờ thanh toán" || st === "Đã liên hệ - Đang chờ" || st === "Đã liên hệ - Chờ") {
    return "Đã liên hệ - Chờ";
  }
  if (st === "Không liên hệ được - Chờ thanh toán" || st === "Không liên hệ được - Hủy" || st === "Không liên hệ được - hủy" || st === "Không liên hệ được") {
    return "Không liên hệ được";
  }
  if (st === "Đã liên hệ - Đã đặt lại" || st === "Đặt lại thành công" || st === "Tự động đặt lại" || st === "Đã liên hệ đã đặt lại" || st === "Đã đặt lại") {
    return "Đã đặt lại";
  }
  if (st === "Đã liên hệ - Không đặt lại" || st === "Đã Liên hệ - Không đặt lại") {
    return "Đã Liên hệ - Không đặt lại";
  }
  if (st === "Thanh toán thành công" || st === "Đã thanh toán" || st === "Đã thành công") {
    return isUnpaid ? "Đã thanh toán" : "Đã thành công";
  }
  if (st === "Đã liên hệ - Không thành công") {
    return "Đã liên hệ - Không thành công";
  }
  return st;
}

// Kiểm tra trạng thái CSKH có hợp lệ để tự động cập nhật ĐÃ XỬ LÝ cho hạn hủy 3h hay không
function isProcessed3hStatus(trangThaiXuLy) {
  if (!trangThaiXuLy) return false;
  const s = String(trangThaiXuLy).trim();
  if (!s || s === "null" || s === "undefined") return false;
  return true;
}

// Cập nhật: Không tự động chuyển đơn chưa thanh toán thành Đã hủy sau 3h
function applyExpired3hCancellation(records) {
  if (!Array.isArray(records)) return records;
  records.forEach(r => {
    if (r.isAutoCancelledBy3h) {
      if (r.originalTrangThaiDonHang) {
        r.trangThaiDonHang = r.originalTrangThaiDonHang;
      }
      r.isAutoCancelledBy3h = false;
    }
  });
  return records;
}

function getWarning3hLevel(ngayDuocDuyet, isUnpaidOrExpired, trangThaiXuLy, isCancelled = false) {
  // Quy tắc mới: Với đơn hủy, khi có cập nhật bất kỳ trạng thái xử lý nào -> Cập nhật là "Đã xử lý"
  if (isCancelled && trangThaiXuLy && String(trangThaiXuLy).trim()) {
    return "processed";
  }
  if (isProcessed3hStatus(trangThaiXuLy)) {
    return "processed";
  }
  if (!isUnpaidOrExpired || !ngayDuocDuyet) return null;
  const appTime = parseApprovalTimestamp(ngayDuocDuyet);
  if (!appTime) return null;
  const now = Date.now();
  const elapsedMs = now - appTime;
  const ONE_HOUR = 3600 * 1000;
  const TWO_HOURS = 2 * ONE_HOUR;
  const THREE_HOURS = 3 * ONE_HOUR;

  if (elapsedMs >= THREE_HOURS) return "expired";
  if (elapsedMs >= TWO_HOURS) return "red";
  if (elapsedMs >= ONE_HOUR) return "yellow";
  return "safe";
}

// Cập nhật nhãn hiển thị nút multi-select Depot
function updateDashboardDepotLabel() {
  if (!depotSelectedLabel || !depotDropdownBtn) return;
  const count = selectedDashboardDepots.length;
  const total = allDashboardDepots.length;

  let isRestricted = false;
  try {
    const u = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
    if (u && u.role !== "admin") {
      const d = Array.isArray(u.assignedDepots) ? u.assignedDepots : String(u.assignedDepots || "").split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
      if (d.length > 0 && !d.includes("ALL")) isRestricted = true;
    }
  } catch (e) {}

  if (count === 0) {
    depotSelectedLabel.textContent = "Chưa chọn Depot";
    depotDropdownBtn.classList.remove("has-selection");
  } else if (count === total) {
    depotSelectedLabel.textContent = isRestricted ? `Depot phân quyền (${count})` : "Depot (Tất cả)";
    depotDropdownBtn.classList.remove("has-selection");
  } else if (count === 1) {
    depotSelectedLabel.textContent = `Depot: ${selectedDashboardDepots[0]}`;
    depotDropdownBtn.classList.add("has-selection");
  } else {
    depotSelectedLabel.textContent = `Depot (${count})`;
    depotDropdownBtn.classList.add("has-selection");
  }

  if (depotSelectAll) {
    if (count === total && total > 0) {
      depotSelectAll.checked = true;
      depotSelectAll.indeterminate = false;
    } else if (count === 0) {
      depotSelectAll.checked = false;
      depotSelectAll.indeterminate = false;
    } else {
      depotSelectAll.checked = false;
      depotSelectAll.indeterminate = true;
    }
  }
}

// Cập nhật nhãn hiển thị nút multi-select Trạng Thái
function updateDashboardStatusLabel() {
  if (!statusSelectedLabel || !statusDropdownBtn) return;
  const count = selectedDashboardStatuses.length;
  const total = allDashboardStatuses.length;

  if (count === 0) {
    statusSelectedLabel.textContent = "Chưa chọn Trạng thái";
    statusDropdownBtn.classList.remove("has-selection");
  } else if (count === total) {
    statusSelectedLabel.textContent = "Trạng thái (Tất cả)";
    statusDropdownBtn.classList.remove("has-selection");
  } else if (count === 1) {
    statusSelectedLabel.textContent = selectedDashboardStatuses[0];
    statusDropdownBtn.classList.add("has-selection");
  } else {
    statusSelectedLabel.textContent = `Trạng thái (${count})`;
    statusDropdownBtn.classList.add("has-selection");
  }

  if (statusSelectAll) {
    if (count === total && total > 0) {
      statusSelectAll.checked = true;
      statusSelectAll.indeterminate = false;
    } else if (count === 0) {
      statusSelectAll.checked = false;
      statusSelectAll.indeterminate = false;
    } else {
      statusSelectAll.checked = false;
      statusSelectAll.indeterminate = true;
    }
  }
}

// Khởi tạo các bộ điều khiển lọc trên Dashboard
function initDashboardFilterControls(records) {
  if (!records || records.length === 0) return;

  // 1. Depots
  let availableDepots = [...new Set(records.map(r => r.depot).filter(Boolean))].sort();
  try {
    const userStr = localStorage.getItem("gpg_auth_user");
    if (userStr) {
      const u = JSON.parse(userStr);
      let userDepots = [];
      if (Array.isArray(u.assignedDepots)) {
        userDepots = u.assignedDepots.map(d => String(d).trim().toUpperCase()).filter(Boolean);
      } else if (typeof u.assignedDepots === "string") {
        userDepots = u.assignedDepots.split(",").map(d => String(d).trim().toUpperCase()).filter(Boolean);
      }
      if (u && u.role !== "admin" && userDepots.length > 0 && !userDepots.includes("ALL")) {
        const allowed = new Set(userDepots);
        availableDepots = availableDepots.filter(d => allowed.has(String(d).trim().toUpperCase()));
      }
    }
  } catch (e) {}

  allDashboardDepots = availableDepots;
  selectedDashboardDepots = [...allDashboardDepots];
  if (depotOptionsList) {
    depotOptionsList.innerHTML = allDashboardDepots.map(d => `
      <label class="multiselect-item">
        <input type="checkbox" class="depot-dashboard-cb" value="${d}" checked>
        <span>Depot ${d}</span>
      </label>
    `).join("");

    const checkboxes = depotOptionsList.querySelectorAll(".depot-dashboard-cb");
    checkboxes.forEach(cb => {
      cb.onchange = () => {
        selectedDashboardDepots = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
        updateDashboardDepotLabel();
        applyDashboardFilters();
      };
    });
    updateDashboardDepotLabel();
  }

  // 2. Shipping Lines
  const lines = [...new Set(records.map(r => r.hangTau).filter(Boolean))].sort();
  if (filterLine) {
    const curVal = filterLine.value;
    filterLine.innerHTML = `<option value="">Hãng tàu</option>`;
    lines.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = `Hãng ${l}`;
      filterLine.appendChild(opt);
    });
    if (curVal) filterLine.value = curVal;
  }

  // 3. Statuses
  const rawStatuses = records.map(r => normalizeStr(r.trangThaiDonHang)).filter(Boolean);
  allDashboardStatuses = [...new Set(rawStatuses)].sort();
  selectedDashboardStatuses = [...allDashboardStatuses];
  if (statusOptionsList) {
    statusOptionsList.innerHTML = allDashboardStatuses.map(s => {
      const escaped = s.replace(/"/g, '&quot;');
      return `
        <label class="multiselect-item">
          <input type="checkbox" class="status-dashboard-cb" value="${escaped}" checked>
          <span>${s}</span>
        </label>
      `;
    }).join("");

    const checkboxes = statusOptionsList.querySelectorAll(".status-dashboard-cb");
    checkboxes.forEach(cb => {
      cb.onchange = () => {
        selectedDashboardStatuses = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
        updateDashboardStatusLabel();
        applyDashboardFilters();
      };
    });
    updateDashboardStatusLabel();
  }

  // Gắn sự kiện 1 lần
  if (!dashboardFiltersInitialized) {
    dashboardFiltersInitialized = true;

    if (depotDropdownBtn && depotDropdownPanel) {
      depotDropdownBtn.onclick = (e) => {
        e.stopPropagation();
        if (statusDropdownPanel) {
          statusDropdownPanel.classList.remove("show");
          if (statusDropdownBtn) {
            statusDropdownBtn.classList.remove("active");
            statusDropdownBtn.setAttribute("aria-expanded", "false");
          }
        }
        const isOpen = depotDropdownPanel.classList.contains("show");
        if (isOpen) {
          depotDropdownPanel.classList.remove("show");
          depotDropdownBtn.classList.remove("active");
          depotDropdownBtn.setAttribute("aria-expanded", "false");
        } else {
          depotDropdownPanel.classList.add("show");
          depotDropdownBtn.classList.add("active");
          depotDropdownBtn.setAttribute("aria-expanded", "true");
        }
      };
      depotDropdownPanel.onclick = (e) => e.stopPropagation();
    }

    if (statusDropdownBtn && statusDropdownPanel) {
      statusDropdownBtn.onclick = (e) => {
        e.stopPropagation();
        if (depotDropdownPanel) {
          depotDropdownPanel.classList.remove("show");
          if (depotDropdownBtn) {
            depotDropdownBtn.classList.remove("active");
            depotDropdownBtn.setAttribute("aria-expanded", "false");
          }
        }
        const isOpen = statusDropdownPanel.classList.contains("show");
        if (isOpen) {
          statusDropdownPanel.classList.remove("show");
          statusDropdownBtn.classList.remove("active");
          statusDropdownBtn.setAttribute("aria-expanded", "false");
        } else {
          statusDropdownPanel.classList.add("show");
          statusDropdownBtn.classList.add("active");
          statusDropdownBtn.setAttribute("aria-expanded", "true");
        }
      };
      statusDropdownPanel.onclick = (e) => e.stopPropagation();
    }

    document.addEventListener("click", () => {
      if (depotDropdownPanel) {
        depotDropdownPanel.classList.remove("show");
        if (depotDropdownBtn) {
          depotDropdownBtn.classList.remove("active");
          depotDropdownBtn.setAttribute("aria-expanded", "false");
        }
      }
      if (statusDropdownPanel) {
        statusDropdownPanel.classList.remove("show");
        if (statusDropdownBtn) {
          statusDropdownBtn.classList.remove("active");
          statusDropdownBtn.setAttribute("aria-expanded", "false");
        }
      }
    });

    if (depotSelectAll) {
      depotSelectAll.onchange = (e) => {
        const isChecked = e.target.checked;
        const checkboxes = depotOptionsList ? depotOptionsList.querySelectorAll(".depot-dashboard-cb") : [];
        checkboxes.forEach(cb => { cb.checked = isChecked; });
        selectedDashboardDepots = isChecked ? [...allDashboardDepots] : [];
        updateDashboardDepotLabel();
        applyDashboardFilters();
      };
    }

    if (statusSelectAll) {
      statusSelectAll.onchange = (e) => {
        const isChecked = e.target.checked;
        const checkboxes = statusOptionsList ? statusOptionsList.querySelectorAll(".status-dashboard-cb") : [];
        checkboxes.forEach(cb => { cb.checked = isChecked; });
        selectedDashboardStatuses = isChecked ? [...allDashboardStatuses] : [];
        updateDashboardStatusLabel();
        applyDashboardFilters();
      };
    }

    if (selectFreezeCols) {
      selectFreezeCols.onchange = (e) => {
        const count = parseInt(e.target.value, 10) || 0;
        applyFrozenColumnsToDetailTable(count);
      };
    }

    if (filterDateType) filterDateType.onchange = applyDashboardFilters;
    if (filterDateFrom) {
      filterDateFrom.onchange = () => {
        if (filterDateFrom.value) {
          if (filterDateTo) {
            filterDateTo.min = filterDateFrom.value;
            if (filterDateTo.value && filterDateTo.value < filterDateFrom.value) {
              filterDateTo.value = filterDateFrom.value;
            }
          }
        } else if (filterDateTo) {
          filterDateTo.removeAttribute("min");
        }
        applyDashboardFilters();
      };
    }
    if (filterDateTo) {
      filterDateTo.onchange = () => {
        if (filterDateTo.value) {
          if (filterDateFrom) {
            filterDateFrom.max = filterDateTo.value;
            if (filterDateFrom.value && filterDateFrom.value > filterDateTo.value) {
              filterDateFrom.value = filterDateTo.value;
            }
          }
        } else if (filterDateFrom) {
          filterDateFrom.removeAttribute("max");
        }
        applyDashboardFilters();
      };
    }
    if (btnClearDateFilter) {
      btnClearDateFilter.onclick = () => {
        if (filterDateFrom) {
          filterDateFrom.value = "";
          filterDateFrom.removeAttribute("max");
        }
        if (filterDateTo) {
          filterDateTo.value = "";
          filterDateTo.removeAttribute("min");
        }
        if (filterHourFrom) filterHourFrom.value = "";
        if (filterHourTo) filterHourTo.value = "";
        btnClearDateFilter.style.display = "none";
        if (dashboardDateFilterGroup) dashboardDateFilterGroup.classList.remove("has-selection");
        applyDashboardFilters();
      };
    }

    if (filterHourFrom) {
      filterHourFrom.onchange = applyDashboardFilters;
      filterHourFrom.oninput = applyDashboardFilters;
    }
    if (filterHourTo) {
      filterHourTo.onchange = applyDashboardFilters;
      filterHourTo.oninput = applyDashboardFilters;
    }
    if (filterLine) filterLine.onchange = applyDashboardFilters;
    if (filterDirection) filterDirection.onchange = applyDashboardFilters;
    if (filterApprovedHour) filterApprovedHour.onchange = applyDashboardFilters;
    if (filterWarning3h) filterWarning3h.onchange = applyDashboardFilters;
    if (filterContactStatus) filterContactStatus.onchange = applyDashboardFilters;
    if (btnResetFilter) btnResetFilter.onclick = resetDashboardFilters;

    const searchInputEl = document.getElementById("dashboardSearchInput");
    if (searchInputEl) {
      searchInputEl.oninput = () => applyDashboardFilters();
    }

    initQuickDateRangeControls();
  }
}

// Khởi tạo các nút chọn nhanh khoảng ngày so sánh (Hôm nay, Hôm qua, 7 ngày, 10 ngày, 30 ngày)
function initQuickDateRangeControls() {
  const quickBtns = document.querySelectorAll(".btn-quick-range");
  quickBtns.forEach(btn => {
    btn.onclick = () => {
      if (!masterDashboardRecords || masterDashboardRecords.length === 0) return;
      const days = parseInt(btn.getAttribute("data-days") || "1", 10);
      const preset = btn.getAttribute("data-preset");

      const dateTypeVal = filterDateType ? filterDateType.value : "ngayHuy";
      const maxDateStr = getLatestRecordDate(masterDashboardRecords, dateTypeVal);
      const baseDate = new Date(maxDateStr + "T00:00:00");

      let targetToDate = new Date(baseDate.getTime());
      let targetFromDate = new Date(baseDate.getTime());

      if (preset === "yesterday") {
        targetToDate = new Date(baseDate.getTime() - 1 * 24 * 60 * 60 * 1000);
        targetFromDate = new Date(targetToDate.getTime());
      } else if (days > 1) {
        targetFromDate = new Date(targetToDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      }

      const formatYMD = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      if (filterDateFrom) {
        filterDateFrom.value = formatYMD(targetFromDate);
        filterDateFrom.removeAttribute("max");
      }
      if (filterDateTo) {
        filterDateTo.value = formatYMD(targetToDate);
        filterDateTo.removeAttribute("min");
      }

      if (filterDateFrom && filterDateTo && filterDateFrom.value && filterDateTo.value) {
        filterDateTo.min = filterDateFrom.value;
        filterDateFrom.max = filterDateTo.value;
      }

      if (filterHourFrom) filterHourFrom.value = "";
      if (filterHourTo) filterHourTo.value = "";

      quickBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      applyDashboardFilters();
    };
  });
}

// Kiểm tra bản ghi có khớp các bộ lọc Dashboard chung hay không (Depot, Hãng tàu, Chiều, Khung giờ, CSKH, Search...)
function matchesCommonDashboardFilters(r, lineVal, dirVal, hourVal, warning3hVal, contactStatusVal, searchVal) {
  // 1. Multi-select Depot
  if (allDashboardDepots.length > 0) {
    if (selectedDashboardDepots.length === 0) return false;
    if (selectedDashboardDepots.length < allDashboardDepots.length) {
      if (!selectedDashboardDepots.includes(r.depot)) return false;
    }
  }

  // 2. Shipping Line
  if (lineVal && normalizeStr(r.hangTau).toLowerCase() !== normalizeStr(lineVal).toLowerCase()) return false;

  // 3. Direction (IN/OUT)
  if (dirVal && normalizeStr(r.loaiDonHang).toUpperCase() !== normalizeStr(dirVal).toUpperCase()) return false;

  // 4. Multi-select Status
  if (allDashboardStatuses.length > 0) {
    if (selectedDashboardStatuses.length === 0) return false;
    if (selectedDashboardStatuses.length < allDashboardStatuses.length) {
      const itemStatus = normalizeStr(r.trangThaiDonHang).toLowerCase();
      const hasMatch = selectedDashboardStatuses.some(s => normalizeStr(s).toLowerCase() === itemStatus);
      if (!hasMatch) return false;
    }
  }

  // 5. Approved Hour
  if (hourVal !== "") {
    const targetHour = parseInt(hourVal, 10);
    const itemHour = extractHour(r.ngayDuocDuyet);
    if (itemHour !== targetHour) return false;
  }

  // 6. 3h Warning level
  if (warning3hVal) {
    const level = getWarning3hLevel(r.ngayDuocDuyet, isUnpaidOrder(r) || r.isAutoCancelledBy3h, r.trangThaiXuLy, isCancelledOrder(r));
    if (level !== warning3hVal) return false;
  }

  // 7. CSKH Contact status
  if (contactStatusVal) {
    if (contactStatusVal === "__EMPTY__") {
      if (r.trangThaiXuLy) return false;
    } else {
      const normR = normalizeCskhStatus(r.trangThaiXuLy, isUnpaidOrder(r));
      const normFilter = normalizeCskhStatus(contactStatusVal, isUnpaidOrder(r));
      if (normR !== normFilter) return false;
    }
  }

  // 8. Search nhanh
  if (searchVal) {
    const matchSearch =
      (r.soContainer && r.soContainer.toLowerCase().includes(searchVal)) ||
      (r.soEir && r.soEir !== "-" && r.soEir.toLowerCase().includes(searchVal)) ||
      (r.soBooking && r.soBooking.toLowerCase().includes(searchVal)) ||
      (r.tenTaiXe && r.tenTaiXe.toLowerCase().includes(searchVal)) ||
      (r.tenNhaXe && r.tenNhaXe.toLowerCase().includes(searchVal)) ||
      (r.lyDoHuy && r.lyDoHuy.toLowerCase().includes(searchVal));
    if (!matchSearch) return false;
  }

  return true;
}

// Áp dụng các bộ lọc Dashboard
function applyDashboardFilters() {
  if (!masterDashboardRecords || masterDashboardRecords.length === 0) return;

  const lineVal = filterLine ? filterLine.value : "";
  const dirVal = filterDirection ? filterDirection.value : "";
  const hourVal = filterApprovedHour ? filterApprovedHour.value : "";
  const warning3hVal = filterWarning3h ? filterWarning3h.value : "";
  const contactStatusVal = filterContactStatus ? filterContactStatus.value : "";
  const dateTypeVal = filterDateType ? filterDateType.value : "ngayHuy";
  const dateFromVal = filterDateFrom ? filterDateFrom.value : "";
  const dateToVal = filterDateTo ? filterDateTo.value : "";
  const hourFromVal = filterHourFrom ? filterHourFrom.value : "";
  const hourToVal = filterHourTo ? filterHourTo.value : "";
  const searchInputEl = document.getElementById("dashboardSearchInput");
  const searchVal = searchInputEl ? searchInputEl.value.toLowerCase().trim() : "";

  // Cập nhật trạng thái hiển thị của nút xóa ngày và highlight viền
  if (btnClearDateFilter) {
    btnClearDateFilter.style.display = (dateFromVal || dateToVal || hourFromVal || hourToVal) ? "inline-flex" : "none";
  }
  if (dashboardDateFilterGroup) {
    if (dateFromVal || dateToVal || hourFromVal || hourToVal) {
      dashboardDateFilterGroup.classList.add("has-selection");
    } else {
      dashboardDateFilterGroup.classList.remove("has-selection");
    }
  }

  const filtered = masterDashboardRecords.filter(r => {
    // 0. Bộ lọc Theo Ngày & Giờ (Ngày Hủy Đơn hoặc Ngày Được Duyệt)
    if (dateFromVal || dateToVal || hourFromVal || hourToVal) {
      const rawDate = dateTypeVal === "ngayDuyet" ? r.ngayDuocDuyet : r.ngayHuyDon;
      const recDateTime = extractDateTime(rawDate);
      if (!recDateTime) return false;

      if (dateFromVal || dateToVal) {
        if (dateFromVal) {
          const fromTime = hourFromVal ? `${hourFromVal}:00` : "00:00:00";
          const fromDateTime = `${dateFromVal} ${fromTime}`;
          if (recDateTime < fromDateTime) return false;
        }
        if (dateToVal) {
          const toTime = hourToVal ? `${hourToVal}:59` : "23:59:59";
          const toDateTime = `${dateToVal} ${toTime}`;
          if (recDateTime > toDateTime) return false;
        }
      } else {
        // Chỉ chọn giờ & phút mà không chọn ngày
        const recTime = recDateTime.substring(11, 19);
        if (hourFromVal) {
          const fromTime = `${hourFromVal}:00`;
          if (recTime < fromTime) return false;
        }
        if (hourToVal) {
          const toTime = `${hourToVal}:59`;
          if (recTime > toTime) return false;
        }
      }
    }

    return matchesCommonDashboardFilters(r, lineVal, dirVal, hourVal, warning3hVal, contactStatusVal, searchVal);
  });

  // Tính khoảng cùng kỳ liền kề trước đó và lọc previousRecords
  const compRange = getComparisonPeriodRange(dateFromVal, dateToVal);
  let previousRecords = [];
  if (compRange) {
    previousRecords = masterDashboardRecords.filter(r => {
      const rawDate = dateTypeVal === "ngayDuyet" ? r.ngayDuocDuyet : r.ngayHuyDon;
      const recDateTime = extractDateTime(rawDate);
      if (!recDateTime) return false;

      const fromTime = hourFromVal ? `${hourFromVal}:00` : "00:00:00";
      const fromDateTime = `${compRange.prevFrom} ${fromTime}`;
      const toTime = hourToVal ? `${hourToVal}:59` : "23:59:59";
      const toDateTime = `${compRange.prevTo} ${toTime}`;
      if (recDateTime < fromDateTime || recDateTime > toDateTime) return false;

      return matchesCommonDashboardFilters(r, lineVal, dirVal, hourVal, warning3hVal, contactStatusVal, searchVal);
    });
  }

  currentComparisonInfo = compRange ? {
    hasComparison: true,
    ...compRange,
    previousRecords
  } : {
    hasComparison: false,
    previousRecords: []
  };

  currentRecords = filtered;
  const filterSummaryBadge = document.getElementById("filterSummaryBadge");
  if (filterSummaryBadge) {
    filterSummaryBadge.textContent = `${filtered ? filtered.length : 0} bản ghi`;
  }

  const analytics = calculateAnalyticsFromRecords(filtered);
  currentAnalyticsData = analytics;
  renderDashboardViews(analytics, filtered, currentComparisonInfo);
}

// Đặt lại toàn bộ bộ lọc Dashboard
function resetDashboardFilters() {
  const searchInputEl = document.getElementById("dashboardSearchInput");
  if (searchInputEl) searchInputEl.value = "";

  selectedDashboardDepots = [...allDashboardDepots];
  if (depotOptionsList) {
    const checkboxes = depotOptionsList.querySelectorAll(".depot-dashboard-cb");
    checkboxes.forEach(cb => { cb.checked = true; });
  }
  updateDashboardDepotLabel();

  selectedDashboardStatuses = [...allDashboardStatuses];
  if (statusOptionsList) {
    const checkboxes = statusOptionsList.querySelectorAll(".status-dashboard-cb");
    checkboxes.forEach(cb => { cb.checked = true; });
  }
  updateDashboardStatusLabel();

  if (filterLine) filterLine.value = "";
  if (filterDirection) filterDirection.value = "";
  if (filterApprovedHour) filterApprovedHour.value = "";
  if (filterWarning3h) filterWarning3h.value = "";
  if (filterContactStatus) filterContactStatus.value = "";

  if (filterDateType) filterDateType.value = "ngayHuy";
  if (filterDateFrom) {
    filterDateFrom.value = "";
    filterDateFrom.removeAttribute("max");
  }
  if (filterDateTo) {
    filterDateTo.value = "";
    filterDateTo.removeAttribute("min");
  }
  if (filterHourFrom) filterHourFrom.value = "";
  if (filterHourTo) filterHourTo.value = "";
  if (btnClearDateFilter) btnClearDateFilter.style.display = "none";
  if (dashboardDateFilterGroup) dashboardDateFilterGroup.classList.remove("has-selection");

  document.querySelectorAll(".btn-quick-range").forEach(b => b.classList.remove("active"));

  applyDashboardFilters();
}

// Cố định cột cho bảng chi tiết đơn hàng trực tiếp trên Dashboard
function applyFrozenColumnsToDetailTable(count) {
  if (count !== undefined) {
    currentFrozenDetailCount = count;
    try {
      localStorage.setItem("gpg_dashboard_frozen_cols", String(count));
    } catch (e) {}
  } else {
    count = currentFrozenDetailCount;
  }

  if (selectFreezeCols && selectFreezeCols.value !== String(count)) {
    selectFreezeCols.value = String(count);
  }

  const table = document.querySelector(".inline-detail-table");
  if (!table) return;

  const headerCells = table.querySelectorAll("thead th");
  const rows = table.querySelectorAll("tbody tr");

  headerCells.forEach(th => {
    th.classList.remove("frozen-col", "frozen-col-last");
    th.style.left = "";
  });

  rows.forEach(tr => {
    Array.from(tr.children).forEach(td => {
      td.classList.remove("frozen-col", "frozen-col-last");
      td.style.left = "";
    });
  });

  if (count <= 0) return;

  const maxCols = Math.min(count, headerCells.length);
  const leftOffsets = [];
  let currentLeft = 0;

  for (let i = 0; i < maxCols; i++) {
    leftOffsets.push(currentLeft);
    const th = headerCells[i];
    th.classList.add("frozen-col");
    th.style.left = `${currentLeft}px`;
    if (i === maxCols - 1) {
      th.classList.add("frozen-col-last");
    }
    currentLeft += Math.round(th.getBoundingClientRect().width);
  }

  rows.forEach(tr => {
    const firstCell = tr.firstElementChild;
    if (firstCell && firstCell.hasAttribute("colspan")) return;
    for (let i = 0; i < maxCols; i++) {
      const td = tr.children[i];
      if (!td) continue;
      td.classList.add("frozen-col");
      td.style.left = `${leftOffsets[i]}px`;
      if (i === maxCols - 1) {
        td.classList.add("frozen-col-last");
      }
    }
  });
}

// Tính toán lại analytics khi bộ lọc dashboard thay đổi
function calculateAnalyticsFromRecords(records) {
  const totalOrders = records.length;
  let totalTeus = 0;
  const byDirection = { OUT: 0, IN: 0 };
  const byStatus = {};
  const depotMap = {};
  const lineMap = {};
  const reasonMap = {};

  records.forEach(r => {
    const teus = Number(r.sizeTeus) || 0;
    totalTeus += teus;

    const dir = normalizeStr(r.loaiDonHang).toUpperCase();
    if (dir === "OUT") byDirection["OUT"] = (byDirection["OUT"] || 0) + 1;
    else if (dir === "IN") byDirection["IN"] = (byDirection["IN"] || 0) + 1;

    const st = normalizeStr(r.trangThaiDonHang) || "Khác";
    byStatus[st] = (byStatus[st] || 0) + 1;

    const d = r.depot || "Chưa xác định";
    if (!depotMap[d]) depotMap[d] = { count: 0, teus: 0, inOrders: 0, outOrders: 0 };
    depotMap[d].count += 1;
    depotMap[d].teus += teus;
    if (dir === "IN") depotMap[d].inOrders += 1;
    if (dir === "OUT") depotMap[d].outOrders += 1;

    const l = r.hangTau || "Khác";
    if (!lineMap[l]) lineMap[l] = { count: 0, teus: 0 };
    lineMap[l].count += 1;
    lineMap[l].teus += teus;

    const reason = r.lyDoHuy || r.lyDoTuChoi || "Không có lý do";
    reasonMap[reason] = (reasonMap[reason] || 0) + 1;
  });

  const byDepot = Object.keys(depotMap).map(d => ({
    depot: d,
    count: depotMap[d].count,
    totalOrders: depotMap[d].count,
    teus: depotMap[d].teus,
    totalTeus: depotMap[d].teus,
    inOrders: depotMap[d].inOrders,
    outOrders: depotMap[d].outOrders,
    percentage: totalOrders > 0 ? ((depotMap[d].count / totalOrders) * 100).toFixed(1) : "0.0"
  })).sort((a, b) => b.count - a.count);

  const byShippingLine = Object.keys(lineMap).map(l => ({
    hangTau: l,
    line: l,
    count: lineMap[l].count,
    totalOrders: lineMap[l].count,
    teus: lineMap[l].teus,
    totalTeus: lineMap[l].teus,
    percentage: totalOrders > 0 ? ((lineMap[l].count / totalOrders) * 100).toFixed(1) : "0.0"
  })).sort((a, b) => b.count - a.count);

  const topCancelReasons = Object.keys(reasonMap).map(rs => ({
    reason: rs,
    count: reasonMap[rs],
    percentage: totalOrders > 0 ? ((reasonMap[rs] / totalOrders) * 100).toFixed(1) : "0.0"
  })).sort((a, b) => b.count - a.count);

  return {
    kpis: {
      totalOrders,
      totalTeus,
      byDirection,
      byStatus
    },
    byDepot,
    byShippingLine,
    topCancelReasons,
    anomalies: currentAnalyticsData?.anomalies || []
  };
}

// Render dữ liệu lên Dashboard (gốc từ server hoặc sau khi nạp)
function renderDashboard(data, records = []) {
  currentAnalyticsData = data;
  if (records && records.length > 0) {
    currentRecords = records;
  } else if (data && data.records) {
    currentRecords = data.records;
  }
  if (btnExportMarkdown) btnExportMarkdown.disabled = false;
  if (btnExportJson) btnExportJson.disabled = false;

  masterDashboardRecords = [...currentRecords];

  // Đồng bộ trạng thái xử lý CSKH từ local cache
  const savedNotes = getSavedNotes();
  masterDashboardRecords.forEach(r => {
    const k = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
    const note = savedNotes[k] || {};
    let st = r.trangThaiXuLy || note.status || "";
    r.trangThaiXuLy = normalizeCskhStatus(st, isUnpaidOrder(r));
    if (note.giaiTrinh && !r.giaiTrinh) r.giaiTrinh = note.giaiTrinh;
  });

  initDashboardFilterControls(masterDashboardRecords);
  renderDashboardViews(data, currentRecords);
}

// Render toàn bộ giao diện dashboard theo bộ dữ liệu (gốc hoặc đã lọc)
function renderDashboardViews(data, records = [], comparisonInfo = null) {
  const { kpis, byDepot, byShippingLine, topCancelReasons, anomalies } = data;

  // 1. KPIs
  document.getElementById("kpiTotalOrders").textContent = `${kpis.totalOrders} đơn`;
  document.getElementById("kpiTotalTeus").textContent = `Tổng sản lượng: ${kpis.totalTeus} TEUs`;

  const outCount = kpis.byDirection["OUT"] || 0;
  const inCount = kpis.byDirection["IN"] || 0;
  const outPct = ((outCount / (kpis.totalOrders || 1)) * 100).toFixed(1);
  const inPct = ((inCount / (kpis.totalOrders || 1)) * 100).toFixed(1);
  document.getElementById("kpiDirection").textContent = `${outCount} / ${inCount}`;
  document.getElementById("kpiDirectionRatio").textContent = `OUT: ${outPct}% | IN: ${inPct}%`;

  const cancelCount = kpis.byStatus["Đã hủy"] || 0;
  const refundCount = (kpis.byStatus["Đã hoàn tiền"] || 0) + (kpis.byStatus["Đang hoàn tiền"] || 0);
  const successCount = kpis.byStatus["Thanh toán thành công"] || 0;
  document.getElementById("kpiStatusMain").textContent = `Đã hủy: ${cancelCount}`;
  document.getElementById("kpiStatusSub").textContent = successCount > 0 
    ? `Thành công: ${successCount} | Hoàn: ${refundCount} đơn` 
    : `Hoàn tiền / Đang hoàn: ${refundCount} đơn`;

  const unpaidCount = (kpis.byStatus && kpis.byStatus["Chưa thanh toán"]) || 
    (records ? records.filter(r => normalizeStr(r.trangThaiDonHang).toLowerCase().includes("chưa thanh toán")).length : 0);
  const unpaidTeus = records 
    ? records.filter(r => normalizeStr(r.trangThaiDonHang).toLowerCase().includes("chưa thanh toán")).reduce((sum, r) => sum + (Number(r.sizeTeus) || 0), 0) 
    : 0;
  const unpaidPct = ((unpaidCount / (kpis.totalOrders || 1)) * 100).toFixed(1);

  document.getElementById("kpiActivated").textContent = `${unpaidCount} đơn`;
  document.getElementById("kpiActivatedSub").textContent = `${unpaidPct}% tổng đơn (${unpaidTeus} TEUs)`;

  // 2. Charts
  renderReasonsChart(topCancelReasons);
  renderDepotsChart(byDepot);
  renderShippingLinesChart(byShippingLine);

  // 3. Anomalies
  if (anomalies) renderAnomalies(anomalies);

  // 4. Ma Trận Depot & Hãng Tàu × Trạng Thái, Ma Trận Depot & Trạng Thái Đơn × Trạng Thái Liên Hệ & Bảng Thống Kê Chi Tiết
  if (records) {
    initMatrixStatusControls(records);
    renderMatrixTable(records);
    initContactMatrixControls(records);
    renderContactStatusMatrixTable(records);
    initInlineDetailControls();
    renderInlineDetailTable(records, currentInlineLine || "ALL", currentInlineDepot || "ALL");
  }

  // 5. Tables
  renderKpiSummaryTable(
    records, 
    masterDashboardRecords ? masterDashboardRecords.length : (records ? records.length : 0),
    comparisonInfo || currentComparisonInfo
  );
  renderTopDepotLineCancelTable(records);
  renderDepotTable(byDepot, kpis.totalOrders);
  renderReasonsTable(topCancelReasons);
}

// Chart: Lý do hủy (Bar - Dạng cột)
function renderReasonsChart(reasons) {
  const ctx = document.getElementById("chartReasons").getContext("2d");
  if (chartReasonsInstance) chartReasonsInstance.destroy();

  const top6 = reasons.slice(0, 6);
  const labels = top6.map(r => r.reason.length > 30 ? r.reason.substring(0, 30) + "..." : r.reason);
  const fullLabels = top6.map(r => r.reason);
  const counts = top6.map(r => r.count);

  chartReasonsInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Số đơn hủy",
        data: counts,
        backgroundColor: [
          "#1d4ed8",
          "#2563eb",
          "#3b82f6",
          "#60a5fa",
          "#93c5fd",
          "#bfdbfe"
        ],
        borderRadius: 4,
        maxBarThickness: 46
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            color: "#475569",
            font: { weight: "600", size: 11 },
            maxRotation: 25,
            minRotation: 0
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#64748b",
            precision: 0
          },
          grid: { color: "#e2e8f0" }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: function(items) {
              if (!items.length) return "";
              const idx = items[0].dataIndex;
              return fullLabels[idx] || labels[idx];
            },
            label: function(item) {
              return `Số đơn hủy: ${item.raw} đơn`;
            }
          }
        }
      }
    }
  });
}

// Chart: Depot (Bar)
function renderDepotsChart(depots) {
  const ctx = document.getElementById("chartDepots").getContext("2d");
  if (chartDepotsInstance) chartDepotsInstance.destroy();

  chartDepotsInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: depots.map(d => d.depot),
      datasets: [
        {
          label: "Số đơn hủy",
          data: depots.map(d => d.totalOrders),
          backgroundColor: "#1d4ed8",
          borderRadius: 4
        },
        {
          label: "Sản lượng (TEUs)",
          data: depots.map(d => d.totalTeus),
          backgroundColor: "#60a5fa",
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#64748b", font: { weight: "600" } }, grid: { display: false } },
        y: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } }
      },
      plugins: {
        legend: { labels: { color: "#334155", font: { size: 12 } } }
      }
    }
  });
}

// Chart: Shipping Lines (Horizontal Bar)
function renderShippingLinesChart(lines) {
  const ctx = document.getElementById("chartShippingLines").getContext("2d");
  if (chartLinesInstance) chartLinesInstance.destroy();

  chartLinesInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: lines.map(l => l.hangTau),
      datasets: [{
        label: "Đơn hủy",
        data: lines.map(l => l.count),
        backgroundColor: "#0284c7",
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } },
        y: { ticks: { color: "#334155", font: { weight: "600" } }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// Render Anomalies
function renderAnomalies(anomalies) {
  const countEl = document.getElementById("anomalyCount");
  const listEl = document.getElementById("anomaliesList");
  countEl.textContent = anomalies.length;

  if (anomalies.length === 0) {
    listEl.innerHTML = `<div class="anomaly-item anomaly-low">Không phát hiện bất thường nghiêm trọng.</div>`;
    return;
  }

  listEl.innerHTML = anomalies.map(a => {
    const cls = a.severity === "HIGH" ? "anomaly-high" : a.severity === "MEDIUM" ? "anomaly-medium" : "anomaly-low";
    const label = a.severity === "HIGH" ? "[NGHIÊM TRỌNG]" : a.severity === "MEDIUM" ? "[CẢNH BÁO]" : "[LƯU Ý]";
    return `
      <div class="anomaly-item ${cls}">
        <div><strong>${label}</strong></div>
        <div>
          <strong>Đơn #${a.stt}</strong> - Depot <strong>${a.depot}</strong> (${a.hangTau}) - Booking: <code>${a.booking || "N/A"}</code>: ${a.moTa}
        </div>
      </div>
    `;
  }).join("");
}

// Render Depot Table
function renderDepotTable(depots, totalOrders) {
  const tbody = document.getElementById("tbodyDepot");
  tbody.innerHTML = depots.map(d => {
    const pct = ((d.totalOrders / (totalOrders || 1)) * 100).toFixed(1);
    return `
      <tr>
        <td><strong style="color: #1d4ed8;">${d.depot}</strong></td>
        <td><strong>${d.totalOrders}</strong></td>
        <td>${d.totalTeus}</td>
        <td>${d.inOrders}</td>
        <td>${d.outOrders}</td>
        <td><span style="font-weight: 600; color: #0f172a;">${pct}%</span></td>
      </tr>
    `;
  }).join("");
}

// Render Reasons Table
function renderReasonsTable(reasons) {
  const tbody = document.getElementById("tbodyReasons");
  tbody.innerHTML = reasons.slice(0, 10).map((r, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${r.reason}</td>
      <td><strong style="color: #1d4ed8;">${r.count}</strong></td>
      <td>${r.percentage}%</td>
    </tr>
  `).join("");
}

// Render Bảng Thống Kê Top Depot & Hãng Tàu Có Số Lượng Đơn Hủy Nhiều Nhất Kèm Lý Do Phổ Biến
function renderTopDepotLineCancelTable(records = []) {
  const tbody = document.getElementById("tbodyTopDepotLineCancel");
  if (!tbody) return;

  const list = records || [];
  // Lọc chỉ lấy các đơn hủy (Đã hủy / Quá 3h tự động hủy / Từ chối duyệt)
  const cancelledList = list.filter(r => isCancelledOrder(r) || isAutoCancelledBy3h(r));
  const totalCancelled = cancelledList.length;

  if (totalCancelled === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted" style="padding: 24px;">Không có đơn hủy nào trong bộ lọc hiện tại.</td>
      </tr>
    `;
    return;
  }

  // Gom nhóm theo cặp: Depot + Hãng Tàu
  const groupMap = new Map();
  cancelledList.forEach(r => {
    const depot = (r.depot || "Chưa xác định").trim();
    const hangTau = (r.hangTau || "Khác").trim();
    const key = `${depot}___${hangTau}`;
    const teus = Number(r.sizeTeus) || 0;
    const reason = (r.lyDoHuy || r.lyDoTuChoi || "Không có lý do").trim();

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        depot,
        hangTau,
        cancelCount: 0,
        teus: 0,
        reasonsMap: new Map()
      });
    }

    const item = groupMap.get(key);
    item.cancelCount += 1;
    item.teus += teus;
    item.reasonsMap.set(reason, (item.reasonsMap.get(reason) || 0) + 1);
  });

  // Chuyển Map thành mảng, sắp xếp giảm dần theo số lượng đơn hủy
  const sortedPairs = Array.from(groupMap.values()).sort((a, b) => b.cancelCount - a.cancelCount);

  // Hiển thị Top 3 cặp Depot - Hãng tàu có đơn hủy nhiều nhất
  const topPairs = sortedPairs.slice(0, 3);

  tbody.innerHTML = topPairs.map((pair, idx) => {
    const pct = ((pair.cancelCount / totalCancelled) * 100).toFixed(1);

    // Lấy Top 3 lý do hủy phổ biến nhất của cặp Depot - Hãng tàu này
    const sortedReasons = Array.from(pair.reasonsMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const reasonsHtml = sortedReasons.map((rs, rIdx) => {
      const reasonPct = ((rs.count / pair.cancelCount) * 100).toFixed(0);
      return `<div style="font-size: 12.5px; line-height: 1.5; margin-bottom: 2px;">
        <span style="color: #475569; font-weight: 500;">- ${rs.reason}:</span> 
        <strong style="color: #b91c1c;">${rs.count} đơn</strong> 
        <span style="color: #64748b; font-size: 11px;">(${reasonPct}%)</span>
      </div>`;
    }).join("");

    return `
      <tr>
        <td class="text-center" style="font-weight: 600; color: #64748b;">${idx + 1}</td>
        <td><strong style="color: #1d4ed8; font-size: 13.5px;">${pair.depot}</strong></td>
        <td><strong>${pair.hangTau}</strong></td>
        <td style="text-align: right;"><strong style="color: #b91c1c; font-size: 14px;">${pair.cancelCount.toLocaleString()}</strong></td>
        <td style="text-align: right; font-weight: 600;">${pair.teus.toFixed(1)}</td>
        <td style="text-align: right;"><span style="font-weight: 700; color: #0f172a;">${pct}%</span></td>
        <td style="padding: 8px 12px;">${reasonsHtml}</td>
      </tr>
    `;
  }).join("");
}

// Trích xuất toàn bộ các chỉ số KPI Vận Hành & CSKH từ danh sách bản ghi
function extractKpiSummaryMetrics(list = []) {
  const currentTotal = list.length;
  const totalCancelled = list.filter(r => {
    const s = normalizeStr(r.trangThaiDonHang || "").toLowerCase();
    return s.includes("đã hủy") || s.includes("da huy") || s.includes("hủy") || s.includes("huy");
  }).length;

  const totalUnpaid = list.filter(r => isUnpaidOrder(r)).length;

  const totalProcessed = list.filter(r => {
    const st = r.trangThaiXuLy;
    return st && st !== "null" && st !== "undefined" && String(st).trim() !== "";
  }).length;

  const countSuccess = list.filter(r => {
    const x = normalizeCskhStatus(r.trangThaiXuLy || "", isUnpaidOrder(r));
    return x === "Đã thanh toán" || x === "Đã thành công";
  }).length;

  const countRebooked = list.filter(r => {
    const x = normalizeCskhStatus(r.trangThaiXuLy || "", isUnpaidOrder(r));
    return x === "Đã đặt lại";
  }).length;

  const countUncontacted = list.filter(r => {
    const x = normalizeCskhStatus(r.trangThaiXuLy || "", isUnpaidOrder(r));
    return x === "Không liên hệ được";
  }).length;

  const countContactWait = list.filter(r => {
    const x = normalizeCskhStatus(r.trangThaiXuLy || "", isUnpaidOrder(r));
    return x === "Đã liên hệ - Chờ";
  }).length;

  const countContactFailed = list.filter(r => {
    const x = normalizeCskhStatus(r.trangThaiXuLy || "", isUnpaidOrder(r));
    return x === "Đã liên hệ - Không thành công" || x === "Đã Liên hệ - Không đặt lại";
  }).length;

  const totalContacted = list.filter(r => {
    const x = normalizeCskhStatus(r.trangThaiXuLy || "", isUnpaidOrder(r));
    return x.startsWith("Đã liên hệ") || x === "Đã thành công" || x === "Đã thanh toán" || x === "Đã đặt lại" || x === "Đã Liên hệ - Không đặt lại";
  }).length;
  const totalCalls = totalContacted + countUncontacted;

  const rateContacted = totalCalls > 0 ? ((totalContacted / totalCalls) * 100).toFixed(1) : "0.0";
  const rateUncontacted = totalCalls > 0 ? ((countUncontacted / totalCalls) * 100).toFixed(1) : "0.0";

  return {
    currentTotal,
    totalCancelled,
    totalUnpaid,
    totalProcessed,
    countSuccess,
    countRebooked,
    countUncontacted,
    countContactWait,
    countContactFailed,
    totalContacted,
    totalCalls,
    rateContacted,
    rateUncontacted
  };
}

// Định dạng độ chênh lệch tăng giảm của chỉ số số lượng (count)
function formatCountDiff(cur, prev, hasComp, isIncreaseNegative = false) {
  if (!hasComp) {
    return `<span style="color: #94a3b8; font-size: 13px;">-</span>`;
  }
  const diff = cur - prev;
  let pctStr = "0.0%";
  if (prev > 0) {
    pctStr = ((Math.abs(diff) / prev) * 100).toFixed(1) + "%";
  } else if (cur > 0) {
    pctStr = "+100%";
  }

  const prevText = `Kỳ trước: ${prev.toLocaleString("vi-VN")}`;

  if (diff === 0) {
    return `
      <div style="font-weight: 600; color: #475569; font-size: 13px;">0 (0.0%)</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${prevText}</div>
    `;
  }

  if (diff > 0) {
    const color = isIncreaseNegative ? "#b91c1c" : "#15803d";
    return `
      <div style="font-weight: 700; color: ${color}; font-size: 13.5px;">+${diff.toLocaleString("vi-VN")} (+${pctStr})</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${prevText}</div>
    `;
  } else {
    const color = isIncreaseNegative ? "#15803d" : "#b91c1c";
    return `
      <div style="font-weight: 700; color: ${color}; font-size: 13.5px;">${diff.toLocaleString("vi-VN")} (-${pctStr})</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${prevText}</div>
    `;
  }
}

// Định dạng độ chênh lệch tăng giảm của chỉ số tỷ lệ % (rate)
function formatRateDiff(curRate, prevRate, curCalls, prevCalls, hasComp, isIncreaseNegative = false) {
  if (!hasComp) {
    return `<span style="color: #94a3b8; font-size: 13px;">-</span>`;
  }
  if (prevCalls === 0) {
    return `
      <div style="font-weight: 600; color: #475569; font-size: 12.5px;">Chưa có dữ liệu</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Kỳ trước: 0 cuộc</div>
    `;
  }

  const cRate = parseFloat(curRate) || 0;
  const pRate = parseFloat(prevRate) || 0;
  const diff = (cRate - pRate).toFixed(1);
  const prevText = `Kỳ trước: ${prevRate}%`;

  if (Math.abs(parseFloat(diff)) === 0) {
    return `
      <div style="font-weight: 600; color: #475569; font-size: 13px;">0.0%</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${prevText}</div>
    `;
  }

  if (diff > 0) {
    const color = isIncreaseNegative ? "#b91c1c" : "#15803d";
    return `
      <div style="font-weight: 700; color: ${color}; font-size: 13.5px;">+${diff}%</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${prevText}</div>
    `;
  } else {
    const color = isIncreaseNegative ? "#15803d" : "#b91c1c";
    return `
      <div style="font-weight: 700; color: ${color}; font-size: 13.5px;">${diff}%</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${prevText}</div>
    `;
  }
}

// Render Bảng Chỉ Số KPI Vận Hành & CSKH Kèm So Sánh Cùng Kỳ
function renderKpiSummaryTable(records, totalMasterCount, comparisonInfo = null) {
  const tbody = document.getElementById("tbodyKpiSummary");
  if (!tbody) return;

  const list = records || [];
  const currentTotal = list.length;
  const hasComp = Boolean(comparisonInfo && comparisonInfo.hasComparison);
  const prevList = hasComp ? (comparisonInfo.previousRecords || []) : [];

  const curM = extractKpiSummaryMetrics(list);
  const prevM = hasComp ? extractKpiSummaryMetrics(prevList) : null;

  const scopeEl = document.getElementById("kpiSummaryScope");
  if (scopeEl) {
    if (hasComp && comparisonInfo) {
      const daysText = comparisonInfo.diffDays === 1 ? "1 ngày" : `${comparisonInfo.diffDays} ngày`;
      const curFrom = formatDateDisplay(comparisonInfo.currentFrom);
      const curTo = formatDateDisplay(comparisonInfo.currentTo);
      const prevFrom = formatDateDisplay(comparisonInfo.prevFrom);
      const prevTo = formatDateDisplay(comparisonInfo.prevTo);
      scopeEl.innerHTML = `
        <span>Kỳ này (${daysText}): <strong style="color: #1e293b;">${curFrom} - ${curTo}</strong> (${currentTotal.toLocaleString("vi-VN")} đơn)</span>
        <span style="margin: 0 8px; color: #cbd5e1;">|</span>
        <span style="color: #475569;">Cùng kỳ trước: <strong style="color: #1e293b;">${prevFrom} - ${prevTo}</strong> (${prevList.length.toLocaleString("vi-VN")} đơn)</span>
      `;
    } else {
      if (totalMasterCount && totalMasterCount > currentTotal) {
        scopeEl.innerHTML = `<span>Hiển thị ${currentTotal.toLocaleString("vi-VN")} / ${totalMasterCount.toLocaleString("vi-VN")} đơn theo bộ lọc</span> <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">(Chọn khoảng ngày để so sánh cùng kỳ)</span>`;
      } else {
        scopeEl.innerHTML = `<span>Tổng cộng: ${currentTotal.toLocaleString("vi-VN")} đơn</span> <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">(Chọn khoảng ngày để so sánh cùng kỳ)</span>`;
      }
    }
  }

  // Tính phần trăm so với tổng số đơn hiện tại
  const calcPct = cnt => currentTotal > 0 ? ((cnt / currentTotal) * 100).toFixed(1) + "%" : "0.0%";

  const kpiRows = [
    {
      stt: 1,
      title: "Tổng số đơn hủy",
      count: curM.totalCancelled,
      pct: calcPct(curM.totalCancelled),
      compareHtml: formatCountDiff(curM.totalCancelled, prevM ? prevM.totalCancelled : 0, hasComp, true),
      note: "Đơn có trạng thái đơn hàng là Đã hủy",
      badgeClass: "badge-danger",
      isHighlight: true
    },
    {
      stt: 2,
      title: "Số đơn chưa thanh toán",
      count: curM.totalUnpaid,
      pct: calcPct(curM.totalUnpaid),
      compareHtml: formatCountDiff(curM.totalUnpaid, prevM ? prevM.totalUnpaid : 0, hasComp, true),
      note: "Đơn có trạng thái đơn hàng là Chưa thanh toán",
      badgeClass: "badge-warning",
      isHighlight: true
    },
    {
      stt: 3,
      title: "Tổng số đơn đã được phân loại trạng thái đã xử lý",
      count: curM.totalProcessed,
      pct: calcPct(curM.totalProcessed),
      compareHtml: formatCountDiff(curM.totalProcessed, prevM ? prevM.totalProcessed : 0, hasComp, false),
      note: "Các đơn CSKH đã cập nhật trạng thái xử lý",
      badgeClass: "badge-info",
      isHighlight: true
    },
    {
      stt: 4,
      title: "Đã thanh toán / Đã thành công",
      count: curM.countSuccess,
      pct: calcPct(curM.countSuccess),
      compareHtml: formatCountDiff(curM.countSuccess, prevM ? prevM.countSuccess : 0, hasComp, false),
      note: "Trạng thái xử lý: Đã thanh toán / Đã thành công",
      badgeClass: "badge-success",
      isHighlight: false
    },
    {
      stt: 5,
      title: "Đã đặt lại",
      count: curM.countRebooked,
      pct: calcPct(curM.countRebooked),
      compareHtml: formatCountDiff(curM.countRebooked, prevM ? prevM.countRebooked : 0, hasComp, false),
      note: "Trạng thái xử lý: Đã đặt lại",
      badgeClass: "badge-secondary",
      isHighlight: false
    },
    {
      stt: 6,
      title: "Không liên hệ được",
      count: curM.countUncontacted,
      pct: calcPct(curM.countUncontacted),
      compareHtml: formatCountDiff(curM.countUncontacted, prevM ? prevM.countUncontacted : 0, hasComp, true),
      note: "Trạng thái xử lý: Không liên hệ được",
      badgeClass: "badge-warning",
      isHighlight: false
    },
    {
      stt: 7,
      title: "Đã liên hệ - Chờ",
      count: curM.countContactWait,
      pct: calcPct(curM.countContactWait),
      compareHtml: formatCountDiff(curM.countContactWait, prevM ? prevM.countContactWait : 0, hasComp, false),
      note: "Trạng thái xử lý: Đã liên hệ - Chờ",
      badgeClass: "badge-warning",
      isHighlight: false
    },
    {
      stt: 8,
      title: "Đã liên hệ - Không thành công / Không đặt lại",
      count: curM.countContactFailed,
      pct: calcPct(curM.countContactFailed),
      compareHtml: formatCountDiff(curM.countContactFailed, prevM ? prevM.countContactFailed : 0, hasComp, false),
      note: "Trạng thái xử lý: Đã liên hệ - Không thành công / Đã Liên hệ - Không đặt lại",
      badgeClass: "badge-danger",
      isHighlight: false
    },
    {
      stt: 9,
      title: "Tỉ lệ liên hệ được",
      count: `${curM.totalContacted} / ${curM.totalCalls} cuộc`,
      pct: `${curM.rateContacted}%`,
      compareHtml: formatRateDiff(curM.rateContacted, prevM ? prevM.rateContacted : "0.0", curM.totalCalls, prevM ? prevM.totalCalls : 0, hasComp, false),
      note: `Tổng số cuộc gọi đã kết nối thành công (${curM.totalContacted} cuộc)`,
      badgeClass: "badge-success",
      isHighlight: true
    },
    {
      stt: 10,
      title: "Tỉ lệ liên hệ không được",
      count: `${curM.countUncontacted} / ${curM.totalCalls} cuộc`,
      pct: `${curM.rateUncontacted}%`,
      compareHtml: formatRateDiff(curM.rateUncontacted, prevM ? prevM.rateUncontacted : "0.0", curM.totalCalls, prevM ? prevM.totalCalls : 0, hasComp, true),
      note: `Số cuộc gọi không thể liên lạc được (${curM.countUncontacted} cuộc)`,
      badgeClass: "badge-danger",
      isHighlight: true
    }
  ];

  tbody.innerHTML = kpiRows.map(row => {
    const rowClass = row.isHighlight ? "kpi-summary-row-highlight" : "";
    return `
      <tr class="${rowClass}">
        <td style="text-align: center; font-weight: 600; color: #64748b;">${row.stt}</td>
        <td>
          <span style="font-weight: 600; color: #0f172a;">${row.title}</span>
        </td>
        <td style="text-align: right; font-weight: 700; color: #1d4ed8; font-size: 14px;">
          ${typeof row.count === "number" ? row.count.toLocaleString("vi-VN") : row.count}
        </td>
        <td style="text-align: right; font-weight: 600; color: #334155;">
          ${row.pct}
        </td>
        <td style="text-align: right;">
          ${row.compareHtml}
        </td>
        <td>
          <span class="badge ${row.badgeClass}" style="margin-right: 6px;">${row.note}</span>
        </td>
      </tr>
    `;
  }).join("");
}

// Exports
async function copyMarkdownReport() {
  if (!currentAnalyticsData) return;
  try {
    const markdown = generateMarkdownText(currentAnalyticsData);
    await navigator.clipboard.writeText(markdown);
    showAlert("Đã sao chép báo cáo Markdown vào Clipboard!", false);
  } catch (err) {
    showAlert("Không thể sao chép Markdown: " + err.message);
  }
}

function generateMarkdownText(data) {
  const { kpis, byDepot, topCancelReasons } = data;
  let md = `# BÁO CÁO PHÂN TÍCH ĐƠN HỦY 24/7 (LOGISTICS & DEPOT)\n\n`;
  md += `### 1. KPIs Tổng Quan\n`;
  md += `- Tổng đơn hủy: **${kpis.totalOrders} đơn** (${kpis.totalTeus} TEUs)\n`;
  md += `- Chiều OUT / IN: **${kpis.byDirection['OUT'] || 0} OUT** / **${kpis.byDirection['IN'] || 0} IN**\n`;
  md += `- Trạng thái: Đã hủy: ${kpis.byStatus['Đã hủy'] || 0}, Đã hoàn tiền: ${kpis.byStatus['Đã hoàn tiền'] || 0}, Đang hoàn tiền: ${kpis.byStatus['Đang hoàn tiền'] || 0}\n\n`;
  md += `### 2. Phân Bố Theo Depot\n`;
  byDepot.forEach(d => {
    md += `- **Depot ${d.depot}**: ${d.totalOrders} đơn (${d.totalTeus} TEUs)\n`;
  });
  md += `\n### 3. Top Lý Do Hủy\n`;
  topCancelReasons.slice(0, 5).forEach((r, i) => {
    md += `${i + 1}. ${r.reason}: ${r.count} đơn (${r.percentage}%)\n`;
  });
  return md;
}

function downloadJsonData() {
  if (!currentAnalyticsData) return;
  const jsonStr = JSON.stringify(currentAnalyticsData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bao_cao_don_huy_${new Date().toISOString().substring(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================
// CHỨC NĂNG IN / XUẤT ẢNH PNG CHO BẢNG BÁO CÁO THỐNG KÊ
// =====================================================

async function ensureHtml2CanvasLoaded() {
  if (typeof html2canvas === "function") return true;
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

async function exportElementToPng(elementOrId, fileName = "bao_cao_thong_ke.png", triggerBtn = null) {
  const el = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
  if (!el) {
    showAlert("Không tìm thấy bảng dữ liệu để in ảnh PNG.");
    return;
  }

  const origBtnText = triggerBtn ? triggerBtn.textContent : "";
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = "Đang xuất PNG...";
  }

  showAlert("Đang xử lý kết xuất ảnh PNG cho bảng, vui lòng chờ...", false);

  try {
    const isReady = await ensureHtml2CanvasLoaded();
    if (!isReady || typeof html2canvas !== "function") {
      throw new Error("Không thể tải thư viện đồ họa html2canvas. Vui lòng kiểm tra lại kết nối mạng.");
    }

    // Nhịp chờ nhỏ để DOM ổn định trạng thái render
    await new Promise(r => setTimeout(r, 120));

    const canvas = await html2canvas(el, {
      scale: 2, // Độ nét Retina x2
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (clonedDoc) => {
        // 1. Gỡ bỏ triệt để mọi giới hạn cuộn (overflow, max-height) theo quy chuẩn xuất PNG
        const scrollContainers = clonedDoc.querySelectorAll(
          ".table-responsive, .matrix-table-container, .inline-table-container, .modal-table-container"
        );
        scrollContainers.forEach((c) => {
          c.style.maxHeight = "none";
          c.style.overflow = "visible";
          c.style.height = "auto";
        });

        // 2. Gỡ bỏ position: sticky trên thead và các cột ghim để ảnh canvas không bị lệch vị trí
        const stickyElements = clonedDoc.querySelectorAll(
          ".matrix-table thead th, .matrix-table th, .matrix-table td, " +
          ".inline-detail-table thead th, .modal-data-table thead th, " +
          ".matrix-row-total td, .frozen-col, .kpi-summary-table thead th, .data-table thead th"
        );
        stickyElements.forEach((s) => {
          s.style.position = "static";
        });

        // 3. Ẩn các nút điều khiển giao diện (In PNG, Xuất CSV, Tìm kiếm, Đóng...) trên bản in
        const controlsToHide = [
          ".matrix-detail-actions",
          ".matrix-controls",
          ".modal-toolbar-actions",
          ".modal-search-box",
          "#btnExportKpiPng",
          "#btnExportTopDepotLinePng",
          "#btnExportDepotPng",
          "#btnExportReasonsPng",
          ".modal-close-btn",
          "#btnModalCloseFooter"
        ];
        controlsToHide.forEach((sel) => {
          clonedDoc.querySelectorAll(sel).forEach((btn) => {
            btn.style.display = "none";
          });
        });

        // 4. Đảm bảo toàn bộ bảng chiếm 100% chiều ngang
        clonedDoc.querySelectorAll("table").forEach((tbl) => {
          tbl.style.width = "100%";
        });
      }
    });

    // Kết xuất ảnh PNG và tải xuống
    const imageUri = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
    link.href = imageUri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showAlert("Đã tải ảnh PNG thành công!", false);
  } catch (err) {
    console.error("Lỗi khi kết xuất ảnh PNG:", err);
    showAlert("Không thể xuất ảnh PNG: " + (err.message || err));
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = origBtnText;
    }
  }
}

function initExportPngEvents() {
  const btnKpiPng = document.getElementById("btnExportKpiPng");
  if (btnKpiPng) {
    btnKpiPng.onclick = () => {
      const card = document.getElementById("kpiSummaryCard");
      const dateStr = new Date().toISOString().substring(0, 10);
      exportElementToPng(card, `bang_chi_so_kpi_${dateStr}.png`, btnKpiPng);
    };
  }

  const btnTopDepotLinePng = document.getElementById("btnExportTopDepotLinePng");
  if (btnTopDepotLinePng) {
    btnTopDepotLinePng.onclick = () => {
      const card = document.getElementById("topDepotLineCancelCard");
      const dateStr = new Date().toISOString().substring(0, 10);
      exportElementToPng(card, `top_depot_hang_tau_huy_${dateStr}.png`, btnTopDepotLinePng);
    };
  }

  const btnDepotPng = document.getElementById("btnExportDepotPng");
  if (btnDepotPng) {
    btnDepotPng.onclick = () => {
      const card = document.getElementById("depotTableCard");
      const dateStr = new Date().toISOString().substring(0, 10);
      exportElementToPng(card, `thong_ke_theo_depot_${dateStr}.png`, btnDepotPng);
    };
  }

  const btnReasonsPng = document.getElementById("btnExportReasonsPng");
  if (btnReasonsPng) {
    btnReasonsPng.onclick = () => {
      const card = document.getElementById("reasonsTableCard");
      const dateStr = new Date().toISOString().substring(0, 10);
      exportElementToPng(card, `top_ly_do_huy_don_${dateStr}.png`, btnReasonsPng);
    };
  }

  const btnDashboardPng = document.getElementById("btnExportDashboardPng");
  if (btnDashboardPng) {
    btnDashboardPng.onclick = () => {
      exportDashboardOverviewPng(btnDashboardPng);
    };
  }
}

// Xuất ảnh PNG toàn bộ Dashboard tổng hợp các bảng báo cáo (không in biểu đồ Cơ Cấu Lý Do Hủy Đơn, loại trừ bảng chi tiết đơn và mục bất thường)
async function exportDashboardOverviewPng(triggerBtn = null) {
  const el = document.getElementById("dashboardContent");
  if (!el) {
    showAlert("Không tìm thấy nội dung Dashboard để xuất ảnh PNG.");
    return;
  }

  const origBtnText = triggerBtn ? triggerBtn.textContent : "";
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = "Đang xuất PNG...";
  }

  showAlert("Đang xử lý kết xuất ảnh PNG cho toàn bộ Dashboard, vui lòng chờ...", false);

  try {
    const isReady = await ensureHtml2CanvasLoaded();
    if (!isReady || typeof html2canvas !== "function") {
      throw new Error("Không thể tải thư viện đồ họa html2canvas. Vui lòng kiểm tra lại kết nối mạng.");
    }

    // 1. Lưu lại các canvas chart hiện tại thành ảnh base64 để đồng bộ sang bản clone
    const canvasDataUrls = {};
    el.querySelectorAll("canvas").forEach((cv, idx) => {
      try {
        canvasDataUrls[idx] = cv.toDataURL("image/png");
      } catch (e) {
        console.warn("Không thể chụp canvas index", idx, e);
      }
    });

    await new Promise(r => setTimeout(r, 120));

    const dateStr = new Date().toISOString().substring(0, 10);
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#f8fafc",
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(document.documentElement.clientWidth || 0, 1366),
      onclone: (clonedDoc) => {
        // 1. Đồng bộ lại dữ liệu vẽ trên các thẻ <canvas> (như chartReasons)
        const clonedCanvases = clonedDoc.querySelectorAll("#dashboardContent canvas");
        clonedCanvases.forEach((clonedCv, idx) => {
          const dataUrl = canvasDataUrls[idx];
          if (dataUrl) {
            try {
              const ctx = clonedCv.getContext("2d");
              if (ctx) {
                const img = new Image();
                img.src = dataUrl;
                // Vẽ đè ảnh snapshot lên canvas của bản clone
                ctx.drawImage(img, 0, 0, clonedCv.width, clonedCv.height);
              }
            } catch (err) {
              console.warn("Lỗi vẽ lại canvas clone:", err);
            }
          }
        });

        // 2. Cấu hình hiển thị theo yêu cầu:
        // - Ẩn biểu đồ Cơ Cấu Lý Do Hủy Đơn (.charts-grid)
        // - Ẩn Thống Kê Chi Tiết Theo Depot (#depotTableCard)
        // - Ẩn Top Lý Do Hủy & Phản Hồi Từ Chối Điều Độ (#reasonsTableCard)
        // - Ẩn Bảng Thống Kê Chi Tiết Toàn Bộ Đơn Hàng (#matrixDetailSection)
        // - Ẩn Chi Tiết Bất Thường Cần Lưu Ý (.anomalies-section)
        // - CÁC BẢNG ĐƯỢC IN:
        //   + 4 Thẻ KPI Tổng Quan (.kpi-grid)
        //   + Bảng Chỉ Số KPI Vận Hành & CSKH (#kpiSummaryCard)
        //   + Bảng Ma Trận Phân Bố Số Lượng Đơn (#matrixCard)
        //   + Bảng Top 3 Depot & Hãng Tàu (#topDepotLineCancelCard)
        const exclusions = [
          ".charts-grid",
          "#depotTableCard",
          "#reasonsTableCard",
          "#matrixDetailSection",
          ".anomalies-section"
        ];
        exclusions.forEach((sel) => {
          clonedDoc.querySelectorAll(sel).forEach((node) => {
            node.style.setProperty("display", "none", "important");
          });
        });

        // Định dạng các khối bảng dashboard thành dạng 1 cột toàn chiều rộng (full-width) để hiển thị rõ ràng
        clonedDoc.querySelectorAll(".tables-grid").forEach((grid) => {
          const visibleChildren = Array.from(grid.children).filter(c => c.style.display !== "none");
          if (visibleChildren.length === 0) {
            grid.style.setProperty("display", "none", "important");
          } else {
            grid.style.display = "flex";
            grid.style.flexDirection = "column";
            grid.style.gap = "20px";
            grid.style.width = "100%";
          }
        });

        // 3. Ẩn các bộ điều khiển tương tác, nút bấm, thông báo nguồn
        const interactiveToHide = [
          ".source-notice",
          ".filter-panel",
          ".matrix-controls",
          ".matrix-detail-actions",
          "#btnExportKpiPng",
          "#btnExportTopDepotLinePng",
          "#btnExportDepotPng",
          "#btnExportReasonsPng",
          "#btnExportMatrixPng",
          "#btnExportContactMatrixPng",
          "#btnExportContactMatrixCsv",
          "#btnExportInlinePng",
          ".btn-matrix-toggle span.matrix-toggle-badge"
        ];
        interactiveToHide.forEach((sel) => {
          clonedDoc.querySelectorAll(sel).forEach((node) => {
            node.style.setProperty("display", "none", "important");
          });
        });

        // 4. Gỡ bỏ triệt để thanh cuộn, giới hạn chiều cao trên toàn bộ thẻ cha và thẻ con
        const clonedDashboard = clonedDoc.getElementById("dashboardContent");
        if (clonedDashboard) {
          clonedDashboard.style.overflow = "visible";
          clonedDashboard.style.height = "auto";
          clonedDashboard.style.maxHeight = "none";
          clonedDashboard.style.width = "100%";
        }

        const scrollContainers = clonedDoc.querySelectorAll(
          ".main-content, .table-responsive, .matrix-table-container, .inline-table-container, .modal-table-container"
        );
        scrollContainers.forEach((c) => {
          c.style.maxHeight = "none";
          c.style.overflow = "visible";
          c.style.height = "auto";
        });

        // 5. Gỡ bỏ position: sticky trên header bảng và cột ghim để không bị xê dịch toạ độ
        const stickyElements = clonedDoc.querySelectorAll(
          ".matrix-table thead th, .matrix-table th, .matrix-table td, " +
          ".matrix-row-total td, .frozen-col, .kpi-summary-table thead th, .data-table thead th"
        );
        stickyElements.forEach((s) => {
          s.style.position = "static";
        });

        // 6. Đảm bảo toàn bộ bảng và card chiếm 100% chiều ngang
        clonedDoc.querySelectorAll("table, .matrix-card, .table-card").forEach((tbl) => {
          tbl.style.width = "100%";
        });
      }
    });

    const imageUri = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `dashboard_bao_cao_tong_quan_${dateStr}.png`;
    link.href = imageUri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showAlert("Đã xuất ảnh PNG Dashboard thành công!", false);
  } catch (err) {
    console.error("Lỗi khi kết xuất ảnh PNG Dashboard:", err);
    showAlert("Không thể xuất ảnh PNG Dashboard: " + (err.message || err));
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = origBtnText;
    }
  }
}

// =====================================================
// BẢNG MA TRẬN HÃNG TÀU × DEPOT THEO TRẠNG THÁI ĐƠN HÀNG
// =====================================================

function normalizeStr(s) {
  if (s === null || s === undefined) return "";
  return String(s).normalize("NFC").trim();
}

// =====================================================
// BẢNG MA TRẬN PHÂN BỐ (DEPOT & HÃNG TÀU × TRẠNG THÁI)
// =====================================================

let collapsedDepots = new Set(); // Lưu trữ các Depot đang được thu gọn

function initMatrixStatusControls(records) {
  const btnExportMatrixPng = document.getElementById("btnExportMatrixPng");
  const btnExpand = document.getElementById("btnExpandAllDepots");
  const btnCollapse = document.getElementById("btnCollapseAllDepots");

  if (btnExportMatrixPng) {
    btnExportMatrixPng.onclick = () => {
      const card = document.getElementById("matrixCard");
      const dateStr = new Date().toISOString().substring(0, 10);
      exportElementToPng(card, `ma_tran_phan_bo_don_hang_${dateStr}.png`, btnExportMatrixPng);
    };
  }

  if (btnExpand) {
    btnExpand.onclick = () => {
      collapsedDepots.clear();
      renderMatrixTable(currentRecords);
    };
  }

  if (btnCollapse) {
    btnCollapse.onclick = () => {
      const allDepots = [...new Set((currentRecords || []).map(r => normalizeStr(r.depot).toUpperCase()).filter(Boolean))];
      allDepots.forEach(d => collapsedDepots.add(d));
      renderMatrixTable(currentRecords);
    };
  }
}

// Hàm toggle thu gọn/mở rộng một Depot cụ thể
window.toggleDepotCollapse = function(depotName) {
  if (collapsedDepots.has(depotName)) {
    collapsedDepots.delete(depotName);
  } else {
    collapsedDepots.add(depotName);
  }
  renderMatrixTable(currentRecords);
};

// Render Bảng Ma Trận: Rows = Depot & Hãng Tàu, Columns = Trạng Thái Đơn Hàng
function renderMatrixTable(records) {
  const thead = document.getElementById("theadMatrix");
  const tbody = document.getElementById("tbodyMatrix");
  const summaryEl = document.getElementById("matrixSummaryText");
  if (!thead || !tbody) return;

  const list = records || [];

  // 1. Thu thập danh sách các Trạng Thái duy nhất (Columns)
  const statusMap = {};
  list.forEach(r => {
    const st = normalizeStr(r.trangThaiDonHang) || "Chưa xác định";
    statusMap[st] = (statusMap[st] || 0) + 1;
  });

  // Sắp xếp các cột trạng thái theo thứ tự số lượng giảm dần
  const allStatuses = Object.keys(statusMap).sort((a, b) => statusMap[b] - statusMap[a]);

  // 2. Nhóm dữ liệu theo Depot -> Hãng Tàu -> Trạng Thái
  const depotTree = {};
  list.forEach(r => {
    const d = normalizeStr(r.depot).toUpperCase() || "KHAC";
    const l = normalizeStr(r.hangTau).toUpperCase() || "KHAC";
    const st = normalizeStr(r.trangThaiDonHang) || "Chưa xác định";

    if (!depotTree[d]) {
      depotTree[d] = {
        name: d,
        total: 0,
        statusCounts: {},
        lines: {}
      };
    }
    depotTree[d].total += 1;
    depotTree[d].statusCounts[st] = (depotTree[d].statusCounts[st] || 0) + 1;

    if (!depotTree[d].lines[l]) {
      depotTree[d].lines[l] = {
        name: l,
        total: 0,
        statusCounts: {}
      };
    }
    depotTree[d].lines[l].total += 1;
    depotTree[d].lines[l].statusCounts[st] = (depotTree[d].lines[l].statusCounts[st] || 0) + 1;
  });

  // Sắp xếp các Depot theo thứ tự tổng số lượng giảm dần
  const sortedDepotKeys = Object.keys(depotTree).sort((a, b) => depotTree[b].total - depotTree[a].total);

  // 3. Render thead
  thead.innerHTML = `
    <tr>
      <th style="width: 140px; min-width: 140px; text-align: left; padding-left: 14px;">Depot</th>
      <th style="width: 130px; min-width: 130px; text-align: left; padding-left: 10px;">Hãng Tàu</th>
      ${allStatuses.map(st => `<th style="min-width: 105px; text-align: right;" title="${st}">${st}</th>`).join("")}
      <th class="matrix-col-total" style="min-width: 110px; text-align: right;">Grand Total</th>
    </tr>
  `;

  // 4. Render tbody
  let tbodyHtml = "";

  sortedDepotKeys.forEach(depotKey => {
    const depotData = depotTree[depotKey];
    const isCollapsed = collapsedDepots.has(depotKey);
    const lineKeys = Object.keys(depotData.lines).sort((a, b) => depotData.lines[b].total - depotData.lines[a].total);
    const toggleIcon = isCollapsed ? "[+]" : "[-]";

    // Dòng Header của Depot (có nút thu gọn / mở rộng)
    let depotCells = allStatuses.map(st => {
      const cnt = depotData.statusCounts[st] || 0;
      if (cnt === 0) return `<td class="matrix-val-empty" style="text-align: right;">-</td>`;
      return `
        <td class="matrix-cell-clickable" style="text-align: right;" onclick="onMatrixCellClick('ALL', '${depotKey}', this, '${st}')" title="Bấm để xem ${cnt} đơn của Depot ${depotKey} (${st})">
          <strong style="color: #1d4ed8;">${cnt}</strong>
        </td>
      `;
    }).join("");

    tbodyHtml += `
      <tr class="matrix-depot-header-row">
        <td style="text-align: left; padding-left: 10px;">
          <button type="button" class="btn-matrix-toggle" onclick="toggleDepotCollapse('${depotKey}')" title="${isCollapsed ? 'Mở rộng chi tiết hãng tàu' : 'Thu gọn depot này'}">
            <span class="matrix-toggle-badge">${toggleIcon}</span>
            <span style="color: #1e3a8a; font-size: 13.5px; font-weight: 700;">${depotKey}</span>
          </button>
        </td>
        <td style="text-align: left; color: #64748b; font-size: 12px; font-style: italic; padding-left: 10px;">
          (${lineKeys.length} hãng tàu)
        </td>
        ${depotCells}
        <td class="matrix-col-total matrix-cell-clickable" style="text-align: right;" onclick="onMatrixCellClick('ALL', '${depotKey}', this, 'ALL')" title="Bấm để xem toàn bộ ${depotData.total} đơn của Depot ${depotKey}">
          <strong style="color: #0f172a;">${depotData.total}</strong>
        </td>
      </tr>
    `;

    // Nếu không bị thu gọn, hiển thị các dòng Hãng Tàu con
    if (!isCollapsed) {
      lineKeys.forEach(lineKey => {
        const lineData = depotData.lines[lineKey];

        let lineCells = allStatuses.map(st => {
          const cnt = lineData.statusCounts[st] || 0;
          if (cnt === 0) return `<td class="matrix-val-empty" style="text-align: right;">-</td>`;
          let heatCls = "badge-heat-low";
          if (cnt >= 9) heatCls = "badge-heat-high";
          else if (cnt >= 4) heatCls = "badge-heat-med";

          return `
            <td class="matrix-cell-clickable" style="text-align: right;" onclick="onMatrixCellClick('${lineKey}', '${depotKey}', this, '${st}')" title="Bấm xem ${cnt} đơn của Hãng ${lineKey} tại Depot ${depotKey} (${st})">
              <span class="matrix-cell-badge ${heatCls}">
                ${cnt}
              </span>
            </td>
          `;
        }).join("");

        tbodyHtml += `
          <tr class="matrix-line-subrow">
            <td style="text-align: left; padding-left: 16px; font-size: 12px; color: #94a3b8; font-weight: 500;">
              ${depotKey}
            </td>
            <td style="text-align: left; font-weight: 600; color: #1e293b; padding-left: 12px;">
              <span style="color: #94a3b8; margin-right: 6px;">↳</span>${lineKey}
            </td>
            ${lineCells}
            <td class="matrix-col-total matrix-cell-clickable" style="text-align: right;" onclick="onMatrixCellClick('${lineKey}', '${depotKey}', this, 'ALL')" title="Bấm xem ${lineData.total} đơn của Hãng ${lineKey} tại Depot ${depotKey}">
              <strong>${lineData.total}</strong>
            </td>
          </tr>
        `;
      });

      // Dòng Depot Total (giữ nguyên không dùng colspan)
      let depotTotalCells = allStatuses.map(st => {
        const cnt = depotData.statusCounts[st] || 0;
        if (cnt === 0) return `<td class="matrix-val-empty" style="text-align: right;">-</td>`;
        return `<td style="text-align: right;"><strong>${cnt}</strong></td>`;
      }).join("");

      tbodyHtml += `
        <tr class="matrix-depot-total-row">
          <td style="text-align: left; padding-left: 14px; font-weight: 700; color: #334155;">${depotKey} Total</td>
          <td style="text-align: left; font-size: 12px; color: #64748b; font-style: italic; padding-left: 10px;">Tổng Depot</td>
          ${depotTotalCells}
          <td class="matrix-col-total" style="text-align: right;"><strong style="color: #1d4ed8;">${depotData.total}</strong></td>
        </tr>
      `;
    }
  });

  // Dòng Tổng Cộng Toàn Bộ (Grand Total Row)
  const colTotals = {};
  allStatuses.forEach(st => {
    colTotals[st] = list.filter(r => (normalizeStr(r.trangThaiDonHang) || "Chưa xác định") === st).length;
  });
  const grandTotal = list.length;

  let grandTotalCells = allStatuses.map(st => {
    const cnt = colTotals[st] || 0;
    return `
      <td class="matrix-cell-clickable" style="text-align: right;" onclick="onMatrixCellClick('ALL', 'ALL', this, '${st}')" title="Bấm xem toàn bộ ${cnt} đơn trạng thái ${st}">
        <strong>${cnt}</strong>
      </td>
    `;
  }).join("");

  tbodyHtml += `
    <tr class="matrix-row-total">
      <td style="text-align: left; padding-left: 14px; font-size: 13.5px; font-weight: 800; color: #0f172a;">GRAND TOTAL</td>
      <td style="text-align: left; font-size: 12px; font-weight: 600; color: #475569; font-style: italic; padding-left: 10px;">Toàn bộ</td>
      ${grandTotalCells}
      <td class="cell-grand-total matrix-cell-clickable" style="text-align: right; color: #1d4ed8; font-size: 14px;" onclick="onMatrixCellClick('ALL', 'ALL', this, 'ALL')" title="Bấm xem toàn bộ ${grandTotal} đơn">
        <strong>${grandTotal}</strong>
      </td>
    </tr>
  `;

  tbody.innerHTML = tbodyHtml;

  if (summaryEl) {
    summaryEl.textContent = `Tổng cộng: ${sortedDepotKeys.length} Depot | ${list.length} đơn hàng theo bộ lọc`;
  }
}

// =====================================================
// MA TRẬN PHÂN BỐ DEPOT & TRẠNG THÁI ĐƠN × TRẠNG THÁI LIÊN HỆ
// =====================================================

function initContactMatrixControls(records) {
  const btnExportPng = document.getElementById("btnExportContactMatrixPng");
  const btnExportCsv = document.getElementById("btnExportContactMatrixCsv");

  if (btnExportPng) {
    btnExportPng.onclick = () => {
      const card = document.getElementById("contactMatrixCard");
      const dateStr = new Date().toISOString().substring(0, 10);
      exportElementToPng(card, `ma_tran_depot_trang_thai_don_lien_he_${dateStr}.png`, btnExportPng);
    };
  }

  if (btnExportCsv) {
    btnExportCsv.onclick = () => {
      exportContactMatrixCsv(records);
    };
  }
}

// Hàm xuất CSV cho ma trận Depot & Trạng thái đơn x Trạng thái liên hệ
function exportContactMatrixCsv(records) {
  const rawList = records || [];
  const list = rawList.filter(r => isUnpaidOrder(r) || isCancelledOrder(r));
  if (list.length === 0) {
    alert("Không có dữ liệu đơn Chưa thanh toán hoặc Đã hủy để xuất CSV.");
    return;
  }

  // Thu thập danh sách cột trạng thái liên hệ
  const contactMap = {};
  list.forEach(r => {
    const isUnpaid = isUnpaidOrder(r);
    const cskh = normalizeCskhStatus(r.trangThaiXuLy, isUnpaid) || "Chưa cập nhật";
    contactMap[cskh] = (contactMap[cskh] || 0) + 1;
  });

  const preferredOrder = [
    "Chưa cập nhật",
    "Đã liên hệ - Chờ",
    "Đã thanh toán",
    "Đã thành công",
    "Đã đặt lại",
    "Đã Liên hệ - Không đặt lại",
    "Đã liên hệ - Không thành công",
    "Không liên hệ được"
  ];
  const activeStatuses = Object.keys(contactMap);
  const allContactStatuses = [
    ...preferredOrder.filter(st => activeStatuses.includes(st)),
    ...activeStatuses.filter(st => !preferredOrder.includes(st))
  ];
  if (allContactStatuses.length === 0) allContactStatuses.push("Chưa cập nhật");

  const depotSet = new Set();
  rawList.forEach(r => {
    const d = normalizeStr(r.depot).toUpperCase();
    if (d) depotSet.add(d);
  });
  const sortedDepots = Array.from(depotSet).sort();

  const matrixData = {};
  sortedDepots.forEach(d => {
    matrixData[d] = {
      unpaid: { total: 0, counts: {} },
      cancelled: { total: 0, counts: {} }
    };
  });

  list.forEach(r => {
    const d = normalizeStr(r.depot).toUpperCase() || "KHAC";
    if (!matrixData[d]) {
      matrixData[d] = {
        unpaid: { total: 0, counts: {} },
        cancelled: { total: 0, counts: {} }
      };
    }
    const isUnpaid = isUnpaidOrder(r);
    const type = isUnpaid ? "unpaid" : "cancelled";
    const cskh = normalizeCskhStatus(r.trangThaiXuLy, isUnpaid) || "Chưa cập nhật";
    matrixData[d][type].counts[cskh] = (matrixData[d][type].counts[cskh] || 0) + 1;
    matrixData[d][type].total += 1;
  });

  const headers = ["Depot", "Trạng Thái Đơn", ...allContactStatuses, "Grand Total"];
  const rows = [];

  sortedDepots.forEach(d => {
    const dData = matrixData[d];
    rows.push([
      `"${d}"`,
      `"Chưa thanh toán"`,
      ...allContactStatuses.map(st => dData.unpaid.counts[st] || 0),
      dData.unpaid.total
    ]);
    rows.push([
      `"${d}"`,
      `"Đã hủy"`,
      ...allContactStatuses.map(st => dData.cancelled.counts[st] || 0),
      dData.cancelled.total
    ]);
  });

  const unpaidTotals = allContactStatuses.map(st => {
    return sortedDepots.reduce((sum, d) => sum + (matrixData[d].unpaid.counts[st] || 0), 0);
  });
  const cancelTotals = allContactStatuses.map(st => {
    return sortedDepots.reduce((sum, d) => sum + (matrixData[d].cancelled.counts[st] || 0), 0);
  });
  const totalUnpaidSum = sortedDepots.reduce((sum, d) => sum + matrixData[d].unpaid.total, 0);
  const totalCancelSum = sortedDepots.reduce((sum, d) => sum + matrixData[d].cancelled.total, 0);

  rows.push([`"TỔNG CỘNG"`, `"Chưa thanh toán"`, ...unpaidTotals, totalUnpaidSum]);
  rows.push([`"TỔNG CỘNG"`, `"Đã hủy"`, ...cancelTotals, totalCancelSum]);
  rows.push([
    `"TẤT CẢ (GRAND TOTAL)"`,
    `"Tất cả trạng thái"`,
    ...allContactStatuses.map((st, i) => unpaidTotals[i] + cancelTotals[i]),
    totalUnpaidSum + totalCancelSum
  ]);

  const csvContent = "\uFEFF" + [headers.map(h => `"${h}"`).join(","), ...rows.map(e => e.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().substring(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `ma_tran_depot_trang_thai_don_lien_he_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Render Bảng Ma Trận: Rows = Depot & Trạng Thái Đơn, Columns = Trạng Thái Liên Hệ
function renderContactStatusMatrixTable(records) {
  const thead = document.getElementById("theadContactMatrix");
  const tbody = document.getElementById("tbodyContactMatrix");
  const summaryEl = document.getElementById("contactMatrixSummaryText");
  if (!thead || !tbody) return;

  const rawList = records || [];
  // Lọc chỉ lấy đơn Chưa thanh toán và Đã hủy
  const list = rawList.filter(r => isUnpaidOrder(r) || isCancelledOrder(r));

  // 1. Thu thập danh sách Trạng Thái Liên Hệ (Columns)
  const contactMap = {};
  list.forEach(r => {
    const isUnpaid = isUnpaidOrder(r);
    const cskh = normalizeCskhStatus(r.trangThaiXuLy, isUnpaid) || "Chưa cập nhật";
    contactMap[cskh] = (contactMap[cskh] || 0) + 1;
  });

  const preferredOrder = [
    "Chưa cập nhật",
    "Đã liên hệ - Chờ",
    "Đã thanh toán",
    "Đã thành công",
    "Đã đặt lại",
    "Đã Liên hệ - Không đặt lại",
    "Đã liên hệ - Không thành công",
    "Không liên hệ được"
  ];
  const activeStatuses = Object.keys(contactMap);
  const allContactStatuses = [
    ...preferredOrder.filter(st => activeStatuses.includes(st)),
    ...activeStatuses.filter(st => !preferredOrder.includes(st))
  ];
  if (allContactStatuses.length === 0) {
    allContactStatuses.push("Chưa cập nhật");
  }

  // 2. Thu thập danh sách Depot
  const depotSet = new Set();
  rawList.forEach(r => {
    const d = normalizeStr(r.depot).toUpperCase();
    if (d) depotSet.add(d);
  });
  const sortedDepots = Array.from(depotSet).sort();

  // 3. Phân nhóm dữ liệu theo Depot -> Trạng Thái Đơn -> Trạng Thái Liên Hệ
  const matrixData = {};
  sortedDepots.forEach(d => {
    matrixData[d] = {
      unpaid: { total: 0, counts: {} },
      cancelled: { total: 0, counts: {} }
    };
  });

  list.forEach(r => {
    const d = normalizeStr(r.depot).toUpperCase() || "KHAC";
    if (!matrixData[d]) {
      matrixData[d] = {
        unpaid: { total: 0, counts: {} },
        cancelled: { total: 0, counts: {} }
      };
    }
    const isUnpaid = isUnpaidOrder(r);
    const type = isUnpaid ? "unpaid" : "cancelled";
    const cskh = normalizeCskhStatus(r.trangThaiXuLy, isUnpaid) || "Chưa cập nhật";
    matrixData[d][type].counts[cskh] = (matrixData[d][type].counts[cskh] || 0) + 1;
    matrixData[d][type].total += 1;
  });

  // 4. Render thead
  thead.innerHTML = `
    <tr>
      <th class="col-sticky-depot" style="text-align: left; padding-left: 14px;">Depot</th>
      <th class="col-sticky-status" style="text-align: left; padding-left: 10px;">Trạng Thái Đơn</th>
      ${allContactStatuses.map(st => `<th style="min-width: 110px; text-align: right;" title="${st}">${st}</th>`).join("")}
      <th class="matrix-col-total" style="min-width: 110px; text-align: right;">Grand Total</th>
    </tr>
  `;

  // 5. Render tbody
  let tbodyHtml = "";

  sortedDepots.forEach(depotKey => {
    const dData = matrixData[depotKey];

    const renderCells = (countsMap, orderTypeLabel) => {
      return allContactStatuses.map(st => {
        const cnt = countsMap[st] || 0;
        if (cnt === 0) return `<td class="matrix-val-empty" style="text-align: right;">-</td>`;
        let heatCls = "badge-heat-low";
        if (cnt >= 9) heatCls = "badge-heat-high";
        else if (cnt >= 4) heatCls = "badge-heat-med";

        return `
          <td class="matrix-cell-clickable" style="text-align: right;" onclick="onContactMatrixCellClick('${depotKey}', '${orderTypeLabel}', '${st}', this)" title="Bấm xem ${cnt} đơn ${orderTypeLabel} của Depot ${depotKey} (${st})">
            <span class="matrix-cell-badge ${heatCls}">
              ${cnt}
            </span>
          </td>
        `;
      }).join("");
    };

    const unpaidCells = renderCells(dData.unpaid.counts, "Chưa thanh toán");
    const cancelledCells = renderCells(dData.cancelled.counts, "Đã hủy");

    tbodyHtml += `
      <tr>
        <td class="col-sticky-depot" rowspan="2" style="border-bottom: 2px solid #cbd5e1; vertical-align: middle;">
          <strong style="color: #1e3a8a; font-size: 13.5px;">${depotKey}</strong>
        </td>
        <td class="col-sticky-status">
          <span class="badge badge-warning" style="font-size: 11px; padding: 2px 7px; font-weight: 600;">Chưa thanh toán</span>
        </td>
        ${unpaidCells}
        <td class="matrix-col-total matrix-cell-clickable" style="text-align: right;" onclick="onContactMatrixCellClick('${depotKey}', 'Chưa thanh toán', 'ALL', this)" title="Bấm xem toàn bộ ${dData.unpaid.total} đơn Chưa thanh toán của Depot ${depotKey}">
          <strong style="color: #d97706;">${dData.unpaid.total}</strong>
        </td>
      </tr>

      <tr class="matrix-depot-divider">
        <td class="col-sticky-status" style="border-bottom: 2px solid #cbd5e1;">
          <span class="badge badge-danger" style="font-size: 11px; padding: 2px 7px; font-weight: 600;">Đã hủy</span>
        </td>
        ${cancelledCells.replace(/<td /g, '<td style="border-bottom: 2px solid #cbd5e1;" ')}
        <td class="matrix-col-total matrix-cell-clickable" style="text-align: right; border-bottom: 2px solid #cbd5e1;" onclick="onContactMatrixCellClick('${depotKey}', 'Đã hủy', 'ALL', this)" title="Bấm xem toàn bộ ${dData.cancelled.total} đơn Đã hủy của Depot ${depotKey}">
          <strong style="color: #dc2626;">${dData.cancelled.total}</strong>
        </td>
      </tr>
    `;
  });

  // 6. Dòng Tổng Cộng (Grand Total Rows)
  const totalUnpaidByStatus = {};
  const totalCancelledByStatus = {};
  let totalUnpaidSum = 0;
  let totalCancelledSum = 0;

  allContactStatuses.forEach(st => {
    totalUnpaidByStatus[st] = sortedDepots.reduce((sum, d) => sum + (matrixData[d].unpaid.counts[st] || 0), 0);
    totalCancelledByStatus[st] = sortedDepots.reduce((sum, d) => sum + (matrixData[d].cancelled.counts[st] || 0), 0);
  });
  sortedDepots.forEach(d => {
    totalUnpaidSum += matrixData[d].unpaid.total;
    totalCancelledSum += matrixData[d].cancelled.total;
  });
  const grandTotalAll = totalUnpaidSum + totalCancelledSum;

  const unpaidTotalCells = allContactStatuses.map(st => {
    const cnt = totalUnpaidByStatus[st] || 0;
    return `
      <td class="matrix-cell-clickable" style="text-align: right;" onclick="onContactMatrixCellClick('ALL', 'Chưa thanh toán', '${st}', this)" title="Bấm xem toàn bộ ${cnt} đơn Chưa thanh toán trạng thái ${st}">
        <strong style="color: #d97706;">${cnt}</strong>
      </td>
    `;
  }).join("");

  const cancelledTotalCells = allContactStatuses.map(st => {
    const cnt = totalCancelledByStatus[st] || 0;
    return `
      <td class="matrix-cell-clickable" style="text-align: right;" onclick="onContactMatrixCellClick('ALL', 'Đã hủy', '${st}', this)" title="Bấm xem toàn bộ ${cnt} đơn Đã hủy trạng thái ${st}">
        <strong style="color: #dc2626;">${cnt}</strong>
      </td>
    `;
  }).join("");

  const grandTotalCells = allContactStatuses.map(st => {
    const cnt = (totalUnpaidByStatus[st] || 0) + (totalCancelledByStatus[st] || 0);
    return `
      <td class="matrix-cell-clickable" style="text-align: right;" onclick="onContactMatrixCellClick('ALL', 'ALL', '${st}', this)" title="Bấm xem toàn bộ ${cnt} đơn trạng thái liên hệ ${st}">
        <strong style="color: #0f172a; font-size: 13.5px;">${cnt}</strong>
      </td>
    `;
  }).join("");

  tbodyHtml += `
    <!-- Tổng Chưa thanh toán -->
    <tr class="matrix-contact-total-row">
      <td class="col-sticky-depot" rowspan="3" style="text-align: left; padding-left: 14px; font-size: 13.5px; font-weight: 800; color: #0f172a; vertical-align: middle; border-top: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8;">
        TỔNG CỘNG
      </td>
      <td class="col-sticky-status" style="border-top: 2px solid #94a3b8;">
        <strong style="color: #d97706;">Chưa thanh toán</strong>
      </td>
      ${unpaidTotalCells.replace(/<td /g, '<td style="border-top: 2px solid #94a3b8;" ')}
      <td class="matrix-col-total matrix-cell-clickable" style="text-align: right; border-top: 2px solid #94a3b8;" onclick="onContactMatrixCellClick('ALL', 'Chưa thanh toán', 'ALL', this)" title="Bấm xem toàn bộ ${totalUnpaidSum} đơn Chưa thanh toán">
        <strong style="color: #d97706; font-size: 13.5px;">${totalUnpaidSum}</strong>
      </td>
    </tr>

    <!-- Tổng Đã hủy -->
    <tr class="matrix-contact-total-row">
      <td class="col-sticky-status">
        <strong style="color: #dc2626;">Đã hủy</strong>
      </td>
      ${cancelledTotalCells}
      <td class="matrix-col-total matrix-cell-clickable" style="text-align: right;" onclick="onContactMatrixCellClick('ALL', 'Đã hủy', 'ALL', this)" title="Bấm xem toàn bộ ${totalCancelledSum} đơn Đã hủy">
        <strong style="color: #dc2626; font-size: 13.5px;">${totalCancelledSum}</strong>
      </td>
    </tr>

    <!-- Grand Total Tất cả -->
    <tr class="matrix-contact-grand-row">
      <td class="col-sticky-status" style="font-weight: 800; color: #1e3a8a; border-top: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8;">
        TẤT CẢ (GRAND TOTAL)
      </td>
      ${grandTotalCells.replace(/<td /g, '<td style="border-top: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8;" ')}
      <td class="cell-grand-total matrix-cell-clickable" style="text-align: right; color: #1d4ed8; font-size: 14px; border-top: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8;" onclick="onContactMatrixCellClick('ALL', 'ALL', 'ALL', this)" title="Bấm xem toàn bộ ${grandTotalAll} đơn">
        <strong>${grandTotalAll}</strong>
      </td>
    </tr>
  `;

  tbody.innerHTML = tbodyHtml;

  if (summaryEl) {
    summaryEl.textContent = `Tổng cộng: ${sortedDepots.length} Depot | ${totalUnpaidSum} đơn Chưa thanh toán | ${totalCancelledSum} đơn Đã hủy (${grandTotalAll} đơn theo bộ lọc)`;
  }
}

// Xử lý khi click vào ô bất kỳ trên Ma Trận Depot & Trạng Thái Đơn x Trạng Thái Liên Hệ
window.onContactMatrixCellClick = function(depot, orderStatus, contactStatus, elem) {
  // 1. Highlight ô đang chọn trên ma trận
  document.querySelectorAll(".matrix-cell-clickable").forEach(el => el.classList.remove("matrix-cell-selected"));
  if (elem) elem.classList.add("matrix-cell-selected");

  currentInlineLine = "ALL";
  currentInlineDepot = depot;

  // 2. Lọc danh sách đơn hàng
  const filtered = currentRecords.filter(r => {
    // Lọc theo trạng thái đơn
    if (orderStatus === "Chưa thanh toán") {
      if (!isUnpaidOrder(r)) return false;
    } else if (orderStatus === "Đã hủy") {
      if (!isCancelledOrder(r)) return false;
    } else {
      if (!isUnpaidOrder(r) && !isCancelledOrder(r)) return false;
    }

    // Lọc theo depot
    if (depot !== "ALL") {
      if (normalizeStr(r.depot).toUpperCase() !== depot) return false;
    }

    // Lọc theo trạng thái liên hệ
    if (contactStatus !== "ALL") {
      const isUnpaid = isUnpaidOrder(r);
      const cskh = normalizeCskhStatus(r.trangThaiXuLy, isUnpaid) || "Chưa cập nhật";
      if (cskh !== contactStatus) return false;
    }

    return true;
  });

  // 3. Render bảng chi tiết ngay bên dưới ma trận
  const depotText = depot === "ALL" ? "Tất cả Depot" : `Depot ${depot}`;
  const statusText = orderStatus === "ALL" ? "Chưa thanh toán & Đã hủy" : orderStatus;
  const contactText = contactStatus === "ALL" ? "Tất cả trạng thái liên hệ" : contactStatus;

  const customTitle = `Bảng Thống Kê Chi Tiết: ${depotText} • ${statusText} • ${contactText}`;
  const customSubtitle = `Đang xem <strong>${filtered.length}</strong> đơn hàng theo giao điểm Ma trận Depot & Trạng thái đơn × Trạng thái liên hệ. Bấm nút "Hiện Tất Cả Đơn" để hủy lọc.`;

  renderInlineDetailTable(filtered, "ALL", depot, customTitle, customSubtitle);

  // 4. Cuộn mượt mà xuống bảng chi tiết
  const section = document.getElementById("matrixDetailSection");
  const card = document.getElementById("matrixDetailCard");
  if (card) {
    card.classList.add("highlight-pulse");
    setTimeout(() => card.classList.remove("highlight-pulse"), 1000);
  }
  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
};

// =====================================================
// BẢNG THỐNG KÊ CHI TIẾT ĐƠN HÀNG (TRỰC TIẾP TRÊN TRANG KHI BẤM MA TRẬN)
// =====================================================

let currentInlineRecords = [];
let currentInlineFiltered = [];
let currentInlineLine = "ALL";
let currentInlineDepot = "ALL";

// Xử lý khi click vào ô bất kỳ trên Ma Trận
window.onMatrixCellClick = function(line, depot, elem, status = "ALL") {
  // 1. Highlight ô đang chọn trên ma trận
  document.querySelectorAll(".matrix-cell-clickable").forEach(el => el.classList.remove("matrix-cell-selected"));
  if (elem) elem.classList.add("matrix-cell-selected");

  currentInlineLine = line;
  currentInlineDepot = depot;

  // 2. Lọc danh sách đơn hàng
  const filtered = currentRecords.filter(r => {
    if (status && status !== "ALL") {
      if ((normalizeStr(r.trangThaiDonHang) || "Chưa xác định") !== status) return false;
    }
    if (line !== "ALL") {
      if (normalizeStr(r.hangTau).toUpperCase() !== line) return false;
    }
    if (depot !== "ALL") {
      if (normalizeStr(r.depot).toUpperCase() !== depot) return false;
    }
    return true;
  });

  // 3. Render bảng chi tiết ngay bên dưới ma trận
  renderInlineDetailTable(filtered, line, depot);

  // 4. Cuộn mượt mà xuống bảng chi tiết
  const section = document.getElementById("matrixDetailSection");
  const card = document.getElementById("matrixDetailCard");
  if (card) {
    card.classList.add("highlight-pulse");
    setTimeout(() => card.classList.remove("highlight-pulse"), 1000);
  }
  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
};

// Khởi tạo các sự kiện cho bảng chi tiết inline
function initInlineDetailControls() {
  const searchInput = document.getElementById("inlineDetailSearch");
  const btnReset = document.getElementById("btnResetInlineFilter");
  const btnExportCsv = document.getElementById("btnExportInlineCsv");

  if (searchInput) {
    searchInput.value = "";
    searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        currentInlineFiltered = [...currentInlineRecords];
      } else {
        currentInlineFiltered = currentInlineRecords.filter(r => {
          return (
            (r.soContainer && r.soContainer.toLowerCase().includes(q)) ||
            (r.soBooking && r.soBooking.toLowerCase().includes(q)) ||
            (r.depot && r.depot.toLowerCase().includes(q)) ||
            (r.hangTau && r.hangTau.toLowerCase().includes(q)) ||
            (r.lyDoHuy && r.lyDoHuy.toLowerCase().includes(q)) ||
            (r.lyDoTuChoi && r.lyDoTuChoi.toLowerCase().includes(q)) ||
            (r.tenTaiXe && r.tenTaiXe.toLowerCase().includes(q)) ||
            (r.tenNhaXe && r.tenNhaXe.toLowerCase().includes(q)) ||
            (r.trangThaiXuLy && r.trangThaiXuLy.toLowerCase().includes(q))
          );
        });
      }
      populateInlineDetailRows(currentInlineFiltered);
    };
  }

  if (btnReset) {
    btnReset.onclick = () => {
      document.querySelectorAll(".matrix-cell-clickable").forEach(el => el.classList.remove("matrix-cell-selected"));
      currentInlineLine = "ALL";
      currentInlineDepot = "ALL";
      
      let base = currentRecords;
      if (currentMatrixStatus !== "ALL") {
        base = currentRecords.filter(r => normalizeStr(r.trangThaiDonHang) === currentMatrixStatus);
      }
      renderInlineDetailTable(base, "ALL", "ALL");
    };
  }

  if (btnExportCsv) {
    btnExportCsv.onclick = () => {
      if (!currentInlineRecords || currentInlineRecords.length === 0) return;
      const headers = ["STT", "Depot", "Hang Tau", "So Booking", "So Container", "Chieu", "Trang Thai", "Ngay Duyet", "Ly Do Huy", "Xu Ly CSKH"];
      const rows = currentInlineRecords.map((r, i) => [
        i + 1,
        `"${r.depot || ""}"`,
        `"${r.hangTau || ""}"`,
        `"${r.soBooking || ""}"`,
        `"${r.soContainer || ""}"`,
        `"${r.loaiDonHang || ""}"`,
        `"${r.trangThaiDonHang || ""}"`,
        `"${r.ngayDuocDuyet || r.ngayHuyDon || ""}"`,
        `"${(r.lyDoHuy || "").replace(/"/g, '""')}"`,
        `"${(r.trangThaiXuLy || "").replace(/"/g, '""')}"`
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chi_tiet_don_${currentInlineLine}_${currentInlineDepot}_${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  const btnExportPng = document.getElementById("btnExportInlinePng");
  if (btnExportPng) {
    btnExportPng.onclick = () => {
      const card = document.getElementById("matrixDetailCard");
      const dateStr = new Date().toISOString().substring(0, 10);
      const lineStr = currentInlineLine && currentInlineLine !== "ALL" ? `_${currentInlineLine}` : "";
      const depotStr = currentInlineDepot && currentInlineDepot !== "ALL" ? `_${currentInlineDepot}` : "";
      exportElementToPng(card, `bang_thong_ke_chi_tiet_don${lineStr}${depotStr}_${dateStr}.png`, btnExportPng);
    };
  }
}

// Cập nhật tiêu đề và nạp dữ liệu cho Bảng Thống Kê Chi Tiết
function renderInlineDetailTable(records, line = "ALL", depot = "ALL", customTitle = null, customSubtitle = null) {
  currentInlineRecords = [...records];
  currentInlineFiltered = [...records];

  const titleEl = document.getElementById("inlineDetailTitle");
  const subtitleEl = document.getElementById("inlineDetailSubtitle");
  const countBadgeEl = document.getElementById("inlineDetailCountBadge");
  const btnReset = document.getElementById("btnResetInlineFilter");
  const btnOpenFull = document.getElementById("btnOpenFullDataTable");
  const searchInput = document.getElementById("inlineDetailSearch");

  if (searchInput) searchInput.value = "";

  // Cập nhật tiêu đề & mô tả
  let titleStr = "";
  if (customTitle) {
    titleStr = customTitle;
  } else if (line !== "ALL" && depot !== "ALL") {
    titleStr = `Bảng Thống Kê Chi Tiết: Hãng ${line} × Depot ${depot}`;
  } else if (line !== "ALL") {
    titleStr = `Bảng Thống Kê Chi Tiết: Hãng Tàu ${line} (Tất cả Depot)`;
  } else if (depot !== "ALL") {
    titleStr = `Bảng Thống Kê Chi Tiết: Depot ${depot} (Tất cả Hãng Tàu)`;
  } else {
    titleStr = `Bảng Thống Kê Chi Tiết Toàn Bộ Đơn Hàng`;
  }

  const statusDesc = currentMatrixStatus === "ALL" ? "Tất cả trạng thái" : currentMatrixStatus;
  const isFiltered = (line !== "ALL" || depot !== "ALL" || currentMatrixStatus !== "ALL" || Boolean(customTitle));

  if (titleEl) titleEl.textContent = titleStr;
  if (subtitleEl) {
    if (customSubtitle) {
      subtitleEl.innerHTML = customSubtitle;
    } else {
      subtitleEl.innerHTML = `Trạng thái: <strong>${statusDesc}</strong> • Đang xem <strong>${records.length}</strong> đơn hàng. ${isFiltered ? 'Nhấp vào nút "Hiện Tất Cả Đơn" để hủy lọc.' : 'Bấm vào bất kỳ ô số lượng nào trên Ma Trận để xem chi tiết.'}`;
    }
  }

  if (countBadgeEl) {
    countBadgeEl.textContent = `Hiển thị: ${records.length} / ${currentRecords.length} đơn`;
  }

  if (btnReset) {
    btnReset.style.display = isFiltered ? "inline-flex" : "none";
  }

  if (btnOpenFull) {
    const params = [];
    if (line !== "ALL") params.push(`line=${encodeURIComponent(line)}`);
    if (depot !== "ALL") params.push(`depot=${encodeURIComponent(depot)}`);
    if (currentMatrixStatus !== "ALL") params.push(`status=${encodeURIComponent(currentMatrixStatus)}`);
    btnOpenFull.href = `data-table.html${params.length > 0 ? '?' + params.join('&') : ''}`;
  }

  populateInlineDetailRows(currentInlineFiltered);
}

// Điền các dòng vào tbody của bảng chi tiết inline
function populateInlineDetailRows(records) {
  const tbody = document.getElementById("tbodyInlineDetail");
  const countBadgeEl = document.getElementById("inlineDetailCountBadge");
  if (!tbody) return;

  if (countBadgeEl) {
    countBadgeEl.textContent = `Hiển thị: ${records.length} / ${currentInlineRecords.length} đơn`;
  }

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4" style="color: var(--text-muted); font-size: 14px;">Không tìm thấy đơn hàng nào phù hợp với điều kiện hoặc từ khóa tìm kiếm.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map((r, idx) => {
    // Badges cho chiều cont (IN/OUT)
    const dir = normalizeStr(r.loaiDonHang).toUpperCase();
    const dirBadge = dir === "OUT" 
      ? `<span class="badge badge-info" style="font-size: 11px;">OUT</span>` 
      : dir === "IN" 
      ? `<span class="badge badge-success" style="font-size: 11px;">IN</span>` 
      : `<span style="color: var(--text-muted);">-</span>`;

    // Badges cho trạng thái đơn
    const status = normalizeStr(r.trangThaiDonHang);
    let statusCls = "badge-info";
    if (status.includes("Thanh toán thành công") || status.toLowerCase().includes("thanh toan thanh cong")) statusCls = "badge-success";
    else if (status.includes("Chưa thanh toán")) statusCls = "badge-unpaid";
    else if (status.includes("Đã hủy")) statusCls = "badge-danger";
    else if (status.includes("hoàn tiền")) statusCls = "badge-warning";
    else if (status.includes("Từ chối")) statusCls = "badge-purple";

    const reasonText = r.lyDoHuy || r.lyDoTuChoi || "-";
    const shortReason = reasonText.length > 40 ? reasonText.substring(0, 40) + "..." : reasonText;

    const contactStatus = r.trangThaiXuLy 
      ? `<span class="badge badge-success" style="font-size: 11px;">${r.trangThaiXuLy}</span>` 
      : `<span style="color: var(--text-muted); font-size: 12px;">Chưa xử lý</span>`;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong style="color: var(--blue-primary);">${r.depot || "-"}</strong></td>
        <td><strong>${r.hangTau || "-"}</strong></td>
        <td><code>${r.soBooking || "-"}</code></td>
        <td><strong>${r.soContainer || "-"}</strong></td>
        <td>${dirBadge}</td>
        <td><span class="badge ${statusCls}">${status}</span></td>
        <td><span style="font-size: 12px; color: #475569;">${formatDateDisplay(r.ngayDuocDuyet || r.ngayHuyDon)}</span></td>
        <td title="${reasonText.replace(/"/g, '&quot;')}">${shortReason}</td>
        <td>${contactStatus}</td>
      </tr>
    `;
  }).join("");

  // Kích hoạt cố định các cột theo số lượng đã chọn
  requestAnimationFrame(() => {
    applyFrozenColumnsToDetailTable(currentFrozenDetailCount);
  });
}

// =====================================================
// MODAL CHI TIẾT DANH SÁCH ĐƠN HÀNG KHI CLICK VÀO Ô MA TRẬN
// =====================================================

let modalActiveRecords = [];
let modalFilteredRecords = [];

window.openMatrixDetailModal = function(line, depot) {
  const modal = document.getElementById("matrixDetailModal");
  const modalTitle = document.getElementById("modalMatrixTitle");
  const modalSubtitle = document.getElementById("modalMatrixSubtitle");
  const btnOpenDataTable = document.getElementById("btnModalOpenDataTable");
  const searchInput = document.getElementById("modalMatrixSearch");
  if (!modal) return;

  // Lọc tập dữ liệu theo Line, Depot và currentMatrixStatus
  modalActiveRecords = currentRecords.filter(r => {
    if (currentMatrixStatus !== "ALL") {
      if (normalizeStr(r.trangThaiDonHang) !== currentMatrixStatus) return false;
    }
    if (line !== "ALL") {
      if (normalizeStr(r.hangTau).toUpperCase() !== line) return false;
    }
    if (depot !== "ALL") {
      if (normalizeStr(r.depot).toUpperCase() !== depot) return false;
    }
    return true;
  });

  modalFilteredRecords = [...modalActiveRecords];

  // Thiết lập tiêu đề và mô tả trực quan
  let titleStr = "";
  if (line !== "ALL" && depot !== "ALL") {
    titleStr = `Chi Tiết Đơn Hàng: Hãng ${line} × Depot ${depot}`;
  } else if (line !== "ALL") {
    titleStr = `Chi Tiết Đơn Hàng: Hãng Tàu ${line} (Tất cả Depot)`;
  } else if (depot !== "ALL") {
    titleStr = `Chi Tiết Đơn Hàng: Depot ${depot} (Tất cả Hãng Tàu)`;
  } else {
    titleStr = `Toàn Bộ Đơn Hàng Đang Lọc`;
  }

  const statusDesc = currentMatrixStatus === "ALL" ? "Tất cả trạng thái" : currentMatrixStatus;
  const subtitleStr = `Trạng thái: <strong>${statusDesc}</strong> • Tổng số: <strong>${modalActiveRecords.length}</strong> đơn hàng`;

  if (modalTitle) modalTitle.textContent = titleStr;
  if (modalSubtitle) modalSubtitle.innerHTML = subtitleStr;

  // Cập nhật link sang trang chi tiết data-table.html
  if (btnOpenDataTable) {
    const params = [];
    if (line !== "ALL") params.push(`line=${encodeURIComponent(line)}`);
    if (depot !== "ALL") params.push(`depot=${encodeURIComponent(depot)}`);
    if (currentMatrixStatus !== "ALL") params.push(`status=${encodeURIComponent(currentMatrixStatus)}`);
    btnOpenDataTable.href = `data-table.html${params.length > 0 ? '?' + params.join('&') : ''}`;
  }

  // Xóa ô tìm kiếm cũ
  if (searchInput) searchInput.value = "";

  // Render bảng danh sách đơn trong modal
  renderModalTable(modalFilteredRecords);

  // Mở modal và khóa cuộn body
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

// Render danh sách đơn trong bảng modal
function renderModalTable(records) {
  const tbody = document.getElementById("tbodyModalMatrix");
  const countEl = document.getElementById("modalMatrixFooterCount");
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `Hiển thị ${records.length} / ${modalActiveRecords.length} đơn hàng`;
  }

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4" style="color: var(--text-muted);">Không tìm thấy đơn hàng nào phù hợp với từ khóa tìm kiếm.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map((r, idx) => {
    // Badges cho chiều cont (IN/OUT)
    const dir = normalizeStr(r.loaiDonHang).toUpperCase();
    const dirBadge = dir === "OUT" 
      ? `<span class="badge badge-info" style="font-size: 11px;">OUT</span>` 
      : dir === "IN" 
      ? `<span class="badge badge-success" style="font-size: 11px;">IN</span>` 
      : `<span style="color: var(--text-muted);">-</span>`;

    // Badges cho trạng thái đơn
    const status = normalizeStr(r.trangThaiDonHang);
    let statusCls = "badge-info";
    if (status.includes("Chưa thanh toán")) statusCls = "badge-unpaid";
    else if (status.includes("Đã hủy")) statusCls = "badge-danger";
    else if (status.includes("hoàn tiền")) statusCls = "badge-warning";
    else if (status.includes("Từ chối")) statusCls = "badge-purple";

    const reasonText = r.lyDoHuy || r.lyDoTuChoi || "-";
    const shortReason = reasonText.length > 40 ? reasonText.substring(0, 40) + "..." : reasonText;

    const contactStatus = r.trangThaiXuLy 
      ? `<span class="badge badge-success" style="font-size: 11px;">${r.trangThaiXuLy}</span>` 
      : `<span style="color: var(--text-muted); font-size: 12px;">Chưa xử lý</span>`;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong style="color: var(--blue-primary);">${r.depot || "-"}</strong></td>
        <td><strong>${r.hangTau || "-"}</strong></td>
        <td><code>${r.soBooking || "-"}</code></td>
        <td><strong>${r.soContainer || "-"}</strong></td>
        <td>${dirBadge}</td>
        <td><span class="badge ${statusCls}">${status}</span></td>
        <td><span style="font-size: 12px; color: #475569;">${formatDateDisplay(r.ngayDuocDuyet || r.ngayHuyDon)}</span></td>
        <td title="${reasonText.replace(/"/g, '&quot;')}">${shortReason}</td>
        <td>${contactStatus}</td>
      </tr>
    `;
  }).join("");
}

// Đóng modal chi tiết
function closeModalMatrix() {
  const modal = document.getElementById("matrixDetailModal");
  if (modal) {
    modal.hidden = true;
    document.body.style.overflow = "";
  }
}

// Khởi tạo các sự kiện cho modal
function initModalEvents() {
  const modal = document.getElementById("matrixDetailModal");
  const closeBtn = document.getElementById("modalMatrixCloseBtn");
  const closeFooterBtn = document.getElementById("btnModalCloseFooter");
  const searchInput = document.getElementById("modalMatrixSearch");
  const exportCsvBtn = document.getElementById("btnModalExportCsv");

  if (closeBtn) closeBtn.onclick = closeModalMatrix;
  if (closeFooterBtn) closeFooterBtn.onclick = closeModalMatrix;

  // Đóng khi click ngoài backdrop
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeModalMatrix();
    };
  }

  // Đóng khi ấn Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) {
      closeModalMatrix();
    }
  });

  // Tìm kiếm realtime trong modal
  if (searchInput) {
    searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        modalFilteredRecords = [...modalActiveRecords];
      } else {
        modalFilteredRecords = modalActiveRecords.filter(r => {
          return (
            (r.soContainer && r.soContainer.toLowerCase().includes(q)) ||
            (r.soBooking && r.soBooking.toLowerCase().includes(q)) ||
            (r.depot && r.depot.toLowerCase().includes(q)) ||
            (r.hangTau && r.hangTau.toLowerCase().includes(q)) ||
            (r.lyDoHuy && r.lyDoHuy.toLowerCase().includes(q)) ||
            (r.lyDoTuChoi && r.lyDoTuChoi.toLowerCase().includes(q)) ||
            (r.tenTaiXe && r.tenTaiXe.toLowerCase().includes(q)) ||
            (r.tenNhaXe && r.tenNhaXe.toLowerCase().includes(q)) ||
            (r.trangThaiXuLy && r.trangThaiXuLy.toLowerCase().includes(q))
          );
        });
      }
      renderModalTable(modalFilteredRecords);
    };
  }

  // Xuất CSV danh sách đơn trong modal
  if (exportCsvBtn) {
    exportCsvBtn.onclick = () => {
      if (!modalActiveRecords || modalActiveRecords.length === 0) return;
      const headers = ["STT", "Depot", "Hang Tau", "So Booking", "So Container", "Chieu", "Trang Thai", "Ngay Duyet", "Ly Do Huy", "Xu Ly CSKH"];
      const rows = modalActiveRecords.map((r, i) => [
        i + 1,
        `"${r.depot || ""}"`,
        `"${r.hangTau || ""}"`,
        `"${r.soBooking || ""}"`,
        `"${r.soContainer || ""}"`,
        `"${r.loaiDonHang || ""}"`,
        `"${r.trangThaiDonHang || ""}"`,
        `"${r.ngayDuocDuyet || r.ngayHuyDon || ""}"`,
        `"${(r.lyDoHuy || "").replace(/"/g, '""')}"`,
        `"${(r.trangThaiXuLy || "").replace(/"/g, '""')}"`
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chi_tiet_don_ma_tran_${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  // In / Xuất PNG danh sách đơn trong modal
  const exportPngBtn = document.getElementById("btnModalExportPng");
  if (exportPngBtn) {
    exportPngBtn.onclick = () => {
      const modalContent = document.querySelector("#matrixDetailModal .modal-content");
      const dateStr = new Date().toISOString().substring(0, 10);
      exportElementToPng(modalContent, `chi_tiet_don_ma_tran_${dateStr}.png`, exportPngBtn);
    };
  }
}


