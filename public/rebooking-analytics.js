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

  // Multi-select Depot
  const depotMultiselect = document.getElementById("depotMultiselect");
  const depotDropdownBtn = document.getElementById("depotDropdownBtn");
  const depotDropdownPanel = document.getElementById("depotDropdownPanel");
  const depotSelectedLabel = document.getElementById("depotSelectedLabel");
  const depotSelectAll = document.getElementById("depotSelectAll");
  const depotOptionsList = document.getElementById("depotOptionsList");
  let allDepotValues = [];
  let selectedDepots = [];

  // Multi-select Hãng tàu (Line)
  const lineMultiselect = document.getElementById("lineMultiselect");
  const lineDropdownBtn = document.getElementById("lineDropdownBtn");
  const lineDropdownPanel = document.getElementById("lineDropdownPanel");
  const lineSelectedLabel = document.getElementById("lineSelectedLabel");
  const lineSelectAll = document.getElementById("lineSelectAll");
  const lineOptionsList = document.getElementById("lineOptionsList");
  let allLineValues = [];
  let selectedLines = [];
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

    // Toggle dropdown đa chọn Depot
    if (depotDropdownBtn && depotDropdownPanel) {
      depotDropdownBtn.onclick = (e) => {
        e.stopPropagation();
        if (lineDropdownPanel) {
          lineDropdownPanel.classList.remove("show");
          if (lineDropdownBtn) {
            lineDropdownBtn.classList.remove("active");
            lineDropdownBtn.setAttribute("aria-expanded", "false");
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

      depotDropdownPanel.onclick = (e) => {
        e.stopPropagation();
      };
    }

    // Toggle dropdown đa chọn Hãng tàu
    if (lineDropdownBtn && lineDropdownPanel) {
      lineDropdownBtn.onclick = (e) => {
        e.stopPropagation();
        if (depotDropdownPanel) {
          depotDropdownPanel.classList.remove("show");
          if (depotDropdownBtn) {
            depotDropdownBtn.classList.remove("active");
            depotDropdownBtn.setAttribute("aria-expanded", "false");
          }
        }
        const isOpen = lineDropdownPanel.classList.contains("show");
        if (isOpen) {
          lineDropdownPanel.classList.remove("show");
          lineDropdownBtn.classList.remove("active");
          lineDropdownBtn.setAttribute("aria-expanded", "false");
        } else {
          lineDropdownPanel.classList.add("show");
          lineDropdownBtn.classList.add("active");
          lineDropdownBtn.setAttribute("aria-expanded", "true");
        }
      };

      lineDropdownPanel.onclick = (e) => {
        e.stopPropagation();
      };
    }

    // Đóng dropdown khi click ngoài
    document.addEventListener("click", () => {
      if (depotDropdownPanel) {
        depotDropdownPanel.classList.remove("show");
        if (depotDropdownBtn) {
          depotDropdownBtn.classList.remove("active");
          depotDropdownBtn.setAttribute("aria-expanded", "false");
        }
      }
      if (lineDropdownPanel) {
        lineDropdownPanel.classList.remove("show");
        if (lineDropdownBtn) {
          lineDropdownBtn.classList.remove("active");
          lineDropdownBtn.setAttribute("aria-expanded", "false");
        }
      }
    });
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

  // Key lưu cache phía Client (SessionStorage) để trang hiển thị tức thì (0ms)
  const CLIENT_CACHE_KEY = "CACHED_REBOOKING_ORDERS_V4";

  // Hàm chuẩn hóa biển số xe để so khớp (bỏ khoảng trắng, dấu gạch ngang, chấm)
  function cleanTruckPlate(t) {
    if (!t || t === "-" || t === "null" || t === "undefined") return "";
    return String(t).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  // Nhận diện đơn bị hủy hoặc từ chối
  function isCancelledOrFailedRecord(r) {
    if (!r) return true;
    const s = String(r.trangThaiDonHang || "").toLowerCase();
    return s.includes("hủy") || s.includes("huy") || s.includes("từ chối") || s.includes("tu choi") || s.includes("chưa thanh toán") || s.includes("chua thanh toan");
  }

  // Parse thời gian an toàn cho bản ghi (hỗ trợ mọi định dạng ngày: YYYY-MM-DD, HH:mm DD-MM-YYYY, DD/MM/YYYY)
  function parseRecordTimestamp(r) {
    if (!r) return 0;
    const val = r.ngayHuyDon || r.ngayDuocDuyet || r.thoiGianKichHoat || r.createdAt;
    if (!val || val === "-" || val === "null" || val === "undefined") return 0;
    const str = String(val).trim();
    if (!str) return 0;

    const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ymdMatch) {
      const y = parseInt(ymdMatch[1], 10);
      const m = parseInt(ymdMatch[2], 10) - 1;
      const d = parseInt(ymdMatch[3], 10);
      const hh = ymdMatch[4] !== undefined ? parseInt(ymdMatch[4], 10) : 0;
      const mm = ymdMatch[5] !== undefined ? parseInt(ymdMatch[5], 10) : 0;
      const ss = ymdMatch[6] !== undefined ? parseInt(ymdMatch[6], 10) : 0;
      return new Date(y, m, d, hh, mm, ss).getTime();
    }

    const dmyMatch = str.match(/^(?:(\d{1,2}):(\d{2})(?::(\d{2}))?\s+)?(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const hh = dmyMatch[1] !== undefined ? parseInt(dmyMatch[1], 10) : 0;
      const mm = dmyMatch[2] !== undefined ? parseInt(dmyMatch[2], 10) : 0;
      const ss = dmyMatch[3] !== undefined ? parseInt(dmyMatch[3], 10) : 0;
      const d = parseInt(dmyMatch[4], 10);
      const m = parseInt(dmyMatch[5], 10) - 1;
      const y = parseInt(dmyMatch[6], 10);
      return new Date(y, m, d, hh, mm, ss).getTime();
    }

    const t = new Date(str).getTime();
    return isNaN(t) ? 0 : t;
  }

  // Nạp dữ liệu từ backend (Tối ưu hóa Server-Side: Nhận kết quả đã tính sẵn từ máy chủ)
  async function loadVerificationData(forceRefresh = false) {
    let hasRenderedFromCache = false;

    // 1. Kiểm tra cache Client để hiển thị lập tức 0ms
    if (!forceRefresh) {
      try {
        const cachedRaw = sessionStorage.getItem(CLIENT_CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && Array.isArray(cached.groups) && cached.groups.length > 0) {
            allGroupedOrders = cached.groups;
            allRawRecords = { length: cached.rawCount || cached.groups.length };
            if (badgeFileCount) {
              badgeFileCount.textContent = `${cached.stats?.fileCount || 0} tệp đã tích lũy`;
            }
            populateDropdownFilters();
            applyFilters();
            hideAlert();
            hasRenderedFromCache = true;
          }
        }
      } catch (e) {}
    }

    if (!hasRenderedFromCache) {
      showAlert("info", "Đang tải dữ liệu đơn đặt lại đã tính toán sẵn từ máy chủ...");
      if (tbodyRebookingData) {
        tbodyRebookingData.innerHTML = `
          <tr>
            <td colspan="15" class="text-center py-4" style="color:var(--text-muted);font-weight:500;">
              Đang nạp dữ liệu đơn đặt lại từ máy chủ...
            </td>
          </tr>
        `;
      }
    }

    try {
      let isLoadedFromBackend = false;

      // 1. Ưu tiên gọi API tính sẵn từ Backend (Server-side Precomputed - Siêu tốc)
      try {
        const url = forceRefresh ? "/api/rebooking/grouped-orders?refresh=1" : "/api/rebooking/grouped-orders";
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === "success" && Array.isArray(json.groups)) {
            allGroupedOrders = json.groups;
            const stats = json.stats || { fileCount: 0 };
            const rawCount = json.totalRawRecords || allGroupedOrders.length;
            allRawRecords = { length: rawCount };

            if (badgeFileCount) {
              badgeFileCount.textContent = `${stats.fileCount || 0} tệp đã tích lũy`;
            }

            try {
              sessionStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ groups: allGroupedOrders, stats, rawCount }));
            } catch (e) {}

            isLoadedFromBackend = true;
          }
        }
      } catch (backendErr) {
        console.warn("[RebookingAnalytics] API Backend /api/rebooking/grouped-orders chưa sẵn sàng, kích hoạt fallback:", backendErr);
      }

      // 2. Tự động Fallback: Nếu API Backend 404 hoặc chưa khởi động lại, lấy all-data và gom nhóm phía Client
      if (!isLoadedFromBackend) {
        console.info("[RebookingAnalytics] Đang sử dụng cơ chế dự phòng Client-side qua /api/verification/all-data");
        const fallbackUrl = forceRefresh ? "/api/verification/all-data?refresh=1" : "/api/verification/all-data";
        const fallbackRes = await fetch(fallbackUrl);
        if (!fallbackRes.ok) {
          throw new Error(`Mã lỗi máy chủ: ${fallbackRes.status}`);
        }

        const fallbackJson = await fallbackRes.json();
        if (fallbackJson.status !== "success" || !Array.isArray(fallbackJson.records)) {
          throw new Error(fallbackJson.message || "Dữ liệu trả về không đúng định dạng chuẩn");
        }

        allRawRecords = fallbackJson.records;
        const stats = fallbackJson.stats || { fileCount: 0 };
        if (badgeFileCount) {
          badgeFileCount.textContent = `${stats.fileCount || 0} tệp đã tích lũy`;
        }

        allGroupedOrders = groupOrders(allRawRecords);

        try {
          sessionStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ groups: allGroupedOrders, stats, rawCount: allRawRecords.length }));
        } catch (e) {}
      }

      // Cập nhật các dropdown chọn lựa
      populateDropdownFilters();

      // Áp dụng bộ lọc ban đầu (Mặc định: Hiển thị tất cả)
      applyFilters();

      hideAlert();
    } catch (err) {
      console.error("[RebookingAnalytics] Lỗi tải dữ liệu:", err);
      if (!hasRenderedFromCache) {
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
  }

  // Thuật toán gom nhóm 4 VÒNG TUẦN TỰ (Sequential 4-Pass Pipeline)
  // VÒNG 1: Booking + Container + Chiều + Depot + Hãng tàu
  //          → Gom các lần hủy/đặt lại trên cùng vỏ Container
  // VÒNG 2 (CHỈ CHIỀU OUT): Booking + Chiều OUT + Depot + Hãng tàu (KHÁC Container)
  //          → Gom đơn đổi vỏ cont mới trong cùng Booking
  // VÒNG 3: Container + Chiều + Người tạo + Số xe + Depot + Hãng tàu (KHÁC Booking)
  //          → Gom đơn bị cấp số Booking mới cho cùng Container
  // VÒNG 4: Chỉ chiều OUT + Người tạo + Depot + Hãng tàu + Số xe (24h) (KHÁC Booking & KHÁC Container)
  //          → Gom đơn lấy rỗng OUT đổi hoàn toàn cả Booking lẫn vỏ cont
  function groupOrders(records) {
    if (!Array.isArray(records) || records.length === 0) return [];

    // 0. Tiền xử lý dữ liệu 1 lần duy nhất (luôn bảo đảm khởi tạo đầy đủ các trường clean)
    // Tăng tốc độ tính toán gấp 10-20 lần cho các vòng gom và sắp xếp
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r._cleanBooking === undefined || r._cleanCont === undefined) {
        if (!r._ts || typeof r._ts !== "number") {
          r._ts = parseRecordTimestamp(r);
        }
        r._cleanBooking = (r.soBooking || "").toString().trim().toUpperCase();
        r._cleanCont = (r.soContainer || "").toString().trim().toUpperCase();
        const dirRaw = (r.loaiDonHang || "").toString().trim().toUpperCase();
        r._cleanDir = dirRaw.includes("OUT") ? "OUT" : (dirRaw.includes("IN") ? "IN" : dirRaw);
        r._cleanCreator = (r.nguoiTao || "").toString().trim().toUpperCase();
        r._cleanDepot = (r.depot || "").toString().trim().toUpperCase();
        r._cleanLine = (r.hangTau || "").toString().trim().toUpperCase();
        r._cleanTruck = cleanTruckPlate(r.soXe);
      }
    }

    // Hàm hỗ trợ gom bản ghi của nhiều nhóm thành 1 nhóm đại diện
    function mergeGroups(groups, keyPrefix, overrides = {}) {
      const combinedRecords = [];
      const seenBookings = new Set();
      const seenConts = new Set();
      groups.forEach(mg => {
        mg.records.forEach(r => {
          combinedRecords.push(r);
          if (r._cleanBooking) seenBookings.add(r._cleanBooking);
          if (r._cleanCont) seenConts.add(r._cleanCont);
        });
        if (mg.allBookings) mg.allBookings.forEach(b => seenBookings.add(b));
        if (mg.allConts) mg.allConts.forEach(c => seenConts.add(c));
      });
      combinedRecords.sort((a, b) => b._ts - a._ts);
      const latest = combinedRecords[0];
      return Object.assign({
        groupKey: `${keyPrefix}`,
        soBooking: latest._cleanBooking || "-",
        soContainer: latest._cleanCont || "-",
        loaiDonHang: latest._cleanDir || groups[0].loaiDonHang || "-",
        depot: latest._cleanDepot || groups[0].depot || "-",
        hangTau: latest._cleanLine || groups[0].hangTau || "-",
        records: combinedRecords,
        allBookings: Array.from(seenBookings),
        allConts: Array.from(seenConts)
      }, overrides);
    }

    // ============================================================
    // VÒNG 1: Gom theo Booking + Container + Chiều + Depot + Hãng tàu
    // ============================================================
    const pass1Map = new Map();

    records.forEach((r, idx) => {
      const b = (r._cleanBooking && r._cleanBooking !== "-") ? r._cleanBooking : "";
      const c = (r._cleanCont && r._cleanCont !== "-") ? r._cleanCont : "";
      const dir = (r._cleanDir === "IN" || r._cleanDir === "OUT") ? r._cleanDir : "NA";
      const dep = r._cleanDepot || "";
      const line = r._cleanLine || "";

      let groupKey;
      if (!b && !c) {
        groupKey = `NO_ID__${r.rowKey || r.id || ('ROW_' + idx)}`;
      } else {
        const bKey = b || "CHUA_CO_BOOKING";
        const cKey = c || "CHUA_CO_CONT";
        const depKey = dep || "CHUA_CO_DEPOT";
        const lineKey = line || "CHUA_CO_HANG_TAU";
        groupKey = `${bKey}__${cKey}__${dir}__${depKey}__${lineKey}`;
      }

      if (!pass1Map.has(groupKey)) {
        pass1Map.set(groupKey, {
          groupKey,
          soBooking: b || "-",
          soContainer: c || "-",
          loaiDonHang: dir,
          depot: dep || "-",
          hangTau: line || "-",
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
      g.records.sort((a, b) => b._ts - a._ts);
    });

    // Bước 1.5: Cập nhật số Booking cho đơn ban đầu chưa có Booking (dựa trên cùng Cont + Chiều)
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

    contWithRealBookingMap.forEach(list => {
      list.sort((a, b) => b.records[0]._ts - a.records[0]._ts);
    });

    const pass1Groups = [];
    pass1Map.forEach(g => {
      const isMissingBk = !g.soBooking || g.soBooking === "-" || g.soBooking === "CHUA_CO_BOOKING";
      const hasCont = g.soContainer && g.soContainer !== "-" && g.soContainer !== "CHUA_CO_CONT";

      if (isMissingBk && hasCont) {
        const key = `${g.soContainer}__${g.loaiDonHang}`;
        const realCandidates = contWithRealBookingMap.get(key);
        if (realCandidates && realCandidates.length > 0) {
          const target = realCandidates[0];
          target.records.push(...g.records);
          target.records.sort((a, b) => b._ts - a._ts);
          target.matchType = "UPDATED_BOOKING";
          return;
        }
      }
      pass1Groups.push(g);
    });

    // Chuẩn hóa thuộc tính cơ sở cho các nhóm từ Vòng 1
    pass1Groups.forEach(g => {
      if (!g.allBookings) {
        const bks = new Set();
        g.records.forEach(r => { if (r._cleanBooking) bks.add(r._cleanBooking); });
        g.allBookings = Array.from(bks);
      }
      if (!g.allConts) {
        const cts = new Set();
        g.records.forEach(r => { if (r._cleanCont) cts.add(r._cleanCont); });
        g.allConts = Array.from(cts);
      }
      if (!g.matchType) {
        g.matchType = g.records.length >= 2 ? "SAME_BOOKING" : "SINGLE";
      }
    });

    // ============================================================
    // VÒNG 2 (MỚI): Gom theo Booking + Chiều OUT + Depot + Hãng tàu (KHÁC Container — CHỈ ÁP DỤNG CHIỀU OUT)
    // Tình huống: Cont cũ bị hủy → đổi vỏ Container mới trong cùng Booking
    // Ràng buộc: Đơn Container cũ phải có trạng thái HỦY, 2 Container phải KHÁC NHAU
    // ============================================================
    const pass2Map = new Map();
    const pass2Groups = [];

    pass1Groups.forEach(candidate => {
      const latest = candidate.records[0];
      const bk = candidate.soBooking;
      const dir = candidate.loaiDonHang;
      const dep = latest._cleanDepot || (candidate.depot || "").toString().trim().toUpperCase();
      const line = latest._cleanLine || (candidate.hangTau || "").toString().trim().toUpperCase();

      // Chỉ gom vào Vòng 2 khi có chiều OUT và đủ Booking + Depot + Hãng tàu hợp lệ
      const isOutDir = dir && dir.toString().toUpperCase().includes("OUT");
      if (!isOutDir || !bk || bk === "-" || bk === "CHUA_CO_BOOKING" || !dep || dep === "-" || !line || line === "-") {
        pass2Groups.push(candidate);
        return;
      }

      const p2Key = `${bk}__${dir}__${dep}__${line}`;

      if (!pass2Map.has(p2Key)) {
        pass2Map.set(p2Key, {
          p2Key,
          soBooking: bk,
          loaiDonHang: dir,
          depot: dep,
          hangTau: line,
          memberGroups: []
        });
      }
      pass2Map.get(p2Key).memberGroups.push(candidate);
    });

    pass2Map.forEach(p2 => {
      const eligible = p2.memberGroups.filter((mg, idx) => {
        if (idx === 0) return true;
        return p2.memberGroups.slice(0, idx).some(prev =>
          prev.soContainer !== mg.soContainer &&
          prev.soContainer !== "-" && mg.soContainer !== "-" &&
          isCancelledOrFailedRecord(prev.records[0])
        );
      });

      if (eligible.length >= 2) {
        const merged = mergeGroups(eligible, `PASS2__${p2.p2Key}`, { matchType: "CHANGED_CONT" });
        pass2Groups.push(merged);
        p2.memberGroups.filter(mg => !eligible.includes(mg)).forEach(mg => pass2Groups.push(mg));
      } else {
        p2.memberGroups.forEach(mg => pass2Groups.push(mg));
      }
    });

    // ============================================================
    // VÒNG 3 (V2 cũ): Gom theo Container + Chiều + Người tạo + Số xe + Depot + Hãng tàu (KHÁC Booking)
    // Tình huống: Cùng container, cùng tài xế/xe nhưng được cấp số Booking mới
    // ============================================================
    const pass3Map = new Map();
    const pass3Groups = [];

    pass2Groups.forEach(candidate => {
      const latest = candidate.records[0];
      const cont = candidate.soContainer;
      const dir = candidate.loaiDonHang;
      const creator = latest._cleanCreator;
      const truck = latest._cleanTruck;
      const dep = latest._cleanDepot || (candidate.depot || "").toString().trim().toUpperCase();
      const line = latest._cleanLine || (candidate.hangTau || "").toString().trim().toUpperCase();

      if (
        !cont || cont === "-" || cont === "CHUA_CO_CONT" ||
        !creator || creator === "-" || !truck ||
        !dep || dep === "-" || !line || line === "-"
      ) {
        pass3Groups.push(candidate);
        return;
      }

      const p3Key = `${cont}__${dir}__${creator}__${truck}__${dep}__${line}`;

      if (!pass3Map.has(p3Key)) {
        pass3Map.set(p3Key, {
          p3Key,
          soContainer: cont,
          loaiDonHang: dir,
          nguoiTaoKey: creator,
          truckKey: truck,
          depot: dep,
          hangTau: line,
          memberGroups: []
        });
      }
      pass3Map.get(p3Key).memberGroups.push(candidate);
    });

    pass3Map.forEach(p3 => {
      if (p3.memberGroups.length >= 2) {
        const merged = mergeGroups(p3.memberGroups, `PASS3__${p3.p3Key}`, { matchType: "CHANGED_BOOKING" });
        pass3Groups.push(merged);
      } else {
        pass3Groups.push(p3.memberGroups[0]);
      }
    });

    // ============================================================
    // VÒNG 4 (V3 cũ): Đơn OUT + Người tạo + Depot + Hãng tàu + Số xe (trong 24h)
    //                  KHÁC Booking & KHÁC Container
    // ============================================================
    const pass4Map = new Map();
    const finalizedGroups = [];

    pass3Groups.forEach(candidate => {
      const latest = candidate.records[0];
      const dir = candidate.loaiDonHang;
      const creator = latest._cleanCreator;
      const dep = latest._cleanDepot || (candidate.depot || "").toString().trim().toUpperCase();
      const line = latest._cleanLine || (candidate.hangTau || "").toString().trim().toUpperCase();
      const truck = latest._cleanTruck;

      const isValidCreator = creator && creator !== "-" && creator !== "UNKNOWN" && creator !== "UNDEFINED";
      const isOut = dir === "OUT";

      if (!isOut || !isValidCreator || !dep || dep === "-" || !line || line === "-" || !truck) {
        finalizedGroups.push(candidate);
        return;
      }

      const p4Key = `OUT__${creator}__${dep}__${line}__${truck}`;

      if (!pass4Map.has(p4Key)) {
        pass4Map.set(p4Key, { p4Key, creator, depot: dep, line, truck, memberGroups: [] });
      }
      pass4Map.get(p4Key).memberGroups.push(candidate);
    });

    pass4Map.forEach(p4 => {
      if (p4.memberGroups.length <= 1) {
        finalizedGroups.push(p4.memberGroups[0]);
        return;
      }

      const sortedMembers = [...p4.memberGroups].sort((a, b) =>
        a.records[a.records.length - 1]._ts - b.records[b.records.length - 1]._ts
      );

      const clusters = [];
      sortedMembers.forEach(curr => {
        const currBk = curr.soBooking || "";
        const currCont = curr.soContainer || "";

        let matchedCluster = null;
        for (let i = clusters.length - 1; i >= 0; i--) {
          const cl = clusters[i];
          const last = cl[cl.length - 1];
          const lastBk = last.soBooking || "";
          const lastCont = last.soContainer || "";

          const hasValidBk = currBk && currBk !== "-" && lastBk && lastBk !== "-";
          const hasValidCont = currCont && currCont !== "-" && lastCont && lastCont !== "-";
          const isDiffBk = currBk !== lastBk;
          const isDiffCont = currCont !== lastCont;

          const isBookingDuplicateInCluster = cl.some(m => (m.soBooking || "") === currBk);
          const isLastFailed = isCancelledOrFailedRecord(last.records[0]);
          const timeDiff = Math.abs(curr.records[curr.records.length - 1]._ts - last.records[0]._ts);
          const isWithin24h = timeDiff <= 24 * 3600 * 1000;

          if (hasValidBk && hasValidCont && isDiffBk && isDiffCont && !isBookingDuplicateInCluster && isLastFailed && isWithin24h) {
            matchedCluster = cl;
            break;
          }
        }

        if (matchedCluster) {
          matchedCluster.push(curr);
        } else {
          clusters.push([curr]);
        }
      });

      clusters.forEach(cl => {
        if (cl.length >= 2) {
          const merged = mergeGroups(cl, `PASS4__${p4.p4Key}__${cl[cl.length-1].soBooking}__${cl[cl.length-1].soContainer}`, {
            loaiDonHang: "OUT",
            depot: p4.depot,
            hangTau: p4.line,
            matchType: "OUT_REPLACED"
          });
          finalizedGroups.push(merged);
        } else {
          finalizedGroups.push(cl[0]);
        }
      });
    });

    // ----------------------------------------------------
    // TỔNG HỢP TOÀN BỘ PHẦN ĐỆM VÀO KẾT QUẢ ĐỐI TƯỢNG ĐƠN HÀNG
    // ----------------------------------------------------
    const result = finalizedGroups.map(g => {
      g.records.sort((a, b) => b._ts - a._ts);

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
        latestTimestamp: latest._ts || 0,
        firstTimestamp: first._ts || 0,
        tenTaiXe: latest.tenTaiXe || first.tenTaiXe || "-",
        sdtTaiXe: latest.sdtTaiXe || first.sdtTaiXe || "-",
        tenNhaXe: latest.tenNhaXe || first.tenNhaXe || "-",
        soXe: latest.soXe || first.soXe || "-",
        nguoiTao: latest.nguoiTao || first.nguoiTao || "-",
        matchType: g.matchType || (totalAttempts >= 2 ? "SAME_BOOKING" : "SINGLE"),
        allBookings: g.allBookings || [g.soBooking],
        allConts: g.allConts || [g.soContainer],
        latestRecord: latest,
        firstRecord: first,
        records: g.records
      };
    });

    return result;
  }

  // Cập nhật nhãn nút đa chọn Depot
  function updateDepotButtonLabel() {
    if (!depotSelectedLabel || !depotDropdownBtn) return;
    const count = selectedDepots.length;
    const total = allDepotValues.length;

    if (count === 0) {
      depotSelectedLabel.textContent = "Chưa chọn Depot";
      depotDropdownBtn.classList.remove("has-selection");
    } else if (count === total) {
      depotSelectedLabel.textContent = "Tất cả Depot";
      depotDropdownBtn.classList.remove("has-selection");
    } else if (count === 1) {
      depotSelectedLabel.textContent = `Depot: ${selectedDepots[0]}`;
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

  // Khởi tạo danh sách đa chọn Depot
  function initDepotMultiSelect(depots) {
    allDepotValues = [...depots];
    if (selectedDepots.length === 0) {
      selectedDepots = [...depots];
    } else {
      selectedDepots = selectedDepots.filter(d => allDepotValues.includes(d));
      if (selectedDepots.length === 0) selectedDepots = [...depots];
    }
    if (!depotOptionsList) return;

    depotOptionsList.innerHTML = allDepotValues.map(d => `
      <label class="multiselect-item">
        <input type="checkbox" class="depot-cb" value="${escapeHtml(d)}" ${selectedDepots.includes(d) ? "checked" : ""}>
        <span>${escapeHtml(d)}</span>
      </label>
    `).join("");

    if (depotSelectAll) {
      depotSelectAll.onchange = () => {
        const isChecked = depotSelectAll.checked;
        selectedDepots = isChecked ? [...allDepotValues] : [];
        const checkboxes = depotOptionsList.querySelectorAll(".depot-cb");
        checkboxes.forEach(cb => cb.checked = isChecked);
        updateDepotButtonLabel();
        currentPage = 1;
        applyFilters();
      };
    }

    const checkboxes = depotOptionsList.querySelectorAll(".depot-cb");
    checkboxes.forEach(cb => {
      cb.onchange = () => {
        selectedDepots = Array.from(checkboxes)
          .filter(c => c.checked)
          .map(c => c.value);
        updateDepotButtonLabel();
        currentPage = 1;
        applyFilters();
      };
    });

    updateDepotButtonLabel();
  }

  // Cập nhật nhãn nút đa chọn Hãng tàu
  function updateLineButtonLabel() {
    if (!lineSelectedLabel || !lineDropdownBtn) return;
    const count = selectedLines.length;
    const total = allLineValues.length;

    if (count === 0) {
      lineSelectedLabel.textContent = "Chưa chọn Hãng tàu";
      lineDropdownBtn.classList.remove("has-selection");
    } else if (count === total) {
      lineSelectedLabel.textContent = "Tất cả Hãng tàu";
      lineDropdownBtn.classList.remove("has-selection");
    } else if (count === 1) {
      lineSelectedLabel.textContent = `Hãng tàu: ${selectedLines[0]}`;
      lineDropdownBtn.classList.add("has-selection");
    } else {
      lineSelectedLabel.textContent = `Hãng tàu (${count})`;
      lineDropdownBtn.classList.add("has-selection");
    }

    if (lineSelectAll) {
      if (count === total && total > 0) {
        lineSelectAll.checked = true;
        lineSelectAll.indeterminate = false;
      } else if (count === 0) {
        lineSelectAll.checked = false;
        lineSelectAll.indeterminate = false;
      } else {
        lineSelectAll.checked = false;
        lineSelectAll.indeterminate = true;
      }
    }
  }

  // Khởi tạo danh sách đa chọn Hãng tàu
  function initLineMultiSelect(lines) {
    allLineValues = [...lines];
    if (selectedLines.length === 0) {
      selectedLines = [...lines];
    } else {
      selectedLines = selectedLines.filter(l => allLineValues.includes(l));
      if (selectedLines.length === 0) selectedLines = [...lines];
    }
    if (!lineOptionsList) return;

    lineOptionsList.innerHTML = allLineValues.map(l => `
      <label class="multiselect-item">
        <input type="checkbox" class="line-cb" value="${escapeHtml(l)}" ${selectedLines.includes(l) ? "checked" : ""}>
        <span>${escapeHtml(l)}</span>
      </label>
    `).join("");

    if (lineSelectAll) {
      lineSelectAll.onchange = () => {
        const isChecked = lineSelectAll.checked;
        selectedLines = isChecked ? [...allLineValues] : [];
        const checkboxes = lineOptionsList.querySelectorAll(".line-cb");
        checkboxes.forEach(cb => cb.checked = isChecked);
        updateLineButtonLabel();
        currentPage = 1;
        applyFilters();
      };
    }

    const checkboxes = lineOptionsList.querySelectorAll(".line-cb");
    checkboxes.forEach(cb => {
      cb.onchange = () => {
        selectedLines = Array.from(checkboxes)
          .filter(c => c.checked)
          .map(c => c.value);
        updateLineButtonLabel();
        currentPage = 1;
        applyFilters();
      };
    });

    updateLineButtonLabel();
  }

  // Trích xuất danh sách Depot & Hãng tàu cho dropdown đa chọn
  function populateDropdownFilters() {
    const depots = new Set();
    const lines = new Set();
    const statuses = new Set();

    allGroupedOrders.forEach(o => {
      if (o.depot && o.depot !== "-") depots.add(o.depot.toUpperCase());
      if (o.hangTau && o.hangTau !== "-") lines.add(o.hangTau.toUpperCase());
      if (o.latestStatus && o.latestStatus !== "-") statuses.add(o.latestStatus);
    });

    initDepotMultiSelect(Array.from(depots).sort());
    initLineMultiSelect(Array.from(lines).sort());
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
      // 1. Lọc theo ngày cập nhật mới nhất (So sánh số nguyên trực tiếp từ timestamp đã cache)
      if (fromTime || toTime) {
        const orderTime = o.latestTimestamp || 0;
        if (fromTime && orderTime < fromTime) return false;
        if (toTime && orderTime > toTime) return false;
      }

      // 2. Lọc theo Depot (Đa chọn)
      if (allDepotValues.length > 0) {
        if (selectedDepots.length === 0) return false;
        if (selectedDepots.length < allDepotValues.length) {
          const d = (o.depot || "").toUpperCase();
          if (!selectedDepots.includes(d)) return false;
        }
      }

      // 3. Lọc theo Hãng tàu (Đa chọn)
      if (allLineValues.length > 0) {
        if (selectedLines.length === 0) return false;
        if (selectedLines.length < allLineValues.length) {
          const l = (o.hangTau || "").toUpperCase();
          if (!selectedLines.includes(l)) return false;
        }
      }

      // 4. Lọc theo Chiều
      if (dirVal && o.loaiDonHang.toUpperCase() !== dirVal) return false;

      // 5. Lọc theo Trạng thái mới nhất
      if (statusVal && o.latestStatus !== statusVal) return false;

      // 6. Lọc theo Tổng số lần tạo đơn
      if (rebookVal === "rebooked" && o.totalAttempts < 2) return false;
      if (rebookVal === "high_rebooked" && o.totalAttempts < 3) return false;

      // 7. Tìm nhanh theo Booking, Cont, Tài xế, Nhà xe, Hãng tàu, Người tạo, Số xe
      if (term) {
        const matchBooking = o.soBooking && o.soBooking.toLowerCase().includes(term);
        const matchCont = o.soContainer && o.soContainer.toLowerCase().includes(term);
        const matchDriver = o.tenTaiXe && o.tenTaiXe.toLowerCase().includes(term);
        const matchPhone = o.sdtTaiXe && o.sdtTaiXe.toLowerCase().includes(term);
        const matchTransporter = o.tenNhaXe && o.tenNhaXe.toLowerCase().includes(term);
        const matchLine = o.hangTau && o.hangTau.toLowerCase().includes(term);
        const matchCreator = o.nguoiTao && o.nguoiTao.toLowerCase().includes(term);
        const matchTruck = o.soXe && o.soXe.toLowerCase().includes(term);
        if (!matchBooking && !matchCont && !matchDriver && !matchPhone && !matchTransporter && !matchLine && !matchCreator && !matchTruck) {
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

  // Sắp xếp danh sách (Tối ưu hóa: So sánh trực tiếp Timestamp đã cache)
  function applySorting() {
    filteredOrders.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (sortField === "latestDate") {
        valA = a.latestTimestamp || 0;
        valB = b.latestTimestamp || 0;
        return sortDirection === "asc" ? valA - valB : valB - valA;
      } else if (sortField === "firstDate") {
        valA = a.firstTimestamp || 0;
        valB = b.firstTimestamp || 0;
        return sortDirection === "asc" ? valA - valB : valB - valA;
      } else if (sortField === "rebookingCount" || sortField === "totalAttempts" || sortField === "sizeTeus") {
        valA = Number(a[sortField] || 0);
        valB = Number(b[sortField] || 0);
        return sortDirection === "asc" ? valA - valB : valB - valA;
      } else {
        valA = (a[sortField] || "").toString().toLowerCase();
        valB = (b[sortField] || "").toString().toLowerCase();
        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      }
    });
  }

  // Render bảng dữ liệu
  function renderTable() {
    if (!tbodyRebookingData) return;

    const total = filteredOrders.length;
    if (total === 0) {
      tbodyRebookingData.innerHTML = `
        <tr>
          <td colspan="17" class="text-center py-4" style="color:var(--text-muted);font-weight:500;">
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

      // Booking & Container display tinh gọn (đã ẩn nhãn ghi chú [Đổi Booking], [OUT Đặt Lại])
      const bookingDisplay = `<code>${escapeHtml(o.soBooking)}</code>`;
      const contDisplay = `<strong>${escapeHtml(o.soContainer)}</strong>`;

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
          <td><strong>${escapeHtml(o.soXe || "-")}</strong></td>
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
            <td style="font-size:12px;font-weight:600;">${escapeHtml(r.soXe || "-")}</td>
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

    // Đặt lại đa chọn Depot
    if (allDepotValues.length > 0) {
      selectedDepots = [...allDepotValues];
      if (depotOptionsList) {
        depotOptionsList.querySelectorAll(".depot-cb").forEach(cb => cb.checked = true);
      }
      updateDepotButtonLabel();
    }

    // Đặt lại đa chọn Hãng tàu
    if (allLineValues.length > 0) {
      selectedLines = [...allLineValues];
      if (lineOptionsList) {
        lineOptionsList.querySelectorAll(".line-cb").forEach(cb => cb.checked = true);
      }
      updateLineButtonLabel();
    }
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
        "Số Xe": o.soXe,
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
        ? ` ${ymdMatch[4].padStart(2, "0")}:${ymdMatch[5].padStart(2, "0")}`
        : "";
      return `${d}/${m}/${y}${time}`;
    }

    const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmyMatch) {
      const d = dmyMatch[1].padStart(2, "0");
      const m = dmyMatch[2].padStart(2, "0");
      const y = dmyMatch[3];
      const time = dmyMatch[4] !== undefined
        ? ` ${dmyMatch[4].padStart(2, "0")}:${dmyMatch[5].padStart(2, "0")}`
        : "";
      return `${d}/${m}/${y}${time}`;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const pad = n => String(n).padStart(2, "0");
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    return str;
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
