// Demo rejim: har bir rol uchun bir bosishda kirish
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-')), 'd.db');
const { server } = require('./server');

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (p, { method = 'GET', body, token } = {}) => (await fetch(base + p, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body && JSON.stringify(body),
  })).json();
  try {
    const info = (await call('/demo')).data;
    assert.ok(info.enabled);
    assert.deepEqual(info.accounts.map((a) => a.role), ['admin', 'seller', 'courier', 'user']);
    for (const { role } of info.accounts) {
      const r = (await call('/demo/login', { method: 'POST', body: { role } })).data;
      assert.equal(r.user.role, role);
    }
    const courier = (await call('/demo/login', { method: 'POST', body: { role: 'courier' } })).data;
    assert.equal((await call('/courier/available', { token: courier.token })).data.length, 2);
    assert.equal((await call('/products')).data.length, 6);
    // Demo akkauntga oddiy parol bilan ham kirsa bo'ladi
    assert.ok((await call('/login', { method: 'POST', body: { phone: '901111111', password: info.password } })).ok);
    console.log("✓ Demo tekshiruvlari o'tdi");
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close();
});
