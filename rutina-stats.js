// ===== Pestaña Rutina: estadísticas de progreso, datos de prueba y planificación deportiva por edad y nivel =====
// Se carga después de rutina.js y usa lo que publican window.App y window.Rutina.
(() => {
const A = window.App, R = window.Rutina;
const { S, store, toast, uid, esc, today, fdate, playerById, sortedPlayers, arm, write } = A;
const { EJERCICIOS: EJ, phoneOf, exName, sesKey, noteBadge, NOTE_COLORS, labelOf } = R;
const $ = (s, r = document) => r.querySelector(s);
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/* ---------- Fechas ---------- */
const toDate = s => new Date(s + 'T00:00:00');
const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = s => { const d = toDate(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const GRANS = ['dia', 'semana', 'mes', 'anio'];
const GRAN_NAME = { dia: 'día', semana: 'semana', mes: 'mes', anio: 'año' };
const keyOf = (s, g) => (g === 'dia' ? s : g === 'semana' ? mondayOf(s) : g === 'mes' ? s.slice(0, 7) : s.slice(0, 4));
function nextKey(k, g) {
  if (g === 'dia') return addDays(k, 1);
  if (g === 'semana') return addDays(k, 7);
  if (g === 'mes') { let [y, m] = k.split('-').map(Number); if (++m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
  return String(+k + 1);
}
function labelOfKey(k, g) {
  if (g === 'anio') return k;
  if (g === 'mes') { const [y, m] = k.split('-'); return `${MES[+m - 1]} ${y.slice(2)}`; }
  const [, m, d] = k.split('-'); return `${+d} ${MES[+m - 1]}`;
}

/* ---------- Métricas ---------- */
const sum = (l, f) => l.reduce((a, e) => a + (f(e) || 0), 0);
const sesCount = l => new Set(l.map(e => sesKey(e) || `${e.fecha}|${e.ejercicio}`)).size;
const METRICAS = {
  reps: { label: 'Repeticiones', unit: 'reps', kind: 'bar', fill0: true, fn: l => sum(l, e => +e.total) },
  series: { label: 'Series', unit: 'series', kind: 'bar', fill0: true, fn: l => l.length },
  rps: { label: 'Reps por serie', unit: 'reps/serie', kind: 'line', dec: 1, fn: l => (l.length ? sum(l, e => +e.total) / l.length : null) },
  carga: { label: 'Carga máxima', unit: 'kg', kind: 'line', dec: 1, fn: l => { const m = Math.max(0, ...l.map(e => +e.carga || 0)); return m > 0 ? m : null; } },
  volumen: { label: 'Volumen (reps × kg)', unit: 'kg', kind: 'bar', fill0: true, fn: l => sum(l, e => (+e.total || 0) * (+e.carga || 0)) },
  nota: { label: 'Nota media', unit: 'pts', kind: 'line', dec: 0, max: 100, fn: l => { const n = sum(l, e => +e.total); return n ? sum(l, e => (+e.notaMedia || 0) * (+e.total || 0)) / n : null; } },
  min: { label: 'Tiempo de ejercicio', unit: 'min', kind: 'bar', fill0: true, dec: 1, fn: l => sum(l, e => +e.duracionSeg) / 60 },
  ses: { label: 'Sesiones', unit: 'sesiones', kind: 'bar', fill0: true, fn: l => sesCount(l) }
};
const st = { jug: lsGet('ts-st-jug') || '', ej: '', rut: '', gran: 'auto', rango: lsGet('ts-st-rango') || '180', met: lsGet('ts-st-met') || 'reps' };
if (!METRICAS[st.met]) st.met = 'reps';
const RANGOS = [['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['180', 'Últimos 6 meses'], ['365', 'Último año'], ['all', 'Todo']];

function filtered() {
  const lim = st.rango === 'all' ? '' : addDays(today(), -(+st.rango));
  return S.entrenos.filter(e => e.fecha && e.fecha >= lim && (!st.jug || e.jugadorId === st.jug) && (!st.ej || e.ejercicio === st.ej) && (!st.rut || (st.rut === '_libre' ? !e.rutinaId : e.rutinaId === st.rut)));
}

// Agrupa por día/semana/mes/año. Con «auto» elige el grupo según el rango y nunca dibuja más de 120 barras.
function buckets(list, met) {
  if (!list.length) return { gran: 'dia', pts: [] };
  const lo = list.reduce((a, e) => (e.fecha < a ? e.fecha : a), '9'), hi = list.reduce((a, e) => (e.fecha > a ? e.fecha : a), '');
  const span = (toDate(hi) - toDate(lo)) / 864e5 + 1;
  let g = st.gran === 'auto' ? (span <= 45 ? 'dia' : span <= 200 ? 'semana' : span <= 1100 ? 'mes' : 'anio') : st.gran;
  const count = gg => Math.ceil(span / ({ dia: 1, semana: 7, mes: 30.4, anio: 365 }[gg]));
  while (count(g) > 120 && g !== 'anio') g = GRANS[GRANS.indexOf(g) + 1];
  const map = new Map();
  list.forEach(e => { const k = keyOf(e.fecha, g); if (!map.has(k)) map.set(k, []); map.get(k).push(e); });
  const m = METRICAS[met], pts = [];
  for (let k = keyOf(lo, g), guard = 0; k <= keyOf(hi, g) && guard < 400; k = nextKey(k, g), guard++) {
    const l = map.get(k);
    const v = l ? m.fn(l) : (m.fill0 ? 0 : null);
    pts.push({ key: k, label: labelOfKey(k, g), value: v });
  }
  return { gran: g, pts };
}

/* ---------- Gráfico SVG (barras o línea, con escala automática y tendencia) ---------- */
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function chart(pts, { kind, unit, dec = 0, max = null }) {
  const vals = pts.map(p => p.value).filter(v => v != null);
  if (!vals.length) return '<p class="hint">No hay datos con estos filtros.</p>';
  const w = 640, h = 250, L = 48, Rr = 14, T = 22, B = 34, iw = w - L - Rr, ih = h - T - B, n = pts.length;
  const top0 = Math.max(...vals), step = niceStep((max || top0 || 1) / 4), top = max || Math.max(step, Math.ceil(top0 / step) * step);
  const x = i => L + ((i + 0.5) * iw) / n, y = v => T + ih - (v / top) * ih;
  const fmt = v => (dec ? v.toFixed(dec) : String(Math.round(v)));
  let g = '';
  for (let v = 0; v <= top + 1e-9; v += max ? max / 4 : step) g += `<line class="gl" x1="${L}" x2="${w - Rr}" y1="${y(v)}" y2="${y(v)}"/><text class="tx" x="${L - 7}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  const every = Math.ceil(n / 8);
  pts.forEach((p, i) => { if (i % every === 0 || i === n - 1) g += `<text class="tx" x="${x(i)}" y="${h - 10}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(p.label)}</text>`; });
  let body = '';
  const real = pts.map((p, i) => ({ ...p, i })).filter(p => p.value != null);
  if (kind === 'bar') {
    const bw = Math.max(2, Math.min(36, (iw / n) * 0.7));
    body = real.map(p => `<rect class="bar" x="${(x(p.i) - bw / 2).toFixed(1)}" y="${y(p.value).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, ih - (y(p.value) - T)).toFixed(1)}" rx="2"><title>${esc(p.label)}: ${fmt(p.value)} ${unit}</title></rect>`).join('');
  } else {
    const d = real.map((p, j) => `${j ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    body = (real.length > 1 ? `<path class="ar" d="${d} L${x(real[real.length - 1].i).toFixed(1)} ${y(0)} L${x(real[0].i).toFixed(1)} ${y(0)} Z"/>` : '') + `<path class="ln" d="${d}"/>` +
      real.map((p, j) => `<circle class="dt ${j === real.length - 1 ? 'end' : ''}" cx="${x(p.i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${j === real.length - 1 ? 5 : 3.2}"><title>${esc(p.label)}: ${fmt(p.value)} ${unit}</title></circle>`).join('');
  }
  // línea de tendencia (regresión lineal) si hay suficientes puntos
  let trend = '';
  if (real.length >= 4) {
    const mx = real.reduce((a, p) => a + p.i, 0) / real.length, my = real.reduce((a, p) => a + p.value, 0) / real.length;
    const den = real.reduce((a, p) => a + (p.i - mx) ** 2, 0) || 1, b = real.reduce((a, p) => a + (p.i - mx) * (p.value - my), 0) / den, a0 = my - b * mx;
    const c = v => Math.min(top, Math.max(0, v));
    trend = `<line class="tr" x1="${x(real[0].i)}" y1="${y(c(a0 + b * real[0].i))}" x2="${x(real[real.length - 1].i)}" y2="${y(c(a0 + b * real[real.length - 1].i))}"><title>Tendencia</title></line>`;
  }
  const last = real[real.length - 1];
  const lbl = `<text class="vl" x="${x(last.i)}" y="${Math.max(12, y(last.value) - 8)}" text-anchor="${n > 1 ? 'end' : 'middle'}">${fmt(last.value)}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de ${esc(unit)}">${g}${body}${trend}${lbl}</svg>`;
}

/* ---------- Pestaña Estadísticas ---------- */
const fmtH = min => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`);
const chipDelta = (a, b, unit = '', dec = 0) => {
  if (a == null || b == null) return '<span class="chip">–</span>';
  const d = b - a; if (Math.abs(d) < (dec ? 0.05 : 0.5)) return '<span class="chip">= 0</span>';
  const pct = a ? ` (${d > 0 ? '+' : ''}${Math.round((d / a) * 100)} %)` : '';
  return `<span class="chip ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(dec)}${unit}${pct}</span>`;
};
function progressRows(list) {
  const g = new Map(); list.forEach(e => { if (!g.has(e.ejercicio)) g.set(e.ejercicio, []); g.get(e.ejercicio).push(e); });
  return [...g.entries()].map(([id, l]) => {
    l.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.inicio || 0) - (b.inicio || 0));
    const k = Math.max(1, Math.floor(l.length / 4)), first = l.slice(0, k), last = l.slice(-k);
    const rps = x => sum(x, e => +e.total) / x.length, car = x => Math.max(0, ...x.map(e => +e.carga || 0)) || null;
    const nt = x => { const n = sum(x, e => +e.total); return n ? sum(x, e => (+e.notaMedia || 0) * (+e.total || 0)) / n : null; };
    const spp = x => { const m = new Map(); x.forEach(e => { const kk = sesKey(e) || `${e.fecha}|${e.ejercicio}`; m.set(kk, (m.get(kk) || 0) + 1); }); return [...m.values()].reduce((a, b) => a + b, 0) / m.size; };
    return { id, n: l.length, rps: [rps(first), rps(last)], car: [car(first), car(last)], nota: [nt(first), nt(last)], spp: [spp(first), spp(last)], max: Math.max(...l.map(e => +e.total || 0)), maxCar: car(l), best: Math.max(...l.map(e => +e.notaMedia || 0)), reps: sum(l, e => +e.total) };
  }).sort((a, b) => b.reps - a.reps);
}
function streakWeeks(list) {
  const wk = new Set(list.map(e => mondayOf(e.fecha))); let k = mondayOf(today()), n = 0;
  if (!wk.has(k)) k = addDays(k, -7);
  while (wk.has(k)) { n++; k = addDays(k, -7); }
  return n;
}
function renderStats() {
  const box = $('#ru-stats'); if (!box) return;
  const all = S.entrenos;
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  const head = `<div class="head-row"><div><div class="eyebrow">Progreso</div><h3>Estadísticas de entrenamiento</h3></div>
    <div class="toolbar">${all.some(e => e.ejemplo) ? '<button class="btn sm ghost danger" type="button" data-st="clear-test">Borrar datos de prueba</button>' : ''}<button class="btn sm" type="button" data-st="load-test">Cargar datos de prueba</button></div></div>`;
  if (!all.length) { box.innerHTML = `${head}<div class="empty-st"><p style="margin:0;max-width:52ch">Aún no hay entrenos guardados. Cuando guardes ejercicios aquí verás cómo suben las series, las repeticiones y las cargas con el tiempo. Para ver cómo funciona, carga datos de prueba (se pueden borrar después).</p></div>`; return; }
  const rutinas = [...new Map(all.filter(e => e.rutinaId).map(e => [e.rutinaId, (R.rutinaName(e))])).entries()];
  const filters = `<div class="st-filters">
    <label class="f">Jugador<select data-stf="jug">${opt('', 'Todos', st.jug)}${sortedPlayers().map(j => opt(j.id, j.nombre, st.jug)).join('')}</select></label>
    <label class="f">Ejercicio<select data-stf="ej">${opt('', 'Todos', st.ej)}${Object.values(EJ).map(e => opt(e.id, e.nombre, st.ej)).join('')}</select></label>
    <label class="f">Rutina<select data-stf="rut">${opt('', 'Todas', st.rut)}${opt('_libre', 'Práctica libre', st.rut)}${rutinas.map(([id, n]) => opt(id, n, st.rut)).join('')}</select></label>
    <label class="f">Periodo<select data-stf="rango">${RANGOS.map(([v, l]) => opt(v, l, st.rango)).join('')}</select></label>
    <label class="f">Agrupar por<select data-stf="gran">${opt('auto', 'Automático', st.gran)}${GRANS.map(g => opt(g, g === 'dia' ? 'Día' : g === 'semana' ? 'Semana' : g === 'mes' ? 'Mes' : 'Año', st.gran)).join('')}</select></label>
    <label class="f">Métrica<select data-stf="met">${Object.entries(METRICAS).map(([k, m]) => opt(k, m.label, st.met)).join('')}</select></label></div>`;
  const list = filtered();
  if (!list.length) { box.innerHTML = `${head}${filters}<p class="hint">No hay entrenos con estos filtros. Prueba con un periodo más largo.</p>`; return; }
  const m = METRICAS[st.met], b = buckets(list, st.met);
  const days = new Set(list.map(e => e.fecha)).size, reps = sum(list, e => +e.total), vol = sum(list, e => (+e.total || 0) * (+e.carga || 0));
  const nota = METRICAS.nota.fn(list), maxCar = METRICAS.carga.fn(list);
  const tiles = [[sesCount(list), 'Sesiones'], [days, 'Días entrenados'], [list.length, 'Series'], [reps, 'Repeticiones'], [maxCar != null ? maxCar + ' kg' : '–', 'Carga máx.'], [vol ? Math.round(vol).toLocaleString('es') + ' kg' : '–', 'Volumen'], [nota != null ? `<i style="font-style:normal;color:${NOTE_COLORS[labelOf(Math.round(nota))]}">${Math.round(nota)}</i>` : '–', 'Nota media'], [fmtH(sum(list, e => +e.duracionSeg) / 60), 'Tiempo'], [streakWeeks(list) + ' sem.', 'Racha semanal']];
  // progreso por ejercicio (primer cuarto vs último cuarto del periodo)
  const rows = progressRows(list);
  // distribución por ejercicio y por día de la semana
  const totalReps = reps || 1, byDow = Array(7).fill(0);
  new Map(list.map(e => [sesKey(e) || e.id, e.fecha])).forEach(f => { byDow[(toDate(f).getDay() + 6) % 7]++; });
  const maxDow = Math.max(1, ...byDow);
  const chartTitle = `${m.label} por ${GRAN_NAME[b.gran]}`;
  box.innerHTML = `${head}${filters}
    <div class="statrow st-tiles">${tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <div><div class="head-row" style="margin-bottom:6px"><h4 style="margin:0">${esc(chartTitle)}</h4><span class="hint">${b.pts.length} ${b.pts.length === 1 ? 'punto' : 'puntos'}${st.gran !== 'auto' && b.gran !== st.gran ? ` · se agrupó por ${GRAN_NAME[b.gran]} (demasiados puntos)` : ''}${b.pts.length >= 4 ? ' · línea discontinua = tendencia' : ''}</span></div>
      <div class="chart">${chart(b.pts, { kind: m.kind, unit: m.unit, dec: m.dec || 0, max: m.max || null })}</div></div>
    <div><h4 style="margin:0 0 6px">Progreso por ejercicio</h4><p class="hint" style="margin:0 0 8px">Compara el inicio del periodo (primer cuarto de los entrenos) con el final (último cuarto).</p>
      <div class="tbl-wrap"><table><thead><tr><th>Ejercicio</th><th class="n">Series</th><th class="n">Series / sesión</th><th class="n">Reps / serie</th><th class="n">Carga máx.</th><th class="n">Nota</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(exName(r.id))} ${phoneOf(r.id)}</td><td class="n">${r.n}</td><td class="n">${r.spp[1].toFixed(1)} ${chipDelta(r.spp[0], r.spp[1], '', 1)}</td><td class="n">${r.rps[1].toFixed(1)} ${chipDelta(r.rps[0], r.rps[1], '', 1)}</td><td class="n">${r.car[1] != null ? r.car[1] + ' kg ' : '– '}${chipDelta(r.car[0], r.car[1], ' kg', 1)}</td><td class="n">${r.nota[1] != null ? Math.round(r.nota[1]) + ' ' : '– '}${chipDelta(r.nota[0], r.nota[1])}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="st-two">
      <div><h4 style="margin:0 0 6px">Mejores marcas</h4><div class="tbl-wrap"><table><thead><tr><th>Ejercicio</th><th class="n">Máx. reps en una serie</th><th class="n">Carga máx.</th><th class="n">Mejor nota</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(exName(r.id))}</td><td class="n">${r.max}</td><td class="n">${r.maxCar != null ? r.maxCar + ' kg' : '–'}</td><td class="n">${noteBadge(r.best)}</td></tr>`).join('')}</tbody></table></div></div>
      <div><h4 style="margin:0 0 6px">Reparto de repeticiones</h4><div class="hbars">
        ${rows.map(r => `<div class="hb"><span>${esc(exName(r.id))}</span><i style="width:${Math.max(2, Math.round((r.reps / totalReps) * 100))}%"></i><em>${Math.round((r.reps / totalReps) * 100)} %</em></div>`).join('')}</div>
        <h4 style="margin:14px 0 6px">Sesiones por día de la semana</h4><div class="dow">${byDow.map((v, i) => `<div title="${v} ${v === 1 ? 'sesión' : 'sesiones'}"><i style="height:${Math.round((v / maxDow) * 56) + 3}px"></i><span>${DIAS[i]}</span></div>`).join('')}</div></div>
    </div>`;
}

/* ---------- Datos de prueba: ~14 meses con progresión realista, una pausa y dos rutinas ---------- */
async function loadTest() {
  if (S.entrenos.some(e => e.ejemplo)) { toast('Los datos de prueba ya están cargados.'); return; }
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const jug = (sortedPlayers()[0] || {}).id || '';
  const rutinas = [
    { id: 'ej-ru-a', nombre: 'Piernas y core', ejemplo: true, creado: Date.now() - 2, items: [{ ejercicio: 'bulgaras', series: 3, reps: 8, carga: 4, descansoSeg: 75 }, { ejercicio: 'sentadillas', series: 3, reps: 12, carga: 0, descansoSeg: 60 }, { ejercicio: 'abdominales', series: 3, reps: 15, carga: 0, descansoSeg: 45 }] },
    { id: 'ej-ru-b', nombre: 'Tren superior y balón', ejemplo: true, creado: Date.now() - 1, items: [{ ejercicio: 'flexiones', series: 3, reps: 10, carga: 0, descansoSeg: 60 }, { ejercicio: 'laterales', series: 3, reps: 10, carga: 2, descansoSeg: 60 }, { ejercicio: 'balon', series: 3, reps: 30, carga: 0, descansoSeg: 45 }] }
  ];
  if (jug) rutinas.forEach(r => { r.jugadorId = jug; });
  // base de cada ejercicio: [reps al inicio, reps ganadas en el periodo, carga inicial, carga ganada]
  const BASE = { bulgaras: [6, 6, 3, 9], sentadillas: [10, 10, 0, 0], abdominales: [12, 14, 0, 0], flexiones: [6, 12, 0, 0], laterales: [8, 6, 1, 5], balon: [18, 30, 0, 0] };
  const DAYS = 420, start = addDays(today(), -DAYS), out = []; let ab = 0;
  for (let d = 0; d <= DAYS; d++) {
    const f = addDays(start, d), dow = (toDate(f).getDay() + 6) % 7;
    if (![0, 2, 4].includes(dow) || (d > 230 && d < 252) || rnd() > 0.78) continue;         // lunes, miércoles y viernes; una pausa de 3 semanas
    const t = d / DAYS, ru = rutinas[ab++ % 2], sesionId = `ej-s-${d}`, series0 = 2 + Math.floor(t * 2.4), inicio0 = toDate(f).getTime() + 18 * 36e5;
    let k = 0; const plan = ru.items.length * series0;
    ru.items.forEach((it, ii) => {
      const b = BASE[it.ejercicio];
      for (let s = 1; s <= series0; s++) {
        const reps = Math.max(3, Math.round(b[0] + b[1] * t + (rnd() - 0.5) * 3 - (s - 1) * 0.8));
        const car = b[3] ? Math.round((b[2] + b[3] * t) * 2) / 2 : 0, nota = Math.max(35, Math.min(98, Math.round(52 + 30 * t + (rnd() - 0.5) * 14 - (s - 1) * 2)));
        const total = reps, completas = Math.min(total, Math.round(total * (0.75 + 0.22 * t + (rnd() - 0.5) * 0.1)));
        out.push({ id: `ej-e-${d}-${ii}-${s}`, ejemplo: true, ejercicio: it.ejercicio, fecha: f, inicio: inicio0 + (k++) * 6e4 * 2, duracionSeg: Math.round(total * (it.ejercicio === 'balon' ? 1.1 : 3.4)), reps: [], total, completas, notaMedia: nota, carga: car, objetivo: it.reps,
          rutinaId: ru.id, rutinaNombre: ru.nombre, sesionId, serie: s, series: series0, paso: ii + 1, pasos: ru.items.length, seriesPlan: plan, ...(jug ? { jugadorId: jug } : {}) });
      }
    });
  }
  await write(async () => { await store.putMany('rutinas', rutinas); await store.putMany('entrenos', out); }, `Datos de prueba cargados (${out.length} series)`);
}
async function clearTest() {
  await write(async () => {
    await store.delMany('entrenos', S.entrenos.filter(e => e.ejemplo).map(e => e.id));
    await store.delMany('rutinas', S.rutinas.filter(r => r.ejemplo).map(r => r.id));
  }, 'Datos de prueba borrados');
}

/* ---------- Planificación deportiva por edad y nivel ---------- */
const NIVELES = [['principiante', 'Principiante', 'Menos de 3 meses entrenando con regularidad.'], ['intermedio', 'Intermedio', 'Entre 3 meses y 2 años entrenando con regularidad.'], ['avanzado', 'Avanzado', 'Más de 2 años de entrenamiento constante y buena técnica.']];
const BANDS = [
  { id: '6-8', min: 0, max: 8, label: '6–8 años', n: 2, dur: '40–50 min', maxS: 3, maxR: 14,
    foco: 'Jugar y moverse: coordinación, equilibrio, agilidad y mucho contacto con el balón, siempre en forma de juego.',
    cargas: 'Solo el peso del cuerpo. Nada de pesas ni de repeticiones hasta el cansancio.',
    base: { balon: [2, 10, 60], sentadillas: [2, 6, 60], abdominales: [2, 6, 60], flexiones: [2, 4, 75] },
    reglas: ['El objetivo es divertirse y aprender a moverse; evita especializarse pronto y las comparaciones de marcas.', 'Sesiones cortas y variadas; los ejercicios de la app son un complemento, no el centro.', 'Pausas para beber agua cada 15–20 minutos.'] },
  { id: '9-11', min: 9, max: 11, label: '9–11 años', n: 3, dur: '50–60 min', maxS: 3, maxR: 16,
    foco: 'Etapa ideal para aprender técnica: control, pase y conducción con ambos pies, coordinación y fuerza con el propio cuerpo.',
    cargas: 'Solo peso corporal; que la técnica sea limpia antes de subir repeticiones.',
    base: { balon: [2, 16, 45], sentadillas: [2, 8, 60], abdominales: [2, 8, 60], flexiones: [2, 5, 60] },
    reglas: ['Pocos conceptos por sesión y muchas repeticiones con balón, con pie derecho e izquierdo por igual.', 'Un día de descanso completo como mínimo entre sesiones de fuerza.', 'Dormir 9–11 horas ayuda a crecer y a aprender los gestos técnicos.'] },
  { id: '12-14', min: 12, max: 14, label: '12–14 años', n: 3, dur: '60–75 min', maxS: 4, maxR: 20,
    foco: 'Técnica a más velocidad y primeras bases de fuerza con el propio peso. Es una etapa de crecimiento rápido: hay que cuidar rodillas, talones y espalda.',
    cargas: 'Peso corporal y, como mucho, mancuernas muy ligeras (0,5–2 kg) con técnica perfecta. Sin cargas máximas.',
    base: { balon: [3, 20, 45], sentadillas: [3, 10, 60], bulgaras: [2, 6, 75], abdominales: [3, 10, 45], flexiones: [3, 6, 60], laterales: [2, 8, 60] },
    reglas: ['Si aparece dolor en la rodilla o el talón (típico del crecimiento), baja la carga y consulta a un profesional.', 'Evita saltos y sprints repetidos en días seguidos.', 'Introduce la fuerza en 2 sesiones por semana como máximo.'] },
  { id: '15-17', min: 15, max: 17, label: '15–17 años', n: 4, dur: '75–90 min', maxS: 4, maxR: 24,
    foco: 'Fuerza progresiva con buena técnica, velocidad y resistencia específica del fútbol. Se pueden usar cargas moderadas.',
    cargas: 'Cargas moderadas que permitan 8–12 repeticiones limpias; sube de a poco y siempre con técnica correcta.',
    base: { balon: [3, 24, 45], sentadillas: [3, 10, 75], bulgaras: [3, 8, 75], abdominales: [3, 12, 45], flexiones: [3, 8, 60], laterales: [3, 8, 60] },
    reglas: ['Combina 2 sesiones de fuerza con 1–2 de técnica/velocidad y el partido.', 'Dormir 8–10 horas y comer bien: es cuando el cuerpo se adapta.', 'Cada 4 semanas, una semana más suave para recuperar.'] },
  { id: '18-35', min: 18, max: 35, label: '18–35 años', n: 4, dur: '75–90 min', maxS: 5, maxR: 30,
    foco: 'Rendimiento: fuerza, potencia, resistencia y técnica bajo fatiga, organizados en ciclos de carga y descarga.',
    cargas: 'Cargas medias-altas con técnica estable; progresión planificada semana a semana.',
    base: { balon: [3, 30, 40], sentadillas: [3, 12, 75], bulgaras: [3, 8, 75], abdominales: [3, 15, 45], flexiones: [3, 10, 60], laterales: [3, 10, 60] },
    reglas: ['Periodiza: 3 semanas de carga creciente y 1 de descarga (−40 % de volumen).', 'Al menos 48 h entre sesiones de fuerza del mismo grupo muscular.', 'Calienta 10–15 min y termina con movilidad y estiramientos.'] },
  { id: '36+', min: 36, max: 120, label: '36 años o más', n: 3, dur: '50–70 min', maxS: 4, maxR: 24,
    foco: 'Mantener y mejorar la fuerza, el equilibrio y la resistencia cuidando articulaciones y tendones; más recuperación entre sesiones.',
    cargas: 'Cargas moderadas, repeticiones controladas y sin llegar al fallo.',
    base: { balon: [3, 24, 50], sentadillas: [3, 10, 90], bulgaras: [2, 8, 90], abdominales: [3, 12, 60], flexiones: [3, 8, 75], laterales: [3, 8, 75] },
    reglas: ['Calentamiento largo (12–15 min) y 48–72 h de recuperación entre sesiones intensas.', 'Refuerza core, tobillos y rodillas para prevenir lesiones.', 'Si llevas tiempo sin entrenar o tienes alguna condición médica, consulta a un médico antes de empezar.'] }
];
const KG = { laterales: { '12-14': [1, 1.5, 2], '15-17': [2, 3, 5], '18-35': [3, 5, 8], '36+': [2, 4, 6] }, bulgaras: { '12-14': [0, 0, 2], '15-17': [0, 4, 8], '18-35': [0, 8, 14], '36+': [0, 6, 10] } };
const LV = [{ s: 0, r: 1, d: 1 }, { s: 1, r: 1.4, d: 0.9 }, { s: 2, r: 1.8, d: 0.8 }];
const pl = { jug: '', edad: lsGet('ts-pl-edad') || '', nivel: lsGet('ts-pl-nivel') || 'principiante' };
const bandOf = age => BANDS.find(b => age <= b.max && (age >= b.min || b.id === '6-8')) || BANDS[BANDS.length - 1];
function planFor(age, li) {
  const b = bandOf(age), lv = LV[li], ex = {};
  Object.entries(b.base).forEach(([id, [s, r, d]]) => {
    const kg = KG[id] && KG[id][b.id] ? KG[id][b.id][li] : 0;
    ex[id] = { series: Math.min(b.maxS, s + lv.s), reps: Math.min(b.maxR, Math.round(r * lv.r)), descansoSeg: Math.round((d * lv.d) / 5) * 5, carga: kg };
  });
  const n = Math.min(5, b.n + (li === 2 && age >= 15 ? 1 : 0));
  return { b, ex, n };
}
const WEEK = {
  2: ['Rutina A (piernas y core) + juego con balón', 'Rutina B (tren superior y balón) + juego'],
  3: ['Rutina A · piernas y core', 'Rutina B · tren superior y balón', 'Técnica con balón y juego (sin cargas)'],
  4: ['Rutina A · piernas y core', 'Rutina B · tren superior y balón', 'Técnica y velocidad con balón', 'Rutina A más ligera + movilidad'],
  5: ['Rutina A · piernas y core', 'Rutina B · tren superior y balón', 'Técnica y velocidad con balón', 'Rutina A más ligera + movilidad', 'Partido o juego + resistencia suave']
};
const RUTA = ['sentadillas', 'bulgaras', 'abdominales'], RUTB = ['flexiones', 'laterales', 'balon'];
function ageFromPlayer(id) { const j = id && playerById(id); return j && +j.anio ? new Date().getFullYear() - +j.anio : ''; }
function renderPlan() {
  const box = $('#ru-plan'); if (!box) return;
  const age = +pl.edad, li = Math.max(0, NIVELES.findIndex(n => n[0] === pl.nivel));
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  let out = `<div><div class="eyebrow">Planificación deportiva</div><h3>Recomendaciones según edad y nivel</h3><p class="hint" style="margin:4px 0 0">Orientación general para organizar la semana. No sustituye a un entrenador ni a un médico.</p></div>
    <div class="st-filters"><label class="f">Jugador (opcional)<select data-plf="jug">${opt('', 'Sin jugador', pl.jug)}${sortedPlayers().map(j => opt(j.id, j.nombre + (j.anio ? ` (${new Date().getFullYear() - +j.anio} años)` : ''), pl.jug)).join('')}</select></label>
      <label class="f">Edad<input type="number" data-plf="edad" min="6" max="90" value="${esc(pl.edad)}" placeholder="Años"></label>
      <label class="f">Nivel<select data-plf="nivel">${NIVELES.map(([v, l]) => opt(v, l, pl.nivel)).join('')}</select></label></div>
    <p class="hint" style="margin:0">${esc(NIVELES[li][2])}</p>`;
  if (!age || age < 5 || age > 90) { box.innerHTML = out + '<p class="hint">Indica la edad (o elige un jugador con año de nacimiento) para ver la planificación.</p>'; return; }
  const p = planFor(age, li), b = p.b;
  const rowsEx = Object.entries(p.ex).map(([id, e]) => `<tr><td>${esc(exName(id))} ${phoneOf(id)}</td><td class="n">${e.series} × ${e.reps}</td><td class="n">${e.carga ? e.carga + ' kg' : 'peso corporal'}</td><td class="n">${e.descansoSeg} s</td></tr>`).join('');
  out += `<div class="plan-sum"><div><b>${p.n}</b><span>sesiones por semana</span></div><div><b>${b.dur}</b><span>por sesión</span></div><div><b>${b.label}</b><span>${esc(NIVELES[li][1])}</span></div></div>
    <div class="plan-box"><h4>Enfoque</h4><p>${esc(b.foco)}</p><h4>Cargas</h4><p>${esc(b.cargas)}</p></div>
    <div><h4 style="margin:0 0 6px">Semana tipo</h4><ol class="plan-week">${WEEK[p.n].map(t => `<li>${esc(t)}</li>`).join('')}</ol><p class="hint" style="margin:6px 0 0">Los demás días: descanso o actividad suave (caminar, jugar, movilidad). El partido o el entrenamiento del equipo cuentan como sesión.</p></div>
    <div><h4 style="margin:0 0 6px">Ejercicios recomendados</h4><div class="tbl-wrap"><table><thead><tr><th>Ejercicio</th><th class="n">Series × reps</th><th class="n">Carga</th><th class="n">Descanso</th></tr></thead><tbody>${rowsEx}</tbody></table></div></div>
    <div><h4 style="margin:0 0 6px">Cómo progresar</h4><ul class="plan-list">
      <li>Cuando completes todas las series con buena nota (más de 70), sube <b>1 repetición por serie</b>; al llegar al tope, <b>1 serie más</b>; y solo después, un poco de carga (≈5 %, solo desde los 15 años).</li>
      <li>Cada 4.ª semana, una semana de descarga: baja a la mitad las series.</li>
      ${b.reglas.map(r => `<li>${esc(r)}</li>`).join('')}
      <li>Revisa la pestaña <b>Estadísticas</b> cada mes: debería subir la nota y las repeticiones por serie, no solo el volumen.</li></ul></div>
    <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" data-pl="create">Crear las rutinas A y B con estas recomendaciones</button></div>`;
  box.innerHTML = out;
}
async function createPlanRutinas() {
  const age = +pl.edad; if (!age) return;
  const li = Math.max(0, NIVELES.findIndex(n => n[0] === pl.nivel)), p = planFor(age, li);
  const mk = ids => ids.filter(id => p.ex[id]).map(id => ({ ejercicio: id, ...p.ex[id] }));
  const sets = [['A · piernas y core', mk(RUTA)], ['B · tren superior y balón', mk(RUTB)]];
  await write(async () => {
    for (const [i, [name, items]] of sets.entries()) {
      const d = { nombre: `Plan ${p.b.label} · ${NIVELES[li][1]} · ${name}`, items, creado: Date.now() + i };
      if (pl.jug) d.jugadorId = pl.jug;
      await store.put('rutinas', uid(), d);
    }
  }, 'Rutinas creadas: las verás en «Entrenar»');
}

/* ---------- Eventos ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-st],[data-pl]'); if (!t) return;
  if (t.dataset.st === 'load-test') loadTest();
  else if (t.dataset.st === 'clear-test') arm(t, '¿Borrar todo?', clearTest);
  else if (t.dataset.pl === 'create') createPlanRutinas();
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.stf) { st[t.dataset.stf] = t.value; if (t.dataset.stf === 'jug') lsSet('ts-st-jug', t.value); if (t.dataset.stf === 'rango') lsSet('ts-st-rango', t.value); if (t.dataset.stf === 'met') lsSet('ts-st-met', t.value); renderStats(); }
  else if (t.dataset.plf) {
    pl[t.dataset.plf] = t.value;
    if (t.dataset.plf === 'jug') { const a = ageFromPlayer(t.value); if (a) pl.edad = String(a); }
    lsSet('ts-pl-edad', pl.edad); lsSet('ts-pl-nivel', pl.nivel); renderPlan();
  }
});
document.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.plf === 'edad') { pl.edad = t.value; lsSet('ts-pl-edad', pl.edad); clearTimeout(renderPlan._t); renderPlan._t = setTimeout(() => { const f = document.activeElement; renderPlan(); const i = $('[data-plf="edad"]'); if (i && f && f.dataset && f.dataset.plf === 'edad') { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 500); } });

window.RutinaStats = { render() { if (!$('#ru-p-estadisticas').hidden) renderStats(); if (!$('#ru-p-plan').hidden) renderPlan(); }, loadTest, clearTest };
window.RutinaStats.render();
})();
