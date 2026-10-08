/**
 * services/authService.js
 * Quản trị xác thực, phân quyền & cơ sở dữ liệu người dùng (SQLite & JSON Store)
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const DB_SQLITE_PATH = path.join(DATA_DIR, "cancellation_orders.db");
const JWT_SECRET = process.env.JWT_SECRET || "gpg_logistics_cancellation_analytics_secret_2026_xyz";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Kết nối SQLite tích hợp của Node.js
let sqliteEngine = null;
try {
  const { DatabaseSync } = require("node:sqlite");
  sqliteEngine = new DatabaseSync(DB_SQLITE_PATH);
  sqliteEngine.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
} catch (e) {
  sqliteEngine = null;
}

// Hàm mã hóa mật khẩu an toàn với PBKDF2 và muối (Salt)
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

// 4 Tài khoản chuẩn theo yêu cầu của hệ thống
const SEED_ACCOUNTS = [
  {
    fullName: "ADMIN",
    username: "admin",
    password: "123456789@",
    role: "admin",
    isActive: 1
  },
  {
    fullName: "Đặng Đức Tín",
    username: "user01",
    password: "123456789@",
    role: "user",
    isActive: 1
  },
  {
    fullName: "Võ Ngọc Bảo Châu",
    username: "user02",
    password: "123456789@",
    role: "user",
    isActive: 1
  },
  {
    fullName: "Lý Gia Huy",
    username: "user03",
    password: "123456789@",
    role: "user",
    isActive: 1
  }
];

// Khởi tạo bảng người dùng ban đầu
function seedDefaultUsers() {
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  const users = [];

  for (const acc of SEED_ACCOUNTS) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(acc.password, salt);
    users.push({
      id: acc.username,
      fullName: acc.fullName,
      username: acc.username,
      passwordHash,
      salt,
      role: acc.role,
      isActive: 1,
      createdAt: now,
      updatedAt: now
    });

    if (sqliteEngine) {
      try {
        const stmt = sqliteEngine.prepare(`
          INSERT INTO users (full_name, username, password_hash, salt, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            full_name = excluded.full_name,
            password_hash = excluded.password_hash,
            salt = excluded.salt,
            role = excluded.role,
            updated_at = excluded.updated_at;
        `);
        stmt.run(acc.fullName, acc.username, passwordHash, salt, acc.role, 1, now, now);
      } catch (err) {
        console.warn("Lỗi seed SQLite user:", err.message);
      }
    }
  }

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("Lỗi lưu users.json:", err.message);
  }

  return users;
}

// Đọc danh sách tài khoản từ SQLite (ưu tiên) hoặc File JSON
function loadUsers() {
  if (sqliteEngine) {
    try {
      const stmt = sqliteEngine.prepare("SELECT * FROM users ORDER BY id ASC");
      const rows = stmt.all();
      if (rows && rows.length > 0) {
        return rows.map(r => ({
          id: String(r.id),
          fullName: r.full_name,
          username: r.username,
          passwordHash: r.password_hash,
          salt: r.salt,
          role: r.role,
          isActive: r.is_active === 1,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
    } catch (e) {
      console.warn("Lỗi đọc SQLite users, dùng fallback JSON:", e.message);
    }
  }

  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf8");
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (err) {
    console.warn("Lỗi đọc users.json:", err.message);
  }

  return seedDefaultUsers();
}

// Lưu danh sách tài khoản đồng bộ sang JSON và SQLite
function syncUserToStorage(user) {
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  user.updatedAt = now;

  if (sqliteEngine) {
    try {
      const stmt = sqliteEngine.prepare(`
        UPDATE users SET
          full_name = ?,
          password_hash = ?,
          salt = ?,
          role = ?,
          is_active = ?,
          updated_at = ?
        WHERE username = ?
      `);
      stmt.run(
        user.fullName,
        user.passwordHash,
        user.salt,
        user.role,
        user.isActive ? 1 : 0,
        now,
        user.username
      );
    } catch (err) {
      console.error("Lỗi cập nhật SQLite user:", err.message);
    }
  }

  // Cập nhật File JSON
  try {
    const all = loadUsers().map(u => (u.username === user.username ? { ...u, ...user } : u));
    fs.writeFileSync(USERS_FILE, JSON.stringify(all, null, 2), "utf8");
  } catch (err) {
    console.error("Lỗi đồng bộ users.json:", err.message);
  }
}

// Khởi tạo các tài khoản mẫu nếu chưa có
(function initUsers() {
  const users = loadUsers();
  // Kiểm tra nếu chưa đủ 4 tài khoản chuẩn thì thực hiện seed lại
  const userUsernames = users.map(u => u.username.toLowerCase());
  const needsSeed = SEED_ACCOUNTS.some(acc => !userUsernames.includes(acc.username.toLowerCase()));
  if (needsSeed || users.length === 0) {
    console.log("Khởi tạo 4 tài khoản hệ thống chuẩn...");
    seedDefaultUsers();
  }
})();

// Tạo Token xác thực (Stateless HMAC-SHA256 Token)
function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      roleLabel: user.role === "admin" ? "Quản trị viên" : "Người dùng",
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 ngày
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

// Xác thực Token & Kiểm tra tức thời trạng thái isActive của user
function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  if (signature !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && data.exp < Date.now()) {
      return null; // Token hết hạn
    }

    // Kiểm tra trực tiếp xem tài khoản có còn isActive không
    const users = loadUsers();
    const currentUser = users.find(u => u.username.toLowerCase() === String(data.username).toLowerCase());
    if (!currentUser || !currentUser.isActive) {
      return null; // Tài khoản đã bị khóa hoặc xóa
    }

    return {
      ...data,
      fullName: currentUser.fullName,
      role: currentUser.role,
      roleLabel: currentUser.role === "admin" ? "Quản trị viên" : "Người dùng"
    };
  } catch (e) {
    return null;
  }
}

// Thẩm định đăng nhập
function authenticate(username, password) {
  if (!username || !password) {
    return { success: false, message: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu." };
  }

  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase().trim());
  if (!user) {
    return { success: false, message: "Tên đăng nhập hoặc mật khẩu không chính xác." };
  }

  // Kiểm tra trạng thái isActive
  if (!user.isActive) {
    return {
      success: false,
      code: "ACCOUNT_INACTIVE",
      message: "Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên."
    };
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return { success: false, message: "Tên đăng nhập hoặc mật khẩu không chính xác." };
  }

  const token = generateToken(user);
  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      roleLabel: user.role === "admin" ? "Quản trị viên" : "Người dùng"
    }
  };
}

// Lấy danh sách toàn bộ người dùng (cho Admin)
function getAllUsers() {
  const users = loadUsers();
  return users.map(u => ({
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    role: u.role,
    roleLabel: u.role === "admin" ? "Quản trị viên" : "Người dùng",
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  }));
}

// Điều chỉnh trạng thái isActive (Dành cho Admin)
function setUserActive(usernameOrId, isActive) {
  const users = loadUsers();
  const user = users.find(
    u => String(u.username).toLowerCase() === String(usernameOrId).toLowerCase() || String(u.id) === String(usernameOrId)
  );

  if (!user) {
    throw new Error(`Không tìm thấy người dùng: ${usernameOrId}`);
  }

  user.isActive = Boolean(isActive);
  syncUserToStorage(user);

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive
  };
}

// Đặt lại mật khẩu cho tài khoản bất kỳ (Dành cho Admin)
function resetPassword(usernameOrId, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Mật khẩu mới phải có ít nhất 6 ký tự.");
  }

  const users = loadUsers();
  const user = users.find(
    u => String(u.username).toLowerCase() === String(usernameOrId).toLowerCase() || String(u.id) === String(usernameOrId)
  );

  if (!user) {
    throw new Error(`Không tìm thấy người dùng: ${usernameOrId}`);
  }

  const salt = crypto.randomBytes(16).toString("hex");
  user.salt = salt;
  user.passwordHash = hashPassword(newPassword, salt);
  syncUserToStorage(user);

  return {
    username: user.username,
    fullName: user.fullName,
    message: "Đã đặt lại mật khẩu thành công."
  };
}

// Tự đổi mật khẩu (User đổi mật khẩu của chính mình)
function changePassword(username, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw new Error("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.");
  }
  if (newPassword.length < 6) {
    throw new Error("Mật khẩu mới phải có ít nhất 6 ký tự.");
  }

  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user) {
    throw new Error("Không tìm thấy người dùng.");
  }

  const checkHash = hashPassword(currentPassword, user.salt);
  if (checkHash !== user.passwordHash) {
    throw new Error("Mật khẩu hiện tại không chính xác.");
  }

  const newSalt = crypto.randomBytes(16).toString("hex");
  user.salt = newSalt;
  user.passwordHash = hashPassword(newPassword, newSalt);
  syncUserToStorage(user);

  return {
    username: user.username,
    message: "Đã đổi mật khẩu thành công."
  };
}

module.exports = {
  authenticate,
  verifyToken,
  getAllUsers,
  setUserActive,
  resetPassword,
  changePassword,
  seedDefaultUsers,
  hashPassword
};
