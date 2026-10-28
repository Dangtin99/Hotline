/**
 * PHÂN HỆ QUẢN TRỊ HỆ THỐNG - PHÂN QUYỀN TÀI KHOẢN NGƯỜI DÙNG
 * Logistics Cancellation Analytics - GPG Logistics
 * Chia thành 3 tab con:
 *  1. Phân Quyền Vào Dữ Liệu Depot
 *  2. Phân Quyền Xem Báo Cáo
 *  3. Khóa / Kích Hoạt User
 * Tuân thủ quy chuẩn: Clean UI, No-Icon, Responsive & Data Integrity
 */

// Danh sách 6 màn hình báo cáo hệ thống chuẩn
const USER_MGT_SCREENS_CONFIG = [
  {
    id: "dashboard",
    name: "Bảng Điều Khiển",
    path: "index.html",
    desc: "Tổng quan KPI, biểu đồ sản lượng hủy & phân bổ lỗi"
  },
  {
    id: "data_table",
    name: "Dữ Liệu Chi Tiết",
    path: "data-table.html",
    desc: "Bảng chi tiết 21 cột, phân loại hủy & trạng thái thanh toán"
  },
  {
    id: "verification",
    name: "Dữ Liệu Check Đơn",
    path: "verification-table.html",
    desc: "Bảng đối soát đơn hệ thống Smartlog & kiểm tra lệnh"
  },
  {
    id: "rebooking",
    name: "Báo Cáo Đặt Lại / Mới",
    path: "new-feature.html",
    desc: "Thống kê & phân tích tỷ lệ khách đặt lại đơn hủy"
  },
  {
    id: "call_management",
    name: "Quản Lý Gọi Điện",
    path: "call-management.html",
    desc: "Theo dõi cuộc gọi CSKH & xử lý lý do hủy đơn"
  },
  {
    id: "upload",
    name: "Đăng Tải Dữ Liệu",
    path: "upload.html",
    desc: "Nạp file Excel/CSV báo cáo hủy & đối soát"
  }
];

// Danh sách 13 Depot của hệ thống
const USER_MGT_DEPOTS_LIST = [
  "AIC", "BSD", "CPD", "EAD", "EPD", "ETD", "GKP", "PMCM", "RCS", "SCD", "SLD", "TES", "THT"
];

// Biến lưu trữ trạng thái người dùng & Tab con hiện tại
let currentSubTab = "depot"; // "depot" | "screens" | "lock"
let rawUsersList = [];
let filteredUsersList = [];
let selectedUsernames = new Set();
let activeTargetUsersForDepots = [];
let activeTargetUsersForScreens = [];

// Khởi chạy khi tài liệu nạp xong
document.addEventListener("DOMContentLoaded", () => {
  // Kiểm tra quyền Quản trị viên
  checkAdminAccess();

  // Khởi tạo các sự kiện Sub-Tab
  initSubTabEvents();

  // Khởi tạo các sự kiện bộ lọc & tìm kiếm
  initFilterEvents();

  // Khởi tạo các sự kiện modal
  initModalEvents();

  // Nạp danh sách người dùng từ API Backend
  loadUsers();
});

/**
 * Kiểm tra xem người dùng hiện tại có phải là Admin hay không
 */
function checkAdminAccess() {
  try {
    const userStr = localStorage.getItem("gpg_auth_user");
    if (!userStr) {
      window.location.replace("login.html");
      return;
    }
    const user = JSON.parse(userStr);
    if (!user || user.role !== "admin") {
      alert("Chức năng Phân quyền tài khoản chỉ dành riêng cho Quản trị viên (admin).\nTài khoản hiện tại của bạn là Người dùng (user).");
      window.location.replace("index.html");
    }
  } catch (e) {
    window.location.replace("login.html");
  }
}

/**
 * Khởi tạo sự kiện chuyển đổi giữa 3 tab con
 */
function initSubTabEvents() {
  const btnDepot = document.getElementById("tabBtnDepot");
  const btnScreens = document.getElementById("tabBtnScreens");
  const btnLock = document.getElementById("tabBtnLock");

  if (btnDepot) {
    btnDepot.addEventListener("click", () => switchSubTab("depot"));
  }
  if (btnScreens) {
    btnScreens.addEventListener("click", () => switchSubTab("screens"));
  }
  if (btnLock) {
    btnLock.addEventListener("click", () => switchSubTab("lock"));
  }
}

/**
 * Chuyển đổi giữa 3 Tab con (Depot, Báo Cáo, Khóa User)
 */
function switchSubTab(tabName) {
  if (currentSubTab === tabName) return;
  currentSubTab = tabName;

  const btnDepot = document.getElementById("tabBtnDepot");
  const btnScreens = document.getElementById("tabBtnScreens");
  const btnLock = document.getElementById("tabBtnLock");
  const filterDepot = document.getElementById("filterDepot");
  const filterScreen = document.getElementById("filterScreen");
  const guidanceCard = document.getElementById("tabGuidanceCard");
  const guidanceTitle = document.getElementById("tabGuidanceTitle");
  const guidanceDesc = document.getElementById("tabGuidanceDesc");
  const guidanceTag = document.getElementById("tabGuidanceTag");
  const tableTitle = document.getElementById("tableHeaderTitle");
  const thead = document.getElementById("usersTableHead");
  const bulkBtn = document.getElementById("btnBulkActionActiveTab");
  const btnBulkLock = document.getElementById("btnBulkLockUsers");
  const btnBulkUnlock = document.getElementById("btnBulkUnlockUsers");

  // Reset tab button states
  [btnDepot, btnScreens, btnLock].forEach(btn => {
    if (btn) {
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
    }
  });

  if (tabName === "depot") {
    // 1. Tab Button
    if (btnDepot) {
      btnDepot.classList.add("active");
      btnDepot.setAttribute("aria-selected", "true");
    }

    // 2. Bộ lọc
    if (filterDepot) filterDepot.style.display = "block";
    if (filterScreen) filterScreen.style.display = "none";

    // 3. Thẻ hướng dẫn
    if (guidanceCard) {
      guidanceCard.classList.remove("green-accent", "danger-accent");
    }
    if (guidanceTitle) guidanceTitle.textContent = "Phân Quyền Dữ Liệu Theo Depot Vận Hành:";
    if (guidanceDesc) guidanceDesc.textContent = "Cấp quyền xem các đơn hàng phát sinh tại từng bãi Depot hoặc Toàn quyền xem toàn bộ hệ thống (ALL).";
    if (guidanceTag) {
      guidanceTag.textContent = "DỮ LIỆU BÃI CONT";
      guidanceTag.style.color = "#1d4ed8";
      guidanceTag.style.background = "#eff6ff";
      guidanceTag.style.borderColor = "#bfdbfe";
    }

    // 4. Tiêu đề bảng & Cột
    if (tableTitle) tableTitle.textContent = "Danh Sách Phân Quyền Dữ Liệu Depot";
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 44px; text-align: center;">
            <input type="checkbox" id="userSelectAllCb" title="Chọn tất cả" style="cursor: pointer; width: 16px; height: 16px;">
          </th>
          <th style="width: 50px; text-align: center;">STT</th>
          <th>Họ và Tên</th>
          <th>Tài Khoản</th>
          <th>Vai Trò</th>
          <th>Quyền Truy Cập Depot</th>
          <th style="text-align: center; width: 110px;">Trạng Thái</th>
          <th style="text-align: right; width: 180px;">Thao Tác</th>
        </tr>
      `;
    }

    // 5. Nút bulk action
    if (bulkBtn) {
      bulkBtn.style.display = "inline-flex";
      bulkBtn.textContent = "Phân Quyền Depot";
      bulkBtn.style.background = "var(--blue-primary)";
      bulkBtn.style.borderColor = "var(--blue-primary)";
    }
    if (btnBulkLock) btnBulkLock.style.display = "none";
    if (btnBulkUnlock) btnBulkUnlock.style.display = "none";

  } else if (tabName === "screens") {
    // 1. Tab Button
    if (btnScreens) {
      btnScreens.classList.add("active");
      btnScreens.setAttribute("aria-selected", "true");
    }

    // 2. Bộ lọc
    if (filterDepot) filterDepot.style.display = "none";
    if (filterScreen) filterScreen.style.display = "block";

    // 3. Thẻ hướng dẫn
    if (guidanceCard) {
      guidanceCard.classList.remove("danger-accent");
      guidanceCard.classList.add("green-accent");
    }
    if (guidanceTitle) guidanceTitle.textContent = "Phân Quyền Xem Báo Cáo Hệ Thống:";
    if (guidanceDesc) guidanceDesc.textContent = "Cấp quyền truy cập các phân hệ báo cáo & màn hình điều hành hệ thống (Bảng điều khiển, Báo cáo chi tiết, Check đơn, Đặt lại...).";
    if (guidanceTag) {
      guidanceTag.textContent = "BÁO CÁO & MÀN HÌNH";
      guidanceTag.style.color = "#059669";
      guidanceTag.style.background = "#f0fdf4";
      guidanceTag.style.borderColor = "#bbf7d0";
    }

    // 4. Tiêu đề bảng & Cột
    if (tableTitle) tableTitle.textContent = "Danh Sách Phân Quyền Xem Báo Cáo";
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 44px; text-align: center;">
            <input type="checkbox" id="userSelectAllCb" title="Chọn tất cả" style="cursor: pointer; width: 16px; height: 16px;">
          </th>
          <th style="width: 50px; text-align: center;">STT</th>
          <th>Họ và Tên</th>
          <th>Tài Khoản</th>
          <th>Vai Trò</th>
          <th>Quyền Xem Báo Cáo</th>
          <th style="text-align: center; width: 110px;">Trạng Thái</th>
          <th style="text-align: right; width: 180px;">Thao Tác</th>
        </tr>
      `;
    }

    // 5. Nút bulk action
    if (bulkBtn) {
      bulkBtn.style.display = "inline-flex";
      bulkBtn.textContent = "Phân Quyền Báo Cáo";
      bulkBtn.style.background = "var(--success)";
      bulkBtn.style.borderColor = "var(--success)";
    }
    if (btnBulkLock) btnBulkLock.style.display = "none";
    if (btnBulkUnlock) btnBulkUnlock.style.display = "none";

  } else if (tabName === "lock") {
    // 1. Tab Button
    if (btnLock) {
      btnLock.classList.add("active");
      btnLock.setAttribute("aria-selected", "true");
    }

    // 2. Bộ lọc (ẩn lọc depot & screen)
    if (filterDepot) filterDepot.style.display = "none";
    if (filterScreen) filterScreen.style.display = "none";

    // 3. Thẻ hướng dẫn
    if (guidanceCard) {
      guidanceCard.classList.remove("green-accent");
      guidanceCard.classList.add("danger-accent");
    }
    if (guidanceTitle) guidanceTitle.textContent = "Quản Lý Khóa & Kích Hoạt Tài Khoản (User Lock & Activation):";
    if (guidanceDesc) guidanceDesc.textContent = "Vô hiệu hóa quyền đăng nhập của người dùng khi tạm ngưng công tác hoặc kích hoạt lại tài khoản. Tài khoản đang đăng nhập của bạn được bảo vệ không thể tự khóa.";
    if (guidanceTag) {
      guidanceTag.textContent = "KHÓA / KÍCH HOẠT";
      guidanceTag.style.color = "#dc2626";
      guidanceTag.style.background = "#fef2f2";
      guidanceTag.style.borderColor = "#fecaca";
    }

    // 4. Tiêu đề bảng & Cột
    if (tableTitle) tableTitle.textContent = "Danh Sách Trạng Thái & Quản Lý Khóa Tài Khoản";
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 44px; text-align: center;">
            <input type="checkbox" id="userSelectAllCb" title="Chọn tất cả" style="cursor: pointer; width: 16px; height: 16px;">
          </th>
          <th style="width: 50px; text-align: center;">STT</th>
          <th>Họ và Tên</th>
          <th>Tài Khoản</th>
          <th>Vai Trò</th>
          <th style="text-align: center; width: 140px;">Trạng Thái Hiện Tại</th>
          <th>Quyền Được Cấp (Tóm Tắt)</th>
          <th style="text-align: right; width: 170px;">Thao Tác Khóa User</th>
        </tr>
      `;
    }

    // 5. Nút bulk action (hiển thị nút Khóa / Kích hoạt hàng loạt)
    if (bulkBtn) bulkBtn.style.display = "none";
    if (btnBulkLock) btnBulkLock.style.display = "inline-flex";
    if (btnBulkUnlock) btnBulkUnlock.style.display = "inline-flex";
  }

  // Gắn lại sự kiện chọn tất cả cho header checkbox mới
  rebindSelectAllCheckbox();

  // Tái áp dụng bộ lọc và vẽ lại bảng
  applyFilters();
}

/**
 * Gắn lại sự kiện cho Checkbox chọn tất cả khi render lại thead
 */
function rebindSelectAllCheckbox() {
  const selectAllCb = document.getElementById("userSelectAllCb");
  if (selectAllCb) {
    selectAllCb.onchange = () => {
      const isChecked = selectAllCb.checked;
      filteredUsersList.forEach(u => {
        if (isChecked) {
          selectedUsernames.add(u.username);
        } else {
          selectedUsernames.delete(u.username);
        }
      });
      renderTableBody();
      updateBulkActionBar();
    };
  }
}

/**
 * Hiển thị thông báo phản hồi (Success / Error / Info)
 */
function showNotification(message, type = "success") {
  const box = document.getElementById("userMgtNoticeBox");
  if (!box) return;
  box.className = `auth-notice-box ${type}`;
  box.textContent = message;
  box.style.display = "block";

  box.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (type === "success") {
    setTimeout(() => {
      if (box.className.includes("success")) {
        box.style.display = "none";
      }
    }, 6000);
  }
}

/**
 * Nạp danh sách tài khoản từ máy chủ
 */
async function loadUsers() {
  const tbody = document.getElementById("usersTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 28px; color: var(--text-muted);">Đang tải danh sách tài khoản từ cơ sở dữ liệu...</td></tr>`;
  }

  try {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Không thể tải danh sách tài khoản.");
    }

    rawUsersList = data.users || [];
    selectedUsernames.clear();
    updateBulkActionBar();

    // Cập nhật thẻ thống kê
    renderSummaryKpis(rawUsersList);

    // Lọc & Hiển thị bảng theo tab hiện tại
    applyFilters();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 28px; color: #dc2626; font-weight: 600;">Lỗi khi tải dữ liệu: ${err.message}</td></tr>`;
    }
    showNotification("Lỗi: " + err.message, "error");
  }
}

/**
 * Cập nhật các thẻ thống kê tổng quan (KPI Cards)
 */
function renderSummaryKpis(users) {
  const total = users.length;
  const active = users.filter(u => u.isActive).length;
  const inactive = total - active;
  const admins = users.filter(u => u.role === "admin").length;
  const regularUsers = total - admins;

  const elTotal = document.getElementById("kpiTotalUsers");
  const elActive = document.getElementById("kpiActiveUsers");
  const elInactive = document.getElementById("kpiInactiveUsers");
  const elAdmins = document.getElementById("kpiAdminUsers");
  const elRegular = document.getElementById("kpiRegularUsers");

  if (elTotal) elTotal.textContent = total;
  if (elActive) elActive.textContent = active;
  if (elInactive) elInactive.textContent = inactive;
  if (elAdmins) elAdmins.textContent = admins;
  if (elRegular) elRegular.textContent = regularUsers;
}

/**
 * Khởi tạo các sự kiện tìm kiếm & bộ lọc
 */
function initFilterEvents() {
  const searchInput = document.getElementById("filterSearch");
  const roleSelect = document.getElementById("filterRole");
  const statusSelect = document.getElementById("filterStatus");
  const depotSelect = document.getElementById("filterDepot");
  const screenSelect = document.getElementById("filterScreen");
  const btnReset = document.getElementById("btnResetFilters");
  const btnRefresh = document.getElementById("btnRefreshList");

  if (searchInput) {
    searchInput.addEventListener("input", () => applyFilters());
  }
  if (roleSelect) {
    roleSelect.addEventListener("change", () => applyFilters());
  }
  if (statusSelect) {
    statusSelect.addEventListener("change", () => applyFilters());
  }
  if (depotSelect) {
    depotSelect.addEventListener("change", () => applyFilters());
  }
  if (screenSelect) {
    screenSelect.addEventListener("change", () => applyFilters());
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (roleSelect) roleSelect.value = "ALL";
      if (statusSelect) statusSelect.value = "ALL";
      if (depotSelect) depotSelect.value = "ALL";
      if (screenSelect) screenSelect.value = "ALL";
      applyFilters();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      loadUsers();
    });
  }

  // Khởi tạo Checkbox chọn tất cả
  rebindSelectAllCheckbox();

  // Nút hành động hàng loạt cho Tab Depot & Báo Cáo
  const bulkBtn = document.getElementById("btnBulkActionActiveTab");
  if (bulkBtn) {
    bulkBtn.addEventListener("click", () => {
      const selectedUsers = rawUsersList.filter(u => selectedUsernames.has(u.username));
      if (selectedUsers.length === 0) {
        alert("Vui lòng tick chọn ít nhất một người dùng để thực hiện phân quyền.");
        return;
      }

      if (currentSubTab === "depot") {
        openDepotModalForUsers(selectedUsers);
      } else if (currentSubTab === "screens") {
        openScreensModalForUsers(selectedUsers);
      }
    });
  }

  // Nút Khóa tài khoản hàng loạt cho Tab Khóa User
  const btnBulkLock = document.getElementById("btnBulkLockUsers");
  if (btnBulkLock) {
    btnBulkLock.addEventListener("click", () => handleBulkToggleLock(false));
  }

  // Nút Kích hoạt tài khoản hàng loạt cho Tab Khóa User
  const btnBulkUnlock = document.getElementById("btnBulkUnlockUsers");
  if (btnBulkUnlock) {
    btnBulkUnlock.addEventListener("click", () => handleBulkToggleLock(true));
  }

  // Nút bỏ chọn tất cả
  const btnDeselectAll = document.getElementById("btnDeselectAll");
  if (btnDeselectAll) {
    btnDeselectAll.addEventListener("click", () => {
      selectedUsernames.clear();
      renderTableBody();
      updateBulkActionBar();
    });
  }
}

/**
 * Xử lý Khóa / Kích hoạt tài khoản hàng loạt
 */
async function handleBulkToggleLock(isActive) {
  const actionText = isActive ? "kích hoạt" : "vô hiệu hóa";
  let targetUsernames = Array.from(selectedUsernames);

  let currentUser = {};
  try {
    currentUser = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
  } catch (e) {}

  if (!isActive) {
    // Không cho phép tự khóa tài khoản của người dùng đang đăng nhập
    targetUsernames = targetUsernames.filter(u => String(u).toLowerCase() !== String(currentUser.username).toLowerCase());
  }

  if (targetUsernames.length === 0) {
    alert("Không có tài khoản hợp lệ nào được chọn để " + actionText + ".");
    return;
  }

  if (!confirm(`Bạn có chắc chắn muốn ${actionText} ${targetUsernames.length} tài khoản đã chọn không?`)) {
    return;
  }

  let successCount = 0;
  for (const username of targetUsernames) {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        successCount++;
      }
    } catch (e) {}
  }

  showNotification(`Đã ${actionText} thành công ${successCount}/${targetUsernames.length} tài khoản.`, "success");
  selectedUsernames.clear();
  await loadUsers();
}

/**
 * Lọc dữ liệu theo các tiêu chí và render lại bảng
 */
function applyFilters() {
  const search = (document.getElementById("filterSearch")?.value || "").trim().toLowerCase();
  const role = document.getElementById("filterRole")?.value || "ALL";
  const status = document.getElementById("filterStatus")?.value || "ALL";
  const depot = document.getElementById("filterDepot")?.value || "ALL";
  const screen = document.getElementById("filterScreen")?.value || "ALL";

  filteredUsersList = rawUsersList.filter(u => {
    // 1. Tìm kiếm theo tên / username
    if (search) {
      const matchName = String(u.fullName || "").toLowerCase().includes(search);
      const matchUser = String(u.username || "").toLowerCase().includes(search);
      if (!matchName && !matchUser) return false;
    }

    // 2. Lọc theo vai trò
    if (role !== "ALL") {
      if (role === "admin" && u.role !== "admin") return false;
      if (role === "user" && u.role === "admin") return false;
    }

    // 3. Lọc theo trạng thái
    if (status !== "ALL") {
      const isActive = status === "active";
      if (Boolean(u.isActive) !== isActive) return false;
    }

    // 4. Lọc theo Tab đang chọn
    if (currentSubTab === "depot") {
      if (depot !== "ALL") {
        const userDepots = Array.isArray(u.assignedDepots)
          ? u.assignedDepots
          : (u.assignedDepots ? String(u.assignedDepots).split(",").map(d => d.trim().toUpperCase()) : ["ALL"]);

        if (depot === "ALL_DEPOTS") {
          if (!userDepots.includes("ALL")) return false;
        } else {
          if (!userDepots.includes("ALL") && !userDepots.includes(depot.toUpperCase())) {
            return false;
          }
        }
      }
    } else if (currentSubTab === "screens") {
      if (screen !== "ALL") {
        const userScreens = Array.isArray(u.allowedScreens)
          ? u.allowedScreens
          : (u.allowedScreens ? String(u.allowedScreens).split(",").map(s => s.trim().toLowerCase()) : (u.role === "admin" ? ["ALL"] : ["dashboard", "data_table"]));

        if (screen === "ALL_SCREENS") {
          if (u.role !== "admin" && !userScreens.includes("all")) return false;
        } else {
          if (u.role !== "admin" && !userScreens.includes("all") && !userScreens.includes(screen.toLowerCase())) {
            return false;
          }
        }
      }
    }

    return true;
  });

  renderTableBody();
  updateBulkActionBar();
}

/**
 * Hiển thị các dòng trong bảng người dùng theo Tab đang active
 */
function renderTableBody() {
  const tbody = document.getElementById("usersTableBody");
  const countLabel = document.getElementById("tableCountLabel");
  const selectAllCb = document.getElementById("userSelectAllCb");
  if (!tbody) return;

  if (countLabel) {
    countLabel.textContent = `Hiển thị ${filteredUsersList.length} / ${rawUsersList.length} tài khoản`;
  }

  if (filteredUsersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 28px; color: var(--text-muted);">Không tìm thấy tài khoản nào khớp với bộ lọc.</td></tr>`;
    if (selectAllCb) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }
    return;
  }

  // Cập nhật trạng thái checkbox selectAll
  if (selectAllCb) {
    const allChecked = filteredUsersList.length > 0 && filteredUsersList.every(u => selectedUsernames.has(u.username));
    const someChecked = filteredUsersList.some(u => selectedUsernames.has(u.username));
    selectAllCb.checked = allChecked;
    selectAllCb.indeterminate = !allChecked && someChecked;
  }

  let currentUser = {};
  try {
    currentUser = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
  } catch (e) {}

  tbody.innerHTML = filteredUsersList.map((u, idx) => {
    const isCurrentLoggedIn = String(u.username).toLowerCase() === String(currentUser.username).toLowerCase();
    const isChecked = selectedUsernames.has(u.username);

    // Trạng thái tài khoản
    const statusBadge = u.isActive
      ? `<span class="user-status-badge active">Hoạt động</span>`
      : `<span class="user-status-badge inactive">Đã khóa</span>`;

    // Vai trò tài khoản
    const roleBadge = `<span class="user-role-tag ${u.role}">${u.role === "admin" ? "QUẢN TRỊ VIÊN (ADMIN)" : "NGƯỜI DÙNG (USER)"}</span>`;

    // Chuẩn bị dữ liệu danh sách Depot & Màn hình
    const userDepots = Array.isArray(u.assignedDepots)
      ? u.assignedDepots
      : (u.assignedDepots ? String(u.assignedDepots).split(",").map(d => d.trim().toUpperCase()).filter(Boolean) : ["ALL"]);

    const userScreens = Array.isArray(u.allowedScreens)
      ? u.allowedScreens
      : (u.allowedScreens ? String(u.allowedScreens).split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : (u.role === "admin" ? ["ALL"] : ["dashboard", "data_table"]));

    // Xử lý hiển thị từng Tab
    if (currentSubTab === "depot") {
      // TAB 1: PHÂN QUYỀN DEPOT
      let permissionCellHtml = "";
      if (u.role === "admin" || userDepots.includes("ALL")) {
        permissionCellHtml = `
          <button type="button" class="btn-cell-badge badge-depot-all" onclick="openDepotModalForSingle('${u.username}')" title="Bấm để chỉnh sửa quyền Depot">
            Toàn quyền (ALL)
          </button>
        `;
      } else {
        const displayDepots = userDepots.slice(0, 3).join(", ");
        const moreCount = userDepots.length > 3 ? ` +${userDepots.length - 3}` : "";
        permissionCellHtml = `
          <button type="button" class="btn-cell-badge badge-depot-custom" onclick="openDepotModalForSingle('${u.username}')" title="Danh sách: ${userDepots.join(', ')} (Bấm để sửa)">
            ${userDepots.length} Depot (${displayDepots}${moreCount})
          </button>
        `;
      }

      const mainActionBtn = `<button type="button" class="btn-action-small btn-action-depot" onclick="openDepotModalForSingle('${u.username}')" title="Phân quyền truy cập Depot">Phân Quyền Depot</button>`;

      return `
        <tr class="${isChecked ? 'row-selected' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="user-row-cb" value="${u.username}" ${isChecked ? 'checked' : ''} onchange="handleRowCheckboxChange(this, '${u.username}')" style="cursor: pointer; width: 16px; height: 16px;">
          </td>
          <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
          <td>
            <div style="font-weight: 600; color: #0f172a;">${u.fullName}</div>
            ${isCurrentLoggedIn ? '<span style="font-size: 11px; color: #1d4ed8; font-weight: 600;">(Đang đăng nhập)</span>' : ''}
          </td>
          <td>
            <code class="code-username">${u.username}</code>
          </td>
          <td>${roleBadge}</td>
          <td>${permissionCellHtml}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: right;">
            <div class="table-action-group">
              ${mainActionBtn}
            </div>
          </td>
        </tr>
      `;

    } else if (currentSubTab === "screens") {
      // TAB 2: PHÂN QUYỀN XEM BÁO CÁO
      let screensCellHtml = "";
      if (u.role === "admin" || userScreens.includes("all")) {
        screensCellHtml = `
          <button type="button" class="btn-cell-badge badge-screen-all" onclick="openScreensModalForSingle('${u.username}')" title="Bấm để chỉnh sửa quyền Báo cáo">
            Toàn quyền báo cáo
          </button>
        `;
      } else {
        const count = userScreens.length;
        screensCellHtml = `
          <button type="button" class="btn-cell-badge badge-screen-custom" onclick="openScreensModalForSingle('${u.username}')" title="${userScreens.join(', ')} (Bấm để sửa)">
            ${count} báo cáo
          </button>
        `;
      }

      const mainActionBtn = `<button type="button" class="btn-action-small btn-action-screen" onclick="openScreensModalForSingle('${u.username}')" title="Phân quyền xem Báo cáo">Phân Quyền Báo Cáo</button>`;

      return `
        <tr class="${isChecked ? 'row-selected' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="user-row-cb" value="${u.username}" ${isChecked ? 'checked' : ''} onchange="handleRowCheckboxChange(this, '${u.username}')" style="cursor: pointer; width: 16px; height: 16px;">
          </td>
          <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
          <td>
            <div style="font-weight: 600; color: #0f172a;">${u.fullName}</div>
            ${isCurrentLoggedIn ? '<span style="font-size: 11px; color: #1d4ed8; font-weight: 600;">(Đang đăng nhập)</span>' : ''}
          </td>
          <td>
            <code class="code-username">${u.username}</code>
          </td>
          <td>${roleBadge}</td>
          <td>${screensCellHtml}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: right;">
            <div class="table-action-group">
              ${mainActionBtn}
            </div>
          </td>
        </tr>
      `;

    } else {
      // TAB 3: KHÓA / KÍCH HOẠT USER
      const depotText = (u.role === "admin" || userDepots.includes("ALL")) ? "Toàn quyền Depot" : `${userDepots.length} Depot`;
      const screenText = (u.role === "admin" || userScreens.includes("all")) ? "Toàn quyền Báo Cáo" : `${userScreens.length} Báo Cáo`;
      const permissionsSummary = `<span style="font-size: 12px; color: #475569; font-weight: 500;">${depotText} • ${screenText}</span>`;

      let lockActionBtn = "";
      if (isCurrentLoggedIn) {
        lockActionBtn = `<span style="font-size: 11.5px; color: var(--text-muted); font-style: italic;">Tài khoản của bạn</span>`;
      } else if (u.isActive) {
        lockActionBtn = `<button type="button" class="btn-lock-action btn-lock-danger" onclick="handleToggleStatus('${u.username}', false)" title="Vô hiệu hóa quyền truy cập của người dùng này">Khóa Tài Khoản</button>`;
      } else {
        lockActionBtn = `<button type="button" class="btn-lock-action btn-lock-success" onclick="handleToggleStatus('${u.username}', true)" title="Kích hoạt lại tài khoản cho người dùng">Kích Hoạt Lại</button>`;
      }

      return `
        <tr class="${isChecked ? 'row-selected' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="user-row-cb" value="${u.username}" ${isChecked ? 'checked' : ''} onchange="handleRowCheckboxChange(this, '${u.username}')" style="cursor: pointer; width: 16px; height: 16px;">
          </td>
          <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
          <td>
            <div style="font-weight: 600; color: #0f172a;">${u.fullName}</div>
            ${isCurrentLoggedIn ? '<span style="font-size: 11px; color: #1d4ed8; font-weight: 600;">(Đang đăng nhập)</span>' : ''}
          </td>
          <td>
            <code class="code-username">${u.username}</code>
          </td>
          <td>${roleBadge}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td>${permissionsSummary}</td>
          <td style="text-align: right;">
            ${lockActionBtn}
          </td>
        </tr>
      `;
    }
  }).join("");
}

/**
 * Xử lý khi tick chọn / bỏ chọn checkbox từng dòng
 */
function handleRowCheckboxChange(cb, username) {
  if (cb.checked) {
    selectedUsernames.add(username);
  } else {
    selectedUsernames.delete(username);
  }

  // Cập nhật giao diện hàng
  const tr = cb.closest("tr");
  if (tr) {
    if (cb.checked) tr.classList.add("row-selected");
    else tr.classList.remove("row-selected");
  }

  // Cập nhật trạng thái selectAllCb
  const selectAllCb = document.getElementById("userSelectAllCb");
  if (selectAllCb) {
    const allChecked = filteredUsersList.length > 0 && filteredUsersList.every(u => selectedUsernames.has(u.username));
    const someChecked = filteredUsersList.some(u => selectedUsernames.has(u.username));
    selectAllCb.checked = allChecked;
    selectAllCb.indeterminate = !allChecked && someChecked;
  }

  updateBulkActionBar();
}

/**
 * Cập nhật thanh công cụ thao tác hàng loạt (Bulk Action Bar)
 */
function updateBulkActionBar() {
  const bar = document.getElementById("bulkActionBar");
  const countLabel = document.getElementById("bulkSelectedCount");
  if (!bar || !countLabel) return;

  const count = selectedUsernames.size;
  if (count > 0) {
    bar.style.display = "flex";
    countLabel.textContent = `Đã chọn: ${count} tài khoản`;
  } else {
    bar.style.display = "none";
  }
}

/**
 * Xử lý Khóa / Kích hoạt tài khoản đơn lẻ
 */
async function handleToggleStatus(username, isActive) {
  const actionText = isActive ? "kích hoạt" : "vô hiệu hóa";
  if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản "${username}" không?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/toggle-active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || `Lỗi khi ${actionText} tài khoản.`);
    }

    showNotification(result.message, "success");
    await loadUsers();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

// =========================================================================
// MODAL PHÂN QUYỀN DEPOT
// =========================================================================

function openDepotModalForSingle(username) {
  const user = rawUsersList.find(u => u.username === username);
  if (!user) return;
  openDepotModalForUsers([user]);
}

function openDepotModalForUsers(users) {
  activeTargetUsersForDepots = users;
  const modal = document.getElementById("depotModal");
  const title = document.getElementById("depotModalTitle");
  const sub = document.getElementById("depotModalSubtitle");
  const notice = document.getElementById("depotModalNotice");
  if (!modal) return;

  if (notice) notice.style.display = "none";

  if (users.length === 1) {
    const u = users[0];
    if (title) title.textContent = `Phân Quyền Depot: ${u.fullName}`;
    if (sub) sub.textContent = `Tài khoản: ${u.username} (${u.role === 'admin' ? 'Quản trị viên' : 'Người dùng'})`;
  } else {
    if (title) title.textContent = `Phân Quyền Depot: ${users.length} tài khoản đã chọn`;
    if (sub) sub.textContent = `Áp dụng cho: ${users.map(u => u.fullName).join(", ")}`;
  }

  let precheckDepots = [];
  if (users.length > 0) {
    const u = users[0];
    precheckDepots = Array.isArray(u.assignedDepots)
      ? u.assignedDepots
      : (u.assignedDepots ? String(u.assignedDepots).split(",").map(d => d.trim().toUpperCase()) : ["ALL"]);
  }

  const isAll = precheckDepots.includes("ALL");
  const cbAll = document.getElementById("depotModalCbAll");
  if (cbAll) cbAll.checked = isAll;

  const itemCbs = modal.querySelectorAll(".depot-modal-item-cb");
  itemCbs.forEach(cb => {
    cb.checked = isAll || precheckDepots.includes(cb.value);
  });

  modal.hidden = false;
}

async function handleSaveDepots() {
  const modal = document.getElementById("depotModal");
  const notice = document.getElementById("depotModalNotice");
  const saveBtn = document.getElementById("btnSaveDepots");
  const cbAll = document.getElementById("depotModalCbAll");
  const itemCbs = modal.querySelectorAll(".depot-modal-item-cb");

  let selected = [];
  if (cbAll && cbAll.checked) {
    selected = ["ALL"];
  } else {
    selected = Array.from(itemCbs).filter(c => c.checked).map(c => c.value);
    if (selected.length === 0) {
      if (notice) {
        notice.className = "auth-notice-box error";
        notice.textContent = "Vui lòng chọn ít nhất 1 Depot hoặc chọn Tất cả Depot (ALL).";
        notice.style.display = "block";
      }
      return;
    }
  }

  const origText = saveBtn ? saveBtn.textContent : "Lưu Phân Quyền";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";
  }

  try {
    for (const u of activeTargetUsersForDepots) {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.username)}/depots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depots: selected })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || `Lỗi khi lưu phân quyền cho tài khoản ${u.username}.`);
      }
    }

    try {
      const cur = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
      if (cur && activeTargetUsersForDepots.some(u => String(u.username).toLowerCase() === String(cur.username).toLowerCase())) {
        cur.assignedDepots = selected;
        localStorage.setItem("gpg_auth_user", JSON.stringify(cur));
      }
    } catch (e) {}

    modal.hidden = true;
    const names = activeTargetUsersForDepots.map(u => u.username).join(", ");
    showNotification(`Đã cập nhật phân quyền Depot thành công cho ${activeTargetUsersForDepots.length} tài khoản (${names}).`, "success");
    await loadUsers();
  } catch (err) {
    if (notice) {
      notice.className = "auth-notice-box error";
      notice.textContent = err.message;
      notice.style.display = "block";
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = origText;
    }
  }
}

// =========================================================================
// MODAL PHÂN QUYỀN MÀN HÌNH / BÁO CÁO
// =========================================================================

function openScreensModalForSingle(username) {
  const user = rawUsersList.find(u => u.username === username);
  if (!user) return;
  openScreensModalForUsers([user]);
}

function openScreensModalForUsers(users) {
  activeTargetUsersForScreens = users;
  const modal = document.getElementById("screensModal");
  const title = document.getElementById("screensModalTitle");
  const sub = document.getElementById("screensModalSubtitle");
  const notice = document.getElementById("screensModalNotice");
  if (!modal) return;

  if (notice) notice.style.display = "none";

  if (users.length === 1) {
    const u = users[0];
    if (title) title.textContent = `Phân Quyền Báo Cáo: ${u.fullName}`;
    if (sub) sub.textContent = `Tài khoản: ${u.username} (${u.role === 'admin' ? 'Quản trị viên' : 'Người dùng'})`;
  } else {
    if (title) title.textContent = `Phân Quyền Báo Cáo: ${users.length} tài khoản đã chọn`;
    if (sub) sub.textContent = `Áp dụng cho: ${users.map(u => u.fullName).join(", ")}`;
  }

  let precheckScreens = [];
  if (users.length > 0) {
    const u = users[0];
    precheckScreens = Array.isArray(u.allowedScreens)
      ? u.allowedScreens
      : (u.allowedScreens ? String(u.allowedScreens).split(",").map(s => s.trim().toLowerCase()) : ["dashboard", "data_table"]);
  }

  const isAll = precheckScreens.includes("ALL") || precheckScreens.includes("all");
  const cbAll = document.getElementById("screensModalCbAll");
  if (cbAll) cbAll.checked = isAll;

  const itemCbs = modal.querySelectorAll(".screen-modal-item-cb");
  itemCbs.forEach(cb => {
    cb.checked = isAll || precheckScreens.includes(cb.value);
  });

  modal.hidden = false;
}

async function handleSaveScreens() {
  const modal = document.getElementById("screensModal");
  const notice = document.getElementById("screensModalNotice");
  const saveBtn = document.getElementById("btnSaveScreens");
  const cbAll = document.getElementById("screensModalCbAll");
  const itemCbs = modal.querySelectorAll(".screen-modal-item-cb");

  let selected = [];
  if (cbAll && cbAll.checked) {
    selected = ["ALL"];
  } else {
    selected = Array.from(itemCbs).filter(c => c.checked).map(c => c.value);
    if (selected.length === 0) {
      if (notice) {
        notice.className = "auth-notice-box error";
        notice.textContent = "Vui lòng chọn ít nhất 1 báo cáo hoặc chọn Tất cả Báo cáo (ALL).";
        notice.style.display = "block";
      }
      return;
    }
  }

  const origText = saveBtn ? saveBtn.textContent : "Lưu Quyền Báo Cáo";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";
  }

  try {
    for (const u of activeTargetUsersForScreens) {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.username)}/screens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screens: selected })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || `Lỗi khi lưu phân quyền báo cáo cho tài khoản ${u.username}.`);
      }
    }

    try {
      const cur = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
      if (cur && activeTargetUsersForScreens.some(u => String(u.username).toLowerCase() === String(cur.username).toLowerCase())) {
        cur.allowedScreens = selected;
        localStorage.setItem("gpg_auth_user", JSON.stringify(cur));
        if (typeof applyRolePermissions === "function") {
          applyRolePermissions(cur);
        }
      }
    } catch (e) {}

    modal.hidden = true;
    const names = activeTargetUsersForScreens.map(u => u.username).join(", ");
    showNotification(`Đã cập nhật phân quyền Báo cáo thành công cho ${activeTargetUsersForScreens.length} tài khoản (${names}).`, "success");
    await loadUsers();
  } catch (err) {
    if (notice) {
      notice.className = "auth-notice-box error";
      notice.textContent = err.message;
      notice.style.display = "block";
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = origText;
    }
  }
}

// =========================================================================
// KHỞI TẠO CÁC SỰ KIỆN ĐÓNG / MỞ MODAL
// =========================================================================

function initModalEvents() {
  // 1. Depot Modal
  const depotModal = document.getElementById("depotModal");
  const closeDepotBtns = [
    document.getElementById("btnCloseDepotModal"),
    document.getElementById("btnCancelDepotModal")
  ];
  closeDepotBtns.forEach(b => {
    if (b) b.addEventListener("click", () => { depotModal.hidden = true; });
  });
  if (depotModal) {
    depotModal.addEventListener("click", (e) => {
      if (e.target === depotModal) depotModal.hidden = true;
    });
  }
  const depotCbAll = document.getElementById("depotModalCbAll");
  const depotItems = document.querySelectorAll(".depot-modal-item-cb");
  if (depotCbAll) {
    depotCbAll.addEventListener("change", () => {
      const isChecked = depotCbAll.checked;
      depotItems.forEach(cb => { cb.checked = isChecked; });
    });
  }
  depotItems.forEach(cb => {
    cb.addEventListener("change", () => {
      const allChecked = Array.from(depotItems).every(c => c.checked);
      if (depotCbAll) depotCbAll.checked = allChecked;
    });
  });
  const btnSaveDepots = document.getElementById("btnSaveDepots");
  if (btnSaveDepots) {
    btnSaveDepots.addEventListener("click", handleSaveDepots);
  }

  // 2. Screens Modal
  const screensModal = document.getElementById("screensModal");
  const closeScreensBtns = [
    document.getElementById("btnCloseScreensModal"),
    document.getElementById("btnCancelScreensModal")
  ];
  closeScreensBtns.forEach(b => {
    if (b) b.addEventListener("click", () => { screensModal.hidden = true; });
  });
  if (screensModal) {
    screensModal.addEventListener("click", (e) => {
      if (e.target === screensModal) screensModal.hidden = true;
    });
  }
  const screensCbAll = document.getElementById("screensModalCbAll");
  const screenItems = document.querySelectorAll(".screen-modal-item-cb");
  if (screensCbAll) {
    screensCbAll.addEventListener("change", () => {
      const isChecked = screensCbAll.checked;
      screenItems.forEach(cb => { cb.checked = isChecked; });
    });
  }
  screenItems.forEach(cb => {
    cb.addEventListener("change", () => {
      const allChecked = Array.from(screenItems).every(c => c.checked);
      if (screensCbAll) screensCbAll.checked = allChecked;
    });
  });
  const btnSaveScreens = document.getElementById("btnSaveScreens");
  if (btnSaveScreens) {
    btnSaveScreens.addEventListener("click", handleSaveScreens);
  }
}

// Xuất các hàm ra phạm vi toàn cục để dùng từ template HTML nếu cần
window.handleRowCheckboxChange = handleRowCheckboxChange;
window.handleToggleStatus = handleToggleStatus;
window.openDepotModalForSingle = openDepotModalForSingle;
window.openScreensModalForSingle = openScreensModalForSingle;
window.switchSubTab = switchSubTab;
