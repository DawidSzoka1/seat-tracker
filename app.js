import { ZONES, SECTIONS, LABELS, VIEWBOX, STAGE, CONSOLE } from './layout.js';
import { FIREBASE_CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';
const params = new URLSearchParams(location.search);
const EVENT = (params.get('e') || '').replace(/[^A-Za-z0-9_-]/g, '');
const DEMO = !FIREBASE_CONFIG;

// ---------------------------------------------------------------------
//  Budowa listy miejsc z układu
// ---------------------------------------------------------------------
function parseSeats(spec) {
  const out = [];
  for (const part of spec.split(',')) {
    const p = part.trim();
    if (p.startsWith('_')) { for (let i = 0; i < +p.slice(1); i++) out.push(null); continue; }
    const [a, b] = p.split('-').map(Number);
    for (let n = a; n <= (b || a); n++) out.push(n);
  }
  return out;
}

const SEATS = [];            // {id, n, row, sec, zone, x, y, rot, label}
const SEAT_BY_ID = new Map();
const ROW_LABELS = [];       // {x, y, text}

function addSeat(sec, row, n, zone, x, y, rot) {
  const id = `${sec.id}_${row ?? 0}_${n}`;
  const label = `${sec.name}${row != null ? `, rząd ${row}` : ''}, miejsce ${n}`;
  const s = { id, n, row, sec: sec.id, zone, x, y, rot, label };
  SEATS.push(s); SEAT_BY_ID.set(id, s);
}

for (const sec of SECTIONS) {
  if (sec.type === 'arc') {
    for (const r of sec.rows) {
      const list = parseSeats(r.seats);
      const k = r.k ?? sec.k;
      const mid = (list.length - 1) / 2;
      const pos = (i) => { const dx = (i - mid) * sec.pitch; return [sec.cx + dx, r.y - k * dx * dx, Math.atan(-2 * k * dx) * 180 / Math.PI]; };
      list.forEach((n, i) => { if (n != null) { const [x, y, rot] = pos(i); addSeat(sec, r.row, n, r.zone, x, y, rot); } });
      if (sec.rowLabels) {
        const [x1, y1] = pos(-1.1), [x2, y2] = pos(list.length - 1 + 1.1);
        ROW_LABELS.push({ x: x1, y: y1, text: r.row }, { x: x2, y: y2, text: r.row });
      }
    }
  } else {
    const a = sec.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    for (const r of sec.rows) {
      const pitch = r.pitch ?? sec.pitch;
      parseSeats(r.seats).forEach((n, i) => {
        if (n == null) return;
        const lx = (r.x || 0) + i * pitch, ly = r.y || 0;
        addSeat(sec, r.row, n, r.zone, sec.x + lx * c - ly * s, sec.y + lx * s + ly * c, sec.rot);
      });
    }
  }
}

// ---------------------------------------------------------------------
//  Rysowanie SVG
// ---------------------------------------------------------------------
const svg = $('#map');
svg.setAttribute('viewBox', `0 130 ${VIEWBOX.w} ${VIEWBOX.h - 130}`);
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
for (const r of ROW_LABELS) el('text', { x: r.x, y: r.y + 3, class: 'row-label' }).textContent = r.text;

const seatEls = new Map();
for (const s of SEATS) {
  const g = el('g', { class: 'seat', 'data-id': s.id, transform: `translate(${s.x.toFixed(1)},${s.y.toFixed(1)}) rotate(${s.rot.toFixed(1)})` });
  el('rect', { x: -6.5, y: -7, width: 13, height: 14, rx: 2.5, fill: ZONES[s.zone].color }, g);
  el('text', { y: 2.6, transform: `rotate(${(-s.rot).toFixed(1)})` }, g).textContent = s.n;
  const title = el('title', {}, g); title.textContent = s.label;
  seatEls.set(s.id, { g, title });
}

// ---------------------------------------------------------------------
//  Backend: Firebase (na żywo) albo DEMO (localStorage)
// ---------------------------------------------------------------------
async function firebaseBackend() {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const db_ = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`);
  const { getDatabase, ref, onValue, runTransaction, push, query, limitToLast, serverTimestamp } = db_;
  const db = getDatabase(initializeApp(FIREBASE_CONFIG));
  const base = `events/${EVENT}`;
  return {
    onSeats: (cb) => onValue(ref(db, `${base}/seats`), (snap) => cb(snap.val() || {})),
    onLog: (cb) => onValue(query(ref(db, `${base}/log`), limitToLast(40)), (snap) => {
      const arr = []; snap.forEach((c) => { arr.push(c.val()); }); cb(arr.reverse());
    }),
    onConnection: (cb) => onValue(ref(db, '.info/connected'), (snap) => cb(snap.val() === true)),
    async claim(id, by) {
      const res = await runTransaction(ref(db, `${base}/seats/${id}`), (cur) => (cur === null ? { by, at: Date.now() } : undefined), { applyLocally: false });
      return res.committed;
    },
    async release(id) {
      await runTransaction(ref(db, `${base}/seats/${id}`), () => null, { applyLocally: false });
    },
    log: (entry) => push(ref(db, `${base}/log`), { ...entry, at: serverTimestamp() }),
  };
}

function demoBackend() {
  const K = `demo-seats:${EVENT}`, KL = `demo-log:${EVENT}`;
  const read = (k, d) => JSON.parse(localStorage.getItem(k) || d);
  const subs = { seats: [], log: [] };
  const emit = () => { subs.seats.forEach((cb) => cb(read(K, '{}'))); subs.log.forEach((cb) => cb(read(KL, '[]'))); };
  addEventListener('storage', (e) => { if (e.key === K || e.key === KL) emit(); });
  return {
    onSeats: (cb) => { subs.seats.push(cb); cb(read(K, '{}')); },
    onLog: (cb) => { subs.log.push(cb); cb(read(KL, '[]')); },
    onConnection: (cb) => cb(true),
    async claim(id, by) {
      const s = read(K, '{}'); if (s[id]) return false;
      s[id] = { by, at: Date.now() }; localStorage.setItem(K, JSON.stringify(s)); emit(); return true;
    },
    async release(id) { const s = read(K, '{}'); delete s[id]; localStorage.setItem(K, JSON.stringify(s)); emit(); },
    log(entry) { const l = read(KL, '[]'); l.unshift({ ...entry, at: Date.now() }); localStorage.setItem(KL, JSON.stringify(l.slice(0, 40))); emit(); },
  };
}

// ---------------------------------------------------------------------
//  Stan i interfejs
// ---------------------------------------------------------------------
let sold = {};
let me = localStorage.getItem('seller-name') || '';
let backend;
let firstLoad = true;
const recentlyMine = new Set();

const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '');
const fmtDate = (t) => (t ? new Date(t).toLocaleString('pl-PL') : '');
const short = (s) => `${s.sec === 'P' ? 'Parter' : SECTIONS.find((x) => x.id === s.sec).name}${s.row != null ? ` rz. ${s.row}` : ''} m. ${s.n}`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toast(html, actionLabel, action, ms = 6000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = `<span>${html}</span>`;
  if (actionLabel) {
    const b = document.createElement('button'); b.textContent = actionLabel;
    b.onclick = () => { action(); t.remove(); }; t.appendChild(b);
  }
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function render(newSold) {
  const prev = sold; sold = newSold;
  for (const s of SEATS) {
    const { g, title } = seatEls.get(s.id);
    const info = sold[s.id];
    g.classList.toggle('sold', !!info);
    g.classList.toggle('mine', !!info && info.by === me);
    title.textContent = info ? `${s.label}\nSPRZEDANE – ${info.by}, ${fmtDate(info.at)}` : `${s.label}\nWOLNE – ${ZONES[s.zone].name}`;
    const changed = !!prev[s.id] !== !!info;
    if (!firstLoad && changed && !recentlyMine.has(s.id)) {
      g.classList.remove('flash'); void g.getBBox(); g.classList.add('flash');
    }
  }
  firstLoad = false;
  renderStats();
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
  for (const id in sold) { const b = sold[id].by || '?'; bySeller[b] = (bySeller[b] || 0) + 1; }
  $('#sellers').innerHTML = Object.entries(bySeller).sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `<div class="zrow"><span>${esc(n)}${n === me ? ' (Ty)' : ''}</span><b>${c}</b></div>`).join('') || '<small>Jeszcze nic nie sprzedano</small>';
}

function renderLog(list) {
  $('#log').innerHTML = list.map((e) => {
    const s = SEAT_BY_ID.get(e.seat);
    const what = e.a === 'sold' ? '<em class="s">sprzedał(a)</em>' : '<em class="f">zwolnił(a)</em>';
    return `<li><time>${fmtTime(e.at)}</time> <b>${esc(e.by)}</b> ${what} ${s ? esc(short(s)) : esc(e.seat)}</li>`;
  }).join('') || '<li><small>Brak zmian</small></li>';
}

async function onSeatClick(id) {
  if (!me) { askName(); return; }
  const s = SEAT_BY_ID.get(id); const info = sold[id];
  recentlyMine.add(id); setTimeout(() => recentlyMine.delete(id), 3000);
  if (!info) {
    seatEls.get(id).g.classList.add('pending');
    let ok = false;
    try { ok = await backend.claim(id, me); } catch (e) { console.error(e); }
    seatEls.get(id).g.classList.remove('pending');
    if (ok) {
      backend.log({ a: 'sold', seat: id, by: me });
      toast(`✔ Sprzedano: <b>${esc(short(s))}</b> (${ZONES[s.zone].name})`, 'Cofnij', () => release(id, true));
    } else {
      toast(`✖ <b>${esc(short(s))}</b> zostało właśnie sprzedane przez kogoś innego!`, null, null, 5000);
    }
  } else {
    const who = info.by === me ? 'Ty' : info.by;
    if (confirm(`${s.label}\n\nSprzedane przez: ${who}, ${fmtDate(info.at)}\n\nZwolnić to miejsce (np. zwrot biletu)?`)) release(id);
  }
}

async function release(id, undo = false) {
  recentlyMine.add(id); setTimeout(() => recentlyMine.delete(id), 3000);
  try {
    await backend.release(id);
    backend.log({ a: 'freed', seat: id, by: me });
    if (!undo) toast(`Zwolniono: <b>${esc(short(SEAT_BY_ID.get(id)))}</b>`);
  } catch (e) { console.error(e); toast('Błąd zapisu – sprawdź połączenie'); }
}

function askName() {
  const d = $('#name-dialog'); $('#name-input').value = me; d.showModal();
}
$('#name-form').addEventListener('submit', (e) => {
  const v = $('#name-input').value.trim().slice(0, 40);
  if (!v) { e.preventDefault(); return; }
  me = v; localStorage.setItem('seller-name', me); $('#me').textContent = me; render(sold);
});
$('#change-name').onclick = askName;

svg.addEventListener('click', (e) => {
  const g = e.target.closest('.seat'); if (g) onSeatClick(g.dataset.id);
});

// zoom
let zoom = +(localStorage.getItem('zoom') || (innerWidth < 800 ? 1.6 : 1));
const applyZoom = () => { svg.style.width = `${zoom * 100}%`; localStorage.setItem('zoom', zoom); };
$('#zin').onclick = () => { zoom = Math.min(4, zoom * 1.25); applyZoom(); };
$('#zout').onclick = () => { zoom = Math.max(0.6, zoom / 1.25); applyZoom(); };
applyZoom();

// eksport CSV
$('#csv').onclick = () => {
  const rows = [['Sekcja', 'Rząd', 'Miejsce', 'Strefa', 'Status', 'Sprzedawca', 'Czas']];
  for (const s of SEATS) {
    const i = sold[s.id];
    rows.push([SECTIONS.find((x) => x.id === s.sec).name, s.row ?? '', s.n, ZONES[s.zone].name, i ? 'sprzedane' : 'wolne', i ? i.by : '', i ? fmtDate(i.at) : '']);
  }
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `miejsca-${EVENT || 'demo'}.csv`; a.click();
};

$('#legend').innerHTML = Object.values(ZONES).map((z) => `<span><i style="background:${z.color}"></i>${z.name}</span>`).join('')
  + '<span><i class="lg-sold"></i>Sprzedane</span><span><i class="lg-mine"></i>Sprzedane przez Ciebie</span>';

// ---------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------
(async function start() {
  $('#event').textContent = EVENT || '(demo)';
  if (DEMO) $('#banner').innerHTML = '⚠ TRYB DEMO – dane tylko w tej przeglądarce. Uzupełnij <code>config.js</code>, aby sprzedawać na żywo.';
  if (!DEMO && EVENT.length < 8) {
    $('#banner').innerHTML = '⚠ Brak lub zbyt krótki klucz wydarzenia w linku. Użyj linku w formie <code>?e=nazwa-losowe8znakow</code> (min. 8 znaków).';
    $('#banner').classList.add('err'); return;
  }
  backend = DEMO ? demoBackend() : await firebaseBackend();
  backend.onSeats(render);
  backend.onLog(renderLog);
  backend.onConnection((ok) => {
    document.body.classList.toggle('offline', !ok);
    $('#conn').textContent = ok ? '● Połączono – na żywo' : '● BRAK POŁĄCZENIA – nie sprzedawaj!';
  });
  $('#me').textContent = me || '—';
  if (!me) askName();
})();
