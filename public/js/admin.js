// Admin paneli: hamma narsani boshqaradi
const { api, esc, money, badge, when, thumb, run, modal, ROLE_NAMES, STATUS } = MP;
const $main = document.getElementById('main');
let me;
const state = { userQ: '', userRole: '', orderStatus: '' };
const ROLE_COLORS = { admin: '#7c3aed', seller: '#2563eb', courier: '#ea580c', user: '#059669' };

const head = (title, sub, extra = '') => `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div>${extra}</div>`;

const views = {
  async dashboard() {
    const [s, users, orders] = await Promise.all([api('/admin/stats'), api('/admin/users'), api('/admin/orders')]);
    const byRole = Object.fromEntries(Object.keys(ROLE_NAMES).map((r) => [r, users.filter((u) => u.role === r).length]));
    const tile = (ico, label, val, c) => `<div class="card stat"><div class="ico" style="--c:${c}">${ico}</div><div><span>${label}</span><b>${val}</b></div></div>`;
    $main.innerHTML = head('Boshqaruv', `Xush kelibsiz, ${esc(me.name)}. Platformadagi umumiy holat.`) + `
      <div class="stats">
        ${tile('👥', 'Foydalanuvchilar', s.users, '#7c3aed')}
        ${tile('🏪', 'Sotuvchilar', s.sellers, '#2563eb')}
        ${tile('🚚', 'Kuryerlar', s.couriers, '#ea580c')}
        ${tile('📦', 'Mahsulotlar', s.products, '#db2777')}
        ${tile('🧾', 'Buyurtmalar', s.orders, '#0284c7')}
        ${tile('💰', 'Yetkazilgan savdo', money(s.revenue), '#059669')}
      </div>
      <div class="grid-2">
        <div class="card pad">
          <h2>Rollar bo'yicha</h2>
          <div class="roles-bar">${Object.entries(byRole).map(([r, n]) => n ? `<div style="flex:${n};background:${ROLE_COLORS[r]}" title="${ROLE_NAMES[r]}: ${n}"></div>` : '').join('')}</div>
          <div class="legend">${Object.entries(byRole).map(([r, n]) => `<span><i style="background:${ROLE_COLORS[r]}"></i>${ROLE_NAMES[r]}: <b>${n}</b></span>`).join('')}</div>
          <h2 style="margin-top:24px">Buyurtma holatlari</h2>
          <div style="display:grid;gap:10px;margin-top:12px">${Object.keys(STATUS).map((k) => {
            const n = orders.filter((o) => o.status === k).length;
            return `<div style="display:flex;justify-content:space-between;align-items:center">${badge(k)}<b>${n}</b></div>`;
          }).join('')}</div>
        </div>
        <div class="card">
          <div class="section-title" style="margin:0;padding:18px 20px 6px"><h2>So'nggi buyurtmalar</h2><a href="#orders" class="small">Barchasi →</a></div>
          ${orderTable(orders.slice(0, 6), false)}
        </div>
      </div>`;
  },

  async users() {
    const all = await api('/admin/users');
    const q = state.userQ.toLowerCase();
    const list = all.filter((u) => (!state.userRole || u.role === state.userRole) && (!q || u.name.toLowerCase().includes(q) || u.phone.includes(q)));
    $main.innerHTML = head('Foydalanuvchilar', `Jami ${all.length} ta. Rolni jadvalning o'zida o'zgartirish mumkin.`,
      `<button class="btn primary" data-act="user-new">+ Foydalanuvchi qo'shish</button>`) + `
      <div class="toolbar">
        <input type="search" id="uq" placeholder="Ism yoki telefon bo'yicha qidirish" value="${esc(state.userQ)}">
        <div class="segments">${[['', 'Hammasi'], ...Object.entries(ROLE_NAMES)].map(([r, t]) =>
          `<button class="${state.userRole === r ? 'active' : ''}" data-act="user-filter" data-role="${r}">${t}<span class="count">${r ? all.filter((u) => u.role === r).length : all.length}</span></button>`).join('')}</div>
      </div>
      <div class="card table-wrap">${list.length ? `<table>
        <thead><tr><th>Foydalanuvchi</th><th>Telefon</th><th>Rol</th><th>Ro'yxatdan o'tgan</th><th></th></tr></thead>
        <tbody>${list.map((u) => `<tr>
          <td><div class="cell-main"><div class="avatar" style="background:${ROLE_COLORS[u.role]}22;color:${ROLE_COLORS[u.role]}">${MP.initials(u.name)}</div><b>${esc(u.name)}</b>${u.id === me.id ? '<span class="pill">Siz</span>' : ''}</div></td>
          <td>${MP.phone(u.phone)}</td>
          <td><select class="role-select r-${u.role}" data-uid="${u.id}" ${u.id === me.id ? 'disabled' : ''}>
            ${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
          <td class="muted">${when(u.created_at)}</td>
          <td><div class="actions"><button class="btn sm" data-act="user-edit" data-id="${u.id}">Tahrirlash</button>
            ${u.id === me.id ? '' : `<button class="btn sm danger" data-act="user-del" data-id="${u.id}">O'chirish</button>`}</div></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty"><span class="big">🔍</span>Hech kim topilmadi</div>'}</div>`;
    window._users = Object.fromEntries(all.map((u) => [u.id, u]));
    const inp = document.getElementById('uq');
    inp.oninput = () => { state.userQ = inp.value; clearTimeout(inp._t); inp._t = setTimeout(async () => { await views.users(); const i = document.getElementById('uq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    $main.querySelectorAll('.role-select').forEach((s) => s.onchange = () =>
      run(() => api('/admin/users/' + s.dataset.uid, { method: 'PUT', body: { role: s.value } }), `Rol o'zgartirildi: ${ROLE_NAMES[s.value]}`, views.users));
  },

  async products() {
    const list = await api('/admin/products');
    window._products = Object.fromEntries(list.map((p) => [p.id, p]));
    $main.innerHTML = head('Mahsulotlar', `Barcha sotuvchilarning ${list.length} ta mahsuloti`) + `
      <div class="card table-wrap">${list.length ? `<table>
        <thead><tr><th>Mahsulot</th><th>Sotuvchi</th><th>Narx</th><th>Qoldiq</th><th></th></tr></thead>
        <tbody>${list.map((p) => `<tr>
          <td><div class="cell-main">${thumb(p, 'thumb-sm')}<div><b>${esc(p.name)}</b><div class="muted small">${esc(p.description)}</div></div></div></td>
          <td>${esc(p.seller_name)}</td><td><b>${money(p.price)}</b></td>
          <td>${p.stock ? p.stock : '<span class="badge st-cancelled">Tugagan</span>'}</td>
          <td><div class="actions"><button class="btn sm" data-act="prod-edit" data-id="${p.id}">Tahrirlash</button><button class="btn sm danger" data-act="prod-del" data-id="${p.id}">O'chirish</button></div></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty"><span class="big">📦</span>Mahsulot yo\'q</div>'}</div>`;
  },

  async orders() {
    const all = await api('/admin/orders');
    const list = all.filter((o) => !state.orderStatus || o.status === state.orderStatus);
    $main.innerHTML = head('Buyurtmalar', `Jami ${all.length} ta buyurtma`) + `
      <div class="toolbar"><div class="segments">${[['', 'Hammasi'], ...Object.entries(STATUS)].map(([k, t]) =>
        `<button class="${state.orderStatus === k ? 'active' : ''}" data-act="order-filter" data-status="${k}">${t}<span class="count">${k ? all.filter((o) => o.status === k).length : all.length}</span></button>`).join('')}</div></div>
      <div class="card">${orderTable(list, true)}</div>`;
    $main.querySelectorAll('.status-select').forEach((s) => s.onchange = () =>
      run(() => api('/admin/orders/' + s.dataset.oid, { method: 'PUT', body: { status: s.value } }), "Holat o'zgartirildi", views.orders));
  },
};

function orderTable(list, editable) {
  if (!list.length) return '<div class="empty"><span class="big">🧾</span>Buyurtma yo\'q</div>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Xaridor</th><th>Sotuvchi</th>${editable ? '<th>Kuryer</th>' : ''}<th>Summa</th><th>Holat</th>${editable ? '<th></th>' : ''}</tr></thead>
    <tbody>${list.map((o) => `<tr>
      <td><b>#${o.id}</b><div class="muted small">${when(o.created_at)}</div></td>
      <td>${esc(o.buyer_name)}${editable ? `<div class="muted small">${esc(o.address)}</div>` : ''}</td>
      <td>${esc(o.seller_name)}</td>
      ${editable ? `<td>${o.courier_name ? esc(o.courier_name) : '<span class="muted">—</span>'}</td>` : ''}
      <td class="nowrap"><b>${money(o.total)}</b>${editable ? `<div class="muted small">${o.items.length} xil mahsulot</div>` : ''}</td>
      <td>${editable ? `<select class="role-select status-select" data-oid="${o.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : badge(o.status)}</td>
      ${editable ? `<td><div class="actions"><button class="btn sm danger" data-act="order-del" data-id="${o.id}">O'chirish</button></div></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}

function userForm(u) {
  modal({
    title: u ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi',
    body: `<label class="field">Ism<input name="name" required value="${esc(u?.name)}"></label>
      <label class="field">Telefon<input name="phone" type="tel" required value="${esc(u?.phone)}" placeholder="+998 90 123 45 67"></label>
      <label class="field">Rol<select name="role" ${u?.id === me.id ? 'disabled' : ''}>${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${(u?.role || 'user') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">${u ? "Yangi parol (o'zgartirmasangiz bo'sh qoldiring)" : 'Parol'}<input name="password" type="password" ${u ? '' : 'required minlength="6"'}></label>`,
    onSubmit: (b) => {
      if (u && !b.password) delete b.password;
      return run(() => api('/admin/users' + (u ? '/' + u.id : ''), { method: u ? 'PUT' : 'POST', body: b }), 'Saqlandi', views.users);
    },
  });
}
function productForm(p) {
  modal({
    title: 'Mahsulotni tahrirlash',
    body: `<label class="field">Nomi<input name="name" required value="${esc(p.name)}"></label>
      <label class="field">Tavsif<textarea name="description">${esc(p.description)}</textarea></label>
      <div class="two"><label class="field">Narx (so'm)<input name="price" type="number" min="1" required value="${p.price}"></label>
      <label class="field">Qoldiq<input name="stock" type="number" min="0" required value="${p.stock}"></label></div>`,
    onSubmit: (b) => run(() => api('/seller/products/' + p.id, { method: 'PUT', body: { ...b, price: +b.price, stock: +b.stock } }), 'Saqlandi', views.products),
  });
}

MP.actions({
  logout: () => MP.logout(),
  'user-new': () => userForm(null),
  'user-edit': (d) => userForm(window._users[d.id]),
  'user-del': (d) => MP.confirmBox("Foydalanuvchi o'chirilsinmi? Uning mahsulot va buyurtmalari ham o'chadi.") && run(() => api('/admin/users/' + d.id, { method: 'DELETE' }), "O'chirildi", views.users),
  'user-filter': (d) => { state.userRole = d.role; views.users(); },
  'prod-edit': (d) => productForm(window._products[d.id]),
  'prod-del': (d) => MP.confirmBox("Mahsulot o'chirilsinmi?") && run(() => api('/seller/products/' + d.id, { method: 'DELETE' }), "O'chirildi", views.products),
  'order-filter': (d) => { state.orderStatus = d.status; views.orders(); },
  'order-del': (d) => MP.confirmBox("Buyurtma o'chirilsinmi?") && run(() => api('/admin/orders/' + d.id, { method: 'DELETE' }), "O'chirildi", views.orders),
});

(async () => {
  me = await MP.guard('admin');
  document.getElementById('me-av').textContent = MP.initials(me.name);
  document.getElementById('me-name').textContent = me.name;
  document.getElementById('me-phone').textContent = MP.phone(me.phone);
  MP.sections((id) => (views[id] || views.dashboard)().catch((e) => MP.toast(e.message, 'err')), 'dashboard');
})();
