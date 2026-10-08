// login.js - Xử lý đăng nhập hệ thống Logistics Cancellation Analytics

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const btnTogglePass = document.getElementById("btnTogglePassword");
  const btnSubmit = document.getElementById("btnSubmit");
  const alertBox = document.getElementById("loginAlert");
  const demoChips = document.querySelectorAll(".demo-chip");

  // Kiểm tra thông báo từ URL query
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("session_expired") === "1") {
    showAlert("Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.", "danger");
  }

  function showAlert(msg, type = "danger") {
    alertBox.textContent = msg;
    alertBox.className = `login-alert ${type}`;
    alertBox.style.display = "block";
  }

  function hideAlert() {
    alertBox.style.display = "none";
    alertBox.textContent = "";
  }

  // Ẩn/Hiện mật khẩu
  if (btnTogglePass) {
    btnTogglePass.onclick = () => {
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        btnTogglePass.textContent = "Ẩn";
      } else {
        passwordInput.type = "password";
        btnTogglePass.textContent = "Hiện";
      }
    };
  }

  // Tài khoản demo 1-click
  demoChips.forEach(chip => {
    chip.onclick = () => {
      const u = chip.getAttribute("data-user");
      const p = chip.getAttribute("data-pass");
      if (u && p) {
        usernameInput.value = u;
        passwordInput.value = p;
        hideAlert();
        handleLogin(u, p);
      }
    };
  });

  // Xử lý gửi Form đăng nhập
  form.onsubmit = (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      showAlert("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }
    handleLogin(username, password);
  };

  async function handleLogin(username, password) {
    hideAlert();
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Đang xác thực...";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const contentType = res.headers.get("content-type") || "";
      let data = null;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(
          res.status === 404
            ? "Máy chủ backend chưa được khởi động hoặc đường dẫn API không tồn tại (404)."
            : `Máy chủ trả về phản hồi không hợp lệ (${res.status}). Vui lòng kiểm tra dịch vụ backend.`
        );
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Tên đăng nhập hoặc mật khẩu không chính xác.");
      }

      // Lưu trữ token và thông tin người dùng
      localStorage.setItem("gpg_auth_token", data.token);
      localStorage.setItem("gpg_auth_user", JSON.stringify(data.user));

      showAlert(`Đăng nhập thành công. Đang chuyển hướng...`, "success");

      // Chuyển hướng tới trang yêu cầu trước đó hoặc index.html
      const redirectUrl = urlParams.get("redirect") ? decodeURIComponent(urlParams.get("redirect")) : "index.html";
      setTimeout(() => {
        window.location.replace(redirectUrl);
      }, 350);

    } catch (err) {
      showAlert(err.message || "Đăng nhập thất bại. Vui lòng thử lại.");
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Đăng nhập";
    }
  }
});
