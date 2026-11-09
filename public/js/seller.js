// Sotuvchi paneli: mahsulotlar CRUD, buyurtmalar, kuryer topish
const { api, esc, money, badge, when, thumb, run, modal, STATUS } = MP;
const $main = document.getElementById('main');
let me;
const state = { orderStatus: 'new' };
const head = (title, sub, extra = '') => `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div>${extra}</div>`;

async function updateBadge(orders) {
  orders = orders || await api('/seller/orders');
  const n = orders.filter((o) => o.status === 'new').length;
  const el = document.getElementById('new-count');
  el.hidden = !n; el.textContent = n;
  return orders;
}

const views = {
  async home() {
    const [products, orders] = await Promise.all([api('/seller/products'), api('/seller/orders')]);
    updateBadge(orders);
    const cnt = (s) => orders.filter((o) => o.status === s).length;
    const revenue = orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
    const low = products.filter((p) => p.stock <= 5);
    const tile = (ico, label, val, c) => `<div class="card stat"><div class="ico" style="--c:${c}">${ico}</div><div><span>${label}</span><b>${val}</b></div></div>`;
    const fresh = orders.filter((o) => o.status === 'new');
    $main.innerHTML = head(`Salom, ${esc(me.name)} 👋`, "Do'koningizdagi bugungi holat") + `
      <div class="stats">
        ${tile('📦', 'Mahsulotlar', products.length, '#2563eb')}
        ${tile('🆕', 'Yangi buyurtmalar', cnt('new'), '#0284c7')}
        ${tile('⏳', 'Kuryer kutilmoqda', cnt('ready'), '#d97706')}
        ${tile('🚚', "Yo'lda", cnt('accepted'), '#7c3aed')}
        ${tile('💰', 'Daromad', money(revenue), '#059669')}
      </div>
      <div class="section-title"><h2>Kuryer topish kerak bo'lgan buyurtmalar</h2><a href="#orders" class="small">Barcha buyurtmalar →</a></div>
      ${fresh.length ? `<div class="orders">${fresh.slice(0, 3).map(orderCard).join('')}</div>` : '<div class="card empty"><span class="big">✅</span>Yangi buyurtma yo\'q</div>'}
      ${low.length ? `<div class="section-title"><h2>Qoldig'i kam mahsulotlar</h2><a href="#products" class="small">Mahsulotlar →</a></div>
        <div class="card table-wrap"><table><tbody>${low.map((p) => `<tr><td><div class="cell-main">${thumb(p, 'thumb-sm')}<b>${esc(p.name)}</b></div></td>
          <td>${p.stock ? `${p.stock} ta qoldi` : '<span class="badge st-cancelled">Tugagan</span>'}</td>
          <td><div class="actions"><button class="btn sm" data-act="edit" data-id="${p.id}">To'ldirish</button></div></td></tr>`).join('')}</tbody></table></div>` : ''}`;
    window._p = Object.fromEntries(products.map((p) => [p.id, p]));
  },

  async products() {
    const list = await api('/seller/products');
    window._p = Object.fromEntries(list.map((p) => [p.id, p]));
    $main.innerHTML = head('Mahsulotlarim', `${list.length} ta mahsulot — xaridorlar katalogda ko'radi`, '<button class="btn primary" data-act="new">+ Mahsulot qo\'shish</button>') +
      (list.length ? `<div class="prod-grid">${list.map((p) => `
        <div class="card prod">
          ${thumb(p)}
          <h3>${esc(p.name)}</h3>
          <div class="muted small">${esc(p.description) || '&nbsp;'}</div>
          <div class="row"><span class="price">${money(p.price)}</span>${p.stock ? `<span class="pill">${p.stock} ta</span>` : '<span class="badge st-cancelled">Tugagan</span>'}</div>
          <div class="acts"><button class="btn sm" data-act="edit" data-id="${p.id}">✏️ Tahrirlash</button><button class="btn sm danger" data-act="del" data-id="${p.id}">O'chirish</button></div>
        </div>`).join('')}</div>`
      : `<div class="card empty"><span class="big">📦</span>Hali mahsulot yo'q<br><br><button class="btn primary" data-act="new">Birinchi mahsulotni qo'shish</button></div>`);
  },

  async orders() {
    const all = await updateBadge();
    const list = all.filter((o) => !state.orderStatus || o.status === state.orderStatus);
    $main.innerHTML = head('Buyurtmalar', 'Buyurtmani tayyorlang va kuryer toping') + `
      <div class="callout">🚚 <span><b>Kuryer topish</b> tugmasini bossangiz, buyurtma barcha kuryerlarga ko'rinadi. Birinchi qabul qilgan kuryer olib ketadi.</span></div>
      <div class="toolbar"><div class="segments">${[['new', 'Yangi'], ['ready', 'Kuryer kutilmoqda'], ['accepted', "Yo'lda"], ['delivered', 'Yetkazilgan'], ['cancelled', 'Bekor'], ['', 'Hammasi']].map(([k, t]) =>
        `<button class="${state.orderStatus === k ? 'active' : ''}" data-act="filter" data-status="${k}">${t}<span class="count">${k ? all.filter((o) => o.status === k).length : all.length}</span></button>`).join('')}</div></div>
      ${list.length ? `<div class="orders">${list.map(orderCard).join('')}</div>` : '<div class="card empty"><span class="big">🧾</span>Bu bo\'limda buyurtma yo\'q</div>'}`;
  },
};

function orderCard(o) {
  let acts = '';
  if (o.status === 'new') acts = `<button class="btn sm danger" data-act="cancel" data-id="${o.id}">Bekor qilish</button><button class="btn primary" data-act="courier" data-id="${o.id}">🚚 Kuryer topish</button>`;
  else if (o.status === 'ready') acts = `<span class="muted small">Kuryerlar ko'rmoqda…</span><button class="btn sm danger" data-act="cancel" data-id="${o.id}">Bekor qilish</button>`;
  return `<div class="card order">
    <div class="top"><div><b>Buyurtma #${o.id}</b> <span class="muted small">· ${when(o.created_at)}</span></div>${badge(o.status)}</div>
    <div class="meta">
      <div><span>Xaridor</span>${esc(o.buyer_name)} · ${MP.phone(o.buyer_phone)}</div>
      <div><span>Manzil</span>${esc(o.address)}</div>
      ${o.courier_name ? `<div><span>Kuryer</span>${esc(o.courier_name)} · ${MP.phone(o.courier_phone)}</div>` : ''}
    </div>
    <div class="items">${o.items.map((i) => `<div><span>${esc(i.name)} × ${i.qty}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}</div>
    <div class="bottom"><span class="total">${money(o.total)}</span><div style="display:flex;gap:8px;align-items:center">${acts}</div></div>
  </div>`;
}

function productForm(p) {
  modal({
    title: p ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot',
    submit: p ? 'Saqlash' : "Qo'shish",
    body: `<label class="field">Nomi<input name="name" required value="${esc(p?.name)}" placeholder="Masalan: Olma (1 kg)"></label>
      <label class="field">Tavsif<textarea name="description" placeholder="Qisqacha ma'lumot">${esc(p?.description)}</textarea></label>
      <div class="two"><label class="field">Narx (so'm)<input name="price" type="number" min="1" required value="${p?.price ?? ''}"></label>
      <label class="field">Qoldiq (dona)<input name="stock" type="number" min="0" required value="${p?.stock ?? 1}"></label></div>
      <label class="field">Rasm havolasi (ixtiyoriy)<input name="image" type="url" value="${esc(p?.image)}" placeholder="https://..."></label>`,
    onSubmit: (b) => run(() => api('/seller/products' + (p ? '/' + p.id : ''), { method: p ? 'PUT' : 'POST', body: { ...b, price: +b.price, stock: +b.stock } }),
      p ? 'Saqlandi' : "Mahsulot qo'shildi", () => render()),
  });
}

let render = () => {};
MP.actions({
  logout: () => MP.logout(),
  new: () => productForm(null),
  edit: (d) => productForm(window._p[d.id]),
  del: (d) => MP.confirmBox("Mahsulot o'chirilsinmi?") && run(() => api('/seller/products/' + d.id, { method: 'DELETE' }), "O'chirildi", () => render()),
  filter: (d) => { state.orderStatus = d.status; views.orders(); },
  courier: (d) => run(() => api(`/seller/orders/${d.id}/find-courier`, { method: 'POST' }), 'Buyurtma kuryerlarga yuborildi', () => render()),
  cancel: (d) => MP.confirmBox('Buyurtma bekor qilinsinmi?') && run(() => api(`/seller/orders/${d.id}/cancel`, { method: 'POST' }), 'Bekor qilindi', () => render()),
});

(async () => {
  me = await MP.guard('seller');
  document.getElementById('me-av').textContent = MP.initials(me.name);
  document.getElementById('me-name').textContent = me.name;
  document.getElementById('me-phone').textContent = MP.phone(me.phone);
  document.getElementById('shop-name').textContent = me.name;
  MP.sections((id) => {
    render = () => (views[id] || views.home)().catch((e) => MP.toast(e.message, 'err'));
    render();
  }, 'home');
})();
