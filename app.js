import { ZONES, SECTIONS, SEAT_DATA, ROW_SECTIONS, LABELS, VIEWBOX, STAGE, CONSOLE } from './layout.js';
import { FIREBASE_CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';
const params = new URLSearchParams(location.search);
const EVENT = (params.get('e') || '').replace(/[^A-Za-z0-9_-]/g, '');
const DEMO = !FIREBASE_CONFIG;

// ---------------------------------------------------------------------
//  Lista miejsc (z seats.js)
// ---------------------------------------------------------------------
const SEC_NAME = Object.fromEntries(SECTIONS.map((s) => [s.id, s.name]));
const SEATS = [];            // {id, n, row, sec, zone, x, y, rot, label}
const SEAT_BY_ID = new Map();
for (const d of SEAT_DATA) {
  const id = `${d.sec}_${d.row ?? 0}_${d.n}`;
  const label = `${SEC_NAME[d.sec]}${d.row != null ? `, rząd ${d.row}` : ''}, miejsce ${d.n}`;
  const s = { ...d, id, label };
  SEATS.push(s); SEAT_BY_ID.set(id, s);
}

// Numery rzędów przy skrajnych miejscach każdego rzędu
const ROW_LABELS = [];
{
  const rows = new Map();
  for (const s of SEATS) {
    if (!ROW_SECTIONS.includes(s.sec)) continue;
    const k = `${s.sec}_${s.row}`;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(s);
  }
  const segments = [];
  for (const list of rows.values()) {
    list.sort((a, b) => a.x - b.x);
    segments.push(list);
    // rzędy 18–19 parteru: numer także przy środkowej części (jak na planie)
    if (list[0].sec === 'P' && (list[0].row === 18 || list[0].row === 19)) segments.push(list.filter((s) => s.x > 380 && s.x < 620));
  }
  for (const list of segments) {
    for (const [s, dir] of [[list[0], -1], [list[list.length - 1], 1]]) {
      const a = s.rot * Math.PI / 180;
      ROW_LABELS.push({ x: s.x + dir * 11 * Math.cos(a), y: s.y + dir * 11 * Math.sin(a), text: s.row });
    }
  }
}

// ---------------------------------------------------------------------
//  Rysowanie SVG
// ---------------------------------------------------------------------
const svg = $('#map');
svg.setAttribute('viewBox', `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`);
const el = (tag, attrs = {}, parent = svg) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e); return e;
};

el('rect', { x: STAGE.x, y: STAGE.y, width: STAGE.w, height: STAGE.h, class: 'stage' });
el('text', { x: STAGE.x + STAGE.w / 2, y: STAGE.y + STAGE.h / 2 + 8, class: 'stage-t' }).textContent = 'SCENA';
el('rect', { x: CONSOLE.x, y: CONSOLE.y, width: CONSOLE.w, height: CONSOLE.h, class: 'console' });
el('text', { x: CONSOLE.x + CONSOLE.w / 2, y: CONSOLE.y + CONSOLE.h / 2 + 3, class: 'console-t' }).textContent = 'KONSOLETA';

for (const [text, x, y, size] of LABELS) {
  const t = el('text', { x, y, class: 'sec-label', 'font-size': size });
  text.split('\n').forEach((line, i) => { const ts = el('tspan', { x, dy: i ? size * 1.15 : 0 }, t); ts.textContent = line; });
}
for (const r of ROW_LABELS) el('text', { x: r.x.toFixed(1), y: (r.y + 2.2).toFixed(1), class: 'row-label' }).textContent = r.text;

const seatEls = new Map();
for (const s of SEATS) {
  const g = el('g', { class: 'seat', 'data-id': s.id, transform: `translate(${s.x},${s.y}) rotate(${s.rot})` });
  el('rect', { x: -5, y: -6.2, width: 10, height: 12.4, rx: 1.8, fill: ZONES[s.zone].color }, g);
  el('text', { y: 2, transform: `rotate(${-s.rot})` }, g).textContent = s.n;
  const title = el('title', {}, g); title.textContent = s.label;
  seatEls.set(s.id, { g, title });
}

// ---------------------------------------------------------------------
//  Backend: Firebase (na żywo) albo DEMO (w pamięci / localStorage)
// ---------------------------------------------------------------------
async function firebaseBackend() {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fb = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`);
  const { getDatabase, ref, onValue, update, get, push, query, limitToLast, serverTimestamp } = fb;
  const db = getDatabase(initializeApp(FIREBASE_CONFIG));
  const base = `events/${EVENT}`;
  return {
    onSeats: (cb) => onValue(ref(db, `${base}/seats`), (snap) => cb(snap.val() || {})),
    onLog: (cb) => onValue(query(ref(db, `${base}/log`), limitToLast(40)), (snap) => {
      const arr = []; snap.forEach((c) => { arr.push(c.val()); }); cb(arr.reverse());
    }),
    onConnection: (cb) => onValue(ref(db, '.info/connected'), (snap) => cb(snap.val() === true)),
    // Sprzedaż kilku miejsc jednym zapisem: reguły bazy odrzucą CAŁOŚĆ,
    // jeśli choć jedno miejsce jest już zajęte (nikt nie dostanie połowy).
    async claimMany(ids, by) {
      const at = Date.now(); const upd = {};
      ids.forEach((id) => { upd[id] = { by, at }; });
      try { await update(ref(db, `${base}/seats`), upd); return { ok: true, taken: [] }; } catch (e) {
        const snaps = await Promise.all(ids.map((id) => get(ref(db, `${base}/seats/${id}`))));
        const taken = ids.filter((_, i) => snaps[i].exists());
        if (!taken.length) throw e;
        return { ok: false, taken };
      }
    },
    async releaseMany(ids) {
      const upd = {}; ids.forEach((id) => { upd[id] = null; });
      await update(ref(db, `${base}/seats`), upd);
    },
    log: (entry) => push(ref(db, `${base}/log`), { ...entry, at: serverTimestamp() }),
  };
}

function demoBackend() {
  const K = `demo-seats:${EVENT}`, KL = `demo-log:${EVENT}`;
  const mem = {};
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(mem[k] || d); } };
  const write = (k, v) => { mem[k] = JSON.stringify(v); try { localStorage.setItem(k, mem[k]); } catch { /* brak localStorage */ } };
  const subs = { seats: [], log: [] };
  const emit = () => { subs.seats.forEach((cb) => cb(read(K, '{}'))); subs.log.forEach((cb) => cb(read(KL, '[]'))); };
  addEventListener('storage', (e) => { if (e.key === K || e.key === KL) emit(); });
  const api = {
    onSeats: (cb) => { subs.seats.push(cb); cb(read(K, '{}')); },
    onLog: (cb) => { subs.log.push(cb); cb(read(KL, '[]')); },
    onConnection: (cb) => cb(true),
    async claimMany(ids, by) {
      const s = read(K, '{}'); const taken = ids.filter((id) => s[id]);
      if (taken.length) return { ok: false, taken };
      ids.forEach((id) => { s[id] = { by, at: Date.now() }; }); write(K, s); emit(); return { ok: true, taken: [] };
    },
    async releaseMany(ids) { const s = read(K, '{}'); ids.forEach((id) => delete s[id]); write(K, s); emit(); },
    log(entry) { const l = read(KL, '[]'); l.unshift({ ...entry, at: Date.now() }); write(KL, l.slice(0, 40)); emit(); },
    _read: () => read(K, '{}'), _write: (s) => { write(K, s); emit(); },
  };
  return api;
}

// ---------------------------------------------------------------------
//  Stan i interfejs
// ---------------------------------------------------------------------
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
let sold = {};
let me = store.get('seller-name') || (window.SEAT_DEMO_SIM ? 'Kasa 1' : '');
let backend;
let firstLoad = true;
const selected = new Set();
const recentlyMine = new Set();

const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '');
const fmtDate = (t) => (t ? new Date(t).toLocaleString('pl-PL') : '');
const secName = (s) => SECTIONS.find((x) => x.id === s.sec).name;
const short = (s) => `${secName(s)}${s.row != null ? ` rz. ${s.row}` : ''} m. ${s.n}`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const markMine = (ids) => ids.forEach((id) => { recentlyMine.add(id); setTimeout(() => recentlyMine.delete(id), 3000); });

// Grupuje miejsca: "Parter rz. 5: m. 12, 13, 14"
function groupSeats(ids) {
  const groups = new Map();
  for (const id of ids) {
    const s = SEAT_BY_ID.get(id);
    const key = `${secName(s)}${s.row != null ? ` rz. ${s.row}` : ''}`;
    if (!groups.has(key)) groups.set(key, { key, zone: s.zone, nums: [] });
    groups.get(key).nums.push(s.n);
  }
  return [...groups.values()].map((g) => ({ ...g, nums: g.nums.sort((a, b) => a - b) }));
}
const groupsHtml = (ids) => groupSeats(ids).map((g) =>
  `<div class="grp"><i style="background:${ZONES[g.zone].color}"></i><span>${esc(g.key)}</span><b>m. ${g.nums.join(', ')}</b></div>`).join('');

function toast(html, actionLabel, action, ms = 6000, cls = '') {
  const t = document.createElement('div');
  t.className = `toast ${cls}`; t.innerHTML = `<span>${html}</span>`;
  if (actionLabel) {
    const b = document.createElement('button'); b.textContent = actionLabel;
    b.onclick = () => { action(); t.remove(); }; t.appendChild(b);
  }
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Okno dialogowe (zamiast confirm(), które bywa blokowane)
function modal({ title, body, ok, okClass = '', cancel = 'Wróć' }) {
  return new Promise((resolve) => {
    const d = $('#modal');
    d.innerHTML = `<h2>${title}</h2><div class="mbody">${body}</div><div class="mbtns">
      ${cancel ? `<button class="b-sec" data-r="0">${cancel}</button>` : ''}
      ${ok ? `<button class="b-pri ${okClass}" data-r="1">${ok}</button>` : ''}</div>`;
    d.onclick = (e) => { const b = e.target.closest('button[data-r]'); if (b) { d.close(); resolve(b.dataset.r === '1'); } };
    d.oncancel = () => resolve(false);
    d.showModal();
    d.querySelector('.b-pri')?.focus();
  });
}

function render(newSold) {
  const prev = sold; sold = newSold;
  const lost = [];
  for (const s of SEATS) {
    const { g, title } = seatEls.get(s.id);
    const info = sold[s.id];
    if (info && selected.has(s.id)) { selected.delete(s.id); if (!recentlyMine.has(s.id)) lost.push(s.id); }
    g.classList.toggle('sold', !!info);
    g.classList.toggle('mine', !!info && info.by === me);
    g.classList.toggle('sel', selected.has(s.id));
    title.textContent = info ? `${s.label}\nSPRZEDANE – ${info.by}, ${fmtDate(info.at)}` : `${s.label}\nWOLNE – ${ZONES[s.zone].name}`;
    const changed = !!prev[s.id] !== !!info;
    if (!firstLoad && changed && !recentlyMine.has(s.id)) {
      g.classList.remove('flash'); void g.getBBox(); g.classList.add('flash');
    }
  }
  firstLoad = false;
  if (lost.length) {
    toast(`⚠ Ktoś inny właśnie sprzedał ${lost.length > 1 ? 'miejsca' : 'miejsce'} z Twojego zaznaczenia: <b>${lost.map((id) => esc(short(SEAT_BY_ID.get(id)))).join(', ')}</b> – usunięto z zaznaczenia.`, null, null, 7000, 'warn');
  }
  renderStats(); renderSelection();
}

function renderStats() {
  const per = {}; let total = 0, taken = 0;
  for (const z in ZONES) per[z] = { total: 0, taken: 0 };
  for (const s of SEATS) { per[s.zone].total++; total++; if (sold[s.id]) { per[s.zone].taken++; taken++; } }
  $('#free-big').textContent = total - taken;
  $('#free-sub').textContent = `wolnych z ${total} · sprzedano ${taken}`;
  $('#zones').innerHTML = Object.entries(ZONES).map(([z, info]) =>
    `<div class="zrow"><i style="background:${info.color}"></i><span>${info.name}</span><b>${per[z].total - per[z].taken}</b><small>/ ${per[z].total}</small></div>`).join('');
  const bySeller = {};
  for (const id in sold) { if (!SEAT_BY_ID.has(id)) continue; const b = sold[id].by || '?'; bySeller[b] = (bySeller[b] || 0) + 1; }
  $('#sellers').innerHTML = Object.entries(bySeller).sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `<div class="zrow"><span>${esc(n)}${n === me ? ' (Ty)' : ''}</span><b>${c}</b></div>`).join('') || '<small>Jeszcze nic nie sprzedano</small>';
}

function renderSelection() {
  const bar = $('#selbar');
  bar.classList.toggle('show', selected.size > 0);
  if (!selected.size) return;
  const byZone = {};
  for (const id of selected) { const z = SEAT_BY_ID.get(id).zone; byZone[z] = (byZone[z] || 0) + 1; }
  $('#sel-count').textContent = `Zaznaczono: ${selected.size}`;
  $('#sel-zones').innerHTML = Object.entries(byZone).map(([z, c]) => `<span><i style="background:${ZONES[z].color}"></i>${ZONES[z].name}: ${c}</span>`).join('');
  $('#sel-list').innerHTML = groupSeats([...selected]).map((g) => `${esc(g.key)}: ${g.nums.join(', ')}`).join(' · ');
  $('#sel-sell').textContent = `Sprzedaj (${selected.size})`;
}

function renderLog(list) {
  $('#log').innerHTML = list.map((e) => {
    const ids = String(e.seat).split(',');
    const what = e.a === 'sold' ? '<em class="s">sprzedał(a)</em>' : '<em class="f">zwolnił(a)</em>';
    const seats = ids.every((id) => SEAT_BY_ID.has(id)) ? groupSeats(ids).map((g) => `${g.key} m. ${g.nums.join(', ')}`).join('; ') : e.seat;
    return `<li><time>${fmtTime(e.at)}</time> <b>${esc(e.by)}</b> ${what} ${esc(seats)}</li>`;
  }).join('') || '<li><small>Brak zmian</small></li>';
}

function onSeatClick(id) {
  if (!me) { askName(); return; }
  if (sold[id]) { showSoldSeat(id); return; }
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  seatEls.get(id).g.classList.toggle('sel', selected.has(id));
  renderSelection();
}

async function sellSelected() {
  const ids = [...selected];
  if (!ids.length) return;
  const ok = await modal({
    title: `Potwierdź sprzedaż ${ids.length} ${ids.length === 1 ? 'miejsca' : 'miejsc'}`,
    body: `${groupsHtml(ids)}<p class="muted">Sprzedający: <b>${esc(me)}</b></p>`,
    ok: '✔ Potwierdzam sprzedaż', cancel: 'Wróć',
  });
  if (!ok) return;
  ids.forEach((id) => seatEls.get(id).g.classList.add('pending'));
  markMine(ids);
  let res;
  try { res = await backend.claimMany(ids, me); } catch (e) { console.error(e); res = null; }
  ids.forEach((id) => seatEls.get(id).g.classList.remove('pending'));
  if (!res) { toast('✖ Błąd zapisu – sprawdź połączenie i spróbuj ponownie.', null, null, 6000, 'warn'); return; }
  if (res.ok) {
    ids.forEach((id) => selected.delete(id)); render(sold);
    backend.log({ a: 'sold', seat: ids.join(','), by: me });
    toast(`✔ Sprzedano ${ids.length} ${ids.length === 1 ? 'miejsce' : 'miejsc'}`, 'Cofnij', () => releaseIds(ids, true), 8000, 'ok');
  } else {
    res.taken.forEach((id) => selected.delete(id)); render(sold);
    await modal({
      title: '✖ Nie sprzedano – część miejsc jest już zajęta',
      body: `<p>W międzyczasie ktoś inny sprzedał:</p>${groupsHtml(res.taken)}<p>Usunąłem je z zaznaczenia. <b>Pozostałe miejsca nie zostały sprzedane</b> – sprawdź zaznaczenie i potwierdź ponownie.</p>`,
      ok: 'Rozumiem', cancel: null, okClass: 'b-warn',
    });
  }
}

async function showSoldSeat(id) {
  const s = SEAT_BY_ID.get(id), info = sold[id];
  const ok = await modal({
    title: 'Miejsce sprzedane',
    body: `${groupsHtml([id])}<p>Sprzedał(a): <b>${esc(info.by === me ? `${info.by} (Ty)` : info.by)}</b><br>Kiedy: ${fmtDate(info.at)}</p><p class="muted">Zwolnij tylko przy zwrocie biletu.</p>`,
    ok: 'Zwolnij miejsce (zwrot)', okClass: 'b-danger', cancel: 'Zamknij',
  });
  if (ok) releaseIds([id]);
  void s;
}

async function releaseIds(ids, undo = false) {
  markMine(ids);
  try {
    await backend.releaseMany(ids);
    backend.log({ a: 'freed', seat: ids.join(','), by: me });
    toast(undo ? 'Cofnięto sprzedaż' : `Zwolniono: <b>${esc(short(SEAT_BY_ID.get(ids[0])))}</b>`);
  } catch (e) { console.error(e); toast('✖ Błąd zapisu – sprawdź połączenie', null, null, 6000, 'warn'); }
}

function askName() { $('#name-input').value = me; $('#name-dialog').showModal(); }
$('#name-form').addEventListener('submit', (e) => {
  const v = $('#name-input').value.trim().slice(0, 40);
  if (!v) { e.preventDefault(); return; }
  me = v; store.set('seller-name', me); $('#me').textContent = me; render(sold);
});
$('#change-name').onclick = askName;
$('#sel-clear').onclick = () => { selected.clear(); render(sold); };
$('#sel-sell').onclick = sellSelected;
addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected.size && !document.querySelector('dialog[open]')) { selected.clear(); render(sold); } });

svg.addEventListener('click', (e) => {
  const g = e.target.closest('.seat'); if (g) onSeatClick(g.dataset.id);
});

// zoom
let zoom = +(store.get('zoom') || (innerWidth < 800 ? 1.6 : 1));
const applyZoom = () => { svg.style.width = `${zoom * 100}%`; store.set('zoom', zoom); };
$('#zin').onclick = () => { zoom = Math.min(4, zoom * 1.25); applyZoom(); };
$('#zout').onclick = () => { zoom = Math.max(0.6, zoom / 1.25); applyZoom(); };
applyZoom();

// eksport CSV
$('#csv').onclick = () => {
  const rows = [['Sekcja', 'Rząd', 'Miejsce', 'Strefa', 'Status', 'Sprzedawca', 'Czas']];
  for (const s of SEATS) {
    const i = sold[s.id];
    rows.push([secName(s), s.row ?? '', s.n, ZONES[s.zone].name, i ? 'sprzedane' : 'wolne', i ? i.by : '', i ? fmtDate(i.at) : '']);
  }
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `miejsca-${EVENT || 'demo'}.csv`; a.click();
};

$('#legend').innerHTML = Object.values(ZONES).map((z) => `<span><i style="background:${z.color}"></i>${z.name}</span>`).join('')
  + '<span><i class="lg-sel"></i>Zaznaczone (do sprzedaży)</span><span><i class="lg-sold"></i>Sprzedane</span><span><i class="lg-mine"></i>Sprzedane przez Ciebie</span>';

// ---------------------------------------------------------------------
//  Symulacja innego sprzedawcy (tylko podgląd demo)
// ---------------------------------------------------------------------
function startDemoSimulation(api) {
  const others = ['Kasa 2 – Ewa', 'Punkt Rynek – Marek', 'Kasa 3 – Ola'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const s = {}; const now = Date.now();
  // ok. 30% sali już sprzedane, w blokach obok siebie
  for (let i = 0; i < 70; i++) {
    const start = Math.floor(Math.random() * SEATS.length); const len = 1 + Math.floor(Math.random() * 4); const by = pick(others);
    for (let j = 0; j < len; j++) { const st = SEATS[start + j]; if (st && st.sec === SEATS[start].sec && st.row === SEATS[start].row) s[st.id] = { by, at: now - Math.random() * 36e5 }; }
  }
  api._write(s);
  setInterval(() => {
    const cur = api._read();
    const free = SEATS.filter((x) => !cur[x.id]);
    if (!free.length) return;
    const first = pick(free); const by = pick(others);
    const ids = SEATS.filter((x) => x.sec === first.sec && x.row === first.row && x.n >= first.n && x.n < first.n + 1 + Math.floor(Math.random() * 3) && !cur[x.id]).map((x) => x.id);
    ids.forEach((id) => { cur[id] = { by, at: Date.now() }; });
    api._write(cur);
    api.log({ a: 'sold', seat: ids.join(','), by });
  }, 9000);
}


// ---------------------------------------------------------------------
//  Wybór / tworzenie wydarzenia (gdy w linku brak ?e=...)
// ---------------------------------------------------------------------
function slugify(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}
function randomSuffix(n = 6) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'; const r = crypto.getRandomValues(new Uint8Array(n));
  return [...r].map((x) => a[x % a.length]).join('');
}
function goToEvent(key) { location.href = `${location.pathname}?e=${encodeURIComponent(key)}`; }
function showEventPicker() {
  document.body.classList.add('noevent'); $('#conn').textContent = '';
  const d = $('#modal');
  d.innerHTML = `<h2>Wybierz wydarzenie</h2>
    <form id="ev-new"><b>Nowe wydarzenie</b> <span class="muted">(pusta sala)</span>
      <input id="ev-name" placeholder="np. Gala 31.12" maxlength="30" required>
      <button class="b-pri">Utwórz i otwórz</button></form>
    <hr>
    <form id="ev-open"><b>Mam już link / klucz</b>
      <input id="ev-key" placeholder="wklej link albo klucz, np. gala-31-12-q7w3z9" required>
      <button class="b-sec">Otwórz</button></form>
    <p class="muted">Klucz wydarzenia jest częścią linku – kto go zna, ten może sprzedawać. Wysyłaj go tylko osobom sprzedającym.</p>`;
  d.oncancel = (e) => e.preventDefault();
  d.onclick = null;
  $('#ev-new').onsubmit = (e) => {
    e.preventDefault(); const base = slugify($('#ev-name').value) || 'wydarzenie';
    goToEvent(`${base}-${randomSuffix()}`);
  };
  $('#ev-open').onsubmit = (e) => {
    e.preventDefault(); let v = $('#ev-key').value.trim();
    try { v = new URL(v).searchParams.get('e') || v; } catch { /* to nie link, tylko klucz */ }
    v = v.replace(/[^A-Za-z0-9_-]/g, '');
    if (v.length < 8) { $('#ev-key').setCustomValidity('Klucz musi mieć min. 8 znaków'); $('#ev-key').reportValidity(); $('#ev-key').setCustomValidity(''); return; }
    goToEvent(v);
  };
  d.showModal();
}

$('#copy-link').onclick = async () => {
  const link = `${location.origin}${location.pathname}?e=${EVENT}`;
  try { await navigator.clipboard.writeText(link); toast('🔗 Skopiowano link dla sprzedających', null, null, 3000, 'ok'); } catch {
    await modal({ title: 'Link dla sprzedających', body: `<input readonly value="${esc(link)}" style="width:100%;font-size:14px;padding:8px" onclick="this.select()">`, ok: 'OK', cancel: null });
  }
};

// ---------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------
(async function start() {
  $('#event').textContent = EVENT || (DEMO ? '(demo)' : '—');
  if (window.SEAT_DEMO_SIM) {
    $('#banner').innerHTML = '👀 <b>PODGLĄD</b> – kliknij kilka kolorowych miejsc, potem „Sprzedaj”. Co ~9 s „inne kasy” sprzedają miejsca (mignięcie na żółto), żeby pokazać działanie na żywo.';
    $('#csv').style.display = 'none';
  } else if (DEMO) {
    $('#banner').innerHTML = '⚠ TRYB DEMO – dane tylko w tej przeglądarce. Uzupełnij <code>config.js</code>, aby sprzedawać na żywo.';
  }
  if (!DEMO && EVENT.length < 8) { showEventPicker(); return; }
  $('#copy-link').hidden = false;
  backend = DEMO ? demoBackend() : await firebaseBackend();
  if (window.SEAT_DEMO_SIM) startDemoSimulation(backend);
  backend.onSeats(render);
  backend.onLog(renderLog);
  backend.onConnection((ok) => {
    document.body.classList.toggle('offline', !ok);
    $('#conn').textContent = ok ? '● Połączono – na żywo' : '● BRAK POŁĄCZENIA – nie sprzedawaj!';
  });
  $('#me').textContent = me || '—';
  if (!me) askName();
})();
