// auth.js - Quản lý phiên đăng nhập, phân quyền & bảo vệ toàn diện hệ thống Logistics Cancellation Analytics

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
        localStorage.setItem("gpg_auth_user", JSON.stringify(data.user));
        renderUserProfile(data.user);
      }
    }
  } catch (err) {
    console.warn("Không thể đồng bộ hồ sơ user:", err.message);
  }
}

// Cập nhật thông tin lên thanh header dạng 1 nút User Chip và Dropdown Menu (Khớp hình mẫu)
function renderUserProfile(user) {
  if (!user) return;
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
        openAdminUserModal();
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
                  <th style="width: 50px; text-align: center;">STT</th>
                  <th>Họ và Tên</th>
                  <th>Tài Khoản</th>
                  <th>Quyền Hạn</th>
                  <th style="text-align: center;">Trạng Thái (isActive)</th>
                  <th style="text-align: right; width: 230px;">Hành Động</th>
                </tr>
              </thead>
              <tbody id="adminUsersTableBody">
                <tr><td colspan="6" style="text-align: center; padding: 20px;">Đang tải danh sách tài khoản...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer">
          <div class="modal-footer-count" id="adminUsersCountLabel">Tổng số: 0 tài khoản</div>
          <button type="button" class="btn btn-secondary btn-sm" id="closeAdminUserModalFooterBtn">Đóng</button>
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
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Đang tải dữ liệu...</td></tr>`;

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
          <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
          <td><strong>${u.fullName}</strong></td>
          <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${u.username}</code></td>
          <td>${roleBadge}</td>
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
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi: ${err.message}</td></tr>`;
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

window.openAdminUserModal = openAdminUserModal;
window.handleToggleUserActive = handleToggleUserActive;
window.handleAdminResetPassword = handleAdminResetPassword;

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

document.addEventListener("DOMContentLoaded", () => {
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
