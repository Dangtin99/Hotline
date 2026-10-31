// data-table.js - Xử lý hiển thị toàn bộ bảng dữ liệu từ file Excel

let allRecords = [];
let filteredRecords = [];

// DOM Elements
const currentDatasetName = document.getElementById("currentDatasetName");
const totalRowsBadge = document.getElementById("totalRowsBadge");
const tbodyFullData = document.getElementById("tbodyFullData");
const searchInput = document.getElementById("searchInput");
const depotDropdownBtn = document.getElementById("depotDropdownBtn");
const depotDropdownPanel = document.getElementById("depotDropdownPanel");
const depotSelectedLabel = document.getElementById("depotSelectedLabel");
const depotSelectAll = document.getElementById("depotSelectAll");
const depotOptionsList = document.getElementById("depotOptionsList");
const SYSTEM_DEPOTS_FALLBACK = ["AIC", "BSD", "CPD", "EAD", "EPD", "ETD", "GKP", "PMCM", "RCS", "SCD", "SLD", "TES", "THT"];
if (!window.SYSTEM_DEPOTS_LIST) {
  window.SYSTEM_DEPOTS_LIST = SYSTEM_DEPOTS_FALLBACK;
}
let allDepotValues = [];
let selectedDepots = []; // Danh sách các depot đang được chọn

const filterLine = document.getElementById("filterLine");
const filterDirection = document.getElementById("filterDirection");

// Bộ lọc Trạng Thái Đa Chọn (Multi-select)
const statusDropdownBtn = document.getElementById("statusDropdownBtn");
const statusDropdownPanel = document.getElementById("statusDropdownPanel");
const statusSelectedLabel = document.getElementById("statusSelectedLabel");
const statusSelectAll = document.getElementById("statusSelectAll");
const statusOptionsList = document.getElementById("statusOptionsList");
let allStatusValues = [];
let selectedStatuses = []; // Danh sách các trạng thái đang được chọn
const filterApprovedHour = document.getElementById("filterApprovedHour");
const filterWarning3h = document.getElementById("filterWarning3h");
const filterContactStatus = document.getElementById("filterContactStatus");
const filterDateType = document.getElementById("filterDateType");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const filterHourFrom = document.getElementById("filterHourFrom");
const filterHourTo = document.getElementById("filterHourTo");
const btnClearDateFilter = document.getElementById("btnClearDateFilter");
const tableDateFilterGroup = document.getElementById("tableDateFilterGroup");
const btnResetFilter = document.getElementById("btnResetFilter");
const btnReloadData = document.getElementById("btnReloadData");
const btnExportCsv = document.getElementById("btnExportCsv");
const btnExportExcel = document.getElementById("btnExportExcel");
const btnSyncTurso = document.getElementById("btnSyncTurso") || document.getElementById("btnSyncSupabase");
const tursoStatusBadge = document.getElementById("tursoStatusBadge") || document.getElementById("supabaseStatusBadge");
const alertBox = document.getElementById("alertBox");
const selectFreezeCols = document.getElementById("selectFreezeCols");

// Elements Tab & Sidebar Nav
const tabAllOrders = document.getElementById("tabAllOrders");
const tabUnpaidOrders = document.getElementById("tabUnpaidOrders");
const tabCancelledOrders = document.getElementById("tabCancelledOrders");
const tabPendingOrders = document.getElementById("tabPendingOrders");
const tabCountAll = document.getElementById("tabCountAll");
const tabCountUnpaid = document.getElementById("tabCountUnpaid");
const tabCountCancelled = document.getElementById("tabCountCancelled");
const tabCountPending = document.getElementById("tabCountPending");
const navDataTable = document.getElementById("navDataTable");
const navUnpaid = document.getElementById("navUnpaid");
const navCancelled = document.getElementById("navCancelled");
const vnClockWidget = document.getElementById("vnClockWidget");
const vnClockDisplay = document.getElementById("vnClockDisplay");
let vnClockInterval = null;
const btnUpdateData = document.getElementById("btnUpdateData");
const btnDeduplicateData = document.getElementById("btnDeduplicateData");
const btnAddManualRow = document.getElementById("btnAddManualRow");
const thColPending = document.getElementById("thColPending");
const thColPendingRemove = document.getElementById("thColPendingRemove");

// Hàm ẩn/hiện cột header Chuyển Chờ (tab Đơn Hủy) và cột Xóa (tab Chờ Xử Lý)
function updatePendingColumnHeader() {
  if (thColPending) {
    thColPending.style.display = currentTab === "cancelled" ? "" : "none";
  }
  if (thColPendingRemove) {
    thColPendingRemove.style.display = currentTab === "pending" ? "" : "none";
  }
}

// Trạng thái tab hiện tại: 'all', 'unpaid', 'cancelled', 'pending'
let currentTab = "all";

// Danh sách đơn đã chuyển sang tab Chờ Xử Lý (lưu theo session, dùng sessionStorage)
let pendingRows = JSON.parse(sessionStorage.getItem("gpg_pending_rows") || "[]");

// Trạng thái số lượng cột cố định (Mặc định: 3 cột)
let currentFrozenCount = parseInt(localStorage.getItem("gpg_frozen_cols") ?? "3", 10);
let currentDatasetId = "default";

// Quản trị Phân Trang Máy Chủ & Giao Diện (Mặc định và tối đa 200 dòng/trang)
let currentPage = 1;
let pageSize = 200;

const paginationBar = document.getElementById("paginationBar");
const pageFromRow = document.getElementById("pageFromRow");
const pageToRow = document.getElementById("pageToRow");
const pageTotalRecords = document.getElementById("pageTotalRecords");
const pageTotalPages = document.getElementById("pageTotalPages");
const selectPageSize = document.getElementById("selectPageSize");
const btnFirstPage = document.getElementById("btnFirstPage");
const btnPrevPage = document.getElementById("btnPrevPage");
const btnNextPage = document.getElementById("btnNextPage");
const btnLastPage = document.getElementById("btnLastPage");
const inputPageDirect = document.getElementById("inputPageDirect");

// Bảng cấu hình và thứ tự sắp xếp chuẩn cho trạng thái CSKH
// Danh mục chuẩn: Đã liên hệ - Chờ, Đã thanh toán, Đã thành công, Đã đặt lại, Đã liên hệ - Không thành công, Đã liên hệ - Không đặt lại, Không liên hệ được
const CSKH_STATUS_CONFIG = [
  { order: 1, val: "Đã liên hệ - Chờ", label: "Đã liên hệ - Chờ", bg: "#dbeafe", color: "#1e40af" },
  { order: 2, val: "Đã thanh toán", label: "Đã thanh toán", bg: "#dcfce7", color: "#166534" },
  { order: 3, val: "Đã thành công", label: "Đã thành công", bg: "#dcfce7", color: "#166534" },
  { order: 4, val: "Đã đặt lại", label: "Đã đặt lại", bg: "#e0f2fe", color: "#0369a1" },
  { order: 5, val: "Đã liên hệ - Không thành công", label: "Đã liên hệ - Không thành công", bg: "#ffedd5", color: "#c2410c" },
  { order: 6, val: "Đã liên hệ - Không đặt lại", label: "Đã liên hệ - Không đặt lại", bg: "#fee2e2", color: "#991b1b" },
  { order: 7, val: "Không liên hệ được", label: "Không liên hệ được", bg: "#fef3c7", color: "#92400e" }
].sort((a, b) => a.order - b.order);

// Hàm chuẩn hóa giá trị trạng thái CSKH cũ sang danh mục trạng thái mới
function normalizeCskhStatus(rawStatus, isUnpaid = false) {
  if (rawStatus === null || rawStatus === undefined) return "";
  let st = String(rawStatus).trim();
  if (!st || st === "null" || st === "undefined") return "";

  if (st === "Đã liên hệ - Chờ đặt lại" || st === "Đã liên hệ - Chờ thanh toán" || st === "Đã liên hệ - Đang chờ" || st === "Đã liên hệ - Chờ" || st === "Đã liên hệ chờ") {
    return "Đã liên hệ - Chờ";
  }
  if (st === "Không liên hệ được - Chờ thanh toán" || st === "Không liên hệ được - Hủy" || st === "Không liên hệ được - hủy" || st === "Không liên hệ được") {
    return "Không liên hệ được";
  }
  if (st === "Đã liên hệ - Đã đặt lại" || st === "Đặt lại thành công" || st === "Tự động đặt lại" || st === "Đã liên hệ đã đặt lại" || st === "Đã đặt lại") {
    return "Đã đặt lại";
  }
  if (st === "Đã liên hệ - Không đặt lại" || st === "Đã Liên hệ - Không đặt lại" || st === "Đã Liện hệ - Không đặt lại") {
    return "Đã liên hệ - Không đặt lại";
  }
  if (st === "Thanh toán thành công" || st === "Đã thanh toán" || st === "Đã thành công") {
    return isUnpaid ? "Đã thanh toán" : "Đã thành công";
  }
  if (st === "Đã liên hệ - Không thành công") {
    return "Đã liên hệ - Không thành công";
  }
  return st;
}

// Hàm tra cứu thứ tự sắp xếp của trạng thái CSKH trong mã nguồn
function getCskhStatusOrder(statusVal) {
  if (statusVal === null || statusVal === undefined) return 999;
  if (typeof statusVal === "number") return statusVal;
  const str = String(statusVal).trim();
  if (!str) return 999;
  if (["1", "2", "3", "4", "5", "6", "7"].includes(str)) {
    return parseInt(str, 10);
  }
  const item = CSKH_STATUS_CONFIG.find(s => s.val === str);
  if (item) return item.order;
  if (str === "Đã liên hệ - Đang chờ" || str === "Đã liên hệ - Chờ đặt lại" || str === "Đã liên hệ - Chờ thanh toán" || str === "Đã liên hệ - Chờ") return 1;
  if (str === "Thanh toán thành công" || str === "Đã thanh toán") return 2;
  if (str === "Đã thành công") return 3;
  if (str === "Đã liên hệ - Đã đặt lại" || str === "Đặt lại thành công" || str === "Tự động đặt lại" || str === "Đã liên hệ đã đặt lại" || str === "Đã đặt lại") return 4;
  if (str === "Đã liên hệ - Không thành công") return 5;
  if (str === "Đã liên hệ - Không đặt lại" || str === "Đã Liên hệ - Không đặt lại" || str === "Đã Liện hệ - Không đặt lại") return 6;
  if (str === "Không liên hệ được - Chờ thanh toán" || str === "Không liên hệ được - Hủy" || str === "Không liên hệ được - hủy" || str === "Không liên hệ được") return 7;
  return 999;
}

// Kiểm tra trạng thái CSKH có hợp lệ để tự động cập nhật ĐÃ XỬ LÝ cho hạn hủy 3h hay không
function isProcessed3hStatus(trangThaiXuLy) {
  if (!trangThaiXuLy) return false;
  const s = String(trangThaiXuLy).trim();
  if (!s || s === "null" || s === "undefined") return false;
  return true;
}

// Lấy danh mục trạng thái CSKH phân loại theo từng tab:
// - Tab Đơn chưa thanh toán: Đã liên hệ - Chờ, Đã thanh toán, Đã liên hệ - Không thành công, Không liên hệ được
// - Tab Đơn hàng hủy: Đã liên hệ - Chờ, Đã đặt lại, Không liên hệ được, Đã liên hệ - Không đặt lại
// - Tab Tất cả / Chờ xử lý: Hiển thị đầy đủ tất cả các trạng thái
function getTabCskhStatusOptions(tabName) {
  if (tabName === "unpaid") {
    return CSKH_STATUS_CONFIG.filter(opt =>
      ["Đã liên hệ - Chờ", "Đã thanh toán", "Đã liên hệ - Không thành công", "Không liên hệ được"].includes(opt.val)
    );
  }
  if (tabName === "cancelled") {
    return CSKH_STATUS_CONFIG.filter(opt =>
      ["Đã liên hệ - Chờ", "Đã đặt lại", "Không liên hệ được", "Đã liên hệ - Không đặt lại"].includes(opt.val)
    );
  }
  return CSKH_STATUS_CONFIG;
}

// Cập nhật các tùy chọn của bộ lọc Trạng Thái CSKH theo tab tương ứng
function updateFilterContactStatusDropdown(tabName) {
  if (!filterContactStatus) return;
  const currentVal = filterContactStatus.value;
  const options = getTabCskhStatusOptions(tabName);

  filterContactStatus.innerHTML = `
    <option value="" data-order="0">Trạng thái CSKH</option>
    ${options.map(opt => `
      <option value="${opt.val}" data-order="${opt.order}">${opt.label}</option>
    `).join("")}
    <option value="__EMPTY__" data-order="99">Chưa cập nhật trạng thái</option>
  `;

  if (currentVal && (options.some(opt => opt.val === currentVal) || currentVal === "__EMPTY__")) {
    filterContactStatus.value = currentVal;
  } else {
    filterContactStatus.value = "";
  }
}

function normalizeStr(s) {
  if (s === null || s === undefined) return "";
  return String(s).normalize("NFC").trim();
}

function isUnpaidStatus(val) {
  if (!val) return false;
  const s = String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
  return s.includes("chua thanh toan");
}

// Kiểm tra xem đơn hàng có trạng thái Chưa thanh toán hay không
function isUnpaidOrder(r) {
  if (!r || !r.trangThaiDonHang) return false;
  return isUnpaidStatus(r.trangThaiDonHang);
}

function isCancelledStatus(val) {
  if (!val) return false;
  const raw = String(val).trim().toLowerCase();
  if (raw === "đã hủy" || raw === "đã huỷ" || raw === "hủy" || raw === "huỷ") return true;
  const s = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
  return s === "da huy" || s === "huy" || s.includes("da huy") || s.includes("huy");
}

// Kiểm tra xem đơn hàng có trạng thái Đã Hủy hay không
function isCancelledOrder(r) {
  if (!r || !r.trangThaiDonHang) return false;
  return isCancelledStatus(r.trangThaiDonHang);
}

// Cập nhật nhãn hiển thị trên nút chọn Depot
function updateDepotButtonLabel() {
  if (!depotSelectedLabel || !depotDropdownBtn) return;
  const count = selectedDepots.length;
  const total = allDepotValues.length;

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
    depotSelectedLabel.textContent = `Depot: ${selectedDepots[0]}`;
    depotDropdownBtn.classList.add("has-selection");
  } else {
    depotSelectedLabel.textContent = `Depot (${count})`;
    depotDropdownBtn.classList.add("has-selection");
  }

  // Cập nhật trạng thái checkbox "Tất cả Depot"
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

// Khởi tạo danh sách checkbox đa chọn Depot
function initDepotMultiSelect(depots) {
  allDepotValues = [...depots];
  selectedDepots = [...depots]; // Mặc định chọn tất cả
  if (!depotOptionsList) return;

  depotOptionsList.innerHTML = allDepotValues.map(d => `
    <label class="multiselect-item">
      <input type="checkbox" class="depot-cb" value="${d}" checked>
      <span>Depot ${d}</span>
    </label>
  `).join("");

  // Lắng nghe sự kiện tick từng checkbox
  const checkboxes = depotOptionsList.querySelectorAll(".depot-cb");
  checkboxes.forEach(cb => {
    cb.onchange = () => {
      selectedDepots = Array.from(checkboxes)
        .filter(c => c.checked)
        .map(c => c.value);
      updateDepotButtonLabel();
      applyFilters();
    };
  });

  updateDepotButtonLabel();
}

// Cập nhật nhãn hiển thị trên nút chọn Trạng Thái Đơn
function updateStatusButtonLabel() {
  if (!statusSelectedLabel || !statusDropdownBtn) return;
  const count = selectedStatuses.length;
  const total = allStatusValues.length;

  if (count === 0) {
    statusSelectedLabel.textContent = "Chưa chọn Trạng thái";
    statusDropdownBtn.classList.remove("has-selection");
  } else if (count === total) {
    statusSelectedLabel.textContent = "Trạng thái (Tất cả)";
    statusDropdownBtn.classList.remove("has-selection");
  } else if (count === 1) {
    statusSelectedLabel.textContent = selectedStatuses[0];
    statusDropdownBtn.classList.add("has-selection");
  } else {
    statusSelectedLabel.textContent = `Trạng thái (${count})`;
    statusDropdownBtn.classList.add("has-selection");
  }

  // Cập nhật trạng thái checkbox "Tất cả trạng thái"
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

// Khởi tạo danh sách checkbox đa chọn Trạng Thái Đơn
function initStatusMultiSelect(statuses) {
  allStatusValues = [...statuses];
  selectedStatuses = [...statuses]; // Mặc định chọn tất cả
  if (!statusOptionsList) return;

  statusOptionsList.innerHTML = allStatusValues.map(s => {
    const escaped = s.replace(/"/g, '&quot;');
    return `
      <label class="multiselect-item">
        <input type="checkbox" class="status-cb" value="${escaped}" checked>
        <span>${s}</span>
      </label>
    `;
  }).join("");

  // Lắng nghe sự kiện tick từng checkbox trạng thái
  const checkboxes = statusOptionsList.querySelectorAll(".status-cb");
  checkboxes.forEach(cb => {
    cb.onchange = () => {
      selectedStatuses = Array.from(checkboxes)
        .filter(c => c.checked)
        .map(c => c.value);
      updateStatusButtonLabel();
      applyFilters();
    };
  });

  updateStatusButtonLabel();
}

// Chuyển chuỗi Ngày Được Duyệt (giờ VN) sang UTC timestamp (ms) độc lập múi giờ
function parseApprovalTimestamp(dateStr) {
  if (!dateStr || dateStr === "-" || dateStr === "null" || dateStr === "undefined") return null;
  const str = String(dateStr).trim().replace("T", " ");

  // 1. Format: YYYY-MM-DD HH:mm:ss hoặc YYYY/MM/DD
  const mYmd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (mYmd) {
    const y = parseInt(mYmd[1], 10);
    const m = parseInt(mYmd[2], 10) - 1;
    const d = parseInt(mYmd[3], 10);
    const h = parseInt(mYmd[4] || "0", 10);
    const min = parseInt(mYmd[5] || "0", 10);
    const s = parseInt(mYmd[6] || "0", 10);
    return Date.UTC(y, m, d, h - 7, min, s);
  }

  // 2. Format: HH:mm:ss DD/MM/YYYY hoặc HH:mm DD/MM/YYYY (giờ trước ngày sau)
  const mTimeDate = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mTimeDate) {
    const h = parseInt(mTimeDate[1], 10);
    const min = parseInt(mTimeDate[2], 10);
    const s = parseInt(mTimeDate[3] || "0", 10);
    const d = parseInt(mTimeDate[4], 10);
    const m = parseInt(mTimeDate[5], 10) - 1;
    const y = parseInt(mTimeDate[6], 10);
    return Date.UTC(y, m, d, h - 7, min, s);
  }

  // 3. Format: DD/MM/YYYY HH:mm:ss hoặc DD-MM-YYYY
  const mDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (mDmy) {
    const d = parseInt(mDmy[1], 10);
    const m = parseInt(mDmy[2], 10) - 1;
    const y = parseInt(mDmy[3], 10);
    const h = parseInt(mDmy[4] || "0", 10);
    const min = parseInt(mDmy[5] || "0", 10);
    const s = parseInt(mDmy[6] || "0", 10);
    return Date.UTC(y, m, d, h - 7, min, s);
  }

  // 4. Fallback Date parsing
  const dObj = new Date(str);
  if (!isNaN(dObj.getTime())) {
    return dObj.getTime();
  }

  return null;
}

// Định dạng thời gian còn lại (ms) thành chuỗi HH:mm:ss
function formatRemainingTime(remMs) {
  if (remMs <= 0) return "00:00:00";
  const totalSecs = Math.floor(remMs / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

// Kiểm tra xem đơn hàng đã được cấp / có số Container thực tế hay chưa
function hasContainerNumber(recordOrCont) {
  if (!recordOrCont && recordOrCont !== 0) return false;
  const raw = typeof recordOrCont === "object" ? (recordOrCont.soContainer || recordOrCont.so_container) : recordOrCont;
  if (!raw && raw !== 0) return false;
  const parsed = parseContainerAndEir(raw);
  if (!parsed || !parsed.soContainer) return false;
  const cont = String(parsed.soContainer).trim();
  if (!cont || cont === "-" || cont.toLowerCase() === "null" || cont.toLowerCase() === "undefined" || cont.toLowerCase() === "none") {
    return false;
  }
  return true;
}

// Phân loại cấp độ cảnh báo 3 giờ: 'safe' | 'yellow' | 'red' | 'expired' | 'processed' | null
function getWarning3hLevel(ngayDuocDuyet, isUnpaidOrExpired, trangThaiXuLy, isCancelled = false, soContainer = null) {
  // Quy tắc mới: Với đơn hủy, khi có cập nhật bất kỳ trạng thái xử lý nào -> Cập nhật là "Đã xử lý"
  if (isCancelled && trangThaiXuLy && String(trangThaiXuLy).trim()) {
    return "processed";
  }
  // Với đơn chưa thanh toán: Nếu trạng thái CSKH thuộc nhóm 1, 3, 6 (hoặc đã xử lý) -> Cập nhật "Đã xử lý"
  if (isProcessed3hStatus(trangThaiXuLy)) {
    return "processed";
  }
  if (!isUnpaidOrExpired) return null;
  if (!ngayDuocDuyet) return null;
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

// Tạo HTML hiển thị huy hiệu đếm ngược cảnh báo 3 giờ
function renderCountdownCell(ngayDuocDuyet, isUnpaidOrExpired, trangThaiXuLy, isCancelled = false, soContainer = null) {
  // Quy tắc mới: Với đơn hủy, khi thực hiện cập nhật trạng thái thì hạn hủy đơn (3h) hiển thị là ĐÃ XỬ LÝ
  if (isCancelled && trangThaiXuLy && String(trangThaiXuLy).trim()) {
    return `
      <div class="countdown-badge badge-countdown-processed" title="Đơn hủy đã được cập nhật trạng thái xử lý: ${trangThaiXuLy}">
        <span class="cd-pulse-dot processed"></span>
        <span>Đã xử lý</span>
      </div>
    `;
  }
  // Quy tắc: Chỉ khi là đơn chưa thanh toán VÀ Trạng Thái = 1, 3, 6 -> Tự động cập nhật huy hiệu ĐÃ XỬ LÝ
  if (isProcessed3hStatus(trangThaiXuLy)) {
    return `
      <div class="countdown-badge badge-countdown-processed" title="Đơn đã được xử lý CSKH: ${trangThaiXuLy}">
        <span class="cd-pulse-dot processed"></span>
        <span>Đã xử lý</span>
      </div>
    `;
  }
  if (!isUnpaidOrExpired) {
    return `<span style="color: var(--text-muted); font-size: 12px;">-</span>`;
  }
  if (!ngayDuocDuyet) {
    return `<span style="color: var(--text-muted); font-size: 12px;">Chưa duyệt</span>`;
  }
  const appTime = parseApprovalTimestamp(ngayDuocDuyet);
  if (!appTime) {
    return `<span style="color: var(--text-muted); font-size: 12px;">-</span>`;
  }

  const now = Date.now();
  const elapsedMs = now - appTime;
  const THREE_HOURS = 3 * 3600 * 1000;
  const ONE_HOUR = 3600 * 1000;
  const TWO_HOURS = 2 * ONE_HOUR;
  const remainingMs = THREE_HOURS - elapsedMs;

  if (elapsedMs >= THREE_HOURS) {
    return `
      <div class="countdown-badge badge-countdown-expired" title="Đã quá 3 giờ từ khi duyệt (${ngayDuocDuyet}).">
        <span class="cd-pulse-dot expired"></span>
        <span>Quá 3h</span>
      </div>
    `;
  } else if (elapsedMs >= TWO_HOURS) {
    const timeStr = formatRemainingTime(remainingMs);
    return `
      <div class="countdown-badge badge-countdown-red" title="Đã qua hơn 2 giờ từ khi duyệt (${ngayDuocDuyet}). Cảnh báo ĐỎ: Sắp tự động hủy!">
        <span class="cd-pulse-dot red"></span>
        <span class="cd-label">Còn</span>
        <span class="cd-timer" data-apptime="${appTime}">${timeStr}</span>
      </div>
    `;
  } else if (elapsedMs >= ONE_HOUR) {
    const timeStr = formatRemainingTime(remainingMs);
    return `
      <div class="countdown-badge badge-countdown-yellow" title="Đã qua hơn 1 giờ từ khi duyệt (${ngayDuocDuyet}). Cảnh báo VÀNG!">
        <span class="cd-pulse-dot yellow"></span>
        <span class="cd-label">Còn</span>
        <span class="cd-timer" data-apptime="${appTime}">${timeStr}</span>
      </div>
    `;
  } else {
    const timeStr = formatRemainingTime(remainingMs);
    return `
      <div class="countdown-badge badge-countdown-green" title="Dưới 1 giờ từ khi duyệt (${ngayDuocDuyet}). Trạng thái an toàn.">
        <span class="cd-pulse-dot green"></span>
        <span class="cd-label">Còn</span>
        <span class="cd-timer" data-apptime="${appTime}">${timeStr}</span>
      </div>
    `;
  }
}

// Cập nhật số giây còn lại và cấp độ màu trực tiếp trên bảng mỗi giây
function tickCountdowns() {
  const timers = document.querySelectorAll(".cd-timer");
  if (!timers.length) return;
  const now = Date.now();
  const THREE_HOURS = 3 * 3600 * 1000;
  const ONE_HOUR = 3600 * 1000;
  const TWO_HOURS = 2 * ONE_HOUR;

  timers.forEach(timer => {
    const appTime = parseInt(timer.getAttribute("data-apptime"), 10);
    if (isNaN(appTime)) return;
    const elapsedMs = now - appTime;
    const remainingMs = THREE_HOURS - elapsedMs;

    if (elapsedMs >= THREE_HOURS) {
      const badge = timer.closest(".countdown-badge");
      if (badge) {
        badge.className = "countdown-badge badge-countdown-expired";
        badge.title = "Đã quá 3 giờ từ khi duyệt.";
        badge.innerHTML = `<span class="cd-pulse-dot expired"></span><span>Quá 3h</span>`;
      }
    } else {
      timer.textContent = formatRemainingTime(remainingMs);
      const badge = timer.closest(".countdown-badge");
      if (badge) {
        if (elapsedMs >= TWO_HOURS) {
          if (!badge.classList.contains("badge-countdown-red")) {
            badge.className = "countdown-badge badge-countdown-red";
            badge.title = "Đã qua hơn 2 giờ từ khi duyệt. Cảnh báo ĐỎ: Sắp tự động hủy!";
            const dot = badge.querySelector(".cd-pulse-dot");
            if (dot) dot.className = "cd-pulse-dot red";
            const lbl = badge.querySelector(".cd-label");
            if (lbl) lbl.textContent = "Còn";
          }
        } else if (elapsedMs >= ONE_HOUR) {
          if (!badge.classList.contains("badge-countdown-yellow")) {
            badge.className = "countdown-badge badge-countdown-yellow";
            badge.title = "Đã qua hơn 1 giờ từ khi duyệt. Cảnh báo VÀNG!";
            const dot = badge.querySelector(".cd-pulse-dot");
            if (dot) dot.className = "cd-pulse-dot yellow";
            const lbl = badge.querySelector(".cd-label");
            if (lbl) lbl.textContent = "Còn";
          }
        }
      }
    }
  });
}

// Trích xuất giờ (0 - 23) từ chuỗi ngày tháng / thời gian (cột Ngày được duyệt)
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
  // Format HH:mm:ss DD/MM/YYYY hoặc HH:mm DD/MM/YYYY
  const mTimeDate = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mTimeDate) {
    const h = mTimeDate[1].padStart(2, "0");
    const min = mTimeDate[2].padStart(2, "0");
    const s = (mTimeDate[3] || "00").padStart(2, "0");
    const d = mTimeDate[4].padStart(2, "0");
    const m = mTimeDate[5].padStart(2, "0");
    const y = mTimeDate[6];
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

// Chuẩn hóa chuỗi giờ HH:mm (2 chữ số giờ và phút)
function normalizeHour(hourStr, defaultVal = "") {
  if (!hourStr) return defaultVal;
  const s = String(hourStr).trim();
  if (!s) return defaultVal;
  if (s === "24:00") return "23:59";
  const parts = s.split(":");
  const h = (parts[0] || "0").padStart(2, "0");
  const m = (parts[1] || "00").padStart(2, "0");
  return `${h}:${m}`;
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

  // Định dạng YYYY-MM-DD hoặc YYYY/MM/DD kèm giờ tùy chọn
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

  // Định dạng HH:mm:ss DD/MM/YYYY hoặc HH:mm DD/MM/YYYY -> Chuẩn hóa về DD/MM/YYYY HH:mm:ss
  const timeDateMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (timeDateMatch) {
    const h = timeDateMatch[1].padStart(2, "0");
    const min = timeDateMatch[2].padStart(2, "0");
    const s = (timeDateMatch[3] || "00").padStart(2, "0");
    const d = timeDateMatch[4].padStart(2, "0");
    const m = timeDateMatch[5].padStart(2, "0");
    const y = timeDateMatch[6];
    return `${d}/${m}/${y} ${h}:${min}:${s}`;
  }

  // Định dạng DD-MM-YYYY hoặc DD/MM/YYYY kèm giờ tùy chọn
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

// Tách số EIR và số Container từ chuỗi dữ liệu gốc (Ví dụ: EIR33989627-TCKU1000412)
// Nguyên tắc: Phần trước dấu "-" là số EIR, phần sau dấu "-" là số Container
function parseContainerAndEir(raw) {
  if (!raw && raw !== 0) {
    return { soContainer: "-", soEir: "-" };
  }
  const str = String(raw).trim();
  if (!str) {
    return { soContainer: "-", soEir: "-" };
  }

  const dashIndex = str.indexOf("-");
  if (dashIndex !== -1) {
    const eirPart = str.substring(0, dashIndex).trim();
    const contPart = str.substring(dashIndex + 1).trim();
    return {
      soContainer: contPart || "-",
      soEir: eirPart || "-"
    };
  }

  // Trường hợp không có dấu "-"
  if (str.toUpperCase().startsWith("EIR")) {
    return {
      soContainer: "-",
      soEir: str
    };
  }

  return {
    soContainer: str,
    soEir: "-"
  };
}

// Hỗ trợ lưu trữ trạng thái & giải trình theo từng đợt dữ liệu
function getRowKey(r) {
  if (r && r.rowKey) return r.rowKey;
  return `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
}

function getSavedNotes() {
  try {
    const key = `gpg_order_notes_${currentDatasetId}`;
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {
    return {};
  }
}

function saveNotes(notes) {
  try {
    const key = `gpg_order_notes_${currentDatasetId}`;
    localStorage.setItem(key, JSON.stringify(notes));
  } catch (e) {
    console.error("Lỗi khi lưu ghi chú:", e);
  }
}

// Xử lý thay đổi Trạng Thái (dropdown trạng thái CSKH)
window.onStatusSelectChange = function(selectElem) {
  const rowKey = selectElem.getAttribute("data-rowkey");
  const newStatus = selectElem.value;
  selectElem.setAttribute("data-status", newStatus);
  selectElem.setAttribute("data-status-order", getCskhStatusOrder(newStatus));

  // Cập nhật cho tất cả bản ghi tương ứng trong mảng allRecords (chung cho cả tab Tất Cả, Đơn Chưa Thanh Toán, Đơn Hủy)
  let matchedRecs = allRecords.filter(r => 
    (rowKey && (r.rowKey === rowKey || getRowKey(r) === rowKey))
  );

  // Nếu không khớp rowKey trực tiếp, tìm theo STT + Booking + Container
  if (matchedRecs.length === 0 && rowKey) {
    matchedRecs = allRecords.filter(r => {
      const alt = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
      return alt === rowKey;
    });
  }

  // Cập nhật trạng thái cho tất cả bản ghi tìm thấy
  matchedRecs.forEach(rec => {
    rec.trangThaiXuLy = newStatus;
  });

  // Đồng thời đồng bộ cho bất kỳ bản ghi nào cùng số Container & Booking trong allRecords
  const targetRec = matchedRecs[0];
  if (targetRec && (targetRec.soContainer || targetRec.soBooking)) {
    allRecords.forEach(r => {
      if (
        (targetRec.soContainer && r.soContainer === targetRec.soContainer && (!targetRec.soBooking || r.soBooking === targetRec.soBooking)) ||
        (targetRec.soBooking && !targetRec.soContainer && r.soBooking === targetRec.soBooking)
      ) {
        r.trangThaiXuLy = newStatus;
      }
    });
  }

  // Lưu vào localStorage cho cả rowKey và các khóa thay thế
  const notes = getSavedNotes();
  if (rowKey) {
    if (!notes[rowKey]) notes[rowKey] = {};
    notes[rowKey].status = newStatus;
  }
  matchedRecs.forEach(rec => {
    const k1 = getRowKey(rec);
    const k2 = `${rec.stt}_${rec.soBooking || ''}_${rec.soContainer || ''}`;
    if (k1) {
      if (!notes[k1]) notes[k1] = {};
      notes[k1].status = newStatus;
    }
    if (k2) {
      if (!notes[k2]) notes[k2] = {};
      notes[k2].status = newStatus;
    }
  });
  saveNotes(notes);

  // Đồng bộ hóa trực tiếp vào SQL Database trên Server và cập nhật version
  const currentTr = selectElem ? selectElem.closest("tr") : null;
  const targetR = matchedRecs[0] || {};
  fetch("/api/orders/note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rowKey,
      status: newStatus,
      giaiTrinh: targetR.giaiTrinh || "",
      giaiTrinhChiTiet: targetR.giaiTrinhChiTiet !== undefined ? targetR.giaiTrinhChiTiet : null
    })
  }).then(res => res.json()).then(data => {
    if (data && data.version) {
      localOperationalVersion = data.version;
    }
  }).catch(() => {});

  // Cập nhật tức thì ô Hạn Hủy Đơn trên dòng hiện tại mà người dùng vừa thao tác
  const isUnpaidOrExpired = isUnpaidOrder(targetR) || Boolean(targetR.isAutoCancelledBy3h);
  const isCancelled = isCancelledOrder(targetR);
  if (currentTr) {
    const cdCell = currentTr.querySelector(".cell-countdown-3h");
    if (cdCell) {
      cdCell.innerHTML = renderCountdownCell(targetR.ngayDuocDuyet, isUnpaidOrExpired, newStatus, isCancelled);
    }
  }

  // Cập nhật tức thì ô Hạn Hủy Đơn trên tất cả các dòng hiển thị tương ứng trong bảng dữ liệu
  const tbody = document.getElementById("tbodyFullData") || document.getElementById("tbodyMainOrders");
  if (tbody) {
    matchedRecs.forEach(rec => {
      const k = rec.rowKey || getRowKey(rec);
      const rowTrs = tbody.querySelectorAll(`tr[data-rowkey="${CSS.escape ? CSS.escape(k) : k}"]`);
      rowTrs.forEach(rowTr => {
        const cdCell = rowTr.querySelector(".cell-countdown-3h");
        if (cdCell) {
          const recUnpaid = isUnpaidOrder(rec) || Boolean(rec.isAutoCancelledBy3h);
          const recCancelled = isCancelledOrder(rec);
          cdCell.innerHTML = renderCountdownCell(rec.ngayDuocDuyet, recUnpaid, rec.trangThaiXuLy, recCancelled);
        }
      });
    });
  }

  updateTabCounts();
};

// ==========================================
// CHUẨN HÓA DANH MỤC LÝ DO GIẢI TRÌNH HỦY ĐƠN
// ==========================================
const CANCELLATION_REASON_GROUPS = [
  "Thay đổi kế hoạch vận chuyển",
  "Thay đổi kế hoạch nâng hạ",
  "Không có nhu cầu đặt đơn",
  "Lý do khác từ khách hàng",
  "Không đáp ứng điều kiện xử lý đơn",
  "Không thể thực hiện do điều kiện Depot/Container",
  "Lý do khác từ Trung tâm"
];

/**
 * Phân tích chuỗi giải trình thành Nhóm và Chi tiết
 * Đảm bảo tương thích ngược 100% với dữ liệu cũ
 */
function parseExplanationValue(rawVal) {
  if (!rawVal || typeof rawVal !== "string") {
    return { group: "", detail: "" };
  }
  const trimmed = rawVal.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "-") {
    return { group: "", detail: "" };
  }

  // 1. Khớp chính xác 1 trong 7 nhóm mới
  for (const g of CANCELLATION_REASON_GROUPS) {
    if (trimmed === g) {
      return { group: g, detail: "" };
    }
  }

  // 2. Khớp theo tiền tố nhóm
  for (const g of CANCELLATION_REASON_GROUPS) {
    if (trimmed.startsWith(g)) {
      let detail = trimmed.substring(g.length).trim();
      if (detail.startsWith(":") || detail.startsWith("-")) {
        detail = detail.substring(1).trim();
      }
      return { group: g, detail };
    }
  }

  // 3. Tương thích ngược dữ liệu tự do / danh mục cũ
  const lower = trimmed.toLowerCase();
  if (lower.includes("nâng hạ")) {
    return { group: "Thay đổi kế hoạch nâng hạ", detail: "" };
  }
  if (lower.includes("thay đổi kế hoạch") || lower.includes("kế hoạch") || lower.includes("hoãn lấy cont") || lower.includes("chủ hàng & kế hoạch") || lower.includes("chủ hàng")) {
    return { group: "Thay đổi kế hoạch vận chuyển", detail: "" };
  }
  if (lower.includes("không có nhu cầu") || lower.includes("không còn nhu cầu") || lower.includes("hủy đóng hàng") || lower.includes("không lấy cont") || lower.includes("thay đổi hoặc không còn nhu cầu")) {
    return { group: "Không có nhu cầu đặt đơn", detail: "" };
  }
  if (trimmed === "Không đáp ứng điều kiện thực hiện đơn") {
    return { group: "Không đáp ứng điều kiện thực hiện đơn", detail: "" };
  }
  if (lower.includes("xử lý đơn") || lower.includes("lỗi cổng") || lower.includes("hệ thống")) {
    return { group: "Không đáp ứng điều kiện xử lý đơn", detail: "" };
  }
  if (lower.includes("depot") || lower.includes("container") || lower.includes("hết cont") || lower.includes("cont xấu") || lower.includes("chuyển depot") || lower.includes("vỏ") || lower.includes("bãi")) {
    return { group: "Không thể thực hiện do điều kiện Depot/Container", detail: "" };
  }
  if (lower.includes("trung tâm") || lower.includes("điều hành")) {
    return { group: "Lý do khác từ Trung tâm", detail: "" };
  }
  if (lower.includes("khách hàng") || lower.includes("chờ sếp") || lower.includes("xe hư") || lower.includes("tài xế") || lower.startsWith("khác")) {
    let detail = "";
    if (trimmed.includes(":")) {
      detail = trimmed.substring(trimmed.indexOf(":") + 1).trim();
    } else if (trimmed.includes(" - ")) {
      detail = trimmed.substring(trimmed.indexOf(" - ") + 3).trim();
    } else {
      detail = trimmed.replace(/^khác\s*(\(.*\))?\s*/i, "").trim();
    }
    return { group: "Lý do khác từ khách hàng", detail: detail || trimmed };
  }

  return { group: "", detail: trimmed };
}

/**
 * Ghép nhóm và chi tiết thành chuỗi lưu trữ
 */
function buildExplanationString(group, detail) {
  if (!group) return "";
  if (group.includes("Lý do khác") || group.includes("Khác") || group.includes("khác")) {
    const d = (detail || "").trim();
    return d ? `${group}: ${d}` : group;
  }
  return group;
}

/**
 * Hàm lưu Nhóm Giải Trình (Cột Giải Trình)
 */
function saveReasonGroupValue(rowKey, groupVal, triggerElem, instant = true) {
  let matchedRecs = allRecords.filter(r => 
    (rowKey && (r.rowKey === rowKey || getRowKey(r) === rowKey))
  );

  if (matchedRecs.length === 0 && rowKey) {
    matchedRecs = allRecords.filter(r => {
      const alt = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
      return alt === rowKey;
    });
  }

  const finalGroup = groupVal ? groupVal.trim() : null;
  matchedRecs.forEach(rec => {
    rec.giaiTrinh = finalGroup;
  });

  const targetRec = matchedRecs[0];
  if (targetRec && (targetRec.soContainer || targetRec.soBooking)) {
    allRecords.forEach(r => {
      if (
        (targetRec.soContainer && r.soContainer === targetRec.soContainer && (!targetRec.soBooking || r.soBooking === targetRec.soBooking)) ||
        (targetRec.soBooking && !targetRec.soContainer && r.soBooking === targetRec.soBooking)
      ) {
        r.giaiTrinh = finalGroup;
      }
    });
  }

  // Đồng bộ giao diện tức thì
  const tbody = document.getElementById("tbodyFullData") || document.getElementById("tbodyMainOrders");
  if (tbody) {
    matchedRecs.forEach(rec => {
      const k = rec.rowKey || getRowKey(rec);
      const rowTrs = tbody.querySelectorAll(`tr[data-rowkey="${CSS.escape ? CSS.escape(k) : k}"]`);
      rowTrs.forEach(rowTr => {
        const selGrp = rowTr.querySelector(".select-reason-group");
        if (selGrp && selGrp !== triggerElem && selGrp.value !== (finalGroup || "")) {
          selGrp.value = finalGroup || "";
        }
      });
    });
  }

  const notes = getSavedNotes();
  const saveToNoteObj = (k) => {
    if (!notes[k]) notes[k] = {};
    notes[k].giaiTrinh = finalGroup;
  };
  if (rowKey) saveToNoteObj(rowKey);
  matchedRecs.forEach(rec => {
    const k1 = getRowKey(rec);
    const k2 = `${rec.stt}_${rec.soBooking || ''}_${rec.soContainer || ''}`;
    if (k1) saveToNoteObj(k1);
    if (k2) saveToNoteObj(k2);
  });
  saveNotes(notes);

  const safeTargetRec = targetRec || {};
  fetch("/api/orders/note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rowKey,
      giaiTrinh: finalGroup,
      status: safeTargetRec.trangThaiXuLy || "",
      giaiTrinhChiTiet: safeTargetRec.giaiTrinhChiTiet !== undefined ? safeTargetRec.giaiTrinhChiTiet : null
    })
  }).then(res => res.json()).then(data => {
    if (data && data.version) {
      localOperationalVersion = data.version;
    }
  }).catch(() => {});

  if (triggerElem) {
    triggerElem.classList.add("saved-pulse");
    setTimeout(() => triggerElem.classList.remove("saved-pulse"), 600);
  }
}

/**
 * Hàm lưu Chi Tiết Giải Trình (Cột Giải Trình Chi Tiết) với debounce
 * Khi xóa rỗng (empty string) lưu chính xác là null
 */
let expDetailDebounceTimer = null;
function saveExplanationDetailValue(rowKey, detailVal, triggerElem, instant = false) {
  let matchedRecs = allRecords.filter(r => 
    (rowKey && (r.rowKey === rowKey || getRowKey(r) === rowKey))
  );

  if (matchedRecs.length === 0 && rowKey) {
    matchedRecs = allRecords.filter(r => {
      const alt = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
      return alt === rowKey;
    });
  }

  // Khi rỗng thì lưu rõ ràng là null
  const finalDetail = (detailVal !== null && detailVal !== undefined && String(detailVal).trim() !== "") 
    ? String(detailVal).trim() 
    : null;

  matchedRecs.forEach(rec => {
    rec.giaiTrinhChiTiet = finalDetail;
  });

  const targetRec = matchedRecs[0];
  if (targetRec && (targetRec.soContainer || targetRec.soBooking)) {
    allRecords.forEach(r => {
      if (
        (targetRec.soContainer && r.soContainer === targetRec.soContainer && (!targetRec.soBooking || r.soBooking === targetRec.soBooking)) ||
        (targetRec.soBooking && !targetRec.soContainer && r.soBooking === targetRec.soBooking)
      ) {
        r.giaiTrinhChiTiet = finalDetail;
      }
    });
  }

  // Đồng bộ giao diện tức thì
  const tbody = document.getElementById("tbodyFullData") || document.getElementById("tbodyMainOrders");
  if (tbody) {
    matchedRecs.forEach(rec => {
      const k = rec.rowKey || getRowKey(rec);
      const rowTrs = tbody.querySelectorAll(`tr[data-rowkey="${CSS.escape ? CSS.escape(k) : k}"]`);
      rowTrs.forEach(rowTr => {
        const inDetail = rowTr.querySelector(".input-reason-detail");
        if (inDetail && inDetail !== triggerElem) {
          inDetail.value = finalDetail !== null ? finalDetail : "";
        }
      });
    });
  }

  const doSave = () => {
    const notes = getSavedNotes();
    const saveToNoteObj = (k) => {
      if (!notes[k]) notes[k] = {};
      notes[k].giaiTrinhChiTiet = finalDetail;
    };
    if (rowKey) saveToNoteObj(rowKey);
    matchedRecs.forEach(rec => {
      const k1 = getRowKey(rec);
      const k2 = `${rec.stt}_${rec.soBooking || ''}_${rec.soContainer || ''}`;
      if (k1) saveToNoteObj(k1);
      if (k2) saveToNoteObj(k2);
    });
    saveNotes(notes);

    fetch("/api/orders/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rowKey,
        giaiTrinhChiTiet: finalDetail,
        status: targetRec.trangThaiXuLy || "",
        giaiTrinh: targetRec.giaiTrinh || ""
      })
    }).then(res => res.json()).then(data => {
      if (data && data.version) {
        localOperationalVersion = data.version;
      }
    }).catch(() => {});

    if (triggerElem) {
      triggerElem.classList.add("saved-pulse");
      setTimeout(() => triggerElem.classList.remove("saved-pulse"), 600);
    }
  };

  clearTimeout(expDetailDebounceTimer);
  if (instant) {
    doSave();
  } else {
    expDetailDebounceTimer = setTimeout(doSave, 300);
  }
}

// Xử lý khi người dùng đổi Dropdown Nhóm Lý Do
window.onReasonGroupChange = function(selectElem) {
  const rowKey = selectElem.getAttribute("data-rowkey");
  const selectedGroup = selectElem.value ? selectElem.value.trim() : null;
  saveReasonGroupValue(rowKey, selectedGroup, selectElem, true);
};

// Xử lý khi người dùng nhập hoặc xóa ô Giải Trình Chi Tiết
window.onReasonDetailInput = function(inputElem) {
  const rowKey = inputElem.getAttribute("data-rowkey");
  const rawVal = inputElem.value;
  const detailVal = rawVal.trim() === "" ? null : rawVal;
  saveExplanationDetailValue(rowKey, detailVal, inputElem, false);
};

window.onReasonDetailBlur = function(inputElem) {
  const rowKey = inputElem.getAttribute("data-rowkey");
  const rawVal = inputElem.value;
  const detailVal = rawVal.trim() === "" ? null : rawVal;
  saveExplanationDetailValue(rowKey, detailVal, inputElem, true);
};

// Hàm tương thích ngược
window.onExplanationInput = function(inputElem) {
  window.onReasonDetailInput(inputElem);
};

document.addEventListener("DOMContentLoaded", () => {
  // Đồng bộ giá trị dropdown cố định cột
  if (selectFreezeCols) {
    selectFreezeCols.value = String(currentFrozenCount);
    selectFreezeCols.onchange = (e) => {
      const count = parseInt(e.target.value, 10);
      applyFrozenColumns(count);
    };
  }

  // Lắng nghe sự kiện co giãn cửa sổ để tính lại độ rộng cột sticky
  window.addEventListener("resize", () => {
    applyFrozenColumns();
  });

  // Lắng nghe sự kiện chuyển tab (Tất Cả <-> Chưa Thanh Toán <-> Đơn Hủy <-> Chờ Xử Lý)
  if (tabAllOrders) {
    tabAllOrders.onclick = () => switchTab("all");
  }
  if (tabUnpaidOrders) {
    tabUnpaidOrders.onclick = () => switchTab("unpaid");
  }
  if (tabCancelledOrders) {
    tabCancelledOrders.onclick = () => switchTab("cancelled");
  }
  if (tabPendingOrders) {
    tabPendingOrders.onclick = () => switchTab("pending");
  }
  if (navUnpaid) {
    navUnpaid.onclick = (e) => {
      e.preventDefault();
      switchTab("unpaid");
    };
  }
  if (navCancelled) {
    navCancelled.onclick = (e) => {
      e.preventDefault();
      switchTab("cancelled");
    };
  }
  if (navDataTable) {
    navDataTable.onclick = (e) => {
      e.preventDefault();
      switchTab("all");
    };
  }

  // Lắng nghe sự kiện click nút Chuyển Chờ và nút Xóa trên từng dòng trong bảng
  if (tbodyFullData) {
    tbodyFullData.addEventListener("click", (e) => {
      // 1. Thao tác Chuyển Chờ (Tab Đơn Hủy)
      const btnMove = e.target.closest(".btn-row-move-pending");
      if (btnMove) {
        const rowId = decodeURIComponent(btnMove.getAttribute("data-rowid") || "");
        const rowKey = btnMove.getAttribute("data-rowkey") || rowId;
        if (!rowId) return;
        if (!pendingRows.includes(rowId)) {
          pendingRows.push(rowId);
          sessionStorage.setItem("gpg_pending_rows", JSON.stringify(pendingRows));
        }
        // Cập nhật thuộc tính trên bản ghi bộ nhớ
        allRecords.forEach(r => {
          if (r.rowKey === rowKey || getRowKey(r) === rowKey) {
            r.isPending = true;
          }
        });
        // Đồng bộ trạng thái Pending bền vững lên máy chủ Cơ sở dữ liệu
        fetch("/api/orders/pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowKey: rowKey, isPending: true })
        }).catch(() => {});

        updateTabCounts();
        showAlert("Đã chuyển đơn vào danh sách Chờ Xử Lý.", false);
        applyFilters();
        return;
      }

      // 2. Thao tác Xóa (Tab Chờ Xử Lý - Xóa hiển thị của dòng dữ liệu đó)
      const btnRemove = e.target.closest(".btn-row-remove-pending");
      if (btnRemove) {
        const rowId = decodeURIComponent(btnRemove.getAttribute("data-rowid") || "");
        const rowKey = btnRemove.getAttribute("data-rowkey") || rowId;
        if (!rowId) return;

        // Loại bỏ khỏi danh sách pendingRows
        pendingRows = pendingRows.filter(id => id !== rowId);
        sessionStorage.setItem("gpg_pending_rows", JSON.stringify(pendingRows));

        // Cập nhật cờ isPending trên bản ghi bộ nhớ
        allRecords.forEach(r => {
          if (r.rowKey === rowKey || getRowKey(r) === rowKey) {
            r.isPending = false;
          }
        });

        // Đồng bộ bỏ trạng thái Pending về máy chủ Cơ sở dữ liệu
        fetch("/api/orders/pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowKey: rowKey, isPending: false })
        }).catch(() => {});

        updateTabCounts();
        showAlert("Đã xóa đơn khỏi danh sách Chờ Xử Lý.", false);
        applyFilters();
        return;
      }

      // 3. Highlight dòng dữ liệu khi người dùng click vào dòng
      const clickedRow = e.target.closest("tr");
      if (clickedRow && clickedRow.parentElement === tbodyFullData && !clickedRow.querySelector("td[colspan]")) {
        tbodyFullData.querySelectorAll("tr.row-highlighted").forEach(r => {
          if (r !== clickedRow) r.classList.remove("row-highlighted");
        });
        clickedRow.classList.add("row-highlighted");
      }
    });
  }


  // Lắng nghe sự kiện click nút Cập Nhật Dữ Liệu (Tab Tất Cả Đơn)
  if (btnUpdateData) {
    btnUpdateData.onclick = async () => {
      const confirmRun = confirm("Bạn có chắc chắn muốn thực hiện Cập Nhật Dữ Liệu đối soát từ Bảng Check Đơn không?\n\n- Phạm vi cập nhật: Chỉ lấy tối đa dữ liệu trong vòng 3 ngày gần nhất (từ Ngày hiện tại - 2 đến nay).\n- Đơn chưa thanh toán: Đối soát và thay thế dữ liệu khi trùng số Booking, trùng số Container và trùng số EIR.\n- Đơn đã hủy: Đối soát tuần tự 4 vòng (V1: cùng Cont; V2: đơn OUT chưa có Cont cùng xe tìm cont mới; V3: đổi Booking cùng xe; V4: đơn OUT cùng xe trong 24h).\n- Các dòng check đơn đã thay thế sẽ tự động được xóa khỏi bảng check đơn.");
      if (!confirmRun) return;

      const originalText = btnUpdateData.textContent;
      btnUpdateData.disabled = true;
      btnUpdateData.textContent = "Đang cập nhật...";

      try {
        const resp = await fetch("/api/orders/update-from-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const data = await resp.json();

        if (resp.ok && data.status === "success") {
          const msg = data.message || `Cập nhật thành công ${data.updatedUnpaid || 0} đơn Chưa thanh toán và ${data.updatedCancelled || 0} đơn Đã hủy. Đã xóa ${data.deletedCheckRows || 0} dòng check đơn.`;
          showAlert(msg, false);

          // Đồng bộ trạng thái mới vào localStorage
          if (data.updatedRecords && Array.isArray(data.updatedRecords) && data.updatedRecords.length > 0) {
            const notes = getSavedNotes();
            data.updatedRecords.forEach(rec => {
              if (rec.rowKey && rec.trangThaiXuLy) {
                if (!notes[rec.rowKey]) notes[rec.rowKey] = {};
                notes[rec.rowKey].status = rec.trangThaiXuLy;
              }
              const altKey = `${rec.stt}_${rec.soBooking || ''}_${rec.soContainer || ''}`;
              if (altKey && rec.trangThaiXuLy) {
                if (!notes[altKey]) notes[altKey] = {};
                notes[altKey].status = rec.trangThaiXuLy;
              }
            });
            saveNotes(notes);
          }

          // Nạp lại toàn bộ dữ liệu bảng để hiển thị dữ liệu mới nhất trên cả 3 view
          await loadDataset(true);
        } else {
          showAlert(data.message || "Lỗi khi thực hiện cập nhật dữ liệu.", true);
        }
      } catch (err) {
        showAlert(`Lỗi kết nối máy chủ: ${err.message}`, true);
      } finally {
        btnUpdateData.disabled = false;
        btnUpdateData.textContent = originalText;
      }
    };
  }

  // Lắng nghe sự kiện click nút Lọc Đơn Trùng (Tab Tất Cả Đơn)
  if (btnDeduplicateData) {
    btnDeduplicateData.onclick = async () => {
      const confirmRun = confirm(
        "Bạn có chắc chắn muốn thực hiện Lọc Đơn Trùng theo số EIR không?\n\n- Hệ thống sẽ quét toàn bộ dữ liệu đơn hàng trên hệ thống.\n- Khi phát hiện các đơn có cùng số EIR, sẽ giữ lại đơn có Ngày được duyệt mới nhất và tự động xóa các dòng cũ hơn.\n- Dữ liệu bị xóa sẽ không thể khôi phục."
      );
      if (!confirmRun) return;

      const originalText = btnDeduplicateData.textContent;
      btnDeduplicateData.disabled = true;
      btnDeduplicateData.textContent = "Đang lọc...";

      try {
        const resp = await fetch("/api/orders/deduplicate-by-eir", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const data = await resp.json();

        if (resp.ok && data.status === "success") {
          const msg = data.message || `Đã lọc thành công: Phát hiện ${data.duplicatesFound || 0} cụm trùng EIR, đã xóa ${data.deletedCount || 0} dòng cũ hơn. Còn lại ${data.remainingCount || 0} đơn.`;
          showAlert(msg, false);

          // Nạp lại toàn bộ dữ liệu bảng để hiển thị dữ liệu mới nhất trên cả 3 view
          await loadDataset(true);
        } else {
          showAlert(data.message || "Lỗi khi thực hiện lọc đơn trùng.", true);
        }
      } catch (err) {
        showAlert(`Lỗi kết nối máy chủ: ${err.message}`, true);
      } finally {
        btnDeduplicateData.disabled = false;
        btnDeduplicateData.textContent = originalText;
      }
    };
  }

  // Lắng nghe sự kiện click nút Thêm Dòng Nhập Liệu Thủ Công
  if (btnAddManualRow) {
    btnAddManualRow.onclick = () => {
      // Nếu dòng nhập thủ công đã tồn tại thì cuộn tới và focus
      const existingManualRow = document.getElementById("manualInputRow");
      if (existingManualRow) {
        existingManualRow.scrollIntoView({ behavior: "smooth", block: "center" });
        const bookingInput = document.getElementById("manual_soBooking");
        if (bookingInput) bookingInput.focus();
        return;
      }

      // Xóa thông báo trống nếu có
      if (tbodyFullData.querySelector("td[colspan]")) {
        tbodyFullData.innerHTML = "";
      }

      // Xác định trạng thái đơn mặc định theo tab đang chọn
      let defaultStatus = "Chưa thanh toán";
      if (currentTab === "cancelled") defaultStatus = "Đã hủy";
      else if (currentTab === "unpaid") defaultStatus = "Chưa thanh toán";

      const tr = document.createElement("tr");
      tr.id = "manualInputRow";
      tr.className = "manual-input-row";

      tr.innerHTML = `
        <td class="text-center" style="font-weight: 700; color: #15803d; vertical-align: middle;">+ Mới</td>
        <td>
          <select id="manual_depot" class="manual-row-select" title="Chọn Depot">
            <option value="BSD">BSD</option>
            <option value="THT">THT</option>
            <option value="SLD">SLD</option>
            <option value="PMCM">PMCM</option>
            <option value="ETD">ETD</option>
            <option value="AIC">AIC</option>
          </select>
        </td>
        <td>
          <input type="text" id="manual_hangTau" class="manual-row-input" placeholder="Hãng tàu (CMA, YML...)" title="Nhập hãng tàu">
        </td>
        <td>
          <input type="text" id="manual_soBooking" class="manual-row-input" placeholder="Số booking" style="font-weight: 700;" title="Nhập số booking">
        </td>
        <td>
          <input type="text" id="manual_soEir" class="manual-row-input" placeholder="Số EIR (vd: EIR3398...)" title="Nhập số EIR">
        </td>
        <td>
          <input type="text" id="manual_soContainer" class="manual-row-input" placeholder="Số cont (vd: TCKU...)" title="Nhập số container">
        </td>
        <td class="text-center" style="color: #64748b; font-size: 11.5px; font-style: italic; vertical-align: middle;">Tự động (3h)</td>
        <td>
          <select id="manual_trangThaiDonHang" class="manual-row-select" title="Trạng thái đơn hàng">
            <option value="Chưa thanh toán" ${defaultStatus === "Chưa thanh toán" ? "selected" : ""}>Chưa thanh toán</option>
            <option value="Đã hủy" ${defaultStatus === "Đã hủy" ? "selected" : ""}>Đã hủy</option>
            <option value="Từ chối duyệt">Từ chối duyệt</option>
            <option value="Đã hoàn thành">Đã hoàn thành</option>
            <option value="Đã thanh toán">Đã thanh toán</option>
            <option value="Đã hoàn tiền">Đã hoàn tiền</option>
            <option value="Đang hoàn tiền">Đang hoàn tiền</option>
            <option value="Xếp tài">Xếp tài</option>
          </select>
        </td>
        <td>
          <input type="text" id="manual_ngayHuyDon" class="manual-row-input" placeholder="YYYY-MM-DD HH:mm:ss" title="Ngày hủy đơn">
        </td>
        <td>
          <input type="text" id="manual_ngayDuocDuyet" class="manual-row-input" placeholder="YYYY-MM-DD HH:mm:ss" title="Ngày được duyệt">
        </td>
        <td>
          <select id="manual_trangThaiKichHoat" class="manual-row-select" title="Trạng thái kích hoạt">
            <option value="Chưa kích hoạt">Chưa kích hoạt</option>
            <option value="Đã kích hoạt">Đã kích hoạt</option>
          </select>
        </td>
        <td>
          <input type="text" id="manual_thoiGianKichHoat" class="manual-row-input" placeholder="Thời gian kích hoạt" title="Thời gian kích hoạt">
        </td>
        <td>
          <input type="text" id="manual_lyDoHuy" class="manual-row-input" placeholder="Lý do hủy" title="Lý do hủy">
        </td>
        <td>
          <input type="text" id="manual_loaiContainer" class="manual-row-input" placeholder="Cont 20' DC / 40' HC..." value="Cont 20' DC" title="Loại container">
        </td>
        <td>
          <select id="manual_loaiDonHang" class="manual-row-select" title="Chiều đơn hàng">
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </select>
        </td>
        <td>
          <input type="number" id="manual_sizeTeus" class="manual-row-input text-center" min="1" max="4" value="1" title="Size TEUS">
        </td>
        <td>
          <input type="text" id="manual_tenTaiXe" class="manual-row-input" placeholder="Tên tài xế" title="Tên tài xế">
        </td>
        <td>
          <input type="text" id="manual_sdtTaiXe" class="manual-row-input" placeholder="SĐT tài xế" title="Số điện thoại tài xế">
        </td>
        <td>
          <input type="text" id="manual_tenNhaXe" class="manual-row-input" placeholder="Tên nhà xe" title="Tên nhà xe">
        </td>
        <td>
          <input type="text" id="manual_sdtNhaXe" class="manual-row-input" placeholder="SĐT nhà xe" title="Số điện thoại nhà xe">
        </td>
        <td>
          <input type="text" id="manual_lyDoTuChoi" class="manual-row-input" placeholder="Lý do từ chối" title="Lý do từ chối">
        </td>
        ${currentTab === "cancelled" ? `
          <td class="col-pending-action text-center" style="color: #94a3b8; font-size: 12px; vertical-align: middle;">-</td>
        ` : ""}
        <td>
          <select id="manual_trangThaiXuLy" class="manual-row-select" title="Trạng thái chăm sóc khách hàng">
            <option value="">-- Chọn trạng thái --</option>
            ${getTabCskhStatusOptions(currentTab).map(opt => `
              <option value="${opt.val}">${opt.label}</option>
            `).join("")}
          </select>
        </td>
        <td>
          <select id="manual_giaiTrinh_group" class="manual-row-select" title="Nhóm lý do giải trình" style="width: 100%; min-width: 168px;">
            <option value="">-- Chọn nhóm lý do --</option>
            ${CANCELLATION_REASON_GROUPS.map((grp, idx) => `
              <option value="${grp}">${idx + 1}. ${grp}</option>
            `).join("")}
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center; min-width: 208px;">
            <input type="text" id="manual_giaiTrinh_detail" class="manual-row-input" placeholder="Chi tiết giải trình..." style="flex: 1;" title="Chi tiết giải trình (Xóa trống để lưu null)">
            <button type="button" class="btn btn-primary btn-sm" id="btnSaveManualRow" style="padding: 4px 10px; font-weight: 700; white-space: nowrap;">Lưu</button>
            <button type="button" class="btn btn-outline btn-sm" id="btnCancelManualRow" style="padding: 4px 8px; white-space: nowrap;">Hủy</button>
          </div>
        </td>
      `;

      tbodyFullData.prepend(tr);

      // Đồng bộ đóng băng cột cho dòng mới
      requestAnimationFrame(() => {
        applyFrozenColumns();
      });

      // Cuộn lên đầu bảng và tự động focus vào ô Booking
      const container = document.querySelector(".full-table-container");
      if (container) container.scrollTop = 0;
      const bookingInput = document.getElementById("manual_soBooking");
      if (bookingInput) bookingInput.focus();

      // Nút Hủy
      const btnCancel = document.getElementById("btnCancelManualRow");
      if (btnCancel) {
        btnCancel.onclick = () => {
          tr.remove();
          if (tbodyFullData.children.length === 0) {
            renderFullDataTable();
          }
        };
      }

      // Nút Lưu
      const btnSave = document.getElementById("btnSaveManualRow");
      if (btnSave) {
        btnSave.onclick = async () => {
          const soBooking = (document.getElementById("manual_soBooking").value || "").trim();
          const soContainer = (document.getElementById("manual_soContainer").value || "").trim();
          const soEir = (document.getElementById("manual_soEir").value || "").trim();

          if (!soBooking && !soContainer && !soEir) {
            alert("Vui lòng nhập ít nhất một trong các thông tin: Số Booking, Số Container hoặc Số EIR!");
            document.getElementById("manual_soBooking").focus();
            return;
          }

          const payload = {
            depot: document.getElementById("manual_depot").value,
            hangTau: (document.getElementById("manual_hangTau").value || "").trim(),
            ngayHuyDon: (document.getElementById("manual_ngayHuyDon").value || "").trim(),
            ngayDuocDuyet: (document.getElementById("manual_ngayDuocDuyet").value || "").trim(),
            soBooking: soBooking,
            soContainer: soContainer,
            soEir: soEir,
            trangThaiDonHang: document.getElementById("manual_trangThaiDonHang").value,
            trangThaiKichHoat: document.getElementById("manual_trangThaiKichHoat").value,
            thoiGianKichHoat: (document.getElementById("manual_thoiGianKichHoat").value || "").trim(),
            lyDoHuy: (document.getElementById("manual_lyDoHuy").value || "").trim(),
            loaiContainer: (document.getElementById("manual_loaiContainer").value || "").trim(),
            loaiDonHang: document.getElementById("manual_loaiDonHang").value,
            sizeTeus: Number(document.getElementById("manual_sizeTeus").value) || 1,
            tenTaiXe: (document.getElementById("manual_tenTaiXe").value || "").trim(),
            sdtTaiXe: (document.getElementById("manual_sdtTaiXe").value || "").trim(),
            tenNhaXe: (document.getElementById("manual_tenNhaXe").value || "").trim(),
            sdtNhaXe: (document.getElementById("manual_sdtNhaXe").value || "").trim(),
            lyDoTuChoi: (document.getElementById("manual_lyDoTuChoi").value || "").trim(),
            trangThaiXuLy: document.getElementById("manual_trangThaiXuLy").value,
            giaiTrinh: (document.getElementById("manual_giaiTrinh_group")?.value || "").trim() || null,
            giaiTrinhChiTiet: (document.getElementById("manual_giaiTrinh_detail")?.value || "").trim() || null
          };

          const originalText = btnSave.textContent;
          btnSave.disabled = true;
          btnSave.textContent = "Đang lưu...";

          try {
            const resp = await fetch("/api/orders/manual", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            const resData = await resp.json();

            if (resp.ok && resData.status === "success") {
              showAlert("Đã thêm đơn hàng thủ công thành công!", false);
              await loadDataset();
            } else {
              alert(resData.message || "Lỗi khi lưu đơn hàng thủ công.");
              btnSave.disabled = false;
              btnSave.textContent = originalText;
            }
          } catch (err) {
            alert(`Lỗi kết nối máy chủ: ${err.message}`);
            btnSave.disabled = false;
            btnSave.textContent = originalText;
          }
        };
      }

      // Hỗ trợ phím Escape để hủy dòng
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          tr.remove();
          if (tbodyFullData.children.length === 0) {
            renderFullDataTable();
          }
        }
      });
    };
  }

  // Đóng mở dropdown đa chọn Depot
  if (depotDropdownBtn && depotDropdownPanel) {
    depotDropdownBtn.onclick = (e) => {
      e.stopPropagation();
      // Đóng status dropdown nếu đang mở
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

    // Ngăn chặn đóng dropdown khi click thao tác bên trong panel
    depotDropdownPanel.onclick = (e) => {
      e.stopPropagation();
    };
  }

  // Đóng mở dropdown đa chọn Trạng Thái
  if (statusDropdownBtn && statusDropdownPanel) {
    statusDropdownBtn.onclick = (e) => {
      e.stopPropagation();
      // Đóng depot dropdown nếu đang mở
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

    // Ngăn chặn đóng dropdown khi click thao tác bên trong panel
    statusDropdownPanel.onclick = (e) => {
      e.stopPropagation();
    };
  }

  // Tự động đóng cả 2 dropdown khi click ra ngoài & bỏ highlight dòng khi click ở chỗ khác
  document.addEventListener("click", (e) => {
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

    // Bỏ highlight dòng khi click ở chỗ khác ngoài các dòng dữ liệu của bảng
    if (!e.target.closest("#tbodyFullData tr")) {
      if (tbodyFullData) {
        tbodyFullData.querySelectorAll("tr.row-highlighted").forEach(r => r.classList.remove("row-highlighted"));
      }
    }
  });

  // Sự kiện chọn/bỏ chọn Tất Cả Depot
  if (depotSelectAll) {
    depotSelectAll.onchange = (e) => {
      const isChecked = e.target.checked;
      const checkboxes = depotOptionsList ? depotOptionsList.querySelectorAll(".depot-cb") : [];
      checkboxes.forEach(cb => { cb.checked = isChecked; });
      selectedDepots = isChecked ? [...allDepotValues] : [];
      updateDepotButtonLabel();
      applyFilters();
    };
  }

  // Sự kiện chọn/bỏ chọn Tất Cả Trạng Thái
  if (statusSelectAll) {
    statusSelectAll.onchange = (e) => {
      const isChecked = e.target.checked;
      const checkboxes = statusOptionsList ? statusOptionsList.querySelectorAll(".status-cb") : [];
      checkboxes.forEach(cb => { cb.checked = isChecked; });
      selectedStatuses = isChecked ? [...allStatusValues] : [];
      updateStatusButtonLabel();
      applyFilters();
    };
  }

  // Event listeners
  if (searchInput) searchInput.oninput = applyFilters;
  if (filterDateType) filterDateType.onchange = applyFilters;
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
      applyFilters();
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
      applyFilters();
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
      if (tableDateFilterGroup) tableDateFilterGroup.classList.remove("has-selection");
      applyFilters();
    };
  }

  if (filterHourFrom) {
    filterHourFrom.onchange = applyFilters;
    filterHourFrom.oninput = applyFilters;
  }
  if (filterHourTo) {
    filterHourTo.onchange = applyFilters;
    filterHourTo.oninput = applyFilters;
  }
  if (filterLine) filterLine.onchange = applyFilters;
  if (filterDirection) filterDirection.onchange = applyFilters;
  if (filterApprovedHour) filterApprovedHour.onchange = applyFilters;
  if (filterWarning3h) filterWarning3h.onchange = applyFilters;
  if (filterContactStatus) filterContactStatus.onchange = applyFilters;
  if (btnResetFilter) btnResetFilter.onclick = resetFilters;
  if (btnReloadData) btnReloadData.onclick = reloadTableDataPreservingFilters;
  if (btnExportCsv) btnExportCsv.onclick = exportFilteredToCsv;
  if (btnExportExcel) btnExportExcel.onclick = exportFilteredToExcel;
  if (btnSyncTurso) btnSyncTurso.onclick = triggerTursoSync;
  if (tursoStatusBadge) tursoStatusBadge.onclick = triggerTursoSync;

  // Khởi động bộ đếm ngược liên tục mỗi giây trên toàn bộ bảng
  setInterval(tickCountdowns, 1000);

  // Khởi động cơ chế đồng bộ thời gian thực siêu nhẹ 5 giây giữa các người dùng
  startRealtimeSync();

  // Khởi tạo các sự kiện phân trang (Tối đa 200 dòng/trang)
  initPaginationEvents();

  // Load dataset
  loadDataset();

  // Kiểm tra liên kết Turso Cloud SQLite
  checkTursoStatus();
});

// Quản lý đồng bộ thời gian thực siêu nhẹ (5s polling) giữa nhiều người dùng
let localOperationalVersion = 0;
let isSyncingOperational = false;

function startRealtimeSync() {
  // Lấy phiên bản ban đầu sau khi tải trang 1 giây
  setTimeout(checkAndSyncOperationalUpdates, 1500);

  // Polling định kỳ mỗi 5 giây
  setInterval(() => {
    // Chỉ chạy khi tab đang active/hiển thị để tiết kiệm tài nguyên
    if (document.visibilityState === "visible") {
      checkAndSyncOperationalUpdates();
    }
  }, 5000);

  // Khi người dùng chuyển tab và quay lại, đồng bộ ngay lập tức
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkAndSyncOperationalUpdates();
    }
  });
}

async function checkAndSyncOperationalUpdates() {
  if (isSyncingOperational || !allRecords || allRecords.length === 0) return;
  try {
    isSyncingOperational = true;
    // 1. Kiểm tra version siêu nhẹ (~10 bytes)
    const resVer = await fetch("/api/orders/operational-version");
    if (!resVer.ok) return;
    const dataVer = await resVer.json();
    const serverVer = dataVer.version;

    if (!localOperationalVersion) {
      localOperationalVersion = serverVer;
      return;
    }

    // Nếu version máy chủ lớn hơn version máy khách -> Đã có người dùng khác vừa cập nhật
    if (serverVer > localOperationalVersion) {
      const resUpd = await fetch("/api/orders/operational-updates");
      if (!resUpd.ok) return;
      const dataUpd = await resUpd.json();
      const updates = dataUpd.updates || {};

      if (Object.keys(updates).length > 0) {
        applyOperationalUpdatesToUI(updates);
      } else {
        // Nếu phiên bản tăng do đăng tải file mới, xóa file hoặc lọc trùng
        const activeTag = document.activeElement ? document.activeElement.tagName : "";
        if (activeTag !== "INPUT" && activeTag !== "SELECT" && activeTag !== "TEXTAREA") {
          await loadDataset();
        }
      }
      localOperationalVersion = serverVer;
    }
  } catch (err) {
    // Không làm phiền người dùng nếu mạng chập chờn
  } finally {
    isSyncingOperational = false;
  }
}

function applyOperationalUpdatesToUI(updates) {
  if (!updates || Object.keys(updates).length === 0) return;

  let hasChanged = false;
  const tbody = document.getElementById("tbodyFullData") || document.getElementById("tbodyMainOrders");

  Object.entries(updates).forEach(([rowKey, item]) => {
    // Tìm tất cả bản ghi tương ứng trong mảng allRecords
    const matched = allRecords.filter(r => (r.rowKey === rowKey || getRowKey(r) === rowKey));
    matched.forEach(rec => {
      const newStatus = item.trangThaiXuLy !== undefined ? item.trangThaiXuLy : rec.trangThaiXuLy;
      const newExp = item.giaiTrinh !== undefined ? item.giaiTrinh : rec.giaiTrinh;
      const hasExpDetail = item.giaiTrinhChiTiet !== undefined;
      const newExpDetail = hasExpDetail ? (item.giaiTrinhChiTiet !== null && String(item.giaiTrinhChiTiet).trim() !== "" ? String(item.giaiTrinhChiTiet).trim() : null) : rec.giaiTrinhChiTiet;
      const newPending = item.isPending !== undefined ? Boolean(item.isPending) : rec.isPending;

      let changedThisRec = false;
      if (item.trangThaiXuLy !== undefined && rec.trangThaiXuLy !== newStatus) {
        rec.trangThaiXuLy = newStatus;
        changedThisRec = true;
      }
      if (item.giaiTrinh !== undefined && rec.giaiTrinh !== newExp) {
        rec.giaiTrinh = newExp;
        changedThisRec = true;
      }
      if (hasExpDetail && rec.giaiTrinhChiTiet !== newExpDetail) {
        rec.giaiTrinhChiTiet = newExpDetail;
        changedThisRec = true;
      }
      if (item.isPending !== undefined && rec.isPending !== newPending) {
        rec.isPending = newPending;
        changedThisRec = true;
      }

      if (changedThisRec) {
        hasChanged = true;

        // Cập nhật trực tiếp lên dòng DOM nếu đang hiển thị trên trang hiện tại
        if (tbody) {
          const escapedKey = CSS.escape ? CSS.escape(rowKey) : rowKey;
          const tr = tbody.querySelector(`tr[data-rowkey="${escapedKey}"]`);
          if (tr) {
            // 1. Cập nhật ô Dropdown CSKH
            if (item.trangThaiXuLy !== undefined) {
              const selectElem = tr.querySelector(".status-badge-select, .select-status");
              if (selectElem && document.activeElement !== selectElem) {
                const isUnpaid = isUnpaidOrder(rec) || Boolean(rec.isAutoCancelledBy3h);
                const normStatus = normalizeCskhStatus(newStatus, isUnpaid) || newStatus || "";
                if (selectElem.value !== normStatus) {
                  if (normStatus && !Array.from(selectElem.options).some(o => o.value === normStatus)) {
                    const optElem = document.createElement("option");
                    optElem.value = normStatus;
                    optElem.textContent = normStatus;
                    selectElem.appendChild(optElem);
                  }
                  selectElem.value = normStatus;
                  selectElem.setAttribute("data-status", normStatus);
                  selectElem.setAttribute("data-status-order", getCskhStatusOrder(normStatus));
                }
              }
            }

            // 2. Cập nhật ô Giải Trình (Nhóm lý do)
            if (item.giaiTrinh !== undefined) {
              const selGrp = tr.querySelector(".select-reason-group");
              if (selGrp && document.activeElement !== selGrp && selGrp.value !== newExp) {
                selGrp.value = newExp || "";
              }
            }

            // 3. Cập nhật ô Giải Trình Chi Tiết (chỉ cập nhật khi update có trường này và ô không đang được focus)
            if (hasExpDetail) {
              const inDetail = tr.querySelector(".input-reason-detail");
              if (inDetail && document.activeElement !== inDetail) {
                const curInVal = inDetail.value.trim() === "" ? null : inDetail.value.trim();
                if (curInVal !== newExpDetail) {
                  inDetail.value = newExpDetail !== null ? newExpDetail : "";
                }
              }
            }

            // 3. Cập nhật ô Đếm Ngược Hạn 3h (Dừng tính giờ ngay lập tức nếu đã xử lý)
            const cdCell = tr.querySelector(".cell-countdown-3h");
            if (cdCell) {
              const isUnpaid = isUnpaidOrder(rec) || Boolean(rec.isAutoCancelledBy3h);
              const isCancelled = isCancelledOrder(rec);
              cdCell.innerHTML = renderCountdownCell(rec.ngayDuocDuyet, isUnpaid, rec.trangThaiXuLy, isCancelled);
            }
          }
        }
      }
    });
  });

  if (hasChanged) {
    updateTabCounts();
  }
}

// Kiểm tra trạng thái liên kết Turso Cloud SQLite
async function checkTursoStatus() {
  if (!tursoStatusBadge) return;
  try {
    const res = await fetch("/api/turso/status");
    const data = await res.json();
    if (data.status === "success" && data.connected) {
      tursoStatusBadge.style.background = "#ecfdf5";
      tursoStatusBadge.style.color = "#047857";
      tursoStatusBadge.style.borderColor = "#a7f3d0";
      tursoStatusBadge.innerHTML = `CSDL Turso: Đã kết nối (${data.tursoRowCount ?? data.localTotalCount ?? 0} dòng)`;
      tursoStatusBadge.title = `Host: Turso Cloud SQLite (libSQL)\nPhiên bản: ${data.version || "3.47"}\nĐã lưu: ${data.tursoRowCount || 0} dòng\nNhấp để đồng bộ lại`;
    } else {
      tursoStatusBadge.style.background = "#fffbeb";
      tursoStatusBadge.style.color = "#b45309";
      tursoStatusBadge.style.borderColor = "#fde68a";
      tursoStatusBadge.innerHTML = `CSDL Turso: Chưa kết nối`;
      tursoStatusBadge.title = data.error || "Không thể kết nối đến Turso Cloud";
    }
  } catch (e) {
    tursoStatusBadge.textContent = "CSDL Turso: Ngoại tuyến";
  }
}

// Đồng bộ thủ công lên Turso Cloud
async function triggerTursoSync() {
  if (!tursoStatusBadge && !btnSyncTurso) return;
  const targetElem = btnSyncTurso || tursoStatusBadge;
  const originalText = targetElem.textContent;
  targetElem.textContent = "Đang đồng bộ Turso...";
  try {
    const res = await fetch("/api/turso/sync", { method: "POST" });
    const data = await res.json();
    if (res.ok && data.status === "success") {
      showAlert(data.message, false);
      checkTursoStatus();
    } else {
      throw new Error(data.message || "Lỗi khi đồng bộ.");
    }
  } catch (err) {
    showAlert(`Lỗi khi đồng bộ lên Turso: ${err.message}`, true);
  } finally {
    targetElem.textContent = originalText;
    checkTursoStatus();
  }
}

// Chuyển đổi tab hiển thị
function switchTab(tabName, updateUrl = true) {
  currentTab = tabName;
  if (tabAllOrders && tabUnpaidOrders) {
    tabAllOrders.classList.remove("active");
    tabUnpaidOrders.classList.remove("active");
    if (tabCancelledOrders) tabCancelledOrders.classList.remove("active");
    if (tabPendingOrders) tabPendingOrders.classList.remove("active");
    if (navDataTable) navDataTable.classList.remove("active");
    if (navUnpaid) navUnpaid.classList.remove("active");
    if (navCancelled) navCancelled.classList.remove("active");

    if (currentTab === "cancelled") {
      if (tabCancelledOrders) tabCancelledOrders.classList.add("active");
      if (navCancelled) navCancelled.classList.add("active");

      // Đồng bộ bộ lọc trạng thái: chọn các trạng thái Đã Hủy
      const cancelledValues = allStatusValues.filter(isCancelledStatus);
      if (cancelledValues.length > 0 && statusOptionsList) {
        const checkboxes = statusOptionsList.querySelectorAll(".status-cb");
        checkboxes.forEach(cb => {
          cb.checked = isCancelledStatus(cb.value);
        });
        selectedStatuses = [...cancelledValues];
        updateStatusButtonLabel();
      }
      stopVietnamClock();
      if (btnUpdateData) btnUpdateData.style.display = "inline-block";
      if (btnDeduplicateData) btnDeduplicateData.style.display = "inline-block";

    } else if (currentTab === "pending") {
      if (tabPendingOrders) tabPendingOrders.classList.add("active");

      // Đồng bộ bộ lọc trạng thái: khôi phục tất cả (pending tự lọc theo pendingRows)
      if (statusOptionsList && allStatusValues.length > 0) {
        const checkboxes = statusOptionsList.querySelectorAll(".status-cb");
        checkboxes.forEach(cb => { cb.checked = true; });
        selectedStatuses = [...allStatusValues];
        updateStatusButtonLabel();
      }
      stopVietnamClock();
      if (btnUpdateData) btnUpdateData.style.display = "inline-block";
      if (btnDeduplicateData) btnDeduplicateData.style.display = "inline-block";

    } else if (currentTab === "unpaid") {
      tabUnpaidOrders.classList.add("active");
      if (navUnpaid) navUnpaid.classList.add("active");

      // Đồng bộ bộ lọc trạng thái: chọn các trạng thái Chưa thanh toán
      const unpaidValues = allStatusValues.filter(isUnpaidStatus);
      if (unpaidValues.length > 0 && statusOptionsList) {
        const checkboxes = statusOptionsList.querySelectorAll(".status-cb");
        checkboxes.forEach(cb => {
          cb.checked = isUnpaidStatus(cb.value);
        });
        selectedStatuses = [...unpaidValues];
        updateStatusButtonLabel();
      }
      // Bật đồng hồ thời gian thực giờ Việt Nam (hh:mm:ss)
      startVietnamClock();

      // Giữ nút Cập Nhật Dữ Liệu hiển thị trên tab Chưa thanh toán để tiện đối soát
      if (btnUpdateData) btnUpdateData.style.display = "inline-block";
      if (btnDeduplicateData) btnDeduplicateData.style.display = "none";
    } else {
      tabAllOrders.classList.add("active");
      if (navDataTable) navDataTable.classList.add("active");

      // Khôi phục tất cả trạng thái khi quay lại tab Tất Cả
      if (statusOptionsList && allStatusValues.length > 0) {
        const checkboxes = statusOptionsList.querySelectorAll(".status-cb");
        checkboxes.forEach(cb => {
          cb.checked = true;
        });
        selectedStatuses = [...allStatusValues];
        updateStatusButtonLabel();
      }
      // Tắt đồng hồ khi rời tab Chưa thanh toán
      stopVietnamClock();

      // Hiện nút Cập Nhật Dữ Liệu & Lọc Đơn Trùng khi ở tab Tất Cả Đơn Hàng
      if (btnUpdateData) btnUpdateData.style.display = "inline-block";
      if (btnDeduplicateData) btnDeduplicateData.style.display = "inline-block";
    }
  }

  if (updateUrl) {
    const url = new URL(window.location);
    if (currentTab === "unpaid") {
      url.searchParams.set("tab", "unpaid");
    } else if (currentTab === "cancelled") {
      url.searchParams.set("tab", "cancelled");
    } else if (currentTab === "pending") {
      url.searchParams.set("tab", "pending");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState({}, "", url);
  }

  // Cập nhật các tùy chọn của bộ lọc Trạng Thái CSKH theo tab tương ứng
  updateFilterContactStatusDropdown(currentTab);

  // Cập nhật ẩn/hiện cột header Chuyển Chờ (chỉ hiện ở tab Đơn Hủy)
  updatePendingColumnHeader();

  applyFilters();
}

// Hàm cập nhật đồng hồ thời gian thực chuẩn giờ Việt Nam (hh:mm:ss)
function updateVietnamClock() {
  if (!vnClockDisplay) return;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(new Date());

    const partMap = {};
    parts.forEach(p => { partMap[p.type] = p.value; });
    const hh = partMap.hour === "24" ? "00" : (partMap.hour || "00");
    const mm = partMap.minute || "00";
    const ss = partMap.second || "00";

    vnClockDisplay.textContent = `${hh}:${mm}:${ss}`;
  } catch (e) {
    // Dự phòng tính theo độ lệch GMT+7 nếu Intl timeZone không khả dụng
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vnDate = new Date(utc + (3600000 * 7));
    const hh = String(vnDate.getHours()).padStart(2, "0");
    const mm = String(vnDate.getMinutes()).padStart(2, "0");
    const ss = String(vnDate.getSeconds()).padStart(2, "0");
    vnClockDisplay.textContent = `${hh}:${mm}:${ss}`;
  }
}

// Bật đồng hồ chạy liên tục mỗi 1 giây
function startVietnamClock() {
  updateVietnamClock();
  if (!vnClockInterval) {
    vnClockInterval = setInterval(updateVietnamClock, 1000);
  }
  if (vnClockWidget) {
    vnClockWidget.style.display = "inline-flex";
  }
}

// Dừng đồng hồ
function stopVietnamClock() {
  if (vnClockInterval) {
    clearInterval(vnClockInterval);
    vnClockInterval = null;
  }
  if (vnClockWidget) {
    vnClockWidget.style.display = "none";
  }
}

// Cập nhật số lượng hiển thị trên các thẻ tab (Tối ưu không tạo mảng tạm)
function updateTabCounts() {
  const totalCount = allRecords.length;
  let unpaidCount = 0;
  let cancelledCount = 0;
  for (let i = 0; i < allRecords.length; i++) {
    const r = allRecords[i];
    if (isUnpaidOrder(r)) unpaidCount++;
    if (isCancelledOrder(r)) cancelledCount++;
  }
  if (tabCountAll) tabCountAll.textContent = totalCount.toLocaleString();
  if (tabCountUnpaid) tabCountUnpaid.textContent = unpaidCount.toLocaleString();
  if (tabCountCancelled) tabCountCancelled.textContent = cancelledCount.toLocaleString();
  if (tabCountPending) tabCountPending.textContent = pendingRows.length.toLocaleString();
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

// Nạp dữ liệu
async function loadDataset(forceRefresh = false) {
  clearAlert();
  if (forceRefresh) {
    try { sessionStorage.removeItem("rebooking_analytics_cache_v2"); } catch (e) {}
  }
  const urlParams = new URLSearchParams(window.location.search);
  const uploadId = urlParams.get("id");
  if (uploadId && uploadId !== "all") {
    const navDashboard = document.getElementById("navDashboard");
    if (navDashboard) navDashboard.href = `index.html?id=${encodeURIComponent(uploadId)}`;
    if (navDataTable) navDataTable.href = `data-table.html?id=${encodeURIComponent(uploadId)}`;
    if (navUnpaid) navUnpaid.href = `data-table.html?id=${encodeURIComponent(uploadId)}&tab=unpaid`;
    if (navCancelled) navCancelled.href = `data-table.html?id=${encodeURIComponent(uploadId)}&tab=cancelled`;
  } else {
    const navDashboard = document.getElementById("navDashboard");
    if (navDashboard) navDashboard.href = `index.html`;
    if (navDataTable) navDataTable.href = `data-table.html`;
    if (navUnpaid) navUnpaid.href = `data-table.html?tab=unpaid`;
    if (navCancelled) navCancelled.href = `data-table.html?tab=cancelled`;
  }

  try {
    let dataset = null;

    if (uploadId && uploadId !== "all") {
      currentDatasetName.textContent = `Đang tải đợt ${uploadId}...`;
      const histUrl = forceRefresh ? `/api/history/${uploadId}?_t=${Date.now()}` : `/api/history/${uploadId}`;
      const res = await fetch(histUrl, { cache: forceRefresh ? "no-store" : "default" });
      const result = await res.json();
      if (!res.ok || result.status !== "success") {
        throw new Error(result.message || "Không thể tải đợt này.");
      }
      currentDatasetName.textContent = `${result.fileName} (${result.uploadedAt})`;
      dataset = result.data;
      allRecords = dataset.records;
    } else {
      // Mặc định: Nạp toàn bộ dữ liệu tích lũy từ CSDL SQL (Tất cả file đã tải)
      currentDatasetName.textContent = "Đang nạp toàn bộ CSDL SQL...";
      const allDataUrl = forceRefresh ? `/api/all-data?refresh=1&_t=${Date.now()}` : "/api/all-data";
      const resAll = await fetch(allDataUrl, { cache: forceRefresh ? "no-store" : "default" });
      const resultAll = await resAll.json();

      if (resAll.ok && resultAll.status === "success" && resultAll.totalRecords > 0) {
        currentDatasetName.innerHTML = `<strong>Toàn bộ CSDL SQL</strong> <span style="font-size: 12px; font-weight: normal; color: var(--text-muted);">(${resultAll.totalRecords} đơn tích lũy từ ${resultAll.stats?.fileCount || 1} file đã tải)</span>`;
        dataset = resultAll.data;
        allRecords = resultAll.records || dataset.records;
      } else {
        // Fallback nạp mẫu
        const resSample = await fetch("/api/sample");
        const resultSample = await resSample.json();
        if (resSample.ok && resultSample.status === "success") {
          currentDatasetName.textContent = `Dữ liệu mẫu 67 đơn hủy`;
          dataset = resultSample.data;
          allRecords = dataset.records;
        }
      }
    }

    currentDatasetId = uploadId || "sql_all";
    
    // Nạp trạng thái và giải trình: Ưu tiên tuyệt đối dữ liệu từ CSDL Máy Chủ, localStorage chỉ dùng làm fallback
    const savedNotes = getSavedNotes();
    const pendingSet = new Set(pendingRows);
    for (let i = 0; i < allRecords.length; i++) {
      const r = allRecords[i];
      const k1 = getRowKey(r);
      const k2 = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
      const note = savedNotes[k1] || (k2 ? savedNotes[k2] : null) || {};
      let st = (r.trangThaiXuLy !== undefined && r.trangThaiXuLy !== null) ? r.trangThaiXuLy : (note.status || "");
      r.trangThaiXuLy = normalizeCskhStatus(st, isUnpaidOrder(r));
      r.giaiTrinh = (r.giaiTrinh !== undefined && r.giaiTrinh !== null) ? r.giaiTrinh : (note.giaiTrinh || "");
      r.giaiTrinhChiTiet = (r.giaiTrinhChiTiet !== undefined && r.giaiTrinhChiTiet !== null && r.giaiTrinhChiTiet !== "")
        ? r.giaiTrinhChiTiet
        : ((note.giaiTrinhChiTiet !== undefined && note.giaiTrinhChiTiet !== null && note.giaiTrinhChiTiet !== "") ? note.giaiTrinhChiTiet : null);

      const rid = r.id || r._rowId || r.soEir || r.soContainer;
      if (r.isPending && rid && !pendingSet.has(rid)) {
        pendingSet.add(rid);
        pendingRows.push(rid);
      }
    }

    // Cập nhật các đơn Chưa thanh toán quá 3h thành Đã hủy
    applyExpired3hCancellation(allRecords);
    sessionStorage.setItem("gpg_pending_rows", JSON.stringify(pendingRows));

    populateFilterDropdowns(allRecords);
    updateTabCounts();
    loadHiddenColumns();
    const initUrlParams = new URLSearchParams(window.location.search);
    let initialTab = "all";
    if (initUrlParams.get("tab") === "unpaid") initialTab = "unpaid";
    else if (initUrlParams.get("tab") === "cancelled") initialTab = "cancelled";
    else if (initUrlParams.get("tab") === "pending") initialTab = "pending";
    switchTab(initialTab, false);
  } catch (err) {
    showAlert(err.message || "Lỗi khi nạp dữ liệu.");
    tbodyFullData.innerHTML = `<tr><td colspan="23" class="text-center py-4 text-danger">${err.message}</td></tr>`;
  }
}
const loadTableData = loadDataset;

// Điền các option cho bộ lọc
function populateFilterDropdowns(records) {
  const baseDepots = new Set(window.SYSTEM_DEPOTS_LIST || SYSTEM_DEPOTS_FALLBACK);
  const linesSet = new Set();
  const statusesSet = new Set();

  if (Array.isArray(records)) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r) {
        if (r.depot) baseDepots.add(String(r.depot).trim().toUpperCase());
        if (r.hangTau) linesSet.add(r.hangTau);
        if (r.trangThaiDonHang) {
          const norm = normalizeStr(r.trangThaiDonHang);
          if (norm) statusesSet.add(norm);
        }
      }
    }
  }

  let depots = Array.from(baseDepots).filter(Boolean).sort();
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
        depots = depots.filter(d => allowed.has(String(d).trim().toUpperCase()));
      }
    }
  } catch (e) {}

  initDepotMultiSelect(depots);

  const lines = Array.from(linesSet).filter(Boolean).sort();
  filterLine.innerHTML = `<option value="">Hãng tàu</option>`;
  lines.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = `Hãng ${l}`;
    filterLine.appendChild(opt);
  });

  // Quét toàn bộ dữ liệu cột Trạng Thái Đơn: có bao nhiêu trạng thái thì thêm bấy nhiêu vào bộ lọc đa chọn
  const statuses = Array.from(statusesSet).filter(Boolean).sort();
  initStatusMultiSelect(statuses);
}

// Áp dụng bộ lọc
function applyFilters() {
  const search = searchInput.value.toLowerCase().trim();
  const lineVal = filterLine.value;
  const dirVal = filterDirection.value;
  const hourVal = filterApprovedHour ? filterApprovedHour.value : "";
  const warning3hVal = filterWarning3h ? filterWarning3h.value : "";
  const contactStatusVal = filterContactStatus ? filterContactStatus.value : "";
  const dateTypeVal = filterDateType ? filterDateType.value : "ngayHuy";
  const dateFromVal = filterDateFrom ? filterDateFrom.value : "";
  const dateToVal = filterDateTo ? filterDateTo.value : "";
  const hourFromVal = filterHourFrom ? filterHourFrom.value : "";
  const hourToVal = filterHourTo ? filterHourTo.value : "";

  // Cập nhật trạng thái hiển thị của nút xóa ngày và highlight viền
  if (btnClearDateFilter) {
    btnClearDateFilter.style.display = (dateFromVal || dateToVal || hourFromVal || hourToVal) ? "inline-flex" : "none";
  }
  if (tableDateFilterGroup) {
    if (dateFromVal || dateToVal || hourFromVal || hourToVal) {
      tableDateFilterGroup.classList.add("has-selection");
    } else {
      tableDateFilterGroup.classList.remove("has-selection");
    }
  }

  filteredRecords = allRecords.filter(r => {
    // 0. Phân loại theo Tab (Tất Cả Đơn, Chỉ Đơn Chưa Thanh Toán, Chỉ Đơn Hủy, hoặc Chờ Xử Lý)
    if (currentTab === "unpaid") {
      if (!isUnpaidOrder(r)) return false;
    } else if (currentTab === "cancelled") {
      if (!isCancelledOrder(r)) return false;
    } else if (currentTab === "pending") {
      // Chỉ hiển thị các đơn đã được chuyển vào pending
      const rid = r.id || r._rowId || r.soEir || r.soContainer;
      if (!pendingRows.includes(rid)) return false;
    }

    // 0.1. Lọc theo Khoảng Ngày & Giờ (Ngày Hủy Đơn hoặc Ngày Được Duyệt)
    if (dateFromVal || dateToVal || hourFromVal || hourToVal) {
      const rawDate = dateTypeVal === "ngayDuyet" ? r.ngayDuocDuyet : r.ngayHuyDon;
      const recDateTime = extractDateTime(rawDate);
      if (!recDateTime) return false;

      if (dateFromVal || dateToVal) {
        if (dateFromVal) {
          const normHFrom = normalizeHour(hourFromVal, "00:00");
          const fromTime = `${normHFrom}:00`;
          const fromDateTime = `${dateFromVal} ${fromTime}`;
          if (recDateTime < fromDateTime) return false;
        }
        if (dateToVal) {
          let toTime = "23:59:59";
          if (hourToVal) {
            const normHTo = normalizeHour(hourToVal, "23:59");
            const normHFrom = normalizeHour(hourFromVal, "00:00");
            if (hourToVal === "24:00") {
              toTime = "23:59:59";
            } else if (hourFromVal && normHTo === normHFrom) {
              toTime = `${normHTo.substring(0, 2)}:59:59`;
            } else {
              toTime = `${normHTo}:59`;
            }
          }
          const toDateTime = `${dateToVal} ${toTime}`;
          if (recDateTime > toDateTime) return false;
        }
      } else {
        // Chỉ chọn giờ mà không chọn ngày
        const recTime = recDateTime.substring(11, 19);
        if (hourFromVal) {
          const normHFrom = normalizeHour(hourFromVal, "00:00");
          const fromTime = `${normHFrom}:00`;
          if (recTime < fromTime) return false;
        }
        if (hourToVal) {
          let toTime = "23:59:59";
          const normHTo = normalizeHour(hourToVal, "23:59");
          const normHFrom = normalizeHour(hourFromVal, "00:00");
          if (hourToVal === "24:00") {
            toTime = "23:59:59";
          } else if (hourFromVal && normHTo === normHFrom) {
            toTime = `${normHTo.substring(0, 2)}:59:59`;
          } else {
            toTime = `${normHTo}:59`;
          }
          if (recTime > toTime) return false;
        }
      }
    }

    // 1. Text search (bao gồm số cont, số eir, booking, tài xế, nhà xe, lý do, trạng thái xử lý, giải trình)
    if (search) {
      const contEir = parseContainerAndEir(r.soContainer);
      const matchSearch =
        (r.soContainer && r.soContainer.toLowerCase().includes(search)) ||
        (contEir.soContainer && contEir.soContainer !== "-" && contEir.soContainer.toLowerCase().includes(search)) ||
        (contEir.soEir && contEir.soEir !== "-" && contEir.soEir.toLowerCase().includes(search)) ||
        (r.soBooking && r.soBooking.toLowerCase().includes(search)) ||
        (r.tenTaiXe && r.tenTaiXe.toLowerCase().includes(search)) ||
        (r.tenNhaXe && r.tenNhaXe.toLowerCase().includes(search)) ||
        (r.lyDoHuy && r.lyDoHuy.toLowerCase().includes(search)) ||
        (r.lyDoTuChoi && r.lyDoTuChoi.toLowerCase().includes(search)) ||
        (r.trangThaiXuLy && r.trangThaiXuLy.toLowerCase().includes(search)) ||
        (r.giaiTrinh && r.giaiTrinh.toLowerCase().includes(search));
      if (!matchSearch) return false;
    }

    // 2. Lọc theo nhiều Depot (Multi-select)
    if (allDepotValues.length > 0) {
      if (selectedDepots.length === 0) return false; // Không chọn depot nào
      if (selectedDepots.length < allDepotValues.length) {
        if (!selectedDepots.includes(r.depot)) return false;
      }
    }

    // 3. Dropdowns lọc hệ thống
    if (lineVal && normalizeStr(r.hangTau).toLowerCase() !== normalizeStr(lineVal).toLowerCase()) return false;
    if (dirVal && normalizeStr(r.loaiDonHang).toUpperCase() !== normalizeStr(dirVal).toUpperCase()) return false;

    // 4. Lọc theo nhiều Trạng Thái Đơn (Multi-select)
    if (allStatusValues.length > 0) {
      if (selectedStatuses.length === 0) return false; // Không chọn trạng thái nào
      if (selectedStatuses.length < allStatusValues.length) {
        const itemStatus = normalizeStr(r.trangThaiDonHang).toLowerCase();
        const hasMatch = selectedStatuses.some(s => normalizeStr(s).toLowerCase() === itemStatus);
        if (!hasMatch) return false;
      }
    }

    // 5. Lọc theo Khung Giờ của cột Ngày Được Duyệt (00:00 -> 24:00)
    if (hourVal !== "") {
      const targetHour = parseInt(hourVal, 10);
      const itemHour = extractHour(r.ngayDuocDuyet);
      if (itemHour !== targetHour) return false;
    }

    // 6. Dropdown lọc Cảnh Báo Đếm Ngược 3 Giờ (Safe, Yellow, Red, Expired, Processed)
    if (warning3hVal) {
      const level = getWarning3hLevel(r.ngayDuocDuyet, isUnpaidOrder(r) || r.isAutoCancelledBy3h, r.trangThaiXuLy, isCancelledOrder(r), r.soContainer);
      if (level !== warning3hVal) return false;
    }

    // 7. Dropdown lọc Trạng Thái Xử Lý / CSKH
    if (contactStatusVal) {
      if (contactStatusVal === "__EMPTY__") {
        if (r.trangThaiXuLy) return false;
      } else {
        const normR = normalizeCskhStatus(r.trangThaiXuLy, isUnpaidOrder(r));
        const normFilter = normalizeCskhStatus(contactStatusVal, isUnpaidOrder(r));
        if (normR !== normFilter) return false;
      }
    }

    return true;
  });

  currentPage = 1; // Luôn quay về trang 1 khi áp dụng bộ lọc mới
  renderTable(filteredRecords);
}

function resetFilters() {
  searchInput.value = "";

  // Đặt lại chọn tất cả Depot
  selectedDepots = [...allDepotValues];
  if (depotOptionsList) {
    const checkboxes = depotOptionsList.querySelectorAll(".depot-cb");
    checkboxes.forEach(cb => { cb.checked = true; });
  }
  updateDepotButtonLabel();

  // Đặt lại chọn tất cả Trạng Thái
  selectedStatuses = [...allStatusValues];
  if (statusOptionsList) {
    const checkboxes = statusOptionsList.querySelectorAll(".status-cb");
    checkboxes.forEach(cb => { cb.checked = true; });
  }
  updateStatusButtonLabel();

  filterLine.value = "";
  filterDirection.value = "";
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
  if (tableDateFilterGroup) tableDateFilterGroup.classList.remove("has-selection");

  currentPage = 1;
  applyFilters();
}

// Tải lại dữ liệu Bảng Chi Tiết mới nhất từ hệ thống mà không làm mất các điều kiện lọc hiện tại
async function reloadTableDataPreservingFilters() {
  if (btnReloadData) {
    btnReloadData.classList.add("btn-reloading");
    btnReloadData.disabled = true;
  }

  // 1. Lưu snapshot toàn bộ trạng thái bộ lọc và tab hiện tại
  const savedSnapshot = {
    currentTab: currentTab,
    selectedDepots: [...selectedDepots],
    selectedStatuses: [...selectedStatuses],
    line: filterLine ? filterLine.value : "",
    direction: filterDirection ? filterDirection.value : "",
    approvedHour: filterApprovedHour ? filterApprovedHour.value : "",
    warning3h: filterWarning3h ? filterWarning3h.value : "",
    contactStatus: filterContactStatus ? filterContactStatus.value : "",
    dateType: filterDateType ? filterDateType.value : "ngayHuy",
    dateFrom: filterDateFrom ? filterDateFrom.value : "",
    dateTo: filterDateTo ? filterDateTo.value : "",
    hourFrom: filterHourFrom ? filterHourFrom.value : "",
    hourTo: filterHourTo ? filterHourTo.value : "",
    search: searchInput ? searchInput.value : ""
  };

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const uploadId = urlParams.get("id");
    let dataset = null;

    if (uploadId && uploadId !== "all") {
      const res = await fetch(`/api/history/${encodeURIComponent(uploadId)}?refresh=1&_t=${Date.now()}`);
      const result = await res.json();
      if (!res.ok || result.status !== "success") {
        throw new Error(result.message || "Không thể tải đợt này.");
      }
      dataset = result.data;
      allRecords = dataset.records || [];
    } else {
      const resAll = await fetch(`/api/all-data?refresh=1&_t=${Date.now()}`);
      const resultAll = await resAll.json();
      if (resAll.ok && resultAll.status === "success" && resultAll.totalRecords > 0) {
        dataset = resultAll.data;
        allRecords = resultAll.records || (dataset && dataset.records) || [];
      } else {
        const resSample = await fetch("/api/sample");
        const resultSample = await resSample.json();
        if (resSample.ok && resultSample.status === "success") {
          dataset = resultSample.data;
          allRecords = dataset.records || [];
        }
      }
    }

    currentDatasetId = uploadId || "sql_all";

    // Nạp trạng thái và giải trình
    const savedNotes = getSavedNotes();
    allRecords.forEach(r => {
      const k1 = getRowKey(r);
      const k2 = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
      const note = savedNotes[k1] || (k2 ? savedNotes[k2] : null) || {};
      let st = (r.trangThaiXuLy !== undefined && r.trangThaiXuLy !== null) ? r.trangThaiXuLy : (note.status || "");
      r.trangThaiXuLy = normalizeCskhStatus(st, isUnpaidOrder(r));
      r.giaiTrinh = (r.giaiTrinh !== undefined && r.giaiTrinh !== null) ? r.giaiTrinh : (note.giaiTrinh || "");
      r.giaiTrinhChiTiet = (r.giaiTrinhChiTiet !== undefined && r.giaiTrinhChiTiet !== null && r.giaiTrinhChiTiet !== "")
        ? r.giaiTrinhChiTiet
        : ((note.giaiTrinhChiTiet !== undefined && note.giaiTrinhChiTiet !== null && note.giaiTrinhChiTiet !== "") ? note.giaiTrinhChiTiet : null);
    });

    // Cập nhật các đơn Chưa thanh toán quá 3h thành Đã hủy
    applyExpired3hCancellation(allRecords);

    // Đồng bộ danh sách đơn Chờ Xử Lý (Pending) từ CSDL
    allRecords.forEach(r => {
      const rid = r.id || r._rowId || r.soEir || r.soContainer;
      if (r.isPending && rid && !pendingRows.includes(rid)) {
        pendingRows.push(rid);
      }
    });
    sessionStorage.setItem("gpg_pending_rows", JSON.stringify(pendingRows));

    // Nạp lại danh mục dropdowns
    populateFilterDropdowns(allRecords);

    // 2. Khôi phục chính xác các điều kiện lọc từ snapshot
    if (savedSnapshot.selectedDepots && savedSnapshot.selectedDepots.length > 0) {
      selectedDepots = allDepotValues.filter(d => savedSnapshot.selectedDepots.includes(d));
      if (depotOptionsList) {
        const checkboxes = depotOptionsList.querySelectorAll(".depot-cb");
        checkboxes.forEach(cb => { cb.checked = selectedDepots.includes(cb.value); });
      }
      updateDepotButtonLabel();
    }

    if (savedSnapshot.selectedStatuses && savedSnapshot.selectedStatuses.length > 0) {
      selectedStatuses = allStatusValues.filter(s => savedSnapshot.selectedStatuses.includes(s));
      if (statusOptionsList) {
        const checkboxes = statusOptionsList.querySelectorAll(".status-cb");
        checkboxes.forEach(cb => { cb.checked = selectedStatuses.includes(cb.value); });
      }
      updateStatusButtonLabel();
    }

    if (filterLine) filterLine.value = savedSnapshot.line;
    if (filterDirection) filterDirection.value = savedSnapshot.direction;
    if (filterApprovedHour) filterApprovedHour.value = savedSnapshot.approvedHour;
    if (filterWarning3h) filterWarning3h.value = savedSnapshot.warning3h;
    if (filterContactStatus) filterContactStatus.value = savedSnapshot.contactStatus;
    if (filterDateType) filterDateType.value = savedSnapshot.dateType;
    if (filterDateFrom) filterDateFrom.value = savedSnapshot.dateFrom;
    if (filterDateTo) filterDateTo.value = savedSnapshot.dateTo;
    if (filterHourFrom) filterHourFrom.value = savedSnapshot.hourFrom;
    if (filterHourTo) filterHourTo.value = savedSnapshot.hourTo;
    if (searchInput) searchInput.value = savedSnapshot.search;

    updateTabCounts();
    switchTab(savedSnapshot.currentTab || "all", false);
  } catch (err) {
    console.error("Lỗi reloadTableDataPreservingFilters:", err);
    showAlert(err.message || "Lỗi khi tải lại dữ liệu bảng.");
  } finally {
    if (btnReloadData) {
      setTimeout(() => {
        btnReloadData.classList.remove("btn-reloading");
        btnReloadData.disabled = false;
      }, 350);
    }
  }
}

// Render dữ liệu bảng kết hợp phân trang máy chủ (Tối đa 200 dòng/trang)
function renderTable(records) {
  const filterSummaryBadge = document.getElementById("filterSummaryBadge");
  if (filterSummaryBadge) {
    filterSummaryBadge.textContent = `${records ? records.length : 0} bản ghi`;
  }

  const total = records ? records.length : 0;
  const totalPages = Math.ceil(total / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pagedRecords = (records || []).slice(startIndex, endIndex);

  // Cập nhật thanh phân trang
  updatePaginationUI(total, totalPages, startIndex, endIndex);

  const unpaidCount = allRecords.filter(isUnpaidOrder).length;
  const cancelledCount = allRecords.filter(isCancelledOrder).length;
  if (currentTab === "unpaid") {
    totalRowsBadge.textContent = `Hiển thị: ${pagedRecords.length} / ${records.length} đơn chưa thanh toán (Tổng toàn bộ: ${allRecords.length})`;
    totalRowsBadge.className = "badge badge-unpaid";
    totalRowsBadge.style.fontSize = "13px";
    totalRowsBadge.style.padding = "6px 14px";
  } else if (currentTab === "cancelled") {
    totalRowsBadge.textContent = `Hiển thị: ${pagedRecords.length} / ${records.length} đơn hủy (Tổng toàn bộ: ${allRecords.length})`;
    totalRowsBadge.className = "badge badge-danger";
    totalRowsBadge.style.fontSize = "13px";
    totalRowsBadge.style.padding = "6px 14px";
  } else if (currentTab === "pending") {
    totalRowsBadge.textContent = `Hiển thị: ${pagedRecords.length} / ${records.length} đơn chờ xử lý (Tổng toàn bộ: ${allRecords.length})`;
    totalRowsBadge.className = "badge badge-warning";
    totalRowsBadge.style.fontSize = "13px";
    totalRowsBadge.style.padding = "6px 14px";
  } else {
    totalRowsBadge.textContent = `Hiển thị: ${pagedRecords.length} / ${records.length} đơn hàng (Tổng toàn bộ: ${allRecords.length})`;
    totalRowsBadge.className = "badge badge-info";
    totalRowsBadge.style.fontSize = "13px";
    totalRowsBadge.style.padding = "6px 14px";
  }

  const colSpanCount = (currentTab === "cancelled" || currentTab === "pending") ? 25 : 24;

  if (!pagedRecords || pagedRecords.length === 0) {
    tbodyFullData.innerHTML = `
      <tr>
        <td colspan="${colSpanCount}" class="text-center py-4 text-muted">
          Không tìm thấy đơn hàng nào phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  // Danh mục tùy chọn trạng thái xử lý CSKH theo từng tab:
  // - Tab Đơn chưa thanh toán: hiển thị các trạng thái 1, 3, 6, 8
  // - Tab Đơn hàng hủy: chỉ hiển thị các trạng thái 2, 5, 7 (đã ẩn trạng thái 4)
  // - Tab Tất cả đơn hàng: hiển thị tất cả các trạng thái (1 -> 8)
  const baseStatusOptions = getTabCskhStatusOptions(currentTab);

  tbodyFullData.innerHTML = pagedRecords.map((r, index) => {
    const rowStt = startIndex + index + 1;
    // Trạng thái đơn hàng gốc
    let statusClass = "badge-info";
    if (r.trangThaiDonHang === "Đã hủy") statusClass = "badge-danger";
    if (r.trangThaiDonHang === "Từ chối duyệt") statusClass = "badge-danger";
    if (r.trangThaiDonHang === "Đã hoàn tiền") statusClass = "badge-success";
    if (r.trangThaiDonHang === "Đang hoàn tiền") statusClass = "badge-warning";
    if (r.trangThaiDonHang === "Chưa thanh toán") statusClass = "badge-unpaid";
    if (r.trangThaiDonHang === "Xếp tài") statusClass = "badge-purple";
    if (
      r.trangThaiDonHang === "Thanh toán thành công" ||
      r.trangThaiDonHang === "Thành công" ||
      r.trangThaiDonHang === "Đã hoàn thành" ||
      (r.trangThaiDonHang && (r.trangThaiDonHang.toLowerCase().includes("thanh cong") || r.trangThaiDonHang.toLowerCase().includes("hoan thanh")))
    ) statusClass = "badge-success";

    // Trạng thái kích hoạt
    const isActivated = (r.trangThaiKichHoat || "").toLowerCase().includes("đã kích hoạt");
    const actBadge = isActivated
      ? `<span class="badge badge-danger">Đã kích hoạt</span>`
      : `<span class="badge" style="background: #f1f5f9; color: #64748b;">Chưa kích hoạt</span>`;

    // Chiều đơn
    const dirBadge = r.loaiDonHang === "OUT"
      ? `<span class="badge badge-info" style="font-weight: 700;">OUT</span>`
      : `<span class="badge badge-success" style="font-weight: 700;">IN</span>`;

    // Định danh dòng để lưu trạng thái & giải trình
    const rowKey = getRowKey(r);
    const isUnpaid = isUnpaidOrder(r) || Boolean(r.isAutoCancelledBy3h);
    const normStatus = normalizeCskhStatus(r.trangThaiXuLy, isUnpaid) || r.trangThaiXuLy || "";
    const currStatus = normStatus;
    const currExp = r.giaiTrinh || "";

    let rowOptions = [...baseStatusOptions];
    if (currStatus && !rowOptions.some(opt => opt.val === currStatus)) {
      let extraOpt = CSKH_STATUS_CONFIG.find(opt => opt.val === currStatus);
      if (!extraOpt) {
        extraOpt = {
          order: getCskhStatusOrder(currStatus),
          val: currStatus,
          label: currStatus,
          bg: "#dbeafe",
          color: "#1e40af"
        };
      }
      rowOptions.push(extraOpt);
      rowOptions.sort((a, b) => a.order - b.order);
    }

    const optionsHtml = rowOptions.map(opt => `
      <option value="${opt.val}" data-order="${opt.order}" ${currStatus === opt.val ? "selected" : ""} style="background: ${opt.bg}; color: ${opt.color}; font-weight: 600;">
        ${opt.label}
      </option>
    `).join("");

    const currentOrder = getCskhStatusOrder(currStatus);
    const statusSelectHtml = `
      <select class="status-badge-select" data-status="${currStatus}" data-status-order="${currentOrder}" data-rowkey="${rowKey}" onchange="onStatusSelectChange(this)" title="Chọn trạng thái xử lý / chăm sóc khách hàng">
        <option value="" data-order="0" ${!currStatus ? "selected" : ""} style="background: #ffffff; color: #94a3b8;">-- Chọn trạng thái --</option>
        ${optionsHtml}
      </select>
    `;

    const parsedExp = parseExplanationValue(currExp);
    const selectedGroup = parsedExp.group || currExp || "";
    const detailValue = (r.giaiTrinhChiTiet !== undefined && r.giaiTrinhChiTiet !== null)
      ? String(r.giaiTrinhChiTiet)
      : (parsedExp.detail || "");

    const expGroupSelectHtml = `
      <select class="select-reason-group" data-rowkey="${rowKey}" onchange="onReasonGroupChange(this)" title="Chọn nhóm lý do giải trình" style="width: 100%; min-width: 168px; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; background-color: #ffffff; cursor: pointer;">
        <option value="" ${!selectedGroup ? "selected" : ""}>-- Chọn nhóm lý do --</option>
        ${selectedGroup && !CANCELLATION_REASON_GROUPS.includes(selectedGroup) ? `
          <option value="${selectedGroup.replace(/"/g, '&quot;')}" selected>${selectedGroup}</option>
        ` : ""}
        ${CANCELLATION_REASON_GROUPS.map((grp, idx) => `
          <option value="${grp}" ${selectedGroup === grp ? "selected" : ""}>
            ${idx + 1}. ${grp}
          </option>
        `).join("")}
      </select>
    `;

    const expDetailInputHtml = `
      <input type="text" 
             class="input-reason-detail" 
             placeholder="Nhập chi tiết giải trình..." 
             value="${detailValue ? detailValue.replace(/"/g, '&quot;') : ""}" 
             data-rowkey="${rowKey}" 
             oninput="onReasonDetailInput(this)" 
             onblur="onReasonDetailBlur(this)" 
             title="Nhập chi tiết giải trình (Xóa trống để lưu null)"
             style="width: 100%; min-width: 208px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; background: #ffffff;">
    `;

    // Cột Đếm Ngược Hạn Hủy 3 Giờ
    const isUnpaidOrExpired = isUnpaidOrder(r) || r.isAutoCancelledBy3h;
    const isCancelled = isCancelledOrder(r);
    const countdownHtml = renderCountdownCell(r.ngayDuocDuyet, isUnpaidOrExpired, r.trangThaiXuLy, isCancelled, r.soContainer);

    // Tách số Container và số EIR (trước dấu '-' là EIR, sau dấu '-' là Container)
    const contEir = parseContainerAndEir(r.soContainer);
    const rId = r.id || r._rowId || r.soEir || r.soContainer || "";
    const isRowInPending = pendingRows.includes(rId);

    return `
      <tr data-rowkey="${rowKey}">
        <td class="text-center" style="font-weight: 600; color: var(--text-muted);">${rowStt}</td>
        <td><strong style="color: var(--blue-primary);">${r.depot}</strong></td>
        <td><strong>${r.hangTau}</strong></td>
        <td><code>${r.soBooking || "-"}</code></td>
        <td><code>${contEir.soEir}</code></td>
        <td><code>${contEir.soContainer}</code></td>
        <td class="text-center cell-countdown-3h" style="padding: 6px 8px;">${countdownHtml}</td>
        <td class="cell-order-status"><span class="badge ${statusClass}">${r.trangThaiDonHang}</span></td>
        <td style="font-size: 12.5px;">${formatDateDisplay(r.ngayHuyDon)}</td>
        <td style="font-size: 12.5px; color: var(--text-muted);">${formatDateDisplay(r.ngayDuocDuyet)}</td>
        <td>${actBadge}</td>
        <td style="font-size: 12.5px; color: var(--text-muted);">${formatDateDisplay(r.thoiGianKichHoat)}</td>
        <td style="max-width: 224px; white-space: normal; line-height: 1.4;">${r.lyDoHuy || "-"}</td>
        <td style="font-size: 13px;">${r.loaiContainer || "-"}</td>
        <td class="text-center">${dirBadge}</td>
        <td class="text-center"><strong>${r.sizeTeus || 0}</strong></td>
        <td>${r.tenTaiXe || "-"}</td>
        <td style="font-size: 12.5px; font-family: monospace;">${r.sdtTaiXe || "-"}</td>
        <td>${r.tenNhaXe || "-"}</td>
        <td style="font-size: 12.5px; font-family: monospace;">${r.sdtNhaXe || "-"}</td>
        <td style="max-width: 224px; white-space: normal; color: #000000; font-size: 13px; line-height: 1.4;">${r.lyDoTuChoi || "-"}</td>
        ${currentTab === "cancelled" ? `
          <td class="col-pending-action text-center" style="padding: 6px 8px; vertical-align: middle;">
            ${isRowInPending ? `
              <span class="badge" style="background: #ffedd5; color: #c2410c; font-size: 11px; padding: 4px 8px; border: 1px solid #fed7aa; display: inline-block;">Đã chuyển chờ</span>
            ` : `
              <button type="button" class="btn btn-warning btn-sm btn-row-move-pending" data-rowid="${encodeURIComponent(rId)}" data-rowkey="${rowKey}" style="background: #ea580c; color: #ffffff; border: none; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" title="Chuyển đơn này vào tab Chờ Xử Lý">
                Chuyển chờ
              </button>
            `}
          </td>
        ` : ""}
        <td class="text-center" style="padding: 6px 10px;">${statusSelectHtml}</td>
        <td style="padding: 6px 10px;">${expGroupSelectHtml}</td>
        <td style="padding: 6px 10px;">${expDetailInputHtml}</td>
        ${currentTab === "pending" ? `
          <td class="col-pending-remove-action text-center" style="padding: 6px 8px; vertical-align: middle;">
            <button type="button" class="btn btn-danger btn-sm btn-row-remove-pending" data-rowid="${encodeURIComponent(rId)}" data-rowkey="${rowKey}" style="background: #dc2626; color: #ffffff; border: none; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" title="Xóa đơn khỏi tab Chờ Xử Lý">
              Xóa
            </button>
          </td>
        ` : ""}
      </tr>
    `;
  }).join("");

  // Kích hoạt thu gọn cột và cố định các cột theo số lượng đã chọn
  requestAnimationFrame(() => {
    initColumnToggleEvents();
    applyHiddenColumns();
    applyFrozenColumns();
  });
}

// Cập nhật các chỉ số và trạng thái nút trên thanh phân trang
function updatePaginationUI(total, totalPages, startIndex, endIndex) {
  if (pageFromRow) pageFromRow.textContent = total > 0 ? (startIndex + 1).toLocaleString("vi-VN") : "0";
  if (pageToRow) pageToRow.textContent = endIndex.toLocaleString("vi-VN");
  if (pageTotalRecords) pageTotalRecords.textContent = total.toLocaleString("vi-VN");
  if (pageTotalPages) pageTotalPages.textContent = totalPages.toLocaleString("vi-VN");
  if (inputPageDirect) {
    inputPageDirect.value = currentPage;
    inputPageDirect.max = totalPages;
  }

  if (btnFirstPage) btnFirstPage.disabled = currentPage <= 1;
  if (btnPrevPage) btnPrevPage.disabled = currentPage <= 1;
  if (btnNextPage) btnNextPage.disabled = currentPage >= totalPages;
  if (btnLastPage) btnLastPage.disabled = currentPage >= totalPages;
}

// Khởi tạo các sự kiện bấm nút trên thanh phân trang
function initPaginationEvents() {
  if (btnFirstPage) {
    btnFirstPage.onclick = () => {
      if (currentPage > 1) {
        currentPage = 1;
        renderTable(filteredRecords);
        const container = document.querySelector(".full-table-container");
        if (container) container.scrollTop = 0;
      }
    };
  }

  if (btnPrevPage) {
    btnPrevPage.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable(filteredRecords);
        const container = document.querySelector(".full-table-container");
        if (container) container.scrollTop = 0;
      }
    };
  }

  if (btnNextPage) {
    btnNextPage.onclick = () => {
      const totalPages = Math.ceil((filteredRecords ? filteredRecords.length : 0) / pageSize) || 1;
      if (currentPage < totalPages) {
        currentPage++;
        renderTable(filteredRecords);
        const container = document.querySelector(".full-table-container");
        if (container) container.scrollTop = 0;
      }
    };
  }

  if (btnLastPage) {
    btnLastPage.onclick = () => {
      const totalPages = Math.ceil((filteredRecords ? filteredRecords.length : 0) / pageSize) || 1;
      if (currentPage < totalPages) {
        currentPage = totalPages;
        renderTable(filteredRecords);
        const container = document.querySelector(".full-table-container");
        if (container) container.scrollTop = 0;
      }
    };
  }

  if (inputPageDirect) {
    inputPageDirect.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inputPageDirect.blur();
      }
    };
    inputPageDirect.onchange = (e) => {
      const totalPages = Math.ceil((filteredRecords ? filteredRecords.length : 0) / pageSize) || 1;
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > totalPages) val = totalPages;
      currentPage = val;
      renderTable(filteredRecords);
      const container = document.querySelector(".full-table-container");
      if (container) container.scrollTop = 0;
    };
  }

  if (selectPageSize) {
    selectPageSize.onchange = (e) => {
      pageSize = Math.min(200, Math.max(10, parseInt(e.target.value, 10) || 200));
      currentPage = 1;
      renderTable(filteredRecords);
      const container = document.querySelector(".full-table-container");
      if (container) container.scrollTop = 0;
    };
  }
}

// =========================================================================
// QUẢN LÝ THU GỌN / MỞ RỘNG CỘT TRÊN HEADER BẢNG DỮ LIỆU (-) / (+)
// =========================================================================

let hiddenColumnIndexes = new Set();

function loadHiddenColumns() {
  try {
    const raw = localStorage.getItem("gpg_hidden_table_cols");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        hiddenColumnIndexes = new Set(arr.map(Number));
      }
    }
  } catch (e) {
    hiddenColumnIndexes = new Set();
  }
}

function saveHiddenColumns() {
  try {
    localStorage.setItem("gpg_hidden_table_cols", JSON.stringify(Array.from(hiddenColumnIndexes)));
  } catch (e) {}
}

/**
 * Ẩn hoặc hiện lại một cột theo chỉ số index (0-based)
 */
function toggleColumn(colIndex) {
  colIndex = parseInt(colIndex, 10);
  if (isNaN(colIndex)) return;

  if (hiddenColumnIndexes.has(colIndex)) {
    hiddenColumnIndexes.delete(colIndex);
  } else {
    hiddenColumnIndexes.add(colIndex);
  }

  saveHiddenColumns();
  applyHiddenColumns();
  applyFrozenColumns();
}

/**
 * Áp dụng trạng thái thu gọn / mở lại cho tất cả các thẻ <th> và <td> tương ứng
 */
function applyHiddenColumns() {
  const table = document.querySelector(".full-excel-table");
  if (!table) return;

  const thList = table.querySelectorAll("thead th");
  thList.forEach((th, idx) => {
    const btn = th.querySelector(".col-toggle-btn");
    const colName = th.getAttribute("data-col-name") || "Cột";
    if (hiddenColumnIndexes.has(idx)) {
      th.classList.add("col-collapsed");
      if (btn) {
        btn.textContent = "+";
        btn.title = `Mở lại cột ${colName}`;
        btn.setAttribute("aria-label", `Mở lại cột ${colName}`);
      }
    } else {
      th.classList.remove("col-collapsed");
      if (btn) {
        btn.textContent = "–";
        btn.title = `Thu gọn cột ${colName}`;
        btn.setAttribute("aria-label", `Thu gọn cột ${colName}`);
      }
    }
  });

  const trList = table.querySelectorAll("tbody tr");
  trList.forEach(tr => {
    if (tr.firstElementChild && tr.firstElementChild.hasAttribute("colspan")) return;
    Array.from(tr.children).forEach((td, idx) => {
      if (hiddenColumnIndexes.has(idx)) {
        td.classList.add("col-collapsed");
      } else {
        td.classList.remove("col-collapsed");
      }
    });
  });

  const btnUnhideAll = document.getElementById("btnUnhideAllCols");
  if (btnUnhideAll) {
    if (hiddenColumnIndexes.size > 0) {
      btnUnhideAll.style.display = "inline-flex";
      btnUnhideAll.textContent = `Hiện lại ${hiddenColumnIndexes.size} cột đã ẩn`;
    } else {
      btnUnhideAll.style.display = "none";
    }
  }
}

/**
 * Mở lại tất cả các cột đang bị ẩn
 */
function unhideAllColumns() {
  hiddenColumnIndexes.clear();
  saveHiddenColumns();
  applyHiddenColumns();
  applyFrozenColumns();
}

/**
 * Đăng ký sự kiện click cho các nút dấu - / + trên thead th
 */
function initColumnToggleEvents() {
  const table = document.querySelector(".full-excel-table");
  if (!table) return;

  const thead = table.querySelector("thead");
  if (!thead || thead._toggleEventsAttached) return;
  thead._toggleEventsAttached = true;

  thead.addEventListener("click", (e) => {
    const btn = e.target.closest(".col-toggle-btn");
    const thCollapsed = e.target.closest("th.col-collapsed");

    if (btn) {
      e.stopPropagation();
      const th = btn.closest("th");
      if (!th) return;
      const thList = Array.from(th.parentElement.children);
      const colIndex = thList.indexOf(th);
      if (colIndex >= 0) {
        toggleColumn(colIndex);
      }
    } else if (thCollapsed) {
      // Khi cột đang thu gọn, click trực tiếp vào ô th nhỏ cũng giúp mở lại
      const thList = Array.from(thCollapsed.parentElement.children);
      const colIndex = thList.indexOf(thCollapsed);
      if (colIndex >= 0) {
        toggleColumn(colIndex);
      }
    }
  });

  const btnUnhideAll = document.getElementById("btnUnhideAllCols");
  if (btnUnhideAll && !btnUnhideAll._clickAttached) {
    btnUnhideAll._clickAttached = true;
    btnUnhideAll.addEventListener("click", () => {
      unhideAllColumns();
    });
  }
}

/**
 * Hàm cố định các cột đầu tiên (Freeze Columns)
 */
function applyFrozenColumns(count) {
  if (count !== undefined) {
    currentFrozenCount = count;
    localStorage.setItem("gpg_frozen_cols", String(count));
  } else {
    count = currentFrozenCount;
  }

  if (selectFreezeCols && selectFreezeCols.value !== String(count)) {
    selectFreezeCols.value = String(count);
  }

  const table = document.querySelector(".full-excel-table");
  if (!table) return;

  const headerCells = table.querySelectorAll("thead th");
  const rows = table.querySelectorAll("tbody tr");

  // Xóa style và class cũ
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

  // Áp dụng cho các dòng dữ liệu trong tbody
  rows.forEach(tr => {
    // Bỏ qua các dòng thông báo (như dòng 'Không tìm thấy dữ liệu' có td colspan)
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

// Xuất file CSV các dòng đang hiển thị
function exportFilteredToCsv() {
  if (!filteredRecords || filteredRecords.length === 0) {
    showAlert("Không có dữ liệu để xuất file!");
    return;
  }

  const headers = [
    "STT", "Depot", "Hãng tàu", "Số booking", "Số EIR", "Số container", "Hạn hủy đơn (3h)",
    "Trạng thái đơn hàng", "Ngày hủy đơn", "Ngày được duyệt", "Trạng thái kích hoạt",
    "Thời gian kích hoạt", "Lý do hủy", "Loại container", "Loại đơn hàng (IN/OUT)",
    "SizeTEUS", "Tên tài xế", "Số điện thoại tài xế", "Tên nhà xe", "Số điện thoại nhà xe", "Lý do từ chối",
    "Trạng thái", "Giải trình", "Giải trình chi tiết"
  ];

  const csvRows = [headers.join(",")];

  filteredRecords.forEach((r, idx) => {
    const isUnpaidOrExpired = isUnpaidOrder(r) || r.isAutoCancelledBy3h;
    const warnLevel = getWarning3hLevel(r.ngayDuocDuyet, isUnpaidOrExpired, r.trangThaiXuLy, isCancelledOrder(r));
    let warnText = "-";
    if (warnLevel === "processed") warnText = "Đã xử lý";
    else if (warnLevel === "expired") warnText = "Quá 3h (Tự động hủy)";
    else if (warnLevel === "red") warnText = "Cảnh báo ĐỎ (>2h)";
    else if (warnLevel === "yellow") warnText = "Cảnh báo VÀNG (>1h)";
    else if (warnLevel === "safe") warnText = "An toàn (<1h)";

    const contEir = parseContainerAndEir(r.soContainer);

    const row = [
      `"${idx + 1}"`,
      `"${r.depot || ""}"`,
      `"${r.hangTau || ""}"`,
      `"${r.soBooking || ""}"`,
      `"${(contEir.soEir === "-" ? "" : contEir.soEir).replace(/"/g, '""')}"`,
      `"${(contEir.soContainer === "-" ? "" : contEir.soContainer).replace(/"/g, '""')}"`,
      `"${warnText}"`,
      `"${r.trangThaiDonHang || ""}"`,
      `"${r.ngayHuyDon || ""}"`,
      `"${r.ngayDuocDuyet || ""}"`,
      `"${r.trangThaiKichHoat || ""}"`,
      `"${r.thoiGianKichHoat || ""}"`,
      `"${(r.lyDoHuy || "").replace(/"/g, '""')}"`,
      `"${r.loaiContainer || ""}"`,
      `"${r.loaiDonHang || ""}"`,
      `"${r.sizeTeus || ""}"`,
      `"${r.tenTaiXe || ""}"`,
      `"${r.sdtTaiXe || ""}"`,
      `"${r.tenNhaXe || ""}"`,
      `"${r.sdtNhaXe || ""}"`,
      `"${(r.lyDoTuChoi || "").replace(/"/g, '""')}"`,
      `"${(r.trangThaiXuLy || "").replace(/"/g, '""')}"`,
      `"${(r.giaiTrinh || "").replace(/"/g, '""')}"`,
      `"${(r.giaiTrinhChiTiet || "").replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(","));
  });

  const csvString = "\uFEFF" + csvRows.join("\r\n"); // UTF-8 BOM
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chi_tiet_don_huy_${new Date().toISOString().substring(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Xuất toàn bộ dữ liệu đang lọc ra tệp Excel (.xlsx) chuyên nghiệp
function exportFilteredToExcel() {
  if (!filteredRecords || filteredRecords.length === 0) {
    showAlert("Không có dữ liệu để xuất file!");
    return;
  }

  // Fallback nếu thư viện SheetJS / xlsx-js-style chưa sẵn sàng
  if (typeof XLSX === "undefined") {
    console.warn("Thư viện SheetJS chưa sẵn sàng, chuyển sang xuất CSV.");
    exportFilteredToCsv();
    return;
  }

  // 1. Xác định thông tin khoảng thời gian xuất dữ liệu (Dòng 1)
  const dateFromVal = filterDateFrom ? filterDateFrom.value : "";
  const dateToVal = filterDateTo ? filterDateTo.value : "";
  const hourFromVal = filterHourFrom ? filterHourFrom.value : "";
  const hourToVal = filterHourTo ? filterHourTo.value : "";

  let timeRangeText = "";
  if (dateFromVal || dateToVal) {
    const fromStr = dateFromVal ? `${dateFromVal}${hourFromVal ? ` ${hourFromVal}` : ""}` : (hourFromVal ? `Từ ${hourFromVal}` : "Bắt đầu");
    const toStr = dateToVal ? `${dateToVal}${hourToVal ? ` ${hourToVal}` : ""}` : (hourToVal ? `Đến ${hourToVal}` : "Hiện tại");
    timeRangeText = `Khoảng thời gian: Từ ${fromStr} đến ${toStr}`;
  } else {
    timeRangeText = "Khoảng thời gian: Toàn bộ dữ liệu";
  }

  const now = new Date();
  const dateStrVn = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const exportTimeText = `Thời điểm xuất: ${dateStrVn}`;
  const row1Text = `${timeRangeText}   |   ${exportTimeText}`;

  // 2. Danh mục 24 cột Header của bảng (Bắt đầu từ Dòng 3)
  const headers = [
    "STT", "Depot", "Hãng tàu", "Số booking", "Số EIR", "Số container", "Hạn hủy đơn (3h)",
    "Trạng thái đơn hàng", "Ngày hủy đơn", "Ngày được duyệt", "Trạng thái kích hoạt",
    "Thời gian kích hoạt", "Lý do hủy", "Loại container", "Loại đơn hàng",
    "SizeTEUS", "Tên tài xế", "Số điện thoại tài xế", "Tên nhà xe", "Số điện thoại nhà xe", "Lý do từ chối",
    "Trạng thái CSKH", "Giải trình", "Giải trình chi tiết"
  ];

  // Dòng 1: Khoảng thời gian xuất dữ liệu
  // Dòng 2: Dòng trống để cách dòng
  // Dòng 3: Header của bảng
  const excelRows = [
    [row1Text],
    [],
    headers
  ];

  // 3. Nạp dữ liệu các dòng (Bắt đầu từ Dòng 4 trong Excel)
  filteredRecords.forEach((r, idx) => {
    const isUnpaidOrExpired = isUnpaidOrder(r) || Boolean(r.isAutoCancelledBy3h);
    const isCancelled = isCancelledOrder(r);
    const warnLevel = getWarning3hLevel(r.ngayDuocDuyet, isUnpaidOrExpired, r.trangThaiXuLy, isCancelled);
    let warnText = "-";
    if (warnLevel === "processed") warnText = "Đã xử lý";
    else if (warnLevel === "expired") warnText = "Quá 3h (Tự động hủy)";
    else if (warnLevel === "red") warnText = "Cảnh báo ĐỎ (>2h)";
    else if (warnLevel === "yellow") warnText = "Cảnh báo VÀNG (>1h)";
    else if (warnLevel === "safe") warnText = "An toàn (<1h)";

    const contEir = parseContainerAndEir(r.soContainer);
    const eirVal = contEir.soEir === "-" ? "" : contEir.soEir;
    const contVal = contEir.soContainer === "-" ? "" : contEir.soContainer;

    const isUnpaid = isUnpaidOrder(r) || Boolean(r.isAutoCancelledBy3h);
    const normStatus = normalizeCskhStatus(r.trangThaiXuLy, isUnpaid) || r.trangThaiXuLy || "";

    const row = [
      idx + 1,
      r.depot || "",
      r.hangTau || "",
      r.soBooking || "",
      eirVal,
      contVal,
      warnText,
      r.trangThaiDonHang || "",
      r.ngayHuyDon || "",
      r.ngayDuocDuyet || "",
      r.trangThaiKichHoat || "",
      r.thoiGianKichHoat || "",
      r.lyDoHuy || "",
      r.loaiContainer || "",
      r.loaiDonHang || "",
      r.sizeTeus !== undefined && r.sizeTeus !== null ? r.sizeTeus : "",
      r.tenTaiXe || "",
      r.sdtTaiXe || "",
      r.tenNhaXe || "",
      r.sdtNhaXe || "",
      r.lyDoTuChoi || "",
      normStatus,
      r.giaiTrinh || "",
      r.giaiTrinhChiTiet || ""
    ];
    excelRows.push(row);
  });

  // Tạo workbook và worksheet từ mảng dữ liệu
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(excelRows);

  // Merge dòng 1 từ cột đầu đến cột cuối của bảng để hiển thị trọn vẹn thông tin thời gian
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }
  ];

  // Định dạng kiểu dáng:
  // - Dòng 1: Thời gian xuất
  const a1Cell = ws["A1"];
  if (a1Cell) {
    a1Cell.s = {
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "1E3A8A" }, italic: true },
      fill: { fgColor: { rgb: "F1F5F9" } },
      alignment: { vertical: "center", horizontal: "left" },
      border: {
        bottom: { style: "thin", color: { rgb: "CBD5E1" } }
      }
    };
  }

  // - Bảng bắt đầu từ dòng 3 (r = 2). Header có màu cam nhạt, toàn bộ bảng có all bottom border
  const headerBgColor = "FFEDD5"; // Màu cam nhạt sang trọng, dịu mắt
  const headerTextColor = "7C2D12"; // Màu cam đậm nổi bật
  const headerBorderBottom = { style: "medium", color: { rgb: "EA580C" } };
  const dataBorderBottom = { style: "thin", color: { rgb: "D1D5DB" } };

  for (let r = 2; r < excelRows.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c });
      if (!ws[cellAddr]) {
        ws[cellAddr] = { t: "s", v: "" };
      }
      if (!ws[cellAddr].s) {
        ws[cellAddr].s = {};
      }

      if (r === 2) {
        // Dòng 3 (Header của bảng)
        ws[cellAddr].s = {
          fill: { fgColor: { rgb: headerBgColor } },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: headerTextColor } },
          alignment: { vertical: "center", horizontal: "center", wrapText: true },
          border: {
            bottom: headerBorderBottom
          }
        };
      } else {
        // Dòng 4 trở đi (Dữ liệu của bảng): All bottom border cho từng dòng
        const alignHoriz = (c === 0 || c === 14 || c === 15) ? "center" : "left";
        ws[cellAddr].s = {
          font: { name: "Calibri", sz: 10, color: { rgb: "1F2937" } },
          alignment: { vertical: "center", horizontal: alignHoriz },
          border: {
            bottom: dataBorderBottom
          }
        };
      }
    }
  }

  // Tự động tính toán độ rộng tối ưu cho các cột (Auto-fit Columns) dựa trên header và dữ liệu
  const colWidths = headers.map((colName, cIdx) => {
    let maxLen = colName.length;
    const sampleLimit = Math.min(excelRows.length, 60);
    for (let rIdx = 2; rIdx < sampleLimit; rIdx++) {
      const cellVal = excelRows[rIdx] ? excelRows[rIdx][cIdx] : "";
      if (cellVal !== undefined && cellVal !== null) {
        const strLen = String(cellVal).length;
        if (strLen > maxLen) maxLen = strLen;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  ws["!cols"] = colWidths;

  // Cấu hình chiều cao dòng cho trang tính
  const rowHeights = [{ hpt: 26 }, { hpt: 12 }, { hpt: 28 }];
  ws["!rows"] = rowHeights;

  // Xác định tên file theo tab hiện tại và ngày tháng
  let tabNameStr = "Tat_Ca_Don_Hang";
  if (currentTab === "unpaid") tabNameStr = "Don_Chua_Thanh_Toan";
  else if (currentTab === "cancelled") tabNameStr = "Don_Huy";
  else if (currentTab === "pending") tabNameStr = "Don_Cho_Xu_Ly";

  const todayStr = new Date().toISOString().substring(0, 10);
  const fileName = `Bao_Cao_${tabNameStr}_${todayStr}.xlsx`;

  XLSX.utils.book_append_sheet(wb, ws, "Chi Tiết Đơn Hàng");
  XLSX.writeFile(wb, fileName);
}

