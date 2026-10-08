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
const btnClearDateFilter = document.getElementById("btnClearDateFilter");
const tableDateFilterGroup = document.getElementById("tableDateFilterGroup");
const btnResetFilter = document.getElementById("btnResetFilter");
const btnExportCsv = document.getElementById("btnExportCsv");
const btnSyncTurso = document.getElementById("btnSyncTurso") || document.getElementById("btnSyncSupabase");
const tursoStatusBadge = document.getElementById("tursoStatusBadge") || document.getElementById("supabaseStatusBadge");
const alertBox = document.getElementById("alertBox");
const selectFreezeCols = document.getElementById("selectFreezeCols");

// Elements Tab & Sidebar Nav
const tabAllOrders = document.getElementById("tabAllOrders");
const tabUnpaidOrders = document.getElementById("tabUnpaidOrders");
const tabCancelledOrders = document.getElementById("tabCancelledOrders");
const tabCountAll = document.getElementById("tabCountAll");
const tabCountUnpaid = document.getElementById("tabCountUnpaid");
const tabCountCancelled = document.getElementById("tabCountCancelled");
const navDataTable = document.getElementById("navDataTable");
const navUnpaid = document.getElementById("navUnpaid");
const navCancelled = document.getElementById("navCancelled");
const vnClockWidget = document.getElementById("vnClockWidget");
const vnClockDisplay = document.getElementById("vnClockDisplay");
let vnClockInterval = null;
const btnUpdateData = document.getElementById("btnUpdateData");
const btnDeduplicateData = document.getElementById("btnDeduplicateData");
const btnAddManualRow = document.getElementById("btnAddManualRow");

// Trạng thái tab hiện tại: 'all' (Tất cả), 'unpaid' (Chưa thanh toán), hoặc 'cancelled' (Đơn Hủy)
let currentTab = "all";

// Trạng thái số lượng cột cố định (Mặc định: 3 cột)
let currentFrozenCount = parseInt(localStorage.getItem("gpg_frozen_cols") ?? "3", 10);
let currentDatasetId = "default";

// Bảng cấu hình và thứ tự sắp xếp chuẩn cho trạng thái CSKH
// Đánh số thứ tự (order: 1 -> 8) trong mã nguồn để quản lý và sắp xếp, hoàn toàn không hiển thị số ra màn hình HTML
const CSKH_STATUS_CONFIG = [
  { order: 1, val: "Thanh toán thành công", label: "Thanh toán thành công", bg: "#dcfce7", color: "#166534" },
  { order: 2, val: "Đã liên hệ - Chờ đặt lại", label: "Đã liên hệ - Chờ đặt lại", bg: "#dbeafe", color: "#1e40af" },
  { order: 3, val: "Đã liên hệ - Chờ thanh toán", label: "Đã liên hệ - Chờ thanh toán", bg: "#e0e7ff", color: "#4338ca" },
  { order: 4, val: "Đã liên hệ - Đã đặt lại", label: "Đã liên hệ - Đã đặt lại", bg: "#dcfce7", color: "#166534" },
  { order: 5, val: "Đã liên hệ - Không đặt lại", label: "Đã liên hệ - Không đặt lại", bg: "#fee2e2", color: "#991b1b" },
  { order: 6, val: "Không liên hệ được - Chờ thanh toán", label: "Không liên hệ được - Chờ thanh toán", bg: "#fef3c7", color: "#92400e" },
  { order: 7, val: "Không liên hệ được - Hủy", label: "Không liên hệ được - Hủy", bg: "#fee2e2", color: "#b91c1c" },
  { order: 8, val: "Tự động đặt lại", label: "Tự động đặt lại", bg: "#f1f5f9", color: "#334155" }
].sort((a, b) => a.order - b.order);

// Hàm tra cứu thứ tự sắp xếp của trạng thái CSKH trong mã nguồn
function getCskhStatusOrder(statusVal) {
  if (statusVal === null || statusVal === undefined) return 999;
  if (typeof statusVal === "number") return statusVal;
  const str = String(statusVal).trim();
  if (!str) return 999;
  if (["1", "2", "3", "4", "5", "6", "7", "8"].includes(str)) {
    return parseInt(str, 10);
  }
  const item = CSKH_STATUS_CONFIG.find(s => s.val === str);
  if (item) return item.order;
  if (str === "Không liên hệ được") return 6;
  if (str === "Đã liên hệ - Đang chờ" || str === "Đã liên hệ - Chờ") return 2;
  if (str === "Không liên hệ được - hủy") return 7;
  return 999;
}

// Kiểm tra trạng thái CSKH có thuộc nhóm 1, 3, 6 (tự động cập nhật ĐÃ XỬ LÝ cho hạn hủy 3h) hay không
function isProcessed3hStatus(trangThaiXuLy) {
  const order = getCskhStatusOrder(trangThaiXuLy);
  return order === 1 || order === 3 || order === 6;
}

// Lấy danh mục trạng thái CSKH phân loại theo từng tab:
// - Tab Đơn chưa thanh toán: hiển thị các trạng thái 1, 3, 6, 8
// - Tab Đơn hàng hủy: chỉ hiển thị các trạng thái 2, 5, 7 (đã ẩn trạng thái 4)
// - Tab Tất cả đơn hàng: hiển thị tất cả các trạng thái (1 -> 8)
function getTabCskhStatusOptions(tabName) {
  if (tabName === "unpaid") {
    return CSKH_STATUS_CONFIG.filter(opt => [1, 3, 6, 8].includes(opt.order));
  }
  if (tabName === "cancelled") {
    return CSKH_STATUS_CONFIG.filter(opt => [2, 5, 7].includes(opt.order));
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
  return s === "da huy" || s === "huy" || s.includes("da huy");
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

  if (count === 0) {
    depotSelectedLabel.textContent = "Chưa chọn Depot";
    depotDropdownBtn.classList.remove("has-selection");
  } else if (count === total) {
    depotSelectedLabel.textContent = "Depot (Tất cả)";
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

// Định dạng thời gian còn lại (ms) thành chuỗi HH:mm:ss
function formatRemainingTime(remMs) {
  if (remMs <= 0) return "00:00:00";
  const totalSecs = Math.floor(remMs / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Cập nhật tự động: Đối với các đơn hàng chưa thanh toán, nếu hạn hủy đơn (3h) quá thời hạn thì cập nhật Trạng thái đơn = Đã hủy
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

// Phân loại cấp độ cảnh báo 3 giờ: 'safe' | 'yellow' | 'red' | 'expired' | 'processed' | null
function getWarning3hLevel(ngayDuocDuyet, isUnpaidOrExpired, trangThaiXuLy) {
  if (!isUnpaidOrExpired) return null;
  // Quy tắc: Chỉ khi là đơn chưa thanh toán VÀ Trạng Thái = 1, 3, 6 -> Tự động cập nhật "Đã xử lý"
  if (isProcessed3hStatus(trangThaiXuLy)) {
    return "processed";
  }
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
function renderCountdownCell(ngayDuocDuyet, isUnpaidOrExpired, trangThaiXuLy) {
  if (!isUnpaidOrExpired) {
    return `<span style="color: var(--text-muted); font-size: 12px;">-</span>`;
  }
  // Quy tắc: Chỉ khi là đơn chưa thanh toán VÀ Trạng Thái = 1, 3, 6 -> Tự động cập nhật huy hiệu ĐÃ XỬ LÝ
  if (isProcessed3hStatus(trangThaiXuLy)) {
    return `
      <div class="countdown-badge badge-countdown-processed" title="Đơn đã được xử lý CSKH (Trạng thái 1, 3, 6): ${trangThaiXuLy}">
        <span class="cd-pulse-dot processed"></span>
        <span>Đã xử lý</span>
      </div>
    `;
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
      <div class="countdown-badge badge-countdown-expired" title="Đã quá 3 giờ từ khi duyệt (${ngayDuocDuyet}). Quy tắc: Tự động hủy!">
        <span class="cd-pulse-dot expired"></span>
        <span>Quá 3h (Đã hủy)</span>
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
        badge.title = "Đã quá 3 giờ từ khi duyệt. Quy tắc: Tự động hủy!";
        badge.innerHTML = `<span class="cd-pulse-dot expired"></span><span>Quá 3h (Đã hủy)</span>`;
      }
      const tr = timer.closest("tr");
      if (tr) {
        const rowKey = tr.getAttribute("data-rowkey");
        const rec = allRecords.find(r => getRowKey(r) === rowKey);
        if (rec && (isUnpaidStatus(rec.trangThaiDonHang) || rec.isAutoCancelledBy3h) && !isProcessed3hStatus(rec.trangThaiXuLy)) {
          if (!rec.originalTrangThaiDonHang) {
            rec.originalTrangThaiDonHang = rec.trangThaiDonHang;
          }
          if (rec.trangThaiDonHang !== "Đã hủy") {
            rec.trangThaiDonHang = "Đã hủy";
            rec.isAutoCancelledBy3h = true;
            const statusBadge = tr.querySelector(".cell-order-status .badge");
            if (statusBadge) {
              statusBadge.className = "badge badge-danger";
              statusBadge.textContent = "Đã hủy";
            }
            updateTabCounts();
          }
        }
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

  // Đồng bộ hóa trực tiếp vào SQL Database trên Server
  fetch("/api/orders/note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowKey, status: newStatus })
  }).catch(() => {});

  if (targetRec) {
    // Cập nhật tức thì ô Hạn Hủy Đơn trên dòng này
    const tr = selectElem.closest("tr");
    if (tr) {
      const cdCell = tr.querySelector(".cell-countdown-3h");
      if (cdCell) {
        const isUnpaidOrExpired = isUnpaidOrder(targetRec) || targetRec.isAutoCancelledBy3h;
        cdCell.innerHTML = renderCountdownCell(targetRec.ngayDuocDuyet, isUnpaidOrExpired, targetRec.trangThaiXuLy);
      }
    }
  }
};

// Xử lý nhập Giải Trình (tự động debounce lưu)
let expDebounceTimer = null;
window.onExplanationInput = function(inputElem) {
  const rowKey = inputElem.getAttribute("data-rowkey");
  const val = inputElem.value;

  // Cập nhật cho tất cả bản ghi tương ứng trong mảng allRecords (chung cho cả tab Tất Cả, Đơn Chưa Thanh Toán, Đơn Hủy)
  let matchedRecs = allRecords.filter(r => 
    (rowKey && (r.rowKey === rowKey || getRowKey(r) === rowKey))
  );

  if (matchedRecs.length === 0 && rowKey) {
    matchedRecs = allRecords.filter(r => {
      const alt = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
      return alt === rowKey;
    });
  }

  matchedRecs.forEach(rec => {
    rec.giaiTrinh = val;
  });

  const targetRec = matchedRecs[0];
  if (targetRec && (targetRec.soContainer || targetRec.soBooking)) {
    allRecords.forEach(r => {
      if (
        (targetRec.soContainer && r.soContainer === targetRec.soContainer && (!targetRec.soBooking || r.soBooking === targetRec.soBooking)) ||
        (targetRec.soBooking && !targetRec.soContainer && r.soBooking === targetRec.soBooking)
      ) {
        r.giaiTrinh = val;
      }
    });
  }

  clearTimeout(expDebounceTimer);
  expDebounceTimer = setTimeout(() => {
    const notes = getSavedNotes();
    if (rowKey) {
      if (!notes[rowKey]) notes[rowKey] = {};
      notes[rowKey].giaiTrinh = val;
    }
    matchedRecs.forEach(rec => {
      const k1 = getRowKey(rec);
      const k2 = `${rec.stt}_${rec.soBooking || ''}_${rec.soContainer || ''}`;
      if (k1) {
        if (!notes[k1]) notes[k1] = {};
        notes[k1].giaiTrinh = val;
      }
      if (k2) {
        if (!notes[k2]) notes[k2] = {};
        notes[k2].giaiTrinh = val;
      }
    });
    saveNotes(notes);

    // Đồng bộ hóa trực tiếp vào SQL Database trên Server
    fetch("/api/orders/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowKey, giaiTrinh: val })
    }).catch(() => {});

    inputElem.classList.add("saved-pulse");
    setTimeout(() => inputElem.classList.remove("saved-pulse"), 600);
  }, 250);
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

  // Lắng nghe sự kiện chuyển tab (Tất Cả <-> Chưa Thanh Toán <-> Đơn Hủy)
  if (tabAllOrders) {
    tabAllOrders.onclick = () => switchTab("all");
  }
  if (tabUnpaidOrders) {
    tabUnpaidOrders.onclick = () => switchTab("unpaid");
  }
  if (tabCancelledOrders) {
    tabCancelledOrders.onclick = () => switchTab("cancelled");
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

  // Lắng nghe sự kiện click nút Cập Nhật Dữ Liệu (Tab Tất Cả Đơn)
  if (btnUpdateData) {
    btnUpdateData.onclick = async () => {
      const confirmRun = confirm("Bạn có chắc chắn muốn thực hiện Cập Nhật Dữ Liệu đối soát từ Bảng Check Đơn không?\n\n- Đơn chưa thanh toán: Đối soát và thay thế dữ liệu khi trùng số Booking, trùng số Container và trùng số EIR.\n- Đơn đã hủy: Đối soát và thay thế dữ liệu khi khớp Booking, Container, khác Số EIR và Ngày phát sinh cách Ngày duyệt > 5 phút.\n- Các dòng check đơn đã thay thế sẽ tự động được xóa khỏi bảng check đơn.");
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
          await loadDataset();
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
          await loadDataset();
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
          <input type="text" id="manual_ngayHuyDon" class="manual-row-input" placeholder="YYYY-MM-DD HH:mm:ss" title="Ngày hủy đơn">
        </td>
        <td>
          <input type="text" id="manual_ngayDuocDuyet" class="manual-row-input" placeholder="YYYY-MM-DD HH:mm:ss" title="Ngày được duyệt">
        </td>
        <td class="text-center" style="color: #64748b; font-size: 11.5px; font-style: italic; vertical-align: middle;">Tự động (3h)</td>
        <td>
          <input type="text" id="manual_soBooking" class="manual-row-input" placeholder="Số booking" style="font-weight: 700;" title="Nhập số booking">
        </td>
        <td>
          <input type="text" id="manual_soContainer" class="manual-row-input" placeholder="Số cont (vd: TCKU...)" title="Nhập số container">
        </td>
        <td>
          <input type="text" id="manual_soEir" class="manual-row-input" placeholder="Số EIR (vd: EIR3398...)" title="Nhập số EIR">
        </td>
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
        <td>
          <select id="manual_trangThaiXuLy" class="manual-row-select" title="Trạng thái chăm sóc khách hàng">
            <option value="">-- Chọn trạng thái --</option>
            <option value="Thanh toán thành công">Thanh toán thành công</option>
            <option value="Đã liên hệ - Chờ đặt lại">Đã liên hệ - Chờ đặt lại</option>
            <option value="Đã liên hệ - Chờ thanh toán">Đã liên hệ - Chờ thanh toán</option>
            <option value="Đã liên hệ - Đã đặt lại">Đã liên hệ - Đã đặt lại</option>
            <option value="Đã liên hệ - Không đặt lại">Đã liên hệ - Không đặt lại</option>
            <option value="Không liên hệ được - Chờ thanh toán">Không liên hệ được - Chờ thanh toán</option>
            <option value="Không liên hệ được - Hủy">Không liên hệ được - Hủy</option>
            <option value="Tự động đặt lại">Tự động đặt lại</option>
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center; min-width: 250px;">
            <input type="text" id="manual_giaiTrinh" class="manual-row-input" placeholder="Giải trình..." title="Giải trình">
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
            giaiTrinh: (document.getElementById("manual_giaiTrinh").value || "").trim()
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

  // Tự động đóng cả 2 dropdown khi click ra ngoài
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
      btnClearDateFilter.style.display = "none";
      if (tableDateFilterGroup) tableDateFilterGroup.classList.remove("has-selection");
      applyFilters();
    };
  }

  if (filterLine) filterLine.onchange = applyFilters;
  if (filterDirection) filterDirection.onchange = applyFilters;
  if (filterApprovedHour) filterApprovedHour.onchange = applyFilters;
  if (filterWarning3h) filterWarning3h.onchange = applyFilters;
  if (filterContactStatus) filterContactStatus.onchange = applyFilters;
  if (btnResetFilter) btnResetFilter.onclick = resetFilters;
  if (btnExportCsv) btnExportCsv.onclick = exportFilteredToCsv;
  if (btnSyncTurso) btnSyncTurso.onclick = triggerTursoSync;
  if (tursoStatusBadge) tursoStatusBadge.onclick = triggerTursoSync;

  // Khởi động bộ đếm ngược liên tục mỗi giây trên toàn bộ bảng
  setInterval(tickCountdowns, 1000);

  // Load dataset
  loadDataset();

  // Kiểm tra liên kết Turso Cloud SQLite
  checkTursoStatus();
});

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
      if (btnUpdateData) btnUpdateData.style.display = "none";
      if (btnDeduplicateData) btnDeduplicateData.style.display = "none";
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

      // Ẩn nút Cập Nhật Dữ Liệu & Lọc Đơn Trùng khi sang tab Chưa thanh toán
      if (btnUpdateData) btnUpdateData.style.display = "none";
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
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState({}, "", url);
  }

  // Cập nhật các tùy chọn của bộ lọc Trạng Thái CSKH theo tab tương ứng
  updateFilterContactStatusDropdown(currentTab);

  applyFilters();
}

// Hàm cập nhật đồng hồ thời gian thực chuẩn giờ Việt Nam (hh:mm:ss)
function updateVietnamClock() {
  if (!vnClockDisplay) return;
  try {
    const timeStr = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());
    vnClockDisplay.textContent = timeStr;
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

// Cập nhật số lượng hiển thị trên các thẻ tab
function updateTabCounts() {
  const totalCount = allRecords.length;
  const unpaidCount = allRecords.filter(isUnpaidOrder).length;
  const cancelledCount = allRecords.filter(isCancelledOrder).length;
  if (tabCountAll) tabCountAll.textContent = totalCount;
  if (tabCountUnpaid) tabCountUnpaid.textContent = unpaidCount;
  if (tabCountCancelled) tabCountCancelled.textContent = cancelledCount;
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
async function loadDataset() {
  clearAlert();
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
      const res = await fetch(`/api/history/${uploadId}`);
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
      const resAll = await fetch("/api/all-data");
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
    
    // Nạp trạng thái và giải trình đã lưu trong localStorage và bảo tồn từ CSDL máy chủ
    const savedNotes = getSavedNotes();
    allRecords.forEach(r => {
      const k1 = getRowKey(r);
      const k2 = `${r.stt}_${r.soBooking || ''}_${r.soContainer || ''}`;
      const note = savedNotes[k1] || (k2 ? savedNotes[k2] : null) || {};
      let st = note.status || r.trangThaiXuLy || "";
      if (st === "Đã liên hệ - Đang chờ" || st === "Đã liên hệ - Chờ") {
        st = "Đã liên hệ - Chờ đặt lại";
      } else if (st === "Không liên hệ được") {
        st = "Không liên hệ được - Chờ thanh toán";
      } else if (st === "Không liên hệ được - hủy") {
        st = "Không liên hệ được - Hủy";
      }
      r.trangThaiXuLy = st;
      r.giaiTrinh = note.giaiTrinh || r.giaiTrinh || "";
    });

    // Cập nhật các đơn Chưa thanh toán quá 3h thành Đã hủy
    applyExpired3hCancellation(allRecords);

    populateFilterDropdowns(allRecords);
    updateTabCounts();
    const initUrlParams = new URLSearchParams(window.location.search);
    let initialTab = "all";
    if (initUrlParams.get("tab") === "unpaid") initialTab = "unpaid";
    else if (initUrlParams.get("tab") === "cancelled") initialTab = "cancelled";
    switchTab(initialTab, false);
  } catch (err) {
    showAlert(err.message || "Lỗi khi nạp dữ liệu.");
    tbodyFullData.innerHTML = `<tr><td colspan="23" class="text-center py-4 text-danger">${err.message}</td></tr>`;
  }
}
const loadTableData = loadDataset;

// Điền các option cho bộ lọc
function populateFilterDropdowns(records) {
  const depots = [...new Set(records.map(r => r.depot).filter(Boolean))].sort();
  initDepotMultiSelect(depots);

  const lines = [...new Set(records.map(r => r.hangTau).filter(Boolean))].sort();
  filterLine.innerHTML = `<option value="">Hãng tàu</option>`;
  lines.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = `Hãng ${l}`;
    filterLine.appendChild(opt);
  });

  // Quét toàn bộ dữ liệu cột Trạng Thái Đơn: có bao nhiêu trạng thái thì thêm bấy nhiêu vào bộ lọc đa chọn
  const rawStatuses = records.map(r => normalizeStr(r.trangThaiDonHang)).filter(Boolean);
  const statuses = [...new Set(rawStatuses)].sort();
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

  // Cập nhật trạng thái hiển thị của nút xóa ngày và highlight viền
  if (btnClearDateFilter) {
    btnClearDateFilter.style.display = (dateFromVal || dateToVal) ? "inline-flex" : "none";
  }
  if (tableDateFilterGroup) {
    if (dateFromVal || dateToVal) {
      tableDateFilterGroup.classList.add("has-selection");
    } else {
      tableDateFilterGroup.classList.remove("has-selection");
    }
  }

  filteredRecords = allRecords.filter(r => {
    // 0. Phân loại theo Tab (Tất Cả Đơn, Chỉ Đơn Chưa Thanh Toán, hoặc Chỉ Đơn Hủy)
    if (currentTab === "unpaid") {
      if (warning3hVal === "expired") {
        if (!isUnpaidOrder(r) && !r.isAutoCancelledBy3h) return false;
      } else {
        if (!isUnpaidOrder(r)) return false;
      }
    } else if (currentTab === "cancelled") {
      if (!isCancelledOrder(r)) return false;
    }

    // 0.1. Lọc theo Khoảng Ngày (Ngày Hủy Đơn hoặc Ngày Được Duyệt)
    if (dateFromVal || dateToVal) {
      const rawDate = dateTypeVal === "ngayDuyet" ? r.ngayDuocDuyet : r.ngayHuyDon;
      const recDate = extractDateOnly(rawDate);
      if (!recDate) return false;
      if (dateFromVal && recDate < dateFromVal) return false;
      if (dateToVal && recDate > dateToVal) return false;
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
        if (currentTab === "unpaid" && warning3hVal === "expired" && r.isAutoCancelledBy3h) {
          // Bỏ qua lọc trạng thái khi người dùng chủ động chọn Hạn 3h = Quá 3h (Đã hủy) trong tab Chưa thanh toán
        } else {
          const itemStatus = normalizeStr(r.trangThaiDonHang).toLowerCase();
          const hasMatch = selectedStatuses.some(s => normalizeStr(s).toLowerCase() === itemStatus);
          if (!hasMatch) return false;
        }
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
      const level = getWarning3hLevel(r.ngayDuocDuyet, isUnpaidOrder(r) || r.isAutoCancelledBy3h, r.trangThaiXuLy);
      if (level !== warning3hVal) return false;
    }

    // 7. Dropdown lọc Trạng Thái Xử Lý / CSKH
    if (contactStatusVal) {
      if (contactStatusVal === "__EMPTY__") {
        if (r.trangThaiXuLy) return false;
      } else if (r.trangThaiXuLy !== contactStatusVal) {
        return false;
      }
    }

    return true;
  });

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
  if (btnClearDateFilter) btnClearDateFilter.style.display = "none";
  if (tableDateFilterGroup) tableDateFilterGroup.classList.remove("has-selection");

  applyFilters();
}

// Render dữ liệu bảng
function renderTable(records) {
  const unpaidCount = allRecords.filter(isUnpaidOrder).length;
  const cancelledCount = allRecords.filter(isCancelledOrder).length;
  if (currentTab === "unpaid") {
    totalRowsBadge.textContent = `Hiển thị: ${records.length} / ${unpaidCount} đơn chưa thanh toán (Tổng toàn bộ: ${allRecords.length})`;
    totalRowsBadge.className = "badge badge-unpaid";
    totalRowsBadge.style.fontSize = "13px";
    totalRowsBadge.style.padding = "6px 14px";
  } else if (currentTab === "cancelled") {
    totalRowsBadge.textContent = `Hiển thị: ${records.length} / ${cancelledCount} đơn hủy (Tổng toàn bộ: ${allRecords.length})`;
    totalRowsBadge.className = "badge badge-danger";
    totalRowsBadge.style.fontSize = "13px";
    totalRowsBadge.style.padding = "6px 14px";
  } else {
    totalRowsBadge.textContent = `Hiển thị: ${records.length} / ${allRecords.length} đơn hàng`;
    totalRowsBadge.className = "badge badge-info";
    totalRowsBadge.style.fontSize = "13px";
    totalRowsBadge.style.padding = "6px 14px";
  }

  if (!records || records.length === 0) {
    tbodyFullData.innerHTML = `
      <tr>
        <td colspan="23" class="text-center py-4 text-muted">
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

  tbodyFullData.innerHTML = records.map(r => {
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
    const currStatus = r.trangThaiXuLy || "";
    const currExp = r.giaiTrinh || "";

    let rowOptions = baseStatusOptions;
    if (currStatus && !baseStatusOptions.some(opt => opt.val === currStatus)) {
      const extraOpt = CSKH_STATUS_CONFIG.find(opt => opt.val === currStatus);
      if (extraOpt) {
        rowOptions = [...baseStatusOptions, extraOpt].sort((a, b) => a.order - b.order);
      }
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

    const expInputHtml = `
      <input type="text" class="input-giaitrinh" placeholder="Nhập giải trình..." value="${currExp ? currExp.replace(/"/g, '&quot;') : ""}" data-rowkey="${rowKey}" oninput="onExplanationInput(this)" title="Nhập giải trình (Tự động lưu)">
    `;

    // Cột Đếm Ngược Hạn Hủy 3 Giờ
    const isUnpaidOrExpired = isUnpaidOrder(r) || r.isAutoCancelledBy3h;
    const countdownHtml = renderCountdownCell(r.ngayDuocDuyet, isUnpaidOrExpired, r.trangThaiXuLy);

    // Tách số Container và số EIR (trước dấu '-' là EIR, sau dấu '-' là Container)
    const contEir = parseContainerAndEir(r.soContainer);

    return `
      <tr data-rowkey="${rowKey}">
        <td class="text-center" style="font-weight: 600; color: var(--text-muted);">${r.stt}</td>
        <td><strong style="color: var(--blue-primary);">${r.depot}</strong></td>
        <td><strong>${r.hangTau}</strong></td>
        <td style="font-size: 12.5px;">${r.ngayHuyDon || "-"}</td>
        <td style="font-size: 12.5px; color: var(--text-muted);">${r.ngayDuocDuyet || "-"}</td>
        <td class="text-center cell-countdown-3h" style="padding: 6px 8px;">${countdownHtml}</td>
        <td><code>${r.soBooking || "-"}</code></td>
        <td><code>${contEir.soContainer}</code></td>
        <td><code>${contEir.soEir}</code></td>
        <td class="cell-order-status"><span class="badge ${statusClass}">${r.trangThaiDonHang}</span></td>
        <td>${actBadge}</td>
        <td style="font-size: 12.5px; color: var(--text-muted);">${r.thoiGianKichHoat || "-"}</td>
        <td style="max-width: 280px; white-space: normal; line-height: 1.4;">${r.lyDoHuy || "-"}</td>
        <td style="font-size: 13px;">${r.loaiContainer || "-"}</td>
        <td class="text-center">${dirBadge}</td>
        <td class="text-center"><strong>${r.sizeTeus || 0}</strong></td>
        <td>${r.tenTaiXe || "-"}</td>
        <td style="font-size: 12.5px; font-family: monospace;">${r.sdtTaiXe || "-"}</td>
        <td>${r.tenNhaXe || "-"}</td>
        <td style="font-size: 12.5px; font-family: monospace;">${r.sdtNhaXe || "-"}</td>
        <td style="max-width: 280px; white-space: normal; color: #b45309; font-size: 13px; line-height: 1.4;">${r.lyDoTuChoi || "-"}</td>
        <td class="text-center" style="padding: 6px 10px;">${statusSelectHtml}</td>
        <td style="padding: 6px 10px;">${expInputHtml}</td>
      </tr>
    `;
  }).join("");

  // Kích hoạt cố định các cột theo số lượng đã chọn
  requestAnimationFrame(() => {
    applyFrozenColumns();
  });
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
    // Bỏ qua các dòng thông báo (colspan)
    if (tr.children.length < headerCells.length) return;

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
    "STT", "Depot", "Hãng tàu", "Ngày hủy đơn", "Ngày được duyệt", "Hạn hủy đơn (3h)",
    "Số booking", "Số container", "Số EIR", "Trạng thái đơn hàng", "Trạng thái kích hoạt",
    "Thời gian kích hoạt", "Lý do hủy", "Loại container", "Loại đơn hàng (IN/OUT)",
    "SizeTEUS", "Tên tài xế", "Số điện thoại tài xế", "Tên nhà xe", "Số điện thoại nhà xe", "Lý do từ chối",
    "Trạng thái", "Giải trình"
  ];

  const csvRows = [headers.join(",")];

  filteredRecords.forEach(r => {
    const isUnpaidOrExpired = isUnpaidOrder(r) || r.isAutoCancelledBy3h;
    const warnLevel = getWarning3hLevel(r.ngayDuocDuyet, isUnpaidOrExpired, r.trangThaiXuLy);
    let warnText = "-";
    if (warnLevel === "processed") warnText = "Đã xử lý";
    else if (warnLevel === "expired") warnText = "Quá 3h (Tự động hủy)";
    else if (warnLevel === "red") warnText = "Cảnh báo ĐỎ (>2h)";
    else if (warnLevel === "yellow") warnText = "Cảnh báo VÀNG (>1h)";
    else if (warnLevel === "safe") warnText = "An toàn (<1h)";

    const contEir = parseContainerAndEir(r.soContainer);

    const row = [
      `"${r.stt || ""}"`,
      `"${r.depot || ""}"`,
      `"${r.hangTau || ""}"`,
      `"${r.ngayHuyDon || ""}"`,
      `"${r.ngayDuocDuyet || ""}"`,
      `"${warnText}"`,
      `"${r.soBooking || ""}"`,
      `"${(contEir.soContainer === "-" ? "" : contEir.soContainer).replace(/"/g, '""')}"`,
      `"${(contEir.soEir === "-" ? "" : contEir.soEir).replace(/"/g, '""')}"`,
      `"${r.trangThaiDonHang || ""}"`,
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
      `"${(r.giaiTrinh || "").replace(/"/g, '""')}"`
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
