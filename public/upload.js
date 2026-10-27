// upload.js - Logic dành riêng cho trang Đăng tải dữ liệu & Quản lý lịch sử

let selectedFileToUpload = null;
let selectedFileVerification = null;

// DOM Elements - Tab 1: Đơn duyệt
const dropzoneUpload = document.getElementById("dropzoneUpload");
const fileInputUpload = document.getElementById("fileInputUpload");
const btnSelectFile = document.getElementById("btnSelectFile");
const selectedFileInfo = document.getElementById("selectedFileInfo");
const uploadActionsBar = document.getElementById("uploadActionsBar");
const btnValidateFile = document.getElementById("btnValidateFile");
const btnExecuteImport = document.getElementById("btnExecuteImport");
const btnClearSelected = document.getElementById("btnClearSelected");
const validationResultCard = document.getElementById("validationResultCard");
const validationBadge = document.getElementById("validationBadge");
const validationTitle = document.getElementById("validationTitle");
const validationSummary = document.getElementById("validationSummary");
const tbodyValidationColumns = document.getElementById("tbodyValidationColumns");

// DOM Elements - Tab 2: Kiểm tra đơn
const dropzoneVerification = document.getElementById("dropzoneVerification");
const fileInputVerification = document.getElementById("fileInputVerification");
const btnSelectFileVerification = document.getElementById("btnSelectFileVerification");
const selectedFileInfoVerification = document.getElementById("selectedFileInfoVerification");
const uploadActionsBarVerification = document.getElementById("uploadActionsBarVerification");
const btnExecuteImportVerification = document.getElementById("btnExecuteImportVerification");
const btnClearSelectedVerification = document.getElementById("btnClearSelectedVerification");
const tbodyVerificationHistory = document.getElementById("tbodyVerificationHistory");
const btnClearAllVerificationHistory = document.getElementById("btnClearAllVerificationHistory");

// Template Download Elements
const btnDownloadTemplateApproved = document.getElementById("btnDownloadTemplateApproved");
const btnDownloadTemplateApprovedDropzone = document.getElementById("btnDownloadTemplateApprovedDropzone");
const btnDownloadTemplateVerification = document.getElementById("btnDownloadTemplateVerification");
const btnDownloadTemplateVerificationDropzone = document.getElementById("btnDownloadTemplateVerificationDropzone");

// History Elements - Tab 1
const tbodyHistory = document.getElementById("tbodyHistory");
const btnClearAllHistory = document.getElementById("btnClearAllHistory");

/**
 * Định dạng thời gian hiển thị chuẩn múi giờ Việt Nam (Asia/Ho_Chi_Minh, GMT+7)
 * Cấu trúc ngày: DD/MM/YYYY HH:mm:ss
 */
function formatToVietnamParts(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(dateObj);
  const p = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

function formatVietnamDateTime(val, id) {
  if (id && /^UP-(\d{12,14})$/.test(String(id).trim())) {
    const ms = Number(String(id).trim().replace("UP-", ""));
    if (!isNaN(ms)) {
      return formatToVietnamParts(new Date(ms));
    }
  }
  if (!val) return "";
  if (val instanceof Date || typeof val === "number") {
    return formatToVietnamParts(new Date(val));
  }
  const str = String(val).trim();
  if (str.includes("T") || str.endsWith("Z")) {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      return formatToVietnamParts(dt);
    }
  }
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ymdMatch) {
    const time = ymdMatch[4] !== undefined
      ? ` ${ymdMatch[4].padStart(2, "0")}:${ymdMatch[5].padStart(2, "0")}:${(ymdMatch[6] || "00").padStart(2, "0")}`
      : "";
    return `${ymdMatch[3].padStart(2, "0")}/${ymdMatch[2].padStart(2, "0")}/${ymdMatch[1]}${time}`;
  }
  return str;
}
const alertBox = document.getElementById("alertBox");

document.addEventListener("DOMContentLoaded", () => {
  // File interactions - Tab 1
  btnSelectFile.onclick = (e) => {
    e.stopPropagation();
    fileInputUpload.click();
  };
  dropzoneUpload.onclick = (e) => {
    if (e.target !== btnSelectFile && e.target !== btnDownloadTemplateApprovedDropzone) {
      fileInputUpload.click();
    }
  };

  // Template downloads
  if (btnDownloadTemplateApproved) {
    btnDownloadTemplateApproved.onclick = () => downloadTemplate("approved");
  }
  if (btnDownloadTemplateApprovedDropzone) {
    btnDownloadTemplateApprovedDropzone.onclick = (e) => {
      e.stopPropagation();
      downloadTemplate("approved");
    };
  }
  if (btnDownloadTemplateVerification) {
    btnDownloadTemplateVerification.onclick = () => downloadTemplate("verification");
  }
  if (btnDownloadTemplateVerificationDropzone) {
    btnDownloadTemplateVerificationDropzone.onclick = (e) => {
      e.stopPropagation();
      downloadTemplate("verification");
    };
  }

  fileInputUpload.onchange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Drag and drop
  dropzoneUpload.ondragover = (e) => {
    e.preventDefault();
    dropzoneUpload.classList.add("dragover");
  };
  dropzoneUpload.ondragleave = () => dropzoneUpload.classList.remove("dragover");
  dropzoneUpload.ondrop = (e) => {
    e.preventDefault();
    dropzoneUpload.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  // Tab 1: Actions
  btnValidateFile.onclick = handleValidateFile;
  btnExecuteImport.onclick = handleExecuteImport;
  btnClearSelected.onclick = clearSelectedFile;
  if (btnClearAllHistory) btnClearAllHistory.onclick = handleClearAllHistory;

  // Tab 2: File interactions
  if (btnSelectFileVerification) {
    btnSelectFileVerification.onclick = (e) => {
      e.stopPropagation();
      if (fileInputVerification) fileInputVerification.click();
    };
  }
  if (dropzoneVerification) {
    dropzoneVerification.onclick = (e) => {
      if (e.target !== btnSelectFileVerification && e.target !== btnDownloadTemplateVerificationDropzone && fileInputVerification) {
        fileInputVerification.click();
      }
    };
    dropzoneVerification.ondragover = (e) => {
      e.preventDefault();
      dropzoneVerification.classList.add("dragover");
    };
    dropzoneVerification.ondragleave = () => dropzoneVerification.classList.remove("dragover");
    dropzoneVerification.ondrop = (e) => {
      e.preventDefault();
      dropzoneVerification.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        setSelectedFileVerification(e.dataTransfer.files[0]);
      }
    };
  }
  if (fileInputVerification) {
    fileInputVerification.onchange = (e) => {
      if (e.target.files.length > 0) {
        setSelectedFileVerification(e.target.files[0]);
      }
    };
  }

  // Tab 2: Actions
  if (btnExecuteImportVerification) btnExecuteImportVerification.onclick = handleExecuteImportVerification;
  if (btnClearSelectedVerification) btnClearSelectedVerification.onclick = clearSelectedFileVerification;
  if (btnClearAllVerificationHistory) btnClearAllVerificationHistory.onclick = handleClearAllVerificationHistory;

  // Tab switching: Đăng tải dữ liệu đơn duyệt vs Đăng tải dữ liệu kiểm tra đơn
  const tabUploadApproved = document.getElementById("tabUploadApproved");
  const tabUploadVerification = document.getElementById("tabUploadVerification");
  const tabContentApproved = document.getElementById("tabContentApproved");
  const tabContentVerification = document.getElementById("tabContentVerification");
  const uploadHeaderTitle = document.getElementById("uploadHeaderTitle");
  const uploadHeaderSubtitle = document.getElementById("uploadHeaderSubtitle");

  function switchUploadTab(tabName) {
    if (tabName === "verification") {
      if (tabUploadApproved) tabUploadApproved.classList.remove("active");
      if (tabUploadVerification) tabUploadVerification.classList.add("active");
      if (tabContentApproved) tabContentApproved.style.display = "none";
      if (tabContentVerification) tabContentVerification.style.display = "block";
      if (uploadHeaderTitle) uploadHeaderTitle.textContent = "ĐĂNG TẢI DỮ LIỆU KIỂM TRA ĐƠN";
      if (uploadHeaderSubtitle) uploadHeaderSubtitle.textContent = "Khu vực tiếp nhận dữ liệu kiểm tra, đối soát và thẩm tra luồng xử lý";
      loadVerificationHistory();
    } else {
      if (tabUploadApproved) tabUploadApproved.classList.add("active");
      if (tabUploadVerification) tabUploadVerification.classList.remove("active");
      if (tabContentApproved) tabContentApproved.style.display = "block";
      if (tabContentVerification) tabContentVerification.style.display = "none";
      if (uploadHeaderTitle) uploadHeaderTitle.textContent = "ĐĂNG TẢI & QUẢN LÝ DỮ LIỆU ĐƠN HỦY";
      if (uploadHeaderSubtitle) uploadHeaderSubtitle.textContent = "Kiểm định cấu trúc form SQL PostgreSQL & Quản lý lịch sử nạp dữ liệu";
      loadHistoryList();
    }
  }

  if (tabUploadApproved) {
    tabUploadApproved.addEventListener("click", () => switchUploadTab("approved"));
  }
  if (tabUploadVerification) {
    tabUploadVerification.addEventListener("click", () => switchUploadTab("verification"));
  }

  // Bộ lọc lịch sử 4 ngày vs Tất cả
  const btnFilter4Days = document.getElementById("btnFilterHistory4Days");
  const btnFilterAll = document.getElementById("btnFilterHistoryAll");
  if (btnFilter4Days && btnFilterAll) {
    btnFilter4Days.onclick = () => {
      currentHistoryFilter = "4days";
      btnFilter4Days.classList.add("active", "btn-secondary");
      btnFilter4Days.classList.remove("btn-outline");
      btnFilterAll.classList.remove("active", "btn-secondary");
      btnFilterAll.classList.add("btn-outline");
      historyPage = 1;
      loadHistoryList();
    };
    btnFilterAll.onclick = () => {
      currentHistoryFilter = "all";
      btnFilterAll.classList.add("active", "btn-secondary");
      btnFilterAll.classList.remove("btn-outline");
      btnFilter4Days.classList.remove("active", "btn-secondary");
      btnFilter4Days.classList.add("btn-outline");
      historyPage = 1;
      loadHistoryList();
    };
  }

  const btnPrune = document.getElementById("btnPruneOldHistory");
  if (btnPrune) btnPrune.onclick = handlePruneOldHistory;

  // Quản lý sao lưu CSDL cục bộ
  const btnCreateBackup = document.getElementById("btnCreateBackupNow");
  if (btnCreateBackup) btnCreateBackup.onclick = handleCreateBackupNow;

  const btnDownloadDb = document.getElementById("btnDownloadDbFile");
  if (btnDownloadDb) {
    btnDownloadDb.onclick = () => {
      window.location.href = "/api/backup/download";
    };
  }

  const btnRefreshBackups = document.getElementById("btnRefreshBackupList");
  if (btnRefreshBackups) btnRefreshBackups.onclick = loadBackupList;

  // Khởi tạo tab từ URL query nếu có (?tab=verification)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("tab") === "verification") {
    switchUploadTab("verification");
  } else {
    loadHistoryList();
  }
  loadBackupList();
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

function setSelectedFile(file) {
  selectedFileToUpload = file;
  selectedFileInfo.style.display = "inline-block";
  selectedFileInfo.textContent = `Tệp đã chọn: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  uploadActionsBar.style.display = "flex";
  validationResultCard.style.display = "none";
  clearAlert();
}

function clearSelectedFile() {
  selectedFileToUpload = null;
  fileInputUpload.value = "";
  selectedFileInfo.style.display = "none";
  uploadActionsBar.style.display = "none";
  validationResultCard.style.display = "none";
  clearAlert();
}

// 1. Kiểm tra cấu trúc file với PostgreSQL Form
async function handleValidateFile() {
  if (!selectedFileToUpload) {
    showAlert("Vui lòng chọn file trước khi kiểm tra!");
    return;
  }

  clearAlert();
  btnValidateFile.disabled = true;
  btnValidateFile.textContent = "Đang kiểm tra...";

  const formData = new FormData();
  formData.append("file", selectedFileToUpload);

  try {
    const res = await fetch("/api/validate", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi kiểm tra file.");
    }

    renderValidationResult(result.validation, selectedFileToUpload.name);
    showAlert("Đã hoàn tất kiểm tra cấu trúc file với form PostgreSQL!", false);
  } catch (err) {
    showAlert(err.message || "Không thể kiểm tra file.");
  } finally {
    btnValidateFile.disabled = false;
    btnValidateFile.textContent = "Kiểm Tra Form SQL";
  }
}

function renderValidationResult(val, fileName) {
  validationResultCard.style.display = "block";

  if (val.isValid) {
    validationBadge.className = "badge badge-success";
    validationBadge.textContent = `HỢP LỆ (${val.matchPercent}% Khớp)`;
    validationTitle.textContent = `File "${fileName}" hoàn toàn khớp chuẩn bảng PostgreSQL [${val.tableName}]`;
    validationSummary.innerHTML = `<span style="color: var(--success); font-weight: 600;">Dữ liệu sẵn sàng import: ${val.dataRowsCount} dòng hợp lệ.</span>`;
  } else {
    validationBadge.className = "badge badge-danger";
    validationBadge.textContent = `CHƯA KHỚP (${val.matchPercent}% Khớp)`;
    validationTitle.textContent = `File "${fileName}" thiếu một số cột bắt buộc`;
    validationSummary.innerHTML = `<span style="color: var(--danger); font-weight: 600;">Thiếu: ${val.missingRequired.join(", ")}</span>`;
  }

  tbodyValidationColumns.innerHTML = val.columnsCheck.map(c => {
    const isMatched = c.status === "MATCHED";
    const statusBadge = isMatched
      ? `<span class="badge badge-success">Đã khớp (${c.matchedName})</span>`
      : c.required
      ? `<span class="badge badge-danger">Thiếu cột bắt buộc</span>`
      : `<span class="badge badge-info">Tùy chọn (Bỏ trống)</span>`;

    const reqLabel = c.required
      ? `<strong style="color: var(--danger);">Bắt buộc</strong>`
      : `<span style="color: var(--text-muted);">Không bắt buộc</span>`;

    return `
      <tr>
        <td><strong>${c.excelHeader}</strong></td>
        <td><code>${c.sqlColumn}</code></td>
        <td><span style="font-family: monospace; color: var(--blue-primary);">${c.type}</span></td>
        <td>${reqLabel}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("");

  validationResultCard.scrollIntoView({ behavior: "smooth" });
}

// 2. Import dữ liệu vào hệ thống
async function handleExecuteImport() {
  if (!selectedFileToUpload) {
    showAlert("Vui lòng chọn file để import!");
    return;
  }

  btnExecuteImport.disabled = true;
  btnExecuteImport.textContent = "Đang Import...";

  const formData = new FormData();
  formData.append("file", selectedFileToUpload);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi import file.");
    }

    showAlert(`${result.message} Đang chuyển hướng sang Bảng Dữ Liệu SQL...`, false);

    // Chuyển hướng sang Bảng dữ liệu để xem toàn bộ dữ liệu đã tích lũy
    setTimeout(() => {
      window.location.href = `data-table.html`;
    }, 1200);
  } catch (err) {
    showAlert(err.message || "Không thể import dữ liệu.");
    btnExecuteImport.disabled = false;
    btnExecuteImport.textContent = "Import Dữ Liệu Vào Hệ Thống";
  }
}

// 3. Quản lý Lịch sử Đăng tải Đơn duyệt & Phân trang
let currentHistoryFilter = "4days"; // '4days' hoặc 'all'
let historyPage = 1;
const historyPageSize = 10;
let rawHistoryData = [];

async function loadHistoryList() {
  try {
    const url = currentHistoryFilter === "4days" ? "/api/history?filter=4days" : "/api/history";
    const res = await fetch(url);
    const result = await res.json();
    if (!res.ok || result.status !== "success") return;

    rawHistoryData = result.data || [];
    renderHistoryTable();
  } catch (err) {
    console.error("Lỗi tải lịch sử:", err);
  }
}

function renderHistoryTable() {
  if (!tbodyHistory) return;
  const total = rawHistoryData.length;
  const totalPages = Math.max(1, Math.ceil(total / historyPageSize));
  if (historyPage > totalPages) historyPage = totalPages;

  const startIdx = (historyPage - 1) * historyPageSize;
  const endIdx = Math.min(startIdx + historyPageSize, total);
  const pageItems = rawHistoryData.slice(startIdx, endIdx);

  if (total === 0) {
    tbodyHistory.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-muted">
          Chưa có lịch sử đăng tải nào ${currentHistoryFilter === "4days" ? "trong 4 ngày gần nhất" : ""}. Hãy chọn file bên trên để import dữ liệu.
        </td>
      </tr>
    `;
    if (btnClearAllHistory) btnClearAllHistory.style.display = "none";
    renderHistoryPagination(0, 0, 0, 1);
    return;
  }

  if (btnClearAllHistory) btnClearAllHistory.style.display = "inline-block";

  tbodyHistory.innerHTML = pageItems.map(item => {
    return `
      <tr>
        <td><code>${item.id}</code></td>
        <td style="word-break: break-all;"><strong>${item.fileName}</strong></td>
        <td class="text-center">${formatVietnamDateTime(item.uploadedAt, item.id)}</td>
        <td class="text-center">
          <button type="button" class="btn btn-outline btn-sm text-danger" onclick="deleteHistoryItem('${item.id}')">Xóa</button>
        </td>
      </tr>
    `;
  }).join("");

  renderHistoryPagination(startIdx + 1, endIdx, total, totalPages);
}

function renderHistoryPagination(start, end, total, totalPages) {
  const infoEl = document.getElementById("historyPaginationInfo");
  const controlsEl = document.getElementById("historyPaginationControls");
  if (!infoEl || !controlsEl) return;

  if (total === 0) {
    infoEl.textContent = "Không có dữ liệu đợt tải.";
    controlsEl.innerHTML = "";
    return;
  }

  infoEl.innerHTML = `Hiển thị <strong>${start} - ${end}</strong> trên tổng số <strong>${total}</strong> đợt tải (Trang ${historyPage}/${totalPages})`;

  let html = "";
  html += `<button type="button" class="btn btn-outline btn-sm" ${historyPage <= 1 ? "disabled" : ""} onclick="changeHistoryPage(${historyPage - 1})">&laquo; Trước</button>`;

  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7) {
      if (p !== 1 && p !== totalPages && Math.abs(p - historyPage) > 1) {
        if (p === 2 || p === totalPages - 1) {
          html += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
        }
        continue;
      }
    }
    const activeClass = p === historyPage ? "btn-secondary" : "btn-outline";
    html += `<button type="button" class="btn ${activeClass} btn-sm" onclick="changeHistoryPage(${p})">${p}</button>`;
  }

  html += `<button type="button" class="btn btn-outline btn-sm" ${historyPage >= totalPages ? "disabled" : ""} onclick="changeHistoryPage(${historyPage + 1})">Sau &raquo;</button>`;
  controlsEl.innerHTML = html;
}

window.changeHistoryPage = function(p) {
  historyPage = p;
  renderHistoryTable();
};

async function handlePruneOldHistory() {
  if (!confirm("Bạn có muốn dọn dẹp các đợt tải cũ hơn 4 ngày khỏi lịch sử trang không?\n\nLƯU Ý: Thao tác này CHỈ dọn dẹp lịch sử hiển thị, toàn bộ dữ liệu đơn hàng trong CSDL SQL vẫn được bảo toàn nguyên vẹn 100%!")) {
    return;
  }

  try {
    const res = await fetch("/api/history/prune-4days", { method: "POST" });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi dọn dẹp lịch sử.");
    }
    showAlert(result.message, false);
    historyPage = 1;
    loadHistoryList();
  } catch (err) {
    showAlert(err.message);
  }
}

// Xóa 1 bản ghi lịch sử - Đơn duyệt
window.deleteHistoryItem = async function(id) {
  if (!confirm(`Bạn có chắc chắn muốn xóa dữ liệu đợt tải [${id}] khỏi hệ thống không?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi xóa dữ liệu.");
    }

    showAlert("Đã xóa bản ghi dữ liệu thành công!", false);
    loadHistoryList();
  } catch (err) {
    showAlert(err.message);
  }
};

// Xóa toàn bộ lịch sử - Đơn duyệt
async function handleClearAllHistory() {
  if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ lịch sử đăng tải không? Thao tác này không thể hoàn tác.")) {
    return;
  }

  try {
    const res = await fetch("/api/history", { method: "DELETE" });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi xóa lịch sử.");
    }

    showAlert("Đã dọn dẹp sạch toàn bộ lịch sử dữ liệu.", false);
    loadHistoryList();
  } catch (err) {
    showAlert(err.message);
  }
}

// =========================================================================
// CÁC HÀM XỬ LÝ CHO TAB 2: ĐĂNG TẢI DỮ LIỆU KIỂM TRA ĐƠN
// =========================================================================

function setSelectedFileVerification(file) {
  selectedFileVerification = file;
  if (selectedFileInfoVerification) {
    selectedFileInfoVerification.style.display = "inline-block";
    const sizeStr = file.size > 1024 * 1024
      ? (file.size / (1024 * 1024)).toFixed(2) + " MB"
      : (file.size / 1024).toFixed(1) + " KB";
    selectedFileInfoVerification.textContent = `Tệp đã chọn: ${file.name} (${sizeStr})`;
  }
  if (uploadActionsBarVerification) {
    uploadActionsBarVerification.style.display = "flex";
  }
  clearAlert();
}

function clearSelectedFileVerification() {
  selectedFileVerification = null;
  if (fileInputVerification) fileInputVerification.value = "";
  if (selectedFileInfoVerification) selectedFileInfoVerification.style.display = "none";
  if (uploadActionsBarVerification) uploadActionsBarVerification.style.display = "none";
  clearAlert();
}

// Import dữ liệu kiểm tra đơn
async function handleExecuteImportVerification() {
  if (!selectedFileVerification) {
    showAlert("Vui lòng chọn file kiểm tra đơn trước khi import!");
    return;
  }

  btnExecuteImportVerification.disabled = true;
  btnExecuteImportVerification.textContent = "Đang xử lý & lưu dữ liệu...";
  showAlert("Đang trích xuất dữ liệu và đồng bộ vào cơ sở dữ liệu...", false);

  const formData = new FormData();
  formData.append("file", selectedFileVerification);

  try {
    const res = await fetch("/api/verification/upload", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi import file kiểm tra đơn.");
    }

    showAlert(`${result.message} Đang chuyển hướng sang Bảng Dữ Liệu Check Đơn...`, false);
    clearSelectedFileVerification();
    loadVerificationHistory();

    setTimeout(() => {
      window.location.href = "verification-table.html";
    }, 1200);
  } catch (err) {
    showAlert(err.message || "Không thể import dữ liệu kiểm tra đơn.");
  } finally {
    btnExecuteImportVerification.disabled = false;
    btnExecuteImportVerification.textContent = "Import Dữ Liệu Kiểm Tra";
  }
}

// Tải danh sách lịch sử kiểm tra đơn & Phân trang
let verificationPage = 1;
const verificationPageSize = 10;
let rawVerificationData = [];

async function loadVerificationHistory() {
  if (!tbodyVerificationHistory) return;
  try {
    const res = await fetch("/api/verification/history");
    const result = await res.json();
    if (!res.ok || result.status !== "success") return;

    const list = result.data || [];
    const parseItemTime = (item) => {
      if (!item) return 0;
      if (item.createdAt) {
        const t = new Date(item.createdAt).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      const val = item.uploadedAt;
      if (!val) return 0;
      const str = String(val).trim();
      const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (dmy) {
        return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10), parseInt(dmy[4] || 0, 10), parseInt(dmy[5] || 0, 10), parseInt(dmy[6] || 0, 10)).getTime();
      }
      const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (ymd) {
        return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), parseInt(ymd[4] || 0, 10), parseInt(ymd[5] || 0, 10), parseInt(ymd[6] || 0, 10)).getTime();
      }
      const t = new Date(str).getTime();
      return isNaN(t) ? 0 : t;
    };

    rawVerificationData = [...list].sort((a, b) => parseItemTime(b) - parseItemTime(a));
    renderVerificationHistoryTable();
  } catch (err) {
    console.error("Lỗi tải lịch sử kiểm tra đơn:", err);
  }
}

// Hiển thị danh sách lịch sử kiểm tra đơn lên bảng có phân trang
function renderVerificationHistoryTable() {
  if (!tbodyVerificationHistory) return;
  const total = rawVerificationData.length;
  const totalPages = Math.max(1, Math.ceil(total / verificationPageSize));
  if (verificationPage > totalPages) verificationPage = totalPages;

  const startIdx = (verificationPage - 1) * verificationPageSize;
  const endIdx = Math.min(startIdx + verificationPageSize, total);
  const pageItems = rawVerificationData.slice(startIdx, endIdx);

  if (total === 0) {
    tbodyVerificationHistory.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-muted">
          Chưa có lịch sử đăng tải kiểm tra đơn nào. Hãy chọn file bên trên để import dữ liệu.
        </td>
      </tr>
    `;
    if (btnClearAllVerificationHistory) btnClearAllVerificationHistory.style.display = "none";
    renderVerificationPagination(0, 0, 0, 1);
    return;
  }

  if (btnClearAllVerificationHistory) btnClearAllVerificationHistory.style.display = "inline-block";

  tbodyVerificationHistory.innerHTML = pageItems.map(item => {
    return `
      <tr>
        <td>
          <a href="javascript:void(0)" onclick="downloadVerificationHistoryItem('${item.id}')" title="Bấm để tải về file bản mẫu kiểm tra đơn (${item.id})" style="text-decoration:none;cursor:pointer;">
            <code>${item.id}</code>
          </a>
        </td>
        <td style="word-break: break-all;">
          <strong>${item.fileName}</strong>
          <span class="text-muted" style="font-size: 0.85rem; margin-left: 6px;">(${item.fileSize})</span>
        </td>
        <td class="text-center"><strong>${Number(item.recordCount || 0).toLocaleString()}</strong> dòng</td>
        <td class="text-center">${formatVietnamDateTime(item.uploadedAt, item.id)}</td>
        <td class="text-center" style="white-space: nowrap;">
          <button type="button" class="btn btn-outline btn-sm" style="margin-right: 6px; font-weight: 600;" onclick="downloadVerificationHistoryItem('${item.id}')">Tải Về</button>
          <button type="button" class="btn btn-outline btn-sm text-danger" onclick="deleteVerificationHistoryItem('${item.id}')">Xóa</button>
        </td>
      </tr>
    `;
  }).join("");

  renderVerificationPagination(startIdx + 1, endIdx, total, totalPages);
}

function renderVerificationPagination(start, end, total, totalPages) {
  const infoEl = document.getElementById("verificationPaginationInfo");
  const controlsEl = document.getElementById("verificationPaginationControls");
  if (!infoEl || !controlsEl) return;

  if (total === 0) {
    infoEl.textContent = "Không có dữ liệu đợt tải kiểm tra.";
    controlsEl.innerHTML = "";
    return;
  }

  infoEl.innerHTML = `Hiển thị <strong>${start} - ${end}</strong> trên tổng số <strong>${total}</strong> đợt tải (Trang ${verificationPage}/${totalPages})`;

  let html = "";
  html += `<button type="button" class="btn btn-outline btn-sm" ${verificationPage <= 1 ? "disabled" : ""} onclick="changeVerificationPage(${verificationPage - 1})">&laquo; Trước</button>`;

  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7) {
      if (p !== 1 && p !== totalPages && Math.abs(p - verificationPage) > 1) {
        if (p === 2 || p === totalPages - 1) {
          html += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
        }
        continue;
      }
    }
    const activeClass = p === verificationPage ? "btn-secondary" : "btn-outline";
    html += `<button type="button" class="btn ${activeClass} btn-sm" onclick="changeVerificationPage(${p})">${p}</button>`;
  }

  html += `<button type="button" class="btn btn-outline btn-sm" ${verificationPage >= totalPages ? "disabled" : ""} onclick="changeVerificationPage(${verificationPage + 1})">Sau &raquo;</button>`;
  controlsEl.innerHTML = html;
}

window.changeVerificationPage = function(p) {
  verificationPage = p;
  renderVerificationHistoryTable();
};

// =========================================================================
// QUẢN LÝ SAO LƯU CƠ SỞ DỮ LIỆU CỤC BỘ (DATABASE BACKUP)
// =========================================================================

async function loadBackupList() {
  const tbody = document.getElementById("tbodyBackupList");
  const txtPath = document.getElementById("txtBackupFolderPath");
  if (!tbody) return;

  try {
    const res = await fetch("/api/backup/list");
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3 text-danger">Không thể nạp danh sách sao lưu.</td></tr>`;
      return;
    }

    if (txtPath && result.backupDir) {
      txtPath.textContent = result.backupDir;
    }

    const backups = result.data || [];
    if (backups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3 text-muted">Chưa có bản sao lưu nào trong thư mục máy tính. Bấm "Sao Lưu Vào Máy Tính Ngay" để tạo bản đầu tiên.</td></tr>`;
      return;
    }

    tbody.innerHTML = backups.map(b => `
      <tr>
        <td><strong>${b.fileName}</strong></td>
        <td class="text-center"><strong>${b.sizeMB} MB</strong></td>
        <td class="text-center">${formatVietnamDateTime(b.createdAt)}</td>
        <td class="text-center">
          <span class="badge" style="background: #ecfdf5; color: #166534; font-weight: 600; padding: 4px 8px; border-radius: 4px;">An toàn</span>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Lỗi tải danh sách sao lưu:", err);
  }
}

async function handleCreateBackupNow() {
  const btn = document.getElementById("btnCreateBackupNow");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang sao lưu...";
  }

  try {
    const res = await fetch("/api/backup/create", { method: "POST" });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi tạo bản sao lưu.");
    }
    showAlert(`Đã tạo bản sao lưu an toàn tại: ${result.data.fileName} (${result.data.sizeMB} MB)`, false);
    loadBackupList();
  } catch (err) {
    showAlert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Sao Lưu Vào Máy Tính Ngay";
    }
  }
}

// Xóa 1 bản ghi lịch sử kiểm tra đơn
window.deleteVerificationHistoryItem = async function(id) {
  if (!confirm(`Bạn có chắc chắn muốn xóa dữ liệu đợt tải kiểm tra [${id}] khỏi hệ thống không?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/verification/history/${id}`, { method: "DELETE" });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi xóa dữ liệu kiểm tra đơn.");
    }

    showAlert("Đã xóa bản ghi dữ liệu kiểm tra đơn thành công!", false);
    loadVerificationHistory();
  } catch (err) {
    showAlert(err.message);
  }
};

// Xóa toàn bộ lịch sử kiểm tra đơn
async function handleClearAllVerificationHistory() {
  if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ lịch sử đăng tải kiểm tra đơn không? Thao tác này không thể hoàn tác.")) {
    return;
  }

  try {
    const res = await fetch("/api/verification/history", { method: "DELETE" });
    const result = await res.json();
    if (!res.ok || result.status !== "success") {
      throw new Error(result.message || "Lỗi khi xóa lịch sử kiểm tra đơn.");
    }

    showAlert("Đã dọn dẹp sạch toàn bộ lịch sử dữ liệu kiểm tra đơn.", false);
    loadVerificationHistory();
  } catch (err) {
    showAlert(err.message);
  }
}

// =========================================================================
// HÀM TẢI FILE EXCEL BẢN MẪU
// =========================================================================

function generateVerificationId() {
  const now = new Date();
  const vParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const vp = {};
  for (const part of vParts) { vp[part.type] = part.value; }
  return `VER-${vp.year}${vp.month}${vp.day}-${String(Date.now()).slice(-4)}`;
}

function downloadTemplate(type, customId) {
  let fileName = "";
  let url = `/api/template/${type}`;

  if (type === "verification" || type === "eir") {
    const id = customId || generateVerificationId();
    fileName = `mau_kiem_tra_don_${id}.xlsx`;
    url += `?id=${encodeURIComponent(id)}`;
  } else {
    fileName = customId ? `mau_dang_tai_don_duyet_${customId}.xlsx` : "mau_dang_tai_don_duyet.xlsx";
    if (customId) url += `?id=${encodeURIComponent(customId)}`;
  }

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Tải file bản mẫu dữ liệu kiểm tra đơn theo ID của dòng dữ liệu đó
window.downloadVerificationHistoryItem = async function(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return;

  const fileName = `mau_kiem_tra_don_${cleanId}.xlsx`;
  const primaryUrl = `/api/verification/history/${encodeURIComponent(cleanId)}/download`;
  const fallbackUrl = `/api/template/verification?id=${encodeURIComponent(cleanId)}`;

  try {
    const res = await fetch(primaryUrl);
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      return;
    }
  } catch (e) {
    console.warn("Lỗi tải file trực tiếp, kích hoạt tải fallback bản mẫu", e);
  }

  // Fallback tải qua template với tên mau_kiem_tra_don_[ID].xlsx
  const link = document.createElement("a");
  link.href = fallbackUrl;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
