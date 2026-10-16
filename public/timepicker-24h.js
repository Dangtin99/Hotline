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
    injectStyles();
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

  function injectStyles() {
    if (document.getElementById("tp24h-injected-styles")) return;
    const style = document.createElement("style");
    style.id = "tp24h-injected-styles";
    style.textContent = `
      .timepicker-wrapper {
        position: relative !important;
        display: inline-flex !important;
        align-items: center !important;
        flex: 0 0 108px !important;
        width: 108px !important;
        min-width: 108px !important;
      }
      .timepicker-wrapper .filter-time-input {
        width: 100% !important;
        padding: 0 24px 0 8px !important;
        font-size: 12.5px !important;
        font-weight: 700 !important;
        color: #1e293b !important;
        cursor: pointer !important;
        background-color: #f8fafc !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 6px !important;
        height: 35px !important;
        text-align: center !important;
        letter-spacing: 0.5px !important;
      }
      .timepicker-wrapper .timepicker-icon {
        position: absolute !important;
        right: 7px !important;
        font-size: 13px !important;
        color: #64748b !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        user-select: none !important;
      }
      .timepicker-24h-popup {
        position: absolute !important;
        z-index: 99999 !important;
        width: 236px !important;
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 10px !important;
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.2), 0 4px 12px rgba(15, 23, 42, 0.08) !important;
        font-family: inherit !important;
        user-select: none !important;
        animation: tpFadeIn 0.15s ease-out !important;
        overflow: hidden !important;
      }
      @keyframes tpFadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .tp-header {
        background: #f8fafc !important;
        padding: 8px 12px !important;
        border-bottom: 1px solid #e2e8f0 !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
      }
      .tp-display {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 18px !important;
        font-weight: 800 !important;
        color: #0f172a !important;
      }
      .tp-display-val {
        background: #ffffff !important;
        padding: 2px 7px !important;
        border-radius: 5px !important;
        border: 1px solid #cbd5e1 !important;
        min-width: 28px !important;
        text-align: center !important;
      }
      .tp-display-sep {
        margin: 0 4px !important;
        font-weight: 800 !important;
        color: #64748b !important;
      }
      .tp-body {
        display: flex !important;
        height: 180px !important;
        background: #ffffff !important;
      }
      .tp-col {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }
      .tp-col-hour {
        border-right: 1px solid #f1f5f9 !important;
      }
      .tp-col-title {
        padding: 6px 8px !important;
        font-size: 10.5px !important;
        font-weight: 700 !important;
        color: #64748b !important;
        text-align: center !important;
        background: #f8fafc !important;
        border-bottom: 1px solid #e2e8f0 !important;
      }
      .tp-col-list {
        flex: 1 !important;
        overflow-y: auto !important;
        padding: 4px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 2px !important;
      }
      .tp-col-list::-webkit-scrollbar {
        width: 5px !important;
      }
      .tp-col-list::-webkit-scrollbar-thumb {
        background: #cbd5e1 !important;
        border-radius: 3px !important;
      }
      .tp-item {
        padding: 5px 8px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        text-align: center !important;
        border-radius: 5px !important;
        cursor: pointer !important;
        color: #334155 !important;
        transition: all 0.12s ease !important;
      }
      .tp-item:hover {
        background: #eff6ff !important;
        color: #1d4ed8 !important;
      }
      .tp-item.selected {
        background: #2563eb !important;
        color: #ffffff !important;
        font-weight: 700 !important;
      }
      .tp-footer {
        padding: 8px 10px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        background: #ffffff !important;
      }
      .tp-footer-right {
        display: flex !important;
        gap: 6px !important;
      }
      .tp-btn {
        padding: 4px 10px !important;
        font-size: 11.5px !important;
        font-weight: 600 !important;
        border-radius: 5px !important;
        cursor: pointer !important;
        border: 1px solid transparent !important;
        transition: all 0.12s ease !important;
      }
      .tp-btn-clear {
        background: #fef2f2 !important;
        color: #dc2626 !important;
        border-color: #fecaca !important;
      }
      .tp-btn-clear:hover {
        background: #fee2e2 !important;
      }
      .tp-btn-now {
        background: #f1f5f9 !important;
        color: #475569 !important;
        border-color: #cbd5e1 !important;
      }
      .tp-btn-now:hover {
        background: #e2e8f0 !important;
        color: #1e293b !important;
      }
      .tp-btn-apply {
        background: #2563eb !important;
        color: #ffffff !important;
        border-color: #2563eb !important;
      }
      .tp-btn-apply:hover {
        background: #1d4ed8 !important;
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTimepickers);
  } else {
    initTimepickers();
  }

  window.initTimepickers24h = initTimepickers;
})();
