/**
 * Component TimePicker 24H - Logistics Cancellation Analytics
 * Thống nhất 100% chọn Giờ (00 - 23) và Phút (00 - 59), không phân chia AM / PM
 */
(function() {
  let activePopup = null;
  let activeInput = null;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function getVietnamNow() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (7 * 3600000));
    return {
      hour: pad(vnTime.getHours()),
      minute: pad(vnTime.getMinutes())
    };
  }

  function parseTime(val) {
    if (!val) return null;
    const m = String(val).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return { hour: pad(h), minute: pad(min) };
    }
    return null;
  }

  function closePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
      activeInput = null;
    }
  }

  function openPopup(input) {
    if (activeInput === input && activePopup) {
      closePopup();
      return;
    }
    closePopup();

    activeInput = input;
    const isToTime = input.id.toLowerCase().includes("to");
    const currentParsed = parseTime(input.value);

    // Mặc định ban đầu nếu chưa có giá trị
    let selectedHour = currentParsed ? currentParsed.hour : (isToTime ? "23" : "00");
    let selectedMinute = currentParsed ? currentParsed.minute : (isToTime ? "59" : "00");

    const popup = document.createElement("div");
    popup.className = "timepicker-24h-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Chọn giờ và phút hệ 24h");

    // Header hiển thị thời gian căn giữa
    const header = document.createElement("div");
    header.className = "tp-header";
    header.innerHTML = `
      <div class="tp-display" style="justify-content: center; width: 100%;">
        <span class="tp-display-val tp-disp-hour" id="tpHourDisp">${selectedHour}</span>
        <span class="tp-display-sep">:</span>
        <span class="tp-display-val tp-disp-min" id="tpMinDisp">${selectedMinute}</span>
      </div>
    `;
    popup.appendChild(header);

    // Body: 2 cột (Giờ & Phút)
    const body = document.createElement("div");
    body.className = "tp-body";

    // Cột 1: Giờ
    const colHour = document.createElement("div");
    colHour.className = "tp-col tp-col-hour";
    colHour.innerHTML = `<div class="tp-col-title">Giờ (0 - 23h)</div><div class="tp-col-list" id="tpHourList"></div>`;

    // Cột 2: Phút
    const colMin = document.createElement("div");
    colMin.className = "tp-col tp-col-min";
    colMin.innerHTML = `<div class="tp-col-title">Phút (0 - 59p)</div><div class="tp-col-list" id="tpMinList"></div>`;

    body.appendChild(colHour);
    body.appendChild(colMin);
    popup.appendChild(body);

    // Footer actions
    const footer = document.createElement("div");
    footer.className = "tp-footer";
    footer.innerHTML = `
      <button type="button" class="tp-btn tp-btn-clear" title="Xóa chọn giờ">Xóa</button>
      <div class="tp-footer-right">
        <button type="button" class="tp-btn tp-btn-now" title="Đặt giờ hiện tại">Hiện tại</button>
        <button type="button" class="tp-btn tp-btn-apply" title="Áp dụng thời gian">Xong</button>
      </div>
    `;
    popup.appendChild(footer);

    document.body.appendChild(popup);
    activePopup = popup;

    // Định vị popup bên dưới input
    positionPopup(input, popup);

    const hourListEl = popup.querySelector("#tpHourList");
    const minListEl = popup.querySelector("#tpMinList");
    const hourDispEl = popup.querySelector("#tpHourDisp");
    const minDispEl = popup.querySelector("#tpMinDisp");

    function updatePreview() {
      if (hourDispEl) hourDispEl.textContent = selectedHour;
      if (minDispEl) minDispEl.textContent = selectedMinute;

      popup.querySelectorAll(".tp-item-hour").forEach(el => {
        el.classList.toggle("selected", el.getAttribute("data-val") === selectedHour);
      });
      popup.querySelectorAll(".tp-item-min").forEach(el => {
        el.classList.toggle("selected", el.getAttribute("data-val") === selectedMinute);
      });
    }

    function applyValueAndTrigger(val) {
      input.value = val;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Nạp 24 giờ (00..23)
    for (let h = 0; h < 24; h++) {
      const hStr = pad(h);
      const item = document.createElement("div");
      item.className = "tp-item tp-item-hour" + (hStr === selectedHour ? " selected" : "");
      item.setAttribute("data-val", hStr);
      item.textContent = `${hStr}h`;
      item.onclick = (e) => {
        e.stopPropagation();
        selectedHour = hStr;
        updatePreview();
        applyValueAndTrigger(`${selectedHour}:${selectedMinute}`);
      };
      hourListEl.appendChild(item);
    }

    // Nạp 60 phút (00..59)
    for (let m = 0; m < 60; m++) {
      const mStr = pad(m);
      const item = document.createElement("div");
      item.className = "tp-item tp-item-min" + (mStr === selectedMinute ? " selected" : "");
      item.setAttribute("data-val", mStr);
      item.textContent = `${mStr}p`;
      item.onclick = (e) => {
        e.stopPropagation();
        selectedMinute = mStr;
        updatePreview();
        applyValueAndTrigger(`${selectedHour}:${selectedMinute}`);
      };
      minListEl.appendChild(item);
    }

    // Cuộn danh sách tới vị trí ban đầu
    setTimeout(() => {
      const selH = hourListEl.querySelector(`[data-val="${selectedHour}"]`);
      if (selH) selH.scrollIntoView({ block: "center" });
      const selM = minListEl.querySelector(`[data-val="${selectedMinute}"]`);
      if (selM) selM.scrollIntoView({ block: "center" });
    }, 10);

    // Nút Xóa
    footer.querySelector(".tp-btn-clear").onclick = (e) => {
      e.stopPropagation();
      applyValueAndTrigger("");
      closePopup();
    };

    // Nút Hiện tại
    footer.querySelector(".tp-btn-now").onclick = (e) => {
      e.stopPropagation();
      const vnNow = getVietnamNow();
      selectedHour = vnNow.hour;
      selectedMinute = vnNow.minute;
      updatePreview();
      applyValueAndTrigger(`${selectedHour}:${selectedMinute}`);
      closePopup();
    };

    // Nút Xong
    footer.querySelector(".tp-btn-apply").onclick = (e) => {
      e.stopPropagation();
      applyValueAndTrigger(`${selectedHour}:${selectedMinute}`);
      closePopup();
    };
  }

  function positionPopup(input, popup) {
    const rect = input.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    let top = rect.bottom + scrollTop + 6;
    let left = rect.left + scrollLeft;

    const popupHeight = 285;
    const popupWidth = 230;

    // Nếu tràn màn hình dưới thì đẩy lên trên
    if (rect.bottom + popupHeight > window.innerHeight && rect.top - popupHeight > 0) {
      top = rect.top + scrollTop - popupHeight - 6;
    }

    // Nếu tràn màn hình phải thì căn lề phải
    if (left + popupWidth > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - popupWidth - 16);
    }

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  }

  // Đóng khi click ra ngoài
  document.addEventListener("mousedown", (e) => {
    if (!activePopup) return;
    if (activePopup.contains(e.target)) return;
    if (activeInput && (activeInput === e.target || (activeInput.parentElement && activeInput.parentElement.contains(e.target)))) return;
    closePopup();
  });

  window.addEventListener("resize", () => {
    if (activePopup && activeInput) positionPopup(activeInput, activePopup);
  });
  window.addEventListener("scroll", () => {
    if (activePopup && activeInput) positionPopup(activeInput, activePopup);
  }, true);

  // Khởi tạo gắn sự kiện cho các input timepicker
  function initTimepickers() {
    document.querySelectorAll(".timepicker-24h, #filterHourFrom, #filterHourTo").forEach(inp => {
      if (inp.dataset.tpInitialized) return;
      inp.dataset.tpInitialized = "1";
      inp.setAttribute("readonly", "readonly");
      inp.style.cursor = "pointer";

      inp.addEventListener("click", (e) => {
        e.stopPropagation();
        openPopup(inp);
      });

      const wrapper = inp.closest(".timepicker-wrapper");
      if (wrapper) {
        const icon = wrapper.querySelector(".timepicker-icon");
        if (icon) {
          icon.style.cursor = "pointer";
          icon.onclick = (e) => {
            e.stopPropagation();
            openPopup(inp);
          };
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTimepickers);
  } else {
    initTimepickers();
  }

  window.initTimepickers24h = initTimepickers;
})();
