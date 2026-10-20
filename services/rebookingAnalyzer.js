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
 * Thuật toán gom nhóm 3 Vòng (Sequential Pipeline)
 */
function analyzeAndGroupOrders(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  // 0. Tiền xử lý dữ liệu 1 lần duy nhất trong RAM
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r._ts === undefined) {
      r._ts = parseRecordTimestamp(r);
      r._cleanBooking = (r.soBooking || "").toString().trim().toUpperCase();
      r._cleanCont = (r.soContainer || "").toString().trim().toUpperCase();
      r._cleanDir = (r.loaiDonHang || "").toString().trim().toUpperCase();
      r._cleanCreator = (r.nguoiTao || "").toString().trim().toUpperCase();
      r._cleanDepot = (r.depot || "").toString().trim().toUpperCase();
      r._cleanLine = (r.hangTau || "").toString().trim().toUpperCase();
      r._cleanTruck = cleanTruckPlate(r.soXe);
    }
  }

  // ----------------------------------------------------
  // VÒNG 1: Gom nhóm theo Booking + Container + Chiều
  // ----------------------------------------------------
  const pass1Map = new Map();

  records.forEach((r, idx) => {
    const bookingKey = r._cleanBooking || "CHUA_CO_BOOKING";
    const contKey = r._cleanCont || "CHUA_CO_CONT";
    const dirKey = (r._cleanDir === "IN" || r._cleanDir === "OUT") ? r._cleanDir : "NA";
    const groupKey = `${bookingKey}__${contKey}__${dirKey}`;

    if (!pass1Map.has(groupKey)) {
      pass1Map.set(groupKey, {
        groupKey,
        soBooking: r._cleanBooking || "-",
        soContainer: r._cleanCont || "-",
        loaiDonHang: dirKey,
        records: []
      });
    }

    pass1Map.get(groupKey).records.push({
      ...r,
      _originalIndex: idx
    });
  });

  // Sắp xếp bản ghi giảm dần theo timestamp
  pass1Map.forEach(g => {
    g.records.sort((a, b) => b._ts - a._ts);
  });

  // ----------------------------------------------------
  // BƯỚC 1.5: CẬP NHẬT SỐ BOOKING CHO ĐƠN BAN ĐẦU CHƯA CÓ BOOKING
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

  // ----------------------------------------------------
  // VÒNG 2: Pipeline xét và lọc dựa trên kết quả từ Vòng 1
  // Toàn bộ các nhóm từ Vòng 1 được đưa vào Vòng 2
  // Khóa xét: Số Container + Chiều + Người tạo + Số Xe
  // ----------------------------------------------------
  const pass2Map = new Map();
  const pass2Groups = [];

  pass1Groups.forEach(candidate => {
    const latestRec = candidate.records[0];
    const cont = candidate.soContainer;
    const dir = candidate.loaiDonHang;
    const creator = latestRec._cleanCreator;
    const truck = latestRec._cleanTruck;

    if (!cont || cont === "-" || cont === "CHUA_CO_CONT" || !creator || creator === "-" || !truck) {
      pass2Groups.push(candidate);
      return;
    }

    const pass2Key = `${cont}__${dir}__${creator}__${truck}`;

    if (!pass2Map.has(pass2Key)) {
      pass2Map.set(pass2Key, {
        pass2Key,
        soContainer: cont,
        loaiDonHang: dir,
        nguoiTaoKey: creator,
        truckKey: truck,
        memberGroups: []
      });
    }

    pass2Map.get(pass2Key).memberGroups.push(candidate);
  });

  pass2Map.forEach(p2 => {
    if (p2.memberGroups.length >= 2) {
      const combinedRecords = [];
      const seenBookings = new Set();
      const seenConts = new Set();

      p2.memberGroups.forEach(mg => {
        mg.records.forEach(r => {
          combinedRecords.push(r);
          if (r._cleanBooking) seenBookings.add(r._cleanBooking);
          if (r._cleanCont) seenConts.add(r._cleanCont);
        });
        if (mg.allBookings) mg.allBookings.forEach(b => seenBookings.add(b));
        if (mg.allConts) mg.allConts.forEach(c => seenConts.add(c));
      });

      combinedRecords.sort((a, b) => b._ts - a._ts);

      const latestRecord = combinedRecords[0];
      const latestBooking = latestRecord._cleanBooking || "-";

      pass2Groups.push({
        groupKey: `PASS2__${p2.pass2Key}`,
        soBooking: latestBooking,
        soContainer: p2.soContainer,
        loaiDonHang: p2.loaiDonHang,
        depot: latestRecord.depot || p2.memberGroups[0].depot || "-",
        hangTau: latestRecord.hangTau || p2.memberGroups[0].hangTau || "-",
        records: combinedRecords,
        matchType: "CHANGED_BOOKING",
        allBookings: Array.from(seenBookings),
        allConts: Array.from(seenConts)
      });
    } else {
      pass2Groups.push(p2.memberGroups[0]);
    }
  });

  // ----------------------------------------------------
  // VÒNG 3: Pipeline xét và lọc dựa trên kết quả từ Vòng 2
  // Khóa xét: OUT + Người tạo + Depot + Hãng tàu + Số xe
  // Điều kiện: Bắt buộc khác Booking, khác Cont, đơn trước bị hủy
  // ----------------------------------------------------
  const pass3Map = new Map();
  const finalizedGroups = [];

  pass2Groups.forEach(candidate => {
    const latestRec = candidate.records[0];
    const dir = candidate.loaiDonHang;
    const creator = latestRec._cleanCreator;
    const depot = latestRec._cleanDepot || (candidate.depot || "").toString().trim().toUpperCase();
    const line = latestRec._cleanLine || (candidate.hangTau || "").toString().trim().toUpperCase();
    const truck = latestRec._cleanTruck;

    const isValidCreator = creator && creator !== "-" && creator !== "UNKNOWN" && creator !== "UNDEFINED";
    const isOutDirection = dir === "OUT";

    if (!isOutDirection || !isValidCreator || !depot || depot === "-" || !line || line === "-" || !truck) {
      finalizedGroups.push(candidate);
      return;
    }

    const pass3Key = `OUT__${creator}__${depot}__${line}__${truck}`;

    if (!pass3Map.has(pass3Key)) {
      pass3Map.set(pass3Key, {
        pass3Key,
        creator,
        depot,
        line,
        truck,
        memberGroups: []
      });
    }

    pass3Map.get(pass3Key).memberGroups.push(candidate);
  });

  pass3Map.forEach(p3 => {
    if (p3.memberGroups.length <= 1) {
      finalizedGroups.push(p3.memberGroups[0]);
      return;
    }

    const sortedMembers = [...p3.memberGroups].sort((a, b) => {
      return a.records[a.records.length - 1]._ts - b.records[b.records.length - 1]._ts;
    });

    const clusters = [];
    sortedMembers.forEach(curr => {
      const currBooking = curr.soBooking || "";
      const currCont = curr.soContainer || "";

      let matchedCluster = null;
      for (let i = clusters.length - 1; i >= 0; i--) {
        const c = clusters[i];
        const last = c[c.length - 1];
        const lastBooking = last.soBooking || "";
        const lastCont = last.soContainer || "";

        const hasValidBk = currBooking && currBooking !== "-" && lastBooking && lastBooking !== "-";
        const hasValidCt = currCont && currCont !== "-" && lastCont && lastCont !== "-";
        const isDiffBk = currBooking !== lastBooking;
        const isDiffCt = currCont !== lastCont;

        const isBookingDuplicateInCluster = c.some(m => (m.soBooking || "") === currBooking);
        const isLastFailed = isCancelledOrFailedRecord(last.records[0]);
        const timeDiff = Math.abs(curr.records[curr.records.length - 1]._ts - last.records[0]._ts);
        const isWithin24h = timeDiff <= 24 * 3600 * 1000;

        if (hasValidBk && hasValidCt && isDiffBk && isDiffCt && !isBookingDuplicateInCluster && isLastFailed && isWithin24h) {
          matchedCluster = c;
          break;
        }
      }

      if (matchedCluster) {
        matchedCluster.push(curr);
      } else {
        clusters.push([curr]);
      }
    });

    clusters.forEach(c => {
      if (c.length >= 2) {
        const combinedRecords = [];
        const seenBookings = new Set();
        const seenConts = new Set();

        c.forEach(mg => {
          mg.records.forEach(r => {
            combinedRecords.push(r);
            if (r._cleanBooking) seenBookings.add(r._cleanBooking);
            if (r._cleanCont) seenConts.add(r._cleanCont);
          });
          if (mg.allBookings) mg.allBookings.forEach(b => seenBookings.add(b));
          if (mg.allConts) mg.allConts.forEach(c => seenConts.add(c));
        });

        combinedRecords.sort((a, b) => b._ts - a._ts);

        const latestRecord = combinedRecords[0];
        const latestBooking = latestRecord._cleanBooking || "-";
        const latestCont = latestRecord._cleanCont || "-";

        finalizedGroups.push({
          groupKey: `PASS3__${p3.pass3Key}__${latestBooking}__${latestCont}`,
          soBooking: latestBooking,
          soContainer: latestCont,
          loaiDonHang: "OUT",
          depot: p3.depot,
          hangTau: p3.line,
          records: combinedRecords,
          matchType: "OUT_REPLACED",
          allBookings: Array.from(seenBookings),
          allConts: Array.from(seenConts)
        });
      } else {
        finalizedGroups.push(c[0]);
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
