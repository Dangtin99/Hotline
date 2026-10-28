// Danh sách định nghĩa 6 màn hình chuẩn của hệ thống Logistics Analytics
const SYSTEM_SCREENS_CONFIG = [
  {
    id: "dashboard",
    name: "Bảng Điều Khiển",
    path: "index.html",
    navId: "navDashboard",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>`,
    desc: "Tổng quan KPI, biểu đồ sản lượng hủy & phân bổ lỗi"
  },
  {
    id: "data_table",
    name: "Dữ Liệu Chi Tiết",
    path: "data-table.html",
    navId: "navDataTable",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    desc: "Bảng chi tiết 21 cột, phân loại hủy & trạng thái thanh toán"
  },
  {
    id: "verification",
    name: "Dữ Liệu Check Đơn",
    path: "verification-table.html",
    navId: "navVerificationTable",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
    desc: "Bảng đối soát đơn hệ thống Smartlog & kiểm tra lệnh"
  },
  {
    id: "rebooking",
    name: "Báo Cáo Đặt Lại / Mới",
    path: "new-feature.html",
    navId: "navNewFeature",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`,
    desc: "Thống kê & phân tích tỷ lệ khách đặt lại đơn hủy"
  },
  {
    id: "call_management",
    name: "Quản Lý Gọi Điện",
    path: "call-management.html",
    navId: "navCallManagement",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
    desc: "Theo dõi cuộc gọi CSKH & xử lý lý do hủy đơn"
  },
  {
    id: "upload",
    name: "Đăng Tải Dữ Liệu",
    path: "upload.html",
    navId: "navUpload",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`,
    desc: "Nạp file Excel/CSV báo cáo hủy & đối soát"
  }
];

// Hàm xác định xem User có quyền truy cập vào màn hình screenId hay không
function userHasScreenAccess(user, screenId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const screens = Array.isArray(user.allowedScreens)
    ? user.allowedScreens.map(s => String(s).trim().toLowerCase())
    : (user.allowedScreens ? String(user.allowedScreens).split(",").map(s => s.trim().toLowerCase()) : ["dashboard", "data_table"]);
  if (screens.includes("all")) return true;
  return screens.includes(String(screenId).trim().toLowerCase());
}

// Hàm xác định screenId của trang hiện tại theo đường dẫn URL
function getCurrentScreenId() {
  const path = window.location.pathname.toLowerCase();
  for (const item of SYSTEM_SCREENS_CONFIG) {
    if (path.endsWith(item.path.toLowerCase())) {
      return item.id;
    }
  }
  // Mặc định trang chủ là dashboard
  if (path.endsWith("/") || path.endsWith("/index") || path.endsWith("/index.html") || !path.includes(".html")) {
    return "dashboard";
  }
  return null;
}

// Hàm tìm màn hình hợp lệ đầu tiên mà user được phép truy cập
function getFirstAllowedScreenPath(user) {
  for (const item of SYSTEM_SCREENS_CONFIG) {
    if (userHasScreenAccess(user, item.id)) {
      return item.path;
    }
  }
  return "index.html";
}

(function() {
  const token = localStorage.getItem("gpg_auth_token");
  const isLoginPage = window.location.pathname.endsWith("login.html") || window.location.pathname.endsWith("login");

  // Nếu chưa đăng nhập và đang ở các trang quản trị/dashboard -> Chuyển ngay về login.html
  if (!token && !isLoginPage) {
    const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace("login.html?redirect=" + currentUrl);
    return;
  }

  // Nếu đã có token và đang ở login.html -> Chuyển về index.html
  if (token && isLoginPage) {
    window.location.replace("index.html");
    return;
  }

  // Phân quyền sớm từ localStorage để bảo vệ trang và áp dụng class ẩn
  try {
    if (localStorage.getItem("gpg_sidebar_collapsed") === "true") {
      document.documentElement.classList.add("sidebar-collapsed");
    }
    const userStr = localStorage.getItem("gpg_auth_user");
    if (userStr && !isLoginPage) {
      const u = JSON.parse(userStr);
      if (u && u.role !== "admin") {
        document.documentElement.classList.add("non-admin-user");
        if (window.location.pathname.toLowerCase().endsWith("user-management.html")) {
          alert("Chức năng Phân quyền tài khoản chỉ dành riêng cho Quản trị viên (admin).\nTài khoản hiện tại của bạn là Người dùng (user).");
          window.location.replace("index.html");
          return;
        }
        const currentScreenId = getCurrentScreenId();
        if (currentScreenId && !userHasScreenAccess(u, currentScreenId)) {
          const redirectPath = getFirstAllowedScreenPath(u);
          window.location.replace(redirectPath);
          return;
        }
      }
    }
  } catch (e) {}
})();

// Interceptor tự động gắn Authorization Header cho mọi request fetch() đến /api/
(function() {
  const _origFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    const token = localStorage.getItem("gpg_auth_token");
    if (token && typeof url === "string" && url.startsWith("/api/")) {
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        if (!options.headers.has("Authorization")) {
          options.headers.set("Authorization", "Bearer " + token);
        }
      } else if (Array.isArray(options.headers)) {
        const hasAuth = options.headers.some(([k]) => k.toLowerCase() === "authorization");
        if (!hasAuth) {
          options.headers.push(["Authorization", "Bearer " + token]);
        }
      } else {
        if (!options.headers["Authorization"] && !options.headers["authorization"]) {
          options.headers["Authorization"] = "Bearer " + token;
        }
      }
    }

    try {
      const response = await _origFetch(url, options);
      // Nếu server phản hồi 401 Unauthorized -> Phiên đăng nhập hết hạn hoặc tài khoản bị vô hiệu hóa
      if (response.status === 401 && typeof url === "string" && !url.includes("/api/auth/login")) {
        localStorage.removeItem("gpg_auth_token");
        localStorage.removeItem("gpg_auth_user");
        const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace("login.html?session_expired=1&redirect=" + currentUrl);
      }
      return response;
    } catch (err) {
      throw err;
    }
  };
})();

// Khởi tạo thông tin người dùng đang đăng nhập
async function initAuthProfile() {
  const token = localStorage.getItem("gpg_auth_token");
  if (!token) return;

  // 1. Hiển thị nhanh từ cache localStorage
  let cachedUser = null;
  try {
    const str = localStorage.getItem("gpg_auth_user");
    if (str) cachedUser = JSON.parse(str);
  } catch (e) {}

  if (cachedUser) {
    renderUserProfile(cachedUser);
  }

  // 2. Xác thực và cập nhật mới nhất từ server
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        const prevDepots = cachedUser ? JSON.stringify(cachedUser.assignedDepots || []) : "";
        const nextDepots = JSON.stringify(data.user.assignedDepots || []);
        localStorage.setItem("gpg_auth_user", JSON.stringify(data.user));
        renderUserProfile(data.user);

        // Nếu quyền Depot đã thay đổi so với cache cũ -> Kích hoạt tải lại dữ liệu tức thời
        if (cachedUser && prevDepots !== nextDepots) {
          if (typeof loadDashboardData === "function") {
            loadDashboardData();
          } else if (typeof loadTableData === "function") {
            loadTableData();
          }
        }
      }
    }
  } catch (err) {
    console.warn("Không thể đồng bộ hồ sơ user:", err.message);
  }
}

// Phân quyền giao diện người dùng theo Danh sách Màn hình (allowedScreens) và Role
function applyRolePermissions(user) {
  if (!user) return;
  const isAdmin = user.role === "admin";
  if (!isAdmin) {
    document.documentElement.classList.add("non-admin-user");

    // 1. Duyệt qua từng màn hình được định nghĩa để ẩn/hiện mục menu tương ứng
    SYSTEM_SCREENS_CONFIG.forEach(screen => {
      const navEl = document.getElementById(screen.navId);
      if (navEl) {
        const hasAccess = userHasScreenAccess(user, screen.id);
        if (hasAccess) {
          navEl.style.removeProperty("display");
        } else {
          navEl.style.setProperty("display", "none", "important");
        }
      }
    });

    // 2. Ẩn tiêu đề và danh mục con Quản trị tải lên nếu không có quyền màn hình upload
    const uploadHeading = document.getElementById("sidebarHeadingUpload");
    if (uploadHeading) {
      const uploadContainer = uploadHeading.nextElementSibling;
      if (userHasScreenAccess(user, "upload")) {
        uploadHeading.style.removeProperty("display");
        if (uploadContainer && uploadContainer.classList.contains("sidebar-group-items")) {
          uploadContainer.style.removeProperty("display");
        }
      } else {
        uploadHeading.style.setProperty("display", "none", "important");
        if (uploadContainer && uploadContainer.classList.contains("sidebar-group-items")) {
          uploadContainer.style.setProperty("display", "none", "important");
        }
      }
    }

    // 3. Ẩn các phần tử có thuộc tính data-admin-only="true"
    const adminOnlyEls = document.querySelectorAll("[data-admin-only='true']:not(#navDashboard):not(#navDataTable):not(#navVerificationTable):not(#navNewFeature):not(#navCallManagement):not(#navUpload):not(#sidebarHeadingUpload)");
    adminOnlyEls.forEach(el => el.style.setProperty("display", "none", "important"));

    // 4. Kiểm tra quyền truy cập vào màn hình hiện tại
    const currentScreenId = getCurrentScreenId();
    if (currentScreenId && !userHasScreenAccess(user, currentScreenId)) {
      const allowedTarget = SYSTEM_SCREENS_CONFIG.find(s => s.id === currentScreenId);
      const screenName = allowedTarget ? allowedTarget.name : "này";
      const redirectPath = getFirstAllowedScreenPath(user);
      alert(`Bạn không có quyền truy cập vào màn hình "${screenName}". Hệ thống sẽ tự động chuyển hướng về trang hợp lệ.`);
      window.location.replace(redirectPath);
    }
  } else {
    document.documentElement.classList.remove("non-admin-user");
    // Đối với Admin: Hiển thị đầy đủ tất cả các màn hình
    SYSTEM_SCREENS_CONFIG.forEach(screen => {
      const navEl = document.getElementById(screen.navId);
      if (navEl) navEl.style.removeProperty("display");
    });
    const uploadHeading = document.getElementById("sidebarHeadingUpload");
    if (uploadHeading) {
      uploadHeading.style.removeProperty("display");
      if (uploadHeading.nextElementSibling && uploadHeading.nextElementSibling.classList.contains("sidebar-group-items")) {
        uploadHeading.nextElementSibling.style.removeProperty("display");
      }
    }
    const adminOnlyEls = document.querySelectorAll("[data-admin-only='true']");
    adminOnlyEls.forEach(el => el.style.removeProperty("display"));
  }
}

// Cập nhật thông tin lên thanh header dạng 1 nút User Chip và Dropdown Menu (Khớp hình mẫu)
function renderUserProfile(user) {
  if (!user) return;
  applyRolePermissions(user);

  const sidebarUserEl = document.getElementById("sidebarUserName");
  if (sidebarUserEl) sidebarUserEl.textContent = user.fullName || user.username;

  const headerMenu = document.getElementById("headerUserMenu");
  if (!headerMenu) return;

  const displayName = (user.fullName || user.username || "người dùng").toLowerCase();
  const isAdmin = user.role === "admin";

  headerMenu.className = "header-user-dropdown-container";
  headerMenu.innerHTML = `
    <button type="button" class="user-chip-btn" id="userChipBtn" aria-haspopup="true" aria-expanded="false" title="Menu người dùng">
      ${displayName}
    </button>

    <div class="user-chip-dropdown-menu" id="userChipDropdown" hidden>
      <button type="button" class="user-dropdown-item" id="menuBtnAdmin">
        Phân quyền tài khoản
      </button>
      <button type="button" class="user-dropdown-item" id="menuBtnChangePass">
        Đặt lại mật khẩu
      </button>
      <button type="button" class="user-dropdown-item user-dropdown-danger" id="menuBtnLogout">
        Đăng xuất
      </button>
    </div>
  `;

  // Gắn sự kiện mở/đóng Dropdown
  const chipBtn = document.getElementById("userChipBtn");
  const dropdown = document.getElementById("userChipDropdown");
  const btnAdmin = document.getElementById("menuBtnAdmin");
  const btnChangePass = document.getElementById("menuBtnChangePass");
  const btnLogout = document.getElementById("menuBtnLogout");

  if (chipBtn && dropdown) {
    chipBtn.onclick = (e) => {
      e.stopPropagation();
      const isClosed = dropdown.hidden;
      dropdown.hidden = !isClosed;
      chipBtn.setAttribute("aria-expanded", String(isClosed));
    };
  }

  if (btnAdmin) {
    btnAdmin.onclick = (e) => {
      e.stopPropagation();
      dropdown.hidden = true;
      if (chipBtn) chipBtn.setAttribute("aria-expanded", "false");
      if (isAdmin) {
        window.location.href = "user-management.html";
      } else {
        alert("Chức năng Phân quyền tài khoản chỉ dành riêng cho Quản trị viên (admin).\nTài khoản hiện tại của bạn là Người dùng (user).");
      }
    };
  }

  if (btnChangePass) {
    btnChangePass.onclick = (e) => {
      e.stopPropagation();
      dropdown.hidden = true;
      if (chipBtn) chipBtn.setAttribute("aria-expanded", "false");
      openChangePasswordModal();
    };
  }

  if (btnLogout) {
    btnLogout.onclick = (e) => {
      e.stopPropagation();
      logout();
    };
  }
}

// Đóng dropdown khi nhấn ra ngoài
document.addEventListener("click", (e) => {
  const headerMenu = document.getElementById("headerUserMenu");
  const dropdown = document.getElementById("userChipDropdown");
  const chipBtn = document.getElementById("userChipBtn");
  if (dropdown && !dropdown.hidden && headerMenu && !headerMenu.contains(e.target)) {
    dropdown.hidden = true;
    if (chipBtn) chipBtn.setAttribute("aria-expanded", "false");
  }
});

// Hàm đăng xuất
function logout() {
  localStorage.removeItem("gpg_auth_token");
  localStorage.removeItem("gpg_auth_user");
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.replace("login.html");
}

window.logout = logout;

// =========================================================================
// MODAL QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN (DÀNH CHO ADMIN)
// =========================================================================

function ensureAdminUserModal() {
  let modal = document.getElementById("adminUserModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "adminUserModal";
  modal.className = "modal-backdrop";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-dialog auth-modal-dialog-md">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title-group">
            <div>
              <div class="modal-title">Quản Lý Tài Khoản & Phân Quyền Hệ Thống</div>
              <div class="modal-subtitle">Cấu trúc bảng ghi SQL: Tên, Tài khoản, Mật khẩu, Quyền & Trạng thái hoạt động (isActive)</div>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="closeAdminUserModalBtn" title="Đóng">&times;</button>
        </div>

        <div style="padding: 12px 24px 0 24px;">
          <div id="adminUserNotice" class="auth-notice-box"></div>
        </div>

        <div class="modal-body" style="padding: 12px 24px 20px 24px;">
          <div class="table-responsive" style="max-height: 55vh; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
            <table class="modal-data-table" id="adminUsersTable">
              <thead>
                <tr>
                  <th style="width: 40px; text-align: center;">
                    <input type="checkbox" id="adminUserSelectAllCb" title="Chọn tất cả" style="cursor: pointer; width: 15px; height: 15px;">
                  </th>
                  <th style="width: 50px; text-align: center;">STT</th>
                  <th>Họ và Tên</th>
                  <th>Tài Khoản</th>
                  <th>Quyền Hạn</th>
                  <th style="text-align: center;">Màn Hình Được Cấp</th>
                  <th style="text-align: center;">Trạng Thái (isActive)</th>
                  <th style="text-align: right; width: 230px;">Hành Động</th>
                </tr>
              </thead>
              <tbody id="adminUsersTableBody">
                <tr><td colspan="7" style="text-align: center; padding: 20px;">Đang tải danh sách tài khoản...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 24px;">
          <div class="modal-footer-count" id="adminUsersCountLabel">Tổng số: 0 tài khoản</div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button type="button" class="btn btn-primary btn-sm" id="btnAdminFooterScreens" style="font-weight: 700; background: #059669; color: #ffffff; padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;" title="Chọn user bằng tickbox và bấm để phân quyền màn hình">Phân Quyền Màn Hình</button>
            <button type="button" class="btn btn-primary btn-sm" id="btnAdminFooterDepot" style="font-weight: 700; background: #1d4ed8; color: #ffffff; padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;" title="Chọn user bằng tickbox và bấm để phân quyền Depot">Phân Quyền Depot</button>
            <button type="button" class="btn btn-secondary btn-sm" id="closeAdminUserModalFooterBtn">Đóng</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtns = [
    modal.querySelector("#closeAdminUserModalBtn"),
    modal.querySelector("#closeAdminUserModalFooterBtn")
  ];
  closeBtns.forEach(b => {
    if (b) b.onclick = () => { modal.hidden = true; };
  });

  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };

  // Checkbox chọn tất cả tài khoản
  const selectAllCb = modal.querySelector("#adminUserSelectAllCb");
  if (selectAllCb) {
    selectAllCb.onchange = () => {
      const isChecked = selectAllCb.checked;
      const rowCbs = modal.querySelectorAll(".admin-user-row-cb");
      rowCbs.forEach(cb => { cb.checked = isChecked; });
    };
  }

  // Nút Phân Quyền Màn Hình ở dưới chân trang
  const btnFooterScreens = modal.querySelector("#btnAdminFooterScreens");
  if (btnFooterScreens) {
    btnFooterScreens.onclick = () => {
      const selectedCbs = Array.from(modal.querySelectorAll(".admin-user-row-cb:checked"));
      const notice = document.getElementById("adminUserNotice");
      if (selectedCbs.length === 0) {
        if (notice) {
          notice.className = "auth-notice-box error";
          notice.textContent = "Vui lòng tick chọn ít nhất một người dùng để thực hiện phân quyền màn hình.";
        }
        alert("Vui lòng tick chọn ít nhất một người dùng để thực hiện phân quyền màn hình.");
        return;
      }

      const selectedUsers = selectedCbs.map(cb => {
        let screens = ["dashboard", "data_table"];
        try {
          screens = JSON.parse(cb.getAttribute("data-screens") || '["dashboard", "data_table"]');
        } catch (e) {}
        return {
          username: cb.value,
          fullName: cb.getAttribute("data-fullname") || cb.value,
          role: cb.getAttribute("data-role") || "user",
          screens: screens
        };
      });

      openAdminScreensModalForUsers(selectedUsers);
    };
  }

  // Nút Phân Quyền Depot ở dưới chân trang
  const btnFooterDepot = modal.querySelector("#btnAdminFooterDepot");
  if (btnFooterDepot) {
    btnFooterDepot.onclick = () => {
      const selectedCbs = Array.from(modal.querySelectorAll(".admin-user-row-cb:checked"));
      const notice = document.getElementById("adminUserNotice");
      if (selectedCbs.length === 0) {
        if (notice) {
          notice.className = "auth-notice-box error";
          notice.textContent = "Vui lòng tick chọn ít nhất một người dùng để thực hiện phân quyền Depot.";
        }
        alert("Vui lòng tick chọn ít nhất một người dùng để thực hiện phân quyền Depot.");
        return;
      }

      const selectedUsers = selectedCbs.map(cb => {
        let depots = ["ALL"];
        try {
          depots = JSON.parse(cb.getAttribute("data-depots") || '["ALL"]');
        } catch (e) {}
        return {
          username: cb.value,
          fullName: cb.getAttribute("data-fullname") || cb.value,
          depots: depots
        };
      });

      openAdminDepotModalForUsers(selectedUsers);
    };
  }

  return modal;
}

// Mở Modal Quản Lý Người Dùng & Nạp Danh Sách Tài Khoản
async function openAdminUserModal() {
  const modal = ensureAdminUserModal();
  modal.hidden = false;
  const notice = document.getElementById("adminUserNotice");
  if (notice) notice.className = "auth-notice-box";

  await loadAdminUsersList();
}

async function loadAdminUsersList() {
  const tbody = document.getElementById("adminUsersTableBody");
  const countLabel = document.getElementById("adminUsersCountLabel");
  const selectAllCb = document.getElementById("adminUserSelectAllCb");
  if (!tbody) return;

  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  }

  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--text-muted);">Đang tải dữ liệu...</td></tr>`;

  try {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Không thể tải danh sách tài khoản.");
    }

    const users = data.users || [];
    if (countLabel) countLabel.textContent = `Tổng số: ${users.length} tài khoản trong CSDL`;

    let currentUser = {};
    try {
      currentUser = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
    } catch (e) {}

    tbody.innerHTML = users.map((u, idx) => {
      const isCurrentLoggedIn = String(u.username).toLowerCase() === String(currentUser.username).toLowerCase();
      const statusBadge = u.isActive
        ? `<span class="user-status-badge active">Hoạt động</span>`
        : `<span class="user-status-badge inactive">Đã khóa</span>`;

      const roleBadge = `<span class="user-role-tag ${u.role}">${u.role === "admin" ? "Quản trị viên (admin)" : "Người dùng (user)"}</span>`;

      // Chuẩn bị dữ liệu danh sách Depot để lưu vào data attribute
      const userDepots = Array.isArray(u.assignedDepots) ? u.assignedDepots : (u.assignedDepots ? String(u.assignedDepots).split(",").map(d => d.trim()).filter(Boolean) : ["ALL"]);
      const depotsJson = JSON.stringify(userDepots).replace(/"/g, '&quot;');

      // Chuẩn bị dữ liệu danh sách Màn hình để lưu vào data attribute
      const userScreens = Array.isArray(u.allowedScreens) ? u.allowedScreens : (u.allowedScreens ? String(u.allowedScreens).split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : (u.role === "admin" ? ["ALL"] : ["dashboard", "data_table"]));
      const screensJson = JSON.stringify(userScreens).replace(/"/g, '&quot;');

      // Badge hiển thị màn hình
      let screensBadge = "";
      if (u.role === "admin" || userScreens.includes("all")) {
        screensBadge = `<span style="display: inline-block; background: #ecfdf5; color: #047857; font-weight: 700; font-size: 11.5px; padding: 2px 8px; border-radius: 9999px; border: 1px solid #a7f3d0;">Tất cả (6/6)</span>`;
      } else {
        const count = userScreens.length;
        screensBadge = `<span style="display: inline-block; background: #eff6ff; color: #1d4ed8; font-weight: 600; font-size: 11.5px; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bfdbfe;" title="${userScreens.join(', ')}">${count}/6 màn hình</span>`;
      }

      // Nút bật/tắt isActive
      let toggleBtnHtml = "";
      if (isCurrentLoggedIn) {
        toggleBtnHtml = `<button type="button" class="btn-toggle-active deactivate" disabled title="Không thể tự khóa tài khoản quản trị viên đang đăng nhập" style="opacity: 0.5; cursor: not-allowed;">Khóa</button>`;
      } else if (u.isActive) {
        toggleBtnHtml = `<button type="button" class="btn-toggle-active deactivate" onclick="handleToggleUserActive('${u.username}', false)" title="Vô hiệu hóa tài khoản này">Khóa</button>`;
      } else {
        toggleBtnHtml = `<button type="button" class="btn-toggle-active activate" onclick="handleToggleUserActive('${u.username}', true)" title="Kích hoạt lại tài khoản này">Kích hoạt</button>`;
      }

      const resetBtnHtml = `<button type="button" class="btn-table-action" onclick="handleAdminResetPassword('${u.username}', '${u.fullName}')" title="Đặt lại mật khẩu">Đặt lại mật khẩu</button>`;

      return `
        <tr>
          <td style="text-align: center;">
            <input type="checkbox" class="admin-user-row-cb" value="${u.username}" data-fullname="${u.fullName}" data-role="${u.role}" data-depots="${depotsJson}" data-screens="${screensJson}" style="cursor: pointer; width: 15px; height: 15px;">
          </td>
          <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
          <td><strong>${u.fullName}</strong></td>
          <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${u.username}</code></td>
          <td>${roleBadge}</td>
          <td style="text-align: center;">${screensBadge}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px; align-items: center;">
              ${toggleBtnHtml}
              ${resetBtnHtml}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Lắng nghe sự kiện tick từng checkbox hàng để cập nhật trạng thái checkbox chọn tất cả
    const rowCbs = tbody.querySelectorAll(".admin-user-row-cb");
    rowCbs.forEach(cb => {
      cb.onchange = () => {
        if (selectAllCb) {
          const checkedCount = Array.from(rowCbs).filter(c => c.checked).length;
          selectAllCb.checked = checkedCount === rowCbs.length && rowCbs.length > 0;
          selectAllCb.indeterminate = checkedCount > 0 && checkedCount < rowCbs.length;
        }
      };
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi: ${err.message}</td></tr>`;
  }
}

// Admin thay đổi trạng thái isActive
async function handleToggleUserActive(username, isActive) {
  const actionText = isActive ? "kích hoạt" : "vô hiệu hóa";
  if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản "${username}" không?`)) {
    return;
  }

  const notice = document.getElementById("adminUserNotice");
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

    if (notice) {
      notice.className = "auth-notice-box success";
      notice.textContent = result.message;
    }
    await loadAdminUsersList();
  } catch (err) {
    if (notice) {
      notice.className = "auth-notice-box error";
      notice.textContent = err.message;
    }
  }
}

// Admin đặt lại mật khẩu cho user
async function handleAdminResetPassword(username, fullName) {
  const newPass = prompt(`Nhập mật khẩu mới cho tài khoản "${fullName}" (${username}):\n(Tối thiểu 6 ký tự, ví dụ: 123456789@)`, "123456789@");
  if (newPass === null) return; // Người dùng nhấn Hủy

  if (!newPass || newPass.trim().length < 6) {
    alert("Mật khẩu mới phải có ít nhất 6 ký tự.");
    return;
  }

  const notice = document.getElementById("adminUserNotice");
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: newPass.trim() })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || "Lỗi khi đặt lại mật khẩu.");
    }

    if (notice) {
      notice.className = "auth-notice-box success";
      notice.textContent = result.message;
    }
    alert(`Đã đặt lại mật khẩu cho tài khoản "${username}" thành công!`);
  } catch (err) {
    if (notice) {
      notice.className = "auth-notice-box error";
      notice.textContent = err.message;
    }
    alert("Lỗi: " + err.message);
  }
}

// =========================================================================
// MODAL PHÂN QUYỀN DEPOT TRỰC THUỘC (DÀNH CHO ADMIN)
// =========================================================================

const SYSTEM_DEPOTS_LIST = ["AIC", "BSD", "CPD", "EAD", "EPD", "ETD", "GKP", "PMCM", "RCS", "SCD", "SLD", "TES", "THT"];
window.SYSTEM_DEPOTS_LIST = SYSTEM_DEPOTS_LIST;

function ensureAdminDepotModal() {
  let modal = document.getElementById("adminDepotModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "adminDepotModal";
  modal.className = "modal-backdrop";
  modal.hidden = true;

  modal.innerHTML = `
    <div class="modal-dialog" style="max-width: 520px;">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title-group">
            <div>
              <div class="modal-title" id="adminDepotModalTitle">Phân Quyền Depot Trực Thuộc</div>
              <div class="modal-subtitle" id="adminDepotModalSubtitle">Chọn các Depot mà người dùng này được phép xem dữ liệu</div>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="closeAdminDepotModalBtn" title="Đóng">&times;</button>
        </div>

        <div style="padding: 16px 24px 0 24px;">
          <div id="adminDepotNotice" class="auth-notice-box" style="margin-bottom: 12px;"></div>
          <div style="background: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569; margin-bottom: 14px;">
            <strong>Nguyên tắc phân quyền:</strong> Nếu chọn <em>Tất cả Depot (ALL)</em>, người dùng sẽ có quyền xem toàn bộ dữ liệu. Nếu chọn các Depot cụ thể, người dùng chỉ xem được các đơn hàng phát sinh tại Depot đó.
          </div>
        </div>

        <div class="modal-body" style="padding: 0 24px 16px 24px;">
          <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1d4ed8; cursor: pointer; font-size: 13.5px;">
              <input type="checkbox" id="depotCbAll" style="width: 16px; height: 16px; cursor: pointer;">
              <span>Tất cả Depot (Toàn quyền ALL)</span>
            </label>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;" id="depotCheckboxesContainer">
            ${SYSTEM_DEPOTS_LIST.map(d => `
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: #334155; cursor: pointer; background: #ffffff; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px;">
                <input type="checkbox" class="depot-item-cb" value="${d}" style="width: 15px; height: 15px; cursor: pointer;">
                <span>Depot ${d}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="modal-footer" style="padding: 12px 24px;">
          <button type="button" class="btn btn-secondary btn-sm" id="cancelAdminDepotModalBtn">Hủy</button>
          <button type="button" class="btn btn-primary btn-sm" id="saveAdminDepotModalBtn" style="font-weight: 700;">Lưu Phân Quyền</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector("#closeAdminDepotModalBtn");
  const cancelBtn = modal.querySelector("#cancelAdminDepotModalBtn");
  [closeBtn, cancelBtn].forEach(b => {
    if (b) b.onclick = () => { modal.hidden = true; };
  });

  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };

  const cbAll = modal.querySelector("#depotCbAll");
  const itemCbs = modal.querySelectorAll(".depot-item-cb");
  if (cbAll) {
    cbAll.onchange = () => {
      const isChecked = cbAll.checked;
      itemCbs.forEach(cb => { cb.checked = isChecked; });
    };
  }

  itemCbs.forEach(cb => {
    cb.onchange = () => {
      const allChecked = Array.from(itemCbs).every(c => c.checked);
      if (cbAll) cbAll.checked = allChecked;
    };
  });

  return modal;
}

let currentSelectedUsersForDepots = [];

function openAdminDepotModalForUsers(selectedUsers) {
  const modal = ensureAdminDepotModal();
  currentSelectedUsersForDepots = selectedUsers;

  const titleElem = document.getElementById("adminDepotModalTitle");
  const subElem = document.getElementById("adminDepotModalSubtitle");
  const notice = document.getElementById("adminDepotNotice");

  if (notice) {
    notice.className = "auth-notice-box";
    notice.textContent = "";
  }

  let precheckDepots = [];
  if (selectedUsers.length === 1) {
    const single = selectedUsers[0];
    if (titleElem) titleElem.textContent = `Phân Quyền Depot: ${single.fullName}`;
    if (subElem) subElem.textContent = `Tài khoản: ${single.username}`;
    precheckDepots = Array.isArray(single.depots) ? single.depots : ["ALL"];
  } else {
    if (titleElem) titleElem.textContent = `Phân Quyền Depot: ${selectedUsers.length} tài khoản đã chọn`;
    if (subElem) subElem.textContent = `Áp dụng cho: ${selectedUsers.map(u => u.fullName).join(", ")}`;
    precheckDepots = Array.isArray(selectedUsers[0].depots) ? selectedUsers[0].depots : ["ALL"];
  }

  const isAll = precheckDepots.includes("ALL");
  const cbAll = document.getElementById("depotCbAll");
  if (cbAll) cbAll.checked = isAll;

  const itemCbs = modal.querySelectorAll(".depot-item-cb");
  itemCbs.forEach(cb => {
    cb.checked = isAll || precheckDepots.includes(cb.value);
  });

  const saveBtn = document.getElementById("saveAdminDepotModalBtn");
  if (saveBtn) {
    saveBtn.onclick = () => handleSaveUsersDepots(selectedUsers);
  }

  modal.hidden = false;
}

// Hàm tương thích khi gọi từ nơi khác
function openAdminDepotModal(username, fullName, currentDepots) {
  const depotsArr = Array.isArray(currentDepots) ? currentDepots : String(currentDepots || "ALL").split(",").map(d => d.trim().toUpperCase());
  openAdminDepotModalForUsers([{
    username,
    fullName,
    depots: depotsArr
  }]);
}

async function handleSaveUsersDepots(selectedUsers) {
  const modal = document.getElementById("adminDepotModal");
  const notice = document.getElementById("adminDepotNotice");
  const saveBtn = document.getElementById("saveAdminDepotModalBtn");
  const cbAll = document.getElementById("depotCbAll");
  const itemCbs = modal.querySelectorAll(".depot-item-cb");

  let selected = [];
  if (cbAll && cbAll.checked) {
    selected = ["ALL"];
  } else {
    selected = Array.from(itemCbs).filter(c => c.checked).map(c => c.value);
    if (selected.length === 0) {
      if (notice) {
        notice.className = "auth-notice-box error";
        notice.textContent = "Vui lòng chọn ít nhất 1 Depot hoặc chọn Tất cả Depot (ALL).";
      }
      return;
    }
  }

  const originalText = saveBtn ? saveBtn.textContent : "Lưu";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";
  }

  try {
    for (const u of selectedUsers) {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.username)}/depots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depots: selected })
      });
      let result = null;
      try {
        result = await res.json();
      } catch (e) {
        throw new Error(`Máy chủ không thể xử lý yêu cầu (HTTP ${res.status}). Vui lòng khởi động lại Backend Node.js để nạp các API phân quyền mới.`);
      }
      if (!res.ok || !result || !result.success) {
        throw new Error((result && result.message) || `Lỗi khi lưu phân quyền cho tài khoản ${u.username}.`);
      }
    }

    // Nếu người dùng đang chỉnh sửa có tài khoản đang đăng nhập, cập nhật localStorage
    try {
      const cur = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
      if (cur && selectedUsers.some(u => String(u.username).toLowerCase() === String(cur.username).toLowerCase())) {
        cur.assignedDepots = selected;
        localStorage.setItem("gpg_auth_user", JSON.stringify(cur));
      }
    } catch (e) {}

    const adminNotice = document.getElementById("adminUserNotice");
    if (adminNotice) {
      adminNotice.className = "auth-notice-box success";
      const userListStr = selectedUsers.map(u => u.username).join(", ");
      adminNotice.textContent = `Đã cập nhật phân quyền Depot thành công cho ${selectedUsers.length} tài khoản (${userListStr}).`;
    }

    modal.hidden = true;
    await loadAdminUsersList();
  } catch (err) {
    if (notice) {
      notice.className = "auth-notice-box error";
      notice.textContent = err.message;
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
}

// =========================================================================
// MODAL PHÂN QUYỀN MÀN HÌNH (DÀNH CHO ADMIN)
// =========================================================================

function ensureAdminScreensModal() {
  let modal = document.getElementById("adminScreensModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "adminScreensModal";
  modal.className = "modal-backdrop";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-dialog auth-modal-dialog-md" style="max-width: 680px;">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title-group">
            <div>
              <div class="modal-title" id="adminScreensModalTitle">Phân Quyền Màn Hình Hệ Thống</div>
              <div class="modal-subtitle" id="adminScreensModalSubtitle">Chọn các màn hình/chức năng mà người dùng này được phép truy cập</div>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="closeAdminScreensModalBtn" title="Đóng">&times;</button>
        </div>

        <div style="padding: 16px 24px 0 24px;">
          <div id="adminScreensNotice" class="auth-notice-box" style="margin-bottom: 12px;"></div>
          <div style="background: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569; margin-bottom: 14px;">
            <strong>Nguyên tắc phân quyền:</strong> Nếu chọn <em>Tất cả Màn hình (ALL)</em>, người dùng có quyền truy cập toàn bộ 6 màn hình. Nếu chỉ cấp các màn hình cụ thể, thanh điều hướng sidebar sẽ chỉ hiển thị các màn hình đó và hệ thống sẽ chặn truy cập nếu người dùng nhập URL trực tiếp.
          </div>
        </div>

        <div class="modal-body" style="padding: 0 24px 16px 24px;">
          <div style="margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #059669; cursor: pointer; font-size: 13.5px;">
              <input type="checkbox" id="screensCbAll" style="width: 16px; height: 16px; cursor: pointer;">
              <span>Tất cả Màn hình (Toàn quyền 6/6 màn hình)</span>
            </label>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;" id="screensCheckboxesContainer">
            ${SYSTEM_SCREENS_CONFIG.map(s => `
              <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: #334155; cursor: pointer; background: #ffffff; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; transition: border-color 0.15s, background-color 0.15s;">
                <input type="checkbox" class="screen-item-cb" value="${s.id}" style="width: 16px; height: 16px; margin-top: 2px; cursor: pointer;">
                <div style="display: flex; flex-direction: column;">
                  <div style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #0f172a;">
                    <span style="display: inline-flex; color: #2563eb;">${s.icon}</span>
                    <span>${s.name}</span>
                  </div>
                  <span style="font-size: 11.5px; color: #64748b; margin-top: 3px; line-height: 1.35;">${s.desc}</span>
                </div>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="modal-footer" style="padding: 12px 24px; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary btn-sm" id="cancelAdminScreensModalBtn">Hủy</button>
          <button type="button" class="btn btn-primary btn-sm" id="saveAdminScreensModalBtn" style="font-weight: 700; background: #059669; border-color: #059669;">Lưu Quyền Màn Hình</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector("#closeAdminScreensModalBtn");
  const cancelBtn = modal.querySelector("#cancelAdminScreensModalBtn");
  [closeBtn, cancelBtn].forEach(b => {
    if (b) b.onclick = () => { modal.hidden = true; };
  });

  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };

  const cbAll = modal.querySelector("#screensCbAll");
  const itemCbs = modal.querySelectorAll(".screen-item-cb");
  if (cbAll) {
    cbAll.onchange = () => {
      const isChecked = cbAll.checked;
      itemCbs.forEach(cb => { cb.checked = isChecked; });
    };
  }

  itemCbs.forEach(cb => {
    cb.onchange = () => {
      const allChecked = Array.from(itemCbs).every(c => c.checked);
      if (cbAll) cbAll.checked = allChecked;
    };
  });

  return modal;
}

let currentSelectedUsersForScreens = [];

function openAdminScreensModalForUsers(selectedUsers) {
  const modal = ensureAdminScreensModal();
  currentSelectedUsersForScreens = selectedUsers;

  const titleElem = document.getElementById("adminScreensModalTitle");
  const subElem = document.getElementById("adminScreensModalSubtitle");
  const notice = document.getElementById("adminScreensNotice");

  if (notice) {
    notice.className = "auth-notice-box";
    notice.textContent = "";
  }

  let precheckScreens = [];
  if (selectedUsers.length === 1) {
    const single = selectedUsers[0];
    if (titleElem) titleElem.textContent = `Phân Quyền Màn Hình: ${single.fullName}`;
    if (subElem) subElem.textContent = `Tài khoản: ${single.username} (${single.role === 'admin' ? 'Quản trị viên' : 'Người dùng'})`;
    precheckScreens = Array.isArray(single.screens) ? single.screens : ["dashboard", "data_table"];
  } else {
    if (titleElem) titleElem.textContent = `Phân Quyền Màn Hình: ${selectedUsers.length} tài khoản đã chọn`;
    if (subElem) subElem.textContent = `Áp dụng cho: ${selectedUsers.map(u => u.fullName).join(", ")}`;
    precheckScreens = Array.isArray(selectedUsers[0].screens) ? selectedUsers[0].screens : ["dashboard", "data_table"];
  }

  const isAll = precheckScreens.includes("ALL") || precheckScreens.includes("all");
  const cbAll = document.getElementById("screensCbAll");
  if (cbAll) cbAll.checked = isAll;

  const itemCbs = modal.querySelectorAll(".screen-item-cb");
  itemCbs.forEach(cb => {
    cb.checked = isAll || precheckScreens.includes(cb.value);
  });

  const saveBtn = document.getElementById("saveAdminScreensModalBtn");
  if (saveBtn) {
    saveBtn.onclick = () => handleSaveUsersScreens(selectedUsers);
  }

  modal.hidden = false;
}

function openAdminScreensModal(username, fullName, currentScreens) {
  const screensArr = Array.isArray(currentScreens) ? currentScreens : String(currentScreens || "dashboard,data_table").split(",").map(s => s.trim().toLowerCase());
  openAdminScreensModalForUsers([{
    username,
    fullName,
    role: "user",
    screens: screensArr
  }]);
}

async function handleSaveUsersScreens(selectedUsers) {
  const modal = document.getElementById("adminScreensModal");
  const notice = document.getElementById("adminScreensNotice");
  const saveBtn = document.getElementById("saveAdminScreensModalBtn");
  const cbAll = document.getElementById("screensCbAll");
  const itemCbs = modal.querySelectorAll(".screen-item-cb");

  let selected = [];
  if (cbAll && cbAll.checked) {
    selected = ["ALL"];
  } else {
    selected = Array.from(itemCbs).filter(c => c.checked).map(c => c.value);
    if (selected.length === 0) {
      if (notice) {
        notice.className = "auth-notice-box error";
        notice.textContent = "Vui lòng chọn ít nhất 1 màn hình hoặc chọn Tất cả Màn hình (ALL).";
      }
      return;
    }
  }

  const originalText = saveBtn ? saveBtn.textContent : "Lưu Quyền Màn Hình";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";
  }

  try {
    for (const u of selectedUsers) {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.username)}/screens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screens: selected })
      });
      let result = null;
      try {
        result = await res.json();
      } catch (e) {
        throw new Error(`Máy chủ không thể xử lý yêu cầu (HTTP ${res.status}). Vui lòng kiểm tra Backend Node.js.`);
      }
      if (!res.ok || !result || !result.success) {
        throw new Error((result && result.message) || `Lỗi khi lưu phân quyền màn hình cho tài khoản ${u.username}.`);
      }
    }

    // Nếu người dùng đang chỉnh sửa có tài khoản đang đăng nhập, cập nhật localStorage và áp dụng ngay
    try {
      const cur = JSON.parse(localStorage.getItem("gpg_auth_user") || "{}");
      if (cur && selectedUsers.some(u => String(u.username).toLowerCase() === String(cur.username).toLowerCase())) {
        cur.allowedScreens = selected;
        localStorage.setItem("gpg_auth_user", JSON.stringify(cur));
        applyRolePermissions(cur);
      }
    } catch (e) {}

    const adminNotice = document.getElementById("adminUserNotice");
    if (adminNotice) {
      adminNotice.className = "auth-notice-box success";
      const userListStr = selectedUsers.map(u => u.username).join(", ");
      adminNotice.textContent = `Đã cập nhật phân quyền màn hình thành công cho ${selectedUsers.length} tài khoản (${userListStr}).`;
    }

    modal.hidden = true;
    await loadAdminUsersList();
  } catch (err) {
    if (notice) {
      notice.className = "auth-notice-box error";
      notice.textContent = err.message;
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
}

window.openAdminUserModal = openAdminUserModal;
window.handleToggleUserActive = handleToggleUserActive;
window.handleAdminResetPassword = handleAdminResetPassword;
window.openAdminDepotModal = openAdminDepotModal;
window.openAdminDepotModalForUsers = openAdminDepotModalForUsers;
window.openAdminScreensModal = openAdminScreensModal;
window.openAdminScreensModalForUsers = openAdminScreensModalForUsers;

// =========================================================================
// MODAL ĐỔI MẬT KHẨU (DÀNH CHO NGƯỜI DÙNG HIỆN TẠI)
// =========================================================================

function ensureChangePasswordModal() {
  let modal = document.getElementById("changePasswordModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "changePasswordModal";
  modal.className = "modal-backdrop";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-dialog auth-modal-dialog-sm">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title-group">
            <div>
              <div class="modal-title">Đổi Mật Khẩu</div>
              <div class="modal-subtitle">Cập nhật mật khẩu bảo mật cho tài khoản của bạn</div>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="closeChangePassModalBtn" title="Đóng">&times;</button>
        </div>

        <form id="changePasswordForm">
          <div class="modal-body" style="padding: 20px 24px;">
            <div id="changePassNotice" class="auth-notice-box"></div>

            <div class="auth-form-group">
              <label for="currentPasswordInput">Mật khẩu hiện tại</label>
              <input type="password" id="currentPasswordInput" class="auth-form-input" placeholder="Nhập mật khẩu đang dùng" required>
            </div>

            <div class="auth-form-group">
              <label for="newPasswordInput">Mật khẩu mới</label>
              <input type="password" id="newPasswordInput" class="auth-form-input" placeholder="Mật khẩu mới (ít nhất 6 ký tự)" required minlength="6">
            </div>

            <div class="auth-form-group">
              <label for="confirmNewPasswordInput">Xác nhận mật khẩu mới</label>
              <input type="password" id="confirmNewPasswordInput" class="auth-form-input" placeholder="Nhập lại mật khẩu mới" required minlength="6">
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" id="cancelChangePassBtn">Hủy</button>
            <button type="submit" class="btn btn-primary btn-sm" id="submitChangePassBtn">Lưu Mật Khẩu</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtns = [
    modal.querySelector("#closeChangePassModalBtn"),
    modal.querySelector("#cancelChangePassBtn")
  ];
  closeBtns.forEach(b => {
    if (b) b.onclick = () => { modal.hidden = true; };
  });

  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };

  const form = modal.querySelector("#changePasswordForm");
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById("currentPasswordInput").value;
      const newPassword = document.getElementById("newPasswordInput").value;
      const confirmPassword = document.getElementById("confirmNewPasswordInput").value;
      const notice = document.getElementById("changePassNotice");

      if (newPassword !== confirmPassword) {
        notice.className = "auth-notice-box error";
        notice.textContent = "Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.";
        return;
      }

      if (newPassword.length < 6) {
        notice.className = "auth-notice-box error";
        notice.textContent = "Mật khẩu mới phải có ít nhất 6 ký tự.";
        return;
      }

      try {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Không thể đổi mật khẩu.");
        }

        notice.className = "auth-notice-box success";
        notice.textContent = data.message || "Đã đổi mật khẩu thành công!";
        form.reset();

        setTimeout(() => {
          modal.hidden = true;
          notice.className = "auth-notice-box";
        }, 1500);
      } catch (err) {
        notice.className = "auth-notice-box error";
        notice.textContent = err.message;
      }
    };
  }

  return modal;
}

function openChangePasswordModal() {
  const modal = ensureChangePasswordModal();
  const notice = document.getElementById("changePassNotice");
  if (notice) notice.className = "auth-notice-box";
  const form = document.getElementById("changePasswordForm");
  if (form) form.reset();
  modal.hidden = false;
}

window.openChangePasswordModal = openChangePasswordModal;

// Quản trị ẩn / hiện thanh tab bên trái (Left Sidebar Toggle)
function initSidebarToggle() {
  const isCollapsed = localStorage.getItem("gpg_sidebar_collapsed") === "true";
  if (isCollapsed) {
    document.documentElement.classList.add("sidebar-collapsed");
    document.body.classList.add("sidebar-collapsed");
  }

  // 1. Kiểm tra hoặc gắn nút thu gọn trên sidebar-brand
  const sidebarBrand = document.querySelector(".sidebar-brand");
  if (sidebarBrand && !document.getElementById("btnCollapseSidebar")) {
    const brandChild = sidebarBrand.firstElementChild;
    if (brandChild && !brandChild.classList.contains("sidebar-brand-text")) {
      brandChild.classList.add("sidebar-brand-text");
    }
    const btnCollapse = document.createElement("button");
    btnCollapse.type = "button";
    btnCollapse.className = "sidebar-collapse-btn";
    btnCollapse.id = "btnCollapseSidebar";
    btnCollapse.title = "Ẩn thanh tab";
    btnCollapse.setAttribute("aria-label", "Ẩn thanh tab");
    btnCollapse.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    `;
    sidebarBrand.appendChild(btnCollapse);
  }

  // 2. Kiểm tra hoặc gắn nút toggle ở app-header
  const appHeader = document.querySelector(".app-header");
  if (appHeader && !document.getElementById("headerSidebarToggleBtn")) {
    const btnHeaderToggle = document.createElement("button");
    btnHeaderToggle.type = "button";
    btnHeaderToggle.className = "sidebar-header-toggle-btn";
    btnHeaderToggle.id = "headerSidebarToggleBtn";
    btnHeaderToggle.title = "Hiện thanh tab";
    btnHeaderToggle.setAttribute("aria-label", "Hiện thanh tab");
    btnHeaderToggle.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    `;
    appHeader.insertBefore(btnHeaderToggle, appHeader.firstChild);
  }

  // 3. Tự động gỡ bỏ nút nổi ở mép trái nếu có (chỉ giữ lại ô 3 gạch ở header theo yêu cầu)
  const existingFloatBtn = document.getElementById("floatSidebarToggleBtn");
  if (existingFloatBtn) {
    existingFloatBtn.remove();
  }

  // 4. Hàm chuyển đổi trạng thái
  function setSidebarState(collapsed) {
    if (collapsed) {
      document.documentElement.classList.add("sidebar-collapsed");
      document.body.classList.add("sidebar-collapsed");
      localStorage.setItem("gpg_sidebar_collapsed", "true");
    } else {
      document.documentElement.classList.remove("sidebar-collapsed");
      document.body.classList.remove("sidebar-collapsed");
      localStorage.setItem("gpg_sidebar_collapsed", "false");
    }
    // Kích hoạt event resize để các bảng biểu Chart.js tự động co dãn layout
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 260);
  }

  // 5. Gắn sự kiện click
  document.addEventListener("click", (e) => {
    const btnCollapse = e.target.closest("#btnCollapseSidebar");
    if (btnCollapse) {
      e.preventDefault();
      setSidebarState(true);
      return;
    }
    const btnExpand = e.target.closest("#headerSidebarToggleBtn, #floatSidebarToggleBtn");
    if (btnExpand) {
      e.preventDefault();
      setSidebarState(false);
      return;
    }
  });
}


// Quản lý thu gọn / mở rộng các nhóm tab con (Dropdown / Accordion) ở thanh điều hướng bên trái
function initSidebarDropdowns() {
  const headings = document.querySelectorAll(".sidebar-heading");
  if (!headings || headings.length === 0) return;

  let collapsedGroups = [];
  try {
    const saved = localStorage.getItem("gpg_collapsed_nav_groups");
    if (saved) collapsedGroups = JSON.parse(saved);
    if (!Array.isArray(collapsedGroups)) collapsedGroups = [];
  } catch (e) {
    collapsedGroups = [];
  }

  headings.forEach((heading, idx) => {
    // 1. Chuẩn hóa mũi tên hiển thị
    let arrow = heading.querySelector(".sidebar-heading-arrow");
    if (!arrow) {
      const spans = heading.querySelectorAll("span");
      if (spans.length > 1) {
        arrow = spans[spans.length - 1];
        arrow.classList.add("sidebar-heading-arrow");
      } else {
        arrow = document.createElement("span");
        arrow.className = "sidebar-heading-arrow";
        arrow.textContent = "▼";
        heading.appendChild(arrow);
      }
    }

    // 2. Định danh group duy nhất
    const groupKey = heading.getAttribute("data-group") ||
      heading.id ||
      (heading.firstElementChild ? heading.firstElementChild.textContent.trim().toLowerCase().replace(/\s+/g, "_") : `group_${idx}`);
    heading.setAttribute("data-group", groupKey);

    // 3. Tìm hoặc gom tự động các link con vào .sidebar-group-items
    let itemsContainer = heading.nextElementSibling;
    let items = [];

    if (itemsContainer && itemsContainer.classList.contains("sidebar-group-items")) {
      items = Array.from(itemsContainer.querySelectorAll(".sidebar-link"));
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "sidebar-group-items";
      let next = heading.nextElementSibling;
      while (next && !next.classList.contains("sidebar-heading")) {
        const current = next;
        next = next.nextElementSibling;
        if (current.classList.contains("sidebar-link")) {
          wrapper.appendChild(current);
          items.push(current);
        }
      }
      heading.parentNode.insertBefore(wrapper, next);
      itemsContainer = wrapper;
    }

    // 4. Nếu nhóm có chứa link trang hiện tại (.active) -> luôn mở để người dùng biết mình đang ở đâu
    const hasActiveChild = items.some(it => it.classList.contains("active"));
    const isInitiallyCollapsed = !hasActiveChild && collapsedGroups.includes(groupKey);

    function applyCollapseState(isCollapsed) {
      if (isCollapsed) {
        heading.classList.add("collapsed");
        heading.setAttribute("aria-expanded", "false");
        if (itemsContainer) itemsContainer.classList.add("collapsed");
      } else {
        heading.classList.remove("collapsed");
        heading.setAttribute("aria-expanded", "true");
        if (itemsContainer) itemsContainer.classList.remove("collapsed");
      }
    }

    applyCollapseState(isInitiallyCollapsed);

    // 5. Gắn sự kiện click toggle
    heading.style.cursor = "pointer";
    heading.setAttribute("role", "button");
    heading.setAttribute("tabindex", "0");
    heading.setAttribute("title", "Nhấn để thu gọn hoặc mở rộng danh mục con");

    heading.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willCollapse = !heading.classList.contains("collapsed");
      applyCollapseState(willCollapse);

      try {
        let currentCollapsed = [];
        const saved = localStorage.getItem("gpg_collapsed_nav_groups");
        if (saved) currentCollapsed = JSON.parse(saved);
        if (!Array.isArray(currentCollapsed)) currentCollapsed = [];

        if (willCollapse) {
          if (!currentCollapsed.includes(groupKey)) currentCollapsed.push(groupKey);
        } else {
          currentCollapsed = currentCollapsed.filter(k => k !== groupKey);
        }
        localStorage.setItem("gpg_collapsed_nav_groups", JSON.stringify(currentCollapsed));
      } catch (err) {}
    };

    heading.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        heading.click();
      }
    };
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSidebarDropdowns();
  initSidebarToggle();
  initAuthProfile();

  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.onclick = (e) => {
      e.preventDefault();
      logout();
    };
  }

  const sidebarBtnLogout = document.getElementById("sidebarBtnLogout");
  if (sidebarBtnLogout) {
    sidebarBtnLogout.onclick = (e) => {
      e.preventDefault();
      logout();
    };
  }
});
