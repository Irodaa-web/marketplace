// Marketplace — oddiy bir sahifali ilova (framework'siz)
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toLocaleString('uz-UZ').replace(/,/g, ' ') + " so'm";
const ROLE_NAMES = { admin: 'Admin', seller: 'Sotuvchi', courier: 'Kuryer', user: 'Xaridor' };
const STATUS = { new: 'Yangi', ready: 'Kuryer qidirilmoqda', accepted: 'Kuryer yo\'lda', delivered: 'Yetkazildi', cancelled: 'Bekor qilindi' };
const badge = (s) => `<span class="badge s-${s}">${STATUS[s] || s}</span>`;

let me = null;
const store = {
  get token() { try { return localStorage.getItem('mp_token'); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem('mp_token', v) : localStorage.removeItem('mp_token'); } catch {} },
  get cart() { try { return JSON.parse(localStorage.getItem('mp_cart') || '{}'); } catch { return {}; } },
  set cart(v) { try { localStorage.setItem('mp_cart', JSON.stringify(v)); } catch {} },
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: 'Bearer ' + store.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, error: 'Server javob bermadi' }));
  if (res.status === 401 && path !== '/login') { store.token = null; me = null; }
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

let toastTimer;
function toast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2800);
}
// Tugma bosilganda amalni bajarib, sahifani qayta chizadi
async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); render(); } catch (e) { toast(e.message, true); }
}
window.act = act;

// ---------- Navigatsiya ----------
const NAV = {
  user: [['#/', 'Mahsulotlar'], ['#/cart', 'Savat'], ['#/orders', 'Buyurtmalarim']],
  seller: [['#/', 'Katalog'], ['#/seller/products', 'Mahsulotlarim'], ['#/seller/orders', 'Buyurtmalar']],
  courier: [['#/courier', 'Yangi zakazlar'], ['#/courier/mine', 'Mening zakazlarim']],
  admin: [['#/admin', 'Statistika'], ['#/admin/users', 'Foydalanuvchilar'], ['#/admin/products', 'Mahsulotlar'], ['#/admin/orders', 'Buyurtmalar'], ['#/', 'Katalog']],
};
const HOME = { user: '#/', seller: '#/seller/products', courier: '#/courier', admin: '#/admin' };

function renderHeader() {
  const hash = location.hash || '#/';
  document.getElementById('nav').innerHTML = me
    ? NAV[me.role].map(([h, t]) => {
        const count = h === '#/cart' ? Object.values(store.cart).reduce((a, b) => a + b, 0) : 0;
        return `<a href="${h}" class="${hash === h ? 'active' : ''}">${t}${count ? ` (${count})` : ''}</a>`;
      }).join('')
    : '';
  document.getElementById('account').innerHTML = me
    ? `<span>${esc(me.name)} · <b>${ROLE_NAMES[me.role]}</b></span><button class="small" onclick="logout()">Chiqish</button>`
    : '';
}
// Hash o'zgarsa hashchange chizadi, o'zgarmasa o'zimiz chizamiz (ikki marta chizilmasin)
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
window.logout = () => { store.token = null; me = null; go('#/login'); };

async function render() {
  if (store.token && !me) { try { me = await api('/me'); } catch { me = null; } }
  // Rol admin tomonidan o'zgargan bo'lishi mumkin — har safar yangilaymiz
  else if (me) { try { me = await api('/me'); } catch { me = null; } }
  let hash = location.hash || '#/';
  if (!me) hash = '#/login';
  else if (hash === '#/login') { location.hash = HOME[me.role]; return; }
  renderHeader();
  const page = PAGES[hash.split('?')[0]] || PAGES['#/'];
  const allowed = page.roles ? page.roles.includes(me?.role) : true;
  if (!allowed) { location.hash = HOME[me.role]; return; }
  try { await page.render(); } catch (e) { $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', render);

// ---------- Sahifalar ----------
const PAGES = {};

PAGES['#/login'] = { render() {
  let mode = 'login';
  const draw = () => {
    $app.innerHTML = `
      <div class="card auth">
        <div class="tabs">
          <button class="${mode === 'login' ? 'primary' : ''}" id="t-login">Kirish</button>
          <button class="${mode === 'register' ? 'primary' : ''}" id="t-reg">Ro'yxatdan o'tish</button>
        </div>
        <form class="stack" id="f">
          ${mode === 'register' ? '<label>Ism<input name="name" required></label>' : ''}
          <label>Telefon raqam<input name="phone" type="tel" placeholder="+998 90 123 45 67" required></label>
          <label>Parol<input name="password" type="password" minlength="6" required></label>
          <button class="primary">${mode === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"}</button>
        </form>
        ${mode === 'register' ? '<p class="muted">Ro\'yxatdan o\'tgach siz xaridor bo\'lasiz. Sotuvchi yoki kuryer rolini admin beradi.</p>' : ''}
      </div>`;
    document.getElementById('t-login').onclick = () => { mode = 'login'; draw(); };
    document.getElementById('t-reg').onclick = () => { mode = 'register'; draw(); };
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body: data });
        store.token = r.token; me = r.user;
        go(HOME[me.role]);
      } catch (err) { toast(err.message, true); }
    };
  };
  draw();
} };

// Katalog — sotuvchilarning mahsulotlari
PAGES['#/'] = { async render() {
  const q = new URLSearchParams((location.hash.split('?')[1]) || '').get('q') || '';
  const products = await api('/products?q=' + encodeURIComponent(q));
  const canBuy = me.role === 'user';
  $app.innerHTML = `
    <div class="row spread"><h1>Mahsulotlar</h1>
      <form id="s" class="row"><input name="q" placeholder="Qidirish..." value="${esc(q)}" style="width:220px"><button>Qidirish</button></form>
    </div>
    ${products.length ? `<div class="grid">${products.map((p) => `
      <div class="card product">
        ${p.image ? `<img src="${esc(p.image)}" alt="" onerror="this.outerHTML='<div class=ph>📦</div>'">` : '<div class="ph">📦</div>'}
        <h3>${esc(p.name)}</h3>
        <div class="muted">Sotuvchi: ${esc(p.seller_name)}</div>
        ${p.description ? `<div class="muted">${esc(p.description)}</div>` : ''}
        <div class="price">${money(p.price)}</div>
        <div class="row spread"><span class="muted">Qoldiq: ${p.stock}</span>
          ${canBuy ? `<button class="primary small" ${p.stock ? '' : 'disabled'} onclick="addToCart(${p.id}, ${p.stock})">Savatga</button>` : ''}
        </div>
      </div>`).join('')}</div>` : '<div class="empty">Mahsulot topilmadi</div>'}`;
  document.getElementById('s').onsubmit = (e) => { e.preventDefault(); location.hash = '#/?q=' + encodeURIComponent(e.target.q.value); };
} };
window.addToCart = (id, stock) => {
  const c = store.cart; c[id] = Math.min((c[id] || 0) + 1, stock); store.cart = c;
  toast("Savatga qo'shildi"); renderHeader();
};

PAGES['#/cart'] = { roles: ['user'], async render() {
  const cart = store.cart;
  const all = await api('/products');
  const items = all.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: Math.min(cart[p.id], p.stock) }));
  const total = items.reduce((s, p) => s + p.price * p.qty, 0);
  $app.innerHTML = `<h1>Savat</h1>${items.length ? `
    <div class="table-wrap"><table><tr><th>Mahsulot</th><th>Sotuvchi</th><th>Narx</th><th>Soni</th><th>Jami</th><th></th></tr>
      ${items.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.seller_name)}</td><td>${money(p.price)}</td>
        <td><input type="number" min="1" max="${p.stock}" value="${p.qty}" style="width:70px" onchange="setQty(${p.id}, this.value)"></td>
        <td>${money(p.price * p.qty)}</td><td><button class="danger small" onclick="setQty(${p.id}, 0)">O'chirish</button></td></tr>`).join('')}
    </table></div>
    <form class="card stack" id="co" style="margin-top:16px; max-width:460px">
      <div class="price">Jami: ${money(total)}</div>
      <label>Yetkazish manzili<textarea name="address" required></textarea></label>
      <button class="primary">Buyurtma berish</button>
      <span class="muted">Turli sotuvchilarning mahsulotlari alohida buyurtma bo'lib boradi.</span>
    </form>` : '<div class="empty">Savat bo\'sh. <a href="#/">Mahsulotlarga o\'tish</a></div>'}`;
  const f = document.getElementById('co');
  if (f) f.onsubmit = (e) => {
    e.preventDefault();
    act(async () => {
      await api('/orders', { method: 'POST', body: { address: e.target.address.value, items: items.map((p) => ({ product_id: p.id, qty: p.qty })) } });
      store.cart = {}; go('#/orders');
    }, 'Buyurtma qabul qilindi');
  };
} };
window.setQty = (id, v) => { const c = store.cart; const n = Number(v); if (n > 0) c[id] = n; else delete c[id]; store.cart = c; render(); };

function orderCard(o, actions = '') {
  return `<div class="card order">
    <div class="row spread"><b>Buyurtma #${o.id}</b>${badge(o.status)}</div>
    <div class="muted">${esc(o.created_at)} · Xaridor: ${esc(o.buyer_name)} (${esc(o.buyer_phone)}) · Sotuvchi: ${esc(o.seller_name)} (${esc(o.seller_phone)})</div>
    <div class="muted">Manzil: ${esc(o.address)}</div>
    ${o.courier_name ? `<div class="muted">Kuryer: ${esc(o.courier_name)} (${esc(o.courier_phone)})</div>` : ''}
    <ul>${o.items.map((i) => `<li>${esc(i.name)} × ${i.qty} — ${money(i.price * i.qty)}</li>`).join('')}</ul>
    <div class="row spread"><span class="price">${money(o.total)}</span><div class="row">${actions}</div></div>
  </div>`;
}
const ordersList = (list, actionsFn) => list.length
  ? `<div class="orders">${list.map((o) => orderCard(o, actionsFn(o))).join('')}</div>`
  : '<div class="empty">Buyurtmalar yo\'q</div>';

PAGES['#/orders'] = { roles: ['user'], async render() {
  const list = await api('/orders');
  $app.innerHTML = '<h1>Buyurtmalarim</h1>' + ordersList(list, (o) => ['new', 'ready'].includes(o.status)
    ? `<button class="danger small" onclick="act(() => api('/orders/${o.id}/cancel', {method:'POST'}), 'Bekor qilindi')">Bekor qilish</button>` : '');
} };

// ---------- Sotuvchi ----------
function productDialog(p, onSave) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form class="stack" method="dialog">
    <h2 style="margin-top:0">${p ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2>
    <label>Nomi<input name="name" required value="${esc(p?.name)}"></label>
    <label>Tavsif<textarea name="description">${esc(p?.description)}</textarea></label>
    <div class="row"><label style="flex:1">Narx (so'm)<input name="price" type="number" min="1" required value="${p?.price ?? ''}"></label>
    <label style="flex:1">Qoldiq<input name="stock" type="number" min="0" required value="${p?.stock ?? 0}"></label></div>
    <label>Rasm havolasi (ixtiyoriy)<input name="image" type="url" value="${esc(p?.image)}"></label>
    <div class="row spread"><button value="cancel" formnovalidate>Bekor</button><button class="primary" value="ok">Saqlash</button></div>
  </form>`;
  document.body.appendChild(d);
  d.querySelector('form').onsubmit = (e) => {
    if (e.submitter?.value !== 'ok') return;
    const b = Object.fromEntries(new FormData(e.target));
    b.price = Number(b.price); b.stock = Number(b.stock);
    act(() => onSave(b), 'Saqlandi');
  };
  d.onclose = () => d.remove();
  d.showModal();
}

PAGES['#/seller/products'] = { roles: ['seller'], async render() {
  const list = await api('/seller/products');
  window._sp = Object.fromEntries(list.map((p) => [p.id, p]));
  $app.innerHTML = `<div class="row spread"><h1>Mahsulotlarim</h1><button class="primary" onclick="newProduct()">+ Mahsulot qo'shish</button></div>
    ${list.length ? `<div class="table-wrap"><table><tr><th>Nomi</th><th>Narx</th><th>Qoldiq</th><th></th></tr>
      ${list.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="muted">${esc(p.description)}</div></td><td>${money(p.price)}</td><td>${p.stock}</td>
        <td class="row"><button class="small" onclick="editProduct(${p.id})">Tahrirlash</button>
        <button class="danger small" onclick="delProduct(${p.id})">O'chirish</button></td></tr>`).join('')}
    </table></div>` : '<div class="empty">Hali mahsulot yo\'q</div>'}`;
} };
window.newProduct = () => productDialog(null, (b) => api('/seller/products', { method: 'POST', body: b }));
window.editProduct = (id) => productDialog(window._sp[id], (b) => api('/seller/products/' + id, { method: 'PUT', body: b }));
window.delProduct = (id) => confirm("Mahsulot o'chirilsinmi?") && act(() => api('/seller/products/' + id, { method: 'DELETE' }), "O'chirildi");

PAGES['#/seller/orders'] = { roles: ['seller'], async render() {
  const list = await api('/seller/orders');
  $app.innerHTML = '<h1>Kelgan buyurtmalar</h1><p class="muted">Buyurtmani tayyorlab "Kuryer topish" ni bosing — u barcha kuryerlarga ko\'rinadi.</p>' +
    ordersList(list, (o) => {
      let a = '';
      if (o.status === 'new') a += `<button class="primary small" onclick="act(() => api('/seller/orders/${o.id}/find-courier', {method:'POST'}), 'Kuryerlarga yuborildi')">🚚 Kuryer topish</button>`;
      if (['new', 'ready'].includes(o.status)) a += `<button class="danger small" onclick="act(() => api('/seller/orders/${o.id}/cancel', {method:'POST'}), 'Bekor qilindi')">Bekor qilish</button>`;
      return a;
    });
} };

// ---------- Kuryer ----------
PAGES['#/courier'] = { roles: ['courier'], async render() {
  const list = await api('/courier/available');
  $app.innerHTML = '<h1>Yangi zakazlar</h1><p class="muted">Barcha sotuvchilardan kuryer kutayotgan buyurtmalar.</p>' +
    ordersList(list, (o) => `<button class="ok small" onclick="act(() => api('/courier/orders/${o.id}/accept', {method:'POST'}), 'Qabul qilindi')">✓ Qabul qilish</button>`);
} };
PAGES['#/courier/mine'] = { roles: ['courier'], async render() {
  const list = await api('/courier/mine');
  $app.innerHTML = '<h1>Mening zakazlarim</h1>' + ordersList(list, (o) => o.status === 'accepted'
    ? `<button class="ok small" onclick="act(() => api('/courier/orders/${o.id}/delivered', {method:'POST'}), 'Yetkazildi')">Yetkazildi</button>
       <button class="danger small" onclick="act(() => api('/courier/orders/${o.id}/cancel', {method:'POST'}), 'Bekor qilindi, zakaz boshqa kuryerlarga qaytdi')">Bekor qilish</button>` : '');
} };

// ---------- Admin ----------
PAGES['#/admin'] = { roles: ['admin'], async render() {
  const s = await api('/admin/stats');
  const tile = (t, v) => `<div class="card"><span class="muted">${t}</span><b>${v}</b></div>`;
  $app.innerHTML = `<h1>Statistika</h1><div class="stats">
    ${tile('Foydalanuvchilar', s.users)}${tile('Sotuvchilar', s.sellers)}${tile('Kuryerlar', s.couriers)}
    ${tile('Mahsulotlar', s.products)}${tile('Buyurtmalar', s.orders)}${tile('Yetkazilgan savdo', money(s.revenue))}</div>`;
} };

function userDialog(u) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form class="stack" method="dialog">
    <h2 style="margin-top:0">${u ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}</h2>
    <label>Ism<input name="name" required value="${esc(u?.name)}"></label>
    <label>Telefon<input name="phone" type="tel" required value="${esc(u?.phone)}"></label>
    <label>Rol<select name="role">${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${(u?.role || 'user') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>${u ? 'Yangi parol (o\'zgartirmasangiz bo\'sh qoldiring)' : 'Parol'}<input name="password" type="password" ${u ? '' : 'required minlength="6"'}></label>
    <div class="row spread"><button value="cancel" formnovalidate>Bekor</button><button class="primary" value="ok">Saqlash</button></div>
  </form>`;
  document.body.appendChild(d);
  d.querySelector('form').onsubmit = (e) => {
    if (e.submitter?.value !== 'ok') return;
    const b = Object.fromEntries(new FormData(e.target));
    if (u && !b.password) delete b.password;
    act(() => api('/admin/users' + (u ? '/' + u.id : ''), { method: u ? 'PUT' : 'POST', body: b }), 'Saqlandi');
  };
  d.onclose = () => d.remove();
  d.showModal();
}

PAGES['#/admin/users'] = { roles: ['admin'], async render() {
  const list = await api('/admin/users');
  window._au = Object.fromEntries(list.map((u) => [u.id, u]));
  $app.innerHTML = `<div class="row spread"><h1>Foydalanuvchilar</h1><button class="primary" onclick="userDialog()">+ Foydalanuvchi qo'shish</button></div>
    <div class="table-wrap"><table><tr><th>Ism</th><th>Telefon</th><th>Rol</th><th>Ro'yxatdan o'tgan</th><th></th></tr>
    ${list.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.phone)}</td>
      <td><select onchange="setRole(${u.id}, this.value)" ${u.id === me.id ? 'disabled' : ''}>
        ${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="muted">${esc(u.created_at)}</td>
      <td class="row"><button class="small" onclick="userDialog(window._au[${u.id}])">Tahrirlash</button>
      ${u.id === me.id ? '' : `<button class="danger small" onclick="delUser(${u.id})">O'chirish</button>`}</td></tr>`).join('')}
    </table></div>`;
} };
window.userDialog = userDialog;
window.setRole = (id, role) => act(() => api('/admin/users/' + id, { method: 'PUT', body: { role } }), "Rol o'zgartirildi");
window.delUser = (id) => confirm("Foydalanuvchi o'chirilsinmi? Uning mahsulot va buyurtmalari ham o'chadi.") && act(() => api('/admin/users/' + id, { method: 'DELETE' }), "O'chirildi");

PAGES['#/admin/products'] = { roles: ['admin'], async render() {
  const list = await api('/admin/products');
  window._sp = Object.fromEntries(list.map((p) => [p.id, p]));
  $app.innerHTML = `<h1>Barcha mahsulotlar</h1>${list.length ? `<div class="table-wrap"><table><tr><th>Nomi</th><th>Sotuvchi</th><th>Narx</th><th>Qoldiq</th><th></th></tr>
    ${list.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.seller_name)}</td><td>${money(p.price)}</td><td>${p.stock}</td>
      <td class="row"><button class="small" onclick="editProduct(${p.id})">Tahrirlash</button><button class="danger small" onclick="delProduct(${p.id})">O'chirish</button></td></tr>`).join('')}
    </table></div>` : '<div class="empty">Mahsulot yo\'q</div>'}`;
} };

PAGES['#/admin/orders'] = { roles: ['admin'], async render() {
  const list = await api('/admin/orders');
  $app.innerHTML = '<h1>Barcha buyurtmalar</h1>' + ordersList(list, (o) => `
    <select onchange="act(() => api('/admin/orders/${o.id}', {method:'PUT', body:{status:this.value}}), 'Holat o\\'zgardi')">
      ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button class="danger small" onclick="confirm('Buyurtma o\\'chirilsinmi?') && act(() => api('/admin/orders/${o.id}', {method:'DELETE'}), 'O\\'chirildi')">O'chirish</button>`);
} };

render();
