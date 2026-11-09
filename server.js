// Marketplace — mustaqil kichik loyiha (B2B loyihaga aloqasi yo'q).
// Hech qanday tashqi kutubxona kerak emas: node:http + node:sqlite (Node 22.5+).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3100;
const SECRET = process.env.SECRET || 'marketplace-dev-secret';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'marketplace.db');
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+998900000000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const ROLES = ['admin', 'seller', 'courier', 'user'];

// ---------- Baza ----------
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- Har bir buyurtma bitta sotuvchiga tegishli (savat sotuvchilar bo'yicha bo'linadi)
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    courier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    address TEXT NOT NULL,
    total INTEGER NOT NULL,
    -- new -> ready (kuryer qidirilmoqda) -> accepted (kuryer oldi) -> delivered
    -- new|ready -> cancelled
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );
`);

// ---------- Yordamchilar ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}
// Telefon: +998XXXXXXXXX ko'rinishiga keltiriladi
function normPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9) return '+998' + d;
  if (d.length === 12 && d.startsWith('998')) return '+' + d;
  return null;
}
const publicUser = (u) => u && { id: u.id, name: u.name, phone: u.phone, role: u.role, created_at: u.created_at };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, "Noto'g'ri JSON")); } });
    req.on('error', reject);
  });
}

function currentUser(req) {
  const auth = req.headers.authorization || '';
  const p = verify(auth.startsWith('Bearer ') ? auth.slice(7) : null);
  if (!p) return null;
  // Rol har safar bazadan olinadi — admin rolni o'zgartirsa darhol kuchga kiradi
  return db.prepare('SELECT * FROM users WHERE id = ?').get(p.id) || null;
}
function requireRole(user, ...roles) {
  if (!user) fail(401, 'Avval tizimga kiring');
  if (roles.length && !roles.includes(user.role)) fail(403, "Bu amal uchun ruxsat yo'q");
}

function productInput(b, partial = false) {
  const out = {};
  if (!partial || b.name !== undefined) {
    if (!String(b.name || '').trim()) fail(400, 'Mahsulot nomi kerak');
    out.name = String(b.name).trim();
  }
  if (!partial || b.price !== undefined) {
    const price = Number(b.price);
    if (!Number.isInteger(price) || price <= 0) fail(400, "Narx musbat butun son bo'lishi kerak");
    out.price = price;
  }
  if (!partial || b.stock !== undefined) {
    const stock = Number(b.stock ?? 0);
    if (!Number.isInteger(stock) || stock < 0) fail(400, "Qoldiq 0 yoki undan katta bo'lishi kerak");
    out.stock = stock;
  }
  if (b.description !== undefined) out.description = String(b.description);
  if (b.image !== undefined) out.image = String(b.image);
  return out;
}
function updateRow(table, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
}

function ordersWithItems(where, ...params) {
  const rows = db.prepare(`
    SELECT o.*, b.name AS buyer_name, b.phone AS buyer_phone,
           s.name AS seller_name, s.phone AS seller_phone,
           c.name AS courier_name, c.phone AS courier_phone
    FROM orders o
    JOIN users b ON b.id = o.buyer_id
    JOIN users s ON s.id = o.seller_id
    LEFT JOIN users c ON c.id = o.courier_id
    WHERE ${where} ORDER BY o.id DESC`).all(...params);
  const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  return rows.map((o) => ({ ...o, items: itemStmt.all(o.id) }));
}
function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) || fail(404, 'Buyurtma topilmadi');
}

// ---------- Marshrutlar ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

// Auth
route('POST', '/api/register', async ({ body }) => {
  const phone = normPhone(body.phone);
  if (!phone) fail(400, "Telefon raqam noto'g'ri (masalan: +998 90 123 45 67)");
  if (!String(body.name || '').trim()) fail(400, 'Ism kerak');
  if (String(body.password || '').length < 6) fail(400, "Parol kamida 6 belgidan iborat bo'lsin");
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) fail(409, "Bu raqam allaqachon ro'yxatdan o'tgan");
  // Ro'yxatdan o'tgan har kim — oddiy foydalanuvchi (user). Rolni faqat admin o'zgartiradi.
  const r = db.prepare("INSERT INTO users (name, phone, password, role) VALUES (?, ?, ?, 'user')")
    .run(body.name.trim(), phone, hashPassword(body.password));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  return { token: sign({ id: user.id, exp: Date.now() + 7 * 864e5 }), user: publicUser(user) };
});
route('POST', '/api/login', async ({ body }) => {
  const phone = normPhone(body.phone);
  const user = phone && db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !checkPassword(String(body.password || ''), user.password)) fail(401, "Telefon yoki parol noto'g'ri");
  return { token: sign({ id: user.id, exp: Date.now() + 7 * 864e5 }), user: publicUser(user) };
});
route('GET', '/api/me', async ({ user }) => { requireRole(user); return publicUser(user); });

// Katalog (hamma ko'radi)
route('GET', '/api/products', async ({ query }) => {
  const q = '%' + (query.get('q') || '') + '%';
  return db.prepare(`
    SELECT p.*, u.name AS seller_name FROM products p JOIN users u ON u.id = p.seller_id
    WHERE u.role = 'seller' AND (p.name LIKE ? OR p.description LIKE ?) ORDER BY p.id DESC`).all(q, q);
});

// Sotuvchi: o'z mahsulotlari CRUD
route('GET', '/api/seller/products', async ({ user }) => {
  requireRole(user, 'seller');
  return db.prepare('SELECT * FROM products WHERE seller_id = ? ORDER BY id DESC').all(user.id);
});
route('POST', '/api/seller/products', async ({ user, body }) => {
  requireRole(user, 'seller');
  const p = productInput(body);
  const r = db.prepare('INSERT INTO products (seller_id, name, description, price, stock, image) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, p.name, p.description || '', p.price, p.stock, p.image || '');
  return db.prepare('SELECT * FROM products WHERE id = ?').get(r.lastInsertRowid);
});
function ownProduct(user, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) fail(404, 'Mahsulot topilmadi');
  if (user.role !== 'admin' && p.seller_id !== user.id) fail(403, 'Bu mahsulot sizniki emas');
  return p;
}
route('PUT', '/api/seller/products/:id', async ({ user, body, params }) => {
  requireRole(user, 'seller', 'admin');
  ownProduct(user, params.id);
  updateRow('products', params.id, productInput(body, true));
  return db.prepare('SELECT * FROM products WHERE id = ?').get(params.id);
});
route('DELETE', '/api/seller/products/:id', async ({ user, params }) => {
  requireRole(user, 'seller', 'admin');
  ownProduct(user, params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(params.id);
  return { deleted: true };
});
// Sotuvchi: o'ziga kelgan buyurtmalar
route('GET', '/api/seller/orders', async ({ user }) => {
  requireRole(user, 'seller');
  return ordersWithItems('o.seller_id = ?', user.id);
});
// Sotuvchi buyurtmani tayyorlaydi va kuryer qidiradi -> barcha kuryerlarga tushadi
route('POST', '/api/seller/orders/:id/find-courier', async ({ user, params }) => {
  requireRole(user, 'seller');
  const o = getOrder(params.id);
  if (o.seller_id !== user.id) fail(403, 'Bu buyurtma sizniki emas');
  if (o.status !== 'new') fail(400, "Faqat yangi buyurtma uchun kuryer qidirish mumkin");
  db.prepare("UPDATE orders SET status = 'ready' WHERE id = ?").run(o.id);
  return { ok: true };
});
route('POST', '/api/seller/orders/:id/cancel', async ({ user, params }) => {
  requireRole(user, 'seller');
  const o = getOrder(params.id);
  if (o.seller_id !== user.id) fail(403, 'Bu buyurtma sizniki emas');
  if (!['new', 'ready'].includes(o.status)) fail(400, "Kuryer olgan buyurtmani bekor qilib bo'lmaydi");
  cancelOrder(o.id);
  return { ok: true };
});
function cancelOrder(id) {
  // Qoldiqni qaytarish
  for (const it of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id)) {
    if (it.product_id) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.qty, it.product_id);
  }
  db.prepare("UPDATE orders SET status = 'cancelled', courier_id = NULL WHERE id = ?").run(id);
}

// Kuryer
route('GET', '/api/courier/available', async ({ user }) => {
  requireRole(user, 'courier');
  return ordersWithItems("o.status = 'ready' AND o.courier_id IS NULL");
});
route('GET', '/api/courier/mine', async ({ user }) => {
  requireRole(user, 'courier');
  return ordersWithItems('o.courier_id = ?', user.id);
});
route('POST', '/api/courier/orders/:id/accept', async ({ user, params }) => {
  requireRole(user, 'courier');
  // Bir vaqtda ikki kuryer olmasligi uchun shartli UPDATE
  const r = db.prepare("UPDATE orders SET status = 'accepted', courier_id = ? WHERE id = ? AND status = 'ready' AND courier_id IS NULL")
    .run(user.id, params.id);
  if (!r.changes) fail(409, 'Bu buyurtmani boshqa kuryer olgan yoki u mavjud emas');
  return { ok: true };
});
// Kuryer qabul qilgan buyurtmasini bekor qiladi -> buyurtma yana boshqa kuryerlarga tushadi
route('POST', '/api/courier/orders/:id/cancel', async ({ user, params }) => {
  requireRole(user, 'courier');
  const o = getOrder(params.id);
  if (o.courier_id !== user.id || o.status !== 'accepted') fail(400, 'Bu buyurtmani bekor qila olmaysiz');
  db.prepare("UPDATE orders SET status = 'ready', courier_id = NULL WHERE id = ?").run(o.id);
  return { ok: true };
});
route('POST', '/api/courier/orders/:id/delivered', async ({ user, params }) => {
  requireRole(user, 'courier');
  const o = getOrder(params.id);
  if (o.courier_id !== user.id || o.status !== 'accepted') fail(400, 'Bu buyurtma sizda emas');
  db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(o.id);
  return { ok: true };
});

// Xaridor (user)
route('POST', '/api/orders', async ({ user, body }) => {
  requireRole(user);
  const address = String(body.address || '').trim();
  if (!address) fail(400, 'Yetkazish manzilini kiriting');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) fail(400, "Savat bo'sh");
  // Savat sotuvchilar bo'yicha alohida buyurtmalarga bo'linadi
  const bySeller = new Map();
  db.exec('BEGIN');
  try {
    for (const { product_id, qty } of items) {
      const n = Number(qty);
      if (!Number.isInteger(n) || n <= 0) fail(400, "Miqdor noto'g'ri");
      const p = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
      if (!p) fail(404, 'Mahsulot topilmadi');
      if (p.seller_id === user.id) fail(400, "O'z mahsulotingizni sotib ololmaysiz");
      if (p.stock < n) fail(400, `"${p.name}" dan faqat ${p.stock} ta qolgan`);
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(n, p.id);
      if (!bySeller.has(p.seller_id)) bySeller.set(p.seller_id, []);
      bySeller.get(p.seller_id).push({ p, n });
    }
    const ids = [];
    for (const [sellerId, list] of bySeller) {
      const total = list.reduce((s, { p, n }) => s + p.price * n, 0);
      const r = db.prepare('INSERT INTO orders (buyer_id, seller_id, address, total) VALUES (?, ?, ?, ?)')
        .run(user.id, sellerId, address, total);
      for (const { p, n } of list) {
        db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)')
          .run(r.lastInsertRowid, p.id, p.name, p.price, n);
      }
      ids.push(Number(r.lastInsertRowid));
    }
    db.exec('COMMIT');
    return { order_ids: ids };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});
route('GET', '/api/orders', async ({ user }) => {
  requireRole(user);
  return ordersWithItems('o.buyer_id = ?', user.id);
});
route('POST', '/api/orders/:id/cancel', async ({ user, params }) => {
  requireRole(user);
  const o = getOrder(params.id);
  if (o.buyer_id !== user.id) fail(403, 'Bu buyurtma sizniki emas');
  if (!['new', 'ready'].includes(o.status)) fail(400, "Kuryer olgan buyurtmani bekor qilib bo'lmaydi");
  cancelOrder(o.id);
  return { ok: true };
});

// Admin: hamma narsa
route('GET', '/api/admin/stats', async ({ user }) => {
  requireRole(user, 'admin');
  const c = (sql) => db.prepare(sql).get().n;
  return {
    users: c('SELECT COUNT(*) n FROM users'),
    sellers: c("SELECT COUNT(*) n FROM users WHERE role = 'seller'"),
    couriers: c("SELECT COUNT(*) n FROM users WHERE role = 'courier'"),
    products: c('SELECT COUNT(*) n FROM products'),
    orders: c('SELECT COUNT(*) n FROM orders'),
    revenue: db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status = 'delivered'").get().n,
  };
});
route('GET', '/api/admin/users', async ({ user }) => {
  requireRole(user, 'admin');
  return db.prepare('SELECT * FROM users ORDER BY id DESC').all().map(publicUser);
});
route('POST', '/api/admin/users', async ({ user, body }) => {
  requireRole(user, 'admin');
  const phone = normPhone(body.phone);
  if (!phone) fail(400, "Telefon raqam noto'g'ri");
  if (!String(body.name || '').trim()) fail(400, 'Ism kerak');
  if (String(body.password || '').length < 6) fail(400, "Parol kamida 6 belgi");
  const role = body.role || 'user';
  if (!ROLES.includes(role)) fail(400, "Rol noto'g'ri");
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) fail(409, 'Bu raqam band');
  const r = db.prepare('INSERT INTO users (name, phone, password, role) VALUES (?, ?, ?, ?)')
    .run(body.name.trim(), phone, hashPassword(body.password), role);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid));
});
route('PUT', '/api/admin/users/:id', async ({ user, body, params }) => {
  requireRole(user, 'admin');
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id) || fail(404, 'Foydalanuvchi topilmadi');
  const f = {};
  if (body.name !== undefined) { if (!String(body.name).trim()) fail(400, 'Ism kerak'); f.name = String(body.name).trim(); }
  if (body.phone !== undefined) {
    const phone = normPhone(body.phone) || fail(400, "Telefon raqam noto'g'ri");
    const other = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (other && other.id !== target.id) fail(409, 'Bu raqam band');
    f.phone = phone;
  }
  if (body.password) { if (String(body.password).length < 6) fail(400, 'Parol kamida 6 belgi'); f.password = hashPassword(body.password); }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) fail(400, "Rol noto'g'ri");
    if (target.id === user.id && body.role !== 'admin') fail(400, "O'zingizning admin rolingizni olib tashlay olmaysiz");
    f.role = body.role;
  }
  updateRow('users', target.id, f);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id));
});
route('DELETE', '/api/admin/users/:id', async ({ user, params }) => {
  requireRole(user, 'admin');
  if (Number(params.id) === user.id) fail(400, "O'zingizni o'chira olmaysiz");
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  return { deleted: true };
});
route('GET', '/api/admin/products', async ({ user }) => {
  requireRole(user, 'admin');
  return db.prepare('SELECT p.*, u.name AS seller_name FROM products p JOIN users u ON u.id = p.seller_id ORDER BY p.id DESC').all();
});
route('GET', '/api/admin/orders', async ({ user }) => {
  requireRole(user, 'admin');
  return ordersWithItems('1 = 1');
});
route('PUT', '/api/admin/orders/:id', async ({ user, body, params }) => {
  requireRole(user, 'admin');
  const o = getOrder(params.id);
  const statuses = ['new', 'ready', 'accepted', 'delivered', 'cancelled'];
  if (!statuses.includes(body.status)) fail(400, "Holat noto'g'ri");
  if (body.status === 'cancelled' && o.status !== 'cancelled') cancelOrder(o.id);
  else db.prepare('UPDATE orders SET status = ?, courier_id = CASE WHEN ? IN (\'new\',\'ready\') THEN NULL ELSE courier_id END WHERE id = ?')
    .run(body.status, body.status, o.id);
  return { ok: true };
});
route('DELETE', '/api/admin/orders/:id', async ({ user, params }) => {
  requireRole(user, 'admin');
  db.prepare('DELETE FROM orders WHERE id = ?').run(params.id);
  return { deleted: true };
});

// ---------- Server ----------
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  if (url.pathname.startsWith('/api/')) {
    try {
      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, Number(m[i + 1])]));
        const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
        const data = await r.handler({ req, body, params, query: url.searchParams, user: currentUser(req) });
        return send(200, { ok: true, data });
      }
      return send(404, { ok: false, error: 'Topilmadi' });
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { ok: false, error: e.message });
      console.error(e);
      return send(500, { ok: false, error: 'Server xatosi' });
    }
  }
  // Statik fayllar
  let file = path.join(PUBLIC, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// Birinchi admin
const adminPhone = normPhone(ADMIN_PHONE);
if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(adminPhone);
  if (existing) db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
  else db.prepare("INSERT INTO users (name, phone, password, role) VALUES ('Admin', ?, ?, 'admin')").run(adminPhone, hashPassword(ADMIN_PASSWORD));
  console.log(`Admin yaratildi: ${adminPhone} / ${ADMIN_PASSWORD}`);
}

if (require.main === module) {
  server.listen(PORT, () => console.log(`Marketplace: http://localhost:${PORT}`));
}
module.exports = { server, db };
