const crypto = require('crypto');
const CryptoJS = require('crypto-js');

function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function encryptTable(table) {
  const secCode = 'smart@things!2020@HRMS***';
  const key = CryptoJS.MD5(secCode);
  const encrypted = CryptoJS.TripleDES.encrypt(table, key, {
    mode: CryptoJS.mode.ECB
  });
  return encrypted.toString();
}

function convertJson(data, reqid, reqtime, username) {
  if (username == null) username = 'noname';
  let jsonstring = JSON.stringify(data);
  jsonstring = jsonstring.replace(/ /g, '').replace(/\r/g, '').replace(/\n/g, '').replace(/\"/g, "'");
  return jsonstring + '#' + username + '#' + reqid + '#' + reqtime;
}

function encryptHMAC(code, data, username) {
  const secCode = 'smart@things!2020@HRMS***';
  const res = {};
  res['reqtime'] = (new Date()).getTime();
  res['datastring'] = convertJson(data, code, res['reqtime'], username);
  res['token'] = CryptoJS.HmacMD5(res['datastring'], secCode).toString();
  return res;
}

// In-memory token cache (reused across requests within token lifetime)
let cachedSession = {
  apiToken: null,
  username: null,
  expiresAt: 0
};

/**
 * Đăng nhập eDepot qua OAuth2 PKCE và SSO, trả về apiToken và username
 */
async function authenticate(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedSession.apiToken && cachedSession.expiresAt > now + 60000) {
    return { apiToken: cachedSession.apiToken, username: cachedSession.username };
  }

  const username = process.env.EDEPOT_USERNAME || '4824';
  const password = process.env.EDEPOT_PASSWORD || 'Dangtin992004!';

  // 1. Sinh khóa PKCE
  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
  const state = base64URLEncode(crypto.randomBytes(16));

  const authParams = new URLSearchParams({
    client_id: 'edepot',
    redirect_uri: 'https://edepot.ltacv.com/auth.html',
    response_type: 'code',
    scope: 'openid profile email api.WebApp',
    state: state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_mode: 'query'
  });

  // 2. GET Authorize
  const authRes = await fetch(`https://auth.ltacv.com/connect/authorize?${authParams.toString()}`, { redirect: 'manual' });
  let loginUrl = authRes.headers.get('location');
  if (!loginUrl) throw new Error('Không nhận được redirect từ auth.ltacv.com authorize');
  if (!loginUrl.startsWith('http')) loginUrl = 'https://auth.ltacv.com' + loginUrl;

  // 3. GET Login page
  const getLoginRes = await fetch(loginUrl);
  const getLoginCookies = getLoginRes.headers.getSetCookie ? getLoginRes.headers.getSetCookie() : [getLoginRes.headers.get('set-cookie')];
  const loginText = await getLoginRes.text();
  const tokenMatch = loginText.match(/name="__RequestVerificationToken"[^>]*value="([^"]*)"/i);
  const returnUrlMatch = loginText.match(/name="ReturnUrl"[^>]*value="([^"]*)"/i);

  if (!tokenMatch) throw new Error('Không tìm thấy __RequestVerificationToken trên trang login eDepot');

  // 4. POST Login form
  const postBody = new URLSearchParams({
    Username: username,
    Password: password,
    RememberLogin: 'true',
    ReturnUrl: returnUrlMatch[1].replace(/&amp;/g, '&'),
    __RequestVerificationToken: tokenMatch[1],
    button: 'login'
  });

  const cookieHeader = getLoginCookies.map(c => c.split(';')[0]).join('; ');
  const postLoginRes = await fetch('https://auth.ltacv.com/Account/Login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
      'Referer': loginUrl
    },
    body: postBody.toString(),
    redirect: 'manual'
  });

  const postCookies = postLoginRes.headers.getSetCookie ? postLoginRes.headers.getSetCookie() : [postLoginRes.headers.get('set-cookie')];
  const allCookies = [...getLoginCookies, ...postCookies].map(c => c.split(';')[0]).join('; ');
  const postLocation = postLoginRes.headers.get('location');
  if (!postLocation) throw new Error('POST Login thất bại: Sai tài khoản hoặc mật khẩu');

  // 5. Follow Callback
  const cbUrl = 'https://auth.ltacv.com' + postLocation;
  const cbRes = await fetch(cbUrl, {
    headers: { 'Cookie': allCookies },
    redirect: 'manual'
  });

  const finalRedirect = cbRes.headers.get('location');
  if (!finalRedirect || !finalRedirect.includes('code=')) {
    throw new Error('OAuth Callback không trả về authorization code');
  }

  const code = new URL(finalRedirect).searchParams.get('code');

  // 6. Token Endpoint
  const tokenRes = await fetch('https://auth.ltacv.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'edepot',
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'https://edepot.ltacv.com/auth.html',
      code_verifier: verifier
    }).toString()
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Không đổi được access_token: ' + JSON.stringify(tokenData));
  }

  // 7. LoginSSO
  const ssoRes = await fetch('https://edepotapi.ltacv.com/api/Users/LoginSSO', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      token: tokenData.access_token,
      checkKey: 'ADAccount'
    })
  });

  const ssoData = await ssoRes.json();
  if (!ssoData.token) {
    throw new Error('LoginSSO thất bại: ' + JSON.stringify(ssoData));
  }

  cachedSession = {
    apiToken: ssoData.token,
    username: ssoData.username || username,
    expiresAt: now + (tokenData.expires_in ? tokenData.expires_in * 1000 : 3600000)
  };

  return { apiToken: cachedSession.apiToken, username: cachedSession.username };
}

/**
 * Trích xuất danh sách đơn hàng theo điều kiện lọc
 * @param {Object} options
 * @param {string} options.fromDate - 'YYYY-MM-DD HH:mm:ss'
 * @param {string} options.toDate - 'YYYY-MM-DD HH:mm:ss'
 * @param {number} options.page - Mặc định 1
 * @param {number} options.pageSize - Mặc định 500
 */
async function fetchOrders({ fromDate, toDate, page = 1, pageSize = 500 }) {
  let session = await authenticate();

  const viewName = 'vw_tb_eDepot_DonHang_ListView';
  const filterExp = `NgayTao >= '${fromDate}' AND NgayTao <= '${toDate}'`;

  const payloadData = {
    tbname: encryptTable(viewName),
    current_index: page,
    next_index: pageSize,
    moreExp: filterExp,
    sortExp: 'NgayTao desc',
    isAction: '1',
    appversion: '2023'
  };

  const hmac = encryptHMAC('GetDataPaging', payloadData, session.username);
  const reqBody = {
    token: '' + hmac.token,
    reqtime: hmac.reqtime,
    data: payloadData
  };

  let dataRes = await fetch('https://edepotapi.ltacv.com/api/data/process/GetDataPaging', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + session.apiToken
    },
    body: JSON.stringify(reqBody)
  });

  // Nếu 401 hoặc hết hạn, thử refresh 1 lần
  if (dataRes.status === 401) {
    session = await authenticate(true);
    const retryHmac = encryptHMAC('GetDataPaging', payloadData, session.username);
    dataRes = await fetch('https://edepotapi.ltacv.com/api/data/process/GetDataPaging', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + session.apiToken
      },
      body: JSON.stringify({
        token: '' + retryHmac.token,
        reqtime: retryHmac.reqtime,
        data: payloadData
      })
    });
  }

  if (!dataRes.ok) {
    throw new Error(`GetDataPaging thất bại HTTP ${dataRes.status}`);
  }

  const result = await dataRes.json();
  const rawList = result.data || result;
  if (!Array.isArray(rawList)) {
    return { orders: [], total: 0 };
  }

  // Format sang định dạng chuẩn của bảng check đơn (eir_cancellation_orders)
  const orders = rawList.map(item => {
    const getVal = (field) => {
      if (!item[field]) return '';
      if (typeof item[field] === 'object') {
        return item[field].r !== undefined && item[field].r !== null ? String(item[field].r) : (item[field].v || '');
      }
      return String(item[field]);
    };

    const getRaw = (field) => {
      if (!item[field]) return '';
      if (typeof item[field] === 'object') {
        return item[field].v !== undefined && item[field].v !== null ? String(item[field].v) : '';
      }
      return String(item[field]);
    };

    // Chuẩn hóa ngày giờ sang YYYY-MM-DD HH:mm:ss
    const parseDateStr = (rawStr) => {
      if (!rawStr) return null;
      const d = new Date(rawStr);
      if (isNaN(d.getTime())) return rawStr;
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const rawNgayTao = getRaw('NgayTao');
    const ngayTao = parseDateStr(rawNgayTao);
    const rawNgayDuyet = getRaw('NgayDuocDuyet');
    const ngayDuyet = parseDateStr(rawNgayDuyet);

    const loaiDonText = getVal('LoaiDonHang');
    const loaiDonHang = loaiDonText.toLowerCase().includes('out') ? 'OUT' : 'IN';

    const rawSize = getVal('ContTypeSizeID_Check') || getVal('ContTypeSizeID') || '';
    let sizeTeus = 0;
    if (rawSize.includes('20') || rawSize === '2200') sizeTeus = 1;
    else if (rawSize.includes('40') || rawSize.includes('45') || rawSize === '4500') sizeTeus = 2;

    const soBooking = getVal('SoChungTuNhapBai_Check') || getVal('SoChungTuNhapBai') || '';
    const hangTau = getVal('HangTauID_Check') || getVal('HangTauID') || '';

    return {
      sttFile: getVal('EIRNo'),
      depot: getVal('DepotID'),
      hangTau: hangTau,
      ngayHuyDon: ngayTao,
      ngayDuocDuyet: ngayDuyet,
      soBooking: soBooking,
      soContainer: getVal('ContID'),
      loaiContainer: rawSize,
      loaiDonHang: loaiDonHang,
      sizeTeus: sizeTeus,
      trangThaiDonHang: getVal('TrangThaiDonHang'),
      trangThaiKichHoat: getVal('DaThanhToanNangHa').includes('check') ? 'Đã kích hoạt' : 'Chưa kích hoạt',
      thoiGianKichHoat: ngayDuyet,
      lyDoHuy: getVal('LyDoHuy') || null,
      lyDoTuChoi: getVal('UserTuChoiDuyet') || null,
      lyDoHuyCheck: null,
      tenTaiXe: getVal('HoTen'),
      sdtTaiXe: getVal('SoDienThoai'),
      tenNhaXe: getVal('DonViVanTaiID'),
      sdtNhaXe: '',
      soXe: getVal('SoXe'),
      nguoiTao: getVal('NguoiTao')
    };
  });

  return {
    orders,
    total: orders.length
  };
}

module.exports = {
  authenticate,
  fetchOrders
};
