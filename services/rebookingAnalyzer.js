/**
 * services/rebookingAnalyzer.js
 * Module phân tích & gom nhóm đơn đặt lại (Rebooking Orders) tại Backend (Server-Side Calculation).
 * Giúp giảm tải 100% CPU phía Client, tính toán sẵn trong RAM/Cache của máy chủ.
 * Tuân thủ nghiêm ngặt GEMINI.md: Không emoji, Text-only labels, hiệu năng cao.
 */

"use strict";

let cachedGroups = null;
let cachedRawCount = 0;
let lastCacheTime = 0;

/**
 * Chuẩn hóa biển số xe (bỏ dấu gạch ngang, chấm, khoảng trắng)
 */
function cleanTruckPlate(t) {
  if (!t || t === "-" || t === "null" || t === "undefined") return "";
  return String(t).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Nhận diện trạng thái đơn bị hủy hoặc từ chối
 */
function isCancelledOrFailedRecord(r) {
  if (!r) return true;
  const s = String(r.trangThaiDonHang || "").toLowerCase();
  return s.includes("hủy") || s.includes("huy") || s.includes("từ chối") || s.includes("tu choi") || s.includes("chưa thanh toán") || s.includes("chua thanh toan");
}

/**
 * Parse an toàn thời gian bản ghi thành timestamp (ms)
 */
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

/**
 * Thuật toán gom nhóm 4 Vòng Tuần Tự (Sequential 4-Pass Pipeline)
 *
 * VÒNG 1: Booking + Container + Chiều + Depot + Hãng tàu
 *          → Gom các lần hủy/đặt lại trên cùng vỏ Container
 * VÒNG 2 (CHỈ CHIỀU OUT): Booking + Chiều OUT + Depot + Hãng tàu (KHÁC Container)
 *          → Gom đơn đổi vỏ cont mới trong cùng Booking
 * VÒNG 3: Container + Chiều + Người tạo + Số xe + Depot + Hãng tàu (KHÁC Booking)
 *          → Gom đơn bị cấp số Booking mới cho cùng Container
 * VÒNG 4: Chỉ chiều OUT + Người tạo + Depot + Hãng tàu + Số xe (24h) (KHÁC Booking & KHÁC Container)
 *          → Gom đơn lấy rỗng OUT đổi hoàn toàn cả Booking lẫn vỏ cont
 */
function analyzeAndGroupOrders(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  // 0. Tiền xử lý dữ liệu 1 lần duy nhất trong RAM
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r._cleanBooking === undefined || r._cleanCont === undefined) {
      if (!r._ts || typeof r._ts !== "number") {
        r._ts = parseRecordTimestamp(r);
      }
      r._cleanBooking = (r.soBooking || "").toString().trim().toUpperCase();
      r._cleanCont    = (r.soContainer || "").toString().trim().toUpperCase();
      const dirRaw = (r.loaiDonHang || "").toString().trim().toUpperCase();
      r._cleanDir     = dirRaw.includes("OUT") ? "OUT" : (dirRaw.includes("IN") ? "IN" : dirRaw);
      r._cleanCreator = (r.nguoiTao || "").toString().trim().toUpperCase();
      r._cleanDepot   = (r.depot || "").toString().trim().toUpperCase();
      r._cleanLine    = (r.hangTau || "").toString().trim().toUpperCase();
      r._cleanTruck   = cleanTruckPlate(r.soXe);
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
      if (mg.allConts)    mg.allConts.forEach(c => seenConts.add(c));
    });
    combinedRecords.sort((a, b) => b._ts - a._ts);
    const latest = combinedRecords[0];
    return Object.assign({
      groupKey:     `${keyPrefix}`,
      soBooking:    latest._cleanBooking || "-",
      soContainer:  latest._cleanCont || "-",
      loaiDonHang:  latest._cleanDir || groups[0].loaiDonHang || "-",
      depot:        latest._cleanDepot || groups[0].depot || "-",
      hangTau:      latest._cleanLine || groups[0].hangTau || "-",
      records:      combinedRecords,
      allBookings:  Array.from(seenBookings),
      allConts:     Array.from(seenConts)
    }, overrides);
  }

  // ============================================================
  // VÒNG 1: Gom theo Booking + Container + Chiều + Depot + Hãng tàu
  // ============================================================
  const pass1Map = new Map();

  records.forEach((r, idx) => {
    const b    = (r._cleanBooking && r._cleanBooking !== "-") ? r._cleanBooking : "";
    const c    = (r._cleanCont    && r._cleanCont    !== "-") ? r._cleanCont    : "";
    const dir  = (r._cleanDir === "IN" || r._cleanDir === "OUT") ? r._cleanDir : "NA";
    const dep  = r._cleanDepot || "";
    const line = r._cleanLine  || "";

    const creator = (r._cleanCreator && r._cleanCreator !== "-" && r._cleanCreator !== "UNKNOWN" && r._cleanCreator !== "UNDEFINED") ? r._cleanCreator : "CHUA_CO_NGUOI_TAO";

    let groupKey;
    if (!b && !c) {
      groupKey = `NO_ID__${r.rowKey || r.id || ("ROW_" + idx)}`;
    } else {
      const bKey       = b       || "CHUA_CO_BOOKING";
      const cKey       = c       || "CHUA_CO_CONT";
      const depKey     = dep     || "CHUA_CO_DEPOT";
      const lineKey    = line    || "CHUA_CO_HANG_TAU";
      groupKey = `${bKey}__${cKey}__${dir}__${creator}__${depKey}__${lineKey}`;
    }

    if (!pass1Map.has(groupKey)) {
      pass1Map.set(groupKey, {
        groupKey,
        soBooking:   b    || "-",
        soContainer: c    || "-",
        loaiDonHang: dir,
        depot:       dep  || "-",
        hangTau:     line || "-",
        records: []
      });
    }
    pass1Map.get(groupKey).records.push({ ...r, _originalIndex: idx });
  });

  pass1Map.forEach(g => { g.records.sort((a, b) => b._ts - a._ts); });

  // Bước 1.5: Ghép Booking thực cho đơn thiếu Booking (dựa trên cùng Cont + Chiều)
  const contBkMap = new Map();
  pass1Map.forEach(g => {
    const hasRealBk  = g.soBooking   && g.soBooking   !== "-" && g.soBooking   !== "CHUA_CO_BOOKING";
    const hasRealCt  = g.soContainer && g.soContainer !== "-" && g.soContainer !== "CHUA_CO_CONT";
    if (hasRealBk && hasRealCt) {
      const creator = (g.records[0] && g.records[0]._cleanCreator) || "";
      const key = `${g.soContainer}__${g.loaiDonHang}__${creator}`;
      if (!contBkMap.has(key)) contBkMap.set(key, []);
      contBkMap.get(key).push(g);
    }
  });
  contBkMap.forEach(list => { list.sort((a, b) => b.records[0]._ts - a.records[0]._ts); });

  const pass1Groups = [];
  pass1Map.forEach(g => {
    const isMissingBk = !g.soBooking || g.soBooking === "-" || g.soBooking === "CHUA_CO_BOOKING";
    const hasCt       = g.soContainer && g.soContainer !== "-" && g.soContainer !== "CHUA_CO_CONT";
    if (isMissingBk && hasCt) {
      const creator = (g.records[0] && g.records[0]._cleanCreator) || "";
      const candidates = contBkMap.get(`${g.soContainer}__${g.loaiDonHang}__${creator}`);
      if (candidates && candidates.length > 0) {
        const target = candidates[0];
        target.records.push(...g.records);
        target.records.sort((a, b) => b._ts - a._ts);
        target.matchType = "UPDATED_BOOKING";
        return;
      }
    }
    pass1Groups.push(g);
  });

  // Chuẩn hóa thuộc tính nhóm V1
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
    const bk   = candidate.soBooking;
    const dir  = candidate.loaiDonHang;
    const dep  = latest._cleanDepot || (candidate.depot  || "").toString().trim().toUpperCase();
    const line = latest._cleanLine  || (candidate.hangTau || "").toString().trim().toUpperCase();

    const creator = latest._cleanCreator;
    const isValidCreator = creator && creator !== "-" && creator !== "UNKNOWN" && creator !== "UNDEFINED";

    // Chỉ gom vào Vòng 2 khi có chiều OUT, cùng người tạo hợp lệ và đủ Booking + Depot + Hãng tàu
    const isOutDir = dir && dir.toString().toUpperCase().includes("OUT");
    if (!isOutDir || !isValidCreator || !bk || bk === "-" || bk === "CHUA_CO_BOOKING" || !dep || dep === "-" || !line || line === "-") {
      pass2Groups.push(candidate);
      return;
    }

    const p2Key = `${bk}__${dir}__${creator}__${dep}__${line}`;

    if (!pass2Map.has(p2Key)) {
      pass2Map.set(p2Key, {
        p2Key,
        soBooking:   bk,
        loaiDonHang: dir,
        depot:       dep,
        hangTau:     line,
        memberGroups: []
      });
    }
    pass2Map.get(p2Key).memberGroups.push(candidate);
  });

  pass2Map.forEach(p2 => {
    // Chỉ gom khi có >= 2 nhóm với Cont khác nhau và đơn trước bị hủy
    const eligible = p2.memberGroups.filter((mg, idx) => {
      if (idx === 0) return true; // Giữ nhóm đầu làm gốc
      // Đơn này phải có Container khác với ít nhất 1 nhóm trước
      return p2.memberGroups.slice(0, idx).some(prev =>
        prev.soContainer !== mg.soContainer &&
        prev.soContainer !== "-" && mg.soContainer !== "-" &&
        isCancelledOrFailedRecord(prev.records[0])
      );
    });

    if (eligible.length >= 2) {
      const merged = mergeGroups(eligible, `PASS2__${p2.p2Key}`, { matchType: "CHANGED_CONT" });
      pass2Groups.push(merged);
      // Nhóm không đủ điều kiện gom thì trả về pass2Groups riêng lẻ
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
    const latest  = candidate.records[0];
    const cont    = candidate.soContainer;
    const dir     = candidate.loaiDonHang;
    const creator = latest._cleanCreator;
    const truck   = latest._cleanTruck;
    const dep     = latest._cleanDepot || (candidate.depot  || "").toString().trim().toUpperCase();
    const line    = latest._cleanLine  || (candidate.hangTau || "").toString().trim().toUpperCase();

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
      pass3Map.set(p3Key, { p3Key, soContainer: cont, loaiDonHang: dir, nguoiTaoKey: creator, truckKey: truck, depot: dep, hangTau: line, memberGroups: [] });
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
  // Tình huống: Lấy rỗng OUT đổi hoàn toàn cả Booking lẫn vỏ cont
  // ============================================================
  const pass4Map = new Map();
  const finalizedGroups = [];

  pass3Groups.forEach(candidate => {
    const latest  = candidate.records[0];
    const dir     = candidate.loaiDonHang;
    const creator = latest._cleanCreator;
    const dep     = latest._cleanDepot || (candidate.depot  || "").toString().trim().toUpperCase();
    const line    = latest._cleanLine  || (candidate.hangTau || "").toString().trim().toUpperCase();
    const truck   = latest._cleanTruck;

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
      const currBk   = curr.soBooking   || "";
      const currCont = curr.soContainer || "";

      let matchedCluster = null;
      for (let i = clusters.length - 1; i >= 0; i--) {
        const cl   = clusters[i];
        const last = cl[cl.length - 1];
        const lastBk   = last.soBooking   || "";
        const lastCont = last.soContainer || "";

        const hasValidBk   = currBk   && currBk   !== "-" && lastBk   && lastBk   !== "-";
        const hasValidCont = currCont && currCont !== "-" && lastCont && lastCont !== "-";
        const isDiffBk     = currBk   !== lastBk;
        const isDiffCont   = currCont !== lastCont;

        const isBookingDuplicateInCluster = cl.some(m => (m.soBooking || "") === currBk);
        const isLastFailed  = isCancelledOrFailedRecord(last.records[0]);
        const timeDiff      = Math.abs(curr.records[curr.records.length - 1]._ts - last.records[0]._ts);
        const isWithin24h   = timeDiff <= 24 * 3600 * 1000;

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
          depot:   p4.depot,
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
  // TỔNG HỢP KẾT QUẢ ĐỐI TƯỢNG ĐƠN HÀNG
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

/**
 * Trả về danh sách nhóm đơn đã tính toán sẵn với bộ nhớ đệm
 */
function getPrecomputedRebookingGroups(records, forceRefresh = false) {
  if (!forceRefresh && cachedGroups && cachedRawCount === records.length) {
    return cachedGroups;
  }
  cachedGroups = analyzeAndGroupOrders(records);
  cachedRawCount = records.length;
  lastCacheTime = Date.now();
  return cachedGroups;
}

/**
 * Xóa cache khi có dữ liệu mới
 */
function invalidateRebookingCache() {
  cachedGroups = null;
  cachedRawCount = 0;
  lastCacheTime = 0;
}

module.exports = {
  analyzeAndGroupOrders,
  getPrecomputedRebookingGroups,
  invalidateRebookingCache
};
