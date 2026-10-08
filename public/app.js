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
const btnClearDateFilter = document.getElementById("btnClearDateFilter");
const dashboardDateFilterGroup = document.getElementById("dashboardDateFilterGroup");
const btnResetFilter = document.getElementById("btnResetFilter");

document.addEventListener("DOMContentLoaded", () => {
  if (btnExportMarkdown) btnExportMarkdown.onclick = copyMarkdownReport;
  if (btnExportJson) btnExportJson.onclick = downloadJsonData;
  initModalEvents();

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
});

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

// Kiểm tra trạng thái CSKH có thuộc nhóm 1, 3, 6 (tự động cập nhật ĐÃ XỬ LÝ cho hạn hủy 3h) hay không
function isProcessed3hStatus(trangThaiXuLy) {
  if (!trangThaiXuLy) return false;
  const s = String(trangThaiXuLy).trim();
  if (s === "1" || s === "3" || s === "6") return true;
  if (s === "Thanh toán thành công") return true;
  if (s === "Đã liên hệ - Chờ thanh toán") return true;
  if (s === "Không liên hệ được - Chờ thanh toán" || s === "Không liên hệ được") return true;
  return false;
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

function getWarning3hLevel(ngayDuocDuyet, isUnpaidOrExpired, trangThaiXuLy) {
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

  if (count === 0) {
    depotSelectedLabel.textContent = "Chưa chọn Depot";
    depotDropdownBtn.classList.remove("has-selection");
  } else if (count === total) {
    depotSelectedLabel.textContent = "Depot (Tất cả)";
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
  allDashboardDepots = [...new Set(records.map(r => r.depot).filter(Boolean))].sort();
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
        btnClearDateFilter.style.display = "none";
        if (dashboardDateFilterGroup) dashboardDateFilterGroup.classList.remove("has-selection");
        applyDashboardFilters();
      };
    }

    if (filterLine) filterLine.onchange = applyDashboardFilters;
    if (filterDirection) filterDirection.onchange = applyDashboardFilters;
    if (filterApprovedHour) filterApprovedHour.onchange = applyDashboardFilters;
    if (filterWarning3h) filterWarning3h.onchange = applyDashboardFilters;
    if (filterContactStatus) filterContactStatus.onchange = applyDashboardFilters;
    if (btnResetFilter) btnResetFilter.onclick = resetDashboardFilters;
  }
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

  // Cập nhật trạng thái hiển thị của nút xóa ngày và highlight viền
  if (btnClearDateFilter) {
    btnClearDateFilter.style.display = (dateFromVal || dateToVal) ? "inline-flex" : "none";
  }
  if (dashboardDateFilterGroup) {
    if (dateFromVal || dateToVal) {
      dashboardDateFilterGroup.classList.add("has-selection");
    } else {
      dashboardDateFilterGroup.classList.remove("has-selection");
    }
  }

  const filtered = masterDashboardRecords.filter(r => {
    // 0. Bộ lọc Theo Ngày (Ngày Hủy Đơn hoặc Ngày Được Duyệt)
    if (dateFromVal || dateToVal) {
      const rawDate = dateTypeVal === "ngayDuyet" ? r.ngayDuocDuyet : r.ngayHuyDon;
      const recDate = extractDateOnly(rawDate);
      if (!recDate) return false;
      if (dateFromVal && recDate < dateFromVal) return false;
      if (dateToVal && recDate > dateToVal) return false;
    }

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
      const level = getWarning3hLevel(r.ngayDuocDuyet, isUnpaidOrder(r) || r.isAutoCancelledBy3h, r.trangThaiXuLy);
      if (level !== warning3hVal) return false;
    }

    // 7. CSKH Contact status
    if (contactStatusVal) {
      if (contactStatusVal === "__EMPTY__") {
        if (r.trangThaiXuLy) return false;
      } else if (r.trangThaiXuLy !== contactStatusVal) {
        return false;
      }
    }

    return true;
  });

  currentRecords = filtered;
  const analytics = calculateAnalyticsFromRecords(filtered);
  currentAnalyticsData = analytics;
  renderDashboardViews(analytics, filtered);
}

// Đặt lại toàn bộ bộ lọc Dashboard
function resetDashboardFilters() {
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
  if (btnClearDateFilter) btnClearDateFilter.style.display = "none";
  if (dashboardDateFilterGroup) dashboardDateFilterGroup.classList.remove("has-selection");

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
    if (note.status && !r.trangThaiXuLy) r.trangThaiXuLy = note.status;
    if (note.giaiTrinh && !r.giaiTrinh) r.giaiTrinh = note.giaiTrinh;
  });

  initDashboardFilterControls(masterDashboardRecords);
  renderDashboardViews(data, currentRecords);
}

// Render toàn bộ giao diện dashboard theo bộ dữ liệu (gốc hoặc đã lọc)
function renderDashboardViews(data, records = []) {
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

  // 4. Ma Trận Depot & Hãng Tàu × Trạng Thái & Bảng Thống Kê Chi Tiết
  if (records) {
    initMatrixStatusControls(records);
    renderMatrixTable(records);
    initInlineDetailControls();
    renderInlineDetailTable(records, currentInlineLine || "ALL", currentInlineDepot || "ALL");
  }

  // 5. Tables
  renderKpiSummaryTable(records, masterDashboardRecords ? masterDashboardRecords.length : (records ? records.length : 0));
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

// Render Bảng Chỉ Số KPI Vận Hành & CSKH
function renderKpiSummaryTable(records, totalMasterCount) {
  const tbody = document.getElementById("tbodyKpiSummary");
  if (!tbody) return;

  const list = records || [];
  const currentTotal = list.length;

  const scopeEl = document.getElementById("kpiSummaryScope");
  if (scopeEl) {
    if (totalMasterCount && totalMasterCount > currentTotal) {
      scopeEl.textContent = `Hiển thị ${currentTotal} / ${totalMasterCount} đơn theo bộ lọc`;
    } else {
      scopeEl.textContent = `Tổng cộng: ${currentTotal} đơn`;
    }
  }

  // 1. Tổng số đơn hủy
  const totalCancelled = list.filter(r => {
    const s = normalizeStr(r.trangThaiDonHang || "").toLowerCase();
    return s.includes("đã hủy") || s.includes("da huy") || s.includes("hủy") || s.includes("huy");
  }).length;

  // 2. Số đơn chưa thanh toán (chỉ thống kê theo trạng thái đơn hàng)
  const totalUnpaid = list.filter(r => {
    return isUnpaidOrder(r);
  }).length;

  // 3. Tổng số đơn đã được phân loại trạng thái đã xử lý
  const totalProcessed = list.filter(r => {
    const st = r.trangThaiXuLy;
    return st && st !== "null" && st !== "undefined" && String(st).trim() !== "";
  }).length;

  // 4. Đã thanh toán (Thanh toán thành công)
  const countPaid = list.filter(r => {
    const x = normalizeStr(r.trangThaiXuLy || "").toLowerCase();
    return x === "thanh toán thành công" || x === "đã thanh toán" || x === "đã hoàn thành";
  }).length;

  // 5. Tự động đặt lại
  const countAutoReset = list.filter(r => {
    return normalizeStr(r.trangThaiXuLy || "").trim() === "Tự động đặt lại";
  }).length;

  // 6. Không liên hệ được
  const countUncontacted = list.filter(r => {
    return (r.trangThaiXuLy || "").trim().startsWith("Không liên hệ được");
  }).length;

  // 7. Đã liên hệ - Chờ thanh toán
  const countContactWaitPay = list.filter(r => {
    return (r.trangThaiXuLy || "").trim() === "Đã liên hệ - Chờ thanh toán";
  }).length;

  // 8. Đã liên hệ - Đã đặt lại
  const countContactRebooked = list.filter(r => {
    return (r.trangThaiXuLy || "").trim() === "Đã liên hệ - Đã đặt lại";
  }).length;

  // 9. Đã liên hệ - Chờ đặt lại
  const countContactWaitRebook = list.filter(r => {
    const x = (r.trangThaiXuLy || "").trim();
    return x === "Đã liên hệ - Chờ đặt lại" || x === "Đã liên hệ - Chờ" || x === "Đã liên hệ - Đang chờ";
  }).length;

  // Tổng số cuộc gọi liên hệ (Đã liên hệ + Không liên hệ được)
  const totalContacted = list.filter(r => (r.trangThaiXuLy || "").trim().startsWith("Đã liên hệ")).length;
  const totalCalls = totalContacted + countUncontacted;

  // 10. Tỉ lệ liên hệ được
  const rateContacted = totalCalls > 0 ? ((totalContacted / totalCalls) * 100).toFixed(1) : "0.0";

  // 11. Tỉ lệ liên hệ không được
  const rateUncontacted = totalCalls > 0 ? ((countUncontacted / totalCalls) * 100).toFixed(1) : "0.0";

  // Tính phần trăm so với tổng số đơn hiện tại
  const calcPct = cnt => currentTotal > 0 ? ((cnt / currentTotal) * 100).toFixed(1) + "%" : "0.0%";

  const kpiRows = [
    {
      stt: 1,
      title: "Tổng số đơn hủy",
      count: totalCancelled,
      pct: calcPct(totalCancelled),
      note: "Đơn có trạng thái đơn hàng là Đã hủy",
      badgeClass: "badge-danger",
      isHighlight: true
    },
    {
      stt: 2,
      title: "Số đơn chưa thanh toán",
      count: totalUnpaid,
      pct: calcPct(totalUnpaid),
      note: "Đơn có trạng thái đơn hàng là Chưa thanh toán",
      badgeClass: "badge-warning",
      isHighlight: true
    },
    {
      stt: 3,
      title: "Tổng số đơn đã được phân loại trạng thái đã xử lý",
      count: totalProcessed,
      pct: calcPct(totalProcessed),
      note: "Các đơn CSKH đã cập nhật trạng thái xử lý",
      badgeClass: "badge-info",
      isHighlight: true
    },
    {
      stt: 4,
      title: "Đã thanh toán",
      count: countPaid,
      pct: calcPct(countPaid),
      note: "Trạng thái xử lý: Thanh toán thành công / Đã thanh toán",
      badgeClass: "badge-success",
      isHighlight: false
    },
    {
      stt: 5,
      title: "Tự động đặt lại",
      count: countAutoReset,
      pct: calcPct(countAutoReset),
      note: "Trạng thái xử lý: Tự động đặt lại",
      badgeClass: "badge-secondary",
      isHighlight: false
    },
    {
      stt: 6,
      title: "Không liên hệ được",
      count: countUncontacted,
      pct: calcPct(countUncontacted),
      note: "Trạng thái xử lý: Không liên hệ được (Chờ thanh toán / Hủy)",
      badgeClass: "badge-warning",
      isHighlight: false
    },
    {
      stt: 7,
      title: "Đã liên hệ - Chờ thanh toán",
      count: countContactWaitPay,
      pct: calcPct(countContactWaitPay),
      note: "Trạng thái xử lý: Đã liên hệ - Chờ thanh toán",
      badgeClass: "badge-warning",
      isHighlight: false
    },
    {
      stt: 8,
      title: "Đã liên hệ - Đã đặt lại",
      count: countContactRebooked,
      pct: calcPct(countContactRebooked),
      note: "Trạng thái xử lý: Đã liên hệ - Đã đặt lại",
      badgeClass: "badge-success",
      isHighlight: false
    },
    {
      stt: 9,
      title: "Đã liên hệ - Chờ đặt lại",
      count: countContactWaitRebook,
      pct: calcPct(countContactWaitRebook),
      note: "Trạng thái xử lý: Đã liên hệ - Chờ đặt lại",
      badgeClass: "badge-secondary",
      isHighlight: false
    },
    {
      stt: 10,
      title: "Tỉ lệ liên hệ được",
      count: `${totalContacted} / ${totalCalls} cuộc`,
      pct: `${rateContacted}%`,
      note: `Tổng số cuộc gọi đã kết nối thành công (${totalContacted} cuộc)`,
      badgeClass: "badge-success",
      isHighlight: true
    },
    {
      stt: 11,
      title: "Tỉ lệ liên hệ không được",
      count: `${countUncontacted} / ${totalCalls} cuộc`,
      pct: `${rateUncontacted}%`,
      note: `Số cuộc gọi không thể liên lạc được (${countUncontacted} cuộc)`,
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
  const btnExpand = document.getElementById("btnExpandAllDepots");
  const btnCollapse = document.getElementById("btnCollapseAllDepots");

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
}

// Cập nhật tiêu đề và nạp dữ liệu cho Bảng Thống Kê Chi Tiết
function renderInlineDetailTable(records, line = "ALL", depot = "ALL") {
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
  if (line !== "ALL" && depot !== "ALL") {
    titleStr = `Bảng Thống Kê Chi Tiết: Hãng ${line} × Depot ${depot}`;
  } else if (line !== "ALL") {
    titleStr = `Bảng Thống Kê Chi Tiết: Hãng Tàu ${line} (Tất cả Depot)`;
  } else if (depot !== "ALL") {
    titleStr = `Bảng Thống Kê Chi Tiết: Depot ${depot} (Tất cả Hãng Tàu)`;
  } else {
    titleStr = `Bảng Thống Kê Chi Tiết Toàn Bộ Đơn Hàng`;
  }

  const statusDesc = currentMatrixStatus === "ALL" ? "Tất cả trạng thái" : currentMatrixStatus;
  const isFiltered = (line !== "ALL" || depot !== "ALL" || currentMatrixStatus !== "ALL");

  if (titleEl) titleEl.textContent = titleStr;
  if (subtitleEl) {
    subtitleEl.innerHTML = `Trạng thái: <strong>${statusDesc}</strong> • Đang xem <strong>${records.length}</strong> đơn hàng. ${isFiltered ? 'Nhấp vào nút "Hiện Tất Cả Đơn" để hủy lọc.' : 'Bấm vào bất kỳ ô số lượng nào trên Ma Trận để xem chi tiết.'}`;
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
        <td><span style="font-size: 12px; color: #475569;">${r.ngayDuocDuyet || r.ngayHuyDon || "-"}</span></td>
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
        <td><span style="font-size: 12px; color: #475569;">${r.ngayDuocDuyet || r.ngayHuyDon || "-"}</span></td>
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
}


