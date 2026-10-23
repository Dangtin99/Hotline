/**
 * GPG LOGISTICS - QUẢN LÝ GỌI ĐIỆN & THEO DÕI ĐỐI TÁC NHÀ XE (SHEET NVT & CÁI MÉP)
 * Module xử lý bảng đối tác nhà xe, tích hợp KPI, bộ lọc đa năng, cập nhật trực tiếp inline và liên kết tài xế
 */

(function () {
  // Trạng thái dữ liệu Nhà Xe
  window.allCompanies = [];
  window.filteredCompanies = [];
  window.companyCurrentPage = 1;
  window.companyPageSize = 10;

  const COMPANY_LOCAL_UPDATES_KEY = "gpg_company_call_updates_v1";

  function getAuthHeaders() {
    const token = localStorage.getItem("gpg_auth_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
  }

  function getCompanyLocalUpdates() {
    try {
      const raw = localStorage.getItem(COMPANY_LOCAL_UPDATES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCompanyLocalUpdate(stt, updateObj) {
    try {
      const updates = getCompanyLocalUpdates();
      updates[String(stt)] = Object.assign({}, updates[String(stt)] || {}, updateObj);
      localStorage.setItem(COMPANY_LOCAL_UPDATES_KEY, JSON.stringify(updates));
    } catch (e) {}
  }

  // Khởi tạo và nạp dữ liệu nhà xe
  window.loadCompanyData = async function () {
    let loaded = false;
    try {
      const res = await fetch("/api/company-calls", { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json && json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
          window.allCompanies = json.data;
          loaded = true;
        }
      }
    } catch (e) {}

    // Fallback từ window.INITIAL_COMPANY_CALL_DATA
    if (!loaded && window.INITIAL_COMPANY_CALL_DATA && Array.isArray(window.INITIAL_COMPANY_CALL_DATA)) {
      window.allCompanies = JSON.parse(JSON.stringify(window.INITIAL_COMPANY_CALL_DATA));
    }

    // Hòa trộn cập nhật cục bộ từ localStorage
    const localUpdates = getCompanyLocalUpdates();
    if (Object.keys(localUpdates).length > 0) {
      window.allCompanies.forEach(c => {
        const u = localUpdates[String(c.stt)];
        if (u) {
          if (u.callNotes !== undefined) c.callNotes = u.callNotes;
          if (u.note !== undefined) c.note = u.note;
          if (u.callDate !== undefined) c.callDate = u.callDate;
          if (u.caller !== undefined) c.caller = u.caller;
          if (u.callStatus !== undefined) c.callStatus = u.callStatus;
          if (u.phone !== undefined) c.phone = u.phone;
          if (u.address !== undefined) c.address = u.address;
        }
      });
    }

    // Đồng bộ số lượng tài xế theo danh sách allDrivers thực tế
    syncDriverCountForCompanies();

    updateCompanyKPIs();
    populateCompanyCallerFilter();
    applyCompanyFilters();
  };

  // Tính số lượng tài xế thuộc từng nhà xe dựa trên danh sách tài xế
  function syncDriverCountForCompanies() {
    const drivers = window.allDrivers || window.INITIAL_DRIVER_CALL_DATA || [];
    if (!Array.isArray(drivers) || drivers.length === 0) return;

    const byTaxId = {};
    const byName = {};

    drivers.forEach(d => {
      const tax = String(d.taxId || "").trim();
      const comp = String(d.company || "").trim().toUpperCase();
      if (tax) byTaxId[tax] = (byTaxId[tax] || 0) + 1;
      if (comp) byName[comp] = (byName[comp] || 0) + 1;
    });

    window.allCompanies.forEach(c => {
      const count = byTaxId[c.taxId] || byName[c.name.toUpperCase().trim()] || 0;
      if (count > 0 || c.driverCount === undefined) {
        c.driverCount = count;
      }
    });
  }

  // Cập nhật thẻ KPI Nhà Xe
  window.updateCompanyKPIs = function () {
    const total = window.allCompanies.length;
    let joined = 0;
    let contacted = 0;
    let unreachable = 0;
    let pending = 0;
    let totalCr = 0;
    let caiMepCount = 0;

    window.allCompanies.forEach(c => {
      totalCr += Number(c.totalCr) || 0;
      if (c.isCaiMep) caiMepCount++;

      const st = String(c.callStatus || "").trim();
      if (st === "Đã tham gia nhóm" || st === "Đã tạo nhóm riêng") {
        joined++;
      } else if (st === "Không nghe máy" || st === "Thuê bao" || st === "Chưa liên hệ được" || st === "Điều độ nghỉ việc") {
        unreachable++;
      } else if (st === "Đã liên hệ" || st === "Mời tham gia nhóm" || (c.callNotes && c.callNotes.trim())) {
        contacted++;
      } else {
        pending++;
      }
    });

    const elTotal = document.getElementById("kpiCompanyTotal");
    if (elTotal) elTotal.textContent = total.toLocaleString("vi-VN");

    const elJoined = document.getElementById("kpiCompanyJoined");
    if (elJoined) elJoined.textContent = joined.toLocaleString("vi-VN");

    const elContacted = document.getElementById("kpiCompanyContacted");
    if (elContacted) elContacted.textContent = contacted.toLocaleString("vi-VN");

    const elUnreachable = document.getElementById("kpiCompanyUnreachable");
    if (elUnreachable) elUnreachable.textContent = unreachable.toLocaleString("vi-VN");

    const elPending = document.getElementById("kpiCompanyPending");
    if (elPending) elPending.textContent = pending.toLocaleString("vi-VN");

    const elTotalCr = document.getElementById("kpiCompanyTotalCr");
    if (elTotalCr) elTotalCr.textContent = totalCr.toLocaleString("vi-VN");

    const elCaiMep = document.getElementById("kpiCompanyCaiMep");
    if (elCaiMep) elCaiMep.textContent = caiMepCount.toLocaleString("vi-VN");

    const elBadgeTotal = document.getElementById("badgeCompanyTotalSource");
    if (elBadgeTotal) elBadgeTotal.textContent = `${total.toLocaleString("vi-VN")} Nhà Xe`;

    const elBadgeTab = document.getElementById("badgeTabCompanyCount");
    if (elBadgeTab) elBadgeTab.textContent = total.toLocaleString("vi-VN");
  };

  // Nạp danh sách nhân sự phụ trách vào dropdown lọc
  function populateCompanyCallerFilter() {
    const select = document.getElementById("filterCompanyCaller");
    if (!select) return;

    const currentVal = select.value;
    const callers = new Set();
    window.allCompanies.forEach(c => {
      if (c.caller && c.caller.trim()) callers.add(c.caller.trim());
    });

    const sorted = Array.from(callers).sort();
    let html = `<option value="">Tất cả nhân sự</option>`;
    sorted.forEach(c => {
      html += `<option value="${c}">${c}</option>`;
    });
    html += `<option value="none">Chưa phân công</option>`;
    select.innerHTML = html;
    if (currentVal) select.value = currentVal;
  }

  // Phân loại CSS class cho dropdown trạng thái gọi
  function getCompanyCallStatusClass(status) {
    if (status === "Đã tham gia nhóm" || status === "Đã tạo nhóm riêng") return "company-status-joined";
    if (status === "Đã liên hệ" || status === "Mời tham gia nhóm") return "company-status-contacted";
    if (status === "Không nghe máy" || status === "Thuê bao" || status === "Chưa liên hệ được" || status === "Điều độ nghỉ việc") return "company-status-missed";
    return "company-status-pending";
  }

  // Áp dụng bộ lọc cho danh sách Nhà Xe
  window.applyCompanyFilters = function () {
    const keyword = (document.getElementById("filterCompanyKeyword")?.value || "").trim().toLowerCase();
    const callStatus = (document.getElementById("filterCompanyCallStatus")?.value || "").trim();
    const caller = (document.getElementById("filterCompanyCaller")?.value || "").trim();
    const compType = (document.getElementById("filterCompanyType")?.value || "").trim();
    const crVolume = (document.getElementById("filterCompanyCrVolume")?.value || "").trim();
    const sortBy = (document.getElementById("sortCompanyBy")?.value || "stt_asc").trim();
    const dateFrom = (document.getElementById("filterCompanyDateFrom")?.value || "").trim();
    const dateTo = (document.getElementById("filterCompanyDateTo")?.value || "").trim();

    window.filteredCompanies = window.allCompanies.filter(c => {
      // 1. Lọc từ khóa tìm nhanh
      if (keyword) {
        const matchName = (c.name || "").toLowerCase().includes(keyword);
        const matchTax = (c.taxId || "").toLowerCase().includes(keyword);
        const matchPhone = (c.phone || "").toLowerCase().includes(keyword);
        const matchAddress = (c.address || "").toLowerCase().includes(keyword);
        const matchNotes = (c.callNotes || "").toLowerCase().includes(keyword);
        const matchSubNote = (c.note || "").toLowerCase().includes(keyword);
        const matchCaller = (c.caller || "").toLowerCase().includes(keyword);
        if (!matchName && !matchTax && !matchPhone && !matchAddress && !matchNotes && !matchSubNote && !matchCaller) {
          return false;
        }
      }

      // 2. Lọc trạng thái gọi
      if (callStatus) {
        if (c.callStatus !== callStatus) return false;
      }

      // 3. Lọc nhân sự phụ trách
      if (caller) {
        if (caller === "none") {
          if (c.caller && c.caller.trim()) return false;
        } else {
          if ((c.caller || "").trim() !== caller) return false;
        }
      }

      // 4. Lọc phân loại đối tác
      if (compType === "caimep" && !c.isCaiMep) return false;
      if (compType === "has_cr" && (Number(c.totalCr) || 0) <= 0) return false;
      if (compType === "has_drivers" && (Number(c.driverCount) || 0) <= 0) return false;

      // 5. Lọc mức sản lượng CR
      if (crVolume) {
        const cr = Number(c.totalCr) || 0;
        if (crVolume === "tier1" && cr <= 500) return false;
        if (crVolume === "tier2" && (cr < 100 || cr > 500)) return false;
        if (crVolume === "tier3" && (cr < 10 || cr > 100)) return false;
        if (crVolume === "tier4" && (cr < 1 || cr > 10)) return false;
        if (crVolume === "zero" && cr > 0) return false;
      }

      // 6. Lọc ngày gọi
      if (dateFrom && c.callDate) {
        const d = String(c.callDate).slice(0, 10);
        if (d < dateFrom) return false;
      }
      if (dateTo && c.callDate) {
        const d = String(c.callDate).slice(0, 10);
        if (d > dateTo) return false;
      }

      return true;
    });

    // Sắp xếp
    if (sortBy === "cr_desc") {
      window.filteredCompanies.sort((a, b) => (Number(b.totalCr) || 0) - (Number(a.totalCr) || 0));
    } else if (sortBy === "driver_desc") {
      window.filteredCompanies.sort((a, b) => (Number(b.driverCount) || 0) - (Number(a.driverCount) || 0));
    } else if (sortBy === "name_asc") {
      window.filteredCompanies.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));
    } else if (sortBy === "date_desc") {
      window.filteredCompanies.sort((a, b) => (b.callDate || "").localeCompare(a.callDate || ""));
    } else {
      window.filteredCompanies.sort((a, b) => (Number(a.stt) || 0) - (Number(b.stt) || 0));
    }

    window.companyCurrentPage = 1;
    renderCompanyTable();
  };

  // Đặt lại bộ lọc nhà xe
  window.resetCompanyFilters = function () {
    if (document.getElementById("filterCompanyKeyword")) document.getElementById("filterCompanyKeyword").value = "";
    if (document.getElementById("filterCompanyCallStatus")) document.getElementById("filterCompanyCallStatus").value = "";
    if (document.getElementById("filterCompanyCaller")) document.getElementById("filterCompanyCaller").value = "";
    if (document.getElementById("filterCompanyType")) document.getElementById("filterCompanyType").value = "";
    if (document.getElementById("filterCompanyCrVolume")) document.getElementById("filterCompanyCrVolume").value = "";
    if (document.getElementById("sortCompanyBy")) document.getElementById("sortCompanyBy").value = "stt_asc";
    if (document.getElementById("filterCompanyDateFrom")) document.getElementById("filterCompanyDateFrom").value = "";
    if (document.getElementById("filterCompanyDateTo")) document.getElementById("filterCompanyDateTo").value = "";
    applyCompanyFilters();
  };

  // Render bảng dữ liệu Nhà Xe
  window.renderCompanyTable = function () {
    const tbody = document.getElementById("companyTableBody");
    if (!tbody) return;

    const totalRows = window.filteredCompanies.length;
    if (totalRows === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align: center; padding: 36px; color: var(--text-muted);">
            Không tìm thấy nhà xe đối tác nào phù hợp với bộ lọc tìm kiếm.
          </td>
        </tr>
      `;
      document.getElementById("companyPaginationInfo").textContent = "Không có kết quả";
      document.getElementById("companyPageIndicator").textContent = "0 / 0";
      document.getElementById("btnCompanyPageFirst").disabled = true;
      document.getElementById("btnCompanyPagePrev").disabled = true;
      document.getElementById("btnCompanyPageNext").disabled = true;
      document.getElementById("btnCompanyPageLast").disabled = true;
      return;
    }

    const totalPages = Math.ceil(totalRows / window.companyPageSize);
    if (window.companyCurrentPage > totalPages) window.companyCurrentPage = totalPages;
    if (window.companyCurrentPage < 1) window.companyCurrentPage = 1;

    const startIdx = (window.companyCurrentPage - 1) * window.companyPageSize;
    const endIdx = Math.min(startIdx + window.companyPageSize, totalRows);
    const pageRecords = window.filteredCompanies.slice(startIdx, endIdx);

    tbody.innerHTML = pageRecords.map(c => {
      const stt = c.stt;
      const caiMepBadge = c.isCaiMep ? `<span class="badge-caimep" title="Đội xe chuyên tuyến Cái Mép - Click để xem chi tiết năng lực">CÁI MÉP</span>` : "";
      const crVal = Number(c.totalCr) || 0;
      const crBadge = crVal > 0 
        ? `<span class="badge-cr" style="${crVal >= 100 ? 'background: #ffedd5; color: #c2410c; border-color: #fdba74;' : ''}">${crVal.toLocaleString("vi-VN")}</span>` 
        : `<span style="color: #94a3b8; font-size: 12px;">0</span>`;

      const driverCount = Number(c.driverCount) || 0;
      const driverBadge = driverCount > 0 
        ? `<button type="button" class="badge-driver-count" onclick="openCompanyDriverListModal(${stt})" title="Bấm để xem danh sách ${driverCount} tài xế thuộc nhà xe này">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
             ${driverCount} tài xế
           </button>`
        : `<span style="color: #94a3b8; font-size: 12px;">0</span>`;

      // Thông tin năng lực Cái Mép tóm tắt
      let cmSnippet = `<span style="color: #94a3b8; font-size: 11px;">-</span>`;
      if (c.caiMepDetails) {
        const cmd = c.caiMepDetails;
        const trucks = cmd.truckCount ? `${cmd.truckCount} xe` : "";
        const price = cmd.price ? `${cmd.price}` : "";
        cmSnippet = `<div style="font-size: 11px; line-height: 1.3;" title="Năng suất: ${cmd.productivity || '-'} | Tuyến: ${cmd.toPoint || '-'}">
          ${trucks ? `<strong style="color: #ea580c;">${trucks}</strong>` : ''}
          ${price ? `<div style="color: #0284c7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${price}</div>` : ''}
        </div>`;
      }

      return `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${stt}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
              <strong class="cell-truncate-company" title="${c.name} - ${c.address || ''}" style="max-width: 250px; cursor: pointer; color: var(--blue-primary);" onclick="openCompanyDetailModal(${stt})">
                ${c.name || "-"}
              </strong>
              ${caiMepBadge}
            </div>
            ${c.address ? `<div style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;" title="${c.address}">${c.address}</div>` : ''}
          </td>
          <td style="font-family: monospace; font-size: 12px; color: #475569; white-space: nowrap;">
            ${c.taxId || "-"}
          </td>
          <td>
            ${c.phone ? `
              <a href="tel:${c.phone}" style="color: var(--blue-primary); font-weight: 600; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" title="Bấm để gọi điện">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                ${c.phone}
              </a>
            ` : `<span style="color: #94a3b8; font-size: 12px;">-</span>`}
          </td>
          <td style="padding: 4px 6px;">
            <input type="text"
                   class="inline-caller-input"
                   style="width: 90px;"
                   value="${(c.caller || '').replace(/"/g, '&quot;')}"
                   placeholder="Nhân sự..."
                   onchange="handleCompanyCallerChange(${stt}, this.value, this)"
                   onkeydown="if(event.key==='Enter'){this.blur();}"
                   title="Nhập tên nhân sự phụ trách nhà xe">
          </td>
          <td style="padding: 4px 6px;">
            <select id="inlineCompanyStatus_${stt}"
                    class="inline-call-status-select ${getCompanyCallStatusClass(c.callStatus)}"
                    style="min-width: 145px;"
                    onchange="handleCompanyCallStatusChange(${stt}, this.value, this)"
                    title="Chọn trạng thái liên hệ nhà xe">
              <option value="Chưa liên hệ" ${c.callStatus === 'Chưa liên hệ' ? 'selected' : ''}>Chưa liên hệ</option>
              <option value="Đã tham gia nhóm" ${c.callStatus === 'Đã tham gia nhóm' ? 'selected' : ''}>Đã tham gia nhóm</option>
              <option value="Đã tạo nhóm riêng" ${c.callStatus === 'Đã tạo nhóm riêng' ? 'selected' : ''}>Đã tạo nhóm riêng</option>
              <option value="Mời tham gia nhóm" ${c.callStatus === 'Mời tham gia nhóm' ? 'selected' : ''}>Mời tham gia nhóm</option>
              <option value="Đã liên hệ" ${c.callStatus === 'Đã liên hệ' ? 'selected' : ''}>Đã liên hệ / Trao đổi</option>
              <option value="Không nghe máy" ${c.callStatus === 'Không nghe máy' ? 'selected' : ''}>Không nghe máy</option>
              <option value="Thuê bao" ${c.callStatus === 'Thuê bao' ? 'selected' : ''}>Thuê bao</option>
              <option value="Chưa liên hệ được" ${c.callStatus === 'Chưa liên hệ được' ? 'selected' : ''}>Chưa liên hệ được</option>
              <option value="Điều độ nghỉ việc" ${c.callStatus === 'Điều độ nghỉ việc' ? 'selected' : ''}>Điều độ nghỉ việc</option>
            </select>
          </td>
          <td style="padding: 4px 6px;">
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <input type="text"
                     id="inlineCompanyNotes_${stt}"
                     class="inline-notes-input"
                     style="width: 230px;"
                     value="${(c.callNotes || '').replace(/"/g, '&quot;')}"
                     placeholder="Nội dung cuộc gọi..."
                     onchange="handleCompanyNotesChange(${stt}, this.value, this)"
                     onkeydown="if(event.key==='Enter'){this.blur();}"
                     title="Nhập nội dung trao đổi / kết quả gọi điện">
              ${c.note ? `<div style="font-size: 11px; color: #64748b; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px;" title="${c.note}">Note: ${c.note}</div>` : ''}
            </div>
          </td>
          <td id="inlineCompanyDate_${stt}" style="font-family: monospace; font-size: 11px; color: var(--text-secondary); white-space: nowrap;">
            ${c.callDate || "-"}
          </td>
          <td style="text-align: right; padding-right: 12px;">
            ${crBadge}
          </td>
          <td style="text-align: center;">
            ${driverBadge}
          </td>
          <td style="padding: 4px 8px;">
            ${cmSnippet}
          </td>
          <td style="text-align: center; padding: 4px 6px;">
            <button type="button" class="btn btn-outline btn-sm" style="padding: 3px 8px; font-size: 11px;" onclick="openCompanyDetailModal(${stt})" title="Xem hồ sơ chi tiết đối tác nhà xe & danh sách tài xế">
              Chi Tiết
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Cập nhật thanh phân trang
    document.getElementById("companyPaginationInfo").textContent = `Hiển thị ${startIdx + 1} - ${endIdx} trên tổng số ${totalRows.toLocaleString("vi-VN")} nhà xe`;
    document.getElementById("companyPageIndicator").textContent = `${window.companyCurrentPage} / ${totalPages}`;
    document.getElementById("btnCompanyPageFirst").disabled = window.companyCurrentPage <= 1;
    document.getElementById("btnCompanyPagePrev").disabled = window.companyCurrentPage <= 1;
    document.getElementById("btnCompanyPageNext").disabled = window.companyCurrentPage >= totalPages;
    document.getElementById("btnCompanyPageLast").disabled = window.companyCurrentPage >= totalPages;
  };

  // Cập nhật trạng thái gọi inline của Nhà Xe
  window.handleCompanyCallStatusChange = async function (stt, newStatus, selectEl) {
    const val = (newStatus || "").trim();
    const c = window.allCompanies.find(item => item.stt === stt);
    if (!c) return;

    c.callStatus = val;

    // Tự động log ngày giờ hiện tại
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const timeLog = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    c.callDate = timeLog;
    saveCompanyLocalUpdate(stt, { callStatus: val, callDate: timeLog });

    const dateCell = document.getElementById(`inlineCompanyDate_${stt}`);
    if (dateCell) {
      dateCell.textContent = timeLog;
      dateCell.style.color = "var(--blue-primary)";
      dateCell.style.fontWeight = "600";
      setTimeout(() => {
        dateCell.style.fontWeight = "normal";
        dateCell.style.color = "";
      }, 1500);
    }

    if (selectEl) {
      selectEl.className = "inline-call-status-select " + getCompanyCallStatusClass(val);
    }

    try {
      await fetch("/api/company-calls/update", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ stt, callStatus: val, callDate: timeLog, callNotes: c.callNotes, caller: c.caller })
      });
    } catch (e) {}

    updateCompanyKPIs();
  };

  // Cập nhật nội dung gọi inline của Nhà Xe
  window.handleCompanyNotesChange = async function (stt, newNotes, inputEl) {
    const val = (newNotes || "").trim();
    const c = window.allCompanies.find(item => item.stt === stt);
    if (!c) return;

    c.callNotes = val;

    if (val && !c.callDate) {
      const today = new Date().toISOString().split("T")[0];
      c.callDate = today;
      saveCompanyLocalUpdate(stt, { callDate: today });
      const dateCell = document.getElementById(`inlineCompanyDate_${stt}`);
      if (dateCell) dateCell.textContent = today;
    }

    // Tự động cập nhật trạng thái nếu đang "Chưa liên hệ"
    if (val && (!c.callStatus || c.callStatus === "Chưa liên hệ")) {
      const nLow = val.toLowerCase();
      if (nLow.includes("đã tham gia") || nLow.includes("tham gia nhóm")) c.callStatus = "Đã tham gia nhóm";
      else if (nLow.includes("knm") || nLow.includes("không nghe máy")) c.callStatus = "Không nghe máy";
      else if (nLow.includes("thuê bao")) c.callStatus = "Thuê bao";
      else c.callStatus = "Đã liên hệ";

      const statusSelect = document.getElementById(`inlineCompanyStatus_${stt}`);
      if (statusSelect) {
        statusSelect.value = c.callStatus;
        statusSelect.className = "inline-call-status-select " + getCompanyCallStatusClass(c.callStatus);
      }
    }

    saveCompanyLocalUpdate(stt, { callNotes: val, callStatus: c.callStatus, callDate: c.callDate });

    if (inputEl) {
      inputEl.style.borderColor = "#16a34a";
      inputEl.style.background = "#dcfce7";
      setTimeout(() => {
        inputEl.style.borderColor = "";
        inputEl.style.background = "";
      }, 1200);
    }

    try {
      await fetch("/api/company-calls/update", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ stt, callNotes: val, callStatus: c.callStatus, callDate: c.callDate })
      });
    } catch (e) {}

    updateCompanyKPIs();
  };

  // Cập nhật nhân sự phụ trách inline
  window.handleCompanyCallerChange = async function (stt, newCaller, inputEl) {
    const val = (newCaller || "").trim();
    const c = window.allCompanies.find(item => item.stt === stt);
    if (!c) return;

    c.caller = val;
    saveCompanyLocalUpdate(stt, { caller: val });

    if (inputEl) {
      inputEl.style.borderColor = "#16a34a";
      inputEl.style.background = "#dcfce7";
      setTimeout(() => {
        inputEl.style.borderColor = "";
        inputEl.style.background = "";
      }, 1200);
    }

    try {
      await fetch("/api/company-calls/update", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ stt, caller: val })
      });
    } catch (e) {}

    populateCompanyCallerFilter();
  };

  // Modal Xem Chi Tiết Đối Tác Nhà Xe
  window.openCompanyDetailModal = function (stt) {
    const c = window.allCompanies.find(item => item.stt === stt);
    if (!c) return;

    const modal = document.getElementById("modalCompanyDetail");
    if (!modal) return;

    document.getElementById("modalDetailCompName").textContent = c.name || "Nhà xe";
    document.getElementById("modalDetailCompTaxId").textContent = c.taxId || "-";
    document.getElementById("modalDetailCompPhone").textContent = c.phone || "-";
    document.getElementById("modalDetailCompPhone").href = c.phone ? `tel:${c.phone}` : "#";
    document.getElementById("modalDetailCompAddress").textContent = c.address || "Chưa cập nhật địa chỉ";
    document.getElementById("modalDetailCompCaller").textContent = c.caller || "Chưa phân công";
    document.getElementById("modalDetailCompStatus").textContent = c.callStatus || "Chưa liên hệ";
    document.getElementById("modalDetailCompStatus").className = "badge-tag " + getCompanyCallStatusClass(c.callStatus);
    document.getElementById("modalDetailCompDate").textContent = c.callDate || "-";
    document.getElementById("modalDetailCompCr").textContent = `${(Number(c.totalCr) || 0).toLocaleString("vi-VN")} cont`;
    document.getElementById("modalDetailCompNotes").textContent = c.callNotes || "Chưa có ghi chú cuộc gọi";
    document.getElementById("modalDetailCompSubNote").textContent = c.note || "-";

    // Block thông tin Cái Mép (nếu có)
    const caiMepBox = document.getElementById("modalDetailCaiMepBox");
    if (caiMepBox) {
      if (c.isCaiMep && c.caiMepDetails) {
        const cmd = c.caiMepDetails;
        caiMepBox.style.display = "block";
        document.getElementById("modalDetailCmTrucks").textContent = cmd.truckCount ? `${cmd.truckCount} xe` : "Chưa rõ";
        document.getElementById("modalDetailCmRoute").textContent = `${cmd.fromPoint || 'Cái Mép'} ➔ ${cmd.toPoint || 'TBD/BSD/SLD'}`;
        document.getElementById("modalDetailCmPrice").textContent = cmd.price || "Đang đàm phán";
        document.getElementById("modalDetailCmProd").textContent = cmd.productivity ? `${cmd.productivity} ch/ngày` : "-";
        document.getElementById("modalDetailCmInvoice").textContent = cmd.validInvoice || "-";
        document.getElementById("modalDetailCmDebt").textContent = cmd.debtTerm || "-";
        document.getElementById("modalDetailCmExpected").textContent = cmd.expectedTransport || "-";
        document.getElementById("modalDetailCmCallContent").textContent = cmd.callContent || cmd.notes || "-";
      } else {
        caiMepBox.style.display = "none";
      }
    }

    // Danh sách tài xế trực thuộc
    renderCompanyDriversInModal(c);

    modal.style.display = "flex";
  };

  // Render danh sách tài xế của nhà xe trong Modal
  function renderCompanyDriversInModal(company) {
    const drivers = (window.allDrivers || window.INITIAL_DRIVER_CALL_DATA || []).filter(d => {
      const matchTax = company.taxId && d.taxId && String(d.taxId).trim() === String(company.taxId).trim();
      const matchName = company.name && d.company && String(d.company).trim().toUpperCase() === String(company.name).trim().toUpperCase();
      return matchTax || matchName;
    });

    const countEl = document.getElementById("modalDetailDriverCountBadge");
    if (countEl) countEl.textContent = `${drivers.length} tài xế`;

    const container = document.getElementById("modalDetailDriversList");
    if (!container) return;

    if (drivers.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
          Chưa ghi nhận tài xế nào thuộc nhà xe này trong hệ thống OneStop@LTA.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom: 10px;">
        <input type="text" id="modalDriverSearchInput" placeholder="Tìm nhanh tài xế trong nhà xe (Tên, SĐT, CCCD)..."
               style="width: 100%; padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px;"
               oninput="filterDriversInsideModal(this.value)">
      </div>
      <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-light); border-radius: 6px;">
        <table class="driver-table" style="font-size: 12px; margin: 0;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">STT</th>
              <th>Họ & Tên Tài Xế</th>
              <th>SĐT</th>
              <th>Điểm / Bậc</th>
              <th>CCCD</th>
              <th>Trạng Thái Gọi</th>
              <th>Nội Dung Trao Đổi</th>
            </tr>
          </thead>
          <tbody id="modalDriversTableBody">
            ${drivers.map((d, idx) => `
              <tr class="modal-driver-row" data-search="${(d.name + ' ' + d.phone + ' ' + d.cccd).toLowerCase()}">
                <td style="text-align: center; color: #94a3b8;">${idx + 1}</td>
                <td><strong>${d.name || '-'}</strong></td>
                <td><a href="tel:${d.phone}" style="color: var(--blue-primary); font-weight: 600;">${d.phone || '-'}</a></td>
                <td>${d.points ? `${d.points.toLocaleString()} (${d.rank || '-'})` : '-'}</td>
                <td style="font-family: monospace;">${d.cccd || '-'}</td>
                <td><span class="badge-tag ${d.callStatus === 'KhÃ´ng nghe mÃ¡y' || d.callStatus === 'missed' ? 'badge-call-missed' : (d.callStatus ? 'badge-call-called' : 'badge-call-pending')}">${d.callStatus || (d.notes ? 'Đã gọi' : 'Chưa gọi')}</span></td>
                <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${d.notes || ''}">${d.notes || '-'}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  window.filterDriversInsideModal = function (keyword) {
    const kw = (keyword || "").toLowerCase().trim();
    const rows = document.querySelectorAll(".modal-driver-row");
    rows.forEach(r => {
      const text = r.getAttribute("data-search") || "";
      r.style.display = text.includes(kw) ? "" : "none";
    });
  };

  window.openCompanyDriverListModal = function (stt) {
    openCompanyDetailModal(stt);
  };

  window.closeCompanyDetailModal = function () {
    const modal = document.getElementById("modalCompanyDetail");
    if (modal) modal.style.display = "none";
  };

  // Modal Thêm Nhà Xe Mới
  window.openAddCompanyModal = function () {
    const modal = document.getElementById("modalAddCompany");
    if (modal) modal.style.display = "flex";
  };

  window.closeAddCompanyModal = function () {
    const modal = document.getElementById("modalAddCompany");
    if (modal) modal.style.display = "none";
  };

  window.saveNewCompany = async function () {
    const name = (document.getElementById("addCompanyName")?.value || "").trim();
    const taxId = (document.getElementById("addCompanyTaxId")?.value || "").trim();
    const phone = (document.getElementById("addCompanyPhone")?.value || "").trim();
    const address = (document.getElementById("addCompanyAddress")?.value || "").trim();
    const caller = (document.getElementById("addCompanyCaller")?.value || "").trim();
    const callStatus = (document.getElementById("addCompanyCallStatus")?.value || "Chưa liên hệ").trim();
    const callNotes = (document.getElementById("addCompanyNotes")?.value || "").trim();
    const totalCr = Number(document.getElementById("addCompanyTotalCr")?.value) || 0;
    const isCaiMep = document.getElementById("addCompanyIsCaiMep")?.checked || false;

    if (!name) {
      alert("Vui lòng nhập tên công ty / nhà xe.");
      return;
    }

    const payload = {
      name,
      taxId,
      phone,
      address,
      caller,
      callStatus,
      callNotes,
      totalCr,
      isCaiMep
    };

    try {
      const res = await fetch("/api/company-calls/add", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.data) {
          window.allCompanies.unshift(json.data);
          saveCompanyLocalUpdate(json.data.stt, json.data);
        }
      } else {
        // Fallback local
        const maxStt = window.allCompanies.reduce((m, c) => Math.max(m, c.stt || 0), 0);
        const newC = Object.assign({ stt: maxStt + 1, callDate: new Date().toISOString().split("T")[0], driverCount: 0 }, payload);
        window.allCompanies.unshift(newC);
        saveCompanyLocalUpdate(newC.stt, newC);
      }
    } catch (e) {
      const maxStt = window.allCompanies.reduce((m, c) => Math.max(m, c.stt || 0), 0);
      const newC = Object.assign({ stt: maxStt + 1, callDate: new Date().toISOString().split("T")[0], driverCount: 0 }, payload);
      window.allCompanies.unshift(newC);
      saveCompanyLocalUpdate(newC.stt, newC);
    }

    closeAddCompanyModal();
    updateCompanyKPIs();
    populateCompanyCallerFilter();
    applyCompanyFilters();
  };

  // Xuất Excel cho Nhà Xe
  window.exportCompanyToExcel = function () {
    if (!window.XLSX) {
      alert("Thư viện xuất Excel đang được nạp, vui lòng thử lại sau giây lát.");
      return;
    }

    const rows = window.filteredCompanies.map(c => ({
      "STT": c.stt,
      "Tên Nhà Xe": c.name || "",
      "Mã Số Thuế": c.taxId || "",
      "SĐT Người Đại Diện": c.phone || "",
      "Địa Chỉ": c.address || "",
      "Nhân Sự Phụ Trách": c.caller || "",
      "Trạng Thái Cuộc Gọi": c.callStatus || "",
      "Nội Dung Cuộc Gọi": c.callNotes || "",
      "Ghi Chú Phụ (Note)": c.note || "",
      "Ngày Gọi": c.callDate || "",
      "Tổng SL CR": Number(c.totalCr) || 0,
      "Số Tài Xế LTA": Number(c.driverCount) || 0,
      "Chuyên Tuyến Cái Mép": c.isCaiMep ? "Có" : "Không",
      "SL Xe Cái Mép": c.caiMepDetails?.truckCount || "",
      "Tuyến Đường Cái Mép": c.caiMepDetails?.toPoint || "",
      "Đơn Giá Cái Mép (VNĐ)": c.caiMepDetails?.price || "",
      "Năng Suất VC (ch/ngày)": c.caiMepDetails?.productivity || "",
      "Hạn Mức Công Nợ": c.caiMepDetails?.debtTerm || ""
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nhà Xe");

    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const fileName = `Danh_Sach_Nha_Xe_Doi_Tac_${timeStr}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  // Xuất CSV cho Nhà Xe
  window.exportCompanyToCsv = function () {
    const headers = [
      "STT", "Tên Nhà Xe", "Mã Số Thuế", "SĐT Đại Diện", "Địa Chỉ",
      "Phụ Trách", "Trạng Thái Cuộc Gọi", "Nội Dung Cuộc Gọi", "Ghi Chú", "Ngày Gọi",
      "Tổng SL CR", "Số Tài Xế LTA", "Đội Xe Cái Mép"
    ];
    const csvRows = [headers.join(",")];

    window.filteredCompanies.forEach(c => {
      const row = [
        c.stt,
        `"${(c.name || "").replace(/"/g, '""')}"`,
        `"${(c.taxId || "").replace(/"/g, '""')}"`,
        `"${(c.phone || "").replace(/"/g, '""')}"`,
        `"${(c.address || "").replace(/"/g, '""')}"`,
        `"${(c.caller || "").replace(/"/g, '""')}"`,
        `"${(c.callStatus || "").replace(/"/g, '""')}"`,
        `"${(c.callNotes || "").replace(/"/g, '""')}"`,
        `"${(c.note || "").replace(/"/g, '""')}"`,
        `"${(c.callDate || "").replace(/"/g, '""')}"`,
        Number(c.totalCr) || 0,
        Number(c.driverCount) || 0,
        c.isCaiMep ? '"Có"' : '"Không"'
      ];
      csvRows.push(row.join(","));
    });

    const csvContent = "\uFEFF" + csvRows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Danh_Sach_Nha_Xe_Doi_Tac_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Chuyển đổi Tab: 'drivers' hoặc 'companies'
  window.activeCallTab = "drivers";
  window.switchCallTab = function (tab) {
    window.activeCallTab = tab;

    const btnDrivers = document.getElementById("tabBtnDrivers");
    const btnCompanies = document.getElementById("tabBtnCompanies");
    const paneDrivers = document.getElementById("paneDrivers");
    const paneCompanies = document.getElementById("paneCompanies");

    const headerTitle = document.getElementById("callPageHeaderTitle");
    const headerSub = document.getElementById("callPageHeaderSubtitle");
    const btnOpenAdd = document.getElementById("btnOpenAddModal");

    if (tab === "companies") {
      if (btnDrivers) btnDrivers.classList.remove("active");
      if (btnCompanies) btnCompanies.classList.add("active");
      if (paneDrivers) paneDrivers.style.display = "none";
      if (paneCompanies) paneCompanies.style.display = "block";

      if (headerTitle) headerTitle.textContent = "QUẢN LÝ GỌI ĐIỆN & THEO DÕI ĐỐI TÁC NHÀ XE";
      if (headerSub) headerSub.textContent = "Bảng theo dõi nhật ký liên hệ 416 nhà xe đối tác, người đại diện, sản lượng CR và năng lực đội xe Cái Mép";
      if (btnOpenAdd) btnOpenAdd.textContent = "+ Thêm Nhà Xe Mới";

      // Nạp dữ liệu nhà xe nếu chưa nạp
      if (window.allCompanies.length === 0) {
        window.loadCompanyData();
      } else {
        updateCompanyKPIs();
        renderCompanyTable();
      }
    } else {
      if (btnDrivers) btnDrivers.classList.add("active");
      if (btnCompanies) btnCompanies.classList.remove("active");
      if (paneDrivers) paneDrivers.style.display = "block";
      if (paneCompanies) paneCompanies.style.display = "none";

      if (headerTitle) headerTitle.textContent = "QUẢN LÝ GỌI ĐIỆN TÀI XẾ & ĐỐI TÁC";
      if (headerSub) headerSub.textContent = "Bảng theo dõi nhật ký liên hệ, phân loại nhu cầu và kết nối tài xế chạy kết hợp Cái Mép - HCM/Bình Dương";
      if (btnOpenAdd) btnOpenAdd.textContent = "+ Thêm Dòng Mới";
    }

    // Cập nhật URL query parameter mà không reload trang
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {}
  };

  // Đăng ký sự kiện DOMContentLoaded cho module Nhà Xe
  document.addEventListener("DOMContentLoaded", () => {
    // Sự kiện bộ lọc Nhà Xe
    document.getElementById("filterCompanyKeyword")?.addEventListener("input", applyCompanyFilters);
    document.getElementById("filterCompanyCallStatus")?.addEventListener("change", applyCompanyFilters);
    document.getElementById("filterCompanyCaller")?.addEventListener("change", applyCompanyFilters);
    document.getElementById("filterCompanyType")?.addEventListener("change", applyCompanyFilters);
    document.getElementById("filterCompanyCrVolume")?.addEventListener("change", applyCompanyFilters);
    document.getElementById("sortCompanyBy")?.addEventListener("change", applyCompanyFilters);
    document.getElementById("filterCompanyDateFrom")?.addEventListener("change", applyCompanyFilters);
    document.getElementById("filterCompanyDateTo")?.addEventListener("change", applyCompanyFilters);

    document.getElementById("btnCompanyResetFilter")?.addEventListener("click", resetCompanyFilters);
    document.getElementById("btnRefreshCompanyData")?.addEventListener("click", loadCompanyData);
    document.getElementById("btnCompanyQuickAdd")?.addEventListener("click", openAddCompanyModal);

    // Sự kiện phân trang Nhà Xe
    document.getElementById("selectCompanyPageSize")?.addEventListener("change", (e) => {
      window.companyPageSize = parseInt(e.target.value, 10);
      window.companyCurrentPage = 1;
      renderCompanyTable();
    });

    document.getElementById("btnCompanyPageFirst")?.addEventListener("click", () => {
      window.companyCurrentPage = 1;
      renderCompanyTable();
    });
    document.getElementById("btnCompanyPagePrev")?.addEventListener("click", () => {
      if (window.companyCurrentPage > 1) {
        window.companyCurrentPage--;
        renderCompanyTable();
      }
    });
    document.getElementById("btnCompanyPageNext")?.addEventListener("click", () => {
      const totalPages = Math.ceil(window.filteredCompanies.length / window.companyPageSize);
      if (window.companyCurrentPage < totalPages) {
        window.companyCurrentPage++;
        renderCompanyTable();
      }
    });
    document.getElementById("btnCompanyPageLast")?.addEventListener("click", () => {
      window.companyCurrentPage = Math.ceil(window.filteredCompanies.length / window.companyPageSize);
      renderCompanyTable();
    });

    // Kiểm tra URL xem người dùng có yêu cầu mở tab nhà xe trước không
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get("tab");
      if (tabParam === "companies" || tabParam === "nhaxe" || tabParam === "company") {
        setTimeout(() => switchCallTab("companies"), 50);
      }
    } catch (e) {}
  });

})();
