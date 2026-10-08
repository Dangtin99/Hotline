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

  // Khởi tạo tab từ URL query nếu có (?tab=verification)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("tab") === "verification") {
    switchUploadTab("verification");
  } else {
    loadHistoryList();
  }
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

// 3. Quản lý Lịch sử Đăng tải
async function loadHistoryList() {
  try {
    const res = await fetch("/api/history");
    const result = await res.json();
    if (!res.ok || result.status !== "success") return;

    renderHistoryTable(result.data);
  } catch (err) {
    console.error("Lỗi tải lịch sử:", err);
  }
}

function renderHistoryTable(history) {
  if (!history || history.length === 0) {
    tbodyHistory.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-muted">
          Chưa có lịch sử đăng tải nào. Hãy chọn file bên trên để import dữ liệu.
        </td>
      </tr>
    `;
    if (btnClearAllHistory) btnClearAllHistory.style.display = "none";
    return;
  }

  if (btnClearAllHistory) btnClearAllHistory.style.display = "inline-block";

  tbodyHistory.innerHTML = history.map(item => {
    return `
      <tr>
        <td><code>${item.id}</code></td>
        <td style="word-break: break-all;"><strong>${item.fileName}</strong></td>
        <td class="text-center">${item.uploadedAt}</td>
        <td class="text-center">
          <button type="button" class="btn btn-outline btn-sm text-danger" onclick="deleteHistoryItem('${item.id}')">Xóa</button>
        </td>
      </tr>
    `;
  }).join("");
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
  btnExecuteImportVerification.textContent = "Đang Import...";

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

// Tải danh sách lịch sử kiểm tra đơn
async function loadVerificationHistory() {
  if (!tbodyVerificationHistory) return;
  try {
    const res = await fetch("/api/verification/history");
    const result = await res.json();
    if (!res.ok || result.status !== "success") return;

    renderVerificationHistoryTable(result.data);
  } catch (err) {
    console.error("Lỗi tải lịch sử kiểm tra đơn:", err);
  }
}

// Hiển thị danh sách lịch sử kiểm tra đơn lên bảng
function renderVerificationHistoryTable(history) {
  if (!tbodyVerificationHistory) return;

  if (!history || history.length === 0) {
    tbodyVerificationHistory.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-muted">
          Chưa có lịch sử đăng tải kiểm tra đơn nào. Hãy chọn file bên trên để import dữ liệu.
        </td>
      </tr>
    `;
    if (btnClearAllVerificationHistory) btnClearAllVerificationHistory.style.display = "none";
    return;
  }

  if (btnClearAllVerificationHistory) btnClearAllVerificationHistory.style.display = "inline-block";

  tbodyVerificationHistory.innerHTML = history.map(item => {
    return `
      <tr>
        <td><code>${item.id}</code></td>
        <td style="word-break: break-all;">
          <strong>${item.fileName}</strong>
          <span class="text-muted" style="font-size: 0.85rem; margin-left: 6px;">(${item.fileSize})</span>
        </td>
        <td class="text-center"><strong>${Number(item.recordCount || 0).toLocaleString()}</strong> dòng</td>
        <td class="text-center">${item.uploadedAt}</td>
        <td class="text-center">
          <button type="button" class="btn btn-outline btn-sm text-danger" onclick="deleteVerificationHistoryItem('${item.id}')">Xóa</button>
        </td>
      </tr>
    `;
  }).join("");
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

function downloadTemplate(type) {
  const fileName = type === "approved" ? "mau_dang_tai_don_duyet.xlsx" : "mau_kiem_tra_don.xlsx";
  const link = document.createElement("a");
  link.href = `/api/template/${type}`;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
