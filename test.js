// Asosiy oqimni tekshiradi: ro'yxat -> rol berish -> mahsulot -> buyurtma -> kuryer
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
process.env.DEMO = '0';
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-')), 't.db');
const { server } = require('./server');

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (p, { method = 'GET', body, token } = {}) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body && JSON.stringify(body) });
    return r.json();
  };
  try {
    const admin = (await call('/login', { method: 'POST', body: { phone: '+998900000000', password: 'admin123' } })).data;
    assert.equal(admin.user.role, 'admin');
    const reg = (phone, name) => call('/register', { method: 'POST', body: { phone, name, password: 'secret1' } }).then((r) => r.data);
    const seller = await reg('90 111 11 11', 'Ali');
    const courier = await reg('+998 90 222 22 22', 'Vali');
    const buyer = await reg('998902223333', 'Gulnora');
    assert.equal(seller.user.role, 'user', "yangi foydalanuvchi 'user' bo'ladi");
    // Rol berilmaguncha sotuvchi mahsulot qo'sha olmaydi
    assert.equal((await call('/seller/products', { method: 'POST', token: seller.token, body: { name: 'X', price: 1 } })).ok, false);
    await call(`/admin/users/${seller.user.id}`, { method: 'PUT', token: admin.token, body: { role: 'seller' } });
    await call(`/admin/users/${courier.user.id}`, { method: 'PUT', token: admin.token, body: { role: 'courier' } });
    assert.equal((await call('/me', { token: seller.token })).data.role, 'seller');

    const p = (await call('/seller/products', { method: 'POST', token: seller.token, body: { name: 'Olma', price: 5000, stock: 10 } })).data;
    await call(`/seller/products/${p.id}`, { method: 'PUT', token: seller.token, body: { price: 6000 } });
    assert.equal((await call('/products')).data[0].price, 6000);

    const o = (await call('/orders', { method: 'POST', token: buyer.token, body: { address: 'Toshkent', items: [{ product_id: p.id, qty: 3 }] } })).data;
    const oid = o.order_ids[0];
    assert.equal((await call('/products')).data[0].stock, 7);
    assert.equal((await call('/courier/available', { token: courier.token })).data.length, 0, 'tayyor emas');
    await call(`/seller/orders/${oid}/find-courier`, { method: 'POST', token: seller.token });
    assert.equal((await call('/courier/available', { token: courier.token })).data.length, 1);
    assert.ok((await call(`/courier/orders/${oid}/accept`, { method: 'POST', token: courier.token })).ok);
    assert.ok((await call(`/courier/orders/${oid}/cancel`, { method: 'POST', token: courier.token })).ok);
    assert.equal((await call('/courier/available', { token: courier.token })).data.length, 1, 'bekor qilingach qaytadi');
    await call(`/courier/orders/${oid}/accept`, { method: 'POST', token: courier.token });
    await call(`/courier/orders/${oid}/delivered`, { method: 'POST', token: courier.token });
    assert.equal((await call('/orders', { token: buyer.token })).data[0].status, 'delivered');
    assert.equal((await call('/admin/stats', { token: admin.token })).data.revenue, 18000);
    assert.equal((await call('/admin/users', { token: buyer.token })).ok, false);
    await call(`/seller/products/${p.id}`, { method: 'DELETE', token: seller.token });
    assert.equal((await call('/products')).data.length, 0);
    console.log('✓ Barcha tekshiruvlar o\'tdi');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close();
});
