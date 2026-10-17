// ===== TotalStats - lógica de la app =====
// Primero local (IndexedDB), luego nube: sync.js sube y baja los cambios a Google Drive.

// ----- IndexedDB (lo usa también sync.js) -----
const STORES = ['jugadores', 'sesiones', 'jugadas'];
let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('libreta-del-mister', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
function dbTx(store, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    fn(tx.objectStore(store));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function notifyDataChanged() {
  if (typeof onLocalDataChanged === 'function') onLocalDataChanged();
}

(() => {
const ATTRS = [['vel','Velocidad'],['tec','Técnica'],['pas','Pase'],['tir','Tiro'],['def','Defensa'],['res','Resistencia']];
const POS = ['Portero','Defensa central','Lateral','Mediocentro','Mediapunta','Extremo','Delantero'];
const S = { jugadores: [], sesiones: [], jugadas: [] };
let store = null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fdate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const round1 = n => Math.round(n * 10) / 10;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- Almacenamiento local: cada cambio se guarda al instante y se avisa a sync.js ---------- */
let renderQueued = false;
function queueRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderAll(); }); }
store = {
  async put(c, id, data) {
    const rec = { ...data, id, updatedAt: Date.now() };
    await dbTx(c, os => os.put(rec));
    const i = S[c].findIndex(r => r.id === id);
    if (i >= 0) S[c][i] = rec; else S[c].push(rec);
    queueRender(); notifyDataChanged();
  },
  async del(c, id) {
    await dbTx(c, os => os.delete(id));
    if (typeof recordDeletion === 'function') recordDeletion(c, id);
    S[c] = S[c].filter(r => r.id !== id);
    queueRender(); notifyDataChanged();
  }
};
async function write(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) { console.warn(e); toast('No se pudo guardar en este dispositivo. Inténtalo de nuevo.'); return false; }
}
// sync.js la llama después de traer cambios de Drive
window.refreshFromDb = async () => { for (const c of STORES) S[c] = await dbGetAll(c); renderAll(); };
window.showToast = (msg) => toast(msg);
async function initStore() {
  try { db = await openDb(); await window.refreshFromDb(); }
  catch (e) { console.error(e); toast('Este navegador no permite guardar datos (IndexedDB). Prueba sin modo privado.'); return; }
  if (typeof startSync === 'function') startSync();
}

/* ---------- Derived stats ---------- */
const media = s => { const v = ATTRS.map(([k]) => +s.val?.[k]).filter(n => n > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const byDate = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.creado || 0) - (b.creado || 0);
function stats(pid) {
  const ss = S.sesiones.filter(s => s.jugadorId === pid).sort(byDate);
  const ev = ss.filter(s => media(s) != null);
  const first = ev[0], last = ev[ev.length - 1];
  const m = last ? media(last) : null, m0 = first ? media(first) : null;
  return {
    ss, ev, first, last, media: m, delta: ev.length > 1 ? m - m0 : 0,
    goles: ss.reduce((a, s) => a + (+s.goles || 0), 0), asist: ss.reduce((a, s) => a + (+s.asistencias || 0), 0),
    minutos: ss.reduce((a, s) => a + (+s.minutos || 0), 0), partidos: ss.filter(s => s.tipo === 'Partido').length
  };
}
function ratingColor(v) {
  if (v == null) return 'var(--muted)';
  if (v >= 8) return 'var(--good)'; if (v >= 6.5) return 'var(--accent)'; if (v >= 5) return 'var(--warn)'; return 'var(--bad)';
}
const ratingBadge = v => `<span class="rating" style="background:${ratingColor(v)}">${v == null ? '–' : v.toFixed(1)}</span>`;
const deltaChip = d => Math.abs(d) < 0.05 ? `<span class="chip">= 0.0</span>` : `<span class="chip ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span>`;
const playerById = id => S.jugadores.find(j => j.id === id);
// Foto del jugador con el dorsal encima; sin foto, el círculo con el dorsal de siempre
const avatar = (j, cls = '') => j.foto
  ? `<span class="dorsal av ${cls}"><img src="${esc(j.foto)}" alt="">${j.dorsal ? `<i>${esc(j.dorsal)}</i>` : ''}</span>`
  : `<span class="dorsal ${cls}">${esc(j.dorsal || '–')}</span>`;
const sortedPlayers = () => [...S.jugadores].sort((a, b) => (+a.dorsal || 99) - (+b.dorsal || 99) || a.nombre.localeCompare(b.nombre));

/* ---------- Charts ---------- */
function lineChart(pts, { w = 600, h = 220, series2 = null } = {}) {
  if (!pts.length) return `<p class="hint">Aún no hay evaluaciones para dibujar la evolución.</p>`;
  const L = 34, R = 16, T = 18, B = 30, iw = w - L - R, ih = h - T - B;
  const x = i => L + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1));
  const y = v => T + ih - (v / 10) * ih;
  let g = '';
  [0, 2, 4, 6, 8, 10].forEach(v => { g += `<line class="gl" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tx" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; });
  const step = Math.ceil(pts.length / 7);
  pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) g += `<text class="tx" x="${x(i)}" y="${h - 8}" text-anchor="middle">${esc(p.label)}</text>`; });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = pts.length > 1 ? `<path class="ar" d="${d} L${x(pts.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z"/>` : '';
  const dots = pts.map((p, i) => `<circle class="dt ${i === pts.length - 1 ? 'end' : ''}" cx="${x(i)}" cy="${y(p.value)}" r="${i === pts.length - 1 ? 5 : 3.5}"><title>${esc(p.label)}: ${p.value.toFixed(1)}</title></circle>`).join('');
  const last = pts[pts.length - 1];
  const lbl = `<text class="vl" x="${x(pts.length - 1)}" y="${y(last.value) - 11}" text-anchor="${pts.length > 1 ? 'end' : 'middle'}">${last.value.toFixed(1)}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolución">${g}${area}<path class="ln" d="${d}"/>${dots}${lbl}</svg>`;
}
function radar(now, before) {
  const S2 = 300, c = S2 / 2, r = 104, n = ATTRS.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * r * v / 10, c + Math.sin(a) * r * v / 10]; };
  let g = '';
  [2, 4, 6, 8, 10].forEach(v => { g += `<polygon class="gl" fill="none" points="${ATTRS.map((_, i) => pt(i, v).join(',')).join(' ')}"/>`; });
  ATTRS.forEach(([k, l], i) => {
    const [ex, ey] = pt(i, 10), [lx, ly] = pt(i, 12.6);
    g += `<line class="gl" x1="${c}" y1="${c}" x2="${ex}" y2="${ey}"/><text class="tx" x="${lx}" y="${ly + 4}" text-anchor="middle">${l} <tspan font-weight="700" fill="var(--ink)">${now ? (+now[k]).toFixed(1) : ''}</tspan></text>`;
  });
  const poly = (vals, cls) => vals ? `<polygon points="${ATTRS.map(([k], i) => pt(i, +vals[k] || 0).join(',')).join(' ')}" ${cls}/>` : '';
  return `<svg viewBox="-20 0 340 300" role="img" aria-label="Perfil de atributos">${g}
    ${poly(before, 'fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"')}
    ${poly(now, 'fill="var(--accent)" fill-opacity=".2" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"')}</svg>`;
}

/* ---------- Panel ---------- */
function renderPanel() {
  const el = $('#panel-body');
  if (!S.jugadores.length) {
    el.innerHTML = `<div class="card empty"><h3>Tu libreta está vacía</h3><p style="margin:0;max-width:46ch">Añade a los jugadores del grupo y registra sus entrenos y partidos. Aquí verás la media del equipo, quién progresa más y la actividad reciente.</p><div class="acts"><button class="btn primary" data-act="new-player">Añadir el primer jugador</button><button class="btn" data-act="load-example">Cargar datos de ejemplo</button></div></div>`;
    return;
  }
  const all = S.jugadores.map(j => ({ j, st: stats(j.id) }));
  const rated = all.filter(x => x.st.media != null);
  const groupAvg = rated.length ? rated.reduce((a, x) => a + x.st.media, 0) / rated.length : null;
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const recent = S.sesiones.filter(s => (s.fecha || '') >= since).length;
  const goles = all.reduce((a, x) => a + x.st.goles, 0), asist = all.reduce((a, x) => a + x.st.asist, 0);
  // monthly group average
  const byMonth = {};
  S.sesiones.forEach(s => { const m = media(s); if (m == null || !s.fecha) return; const k = s.fecha.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(m); });
  const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const months = Object.keys(byMonth).sort().slice(-12).map(k => ({ label: MES[+k.slice(5) - 1] + ' ' + k.slice(2, 4), value: byMonth[k].reduce((a, b) => a + b, 0) / byMonth[k].length }));
  const top = rated.filter(x => x.st.ev.length > 1).sort((a, b) => b.st.delta - a.st.delta).slice(0, 5);
  const best = [...rated].sort((a, b) => b.st.media - a.st.media).slice(0, 5);
  const last = [...S.sesiones].sort(byDate).reverse().slice(0, 6);
  const hasEx = S.jugadores.some(j => j.ejemplo);
  el.innerHTML = `
  ${hasEx ? `<div class="card" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 16px"><span><span class="chip ex">Ejemplo</span> Estás viendo datos de ejemplo. Bórralos cuando empieces con tu grupo.</span><button class="btn sm danger" data-act="clear-example">Borrar datos de ejemplo</button></div>` : ''}
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Jugadores</span><b>${S.jugadores.length}</b><span class="sub">${rated.length} con evaluaciones</span></div>
    <div class="kpi"><span class="eyebrow">Media del grupo</span><b style="color:${ratingColor(groupAvg)}">${groupAvg == null ? '–' : groupAvg.toFixed(1)}</b><span class="sub">última evaluación de cada uno</span></div>
    <div class="kpi"><span class="eyebrow">Sesiones · 30 días</span><b>${recent}</b><span class="sub">${S.sesiones.length} en total</span></div>
    <div class="kpi"><span class="eyebrow">Goles + asist.</span><b>${goles}<span style="color:var(--muted);font-size:1.4rem"> + ${asist}</span></b><span class="sub">acumulado del grupo</span></div>
  </div>
  <div class="grid">
    <div class="card c8"><div class="head-row" style="margin-bottom:8px"><h3>Media del grupo por mes</h3><span class="hint">Escala 1–10</span></div><div class="chart">${lineChart(months)}</div></div>
    <div class="card c4"><h3 style="margin-bottom:6px">Mayor progreso</h3><p class="hint" style="margin:0 0 6px">Primera evaluación frente a la última.</p>
      <div class="list">${top.length ? top.map(x => rowPlayer(x.j, deltaChip(x.st.delta))).join('') : '<p class="hint">Hace falta al menos dos evaluaciones por jugador.</p>'}</div></div>
    <div class="card c5"><h3 style="margin-bottom:6px">Mejor valorados</h3><div class="list">${best.map(x => rowPlayer(x.j, ratingBadge(x.st.media))).join('') || '<p class="hint">Sin evaluaciones todavía.</p>'}</div></div>
    <div class="card c7"><h3 style="margin-bottom:6px">Actividad reciente</h3><div class="list">${last.map(s => {
      const j = playerById(s.jugadorId); if (!j) return '';
      return `<div class="li">${avatar(j)}<div class="grow"><div class="name">${esc(j.nombre)}</div><div class="meta">${esc(s.tipo)} · ${fdate(s.fecha)}${+s.goles ? ` · ${s.goles} gol${+s.goles > 1 ? 'es' : ''}` : ''}${+s.asistencias ? ` · ${s.asistencias} asist.` : ''}</div></div>${ratingBadge(media(s))}</div>`;
    }).join('') || '<p class="hint">Registra la primera sesión desde la pestaña Sesiones.</p>'}</div></div>
  </div>`;
}
const rowPlayer = (j, right) => `<button class="li" data-open="${esc(j.id)}" style="background:none;border:0;border-bottom:1px solid var(--line);text-align:left;cursor:pointer;width:100%">${avatar(j)}<div class="grow"><div class="name">${esc(j.nombre)}</div><div class="meta">${esc(j.posicion || '')}</div></div>${right}</button>`;

/* ---------- Jugadores ---------- */
function sparkline(ev) {
  if (ev.length < 2) return '';
  const w = 90, h = 26, v = ev.map(media), mn = Math.min(...v) - .3, mx = Math.max(...v) + .3;
  const p = v.map((n, i) => `${(i * w / (v.length - 1)).toFixed(1)},${(h - (n - mn) / (mx - mn) * h).toFixed(1)}`);
  const lx = w, ly = h - (v[v.length - 1] - mn) / (mx - mn) * h;
  return `<svg width="${w}" height="${h}" viewBox="-3 -3 ${w + 6} ${h + 6}" aria-hidden="true"><polyline points="${p.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/><circle cx="${lx}" cy="${ly}" r="3" fill="var(--accent)"/></svg>`;
}
function renderJugadores() {
  const q = $('#q').value.trim().toLowerCase(), fp = $('#fpos').value, so = $('#fsort').value;
  const el = $('#players');
  if (!S.jugadores.length) { el.innerHTML = `<div class="card empty"><h3>Sin jugadores todavía</h3><p style="margin:0">Cada ficha muestra la media actual, su evolución y goles.</p><div class="acts"><button class="btn primary" data-act="new-player">Añadir jugador</button><button class="btn" data-act="load-example">Cargar datos de ejemplo</button></div></div>`; return; }
  let list = S.jugadores.map(j => ({ j, st: stats(j.id) })).filter(x => (!q || x.j.nombre.toLowerCase().includes(q)) && (!fp || x.j.posicion === fp));
  const cmp = { dorsal: (a, b) => (+a.j.dorsal || 99) - (+b.j.dorsal || 99), media: (a, b) => (b.st.media ?? -1) - (a.st.media ?? -1), delta: (a, b) => b.st.delta - a.st.delta, nombre: (a, b) => a.j.nombre.localeCompare(b.j.nombre) }[so];
  list.sort(cmp);
  el.innerHTML = list.length ? `<div class="players">${list.map(({ j, st }) => `
    <button class="pcard" data-open="${esc(j.id)}">
      <div class="ph">${avatar(j)}<div style="min-width:0;flex:1"><div class="pn">${esc(j.nombre)}</div><div class="pp">${esc(j.posicion || 'Sin posición')}${j.ejemplo ? ' · <span class="chip ex">Ejemplo</span>' : ''}</div></div>${ratingBadge(st.media)}</div>
      <div class="pf"><div class="stats"><span><b>${st.ss.length}</b> ses.</span><span><b>${st.goles}</b> goles</span><span><b>${st.asist}</b> asist.</span></div>${sparkline(st.ev)}</div>
      <div class="pf"><span class="hint">${st.ev.length > 1 ? 'Progreso desde el inicio' : st.ev.length ? '1 evaluación' : 'Sin evaluar'}</span>${st.ev.length > 1 ? deltaChip(st.delta) : ''}</div>
    </button>`).join('')}</div>` : `<p class="hint">Ningún jugador coincide con la búsqueda.</p>`;
}

/* ---------- Detail ---------- */
let detailId = null, detailAttr = 'media', armedDel = null;
function openDetail(id) { detailId = id; detailAttr = 'media'; renderDetail(); const d = $('#dlg-detail'); if (!d.open) d.showModal(); }
function renderDetail() {
  if (!detailId) return;
  const j = playerById(detailId);
  if (!j) { $('#dlg-detail').close(); detailId = null; return; }
  const st = stats(j.id);
  const pts = st.ev.map(s => ({ label: fdate(s.fecha).slice(0, 5), value: detailAttr === 'media' ? media(s) : +s.val[detailAttr] }));
  const age = j.anio ? new Date().getFullYear() - +j.anio : null;
  $('#detail').innerHTML = `
  <div class="dlg-h">${avatar(j, 'lg')}
    <div class="grow"><h3 style="font-size:1.5rem">${esc(j.nombre)}</h3><div class="hint">${esc(j.posicion || '')}${age ? ` · ${age} años` : ''}${j.pie ? ` · ${esc(j.pie)}` : ''}</div></div>
    <button class="btn ghost sm" data-close-detail>Cerrar</button></div>
  <div class="dlg-b">
    ${j.objetivo ? `<div class="card" style="background:var(--accent-soft);border-color:transparent;padding:12px 14px"><span class="eyebrow">Objetivo</span><div style="font-weight:600">${esc(j.objetivo)}</div></div>` : ''}
    <div class="statrow">
      <div><span>Media actual</span><b style="color:${ratingColor(st.media)}">${st.media == null ? '–' : st.media.toFixed(1)}</b></div>
      <div><span>Progreso</span><b>${st.ev.length > 1 ? (st.delta > 0 ? '+' : '') + st.delta.toFixed(1) : '–'}</b></div>
      <div><span>Sesiones</span><b>${st.ss.length}</b></div>
      <div><span>Partidos</span><b>${st.partidos}</b></div>
      <div><span>Goles / Asist.</span><b>${st.goles} / ${st.asist}</b></div>
      <div><span>Minutos</span><b>${st.minutos}</b></div>
    </div>
    <div class="twocol">
      <div class="chart"><h3 style="margin-bottom:4px">Perfil</h3>${st.last ? radar(st.last.val, st.ev.length > 1 ? st.first.val : null) : '<p class="hint">Sin evaluaciones.</p>'}
        ${st.ev.length > 1 ? `<div class="legend"><span><i style="background:var(--accent)"></i>Última (${fdate(st.last.fecha)})</span><span><i style="background:var(--muted)"></i>Primera (${fdate(st.first.fecha)})</span></div>` : ''}</div>
      <div class="chart"><div class="head-row" style="margin-bottom:6px"><h3>Evolución</h3>
        <select id="d-attr" aria-label="Atributo" style="width:auto"><option value="media">Media</option>${ATTRS.map(([k, l]) => `<option value="${k}" ${detailAttr === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${lineChart(pts, { h: 240 })}</div>
    </div>
    <div><h3 style="margin-bottom:6px">Sesiones</h3><div class="tbl-wrap">${sessionTable(st.ss.slice().reverse(), false)}</div></div>
  </div>
  <div class="dlg-f">
    <button class="btn danger" data-del-player="${esc(j.id)}">Eliminar jugador</button>
    <button class="btn" data-edit-player="${esc(j.id)}">Editar datos</button>
    <button class="btn primary" data-log-for="${esc(j.id)}">Registrar sesión</button>
  </div>`;
  const sel = $('#d-attr'); if (sel) { sel.value = detailAttr; sel.onchange = () => { detailAttr = sel.value; renderDetail(); }; }
}
function sessionTable(rows, showPlayer) {
  if (!rows.length) return '<p class="hint">No hay sesiones registradas.</p>';
  return `<table><thead><tr><th>Fecha</th>${showPlayer ? '<th>Jugador</th>' : ''}<th>Tipo</th><th class="n">Min</th><th class="n">G</th><th class="n">A</th>${ATTRS.map(([, l]) => `<th class="n" title="${l}">${l.slice(0, 3)}</th>`).join('')}<th class="n">Media</th><th>Notas</th><th></th></tr></thead><tbody>
  ${rows.map(s => { const j = playerById(s.jugadorId); return `<tr><td>${fdate(s.fecha)}</td>${showPlayer ? `<td><button class="btn ghost sm" data-open="${esc(s.jugadorId)}" style="padding:2px 6px">${esc(j ? j.nombre : '—')}</button></td>` : ''}<td>${esc(s.tipo)}</td><td class="n">${+s.minutos || 0}</td><td class="n">${+s.goles || 0}</td><td class="n">${+s.asistencias || 0}</td>${ATTRS.map(([k]) => `<td class="n">${s.val?.[k] ?? '–'}</td>`).join('')}<td class="n">${ratingBadge(media(s))}</td><td style="white-space:normal;min-width:160px;max-width:300px" class="hint">${esc(s.nota || '')}</td><td><button class="btn ghost sm danger" data-del-session="${esc(s.id)}" aria-label="Borrar sesión">Borrar</button></td></tr>`; }).join('')}
  </tbody></table>`;
}

/* ---------- Sesiones ---------- */
function fillPlayerSelects() {
  const ps = sortedPlayers();
  const opts = ps.map(j => `<option value="${esc(j.id)}">${esc((j.dorsal ? j.dorsal + ' · ' : '') + j.nombre)}</option>`).join('');
  const sp = $('#s-player'), keep = sp.value;
  sp.innerHTML = ps.length ? opts : '<option value="">Añade jugadores primero</option>';
  if (ps.some(j => j.id === keep)) sp.value = keep;
  const hp = $('#h-player'), k2 = hp.value;
  hp.innerHTML = `<option value="">Todos los jugadores</option>${opts}`; hp.value = ps.some(j => j.id === k2) ? k2 : '';
}
function renderHistory() {
  const p = $('#h-player').value, t = $('#h-type').value;
  const rows = S.sesiones.filter(s => (!p || s.jugadorId === p) && (!t || s.tipo === t)).sort(byDate).reverse().slice(0, 200);
  $('#history').innerHTML = sessionTable(rows, true);
}
function buildSliders() {
  $('#s-sliders').innerHTML = ATTRS.map(([k, l]) => `<div class="sl"><div class="top"><label for="r-${k}">${l}</label><output id="o-${k}">6</output></div><input type="range" id="r-${k}" min="1" max="10" step="0.5" value="6"></div>`).join('');
  ATTRS.forEach(([k]) => $('#r-' + k).addEventListener('input', updAvg));
}
function updAvg() { let s = 0; ATTRS.forEach(([k]) => { const v = +$('#r-' + k).value; $('#o-' + k).textContent = v; s += v; }); $('#s-avg').textContent = (s / ATTRS.length).toFixed(1); }

/* ---------- Render all ---------- */
function renderAll() {
  renderPanel(); renderJugadores(); fillPlayerSelects(); renderHistory(); renderPlays();
  if ($('#dlg-detail').open) renderDetail();
  if (T.sel) renderSel();
  drawTokens();
}

/* ---------- Tabs ---------- */
function go(tab) {
  $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  $$('section.view').forEach(s => s.hidden = s.id !== 'v-' + tab);
  try { localStorage.setItem('libreta-tab', tab); } catch {}
  if (tab === 'tactica') requestAnimationFrame(updateTokenScale);
  // No tocar la dirección mientras trae el token de Google (#access_token=...)
  if (/access_token=|error=/.test(location.hash)) return;
  try { if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab); } catch {}
}
$$('nav.tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (['panel', 'jugadores', 'sesiones', 'tactica'].includes(t)) go(t); });

/* ---------- Player form ---------- */
let editingPlayer = null;
function openPlayerForm(id) {
  editingPlayer = id || null; const j = id ? playerById(id) : {};
  $('#pf-title').textContent = id ? 'Editar jugador' : 'Nuevo jugador';
  $('#p-nombre').value = j.nombre || ''; $('#p-dorsal').value = j.dorsal || ''; $('#p-pos').value = j.posicion || POS[3];
  $('#p-anio').value = j.anio || ''; $('#p-pie').value = j.pie || 'Diestro'; $('#p-obj').value = j.objetivo || '';
  setFormPhoto(j.foto || null);
  $('#dlg-player').showModal(); $('#p-nombre').focus();
}

/* ---------- Foto del jugador: cámara (PC y celular) o imagen de la galería ---------- */
let formPhoto = null;
function setFormPhoto(src) {
  formPhoto = src;
  const prev = $('#p-photo-prev');
  prev.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<svg width="34" height="34" viewBox="0 0 24 24"><circle cx="12" cy="9" r="4" fill="currentColor"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor"/></svg>';
  $('#p-photo-del').hidden = !src;
}
// Recorte cuadrado centrado y reducido a 320 px en JPEG: unos 20-30 KB, ligero para Drive
function squarePhoto(source, sw, sh, mirror = false) {
  const side = Math.min(sw, sh), size = Math.min(320, side);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (mirror) { g.translate(size, 0); g.scale(-1, 1); }
  g.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.82);
}
async function photoFromFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    setFormPhoto(squarePhoto(img, img.naturalWidth, img.naturalHeight));
    URL.revokeObjectURL(url);
  } catch { toast('No se pudo leer esa imagen.'); }
}
['#p-photo-input', '#p-photo-capture'].forEach(s => $(s).addEventListener('change', e => { photoFromFile(e.target.files[0]); e.target.value = ''; }));
$('#p-photo-file').addEventListener('click', () => $('#p-photo-input').click());
$('#p-photo-del').addEventListener('click', () => setFormPhoto(null));

let camStream = null, camFacing = 'user', camDevices = 0;
function stopCam() { if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; }
async function startCam() {
  stopCam();
  const v = $('#cam-video'), msg = $('#cam-msg');
  msg.hidden = true; $('#cam-shot').disabled = true;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    v.srcObject = camStream; v.classList.toggle('mirror', camFacing === 'user');
    await v.play().catch(() => {});
    $('#cam-shot').disabled = false;
    if (!camDevices) camDevices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').length;
    $('#cam-switch').hidden = camDevices < 2;
  } catch (e) {
    msg.hidden = false;
    msg.textContent = e && e.name === 'NotAllowedError' ? 'No hay permiso para usar la cámara. Actívalo en la configuración del navegador o usa «Elegir imagen».' : 'No se encontró ninguna cámara en este dispositivo. Usa «Elegir imagen».';
  }
}
$('#p-photo-cam').addEventListener('click', () => {
  // Sin acceso directo a la cámara (navegadores antiguos): se usa la cámara del sistema
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#p-photo-capture').click(); return; }
  $('#dlg-camera').showModal(); startCam();
});
$('#cam-switch').addEventListener('click', () => { camFacing = camFacing === 'user' ? 'environment' : 'user'; startCam(); });
$('#cam-shot').addEventListener('click', () => {
  const v = $('#cam-video'); if (!v.videoWidth) return;
  setFormPhoto(squarePhoto(v, v.videoWidth, v.videoHeight, camFacing === 'user'));
  $('#dlg-camera').close();
});
$('[data-cam-close]').addEventListener('click', () => $('#dlg-camera').close());
$('#dlg-camera').addEventListener('close', stopCam);
$('#p-pos').innerHTML = POS.map(p => `<option>${p}</option>`).join('');
$('#fpos').innerHTML += POS.map(p => `<option>${p}</option>`).join('');
$('#pform').addEventListener('submit', async e => {
  e.preventDefault();
  const nombre = $('#p-nombre').value.trim(); if (!nombre) return;
  const id = editingPlayer || uid(); const prev = editingPlayer ? playerById(editingPlayer) : {};
  const data = { ...prev, nombre, dorsal: $('#p-dorsal').value ? +$('#p-dorsal').value : null, posicion: $('#p-pos').value, anio: $('#p-anio').value ? +$('#p-anio').value : null, pie: $('#p-pie').value, objetivo: $('#p-obj').value.trim(), foto: formPhoto, creado: prev.creado || Date.now() };
  delete data.id; if (!data.foto) delete data.foto;
  if (await write(() => store.put('jugadores', id, data), editingPlayer ? 'Jugador actualizado' : 'Jugador añadido')) $('#dlg-player').close();
});

/* ---------- Session form ---------- */
$('#sform').addEventListener('submit', async e => {
  e.preventDefault();
  const pid = $('#s-player').value; if (!pid) { toast('Primero añade un jugador.'); return; }
  const val = {}; ATTRS.forEach(([k]) => val[k] = +$('#r-' + k).value);
  const data = { jugadorId: pid, fecha: $('#s-date').value || today(), tipo: $('#s-type').value, minutos: +$('#s-min').value || 0, goles: +$('#s-gol').value || 0, asistencias: +$('#s-asi').value || 0, val, nota: $('#s-note').value.trim(), creado: Date.now() };
  if (await write(() => store.put('sesiones', uid(), data), 'Sesión guardada')) { $('#s-note').value = ''; $('#s-gol').value = 0; $('#s-asi').value = 0; }
});
$('#h-player').addEventListener('change', renderHistory);
$('#h-type').addEventListener('change', renderHistory);
['q', 'fpos', 'fsort'].forEach(id => $('#' + id).addEventListener('input', renderJugadores));

/* ---------- Example data ---------- */
async function loadExample() {
  const P = [['Hugo Pérez', 1, 'Portero', 2009], ['Pablo Torres', 3, 'Lateral', 2010], ['Mateo Ruiz', 4, 'Defensa central', 2009], ['Daniel Gómez', 8, 'Mediocentro', 2010], ['Álvaro Sanz', 7, 'Extremo', 2010], ['Lucas Martín', 9, 'Delantero', 2009]];
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const ok = await write(async () => {
    for (const [i, [nombre, dorsal, posicion, anio]] of P.entries()) {
      const id = 'ej-' + i;
      await store.put('jugadores', id, { nombre, dorsal, posicion, anio, pie: i % 3 === 1 ? 'Zurdo' : 'Diestro', objetivo: '', ejemplo: true, creado: Date.now() });
      const base = 4.8 + rnd() * 1.5, growth = 0.15 + rnd() * 0.35;
      for (let k = 0; k < 6; k++) {
        const d = new Date(Date.now() - (150 - k * 28) * 864e5).toISOString().slice(0, 10);
        const val = {}; ATTRS.forEach(([a], ai) => val[a] = Math.max(1, Math.min(10, Math.round((base + growth * k + (rnd() - .5) * 1.4 + (ai === i % 6 ? 1 : 0)) * 2) / 2)));
        const partido = k % 2 === 1, del = posicion === 'Delantero' || posicion === 'Extremo';
        await store.put('sesiones', `ej-${i}-${k}`, { jugadorId: id, fecha: d, tipo: partido ? 'Partido' : 'Entreno', minutos: partido ? 50 + Math.round(rnd() * 40) : 75, goles: partido && del && rnd() > .4 ? 1 + (rnd() > .7 ? 1 : 0) : 0, asistencias: partido && rnd() > .6 ? 1 : 0, val, nota: '', ejemplo: true, creado: Date.now() + k });
      }
    }
  }, 'Datos de ejemplo cargados');
}
async function clearExample() {
  await write(async () => {
    for (const s of S.sesiones.filter(s => s.ejemplo)) await store.del('sesiones', s.id);
    for (const j of S.jugadores.filter(j => j.ejemplo)) await store.del('jugadores', j.id);
  }, 'Datos de ejemplo borrados');
}

/* ---------- Global click delegation ---------- */
function arm(btn, label, fn) {
  if (btn.classList.contains('armed')) { fn(); return; }
  btn.classList.add('armed'); const old = btn.textContent; btn.textContent = label;
  setTimeout(() => { btn.classList.remove('armed'); btn.textContent = old; }, 3000);
}
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-open]'); if (!t) return;
  if (t.dataset.go) go(t.dataset.go);
  if (t.dataset.act === 'new-player') openPlayerForm();
  if (t.dataset.act === 'load-example') loadExample();
  if (t.dataset.act === 'clear-example') arm(t, '¿Seguro? Pulsa otra vez', clearExample);
  if (t.dataset.open) openDetail(t.dataset.open);
  if (t.hasAttribute('data-close')) t.closest('dialog').close();
  if (t.hasAttribute('data-close-detail')) { $('#dlg-detail').close(); detailId = null; }
  if (t.dataset.editPlayer) openPlayerForm(t.dataset.editPlayer);
  if (t.dataset.logFor) { $('#dlg-detail').close(); detailId = null; go('sesiones'); $('#s-player').value = t.dataset.logFor; $('#s-player').focus(); }
  if (t.dataset.delPlayer) arm(t, 'Pulsa otra vez para eliminar', async () => {
    const id = t.dataset.delPlayer;
    await write(async () => { for (const s of S.sesiones.filter(s => s.jugadorId === id)) await store.del('sesiones', s.id); await store.del('jugadores', id); }, 'Jugador eliminado');
  });
  if (t.dataset.delSession) arm(t, '¿Borrar?', () => write(() => store.del('sesiones', t.dataset.delSession), 'Sesión borrada'));
});
$('#dlg-detail').addEventListener('close', () => { detailId = null; });

/* =================== PIZARRA TÁCTICA =================== */
const FORM = {
  '4-4-2':   [[50,340],[200,110],[185,260],[185,420],[200,570],[340,110],[320,260],[320,420],[340,570],[460,270],[460,410]],
  '4-3-3':   [[50,340],[200,110],[185,260],[185,420],[200,570],[320,200],[290,340],[320,480],[450,110],[475,340],[450,570]],
  '4-2-3-1': [[50,340],[200,110],[185,260],[185,420],[200,570],[290,260],[290,420],[395,120],[395,340],[395,560],[475,340]],
  '3-5-2':   [[50,340],[190,190],[180,340],[190,490],[330,80],[300,230],[285,340],[300,450],[330,600],[460,270],[460,410]],
  '5-3-2':   [[50,340],[220,80],[180,200],[170,340],[180,480],[220,600],[320,200],[300,340],[320,480],[460,270],[460,410]],
  '3-4-3':   [[50,340],[190,190],[180,340],[190,490],[320,120],[300,270],[300,410],[320,560],[450,130],[475,340],[450,550]]
};
const T = { meta: [], frames: [], cur: 0, tool: 'mover', sel: null, showB: true, playing: false, formA: '4-3-3', formB: '4-4-2', loadedId: null };
const svg = $('#pitch'), NS = 'http://www.w3.org/2000/svg';
const clone = o => JSON.parse(JSON.stringify(o));

function formPos(team, f) { return FORM[f].map(([x, y]) => team === 'a' ? { x, y } : { x: 1050 - x, y: 680 - y }); }
function newBoard() {
  T.meta = []; const pos = {};
  formPos('a', T.formA).forEach((p, i) => { const id = 'a' + i; T.meta.push({ id, team: 'a', label: String(i + 1), playerId: null }); pos[id] = p; });
  formPos('b', T.formB).forEach((p, i) => { const id = 'b' + i; T.meta.push({ id, team: 'b', label: String(i + 1) }); pos[id] = p; });
  T.meta.push({ id: 'ball', team: 'ball', label: '' }); pos.ball = { x: 525, y: 340 };
  T.frames = [{ pos, arrows: [] }]; T.cur = 0; T.sel = null; T.loadedId = null;
}
function drawPitch() {
  const L = 'fill="none" stroke="var(--chalk)" stroke-width="3" stroke-opacity=".9"';
  let g = `<rect x="-30" y="-30" width="1110" height="740" fill="var(--pitch)"/>`;
  for (let i = 0; i < 10; i++) if (i % 2) g += `<rect x="${i * 105}" y="0" width="105" height="680" fill="var(--pitch-stripe)"/>`;
  g += `<rect x="0" y="0" width="1050" height="680" ${L}/><line x1="525" y1="0" x2="525" y2="680" ${L}/><circle cx="525" cy="340" r="91.5" ${L}/><circle cx="525" cy="340" r="4" fill="var(--chalk)"/>`;
  [[0, 1], [1050, -1]].forEach(([x0, s]) => {
    g += `<rect x="${s > 0 ? 0 : 1050 - 165}" y="138.5" width="165" height="403" ${L}/>`;
    g += `<rect x="${s > 0 ? 0 : 1050 - 55}" y="248.5" width="55" height="183" ${L}/>`;
    g += `<circle cx="${x0 + s * 110}" cy="340" r="4" fill="var(--chalk)"/>`;
    g += `<path d="M${x0 + s * 165} ${340 - 73.1} A91.5 91.5 0 0 ${s > 0 ? 1 : 0} ${x0 + s * 165} ${340 + 73.1}" ${L}/>`;
    g += `<rect x="${s > 0 ? -22 : 1050}" y="303.4" width="22" height="73.2" ${L} stroke-width="2.5"/>`;
    [[0], [680]].forEach(([y]) => { g += `<path d="M${x0} ${y + (y ? -10 : 10)} A10 10 0 0 ${(s > 0) === !y ? 0 : 1} ${x0 + s * 10} ${y}" ${L} stroke-width="2"/>`; });
  });
  $('#g-pitch').innerHTML = g;
}
// En pantallas angostas las fichas se agrandan para poder arrastrarlas con el dedo
let TK = 1;
function updateTokenScale() { const w = svg.clientWidth || 800; const k = Math.min(1.8, Math.max(1, 640 / w)); if (Math.abs(k - TK) > 0.05) { TK = k; drawTokens(); } }
const tf = (x, y) => `translate(${x} ${y}) scale(${TK})`;
window.addEventListener('resize', updateTokenScale);
function shortName(pid) { const j = pid && playerById(pid); return j ? j.nombre.split(' ')[0] : ''; }
function drawTokens(posOverride, arrowsOverride, arrowOpacity = 1) {
  const fr = T.frames[T.cur]; if (!fr) return;
  const pos = posOverride || fr.pos, arrows = arrowsOverride || fr.arrows;
  $('#g-arrows').innerHTML = arrows.map((a, i) => `<g data-arrow="${i}" opacity="${arrowOpacity}"><line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="transparent" stroke-width="24" style="pointer-events:stroke"/>
    <line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${a.kind === 'pase' ? 'var(--chalk)' : 'var(--run)'}" stroke-width="4" ${a.kind === 'carrera' ? 'stroke-dasharray="14 10"' : ''} stroke-linecap="round" marker-end="url(#mk-${a.kind})" style="pointer-events:none"/></g>`).join('');
  $('#g-tokens').innerHTML = T.meta.filter(m => m.team !== 'b' || T.showB).map(m => {
    const p = pos[m.id]; if (!p) return '';
    const sel = T.sel === m.id;
    if (m.team === 'ball') return `<g class="tok" data-tok="ball" tabindex="0" role="button" aria-label="Balón" transform="${tf(p.x, p.y)}"><circle class="ring" r="20" fill="none" stroke="var(--run)" stroke-width="3" stroke-dasharray="5 4" opacity="${sel ? 1 : 0}"/><circle r="11" fill="#ffffff" stroke="#1a1a1a" stroke-width="2"/><path d="M0 -5 L4.8 -1.5 L3 4 L-3 4 L-4.8 -1.5Z" fill="#1a1a1a"/></g>`;
    const fill = m.team === 'a' ? 'var(--team-a)' : 'var(--team-b)';
    const nm = m.team === 'a' ? shortName(m.playerId) : '';
    return `<g class="tok" data-tok="${m.id}" tabindex="0" role="button" aria-label="${m.team === 'a' ? 'Mi equipo' : 'Rival'} ${esc(m.label)} ${esc(nm)}" transform="${tf(p.x, p.y)}">
      <circle class="ring" r="29" fill="none" stroke="var(--run)" stroke-width="3" stroke-dasharray="6 5" opacity="${sel ? 1 : 0}"/>
      <circle r="21" fill="${fill}" stroke="var(--chalk)" stroke-width="3"/>
      <text text-anchor="middle" y="7.5" fill="#fff" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="22" style="pointer-events:none">${esc(m.label)}</text>
      ${nm ? `<text text-anchor="middle" y="42" fill="var(--chalk)" font-family="Figtree, sans-serif" font-weight="700" font-size="15" paint-order="stroke" stroke="rgba(0,0,0,.45)" stroke-width="3" style="pointer-events:none">${esc(nm)}</text>` : ''}
    </g>`;
  }).join('');
}
function drawFrames() {
  $('#frames').innerHTML = `<span class="eyebrow" style="margin-right:4px">Pasos</span>` + T.frames.map((_, i) => `<button class="fr" type="button" data-frame="${i}" aria-current="${i === T.cur}" aria-label="Paso ${i + 1}">${i + 1}</button>`).join('');
  $('#f-del').disabled = T.frames.length < 2;
}
function renderBoard() { drawTokens(); drawFrames(); renderSel(); }

function svgPt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
const clampX = v => Math.max(-15, Math.min(1065, v)), clampY = v => Math.max(-15, Math.min(695, v));
let drag = null, draft = null;
svg.addEventListener('pointerdown', e => {
  if (T.playing) return;
  const p = svgPt(e), tok = e.target.closest('[data-tok]'), fr = T.frames[T.cur];
  if (T.tool === 'mover') {
    if (tok) {
      const id = tok.dataset.tok, q = fr.pos[id];
      drag = { id, dx: q.x - p.x, dy: q.y - p.y, el: tok, moved: false };
      svg.setPointerCapture(e.pointerId); select(id, false);
      if (navigator.vibrate) navigator.vibrate(8); // pequeño toque al agarrar la ficha (no existe en iPhone)
    } else select(null);
  } else if (T.tool === 'pase' || T.tool === 'carrera') {
    const s = tok ? fr.pos[tok.dataset.tok] : p;
    draft = { x1: s.x, y1: s.y, x2: p.x, y2: p.y, kind: T.tool };
    const d = $('#draft');
    d.setAttribute('stroke', T.tool === 'pase' ? 'var(--chalk)' : 'var(--run)'); d.setAttribute('stroke-width', 4); d.setAttribute('stroke-linecap', 'round');
    d.setAttribute('stroke-dasharray', T.tool === 'carrera' ? '14 10' : ''); d.setAttribute('marker-end', `url(#mk-${T.tool})`);
    svg.setPointerCapture(e.pointerId);
  } else if (T.tool === 'borrar') {
    const a = e.target.closest('[data-arrow]');
    if (a) { fr.arrows.splice(+a.dataset.arrow, 1); drawTokens(); }
  }
  e.preventDefault();
});
svg.addEventListener('pointermove', e => {
  if (drag) {
    const p = svgPt(e), q = T.frames[T.cur].pos[drag.id];
    q.x = Math.round(clampX(p.x + drag.dx)); q.y = Math.round(clampY(p.y + drag.dy)); drag.moved = true;
    drag.el.setAttribute('transform', tf(q.x, q.y));
  } else if (draft) {
    const p = svgPt(e); draft.x2 = clampX(p.x); draft.y2 = clampY(p.y);
    const d = $('#draft'); ['x1', 'y1', 'x2', 'y2'].forEach(k => d.setAttribute(k, draft[k])); d.setAttribute('visibility', 'visible');
  }
});
function endPointer() {
  if (drag) { drag = null; drawTokens(); }
  if (draft) {
    if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 25) { const a = draft; ['x1', 'y1', 'x2', 'y2'].forEach(k => a[k] = Math.round(a[k])); T.frames[T.cur].arrows.push(a); }
    draft = null; $('#draft').setAttribute('visibility', 'hidden'); drawTokens();
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('focusin', e => { const t = e.target.closest('[data-tok]'); if (t && T.sel !== t.dataset.tok && !drag) select(t.dataset.tok, false); });
svg.addEventListener('keydown', e => {
  if (!T.sel || T.playing) return;
  const d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]; if (!d) return;
  e.preventDefault(); const q = T.frames[T.cur].pos[T.sel]; const m = e.shiftKey ? 4 : 1;
  q.x = clampX(q.x + d[0] * m); q.y = clampY(q.y + d[1] * m);
  const el = svg.querySelector(`[data-tok="${T.sel}"]`); if (el) el.setAttribute('transform', tf(q.x, q.y));
});
function select(id, redraw = true) {
  T.sel = id;
  svg.querySelectorAll('[data-tok] .ring').forEach(r => r.setAttribute('opacity', r.parentNode.dataset.tok === id ? 1 : 0));
  renderSel();
}
function renderSel() {
  const body = $('#selbody'), m = T.meta.find(x => x.id === T.sel);
  if (!m) { body.className = 'hint'; body.innerHTML = 'Toca una ficha para editarla o asignarle un jugador de tu plantilla. Con el teclado, usa las flechas para moverla.'; return; }
  body.className = '';
  if (m.team === 'ball') { body.innerHTML = '<p class="hint" style="margin:0">El balón. Arrástralo para marcar dónde está la jugada.</p>'; return; }
  const ps = sortedPlayers();
  body.innerHTML = `<div style="display:grid;gap:10px">
    <div style="display:flex;align-items:center;gap:10px"><span class="dorsal" style="background:${m.team === 'a' ? 'var(--team-a)' : 'var(--team-b)'}">${esc(m.label)}</span><b>${m.team === 'a' ? 'Mi equipo' : 'Rival'}</b></div>
    ${m.team === 'a' ? `<label class="f">Jugador de la plantilla<select id="sel-player"><option value="">Sin asignar</option>${ps.map(j => `<option value="${esc(j.id)}" ${m.playerId === j.id ? 'selected' : ''}>${esc((j.dorsal ? j.dorsal + ' · ' : '') + j.nombre)}</option>`).join('')}</select></label>` : ''}
    <label class="f">Número en la ficha<input type="text" id="sel-label" maxlength="3" value="${esc(m.label)}"></label>
  </div>`;
  const sp = $('#sel-player');
  if (sp) sp.onchange = () => { m.playerId = sp.value || null; const j = playerById(m.playerId); if (j && j.dorsal) { m.label = String(j.dorsal); $('#sel-label').value = m.label; } drawTokens(); select(m.id); };
  $('#sel-label').oninput = e => { m.label = e.target.value.trim().slice(0, 3); drawTokens(); select(m.id); };
}

/* tools */
$$('#tools button').forEach(b => b.addEventListener('click', () => {
  T.tool = b.dataset.tool; $$('#tools button').forEach(x => x.setAttribute('aria-pressed', x === b));
  svg.setAttribute('class', 'mode-' + T.tool);
}));
$('#t-clear').addEventListener('click', () => { T.frames[T.cur].arrows = []; drawTokens(); });
$('#t-rival').addEventListener('click', e => { T.showB = !T.showB; e.currentTarget.setAttribute('aria-pressed', T.showB); e.currentTarget.textContent = T.showB ? 'Rival visible' : 'Rival oculto'; if (!T.showB && T.sel && T.sel[0] === 'b') select(null); drawTokens(); });
$('#t-fa').innerHTML = $('#t-fb').innerHTML = Object.keys(FORM).map(f => `<option>${f}</option>`).join('');
$('#t-fa').value = T.formA; $('#t-fb').value = T.formB;
function applyForm(team) {
  const f = team === 'a' ? T.formA : T.formB, pos = T.frames[T.cur].pos;
  formPos(team, f).forEach((p, i) => pos[team + i] = p); drawTokens();
}
$('#t-fa').addEventListener('change', e => { T.formA = e.target.value; applyForm('a'); });
$('#t-fb').addEventListener('change', e => { T.formB = e.target.value; applyForm('b'); });
$('#t-reset').addEventListener('click', () => { applyForm('a'); applyForm('b'); T.frames[T.cur].pos.ball = { x: 525, y: 340 }; drawTokens(); });

/* frames */
$('#frames').addEventListener('click', e => { const b = e.target.closest('[data-frame]'); if (!b || T.playing) return; T.cur = +b.dataset.frame; renderBoard(); });
$('#f-add').addEventListener('click', () => { if (T.playing) return; const f = clone(T.frames[T.cur]); f.arrows = []; T.frames.splice(T.cur + 1, 0, f); T.cur++; renderBoard(); toast(`Paso ${T.cur + 1} creado. Mueve las fichas a su nueva posición.`); });
$('#f-del').addEventListener('click', () => { if (T.playing || T.frames.length < 2) return; T.frames.splice(T.cur, 1); T.cur = Math.max(0, T.cur - 1); renderBoard(); });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('#f-play').addEventListener('click', () => {
  if (T.playing) { T.playing = false; return; }
  if (T.frames.length < 2) { toast('Añade al menos un segundo paso para reproducir la jugada.'); return; }
  T.playing = true; select(null); $('#f-play').textContent = '■ Detener';
  const dur = reduce ? 1 : 1100, hold = reduce ? 900 : 450; let i = 0, t0 = null;
  T.cur = 0; drawFrames();
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  function step(ts) {
    if (!T.playing) return finish();
    if (t0 == null) t0 = ts;
    const el = ts - t0, k = ease(Math.min(1, el / dur)), A = T.frames[i].pos, B = T.frames[i + 1].pos, P = {};
    for (const id in A) { const b = B[id] || A[id]; P[id] = { x: A[id].x + (b.x - A[id].x) * k, y: A[id].y + (b.y - A[id].y) * k }; }
    drawTokens(P, T.frames[i].arrows, 1 - k * .75);
    if (el >= dur + hold) { i++; t0 = null; T.cur = i; drawFrames(); if (i >= T.frames.length - 1) return finish(); }
    requestAnimationFrame(step);
  }
  function finish() { T.playing = false; $('#f-play').textContent = '▶ Reproducir'; renderBoard(); }
  requestAnimationFrame(step);
});

/* saved plays */
function renderPlays() {
  const el = $('#plays'); const list = [...S.jugadas].sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));
  el.innerHTML = list.length ? list.map(p => `<div class="li"><div class="grow"><div class="name">${esc(p.nombre)}</div><div class="meta">${p.frames?.length || 1} paso${(p.frames?.length || 1) > 1 ? 's' : ''} · ${esc(p.formA || '')} vs ${esc(p.formB || '')}${T.loadedId === p.id ? ' · <b style="color:var(--accent)">abierta</b>' : ''}</div></div><button class="btn sm" data-load-play="${esc(p.id)}">Abrir</button><button class="btn sm ghost danger" data-del-play="${esc(p.id)}" aria-label="Borrar jugada">✕</button></div>`).join('')
    : '<p class="hint" style="margin:0">Guarda aquí salidas de balón, córners, presiones… Se guardan con todos sus pasos.</p>';
}
$('#t-save').addEventListener('click', async () => {
  const nombre = $('#t-name').value.trim() || `Jugada ${S.jugadas.length + 1}`;
  const id = T.loadedId || uid();
  const data = { nombre, meta: T.meta, frames: T.frames, formA: T.formA, formB: T.formB, showB: T.showB, actualizado: Date.now() };
  if (await write(() => store.put('jugadas', id, clone(data)), T.loadedId ? 'Jugada actualizada' : 'Jugada guardada')) { T.loadedId = id; $('#t-name').value = nombre; renderPlays(); }
});
$('#t-new').addEventListener('click', () => { if (T.playing) return; newBoard(); $('#t-name').value = ''; renderBoard(); renderPlays(); });
$('#plays').addEventListener('click', e => {
  const l = e.target.closest('[data-load-play]'), d = e.target.closest('[data-del-play]');
  if (l && !T.playing) {
    const p = S.jugadas.find(x => x.id === l.dataset.loadPlay); if (!p) return;
    T.meta = clone(p.meta); T.frames = clone(p.frames); T.formA = p.formA || T.formA; T.formB = p.formB || T.formB; T.showB = p.showB !== false;
    T.cur = 0; T.sel = null; T.loadedId = p.id; $('#t-name').value = p.nombre; $('#t-fa').value = T.formA; $('#t-fb').value = T.formB;
    const rb = $('#t-rival'); rb.setAttribute('aria-pressed', T.showB); rb.textContent = T.showB ? 'Rival visible' : 'Rival oculto';
    renderBoard(); renderPlays(); toast(`«${p.nombre}» abierta`);
  }
  if (d) arm(d, '¿Borrar?', async () => { const id = d.dataset.delPlay; if (await write(() => store.del('jugadas', id), 'Jugada borrada') && T.loadedId === id) { T.loadedId = null; } });
});

/* compartir la pizarra como imagen (Web Share en el celular, descarga en el PC) */
async function boardPng() {
  const css = getComputedStyle(document.documentElement);
  let s = new XMLSerializer().serializeToString(svg);
  s = s.replace(/var\(--([\w-]+)\)/g, (_, n) => css.getPropertyValue('--' + n).trim() || '#000');
  s = s.replace('<svg ', '<svg width="1110" height="740" ');
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); });
  const c = document.createElement('canvas'); c.width = 1665; c.height = 1110;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
$('#t-share').addEventListener('click', async () => {
  if (T.playing) return;
  const prevSel = T.sel; select(null);
  try {
    const blob = await boardPng();
    const nombre = ($('#t-name').value.trim() || 'pizarra') + (T.frames.length > 1 ? ` - paso ${T.cur + 1}` : '');
    const file = new File([blob], nombre.replace(/[\\/:*?"<>|]/g, '') + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nombre });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Imagen descargada');
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('No se pudo crear la imagen de la pizarra.');
  }
  if (prevSel) select(prevSel);
});

/* ---------- Boot ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err)); });
}

/* ---------- Botón Instalar (PC y celular) ---------- */
// Chrome/Edge/Android dan el aviso nativo; iPhone/iPad no, así que ahí se muestran los pasos.
let installEvt = null;
const installBtn = $('#installBtn');
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (!isStandalone() && isIOS) installBtn.hidden = false;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!isStandalone()) installBtn.hidden = false; });
window.addEventListener('appinstalled', () => { installEvt = null; installBtn.hidden = true; toast('TotalStats instalada'); });
installBtn.addEventListener('click', async () => {
  if (installEvt) {
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    installEvt = null;
    if (outcome === 'accepted') installBtn.hidden = true;
    return;
  }
  $('#install-help').innerHTML = isIOS
    ? '<ol class="steps"><li>Abre esta página en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elige <b>Agregar a pantalla de inicio</b> y luego <b>Agregar</b>.</li></ol>'
    : '<ol class="steps"><li><b>Celular Android:</b> abre el menú <b>⋮</b> de Chrome y elige <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</li><li><b>Computador:</b> en Chrome o Edge, pulsa el ícono de instalar en la barra de direcciones, o el menú <b>⋮</b> → <b>Instalar TotalStats</b>.</li></ol>';
  $('#dlg-install').showModal();
});
buildSliders(); updAvg(); $('#s-date').value = today();
drawPitch(); newBoard(); renderBoard(); renderAll();
const hashTab = location.hash.slice(1);
let startTab = ['panel', 'jugadores', 'sesiones', 'tactica'].includes(hashTab) ? hashTab : null;
if (!startTab) { try { startTab = localStorage.getItem('libreta-tab'); } catch {} }
go(['panel', 'jugadores', 'sesiones', 'tactica'].includes(startTab) ? startTab : 'panel');
initStore();
})();
