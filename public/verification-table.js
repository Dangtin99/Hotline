// verification-table.js - Xử lý hiển thị, lọc và phân trang bảng dữ liệu kiểm tra đơn (EIR)

let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let pageSize = 50;

// DOM Elements
const tbodyVerificationData = document.getElementById("tbodyVerificationData");
const totalRowsBadge = document.getElementById("totalRowsBadge");
const badgeFileCount = document.getElementById("badgeFileCount");
const alertBox = document.getElementById("alertBox");

// KPIs
const kpiTotalOrders = document.getElementById("kpiTotalOrders");
const kpiTotalTeus = document.getElementById("kpiTotalTeus");
const kpiDirectionRatio = document.getElementById("kpiDirectionRatio");
const kpiActivatedOrders = document.getElementById("kpiActivatedOrders");
const kpiPaidOrders = document.getElementById("kpiPaidOrders");

// Filters
const searchInput = document.getElementById("searchInput");
const filterDepot = document.getElementById("filterDepot");
const filterLine = document.getElementById("filterLine");
const filterDirection = document.getElementById("filterDirection");
const filterStatus = document.getElementById("filterStatus");
const filterActivation = document.getElementById("filterActivation");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const btnClearDateFilter = document.getElementById("btnClearDateFilter");
const btnResetFilter = document.getElementById("btnResetFilter");
const btnExportCsv = document.getElementById("btnExportCsv");
const btnDownloadSqlDump = document.getElementById("btnDownloadSqlDump");

// Pagination Elements
const paginationInfo = document.getElementById("paginationInfo");
const selectPageSize = document.getElementById("selectPageSize");
const btnPageFirst = document.getElementById("btnPageFirst");
const btnPagePrev = document.getElementById("btnPagePrev");
const btnPageNext = document.getElementById("btnPageNext");
const btnPageLast = document.getElementById("btnPageLast");
const pageIndicator = document.getElementById("pageIndicator");

// Modal Elements
const modalOrderDetail = document.getElementById("modalOrderDetail");
const modalOrderTitle = document.getElementById("modalOrderTitle");
const modalDetailContent = document.getElementById("modalDetailContent");
const btnModalClose = document.getElementById("btnModalClose");

document.addEventListener("DOMContentLoaded", () => {
  // Lắng nghe sự kiện tìm kiếm & lọc
  if (searchInput) searchInput.addEventListener("input", () => { currentPage = 1; applyFilters(); });
  if (filterDepot) filterDepot.addEventListener("change", () => { currentPage = 1; applyFilters(); });
  if (filterLine) filterLine.addEventListener("change", () => { currentPage = 1; applyFilters(); });
  if (filterDirection) filterDirection.addEventListener("change", () => { currentPage = 1; applyFilters(); });
  if (filterStatus) filterStatus.addEventListener("change", () => { currentPage = 1; applyFilters(); });
  if (filterActivation) filterActivation.addEventListener("change", () => { currentPage = 1; applyFilters(); });

  if (filterDateFrom) filterDateFrom.addEventListener("change", onDateFilterChange);
  if (filterDateTo) filterDateTo.addEventListener("change", onDateFilterChange);
  if (btnClearDateFilter) btnClearDateFilter.addEventListener("click", clearDateFilter);

  if (btnResetFilter) btnResetFilter.addEventListener("click", resetAllFilters);
  if (btnExportCsv) btnExportCsv.addEventListener("click", exportToCsv);
  if (btnDownloadSqlDump) {
    btnDownloadSqlDump.addEventListener("click", () => {
      window.location.href = "/api/verification/download-sql";
    });
  }

  // Phân trang
  if (selectPageSize) {
    selectPageSize.addEventListener("change", (e) => {
      pageSize = e.target.value === "all" ? 999999 : parseInt(e.target.value, 10);
      currentPage = 1;
      renderTable();
    });
  }
  if (btnPageFirst) btnPageFirst.addEventListener("click", () => { currentPage = 1; renderTable(); });
  if (btnPagePrev) btnPagePrev.addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderTable(); } });
  if (btnPageNext) btnPageNext.addEventListener("click", () => {
    const maxPage = Math.ceil(filteredRecords.length / pageSize) || 1;
    if (currentPage < maxPage) { currentPage++; renderTable(); }
  });
  if (btnPageLast) btnPageLast.addEventListener("click", () => {
    const maxPage = Math.ceil(filteredRecords.length / pageSize) || 1;
    currentPage = maxPage;
    renderTable();
  });

  // Đóng modal
  if (btnModalClose) btnModalClose.addEventListener("click", closeModal);
  if (modalOrderDetail) {
    modalOrderDetail.addEventListener("click", (e) => {
      if (e.target === modalOrderDetail) closeModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOrderDetail && modalOrderDetail.classList.contains("active")) {
      closeModal();
    }
  });

  // Tải dữ liệu ban đầu
  loadVerificationDataset();
});

function showAlert(msg, isError = true) {
  if (!alertBox) return;
  alertBox.hidden = false;
  alertBox.textContent = msg;
  alertBox.style.background = isError ? "#fef2f2" : "#ecfdf5";
  alertBox.style.color = isError ? "var(--danger)" : "var(--success)";
  alertBox.style.borderColor = isError ? "#fecaca" : "#a7f3d0";
}

function clearAlert() {
  if (!alertBox) return;
  alertBox.hidden = true;
  alertBox.textContent = "";
}

async function loadVerificationDataset() {
  clearAlert();
  try {
    const res = await fetch("/api/verification/all-data");
    const json = await res.json();
    if (!res.ok || json.status !== "success") {
      throw new Error(json.message || "Không thể tải dữ liệu kiểm tra đơn.");
    }

    allRecords = Array.isArray(json.records) ? json.records : [];
    const stats = json.stats || {};

    if (totalRowsBadge) {
      totalRowsBadge.textContent = `${allRecords.length.toLocaleString()} đơn hàng`;
    }
    if (badgeFileCount && stats.fileCount !== undefined) {
      badgeFileCount.textContent = `${stats.fileCount} tệp đã tích lũy`;
    }

    populateFilterDropdowns();
    updateKpis(allRecords);
    applyFilters();
  } catch (err) {
    console.error("Lỗi tải dữ liệu kiểm tra đơn:", err);
    showAlert(`Lỗi kết nối cơ sở dữ liệu: ${err.message}`, true);
    if (tbodyVerificationData) {
      tbodyVerificationData.innerHTML = `
        <tr>
          <td colspan="21" class="text-center py-4 text-danger">
            Không thể tải dữ liệu từ máy chủ. Vui lòng kiểm tra lại kết nối.
          </td>
        </tr>
      `;
    }
  }
}

function populateFilterDropdowns() {
  const depots = [...new Set(allRecords.map(r => r.depot).filter(Boolean))].sort();
  const lines = [...new Set(allRecords.map(r => r.hangTau).filter(Boolean))].sort();
  const statuses = [...new Set(allRecords.map(r => r.trangThaiDonHang).filter(Boolean))].sort();

  if (filterDepot) {
    filterDepot.innerHTML = '<option value="">Tất cả Depot</option>' +
      depots.map(d => `<option value="${d}">${d}</option>`).join("");
  }
  if (filterLine) {
    filterLine.innerHTML = '<option value="">Tất cả Hãng tàu</option>' +
      lines.map(l => `<option value="${l}">${l}</option>`).join("");
  }
  if (filterStatus) {
    filterStatus.innerHTML = '<option value="">Trạng thái đơn</option>' +
      statuses.map(s => `<option value="${s}">${s}</option>`).join("");
  }
}

function updateKpis(records) {
  const total = records.length;
  const totalTeus = records.reduce((sum, r) => sum + (Number(r.sizeTeus) || 0), 0);
  const countIn = records.filter(r => String(r.loaiDonHang).toUpperCase().includes("IN")).length;
  const countOut = records.filter(r => String(r.loaiDonHang).toUpperCase().includes("OUT")).length;
  const countActivated = records.filter(r => String(r.trangThaiKichHoat).includes("Đã kích hoạt")).length;
  const countPaid = records.filter(r => String(r.trangThaiDonHang).toLowerCase().includes("đã thanh toán")).length;

  if (kpiTotalOrders) kpiTotalOrders.textContent = total.toLocaleString();
  if (kpiTotalTeus) kpiTotalTeus.textContent = totalTeus.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  if (kpiDirectionRatio) kpiDirectionRatio.textContent = `${countIn.toLocaleString()} IN / ${countOut.toLocaleString()} OUT`;
  if (kpiActivatedOrders) kpiActivatedOrders.textContent = countActivated.toLocaleString();
  if (kpiPaidOrders) kpiPaidOrders.textContent = countPaid.toLocaleString();
}

function onDateFilterChange() {
  const from = filterDateFrom?.value;
  const to = filterDateTo?.value;
  if (btnClearDateFilter) {
    btnClearDateFilter.style.display = (from || to) ? "inline-block" : "none";
  }
  currentPage = 1;
  applyFilters();
}

function clearDateFilter() {
  if (filterDateFrom) filterDateFrom.value = "";
  if (filterDateTo) filterDateTo.value = "";
  if (btnClearDateFilter) btnClearDateFilter.style.display = "none";
  currentPage = 1;
  applyFilters();
}

function resetAllFilters() {
  if (searchInput) searchInput.value = "";
  if (filterDepot) filterDepot.value = "";
  if (filterLine) filterLine.value = "";
  if (filterDirection) filterDirection.value = "";
  if (filterStatus) filterStatus.value = "";
  if (filterActivation) filterActivation.value = "";
  clearDateFilter();
  currentPage = 1;
  applyFilters();
}

function applyFilters() {
  const term = (searchInput?.value || "").trim().toLowerCase();
  const depot = filterDepot?.value || "";
  const line = filterLine?.value || "";
  const dir = filterDirection?.value || "";
  const status = filterStatus?.value || "";
  const activation = filterActivation?.value || "";
  const fromDate = filterDateFrom?.value || "";
  const toDate = filterDateTo?.value || "";

  filteredRecords = allRecords.filter(r => {
    // 1. Text search
    if (term) {
      const match =
        (r.sttFile && String(r.sttFile).toLowerCase().includes(term)) ||
        (r.soBooking && String(r.soBooking).toLowerCase().includes(term)) ||
        (r.soContainer && String(r.soContainer).toLowerCase().includes(term)) ||
        (r.tenTaiXe && String(r.tenTaiXe).toLowerCase().includes(term)) ||
        (r.sdtTaiXe && String(r.sdtTaiXe).toLowerCase().includes(term)) ||
        (r.tenNhaXe && String(r.tenNhaXe).toLowerCase().includes(term)) ||
        (r.depot && String(r.depot).toLowerCase().includes(term)) ||
        (r.hangTau && String(r.hangTau).toLowerCase().includes(term)) ||
        (r.lyDoHuy && String(r.lyDoHuy).toLowerCase().includes(term)) ||
        (r.lyDoTuChoi && String(r.lyDoTuChoi).toLowerCase().includes(term));
      if (!match) return false;
    }

    // 2. Depot
    if (depot && r.depot !== depot) return false;

    // 3. Line
    if (line && r.hangTau !== line) return false;

    // 4. Direction
    if (dir && r.loaiDonHang !== dir) return false;

    // 5. Status
    if (status && r.trangThaiDonHang !== status) return false;

    // 6. Activation
    if (activation && r.trangThaiKichHoat !== activation) return false;

    // 7. Date range
    if (fromDate || toDate) {
      const dateVal = (r.ngayHuyDon || "").substring(0, 10);
      if (fromDate && dateVal && dateVal < fromDate) return false;
      if (toDate && dateVal && dateVal > toDate) return false;
    }

    return true;
  });

  updateKpis(filteredRecords);
  renderTable();
}

function renderTable() {
  if (!tbodyVerificationData) return;

  const total = filteredRecords.length;
  if (total === 0) {
    tbodyVerificationData.innerHTML = `
      <tr>
        <td colspan="21" class="text-center py-4 text-muted">
          Không tìm thấy đơn kiểm tra nào phù hợp với bộ lọc.
        </td>
      </tr>
    `;
    updatePaginationControls(0, 0, 0);
    return;
  }

  const maxPage = Math.ceil(total / pageSize) || 1;
  if (currentPage > maxPage) currentPage = maxPage;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageSlice = filteredRecords.slice(startIndex, endIndex);

  tbodyVerificationData.innerHTML = pageSlice.map((r, idx) => {
    const globalIdx = startIndex + idx + 1;

    // Badges
    const dirBadge = r.loaiDonHang === "OUT"
      ? '<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;">OUT</span>'
      : r.loaiDonHang === "IN"
      ? '<span class="badge" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;">IN</span>'
      : '<span class="badge badge-info">N/A</span>';

    const actBadge = r.trangThaiKichHoat === "Đã kích hoạt"
      ? '<span class="badge badge-success">Đã kích hoạt</span>'
      : '<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;">Chưa kích hoạt</span>';

    let statusStyle = "background:#f1f5f9;color:#475569;";
    const sLower = String(r.trangThaiDonHang || "").toLowerCase();
    if (sLower.includes("đã thanh toán")) {
      statusStyle = "background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;";
    } else if (sLower.includes("chưa thanh toán")) {
      statusStyle = "background:#fffbeb;color:#d97706;border:1px solid #fde68a;";
    } else if (sLower.includes("hủy") || sLower.includes("từ chối")) {
      statusStyle = "background:#fef2f2;color:#dc2626;border:1px solid #fecaca;";
    } else if (sLower.includes("xếp tài")) {
      statusStyle = "background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;";
    }

    const statusBadge = `<span class="badge" style="${statusStyle}">${r.trangThaiDonHang || "Chưa xác định"}</span>`;

    return `
      <tr style="cursor: pointer;" onclick="viewOrderDetail('${escapeHtml(r.rowKey || r.sttFile)}')" title="Nhấn để xem chi tiết đầy đủ của đơn hàng">
        <td class="text-center" style="font-weight:600;color:var(--text-muted);">${globalIdx}</td>
        <td><code>${escapeHtml(r.sttFile || "-")}</code></td>
        <td class="text-center"><span class="badge badge-info" style="font-weight:700;">${escapeHtml(r.depot || "-")}</span></td>
        <td class="text-center"><strong>${escapeHtml(r.hangTau || "-")}</strong></td>
        <td>${escapeHtml(r.ngayHuyDon || "-")}</td>
        <td>${escapeHtml(r.ngayDuocDuyet || "-")}</td>
        <td><code>${escapeHtml(r.soBooking || "-")}</code></td>
        <td><strong>${escapeHtml(r.soContainer || "-")}</strong></td>
        <td>${escapeHtml(r.loaiContainer || "-")}</td>
        <td class="text-center">${dirBadge}</td>
        <td class="text-center font-semibold">${Number(r.sizeTeus || 0).toFixed(1)}</td>
        <td>${statusBadge}</td>
        <td class="text-center">${actBadge}</td>
        <td>${escapeHtml(r.thoiGianKichHoat || "-")}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.lyDoHuy || "")}">${escapeHtml(r.lyDoHuy || "-")}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.lyDoTuChoi || "")}">${escapeHtml(r.lyDoTuChoi || "-")}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.lyDoHuyCheck || "")}">${escapeHtml(r.lyDoHuyCheck || "-")}</td>
        <td>${escapeHtml(r.tenTaiXe || "-")}</td>
        <td>${escapeHtml(r.sdtTaiXe || "-")}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.tenNhaXe || "")}">${escapeHtml(r.tenNhaXe || "-")}</td>
        <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(r.fileName || "-")}</td>
      </tr>
    `;
  }).join("");

  updatePaginationControls(startIndex + 1, endIndex, total);
}

function updatePaginationControls(start, end, total) {
  if (paginationInfo) {
    if (total === 0) {
      paginationInfo.textContent = "Không có bản ghi nào";
    } else {
      paginationInfo.textContent = `Hiển thị ${start.toLocaleString()} - ${end.toLocaleString()} trên tổng số ${total.toLocaleString()} đơn kiểm tra`;
    }
  }

  const maxPage = Math.ceil(total / pageSize) || 1;
  if (pageIndicator) {
    pageIndicator.textContent = `Trang ${currentPage} / ${maxPage}`;
  }

  if (btnPageFirst) btnPageFirst.disabled = currentPage <= 1;
  if (btnPagePrev) btnPagePrev.disabled = currentPage <= 1;
  if (btnPageNext) btnPageNext.disabled = currentPage >= maxPage;
  if (btnPageLast) btnPageLast.disabled = currentPage >= maxPage;
}

// Modal Xem Chi Tiết
window.viewOrderDetail = function(key) {
  const item = allRecords.find(r => (r.rowKey === key || r.sttFile === key));
  if (!item) return;

  if (modalOrderTitle) {
    modalOrderTitle.textContent = `Chi Tiết Đơn Hàng EIR: ${item.sttFile || item.soContainer || "N/A"}`;
  }

  if (modalDetailContent) {
    modalDetailContent.innerHTML = `
      <div class="detail-item">
        <label>Số EIR</label>
        <div><code>${escapeHtml(item.sttFile || "-")}</code></div>
      </div>
      <div class="detail-item">
        <label>Depot Tiếp Nhận</label>
        <div><strong>${escapeHtml(item.depot || "-")}</strong></div>
      </div>
      <div class="detail-item">
        <label>Hãng Tàu</label>
        <div><strong>${escapeHtml(item.hangTau || "-")}</strong></div>
      </div>
      <div class="detail-item">
        <label>Chiều Vận Hành</label>
        <div>${escapeHtml(item.loaiDonHang || "-")}</div>
      </div>
      <div class="detail-item">
        <label>Số Booking / Vận Đơn</label>
        <div><code>${escapeHtml(item.soBooking || "-")}</code></div>
      </div>
      <div class="detail-item">
        <label>Số Container</label>
        <div><strong>${escapeHtml(item.soContainer || "-")}</strong></div>
      </div>
      <div class="detail-item">
        <label>Loại Container & Quy Cách</label>
        <div>${escapeHtml(item.loaiContainer || "-")}</div>
      </div>
      <div class="detail-item">
        <label>Sản Lượng TEUS</label>
        <div>${Number(item.sizeTeus || 0).toFixed(1)} TEUs</div>
      </div>
      <div class="detail-item">
        <label>Ngày Phát Sinh</label>
        <div>${escapeHtml(item.ngayHuyDon || "-")}</div>
      </div>
      <div class="detail-item">
        <label>Ngày Giờ Được Duyệt</label>
        <div>${escapeHtml(item.ngayDuocDuyet || "-")}</div>
      </div>
      <div class="detail-item">
        <label>Trạng Thái Đơn Hàng</label>
        <div><strong>${escapeHtml(item.trangThaiDonHang || "-")}</strong></div>
      </div>
      <div class="detail-item">
        <label>Trạng Thái Kích Hoạt Bãi</label>
        <div>${escapeHtml(item.trangThaiKichHoat || "-")}</div>
      </div>
      <div class="detail-item">
        <label>Thời Gian Kích Hoạt Xếp Tài</label>
        <div>${escapeHtml(item.thoiGianKichHoat || "-")}</div>
      </div>
      <div class="detail-item">
        <label>Tệp Dữ Liệu Nguồn</label>
        <div>${escapeHtml(item.fileName || "-")}</div>
      </div>
      <div class="detail-item full-width">
        <label>Lý Do Hủy Đơn</label>
        <div>${escapeHtml(item.lyDoHuy || "Không có lý do hủy")}</div>
      </div>
      <div class="detail-item full-width">
        <label>Ghi Chú Từ Chối Duyệt (Điều Độ)</label>
        <div>${escapeHtml(item.lyDoTuChoi || "Không có ghi chú từ chối")}</div>
      </div>
      <div class="detail-item full-width">
        <label>Ghi Chú Vận Hành Thêm</label>
        <div>${escapeHtml(item.lyDoHuyCheck || "Không có ghi chú thêm")}</div>
      </div>
      <div class="detail-item">
        <label>Họ Tên Tài Xế</label>
        <div>${escapeHtml(item.tenTaiXe || "-")}</div>
      </div>
      <div class="detail-item">
        <label>Số Điện Thoại Tài Xế</label>
        <div>${escapeHtml(item.sdtTaiXe || "-")}</div>
      </div>
      <div class="detail-item full-width">
        <label>Đơn Vị Vận Tải (Nhà Xe)</label>
        <div>${escapeHtml(item.tenNhaXe || "-")}</div>
      </div>
    `;
  }

  if (modalOrderDetail) modalOrderDetail.classList.add("active");
};

function closeModal() {
  if (modalOrderDetail) modalOrderDetail.classList.remove("active");
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Xuất CSV dữ liệu đang lọc
function exportToCsv() {
  if (!filteredRecords || filteredRecords.length === 0) {
    showAlert("Không có dữ liệu để xuất CSV!", true);
    return;
  }

  const headers = [
    "STT",
    "Số EIR",
    "Depot",
    "Hãng Tàu",
    "Ngày Phát Sinh",
    "Ngày Duyệt",
    "Số Booking",
    "Số Container",
    "Loại Cont",
    "Chiều",
    "TEUS",
    "Trạng Thái Đơn",
    "Kích Hoạt",
    "Thời Gian Kích Hoạt",
    "Lý Do Hủy",
    "Lý Do Từ Chối",
    "Ghi Chú Thêm",
    "Tài Xế",
    "SĐT Tài Xế",
    "Đơn Vị Vận Tải",
    "Tệp Nguồn"
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = filteredRecords.map((r, idx) => [
    idx + 1,
    escapeCsv(r.sttFile),
    escapeCsv(r.depot),
    escapeCsv(r.hangTau),
    escapeCsv(r.ngayHuyDon),
    escapeCsv(r.ngayDuocDuyet),
    escapeCsv(r.soBooking),
    escapeCsv(r.soContainer),
    escapeCsv(r.loaiContainer),
    escapeCsv(r.loaiDonHang),
    r.sizeTeus || 0,
    escapeCsv(r.trangThaiDonHang),
    escapeCsv(r.trangThaiKichHoat),
    escapeCsv(r.thoiGianKichHoat),
    escapeCsv(r.lyDoHuy),
    escapeCsv(r.lyDoTuChoi),
    escapeCsv(r.lyDoHuyCheck),
    escapeCsv(r.tenTaiXe),
    escapeCsv(r.sdtTaiXe),
    escapeCsv(r.tenNhaXe),
    escapeCsv(r.fileName)
  ].join(","));

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `du_lieu_kiem_tra_don_eir_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
