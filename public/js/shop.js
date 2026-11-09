// Xaridor do'koni: sotuvchilarning mahsulotlari, savat, buyurtmalar
const { api, esc, money, badge, when, thumb, run } = MP;
const $main = document.getElementById('main');
const $drawer = document.getElementById('drawer');
let me, products = [], q = '', seller = '';

const cart = {
  get() { try { return JSON.parse(localStorage.getItem('mp_cart') || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem('mp_cart', JSON.stringify(v)); } catch {} updateCount(); },
};
function updateCount() {
  const n = Object.values(cart.get()).reduce((a, b) => a + b, 0);
  const el = document.getElementById('cart-n'); el.hidden = !n; el.textContent = n;
}

const views = {
  async shop() {
    products = await api('/products?q=' + encodeURIComponent(q));
    const sellers = [...new Map(products.map((p) => [p.seller_id, p.seller_name])).entries()];
    const list = products.filter((p) => !seller || String(p.seller_id) === seller);
    const c = cart.get();
    $main.innerHTML = `
      ${q ? '' : `<section class="banner"><div><h1>Salom, ${esc(me.name)}!</h1><p>Sotuvchilardan to'g'ridan-to'g'ri xarid qiling — kuryer eshigingizgacha olib keladi.</p></div><div class="big">🛍️</div></section>`}
      <div class="chips">
        <button class="chip ${seller ? '' : 'active'}" data-act="seller" data-id="">Barcha do'konlar</button>
        ${sellers.map(([id, name]) => `<button class="chip ${seller === String(id) ? 'active' : ''}" data-act="seller" data-id="${id}">🏪 ${esc(name)}</button>`).join('')}
      </div>
      ${q ? `<h2 style="margin-bottom:14px">"${esc(q)}" bo'yicha ${list.length} ta natija</h2>` : ''}
      ${list.length ? `<div class="grid">${list.map((p) => `
        <div class="card p">
          ${thumb(p)}
          <div class="seller">🏪 ${esc(p.seller_name)}</div>
          <h3>${esc(p.name)}</h3>
          <div class="desc">${esc(p.description)}</div>
          <div class="foot">
            <div><div class="price">${money(p.price)}</div><div class="stock">${p.stock ? (c[p.id] ? `<span class="in-cart">Savatda: ${c[p.id]} ta</span>` : `${p.stock} ta mavjud`) : 'Tugagan'}</div></div>
            <button class="btn primary add" data-act="add" data-id="${p.id}" ${p.stock && (c[p.id] || 0) < p.stock ? '' : 'disabled'} title="Savatga qo'shish">+</button>
          </div>
        </div>`).join('')}</div>` : '<div class="card empty"><span class="big">🔍</span>Mahsulot topilmadi</div>'}`;
  },

  async orders() {
    const list = await api('/orders');
    const STEPS = [['new', 'Qabul qilindi'], ['ready', 'Tayyorlandi'], ['accepted', "Kuryer yo'lda"], ['delivered', 'Yetkazildi']];
    $main.innerHTML = `<div style="margin-bottom:20px"><h1>Buyurtmalarim</h1><p class="muted" style="margin:4px 0 0">Har bir sotuvchidan alohida buyurtma keladi</p></div>` +
      (list.length ? `<div class="orders">${list.map((o) => {
        const idx = STEPS.findIndex(([k]) => k === o.status);
        return `<div class="card order">
          <div class="hd"><div><b>Buyurtma #${o.id}</b> <span class="muted small">· ${when(o.created_at)} · 🏪 ${esc(o.seller_name)}</span></div>${badge(o.status)}</div>
          ${o.status === 'cancelled' ? '' : `<div class="steps">${STEPS.map(([, t], i) => `<div class="step ${i <= idx ? 'done' : ''}">${t}</div>`).join('')}</div>`}
          <div class="it">${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(' · ')}</div>
          ${o.courier_name ? `<div class="small">🚚 Kuryer: <b>${esc(o.courier_name)}</b> · <a href="tel:${esc(o.courier_phone)}">${MP.phone(o.courier_phone)}</a></div>` : ''}
          <div class="ft"><span class="muted small">📍 ${esc(o.address)}</span><div style="display:flex;gap:10px;align-items:center"><b style="font-size:17px">${money(o.total)}</b>
            ${['new', 'ready'].includes(o.status) ? `<button class="btn sm danger" data-act="cancel" data-id="${o.id}">Bekor qilish</button>` : ''}</div></div>
        </div>`;
      }).join('')}</div>` : `<div class="card empty"><span class="big">🧾</span>Hali buyurtma bermagansiz<br><br><a class="btn primary" href="#shop">Xaridni boshlash</a></div>`);
  },
};

async function openCart() {
  const all = await api('/products');
  const c = cart.get();
  const lines = all.filter((p) => c[p.id]).map((p) => ({ ...p, qty: Math.min(c[p.id], p.stock) })).filter((p) => p.qty > 0);
  const total = lines.reduce((s, p) => s + p.price * p.qty, 0);
  const shops = new Set(lines.map((p) => p.seller_id)).size;
  $drawer.hidden = false;
  $drawer.innerHTML = `<div class="panel">
    <header><h2>Savat</h2><button class="icon-btn" data-act="close-cart">✕</button></header>
    <div class="body">${lines.length ? lines.map((p) => `
      <div class="line">${thumb(p, 'thumb-sm')}
        <div class="info"><b>${esc(p.name)}</b><span class="muted small">${esc(p.seller_name)} · ${money(p.price)}</span></div>
        <div class="qty"><button data-act="qty" data-id="${p.id}" data-d="-1">−</button><span>${p.qty}</span><button data-act="qty" data-id="${p.id}" data-d="1" ${p.qty >= p.stock ? 'disabled' : ''}>+</button></div>
      </div>`).join('') : '<div class="empty"><span class="big">🛒</span>Savat bo\'sh</div>'}
    </div>
    ${lines.length ? `<footer>
      ${shops > 1 ? `<div class="small muted">ℹ️ ${shops} ta do'kondan — ${shops} ta alohida buyurtma bo'ladi</div>` : ''}
      <div class="sum"><span>Jami</span><span>${money(total)}</span></div>
      <form id="checkout" style="display:grid;gap:10px">
        <label class="field">Yetkazish manzili<textarea name="address" required placeholder="Shahar, ko'cha, uy" style="min-height:64px"></textarea></label>
        <button class="btn primary lg block">Buyurtma berish</button>
      </form>
    </footer>` : ''}
  </div>`;
  const f = document.getElementById('checkout');
  if (f) f.onsubmit = (e) => {
    e.preventDefault();
    run(() => api('/orders', { method: 'POST', body: { address: e.target.address.value, items: lines.map((p) => ({ product_id: p.id, qty: p.qty })) } }),
      'Buyurtma qabul qilindi! 🎉', () => { cart.set({}); $drawer.hidden = true; location.hash === '#orders' ? views.orders() : (location.hash = '#orders'); });
  };
}

MP.actions({
  logout: () => MP.logout(),
  seller: (d) => { seller = d.id; views.shop(); },
  add: (d) => {
    const p = products.find((x) => x.id === +d.id); const c = cart.get();
    c[d.id] = Math.min((c[d.id] || 0) + 1, p.stock); cart.set(c);
    MP.toast(`"${p.name}" savatga qo'shildi`); views.shop();
  },
  'open-cart': openCart,
  'close-cart': () => { $drawer.hidden = true; if ((location.hash || '#shop') === '#shop') views.shop(); },
  qty: (d) => { const c = cart.get(); c[d.id] = (c[d.id] || 0) + Number(d.d); if (c[d.id] <= 0) delete c[d.id]; cart.set(c); openCart(); },
  cancel: (d) => MP.confirmBox('Buyurtma bekor qilinsinmi?') && run(() => api(`/orders/${d.id}/cancel`, { method: 'POST' }), 'Bekor qilindi', views.orders),
});
$drawer.addEventListener('click', (e) => { if (e.target === $drawer) { $drawer.hidden = true; } });
document.getElementById('search').onsubmit = (e) => { e.preventDefault(); q = e.target.q.value.trim(); location.hash === '#shop' || !location.hash ? views.shop() : (location.hash = '#shop'); };

(async () => {
  me = await MP.guard('user');
  updateCount();
  MP.sections((id) => (views[id] || views.shop)().catch((e) => MP.toast(e.message, 'err')), 'shop');
})();
