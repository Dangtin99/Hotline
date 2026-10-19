// rebooking-analytics.js - Phân tích đơn đặt lại theo số Booking, Container & Chiều
// Nguồn dữ liệu: eir_cancellation_orders qua API /api/verification/all-data
// Tuân thủ nghiêm ngặt GEMINI.md: Không emoji/icon, Text-only labels, hiệu năng cao

(function() {
  "use strict";

  // State Management
  let allRawRecords = [];
  let allGroupedOrders = [];
  let filteredOrders = [];

  let currentPage = 1;
  let pageSize = 50;
  let sortField = "totalAttempts";
  let sortDirection = "desc"; // desc | asc

  // DOM Elements
  const alertBox = document.getElementById("alertBox");
  const totalRowsBadge = document.getElementById("totalRowsBadge");
  const badgeFileCount = document.getElementById("badgeFileCount");
  const tbodyRebookingData = document.getElementById("tbodyRebookingData");

  // Filter elements
  const filterDateFrom = document.getElementById("filterDateFrom");
  const filterDateTo = document.getElementById("filterDateTo");
  const btnClearDateFilter = document.getElementById("btnClearDateFilter");
  const filterDepot = document.getElementById("filterDepot");
  const filterLine = document.getElementById("filterLine");
  const filterDirection = document.getElementById("filterDirection");
  const filterStatus = document.getElementById("filterStatus");
  const filterRebookCount = document.getElementById("filterRebookCount");
  const searchInput = document.getElementById("searchInput");
  const btnResetFilter = document.getElementById("btnResetFilter");
  const btnExportExcel = document.getElementById("btnExportExcel");
  const btnRefreshData = document.getElementById("btnRefreshData");

  // Pagination elements
  const paginationInfo = document.getElementById("paginationInfo");
  const selectPageSize = document.getElementById("selectPageSize");
  const pageIndicator = document.getElementById("pageIndicator");
  const btnPageFirst = document.getElementById("btnPageFirst");
  const btnPagePrev = document.getElementById("btnPagePrev");
  const btnPageNext = document.getElementById("btnPageNext");
  const btnPageLast = document.getElementById("btnPageLast");

  // Modal elements
  const modalHistoryDetail = document.getElementById("modalHistoryDetail");
  const modalHistoryTitle = document.getElementById("modalHistoryTitle");
  const modalHistorySubtitle = document.getElementById("modalHistorySubtitle");
  const modalHistorySummary = document.getElementById("modalHistorySummary");
  const modalHistoryTableBody = document.getElementById("modalHistoryTableBody");
  const btnModalHistoryClose = document.getElementById("btnModalHistoryClose");

  // Khởi tạo trang khi DOM sẵn sàng
  document.addEventListener("DOMContentLoaded", () => {
    initEvents();
    loadVerificationData();
  });

  function initEvents() {
    // Refresh button
    if (btnRefreshData) {
      btnRefreshData.addEventListener("click", () => {
        loadVerificationData(true);
      });
    }

    // Export Excel button
    if (btnExportExcel) {
      btnExportExcel.addEventListener("click", exportToExcel);
    }

    // Filter change events
    if (filterDateFrom) filterDateFrom.addEventListener("change", onFilterChanged);
    if (filterDateTo) filterDateTo.addEventListener("change", onFilterChanged);
    if (btnClearDateFilter) {
      btnClearDateFilter.addEventListener("click", () => {
        if (filterDateFrom) filterDateFrom.value = "";
        if (filterDateTo) filterDateTo.value = "";
        btnClearDateFilter.style.display = "none";
        onFilterChanged();
      });
    }

    if (filterDepot) filterDepot.addEventListener("change", onFilterChanged);
    if (filterLine) filterLine.addEventListener("change", onFilterChanged);
    if (filterDirection) filterDirection.addEventListener("change", onFilterChanged);
    if (filterStatus) filterStatus.addEventListener("change", onFilterChanged);
    if (filterRebookCount) filterRebookCount.addEventListener("change", onFilterChanged);

    // Search input debounce
    if (searchInput) {
      let searchTimeout = null;
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          onFilterChanged();
        }, 250);
      });
    }

    // Reset filter
    if (btnResetFilter) {
      btnResetFilter.addEventListener("click", resetFilters);
    }

    // Pagination controls
    if (selectPageSize) {
      selectPageSize.addEventListener("change", () => {
        const val = selectPageSize.value;
        pageSize = val === "all" ? 9999999 : parseInt(val, 10) || 50;
        currentPage = 1;
        renderTable();
      });
    }

    if (btnPageFirst) {
      btnPageFirst.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage = 1;
          renderTable();
        }
      });
    }

    if (btnPagePrev) {
      btnPagePrev.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          renderTable();
        }
      });
    }

    if (btnPageNext) {
      btnPageNext.addEventListener("click", () => {
        const maxPage = Math.ceil(filteredOrders.length / pageSize) || 1;
        if (currentPage < maxPage) {
          currentPage++;
          renderTable();
        }
      });
    }

    if (btnPageLast) {
      btnPageLast.addEventListener("click", () => {
        const maxPage = Math.ceil(filteredOrders.length / pageSize) || 1;
        if (currentPage < maxPage) {
          currentPage = maxPage;
          renderTable();
        }
      });
    }

    // Modal Close
    if (btnModalHistoryClose) {
      btnModalHistoryClose.addEventListener("click", closeModal);
    }
    if (modalHistoryDetail) {
      modalHistoryDetail.addEventListener("click", (e) => {
        if (e.target === modalHistoryDetail) closeModal();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalHistoryDetail && modalHistoryDetail.classList.contains("active")) {
        closeModal();
      }
    });

    // Table Header Sorting
    const sortableHeaders = document.querySelectorAll("th[data-sort]");
    sortableHeaders.forEach(th => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        const field = th.getAttribute("data-sort");
        if (sortField === field) {
          sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
          sortField = field;
          sortDirection = "desc";
        }
        applySorting();
        renderTable();
      });
    });
  }

  // Nạp dữ liệu từ backend
  async function loadVerificationData(forceRefresh = false) {
    showAlert("info", "Đang tải dữ liệu kiểm tra đơn và xử lý gom nhóm theo Booking...");
    if (tbodyRebookingData) {
      tbodyRebookingData.innerHTML = `
        <tr>
          <td colspan="15" class="text-center py-4" style="color:var(--text-muted);font-weight:500;">
            Đang nạp và phân tích dữ liệu đơn đặt lại...
          </td>
        </tr>
      `;
    }

    try {
      const url = forceRefresh ? "/api/verification/all-data?refresh=1" : "/api/verification/all-data";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Mã lỗi máy chủ: ${res.status}`);
      }

      const json = await res.json();
      if (json.status !== "success" || !Array.isArray(json.records)) {
        throw new Error(json.message || "Dữ liệu trả về không đúng định dạng chuẩn");
      }

      allRawRecords = json.records;
      const stats = json.stats || { fileCount: 0 };

      if (badgeFileCount) {
        badgeFileCount.textContent = `${stats.fileCount || 0} tệp đã tích lũy`;
      }

      // Tiến hành gom nhóm theo quy tắc: Booking + Container + Chiều
      allGroupedOrders = groupOrders(allRawRecords);

      // Cập nhật các dropdown chọn lựa
      populateDropdownFilters();

      // Áp dụng bộ lọc ban đầu (Mặc định: Hiển thị tất cả)
      applyFilters();

      hideAlert();
    } catch (err) {
      console.error("[RebookingAnalytics] Lỗi tải dữ liệu:", err);
      showAlert("error", `Không thể tải dữ liệu kiểm tra đơn: ${err.message}`);
      if (tbodyRebookingData) {
        tbodyRebookingData.innerHTML = `
          <tr>
            <td colspan="15" class="text-center py-4" style="color:var(--danger);font-weight:600;">
              Lỗi tải dữ liệu: ${escapeHtml(err.message)}
            </td>
          </tr>
        `;
      }
    }
  }

  // Thuật toán gom nhóm 2 LẦN Ở PHẦN ĐỆM (Two-Pass Buffering)
  // Lần 1: Gom theo Số Booking + Số Cont + Chiều (Lấy toàn bộ kể cả đơn 1 lần)
  // Lần 2: Quét phần đệm cho các đơn khác Booking theo Cont + Chiều + Người tạo
  //        Cập nhật lại Số Booking mới nhất và Trạng thái mới nhất của đơn đó
  function groupOrders(records) {
    // ----------------------------------------------------
    // VÒNG 1: Gom nhóm phần đệm theo Booking + Container + Chiều
    // ----------------------------------------------------
    const pass1Map = new Map();

    records.forEach((r, idx) => {
      const rawBooking = (r.soBooking || "").toString().trim().toUpperCase();
      const rawCont = (r.soContainer || "").toString().trim().toUpperCase();
      const rawDir = (r.loaiDonHang || "").toString().trim().toUpperCase();

      const bookingKey = rawBooking || "CHUA_CO_BOOKING";
      const contKey = rawCont || "CHUA_CO_CONT";
      const dirKey = (rawDir === "IN" || rawDir === "OUT") ? rawDir : "NA";

      // Khóa Vòng 1
      const groupKey = `${bookingKey}__${contKey}__${dirKey}`;

      if (!pass1Map.has(groupKey)) {
        pass1Map.set(groupKey, {
          groupKey,
          soBooking: rawBooking || "-",
          soContainer: rawCont || "-",
          loaiDonHang: dirKey,
          records: []
        });
      }

      pass1Map.get(groupKey).records.push({
        ...r,
        _originalIndex: idx
      });
    });

    // Sắp xếp các bản ghi trong từng nhóm từ mới nhất đến cũ nhất
    pass1Map.forEach(g => {
      g.records.sort((a, b) => parseRecordTimestamp(b) - parseRecordTimestamp(a));
    });

    // ----------------------------------------------------
    // BƯỚC 1.5: CẬP NHẬT SỐ BOOKING CHO ĐƠN BAN ĐẦU CHƯA CÓ BOOKING
    // Nếu container có các đơn trước đó chưa có booking (booking = '' / '-')
    // và sau đó có đơn phát sinh số Booking hợp lệ cùng Chiều (IN/OUT):
    // -> Gộp toàn bộ các lần tạo trước vào đơn có Booking hợp lệ này,
    //    cập nhật lại Số Booking mới nhất và Trạng thái mới nhất.
    // ----------------------------------------------------
    const contWithRealBookingMap = new Map();
    pass1Map.forEach(g => {
      const hasRealBk = g.soBooking && g.soBooking !== "-" && g.soBooking !== "CHUA_CO_BOOKING";
      const hasCont = g.soContainer && g.soContainer !== "-" && g.soContainer !== "CHUA_CO_CONT";
      if (hasRealBk && hasCont) {
        const key = `${g.soContainer}__${g.loaiDonHang}`;
        if (!contWithRealBookingMap.has(key)) contWithRealBookingMap.set(key, []);
        contWithRealBookingMap.get(key).push(g);
      }
    });

    // Sắp xếp các ứng viên có booking thật theo thời gian bản ghi mới nhất
    contWithRealBookingMap.forEach(list => {
      list.sort((a, b) => parseRecordTimestamp(b.records[0]) - parseRecordTimestamp(a.records[0]));
    });

    const pass1Groups = [];
    pass1Map.forEach(g => {
      const isMissingBk = !g.soBooking || g.soBooking === "-" || g.soBooking === "CHUA_CO_BOOKING";
      const hasCont = g.soContainer && g.soContainer !== "-" && g.soContainer !== "CHUA_CO_CONT";

      if (isMissingBk && hasCont) {
        const key = `${g.soContainer}__${g.loaiDonHang}`;
        const realCandidates = contWithRealBookingMap.get(key);
        if (realCandidates && realCandidates.length > 0) {
          // Gộp toàn bộ các lần tạo trước vào nhóm có booking thật mới nhất
          const target = realCandidates[0];
          target.records.push(...g.records);
          target.records.sort((a, b) => parseRecordTimestamp(b) - parseRecordTimestamp(a));
          target.matchType = "UPDATED_BOOKING";
          // Đã gộp vào target, không đưa g riêng lẻ vào pass1Groups
          return;
        }
      }
      pass1Groups.push(g);
    });

    // Tách phần đệm thành 2 luồng:
    // 1. Nhóm đã có >= 2 lần tạo ngay ở Vòng 1 / 1.5 (Trùng Booking hoặc đã cập nhật Booking)
    // 2. Nhóm đơn lẻ (= 1 lần tạo) hoặc cần đối soát Vòng 2
    const finalizedGroups = [];
    const candidatesForPass2 = [];

    pass1Groups.forEach(g => {
      if (g.records.length >= 2) {
        // Nhóm đã có >= 2 lần tạo, giữ nguyên
        finalizedGroups.push({
          ...g,
          matchType: g.matchType || "SAME_BOOKING"
        });
      } else {
        // Nhóm đơn lẻ 1 lần tạo trong phần đệm -> Đưa vào kiểm tra Vòng 2
        candidatesForPass2.push(g);
      }
    });

    // ----------------------------------------------------
    // VÒNG 2: Kiểm tra tiếp các đơn ở phần đệm có Khác Số Booking
    // Khóa xét: Số Container + Chiều + Người tạo
    // (Nếu người tạo trống, xét theo Số Container + Chiều)
    // ----------------------------------------------------
    const pass2Map = new Map();
    const candidatesForPass3 = [];

    candidatesForPass2.forEach(candidate => {
      const singleRecord = candidate.records[0];
      const cont = (candidate.soContainer || "").trim().toUpperCase();
      const dir = (candidate.loaiDonHang || "").trim().toUpperCase();
      const creator = (singleRecord.nguoiTao || "").toString().trim().toUpperCase();

      // Nếu không có số container hợp lệ hoặc không đủ điều kiện Pass 2
      // Chuyển tiếp thẳng vào danh sách ứng viên Pass 3 để kiểm tra các đơn OUT
      if (!cont || cont === "-" || cont === "CHUA_CO_CONT" || !creator || creator === "-" || creator === "UNKNOWN" || creator === "UNDEFINED") {
        candidatesForPass3.push(candidate);
        return;
      }

      // Khóa gom Vòng 2: Container + Chiều + Người tạo (Bắt buộc trùng chính xác người tạo)
      const pass2Key = `${cont}__${dir}__${creator}`;

      if (!pass2Map.has(pass2Key)) {
        pass2Map.set(pass2Key, {
          pass2Key,
          soContainer: cont,
          loaiDonHang: dir,
          nguoiTaoKey: creator,
          memberGroups: []
        });
      }

      pass2Map.get(pass2Key).memberGroups.push(candidate);
    });

    // Tách kết quả Vòng 2 thành 2 luồng:
    // 1. Nhóm đã có >= 2 lần tạo ở Vòng 2 (CHANGED_BOOKING)
    // 2. Nhóm vẫn là đơn đơn lẻ = 1 lần tạo -> Đưa vào kiểm tra Vòng 3
    pass2Map.forEach(p2 => {
      if (p2.memberGroups.length >= 2) {
        // Gom toàn bộ records của các nhóm khác booking lại
        const combinedRecords = [];
        const seenBookings = new Set();
        const seenConts = new Set();

        p2.memberGroups.forEach(mg => {
          mg.records.forEach(r => {
            combinedRecords.push(r);
            if (r.soBooking) seenBookings.add(r.soBooking.toString().trim().toUpperCase());
            if (r.soContainer) seenConts.add(r.soContainer.toString().trim().toUpperCase());
          });
        });

        // Sắp xếp lại theo thứ tự thời gian giảm dần (Mới nhất lên đầu)
        combinedRecords.sort((a, b) => parseRecordTimestamp(b) - parseRecordTimestamp(a));

        const latestRecord = combinedRecords[0];
        const latestBooking = (latestRecord.soBooking || "").toString().trim().toUpperCase() || "-";

        // Tạo nhóm hợp nhất với SỐ BOOKING MỚI NHẤT
        finalizedGroups.push({
          groupKey: `PASS2__${p2.pass2Key}`,
          soBooking: latestBooking, // Cập nhật lại số booking mới
          soContainer: p2.soContainer,
          loaiDonHang: p2.loaiDonHang,
          records: combinedRecords,
          matchType: "CHANGED_BOOKING", // Đánh dấu đã đổi số booking
          allBookings: Array.from(seenBookings),
          allConts: Array.from(seenConts)
        });
      } else {
        // Vẫn chỉ có 1 lần tạo duy nhất trong phần đệm -> Đưa tiếp vào Vòng 3
        candidatesForPass3.push(p2.memberGroups[0]);
      }
    });

    // ----------------------------------------------------
    // VÒNG 3: Kiểm tra chuyên biệt các ĐƠN OUT (Gate OUT - Lấy cont)
    // Khác Booking, Khác Cont nhưng CÙNG:
    // 1. Chiều = "OUT"
    // 2. Người tạo (Bắt buộc trùng chính xác người tạo hợp lệ)
    // 3. Depot
    // 4. Hãng tàu
    // ----------------------------------------------------
    const pass3Map = new Map();

    candidatesForPass3.forEach(candidate => {
      const singleRecord = candidate.records[0];
      const dir = (candidate.loaiDonHang || "").trim().toUpperCase();
      const creator = (singleRecord.nguoiTao || "").toString().trim().toUpperCase();
      const depot = (singleRecord.depot || candidate.depot || "").toString().trim().toUpperCase();
      const line = (singleRecord.hangTau || candidate.hangTau || "").toString().trim().toUpperCase();

      // Chỉ xét đơn chiều OUT và bắt buộc có người tạo, depot, hãng tàu
      const isValidCreator = creator && creator !== "-" && creator !== "UNKNOWN" && creator !== "UNDEFINED";
      const isOutDirection = dir === "OUT";

      if (!isOutDirection || !isValidCreator || !depot || depot === "-" || !line || line === "-") {
        finalizedGroups.push({
          ...candidate,
          matchType: "SINGLE"
        });
        return;
      }

      // Khóa gom Vòng 3: OUT + Người tạo + Depot + Hãng tàu
      const pass3Key = `OUT__${creator}__${depot}__${line}`;

      if (!pass3Map.has(pass3Key)) {
        pass3Map.set(pass3Key, {
          pass3Key,
          creator,
          depot,
          line,
          memberGroups: []
        });
      }

      pass3Map.get(pass3Key).memberGroups.push(candidate);
    });

    // Xử lý kết quả Vòng 3 từ phần đệm
    pass3Map.forEach(p3 => {
      if (p3.memberGroups.length >= 2) {
        // Gom toàn bộ records của các đơn OUT khác booking & khác cont
        const combinedRecords = [];
        const seenBookings = new Set();
        const seenConts = new Set();

        p3.memberGroups.forEach(mg => {
          mg.records.forEach(r => {
            combinedRecords.push(r);
            if (r.soBooking) seenBookings.add(r.soBooking.toString().trim().toUpperCase());
            if (r.soContainer) seenConts.add(r.soContainer.toString().trim().toUpperCase());
          });
        });

        // Sắp xếp lại theo thời gian giảm dần (Bản ghi mới nhất lên đầu)
        combinedRecords.sort((a, b) => parseRecordTimestamp(b) - parseRecordTimestamp(a));

        const latestRecord = combinedRecords[0];
        const latestBooking = (latestRecord.soBooking || "").toString().trim().toUpperCase() || "-";
        const latestCont = (latestRecord.soContainer || "").toString().trim().toUpperCase() || "-";

        // Tạo nhóm hợp nhất thay thế bằng SỐ BOOKING MỚI NHẤT & SỐ CONTAINER MỚI NHẤT
        finalizedGroups.push({
          groupKey: `PASS3__${p3.pass3Key}`,
          soBooking: latestBooking,    // Cập nhật lại số booking mới nhất
          soContainer: latestCont,     // Cập nhật lại số cont mới nhất
          loaiDonHang: "OUT",
          depot: p3.depot,
          hangTau: p3.line,
          records: combinedRecords,
          matchType: "OUT_REPLACED",   // Đánh dấu đơn OUT đặt lại thay thế
          allBookings: Array.from(seenBookings),
          allConts: Array.from(seenConts)
        });
      } else {
        // Đơn lẻ 1 lần trong phần đệm
        const single = p3.memberGroups[0];
        finalizedGroups.push({
          ...single,
          matchType: "SINGLE"
        });
      }
    });

    // ----------------------------------------------------
    // TỔNG HỢP TOÀN BỘ PHẦN ĐỆM VÀO KẾT QUẢ ĐỐI TƯỢNG ĐƠN HÀNG
    // (Bao gồm cả các đơn 1 lần, các đơn trùng booking, các đơn đổi booking)
    // ----------------------------------------------------
    const result = finalizedGroups.map(g => {
      // Đảm bảo records đã sắp xếp từ mới nhất đến cũ nhất
      g.records.sort((a, b) => parseRecordTimestamp(b) - parseRecordTimestamp(a));

      const latest = g.records[0];
      const first = g.records[g.records.length - 1];
      const totalAttempts = g.records.length;
      const rebookingCount = totalAttempts - 1;

      return {
        groupKey: g.groupKey,
        soBooking: g.soBooking,
        soContainer: g.soContainer,
        loaiDonHang: g.loaiDonHang,
        loaiContainer: latest.loaiContainer || first.loaiContainer || "-",
        hangTau: latest.hangTau || first.hangTau || "-",
        depot: latest.depot || first.depot || "-",
        sizeTeus: Number(latest.sizeTeus || first.sizeTeus || 0),
        totalAttempts,
        rebookingCount,
        latestStatus: latest.trangThaiDonHang || "Chưa xác định",
        latestActivation: latest.trangThaiKichHoat || "Chưa kích hoạt",
        latestDate: latest.ngayHuyDon || latest.ngayDuocDuyet || latest.createdAt,
        firstDate: first.ngayHuyDon || first.ngayDuocDuyet || first.createdAt,
        tenTaiXe: latest.tenTaiXe || first.tenTaiXe || "-",
        sdtTaiXe: latest.sdtTaiXe || first.sdtTaiXe || "-",
        tenNhaXe: latest.tenNhaXe || first.tenNhaXe || "-",
        nguoiTao: latest.nguoiTao || first.nguoiTao || "-",
        matchType: g.matchType || "SINGLE",
        allBookings: g.allBookings || [g.soBooking],
        allConts: g.allConts || [g.soContainer],
        latestRecord: latest,
        firstRecord: first,
        records: g.records
      };
    });

    return result;
  }

  // Parse thời gian an toàn cho bản ghi
  function parseRecordTimestamp(r) {
    if (!r) return 0;
    const dateStr = r.ngayHuyDon || r.ngayDuocDuyet || r.thoiGianKichHoat || r.createdAt;
    if (!dateStr) return 0;
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? 0 : t;
  }

  // Trích xuất danh sách Depot & Hãng tàu cho dropdown
  function populateDropdownFilters() {
    const depots = new Set();
    const lines = new Set();
    const statuses = new Set();

    allGroupedOrders.forEach(o => {
      if (o.depot && o.depot !== "-") depots.add(o.depot);
      if (o.hangTau && o.hangTau !== "-") lines.add(o.hangTau);
      if (o.latestStatus && o.latestStatus !== "-") statuses.add(o.latestStatus);
    });

    populateSelect(filterDepot, Array.from(depots).sort(), "Tất cả Depot");
    populateSelect(filterLine, Array.from(lines).sort(), "Tất cả Hãng tàu");
    populateSelect(filterStatus, Array.from(statuses).sort(), "Tất cả trạng thái mới nhất");
  }

  function populateSelect(selectEl, items, defaultLabel) {
    if (!selectEl) return;
    const currentVal = selectEl.value;
    selectEl.innerHTML = `<option value="">${defaultLabel}</option>`;
    items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      selectEl.appendChild(opt);
    });
    if (currentVal && items.includes(currentVal)) {
      selectEl.value = currentVal;
    }
  }

  // Xử lý sự kiện khi bộ lọc thay đổi
  function onFilterChanged() {
    // Toggle nút xóa lọc ngày
    if (btnClearDateFilter) {
      if ((filterDateFrom && filterDateFrom.value) || (filterDateTo && filterDateTo.value)) {
        btnClearDateFilter.style.display = "block";
      } else {
        btnClearDateFilter.style.display = "none";
      }
    }
    currentPage = 1;
    applyFilters();
  }

  // Áp dụng bộ lọc và cập nhật giao diện
  function applyFilters() {
    const fromVal = filterDateFrom ? filterDateFrom.value : "";
    const toVal = filterDateTo ? filterDateTo.value : "";
    const fromTime = fromVal ? new Date(`${fromVal}T00:00:00`).getTime() : null;
    const toTime = toVal ? new Date(`${toVal}T23:59:59`).getTime() : null;

    const depotVal = filterDepot ? filterDepot.value.trim().toUpperCase() : "";
    const lineVal = filterLine ? filterLine.value.trim().toUpperCase() : "";
    const dirVal = filterDirection ? filterDirection.value.trim().toUpperCase() : "";
    const statusVal = filterStatus ? filterStatus.value.trim() : "";
    const rebookVal = filterRebookCount ? filterRebookCount.value : "all";
    const term = searchInput ? searchInput.value.trim().toLowerCase() : "";

    filteredOrders = allGroupedOrders.filter(o => {
      // 1. Lọc theo ngày cập nhật mới nhất
      if (fromTime || toTime) {
        const orderTime = parseRecordTimestamp(o.latestRecord);
        if (fromTime && orderTime < fromTime) return false;
        if (toTime && orderTime > toTime) return false;
      }

      // 2. Lọc theo Depot
      if (depotVal && o.depot.toUpperCase() !== depotVal) return false;

      // 3. Lọc theo Hãng tàu
      if (lineVal && o.hangTau.toUpperCase() !== lineVal) return false;

      // 4. Lọc theo Chiều
      if (dirVal && o.loaiDonHang.toUpperCase() !== dirVal) return false;

      // 5. Lọc theo Trạng thái mới nhất
      if (statusVal && o.latestStatus !== statusVal) return false;

      // 6. Lọc theo Tổng số lần tạo đơn
      if (rebookVal === "rebooked" && o.totalAttempts < 2) return false;
      if (rebookVal === "high_rebooked" && o.totalAttempts < 3) return false;

      // 7. Tìm nhanh theo Booking, Cont, Tài xế, Nhà xe, Hãng tàu, Người tạo
      if (term) {
        const matchBooking = o.soBooking && o.soBooking.toLowerCase().includes(term);
        const matchCont = o.soContainer && o.soContainer.toLowerCase().includes(term);
        const matchDriver = o.tenTaiXe && o.tenTaiXe.toLowerCase().includes(term);
        const matchPhone = o.sdtTaiXe && o.sdtTaiXe.toLowerCase().includes(term);
        const matchTransporter = o.tenNhaXe && o.tenNhaXe.toLowerCase().includes(term);
        const matchLine = o.hangTau && o.hangTau.toLowerCase().includes(term);
        const matchCreator = o.nguoiTao && o.nguoiTao.toLowerCase().includes(term);
        if (!matchBooking && !matchCont && !matchDriver && !matchPhone && !matchTransporter && !matchLine && !matchCreator) {
          return false;
        }
      }

      return true;
    });

    // Cập nhật thẻ KPI
    updateKPIs();

    // Sắp xếp
    applySorting();

    // Render bảng
    renderTable();
  }

  // Cập nhật thông tin dòng hiển thị
  function updateKPIs() {
    const totalUnique = filteredOrders.length;
    if (totalRowsBadge) {
      totalRowsBadge.textContent = `${totalUnique.toLocaleString()} đơn hiển thị (${allRawRecords.length.toLocaleString()} bản ghi gốc)`;
    }
  }

  function isResolvedStatus(status) {
    if (!status) return false;
    const s = status.toLowerCase();
    return s.includes("đã thanh toán") || s.includes("đã duyệt") || s.includes("xếp tài") || s.includes("hoàn tất");
  }

  // Sắp xếp danh sách
  function applySorting() {
    filteredOrders.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === "latestDate" || sortField === "firstDate") {
        valA = parseRecordTimestamp(a[sortField === "latestDate" ? "latestRecord" : "firstRecord"]);
        valB = parseRecordTimestamp(b[sortField === "latestDate" ? "latestRecord" : "firstRecord"]);
      } else if (sortField === "rebookingCount" || sortField === "totalAttempts" || sortField === "sizeTeus") {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      } else {
        valA = (valA || "").toString().toLowerCase();
        valB = (valB || "").toString().toLowerCase();
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;

      // Tiêu chí phụ: Đơn có lần đặt lại cao hơn lên trước
      return b.rebookingCount - a.rebookingCount;
    });
  }

  // Render bảng dữ liệu
  function renderTable() {
    if (!tbodyRebookingData) return;

    const total = filteredOrders.length;
    if (total === 0) {
      tbodyRebookingData.innerHTML = `
        <tr>
          <td colspan="15" class="text-center py-4" style="color:var(--text-muted);font-weight:500;">
            Không tìm thấy đơn hàng nào phù hợp với điều kiện lọc hiện tại.
          </td>
        </tr>
      `;
      updatePaginationControls(0, 0, 0);
      return;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageSlice = filteredOrders.slice(startIndex, endIndex);

    tbodyRebookingData.innerHTML = pageSlice.map((o, idx) => {
      const globalIdx = startIndex + idx + 1;

      // Direction Badge
      const dirBadge = o.loaiDonHang === "OUT"
        ? '<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:700;">OUT</span>'
        : o.loaiDonHang === "IN"
        ? '<span class="badge" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;font-weight:700;">IN</span>'
        : '<span class="badge badge-info">N/A</span>';

      // Activation Badge
      const actBadge = o.latestActivation === "Đã kích hoạt"
        ? '<span class="badge badge-success">Đã kích hoạt</span>'
        : '<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;">Chưa kích hoạt</span>';

      // Status Badge
      let statusStyle = "background:#f1f5f9;color:#475569;";
      const sLower = String(o.latestStatus || "").toLowerCase();
      if (sLower.includes("đã thanh toán")) {
        statusStyle = "background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;font-weight:600;";
      } else if (sLower.includes("chưa thanh toán")) {
        statusStyle = "background:#fffbeb;color:#d97706;border:1px solid #fde68a;font-weight:600;";
      } else if (sLower.includes("hủy") || sLower.includes("từ chối")) {
        statusStyle = "background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-weight:600;";
      } else if (sLower.includes("xếp tài")) {
        statusStyle = "background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;font-weight:600;";
      }
      const statusBadge = `<span class="badge" style="${statusStyle}">${escapeHtml(o.latestStatus)}</span>`;

      let totalAttemptsBadge = "";
      if (o.totalAttempts >= 2) {
        totalAttemptsBadge = `<span class="badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-weight:700;">${o.totalAttempts} lần</span>`;
      } else {
        totalAttemptsBadge = `<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">${o.totalAttempts} lần</span>`;
      }

      // Booking display with indicator if booking was changed
      let bookingDisplay = `<code>${escapeHtml(o.soBooking)}</code>`;
      if (o.matchType === "CHANGED_BOOKING" && o.allBookings && o.allBookings.length > 1) {
        const otherBookings = o.allBookings.filter(b => b !== o.soBooking);
        bookingDisplay += `<br><span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:10px;margin-top:2px;" title="Đơn đã đổi từ booking cũ: ${escapeHtml(otherBookings.join(', '))}">[Đổi Booking]</span>`;
      } else if (o.matchType === "OUT_REPLACED") {
        const otherBookings = (o.allBookings || []).filter(b => b !== o.soBooking);
        const tip = otherBookings.length > 0 ? `Đơn OUT đổi booking từ: ${otherBookings.join(', ')}` : "Đơn OUT tạo lại thay thế";
        bookingDisplay += `<br><span class="badge" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-size:10px;margin-top:2px;" title="${escapeHtml(tip)}">[OUT Đặt Lại]</span>`;
      }

      // Container display with indicator if cont was changed in OUT_REPLACED
      let contDisplay = `<strong>${escapeHtml(o.soContainer)}</strong>`;
      if (o.matchType === "OUT_REPLACED" && o.allConts && o.allConts.length > 1) {
        const otherConts = o.allConts.filter(c => c !== o.soContainer);
        if (otherConts.length > 0) {
          contDisplay += `<br><span style="font-size:10px;color:var(--text-muted);" title="Cont ban đầu: ${escapeHtml(otherConts.join(', '))}">Gốc: ${escapeHtml(otherConts[0])}</span>`;
        }
      }

      return `
        <tr style="cursor: pointer;" onclick="window.viewRebookingHistory('${escapeHtml(o.groupKey)}')" title="Nhấn để xem toàn bộ lịch sử các lần đặt của đơn này">
          <td class="text-center" style="font-weight:600;color:var(--text-muted);">${globalIdx}</td>
          <td>${bookingDisplay}</td>
          <td>${contDisplay}</td>
          <td class="text-center">${dirBadge}</td>
          <td class="text-center"><strong>${escapeHtml(o.hangTau)}</strong></td>
          <td class="text-center"><span class="badge badge-info" style="font-weight:700;">${escapeHtml(o.depot)}</span></td>
          <td>${escapeHtml(o.loaiContainer)}</td>
          <td class="text-center font-semibold">${Number(o.sizeTeus || 0).toFixed(1)}</td>
          <td class="text-center">${totalAttemptsBadge}</td>
          <td>${statusBadge}</td>
          <td class="text-center">${actBadge}</td>
          <td>${escapeHtml(formatDateDisplay(o.latestDate))}</td>
          <td>${escapeHtml(formatDateDisplay(o.firstDate))}</td>
          <td>${escapeHtml(o.nguoiTao)}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(o.tenNhaXe || "")}">${escapeHtml(o.tenNhaXe)}</td>
          <td class="text-center">
            <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation(); window.viewRebookingHistory('${escapeHtml(o.groupKey)}')" style="padding:3px 8px;font-size:12px;">
              Chi Tiết
            </button>
          </td>
        </tr>
      `;
    }).join("");

    updatePaginationControls(startIndex + 1, endIndex, total);
  }

  // Cập nhật thanh phân trang
  function updatePaginationControls(start, end, total) {
    if (paginationInfo) {
      if (total === 0) {
        paginationInfo.textContent = "Không có bản ghi nào";
      } else {
        paginationInfo.textContent = `Hiển thị ${start.toLocaleString()} - ${end.toLocaleString()} trên tổng số ${total.toLocaleString()} đơn`;
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

  // Modal Xem Lịch Sử Đặt Lại (Audit Trail)
  window.viewRebookingHistory = function(groupKey) {
    const order = allGroupedOrders.find(o => o.groupKey === groupKey);
    if (!order) return;

    if (modalHistoryTitle) {
      modalHistoryTitle.textContent = `Lịch Sử Đặt Đơn: Booking ${order.soBooking}`;
    }
    if (modalHistorySubtitle) {
      modalHistorySubtitle.textContent = `Container: ${order.soContainer} | Chiều: Gate ${order.loaiDonHang} | Hãng tàu: ${order.hangTau} | Depot: ${order.depot}`;
    }

    if (modalHistorySummary) {
      const isResolved = isResolvedStatus(order.latestStatus);
      const resolveBadge = isResolved
        ? '<span class="badge badge-success" style="font-size:12px;">Đã Xử Lý Thành Công</span>'
        : '<span class="badge" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:12px;">Chưa Hoàn Tất / Bị Hủy</span>';

      modalHistorySummary.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;background:var(--bg-main);padding:12px 16px;border-radius:8px;border:1px solid var(--border-light);margin-bottom:16px;">
          <div><span style="color:var(--text-muted);font-size:12px;">Tổng Số Lần Tạo:</span> <strong style="font-size:14px;color:var(--blue-primary);">${order.totalAttempts} lần</strong></div>
          <div><span style="color:var(--text-muted);font-size:12px;">Số Lần Đặt Lại:</span> <strong style="font-size:14px;color:#b45309;">${order.rebookingCount} lần</strong></div>
          <div><span style="color:var(--text-muted);font-size:12px;">Trạng Thái Mới Nhất:</span> <strong>${escapeHtml(order.latestStatus)}</strong></div>
          <div><span style="color:var(--text-muted);font-size:12px;">Đánh Giá Kết Quả:</span> ${resolveBadge}</div>
        </div>
      `;
    }

    if (modalHistoryTableBody) {
      // Bản ghi đã được sắp xếp từ mới nhất đến cũ nhất
      // Chúng ta hiển thị đánh số lần: Lần 1 (cũ nhất) -> Lần N (mới nhất)
      const reversedRecords = [...order.records].reverse();

      modalHistoryTableBody.innerHTML = reversedRecords.map((r, i) => {
        const attemptIndex = i + 1;
        const isLatest = attemptIndex === order.totalAttempts;
        const attemptLabel = attemptIndex === 1
          ? '<span class="badge" style="background:#f1f5f9;color:#475569;">Lần 1 (Tạo đầu)</span>'
          : isLatest
          ? `<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:700;">Lần ${attemptIndex} (Mới nhất)</span>`
          : `<span class="badge" style="background:#fffbeb;color:#b45309;">Lần ${attemptIndex}</span>`;

        let statusStyle = "background:#f1f5f9;color:#475569;";
        const sLower = String(r.trangThaiDonHang || "").toLowerCase();
        if (sLower.includes("đã thanh toán")) {
          statusStyle = "background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;font-weight:600;";
        } else if (sLower.includes("chưa thanh toán")) {
          statusStyle = "background:#fffbeb;color:#d97706;border:1px solid #fde68a;font-weight:600;";
        } else if (sLower.includes("hủy") || sLower.includes("từ chối")) {
          statusStyle = "background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-weight:600;";
        }

        const actBadge = r.trangThaiKichHoat === "Đã kích hoạt"
          ? '<span class="badge badge-success">Đã kích hoạt</span>'
          : '<span class="badge" style="background:#f1f5f9;color:#64748b;">Chưa kích hoạt</span>';

        return `
          <tr style="${isLatest ? 'background:#f8fafc;font-weight:500;' : ''}">
            <td class="text-center">${attemptLabel}</td>
            <td><code>${escapeHtml(r.soBooking || "-")}</code></td>
            <td><strong>${escapeHtml(r.soContainer || "-")}</strong></td>
            <td><code>${escapeHtml(r.sttFile || "-")}</code></td>
            <td>${escapeHtml(formatDateDisplay(r.ngayHuyDon))}</td>
            <td>${escapeHtml(formatDateDisplay(r.ngayDuocDuyet))}</td>
            <td><span class="badge" style="${statusStyle}">${escapeHtml(r.trangThaiDonHang || "Chưa xác định")}</span></td>
            <td class="text-center">${actBadge}</td>
            <td style="font-size:12px;color:#dc2626;"><span class="cell-truncate-1line" title="${escapeHtml(r.lyDoHuy || "")}">${escapeHtml(r.lyDoHuy || "-")}</span></td>
            <td style="font-size:12px;color:#b45309;"><span class="cell-truncate-1line" title="${escapeHtml(r.lyDoTuChoi || "")}">${escapeHtml(r.lyDoTuChoi || "-")}</span></td>
            <td style="font-size:12px;white-space:nowrap;">${escapeHtml(r.tenTaiXe || "-")}${r.sdtTaiXe ? ` <span style="color:var(--text-muted);font-size:11px;">(${escapeHtml(r.sdtTaiXe)})</span>` : ''}</td>
            <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.tenNhaXe || "")}">${escapeHtml(r.tenNhaXe || "-")}</td>
            <td>${escapeHtml(r.nguoiTao || "-")}</td>
            <td style="font-size:11px;color:var(--text-muted);">${escapeHtml(r.fileName || "-")}</td>
          </tr>
        `;
      }).join("");
    }

    if (modalHistoryDetail) {
      modalHistoryDetail.classList.add("active");
    }
  };

  function closeModal() {
    if (modalHistoryDetail) {
      modalHistoryDetail.classList.remove("active");
    }
  }

  // Đặt lại bộ lọc về mặc định
  function resetFilters() {
    if (filterDateFrom) filterDateFrom.value = "";
    if (filterDateTo) filterDateTo.value = "";
    if (btnClearDateFilter) btnClearDateFilter.style.display = "none";
    if (filterDepot) filterDepot.value = "";
    if (filterLine) filterLine.value = "";
    if (filterDirection) filterDirection.value = "";
    if (filterStatus) filterStatus.value = "";
    if (filterRebookCount) filterRebookCount.value = "rebooked";
    if (searchInput) searchInput.value = "";

    sortField = "totalAttempts";
    sortDirection = "desc";
    currentPage = 1;
    applyFilters();
  }

  // Xuất file Excel (XLSX)
  function exportToExcel() {
    if (!filteredOrders || filteredOrders.length === 0) {
      alert("Không có dữ liệu để xuất file");
      return;
    }

    if (typeof XLSX === "undefined") {
      alert("Thư viện xuất Excel chưa tải xong, vui lòng thử lại sau giây lát.");
      return;
    }

    try {
      const exportData = filteredOrders.map((o, idx) => ({
        "STT": idx + 1,
        "Số Booking": o.soBooking,
        "Ghi Chú Đổi Booking": o.matchType === "OUT_REPLACED"
          ? `Đơn OUT đổi booking & cont (Booking cũ: ${(o.allBookings || []).filter(b => b !== o.soBooking).join(", ") || "-"})`
          : (o.matchType === "CHANGED_BOOKING" && o.allBookings && o.allBookings.length > 1)
          ? `Đã đổi từ booking: ${o.allBookings.filter(b => b !== o.soBooking).join(", ")}`
          : "Cùng booking",
        "Số Container": o.soContainer,
        "Chiều Vận Hành": o.loaiDonHang,
        "Hãng Tàu": o.hangTau,
        "Depot": o.depot,
        "Quy Cách Cont": o.loaiContainer,
        "TEUS": o.sizeTeus,
        "Tổng Số Lần Tạo": o.totalAttempts,
        "Trạng Thái Mới Nhất": o.latestStatus,
        "Kích Hoạt Mới Nhất": o.latestActivation,
        "Cập Nhật Mới Nhất": formatDateDisplay(o.latestDate),
        "Ngày Khởi Tạo Lần Đầu": formatDateDisplay(o.firstDate),
        "Người Tạo": o.nguoiTao,
        "Tài Xế Mới Nhất": o.tenTaiXe,
        "SĐT Tài Xế": o.sdtTaiXe,
        "Đơn Vị Vận Tải": o.tenNhaXe
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Don_Dat_Lai_Booking");

      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      XLSX.writeFile(workbook, `Bao_Cao_Don_Dat_Lai_Booking_${dateStr}.xlsx`);
    } catch (err) {
      console.error("[ExportExcel] Lỗi xuất file:", err);
      alert(`Lỗi xuất file Excel: ${err.message}`);
    }
  }

  // Tiện ích hiển thị thông báo
  function showAlert(type, msg) {
    if (!alertBox) return;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.textContent = msg;
    alertBox.hidden = false;
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.hidden = true;
    alertBox.textContent = "";
  }

  // Định dạng ngày hiển thị dd/mm/yyyy hh:mm
  function formatDateDisplay(d) {
    if (!d) return "-";
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);

    const pad = n => String(n).padStart(2, "0");
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}/${month}/${year} ${hours}:${minutes}`;
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

})();
