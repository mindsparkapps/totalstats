// ===== Pestaña Rutina: catálogo de ejercicios, constructor de rutinas, historial y modo desarrollador =====
// Usa window.App (lo publica app.js). La detección con cámara vive en pushup.js, que se carga solo al abrir el ejercicio.
(() => {
const A = window.App;
const { S, store, toast, uid, esc, today, fdate, playerById, sortedPlayers, arm, write, videoDb, lineChart } = A;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EJERCICIOS = {
  flexiones: { id: 'flexiones', nombre: 'Flexiones de brazo', unidad: 'flexiones', icono: '💪', desc: 'La cámara cuenta cada flexión, la califica de 0 a 100 y graba el video con el contador. Se puede colocar el celular de frente o de costado.',
    views: [
      { id: 'frontal', label: 'De frente (celular vertical, cámara frontal)', orient: 'v', facing: 'user', svg: 'front', guia: 'Apoya el celular <b>en vertical</b> en el suelo, con la <b>cámara frontal</b>, frente a ti. Ponte en plancha con la <b>cabeza hacia la cámara</b> y los pies al fondo, a 1–1,5 m. Que se vean la cabeza, los hombros y las manos.', ajuste: 'aleja un poco el celular: deben verse la cabeza, los hombros y las manos.', luz: 'Elige un video de flexiones (de frente) para empezar.', pose: 'ponte en plancha con la cabeza hacia la cámara' },
      { id: 'lateral', label: 'De costado (celular horizontal)', orient: 'h', facing: 'environment', svg: 'side', guia: 'Apoya el celular en el suelo, <b>de costado</b>, a 1,5–2 m y en horizontal. Que se vea el cuerpo entero.', ajuste: 'aleja el celular y ponlo de costado.', luz: 'Elige un video de flexiones (de costado) para empezar.', pose: 'colócate en posición de plancha' }
    ] },
  sentadillas: { id: 'sentadillas', nombre: 'Sentadillas', unidad: 'sentadillas', icono: '🏋️', desc: 'La cámara cuenta cada sentadilla, la califica de 0 a 100 según lo que bajas y lo erguido que mantienes el torso, y graba el video. Se coloca el celular de costado.',
    views: [{ id: 'lateral', label: 'De costado', orient: 'h', facing: 'environment', svg: 'squat', guia: 'Apoya el celular en el suelo o en algo bajo, <b>de costado</b>, a 2–2,5 m y en horizontal. Que se vea de la cabeza a los pies.', ajuste: 'aleja el celular y ponte de costado.', luz: 'Elige un video de sentadillas (de costado) para empezar.', pose: 'ponte de pie de costado a la cámara' }] },
  bulgaras: { id: 'bulgaras', nombre: 'Sentadilla búlgara', unidad: 'sentadillas búlgaras', icono: '🦵', desc: 'Con un pie atrás sobre un banco. La cámara mide la rodilla de la pierna de adelante, cuenta cada repetición y la califica. Se coloca el celular de costado.',
    views: [{ id: 'lateral', label: 'De costado', orient: 'h', facing: 'environment', svg: 'squat', guia: 'Apoya el celular en el suelo, <b>de costado</b>, a 2–2,5 m y en horizontal. Que se vean la cabeza, las dos piernas y el banco.', ajuste: 'aleja el celular y ponte de costado, con las dos piernas a la vista.', luz: 'Elige un video de sentadillas búlgaras (de costado) para empezar.', pose: 'ponte de costado, con el pie de atrás en el banco' }] },
  abdominales: { id: 'abdominales', nombre: 'Abdominales', unidad: 'abdominales', icono: '🔥', desc: 'La cámara mide cuánto incorporas el tronco, cuenta cada abdominal y lo califica. Acostado, con el celular de costado.',
    views: [{ id: 'lateral', label: 'De costado', orient: 'h', facing: 'environment', svg: 'side', guia: 'Apoya el celular en el suelo, <b>de costado</b>, a 1,5–2 m y en horizontal. Acuéstate de modo que se vea el cuerpo entero.', ajuste: 'aleja el celular y ponlo de costado.', luz: 'Elige un video de abdominales (de costado) para empezar.', pose: 'acuéstate de costado a la cámara' }] },
  laterales: { id: 'laterales', nombre: 'Elevaciones laterales con mancuernas', unidad: 'elevaciones', icono: '🏋️‍♂️', desc: 'De frente a la cámara: mide hasta dónde subes los brazos (la altura del hombro es lo ideal) y si los mantienes casi rectos.',
    views: [{ id: 'frontal', label: 'De frente', orient: 'v', facing: 'user', svg: 'standing', guia: 'Apoya el celular <b>en vertical</b>, con la cámara frontal, frente a ti, a 2 m. Ponte de pie de frente: deben verse los hombros, los brazos y la cadera.', ajuste: 'aleja el celular: deben verse los hombros, los brazos y la cadera.', luz: 'Elige un video de elevaciones laterales (de frente) para empezar.', pose: 'ponte de pie de frente a la cámara' }] },
  balon: { id: 'balon', nombre: 'Balón: cambios de pie', unidad: 'cambios de pie', icono: '⚽', desc: 'Pasa el balón de un pie al otro. La cámara ve tus pies y el balón, cuenta cada cambio de pie izquierdo ↔ derecho y lo califica por lo pegado que llevas el balón y por el ritmo. Celular horizontal, de frente.',
    views: [{ id: 'frontal', label: 'De frente (celular horizontal)', orient: 'h', facing: 'environment', svg: 'ball', guia: 'Apoya el celular <b>en horizontal</b> en el suelo, de frente a ti, a 2,5–3 m. Que se vean <b>tus dos pies y el balón</b> (mejor un balón claro sobre suelo oscuro). Pasa el balón de un pie al otro sin moverte mucho de sitio.', ajuste: 'aleja el celular: deben verse tus dos pies enteros.', luz: 'Elige un video de balón entre los pies (de frente) para empezar.', pose: 'ponte de frente a la cámara con el balón en los pies' }] }
};
const viewsOf = id => (EJERCICIOS[id] || EJERCICIOS.flexiones).views;
const viewOf = id => { const vs = viewsOf(id), saved = lsGet('ts-view-' + id); return vs.find(v => v.id === saved) || vs[0]; };
const unidadDe = id => (EJERCICIOS[id] || EJERCICIOS.flexiones).unidad;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const NOTE_COLORS = { Excelente: '#2ecc71', Buena: '#8bd450', Regular: '#f0a92e', Incompleta: '#e74c4c' };
const labelOf = n => (n >= 85 ? 'Excelente' : n >= 70 ? 'Buena' : n >= 50 ? 'Regular' : 'Incompleta');
const noteBadge = n => `<span class="rating" style="background:${NOTE_COLORS[labelOf(n)]};color:#10241a" title="${labelOf(n)}">${n}</span>`;
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const devTracking = () => lsGet('ts-dev-tracking') === '1';
const voiceOn = () => lsGet('ts-voz') !== '0';
const fmtMB = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/* ---------- Videos locales: qué ids existen en este dispositivo ---------- */
let vidIds = new Set(), vidState = 0;
async function loadVidIds() {
  if (vidState === 1) return; vidState = 1;
  try { vidIds = new Set(await videoDb.keys()); vidState = 2; render(); } catch { vidState = 0; }
}

/* ---------- Render de la pestaña ---------- */
/* Icono de cómo va el celular: vertical u horizontal (según la posición elegida en la lista desplegable) */
const phoneIcon = o => o === 'v'
  ? '<svg class="ph-ico" viewBox="0 0 16 24" role="img" aria-label="Celular en vertical"><title>Celular en vertical</title><rect x="3" y="1.5" width="10" height="21" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="19.4" r="1" fill="currentColor"/></svg>'
  : '<svg class="ph-ico" viewBox="0 0 24 16" role="img" aria-label="Celular en horizontal"><title>Celular en horizontal</title><rect x="1.5" y="3" width="21" height="10" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="19.4" cy="8" r="1" fill="currentColor"/></svg>';
const phoneOf = id => phoneIcon(viewOf(id).orient);

/* ---------- Rutina en curso: si se sale antes de terminar, se puede continuar donde quedó ---------- */
const PROG_KEY = 'ts-prog';
const progAll = () => { try { return JSON.parse(lsGet(PROG_KEY) || '{}') || {}; } catch { return {}; } };
const progOf = r => { const p = progAll()[r.id]; return p && p.idx > 0 && p.idx < buildQueue(r).length && p.n === buildQueue(r).length ? p : null; };
const progSet = (id, v) => { const a = progAll(); if (v) a[id] = v; else delete a[id]; lsSet(PROG_KEY, JSON.stringify(a)); };

function itemsSummary(r) {
  return (r.items || []).map(it => `${esc((EJERCICIOS[it.ejercicio] || {}).nombre || it.ejercicio)} ${phoneOf(it.ejercicio)} ${+it.series || 1}×${+it.reps || 0}${+it.carga ? ` · ${+it.carga} kg` : ''}${it.descansoSeg ? ` · desc. ${+it.descansoSeg} s` : ''}`).join(' · ');
}

/* ---------- Historial: tres vistas (ejercicios, ejercicios por rutina, rutinas completas) ---------- */
let subTab = lsGet('ts-ru-sub') || 'entrenar', histMode = 'ej', histJug = '', histLimit = 40;
const exName = id => (EJERCICIOS[id] || {}).nombre || id;
const avgNota = es => { const n = es.reduce((a, e) => a + (+e.total || 0), 0); return n ? Math.round(es.reduce((a, e) => a + (+e.notaMedia || 0) * (+e.total || 0), 0) / n) : 0; };
const sesKey = e => e.sesionId || (e.rutinaId ? `${e.rutinaId}|${e.fecha}` : '');
function rutinaName(e) { const r = e.rutinaId && S.rutinas.find(x => x.id === e.rutinaId); return e.rutinaNombre || (r && r.nombre) || (e.rutinaId ? 'Rutina borrada' : 'Práctica libre'); }
function sesionesDe(es) {
  const m = new Map();
  es.forEach(e => { const k = sesKey(e); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
  return [...m.entries()].map(([key, items]) => { items.sort((a, b) => (a.inicio || 0) - (b.inicio || 0)); const f = items[0]; return { key, items, fecha: f.fecha, nombre: rutinaName(f), jugadorId: f.jugadorId, plan: Math.max(...items.map(x => +x.seriesPlan || 0), items.length) }; }).sort((a, b) => (b.items[0].inicio || 0) - (a.items[0].inicio || 0));
}
function renderHistory(es) {
  const sel = (id, opts, cur) => `<select data-ru-h="${id}" aria-label="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  $('#ru-hist-ctl').innerHTML = `<div class="seg" role="tablist" aria-label="Qué ver">${[['ej', 'Ejercicios'], ['rut', 'Ejercicios por rutina'], ['ses', 'Rutinas']].map(([k, l]) => `<button type="button" role="tab" data-ru="hist-mode" data-id="${k}" aria-selected="${histMode === k}">${l}</button>`).join('')}</div>
    <label class="f" style="min-width:160px">Jugador${sel('jug', [['', 'Todos'], ...sortedPlayers().map(j => [j.id, j.nombre])], histJug)}</label>`;
  const f = histJug ? es.filter(e => e.jugadorId === histJug) : es, box = $('#ru-history');
  if (!f.length) { box.innerHTML = '<p class="hint">Todavía no hay entrenos guardados.</p>'; return; }
  const more = n => (n > histLimit ? `<button class="btn sm" type="button" data-ru="hist-more" style="margin-top:8px">Ver más (${n - histLimit})</button>` : '');
  if (histMode === 'ej') {
    box.innerHTML = `<table><thead><tr><th>Fecha</th><th>Jugador</th><th>Ejercicio</th><th class="n">Reps</th><th class="n">Carga</th><th class="n">Nota</th><th></th><th></th></tr></thead><tbody>
    ${f.slice(0, histLimit).map(e => { const j = e.jugadorId && playerById(e.jugadorId); const has = e.videoId && vidIds.has(e.videoId); return `<tr class="ru-row" data-ru="open-entreno" data-id="${esc(e.id)}" tabindex="0"><td>${fdate(e.fecha)}</td><td>${esc(j ? j.nombre : '—')}</td><td>${esc(exName(e.ejercicio))} ${phoneOf(e.ejercicio)}${e.rutinaId ? `<div class="hint">${esc(rutinaName(e))}${e.serie ? ` · serie ${e.serie}/${e.series}` : ''}</div>` : ''}</td><td class="n">${+e.completas || 0}/${+e.total || 0}</td><td class="n">${+e.carga ? e.carga + ' kg' : '–'}</td><td class="n">${noteBadge(+e.notaMedia || 0)}</td><td>${has ? '🎬' : ''}</td><td><button class="btn ghost sm danger" type="button" data-ru="del-entreno" data-id="${esc(e.id)}" aria-label="Borrar entreno">Borrar</button></td></tr>`; }).join('')}</tbody></table>${more(f.length)}`;
  } else if (histMode === 'ses') {
    const ss = sesionesDe(f);
    box.innerHTML = ss.length ? `<table><thead><tr><th>Fecha</th><th>Rutina</th><th>Jugador</th><th class="n">Series</th><th class="n">Reps</th><th class="n">Nota</th><th></th></tr></thead><tbody>
    ${ss.slice(0, histLimit).map(s => { const j = s.jugadorId && playerById(s.jugadorId); const done = s.items.length >= s.plan; return `<tr class="ru-row" data-ru="open-sesion" data-id="${esc(s.key)}" tabindex="0"><td>${fdate(s.fecha)}</td><td>${esc(s.nombre)}</td><td>${esc(j ? j.nombre : '—')}</td><td class="n">${s.items.length}/${s.plan}</td><td class="n">${s.items.reduce((a, e) => a + (+e.total || 0), 0)}</td><td class="n">${noteBadge(avgNota(s.items))}</td><td>${done ? '✔' : '<span class="chip ex">Incompleta</span>'}</td></tr>`; }).join('')}</tbody></table>${more(ss.length)}`
      : '<p class="hint">Aún no hay rutinas completas guardadas. Inicia una desde «Entrenar».</p>';
  } else {
    const g = new Map();
    f.forEach(e => { const k = e.rutinaId || '_libre'; if (!g.has(k)) g.set(k, []); g.get(k).push(e); });
    box.innerHTML = [...g.entries()].sort((a, b) => Math.max(...b[1].map(e => e.inicio || 0)) - Math.max(...a[1].map(e => e.inicio || 0))).map(([k, items]) => {
      const nombre = k === '_libre' ? 'Práctica libre' : rutinaName(items[0]), ses = new Set(items.map(e => sesKey(e) || e.id)).size, last = items.reduce((a, e) => (e.fecha > a ? e.fecha : a), '');
      const ex = new Map(); items.forEach(e => { if (!ex.has(e.ejercicio)) ex.set(e.ejercicio, []); ex.get(e.ejercicio).push(e); });
      return `<details class="ru-grp"><summary><b>${esc(nombre)}</b> <span class="hint">· ${ses} ${ses === 1 ? 'sesión' : 'sesiones'} · última ${fdate(last)}</span></summary>
        <table><thead><tr><th>Ejercicio</th><th class="n">Series</th><th class="n">Reps</th><th class="n">Carga máx.</th><th class="n">Nota</th><th class="n">Última</th></tr></thead><tbody>
        ${[...ex.entries()].map(([id, l]) => `<tr><td>${esc(exName(id))} ${phoneOf(id)}</td><td class="n">${l.length}</td><td class="n">${l.reduce((a, e) => a + (+e.total || 0), 0)}</td><td class="n">${Math.max(0, ...l.map(e => +e.carga || 0)) || '–'}</td><td class="n">${noteBadge(avgNota(l))}</td><td class="n">${fdate(l.reduce((a, e) => (e.fecha > a ? e.fecha : a), ''))}</td></tr>`).join('')}</tbody></table></details>`;
    }).join('');
  }
}
function setSub(k) {
  subTab = k; lsSet('ts-ru-sub', k);
  $$('[data-ru="sub"]').forEach(b => b.setAttribute('aria-selected', b.dataset.id === k));
  ['entrenar', 'historial', 'estadisticas', 'plan'].forEach(id => { const p = $('#ru-p-' + id); if (p) p.hidden = id !== k; });
  if (window.RutinaStats) window.RutinaStats.render();
}
function render() {
  const cat = $('#ru-catalog'); if (!cat) return;
  if (vidState === 0) loadVidIds();
  cat.innerHTML = `<div class="head-row" style="margin-bottom:10px"><h3>Ejercicios</h3><span class="hint">El icono ${phoneIcon('v')} / ${phoneIcon('h')} indica cómo va el celular</span></div>
    <div class="ru-cat">${Object.values(EJERCICIOS).map(e => `<div class="ru-ex"><span class="ru-ico" aria-hidden="true">${e.icono}</span><div class="grow"><b>${esc(e.nombre)} ${phoneOf(e.id)}</b><div class="hint">${esc(e.desc)}</div>${e.views.length > 1 ? `<label class="f ru-pos">Posición del celular<select data-ru-view="${e.id}">${e.views.map(v => `<option value="${v.id}" ${v.id === viewOf(e.id).id ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>` : ''}</div><button class="btn primary" type="button" data-ru="practice" data-id="${e.id}">Practicar</button></div>`).join('')}</div>`;
  const rs = [...S.rutinas].sort((a, b) => (b.creado || 0) - (a.creado || 0));
  $('#ru-list').innerHTML = rs.length ? rs.map(r => { const j = r.jugadorId && playerById(r.jugadorId), p = progOf(r), nq = (r.items || []).reduce((a, it) => a + (+it.series || 1), 0);
    return `<div class="li"><div class="grow"><div class="name">${esc(r.nombre)}${r.ejemplo ? ' <span class="chip">ejemplo</span>' : ''}</div><div class="meta">${j ? esc(j.nombre) + ' · ' : ''}${itemsSummary(r) || 'Sin ejercicios'}</div>${p ? `<div class="meta"><span class="chip ex">En pausa · serie ${p.idx + 1} de ${nq} · ${fdate(p.fecha)}</span></div>` : ''}</div>
    ${p ? `<button class="btn sm primary" type="button" data-ru="start" data-id="${esc(r.id)}">Continuar rutina</button><button class="btn sm" type="button" data-ru="restart" data-id="${esc(r.id)}">Reiniciar</button>` : `<button class="btn sm primary" type="button" data-ru="start" data-id="${esc(r.id)}">Iniciar</button>`}<button class="btn sm" type="button" data-ru="edit" data-id="${esc(r.id)}">Editar</button><button class="btn sm ghost danger" type="button" data-ru="del-rutina" data-id="${esc(r.id)}">Borrar</button></div>`; }).join('')
    : '<p class="hint">Aún no hay rutinas. Crea una con «Nueva rutina» o practica un ejercicio suelto.</p>';
  const es = [...S.entrenos].sort((a, b) => (b.inicio || 0) - (a.inicio || 0));
  const bytes = es.reduce((a, e) => a + (e.videoId && vidIds.has(e.videoId) ? +e.videoBytes || 0 : 0), 0);
  $('#ru-space').textContent = bytes ? `Videos en este dispositivo: ${fmtMB(bytes)}` : '';
  renderHistory(es);
  if (window.RutinaStats) window.RutinaStats.render();
}

/* ---------- Constructor de rutinas ---------- */
let editingRutina = null;
function itemRow(it = {}) {
  return `<div class="ru-item"><div class="ri-ejw"><select class="ri-ej" aria-label="Ejercicio">${Object.values(EJERCICIOS).map(e => `<option value="${e.id}" ${it.ejercicio === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select><span class="ri-ph">${phoneOf(it.ejercicio || Object.keys(EJERCICIOS)[0])}</span></div>
    <label class="f">Series<input type="number" class="ri-ser" min="1" max="20" value="${+it.series || 3}"></label>
    <label class="f">Reps<input type="number" class="ri-rep" min="1" max="500" value="${+it.reps || 10}"></label>
    <label class="f">Carga (kg)<input type="number" class="ri-car" min="0" max="500" step="0.5" value="${+it.carga || 0}"></label>
    <label class="f">Descanso (s)<input type="number" class="ri-des" min="0" max="900" value="${it.descansoSeg ?? 60}"></label>
    <button class="btn ghost sm danger" type="button" data-ru="rm-item" aria-label="Quitar ejercicio">✕</button></div>`;
}
function openRutinaForm(id) {
  editingRutina = id || null; const r = id ? S.rutinas.find(x => x.id === id) : null;
  $('#ru-title').textContent = r ? 'Editar rutina' : 'Nueva rutina';
  $('#ru-nombre').value = r ? r.nombre : '';
  $('#ru-jugador').innerHTML = '<option value="">Sin jugador</option>' + sortedPlayers().map(j => `<option value="${esc(j.id)}">${esc(j.nombre)}</option>`).join('');
  $('#ru-jugador').value = r && r.jugadorId ? r.jugadorId : '';
  $('#ru-items').innerHTML = ((r && r.items && r.items.length) ? r.items : [{}]).map(itemRow).join('');
  $('#dlg-rutina').showModal(); $('#ru-nombre').focus();
}
$('#ru-form').addEventListener('submit', async e => {
  e.preventDefault();
  const nombre = $('#ru-nombre').value.trim(); if (!nombre) return;
  const items = $$('.ru-item').map(row => ({ ejercicio: $('.ri-ej', row).value, series: Math.max(1, +$('.ri-ser', row).value || 1), reps: Math.max(1, +$('.ri-rep', row).value || 1), carga: Math.max(0, +$('.ri-car', row).value || 0), descansoSeg: Math.max(0, +$('.ri-des', row).value || 0) }));
  if (!items.length) { toast('Añade al menos un ejercicio.'); return; }
  const prev = editingRutina ? S.rutinas.find(x => x.id === editingRutina) : null;
  const data = { ...(prev || {}), nombre, items, creado: prev ? prev.creado : Date.now() };
  if (prev) progSet(prev.id, null); // al editar la rutina, el avance guardado ya no corresponde
  const j = $('#ru-jugador').value; if (j) data.jugadorId = j; else delete data.jugadorId;
  delete data.id;
  if (await write(() => store.put('rutinas', editingRutina || uid(), data), prev ? 'Rutina actualizada' : 'Rutina creada')) $('#dlg-rutina').close();
});

/* ---------- Historial: detalle, descarga y borrado ---------- */
let detailUrl = null, detailBlob = null, detailId = null;
function fileNameFor(e, mime) { return `${e.ejercicio || 'flexiones'}-${e.fecha || today()}-${(e.id || '').slice(-4)}.${/mp4/.test(mime || '') ? 'mp4' : 'webm'}`; }
async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function repsTable(reps, ejercicio) {
  if (!(reps || []).length) return '<p class="hint">Este entreno no tiene el detalle de cada repetición.</p>';
  if (ejercicio === 'balon') return `<div class="tbl-wrap"><table><thead><tr><th class="n">#</th><th class="n">Nota</th><th>Resultado</th><th>Cambio</th><th class="n" title="Distancia media del balón al pie, en % del largo de pierna">Dist.</th><th class="n">Intervalo</th></tr></thead><tbody>
    ${reps.map(r => `<tr><td class="n">${r.n}</td><td class="n">${noteBadge(r.nota)}</td><td>${labelOf(r.nota)}</td><td>${r.dir === 'ID' ? 'izq. → der.' : 'der. → izq.'}</td><td class="n">${r.dist != null ? r.dist + ' %' : '–'}</td><td class="n">${(+r.dur).toFixed(2)} s</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="tbl-wrap"><table><thead><tr><th class="n">#</th><th class="n">Nota</th><th>Resultado</th><th class="n">Prof.</th><th class="n">Ext.</th><th class="n">Alin.</th><th class="n">Ctrl.</th><th class="n">Dur.</th><th class="n">Ángulo mín.</th><th class="n" title="Cuánto sube y baja el cuerpo, en % del largo del torso">Recorrido</th></tr></thead><tbody>
    ${(reps || []).map(r => `<tr><td class="n">${r.n}</td><td class="n">${noteBadge(r.nota)}</td><td>${labelOf(r.nota)}</td><td class="n">${r.prof}</td><td class="n">${r.ext}</td><td class="n">${r.alin}</td><td class="n">${r.ctrl}</td><td class="n">${(+r.dur).toFixed(1)} s</td><td class="n">${r.angMin != null ? r.angMin + '°' : '–'}</td><td class="n">${r.caida != null ? r.caida + ' %' : '–'}</td></tr>`).join('')}</tbody></table></div>`;
}
const repsChart = reps => !(reps || []).length ? '' : `<div class="chart">${lineChart((reps || []).map(r => ({ label: String(r.n), value: r.nota / 10 })), { h: 190 })}</div><p class="hint" style="margin:0">Nota de cada repetición (escala 0–100 mostrada como 0–10).</p>`;
async function openEntreno(id) {
  const e = S.entrenos.find(x => x.id === id); if (!e) return;
  detailId = id; closeDetailMedia();
  const j = e.jugadorId && playerById(e.jugadorId);
  const rec = e.videoId && vidIds.has(e.videoId) ? await videoDb.get(e.videoId).catch(() => null) : null;
  if (rec) { detailBlob = rec.blob; detailUrl = URL.createObjectURL(rec.blob); }
  $('#entreno-detail').innerHTML = `<div class="dlg-h"><h3 class="grow">${esc((EJERCICIOS[e.ejercicio] || {}).nombre || e.ejercicio)} · ${fdate(e.fecha)}</h3><button class="btn ghost sm" type="button" data-close>Cerrar</button></div>
    <div class="dlg-b">
      <div class="hint">${j ? esc(j.nombre) + ' · ' : ''}${e.rutinaId ? esc(rutinaName(e)) + (e.serie ? ` · serie ${e.serie}/${e.series}` : '') + ' · ' : ''}${+e.carga ? e.carga + ' kg · ' : ''}${fmtDur(+e.duracionSeg || 0)} de ejercicio</div>
      <div class="statrow"><div><b>${+e.total || 0}</b><span>${esc(cap(unidadDe(e.ejercicio)))}</span></div><div><b>${+e.completas || 0}</b><span>Completas</span></div><div><b>${(+e.total || 0) - (+e.completas || 0)}</b><span>Incompletas</span></div><div><b style="color:${NOTE_COLORS[labelOf(+e.notaMedia || 0)]}">${+e.notaMedia || 0}</b><span>Nota media</span></div></div>
      ${repsChart(e.reps)}${repsTable(e.reps, e.ejercicio)}
      ${detailUrl ? `<video class="ru-player" src="${detailUrl}" controls playsinline></video><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-ru="share-video">Descargar o compartir</button><button class="btn ghost danger" type="button" data-ru="del-video">Borrar video</button></div>`
        : (e.videoId ? '<p class="hint">El video se grabó en otro dispositivo o ya se borró: los videos no se suben a Drive.</p>' : '')}
    </div>`;
  if (!$('#dlg-entreno').open) $('#dlg-entreno').showModal();
}
// Detalle de una rutina completa (todas sus series guardadas)
function openSesion(key) {
  const s = sesionesDe(S.entrenos).find(x => x.key === key); if (!s) return;
  const j = s.jugadorId && playerById(s.jugadorId), reps = s.items.reduce((a, e) => a + (+e.total || 0), 0), dur = s.items.reduce((a, e) => a + (+e.duracionSeg || 0), 0);
  const vol = s.items.reduce((a, e) => a + (+e.total || 0) * (+e.carga || 0), 0);
  detailId = null; closeDetailMedia();
  $('#entreno-detail').innerHTML = `<div class="dlg-h"><h3 class="grow">${esc(s.nombre)} · ${fdate(s.fecha)}</h3><button class="btn ghost sm" type="button" data-close>Cerrar</button></div>
    <div class="dlg-b">
      <div class="hint">${j ? esc(j.nombre) + ' · ' : ''}${s.items.length >= s.plan ? 'Rutina completa' : `Incompleta: ${s.items.length} de ${s.plan} series`}</div>
      <div class="statrow"><div><b>${s.items.length}</b><span>Series</span></div><div><b>${reps}</b><span>Repeticiones</span></div><div><b style="color:${NOTE_COLORS[labelOf(avgNota(s.items))]}">${avgNota(s.items)}</b><span>Nota media</span></div><div><b>${vol || '–'}</b><span>Volumen (kg)</span></div><div><b>${fmtDur(dur)}</b><span>Tiempo</span></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Ejercicio</th><th class="n">Serie</th><th class="n">Reps</th><th class="n">Carga</th><th class="n">Nota</th></tr></thead><tbody>
      ${s.items.map(e => `<tr class="ru-row" data-ru="open-entreno" data-id="${esc(e.id)}" tabindex="0"><td>${esc(exName(e.ejercicio))} ${phoneOf(e.ejercicio)}</td><td class="n">${e.serie ? `${e.serie}/${e.series}` : '–'}</td><td class="n">${+e.completas || 0}/${+e.total || 0}</td><td class="n">${+e.carga ? e.carga + ' kg' : '–'}</td><td class="n">${noteBadge(+e.notaMedia || 0)}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Toca una serie para ver su detalle.</p>
    </div>`;
  if (!$('#dlg-entreno').open) $('#dlg-entreno').showModal();
}
function closeDetailMedia() { if (detailUrl) URL.revokeObjectURL(detailUrl); detailUrl = null; detailBlob = null; }
$('#dlg-entreno').addEventListener('close', () => { closeDetailMedia(); detailId = null; $('#entreno-detail').innerHTML = ''; });
async function deleteVideoOf(e) {
  if (!e.videoId) return;
  try { await videoDb.del(e.videoId); } catch (err) { console.warn(err); }
  vidIds.delete(e.videoId);
}

/* ---------- Pantalla del ejercicio ---------- */
let ex = null, modPromise = null;
const loadMod = () => (modPromise || (modPromise = import('./pushup.js').catch(err => { modPromise = null; throw err; })));
const GUIDE_SVG = `<svg viewBox="0 0 220 110" class="ex-guide-svg" role="img" aria-label="El celular en el suelo, de costado al jugador"><rect x="1" y="1" width="218" height="108" rx="10" fill="none" stroke="currentColor" opacity=".25"/><line x1="10" y1="92" x2="210" y2="92" stroke="currentColor" opacity=".5"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"><line x1="95" y1="62" x2="170" y2="82"/><line x1="95" y1="62" x2="92" y2="90"/><line x1="170" y1="82" x2="176" y2="90"/></g><circle cx="86" cy="56" r="9" fill="currentColor"/><rect x="12" y="68" width="26" height="24" rx="4" fill="var(--accent)"/><path d="M40 78l36-12" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3"/><text x="16" y="62" font-size="11" fill="currentColor">celular</text><text x="110" y="30" font-size="11" fill="currentColor">1,5 – 2 m · de costado</text></svg>`;
const GUIDE_FRONT_SVG = `<svg viewBox="0 0 220 110" class="ex-guide-svg" role="img" aria-label="El celular vertical en el suelo, la persona en plancha con la cabeza hacia la cámara"><rect x="1" y="1" width="218" height="108" rx="10" fill="none" stroke="currentColor" opacity=".25"/><line x1="10" y1="92" x2="210" y2="92" stroke="currentColor" opacity=".5"/><rect x="14" y="52" width="14" height="40" rx="3" fill="var(--accent)"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"><line x1="70" y1="52" x2="62" y2="90"/><line x1="110" y1="52" x2="118" y2="90"/><line x1="70" y1="52" x2="110" y2="52"/><line x1="90" y1="52" x2="190" y2="58"/></g><circle cx="90" cy="40" r="9" fill="currentColor"/><text x="34" y="46" font-size="11" fill="currentColor">celular vertical</text><text x="100" y="28" font-size="11" fill="currentColor">1 – 1,5 m · cabeza hacia la cámara</text></svg>`;
const GUIDE_STANDING_SVG = `<svg viewBox="0 0 220 110" class="ex-guide-svg" role="img" aria-label="El celular vertical frente a la persona de pie"><rect x="1" y="1" width="218" height="108" rx="10" fill="none" stroke="currentColor" opacity=".25"/><line x1="10" y1="100" x2="210" y2="100" stroke="currentColor" opacity=".5"/><rect x="20" y="62" width="14" height="38" rx="3" fill="var(--accent)"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"><line x1="150" y1="34" x2="150" y2="68"/><line x1="150" y1="68" x2="140" y2="98"/><line x1="150" y1="68" x2="160" y2="98"/><line x1="150" y1="40" x2="124" y2="48"/><line x1="150" y1="40" x2="176" y2="48"/></g><circle cx="150" cy="24" r="9" fill="currentColor"/><text x="40" y="56" font-size="11" fill="currentColor">celular vertical</text><text x="60" y="22" font-size="11" fill="currentColor">2 m · de frente</text></svg>`;
const GUIDE_SQUAT_SVG = `<svg viewBox="0 0 220 110" class="ex-guide-svg" role="img" aria-label="El celular a un lado, la persona de costado"><rect x="1" y="1" width="218" height="108" rx="10" fill="none" stroke="currentColor" opacity=".25"/><line x1="10" y1="96" x2="210" y2="96" stroke="currentColor" opacity=".5"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"><line x1="150" y1="34" x2="146" y2="60"/><line x1="146" y1="60" x2="168" y2="68"/><line x1="168" y1="68" x2="160" y2="94"/><line x1="146" y1="60" x2="128" y2="52"/></g><circle cx="152" cy="24" r="9" fill="currentColor"/><rect x="12" y="72" width="26" height="24" rx="4" fill="var(--accent)"/><path d="M40 80l70-8" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3"/><text x="16" y="66" font-size="11" fill="currentColor">celular</text><text x="40" y="30" font-size="11" fill="currentColor">2 – 2,5 m · de costado</text></svg>`;
const GUIDE_BALL_SVG = `<svg viewBox="0 0 220 110" class="ex-guide-svg" role="img" aria-label="El celular horizontal en el suelo, la persona de frente con el balón entre los pies"><rect x="1" y="1" width="218" height="108" rx="10" fill="none" stroke="currentColor" opacity=".25"/><line x1="10" y1="100" x2="210" y2="100" stroke="currentColor" opacity=".5"/><rect x="14" y="80" width="30" height="16" rx="3" fill="var(--accent)"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"><line x1="150" y1="34" x2="150" y2="64"/><line x1="150" y1="64" x2="132" y2="96"/><line x1="150" y1="64" x2="168" y2="96"/><line x1="150" y1="42" x2="130" y2="56"/><line x1="150" y1="42" x2="170" y2="56"/></g><circle cx="150" cy="24" r="9" fill="currentColor"/><circle cx="150" cy="92" r="7" fill="none" stroke="#ffd54f" stroke-width="3"/><path d="M136 82q14-14 28 0" stroke="var(--accent)" stroke-width="2" fill="none" stroke-dasharray="4 3"/><text x="48" y="74" font-size="11" fill="currentColor">celular horizontal</text><text x="52" y="22" font-size="11" fill="currentColor">2,5 – 3 m · de frente</text></svg>`;
const GUIDES = { front: GUIDE_FRONT_SVG, standing: GUIDE_STANDING_SVG, squat: GUIDE_SQUAT_SVG, side: GUIDE_SVG, ball: GUIDE_BALL_SVG };
const panel = () => $('#ex-panel');

function beep(freq = 880, ms = 120) {
  try { if (!ex.audio) ex.audio = new (window.AudioContext || window.webkitAudioContext)(); const o = ex.audio.createOscillator(), g = ex.audio.createGain(); o.frequency.value = freq; g.gain.value = 0.12; o.connect(g); g.connect(ex.audio.destination); o.start(); o.stop(ex.audio.currentTime + ms / 1000); } catch {}
}
function speak(txt) {
  if (!voiceOn() || !('speechSynthesis' in window)) return;
  try { const u = new SpeechSynthesisUtterance(String(txt)); u.lang = 'es-ES'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
}
const setMsg = (txt) => { const m = $('#ex-msg'); m.hidden = !txt; m.textContent = txt || ''; };
function flash(color) {
  const st = $('.ex-stage'); st.style.setProperty('--flash', color); st.classList.remove('flash'); void st.offsetWidth; st.classList.add('flash');
}

function buildQueue(rutina, ejercicio) {
  if (!rutina) return [{ ejercicio, reps: 10, descansoSeg: 0, label: '', carga: 0 }];
  const q = [];
  (rutina.items || []).forEach((it, i) => { for (let s = 1; s <= (+it.series || 1); s++) q.push({ ejercicio: it.ejercicio, reps: +it.reps || 0, carga: +it.carga || 0, descansoSeg: +it.descansoSeg || 0, label: `${exName(it.ejercicio)} · serie ${s}/${+it.series || 1}`, item: i, serie: s, series: +it.series || 1 }); });
  return q;
}
async function openExercise(rutina, ejercicio = 'flexiones') {
  if (ex) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (!$('#ru-dev-file').checked) { toast('Este navegador no permite usar la cámara. En modo desarrollador puedes usar un archivo de video.'); return; } }
  const queue = buildQueue(rutina, ejercicio); if (!queue.length) { toast('Esa rutina no tiene ejercicios.'); return; }
  const prog = rutina ? progOf(rutina) : null, idx0 = prog ? prog.idx : 0;
  if (prog) toast(`Continuando la rutina en la serie ${idx0 + 1} de ${queue.length}`);
  ex = { rutina, queue, idx: idx0, sesionId: prog ? prog.sesionId : uid(), carga: queue[idx0].carga || 0, jugadorId: prog && prog.jugadorId || rutina && rutina.jugadorId || '', objetivo: queue[idx0].reps, facing: viewOf(queue[idx0].ejercicio).facing, facingManual: false, view: null, fileMode: $('#ru-dev-file').checked, state: 'prep', stream: null, session: null, mod: null, fileUrl: null, blobUrl: null, audio: null, visible: false, devices: 0, sessionToken: 0 };
  $('#dlg-ejercicio').showModal();
  showPrep();
  if (!ex.fileMode) await startCamera();
  await newSession();
}
async function startCamera() {
  const v = $('#ex-video');
  if (ex.stream) ex.stream.getTracks().forEach(t => t.stop()); ex.stream = null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: ex.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (!ex) { stream.getTracks().forEach(t => t.stop()); return; }
    ex.stream = stream;
    v.srcObject = ex.stream; await v.play().catch(() => {});
    if (!ex.devices) ex.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').length;
    const sw = $('#ex-switch'); if (sw) sw.hidden = ex.devices < 2;
  } catch (err) {
    setLight('bad', err && err.name === 'NotAllowedError' ? 'No hay permiso para usar la cámara. Actívalo en la configuración del navegador.' : 'No se encontró ninguna cámara en este dispositivo.');
  }
}
function setLight(kind, txt) { const l = $('#ex-light'); if (!l) return; l.dataset.s = kind; l.textContent = txt; }
function updateStart() { const b = $('#ex-start'); if (b) b.disabled = !(ex && ex.session && (ex.visible || devTracking())); }

async function newSession() {
  if (!ex) return;
  const token = ++ex.sessionToken, v = $('#ex-video'), c = $('#ex-canvas');
  if (ex.session) { try { await ex.session.stop(); } catch {} ex.session = null; }
  ex.visible = false; updateStart();
  const q = ex.queue[ex.idx], def = viewOf(q.ejercicio); ex.view = def;
  // la posición del celular decide la cámara: de frente = frontal, de costado = trasera (salvo que el usuario la haya cambiado a mano)
  if (!ex.fileMode && !ex.facingManual && ex.facing !== def.facing) { ex.facing = def.facing; await startCamera(); if (!ex || token !== ex.sessionToken) return; }
  if (ex.fileMode && !v.src) { setLight('wait', def.luz); return; }
  setLight('wait', 'Cargando detector… (solo la primera vez)');
  try {
    ex.mod = await loadMod();
    const session = await ex.mod.startSession({
      exercise: q.ejercicio, view: def.id, video: v, canvas: c, mirror: !ex.fileMode && ex.facing === 'user', devTracking: devTracking,
      onRep: onRep, onState: onState
    });
    if (!ex || token !== ex.sessionToken) { session.stop(); return; }
    ex.session = session;
    setLight('wait', `Buscando el cuerpo… ${def.pose}.`);
  } catch (err) {
    console.warn(err);
    setLight('bad', 'No se pudo cargar el detector. La primera vez hace falta conexión a internet.');
    const b = $('#ex-retry'); if (b) b.hidden = false;
  }
}
let lastLight = '';
function onState(s) {
  if (!ex) return;
  ex.visible = s.visible;
  if (ex.state === 'prep') {
    const k = s.visible ? 'ok' : 'wait';
    if (k !== lastLight) { lastLight = k; setLight(k, s.visible ? (s.ball ? 'Pies y balón visibles ✔' : 'Cuerpo completo visible ✔') : `${s.hint ? 'Falta el balón: ' + s.hint : 'Cuerpo no visible: ' + (ex.view ? ex.view.ajuste : 'aleja el celular.')}`); }
    updateStart();
  }
}
function onRep(rep, sum) {
  if (!ex) return;
  speak(rep.n); flash(NOTE_COLORS[rep.label]);
  const n = $('#ex-n'); if (n) n.textContent = sum.total;
  if (ex.state === 'run' && ex.objetivo && sum.total >= ex.objetivo) { ex.state = 'closing'; setTimeout(() => finishSerie(true), 1700); }
}

function playerOptions(sel) { return '<option value="">Sin jugador</option>' + sortedPlayers().map(j => `<option value="${esc(j.id)}" ${j.id === sel ? 'selected' : ''}>${esc(j.nombre)}</option>`).join(''); }
const devBtn = () => `<button class="btn ghost sm" type="button" data-ru="ex-dev" aria-pressed="${devTracking()}" title="Trackeo de cámara (modo desarrollador)">🐞</button>`;
const voiceBtn = () => `<button class="btn ghost sm" type="button" data-ru="ex-voice" aria-pressed="${voiceOn()}" title="Voz">${voiceOn() ? '🔊' : '🔇'}</button>`;

function showPrep() {
  ex.state = 'prep'; lastLight = '';
  const q = ex.queue[ex.idx], e = EJERCICIOS[q.ejercicio], vw = viewOf(q.ejercicio);
  setMsg('');
  panel().innerHTML = `<div class="ex-prep">
    <div class="ex-guide">${GUIDES[vw.svg] || GUIDE_SVG}<p class="hint">${vw.guia}</p></div>
    <div class="ex-form">
      <div><h3>${esc(e.nombre)} ${phoneIcon(vw.orient)}</h3><div class="hint">${ex.rutina ? esc(ex.rutina.nombre) + ' · ' : 'Práctica libre · '}${q.serie ? `Serie ${q.serie}/${q.series} (${ex.idx + 1}/${ex.queue.length})` : 'Serie única'}</div></div>
      ${viewsOf(q.ejercicio).length > 1 ? `<label class="f">Posición del celular<select id="ex-view">${viewsOf(q.ejercicio).map(x => `<option value="${x.id}" ${x.id === vw.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>` : ''}
      <p class="hint ex-guide-m">${vw.guia}</p>
      <div class="ex-light" id="ex-light" data-s="wait" role="status">Cargando detector… (solo la primera vez)</div>
      <div class="frow"><label class="f">Jugador (opcional)<select id="ex-player">${playerOptions(ex.jugadorId)}</select></label>
        <label class="f">Objetivo (0 = libre)<input type="number" id="ex-obj" min="0" max="500" value="${ex.objetivo}"></label>
        <label class="f">Carga (kg)<input type="number" id="ex-carga" min="0" max="500" step="0.5" value="${ex.carga || 0}"></label></div>
      ${ex.fileMode ? '<label class="f">Video de prueba (modo desarrollador)<input type="file" id="ex-file" accept="video/*"></label>' : ''}
      <div class="ex-acts"><button class="btn primary" type="button" id="ex-start" data-ru="ex-start" disabled>Empezar</button>
        <button class="btn" type="button" id="ex-switch" data-ru="ex-switch" hidden>🔄 Cambiar cámara</button>
        <button class="btn" type="button" id="ex-retry" data-ru="ex-retry" hidden>Reintentar</button>
        ${devBtn()}${voiceBtn()}<button class="btn ghost" type="button" data-close>Cerrar</button></div>
    </div></div>`;
  const sw = $('#ex-switch'); if (sw) sw.hidden = ex.devices < 2;
  $('#ex-player').addEventListener('change', e2 => { ex.jugadorId = e2.target.value; });
  const vsel = $('#ex-view'); if (vsel) vsel.addEventListener('change', e2 => { lsSet('ts-view-' + q.ejercicio, e2.target.value); ex.facingManual = false; showPrep(); newSession(); });
  $('#ex-obj').addEventListener('input', e2 => { ex.objetivo = Math.max(0, +e2.target.value || 0); });
  const f = $('#ex-file'); if (f) f.addEventListener('change', async e2 => {
    const file = e2.target.files[0]; if (!file) return;
    const v = $('#ex-video'); if (ex.fileUrl) URL.revokeObjectURL(ex.fileUrl);
    ex.fileUrl = URL.createObjectURL(file); v.srcObject = null; v.src = ex.fileUrl; v.loop = true; v.muted = true;
    await v.play().catch(() => {}); newSession();
  });
}

async function startCountdown() {
  if (!ex || ex.state !== 'prep' || !ex.session) return;
  ex.jugadorId = $('#ex-player').value; ex.objetivo = Math.max(0, +$('#ex-obj').value || 0); ex.carga = Math.max(0, +$('#ex-carga').value || 0);
  ex.state = 'count'; $('#ex-start').disabled = true;
  for (const n of [3, 2, 1]) { if (!ex || ex.state !== 'count') return; setMsg(String(n)); beep(660, 100); await sleep(1000); }
  if (!ex || ex.state !== 'count') return;
  setMsg(''); beep(1100, 250);
  const v = $('#ex-video');
  if (ex.fileMode) { v.loop = false; v.currentTime = 0; v.onended = () => { if (ex && ex.state === 'run') finishSerie(); }; await v.play().catch(() => {}); }
  ex.session.begin(); ex.startedAt = Date.now(); ex.state = 'run';
  showRun();
}
function showRun() {
  const q = ex.queue[ex.idx];
  panel().innerHTML = `<div class="ex-run"><div class="ex-count"><b id="ex-n">0</b>${ex.objetivo ? ` / ${ex.objetivo}` : ''}<span class="hint"> ${unidadDe(q.ejercicio)}${q.serie ? ` · serie ${q.serie}/${q.series}` : ''} ${phoneOf(q.ejercicio)}</span></div>
    <div class="ex-acts"><button class="btn" type="button" data-ru="ex-pause" id="ex-pause">Pausa</button><button class="btn primary" type="button" data-ru="ex-finish">Terminar</button>${devBtn()}${voiceBtn()}</div></div>`;
  ex.session.setHud({ serie: ex.queue.length > 1 ? `${exName(q.ejercicio)} · serie ${q.serie}/${q.series} (${ex.idx + 1}/${ex.queue.length})` : '' });
}
async function finishSerie(auto) {
  if (!ex || !(ex.state === 'run' || ex.state === 'closing') || !ex.session) return;
  ex.state = 'stopping'; setMsg('Guardando video…');
  const v = $('#ex-video'); if (ex.fileMode) v.pause();
  const r = await ex.session.stop(); ex.session = null; setMsg('');
  ex.result = r; showResult();
}
function showResult() {
  ex.state = 'result';
  const r = ex.result;
  if (ex.blobUrl) URL.revokeObjectURL(ex.blobUrl); ex.blobUrl = r.blob ? URL.createObjectURL(r.blob) : null;
  const best = r.mejor, worst = r.peor;
  panel().innerHTML = `<div class="ex-result">
    <div class="statrow"><div><b>${r.total}</b><span>${cap(unidadDe(ex.queue[ex.idx].ejercicio))}${r.incompletas ? ` · ${r.incompletas} incompletas` : ''}</span></div><div><b>${r.completas}</b><span>Completas</span></div><div><b style="color:${NOTE_COLORS[labelOf(r.notaMedia)]}">${r.notaMedia}</b><span>Nota media</span></div>
      <div><b>${best ? best.nota : '–'}</b><span>Mejor${best ? ' (#' + best.n + ')' : ''}</span></div><div><b>${worst ? worst.nota : '–'}</b><span>Peor${worst ? ' (#' + worst.n + ')' : ''}</span></div></div>
    ${ex.queue[ex.idx].ejercicio === 'balon' ? `<div class="statrow"><div><b>${r.reps.filter(x => x.dir === 'ID').length}</b><span>Izq. → der.</span></div><div><b>${r.reps.filter(x => x.dir === 'DI').length}</b><span>Der. → izq.</span></div></div>` : ''}
    <div class="ex-res-cols">${r.total ? repsChart(r.reps) : '<p class="hint">No se contó ninguna repetición.</p>'}
      ${ex.blobUrl ? `<div><video class="ru-player" src="${ex.blobUrl}" controls playsinline></video><button class="btn sm" type="button" data-ru="ex-share" style="margin-top:6px">Descargar o compartir</button></div>` : '<p class="hint">Este navegador no pudo grabar el video.</p>'}</div>
    <div class="ex-acts"><button class="btn primary" type="button" data-ru="ex-save">Guardar</button><button class="btn" type="button" data-ru="ex-again">Repetir</button><button class="btn ghost danger" type="button" data-ru="ex-discard">Descartar</button></div></div>`;
}
async function saveResult() {
  const r = ex.result, q = ex.queue[ex.idx]; let videoId = null, bytes = 0;
  if (r.blob) {
    try { const id = uid(); await videoDb.put({ id, blob: r.blob, mime: r.mime, duracionSeg: r.duracion, creado: Date.now() }); videoId = id; bytes = r.blob.size; vidIds.add(id); }
    catch (err) { console.warn(err); toast('No cabe el video en este dispositivo; se guarda el entreno sin video.'); }
  }
  const data = { ejercicio: q.ejercicio, fecha: today(), inicio: ex.startedAt || Date.now(), duracionSeg: r.duracion, reps: r.reps, total: r.total, completas: r.completas, notaMedia: r.notaMedia };
  data.carga = ex.carga || 0; if (ex.objetivo) data.objetivo = ex.objetivo;
  if (ex.rutina) Object.assign(data, { rutinaId: ex.rutina.id, rutinaNombre: ex.rutina.nombre, sesionId: ex.sesionId, serie: q.serie, series: q.series, paso: q.item + 1, pasos: (ex.rutina.items || []).length, seriesPlan: ex.queue.length });
  if (ex.jugadorId) data.jugadorId = ex.jugadorId; if (videoId) { data.videoId = videoId; data.videoBytes = bytes; }
  if (await write(() => store.put('entrenos', uid(), data), 'Entreno guardado')) advance(q);
}
function advance(q) {
  if (ex.blobUrl) { URL.revokeObjectURL(ex.blobUrl); ex.blobUrl = null; }
  ex.idx++;
  if (ex.idx >= ex.queue.length) { if (ex.rutina) { progSet(ex.rutina.id, null); toast('¡Rutina completada!'); } $('#dlg-ejercicio').close(); return; }
  ex.objetivo = ex.queue[ex.idx].reps; ex.carga = ex.queue[ex.idx].carga || 0;
  if (ex.rutina) progSet(ex.rutina.id, { idx: ex.idx, n: ex.queue.length, sesionId: ex.sesionId, jugadorId: ex.jugadorId, fecha: today(), t: Date.now() });
  if (q.descansoSeg > 0) showRest(q.descansoSeg); else { showPrep(); newSession(); }
}
async function showRest(sec) {
  ex.state = 'rest'; const end = Date.now() + sec * 1000;
  const next = ex.queue[ex.idx];
  panel().innerHTML = `<div class="ex-rest"><div class="eyebrow">Descanso</div><div class="ex-rest-n num" id="ex-rest-n">${sec}</div><div class="hint">Siguiente: ${esc(next.label || 'ejercicio')} · ${next.reps} ${unidadDe(next.ejercicio)}</div><button class="btn primary" type="button" data-ru="ex-skip">Saltar descanso</button></div>`;
  ex.skip = false;
  while (ex && ex.state === 'rest' && !ex.skip) {
    const left = Math.ceil((end - Date.now()) / 1000); const el = $('#ex-rest-n'); if (el) el.textContent = Math.max(0, left);
    if (left <= 0) break;
    if (left <= 3) beep(660, 80);
    await sleep(500);
  }
  if (!ex || ex.state !== 'rest') return;
  beep(1100, 250); showPrep(); newSession();
}
async function endExercise() {
  if (!ex) return;
  const e = ex; ex = null;  if (e.rutina && e.idx > 0 && e.idx < e.queue.length) toast('Rutina en pausa: toca «Continuar rutina» para seguir donde la dejaste.');
  try { if (e.session) await e.session.stop(); } catch {}
  if (e.stream) e.stream.getTracks().forEach(t => t.stop());
  if (e.fileUrl) URL.revokeObjectURL(e.fileUrl);
  if (e.blobUrl) URL.revokeObjectURL(e.blobUrl);
  try { e.audio && e.audio.close(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
  const v = $('#ex-video'); v.pause(); v.onended = null; v.srcObject = null; v.removeAttribute('src'); v.load();
  setMsg(''); panel().innerHTML = ''; render();
}
$('#dlg-ejercicio').addEventListener('close', endExercise);
$('#dlg-ejercicio').addEventListener('cancel', e => { if (ex && (ex.state === 'run' || ex.state === 'closing' || ex.state === 'stopping' || ex.state === 'count')) { e.preventDefault(); toast('Pulsa «Terminar» para salir del ejercicio.'); } });

/* ---------- Modo desarrollador ---------- */
const devChk = $('#ru-dev-track');
devChk.checked = devTracking();
devChk.addEventListener('change', () => { lsSet('ts-dev-tracking', devChk.checked ? '1' : '0'); syncDevButtons(); });
function syncDevButtons() { $$('[data-ru="ex-dev"]').forEach(b => b.setAttribute('aria-pressed', devTracking())); devChk.checked = devTracking(); }

/* ---------- Eventos ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-ru]'); if (!t) return;
  if (t.tagName === 'TR' && e.target.closest('button')) return; // el botón de la fila manda
  const id = t.dataset.id;
  switch (t.dataset.ru) {
    case 'practice': openExercise(null, id); break;
    case 'start': { const r = S.rutinas.find(x => x.id === id); if (r) openExercise(r); break; }
    case 'edit': openRutinaForm(id); break;
    case 'restart': arm(t, '¿Reiniciar?', () => { progSet(id, null); render(); toast('Rutina reiniciada'); }); break;
    case 'sub': setSub(id); break;
    case 'hist-mode': histMode = id; histLimit = 40; render(); break;
    case 'hist-more': histLimit += 40; render(); break;
    case 'open-sesion': openSesion(id); break;
    case 'del-rutina': arm(t, '¿Borrar?', () => write(() => store.del('rutinas', id), 'Rutina borrada')); break;
    case 'rm-item': { const row = t.closest('.ru-item'); if ($$('.ru-item').length > 1) row.remove(); else toast('La rutina necesita al menos un ejercicio.'); break; }
    case 'open-entreno': openEntreno(id); break;
    case 'del-entreno': arm(t, '¿Borrar?', async () => {
      const en = S.entrenos.find(x => x.id === id); if (!en) return;
      await write(async () => { await deleteVideoOf(en); await store.del('entrenos', id); }, 'Entreno borrado');
    }); break;
    case 'share-video': { const en = S.entrenos.find(x => x.id === detailId); if (en && detailBlob) shareOrDownload(detailBlob, fileNameFor(en, detailBlob.type)); break; }
    case 'del-video': arm(t, '¿Borrar video?', async () => {
      const en = S.entrenos.find(x => x.id === detailId); if (!en) return;
      await write(async () => { await deleteVideoOf(en); const d = { ...en }; delete d.videoId; delete d.videoBytes; delete d.id; await store.put('entrenos', en.id, d); }, 'Video borrado');
      $('#dlg-entreno').close();
    }); break;
    case 'ex-start': startCountdown(); break;
    case 'ex-switch': ex.facing = ex.facing === 'user' ? 'environment' : 'user'; ex.facingManual = true; await startCamera(); newSession(); break;
    case 'ex-retry': t.hidden = true; newSession(); break;
    case 'ex-pause': if (ex.session) { if (ex.session.paused) { ex.session.resume(); t.textContent = 'Pausa'; if (ex.fileMode) $('#ex-video').play(); } else { ex.session.pause(); t.textContent = 'Reanudar'; if (ex.fileMode) $('#ex-video').pause(); } } break;
    case 'ex-finish': finishSerie(); break;
    case 'ex-dev': lsSet('ts-dev-tracking', devTracking() ? '0' : '1'); syncDevButtons(); break;
    case 'ex-voice': lsSet('ts-voz', voiceOn() ? '0' : '1'); t.setAttribute('aria-pressed', voiceOn()); t.textContent = voiceOn() ? '🔊' : '🔇'; break;
    case 'ex-share': if (ex && ex.result && ex.result.blob) shareOrDownload(ex.result.blob, fileNameFor({ fecha: today(), id: uid() }, ex.result.blob.type)); break;
    case 'ex-save': t.disabled = true; await saveResult(); t.disabled = false; break;
    case 'ex-again': if (ex.blobUrl) { URL.revokeObjectURL(ex.blobUrl); ex.blobUrl = null; } showPrep(); newSession(); break;
    case 'ex-discard': advance(ex.queue[ex.idx]); break;
    case 'ex-skip': ex.skip = true; break;
  }
});
document.addEventListener('keydown', e => {
  if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches) return;
  if (e.target.matches('tr[data-ru="open-entreno"]')) { e.preventDefault(); openEntreno(e.target.dataset.id); }
  else if (e.target.matches('tr[data-ru="open-sesion"]')) { e.preventDefault(); openSesion(e.target.dataset.id); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches && t.matches('[data-ru-view]')) { lsSet('ts-view-' + t.dataset.ruView, t.value); render(); }        // posición del celular elegida en el catálogo
  else if (t.matches && t.matches('[data-ru-h="jug"]')) { histJug = t.value; histLimit = 40; render(); }
  else if (t.matches && t.matches('.ri-ej')) { const ph = t.closest('.ru-item').querySelector('.ri-ph'); if (ph) ph.innerHTML = phoneOf(t.value); }
});
$('#ru-new').addEventListener('click', () => openRutinaForm());
$('#ru-add-item').addEventListener('click', () => $('#ru-items').insertAdjacentHTML('beforeend', itemRow()));

window.Rutina = { render, openExercise, EJERCICIOS, phoneIcon, phoneOf, exName, sesKey, rutinaName, avgNota, NOTE_COLORS, labelOf, noteBadge };
setSub(['entrenar', 'historial', 'estadisticas', 'plan'].includes(subTab) ? subTab : 'entrenar');
render();
})();
