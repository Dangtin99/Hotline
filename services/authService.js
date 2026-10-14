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

let tursoClient = null;
try {
  tursoClient = require("./tursoClient");
} catch (e) {}

let memoryUsersCache = null;

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
      assigned_depots TEXT NOT NULL DEFAULT 'ALL',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  try {
    sqliteEngine.exec("ALTER TABLE users ADD COLUMN assigned_depots TEXT NOT NULL DEFAULT 'ALL';");
  } catch (e) {}
} catch (e) {
  sqliteEngine = null;
}

// Hàm chuẩn hóa danh sách Depot trực thuộc
function parseDepots(val) {
  if (Array.isArray(val)) {
    const cleaned = val.map(d => String(d).trim().toUpperCase()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : ["ALL"];
  }
  if (typeof val === "string") {
    const parts = val.split(",").map(d => d.trim().toUpperCase()).filter(Boolean);
    return parts.length > 0 ? parts : ["ALL"];
  }
  return ["ALL"];
}

// Hàm mã hóa mật khẩu an toàn với PBKDF2 và muối (Salt)
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

// 7 Tài khoản chuẩn theo yêu cầu của hệ thống kèm phân quyền Depot trực thuộc
const SEED_ACCOUNTS = [
  {
    fullName: "ADMIN",
    username: "admin",
    password: "123456789@",
    role: "admin",
    assignedDepots: ["ALL"],
    isActive: 1
  },
  {
    fullName: "Đặng Đức Tín",
    username: "user01",
    password: "123456789@",
    role: "user",
    assignedDepots: ["BSD", "SLD"],
    isActive: 1
  },
  {
    fullName: "Võ Ngọc Bảo Châu",
    username: "user02",
    password: "123456789@",
    role: "user",
    assignedDepots: ["THT", "PMCM"],
    isActive: 1
  },
  {
    fullName: "Lý Gia Huy",
    username: "user03",
    password: "123456789@",
    role: "user",
    assignedDepots: ["AIC", "ETD"],
    isActive: 1
  },
  {
    fullName: "User 04",
    username: "user04",
    password: "123456789@",
    role: "user",
    assignedDepots: ["SCD", "GKP"],
    isActive: 1
  },
  {
    fullName: "User 05",
    username: "user05",
    password: "123456789@",
    role: "user",
    assignedDepots: ["EPD"],
    isActive: 1
  },
  {
    fullName: "User 06",
    username: "user06",
    password: "123456789@",
    role: "user",
    assignedDepots: ["ALL"],
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
    const depots = parseDepots(acc.assignedDepots);
    users.push({
      id: acc.username,
      fullName: acc.fullName,
      username: acc.username,
      passwordHash,
      salt,
      role: acc.role,
      assignedDepots: depots,
      isActive: 1,
      createdAt: now,
      updatedAt: now
    });

    if (sqliteEngine) {
      try {
        const stmt = sqliteEngine.prepare(`
          INSERT INTO users (full_name, username, password_hash, salt, role, assigned_depots, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            full_name = excluded.full_name,
            password_hash = excluded.password_hash,
            salt = excluded.salt,
            role = excluded.role,
            assigned_depots = excluded.assigned_depots,
            updated_at = excluded.updated_at;
        `);
        stmt.run(acc.fullName, acc.username, passwordHash, salt, acc.role, depots.join(","), 1, now, now);
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

// Đọc danh sách tài khoản từ Memory Cache, SQLite hoặc File JSON
function loadUsers() {
  if (memoryUsersCache && Array.isArray(memoryUsersCache) && memoryUsersCache.length > 0) {
    return memoryUsersCache;
  }

  if (sqliteEngine) {
    try {
      const stmt = sqliteEngine.prepare("SELECT * FROM users ORDER BY id ASC");
      const rows = stmt.all();
      if (rows && rows.length > 0) {
        const users = rows.map(r => {
          const fallbackSeed = SEED_ACCOUNTS.find(s => s.username.toLowerCase() === String(r.username).toLowerCase());
          return {
            id: String(r.id),
            fullName: r.full_name,
            username: r.username,
            passwordHash: r.password_hash,
            salt: r.salt,
            role: r.role,
            assignedDepots: parseDepots(r.assigned_depots || (fallbackSeed ? fallbackSeed.assignedDepots : ["ALL"])),
            isActive: r.is_active === 1,
            createdAt: r.created_at,
            updatedAt: r.updated_at
          };
        });
        memoryUsersCache = users;
        return users;
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
        const users = list.map(u => {
          const fallbackSeed = SEED_ACCOUNTS.find(s => s.username.toLowerCase() === String(u.username).toLowerCase());
          return {
            ...u,
            assignedDepots: parseDepots(u.assignedDepots || (fallbackSeed ? fallbackSeed.assignedDepots : ["ALL"]))
          };
        });
        memoryUsersCache = users;
        return users;
      }
    }
  } catch (err) {
    console.warn("Lỗi đọc users.json:", err.message);
  }

  const seeded = seedDefaultUsers();
  memoryUsersCache = seeded;
  return seeded;
}

// Lưu danh sách tài khoản đồng bộ sang JSON, SQLite và Turso Cloud
function syncUserToStorage(user) {
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  user.updatedAt = now;
  user.assignedDepots = parseDepots(user.assignedDepots);

  // 1. Cập nhật Memory Cache tức thời
  if (memoryUsersCache && Array.isArray(memoryUsersCache)) {
    memoryUsersCache = memoryUsersCache.map(u => (u.username.toLowerCase() === user.username.toLowerCase() ? { ...u, ...user } : u));
  }

  // 2. Cập nhật SQLite Local
  if (sqliteEngine) {
    try {
      const stmt = sqliteEngine.prepare(`
        UPDATE users SET
          full_name = ?,
          password_hash = ?,
          salt = ?,
          role = ?,
          assigned_depots = ?,
          is_active = ?,
          updated_at = ?
        WHERE username = ?
      `);
      stmt.run(
        user.fullName,
        user.passwordHash,
        user.salt,
        user.role,
        user.assignedDepots.join(","),
        user.isActive ? 1 : 0,
        now,
        user.username
      );
    } catch (err) {
      console.error("Lỗi cập nhật SQLite user:", err.message);
    }
  }

  // 3. Cập nhật File JSON
  try {
    const all = loadUsers().map(u => (u.username.toLowerCase() === user.username.toLowerCase() ? { ...u, ...user } : u));
    fs.writeFileSync(USERS_FILE, JSON.stringify(all, null, 2), "utf8");
  } catch (err) {
    console.error("Lỗi đồng bộ users.json:", err.message);
  }

  // 4. Đồng bộ vĩnh viễn lên Turso Cloud
  if (tursoClient && tursoClient.isTursoAvailable()) {
    tursoClient.syncUserToTurso(user).catch(err => {
      console.warn("[Turso] Lỗi đồng bộ user lên Turso:", err.message);
    });
  }
}

// Khởi tạo các tài khoản mẫu và kéo quyền mới nhất từ Turso Cloud
(function initUsers() {
  const users = loadUsers();
  const userUsernames = users.map(u => u.username.toLowerCase());
  const needsSeed = SEED_ACCOUNTS.some(acc => !userUsernames.includes(acc.username.toLowerCase()));
  if (needsSeed || users.length === 0) {
    console.log(`Khởi tạo ${SEED_ACCOUNTS.length} tài khoản hệ thống chuẩn...`);
    seedDefaultUsers();
  }

  // Khởi tạo bảng users và đồng bộ từ Turso Cloud ngầm
  if (tursoClient && tursoClient.isTursoAvailable()) {
    (async () => {
      try {
        await tursoClient.initTursoUsersTable();
        const tursoUsers = await tursoClient.getAllUsersFromTurso();
        if (Array.isArray(tursoUsers) && tursoUsers.length > 0) {
          memoryUsersCache = tursoUsers;
        }
      } catch (e) {}
    })();
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
      assignedDepots: parseDepots(user.assignedDepots),
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
      roleLabel: currentUser.role === "admin" ? "Quản trị viên" : "Người dùng",
      assignedDepots: parseDepots(currentUser.assignedDepots)
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
      roleLabel: user.role === "admin" ? "Quản trị viên" : "Người dùng",
      assignedDepots: parseDepots(user.assignedDepots)
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
    assignedDepots: parseDepots(u.assignedDepots),
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  }));
}

// Phân quyền danh sách Depot trực thuộc (Dành cho Admin)
function updateUserDepots(usernameOrId, depots) {
  const users = loadUsers();
  const user = users.find(
    u => String(u.username).toLowerCase() === String(usernameOrId).toLowerCase() || String(u.id) === String(usernameOrId)
  );

  if (!user) {
    throw new Error(`Không tìm thấy người dùng: ${usernameOrId}`);
  }

  user.assignedDepots = parseDepots(depots);
  syncUserToStorage(user);

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    assignedDepots: user.assignedDepots,
    isActive: user.isActive
  };
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
    assignedDepots: user.assignedDepots,
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
  updateUserDepots,
  setUserActive,
  resetPassword,
  changePassword,
  seedDefaultUsers,
  hashPassword,
  parseDepots
};
