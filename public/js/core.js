// Barcha panellar uchun umumiy yordamchilar.
// Har bir rol o'z tokenini alohida saqlaydi — shuning uchun admin, sotuvchi, kuryer va xaridor
// panellarini bir vaqtning o'zida turli oynalarda ochish mumkin.
const MP = (() => {
  const PANELS = { admin: '/admin.html', seller: '/seller.html', courier: '/courier.html', user: '/shop.html' };
  const ROLE_NAMES = { admin: 'Admin', seller: 'Sotuvchi', courier: 'Kuryer', user: 'Xaridor' };
  const STATUS = { new: 'Yangi', ready: 'Kuryer qidirilmoqda', accepted: "Kuryer yo'lda", delivered: 'Yetkazildi', cancelled: 'Bekor qilingan' };
  let panel = null;

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const tokenKey = (role) => 'mp_token_' + role;
  const getToken = (role) => storage.get(tokenKey(role));
  const setToken = (role, t) => storage.set(tokenKey(role), t);

  async function api(path, { method = 'GET', body, token } = {}) {
    const t = token ?? (panel ? getToken(panel) : null);
    const res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false, error: 'Server javob bermadi' }));
    if (res.status === 401 && panel) { setToken(panel, null); location.href = '/'; }
    if (!json.ok) throw new Error(json.error);
    return json.data;
  }

  // Panelga kirishni tekshiradi. Admin rolni o'zgartirgan bo'lsa — yangi rol paneliga o'tkazadi.
  async function guard(role) {
    panel = role;
    if (!getToken(role)) { location.href = '/'; return new Promise(() => {}); }
    const me = await api('/me');
    if (me.role !== role) {
      setToken(me.role, getToken(role)); setToken(role, null);
      location.href = PANELS[me.role];
      return new Promise(() => {});
    }
    return me;
  }
  // Login sahifasidan: tokenni rol bo'yicha saqlab, kerakli panelni ochadi
  function enter({ token, user }, newWindow = false) {
    setToken(user.role, token);
    if (newWindow) window.open(PANELS[user.role], '_blank');
    else location.href = PANELS[user.role];
  }
  function logout() { setToken(panel, null); location.href = '/'; }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
  const badge = (s) => `<span class="badge st-${s}">${STATUS[s] || s}</span>`;
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const phone = (p) => String(p || '').replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, '+998 $1 $2 $3 $4');
  function when(s) {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    if (isNaN(d)) return esc(s);
    const diff = (Date.now() - d) / 60000;
    if (diff < 1) return 'hozirgina';
    if (diff < 60) return Math.floor(diff) + ' daqiqa oldin';
    if (diff < 1440) return Math.floor(diff / 60) + ' soat oldin';
    return d.toLocaleDateString('uz-UZ') + ' ' + d.toTimeString().slice(0, 5);
  }

  // Rasmi yo'q mahsulot uchun chiroyli rangli belgi
  const EMOJI = [[/olma|meva|apple/i, '🍎'], [/non|bread/i, '🍞'], [/asal|honey/i, '🍯'], [/choy|choynak|piyola/i, '🫖'],
    [/sumka|bag/i, '👜'], [/ruchka|qalam|daftar/i, '🖊️'], [/telefon|phone/i, '📱'], [/kiyim|ko'ylak|futbolka/i, '👕'],
    [/poyabzal|krossovka|tufli/i, '👟'], [/sut|qatiq|pishloq/i, '🥛'], [/go'sht|kolbasa/i, '🥩'], [/kitob/i, '📚']];
  function thumb(p, cls = 'thumb') {
    if (p.image) return `<img class="${cls}" src="${esc(p.image)}" alt="" loading="lazy">`;
    let h = 0; for (const c of p.name) h = (h * 31 + c.charCodeAt(0)) % 360;
    const e = (EMOJI.find(([re]) => re.test(p.name)) || [])[1];
    return `<div class="${cls} ph" style="--h:${h}">${e || esc(initials(p.name))}</div>`;
  }

  let toastTimer;
  function toast(msg, type = 'ok') {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.className = 'toast ' + type; t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }
  // Amalni bajaradi, xabar chiqaradi, keyin `after` ni chaqiradi (odatda qayta chizish)
  async function run(fn, okMsg, after) {
    try { await fn(); if (okMsg) toast(okMsg); if (after) await after(); return true; }
    catch (e) { toast(e.message, 'err'); return false; }
  }

  // Modal oyna: forma maydonlarini qaytaradi
  function modal({ title, body, submit = 'Saqlash', onSubmit }) {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.innerHTML = `<form method="dialog">
      <header><h3>${title}</h3><button type="button" class="icon-btn" data-close aria-label="Yopish">✕</button></header>
      <div class="modal-body">${body}</div>
      <footer><button type="button" class="btn ghost" data-close>Bekor qilish</button><button class="btn primary">${submit}</button></footer>
    </form>`;
    document.body.appendChild(d);
    d.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => d.close()));
    d.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('.btn.primary'); btn.disabled = true;
      const ok = await onSubmit(data);
      btn.disabled = false;
      if (ok !== false) d.close();
    };
    d.onclose = () => d.remove();
    d.showModal();
    d.querySelector('input,select,textarea')?.focus();
  }
  const confirmBox = (text) => window.confirm(text);

  // data-act="nom" atributli tugmalar uchun bitta umumiy ishlovchi
  function actions(map) {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !map[el.dataset.act]) return;
      e.preventDefault();
      map[el.dataset.act](el.dataset, el);
    });
  }

  // Panel ichidagi bo'limlar: #bo'lim
  function sections(render, fallback) {
    const go = () => {
      const id = location.hash.slice(1) || fallback;
      document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === id));
      render(id);
    };
    window.addEventListener('hashchange', go);
    go();
  }

  return { PANELS, ROLE_NAMES, STATUS, api, guard, enter, logout, getToken, esc, money, badge, initials, phone, when, thumb, toast, run, modal, confirmBox, actions, sections };
})();
