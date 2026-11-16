// ===== Flexiones de brazo: detección de pose (MediaPipe), conteo, calificación y grabación =====
// Módulo ES. rutina.js lo carga con import() solo cuando se abre el ejercicio.
// La lógica pura (ángulos, máquina de estados, nota) no toca el DOM y se prueba con Node.

// ---------- Configuración: todos los umbrales juntos para afinarlos tras probar con personas ----------
export const PUSHUP_CFG = {
  // máquina de estados (grados del codo)
  downStart: 140,      // por debajo de esto empieza a contarse la repetición
  upDone: 155,         // por encima de esto, la repetición se cierra
  riseDelta: 10,       // histéresis: cuánto debe subir/bajar el codo para cambiar de fase
  settleDrop: 4,       // al cerrar se espera al pico del codo; se termina cuando baja esto desde el máximo
  settleSec: 0.5,      // ...o tras este tiempo
  minRepSec: 0.4,      // un ciclo más corto se descarta
  maxRepSec: 15,       // un ciclo más largo se descarta
  plankMin: 140,       // hombro-cadera-tobillo mínimo para considerar plancha
  minVis: 0.5,         // visibilidad mínima de los puntos usados
  sideSwitchVis: 0.15, // ventaja de visibilidad para cambiar de lado
  smoothAlpha: 0.4,    // media móvil exponencial
  // calificación: [valor con 0 %, valor con 100 %]
  prof: { w: 50, zero: 120, full: 75 },    // ángulo mínimo del codo
  ext: { w: 20, zero: 145, full: 165 },    // ángulo máximo del codo
  alin: { w: 20, zero: 145, full: 170 },   // peor ángulo hombro-cadera-tobillo
  ctrl: { w: 10, tooFast: 0.5, okMin: 1.2, okMax: 3, tooSlow: 6 }, // duración (s)
  // etiquetas
  excelente: 85, buena: 70, regular: 50,
  // rendimiento
  lowFps: 12
};

export const NOTE_COLORS = { Excelente: '#2ecc71', Buena: '#8bd450', Regular: '#f0a92e', Incompleta: '#e74c4c' };

// ---------- Funciones puras ----------
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Interpolación lineal: devuelve 0..100 (0 en `zero`, 100 en `full`); sirve en ambos sentidos
export const lin = (v, zero, full) => clamp(((v - zero) / (full - zero)) * 100, 0, 100);

// Ángulo en `b` (grados, 0..180) formado por a-b-c. Los puntos deben estar en la misma escala (píxeles).
export function angle(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!n) return null;
  return (Math.acos(clamp((v1x * v2x + v1y * v2y) / n, -1, 1)) * 180) / Math.PI;
}
export const ema = (prev, v, alpha = PUSHUP_CFG.smoothAlpha) => (prev == null ? v : prev + alpha * (v - prev));

// Índices de MediaPipe Pose: hombro, codo, muñeca, cadera, rodilla, tobillo
export const SIDES = {
  left: { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27 },
  right: { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28 }
};
const KEYS = ['sh', 'el', 'wr', 'hip', 'an'];
export function sideVisibility(lms, side) {
  const ix = SIDES[side];
  return KEYS.reduce((a, k) => a + ((lms[ix[k]] && lms[ix[k]].visibility) ?? 0), 0) / KEYS.length;
}
// Elige el lado del cuerpo con mejor visibilidad; con histéresis para no saltar de lado
export function pickSide(lms, prev = null, cfg = PUSHUP_CFG) {
  const l = sideVisibility(lms, 'left'), r = sideVisibility(lms, 'right');
  if (!prev) return l >= r ? 'left' : 'right';
  const cur = prev === 'left' ? l : r, other = prev === 'left' ? r : l;
  return other > cur + cfg.sideSwitchVis ? (prev === 'left' ? 'right' : 'left') : prev;
}
// Mide una pose: landmarks normalizados (x,y en 0..1) y el tamaño de la imagen (para ángulos reales)
export function measurePose(lms, side, w, h, mirror = false) {
  const ix = SIDES[side];
  const P = k => { const p = lms[ix[k]]; return { x: (mirror ? 1 - p.x : p.x) * w, y: p.y * h }; };
  const sh = P('sh'), el = P('el'), wr = P('wr'), hip = P('hip'), an = P('an');
  const fore = Math.hypot(wr.x - el.x, wr.y - el.y), upper = Math.hypot(el.x - sh.x, el.y - sh.y);
  return {
    elbow: angle(sh, el, wr), align: angle(sh, hip, an),
    // altura del hombro sobre la muñeca, en largos de antebrazo (referencia para el modo desarrollador)
    depth: fore > 1 ? (wr.y - sh.y) / fore : null, arm: fore + upper,
    vis: sideVisibility(lms, side)
  };
}

export function labelFor(nota, cfg = PUSHUP_CFG) {
  return nota >= cfg.excelente ? 'Excelente' : nota >= cfg.buena ? 'Buena' : nota >= cfg.regular ? 'Regular' : 'Incompleta';
}

// Califica una repetición: m = { angMin, angMax, alignMin, dur }. Devuelve criterios 0..100, nota 0..100, etiqueta y consejo.
export function scoreRep(m, cfg = PUSHUP_CFG) {
  const prof = lin(m.angMin, cfg.prof.zero, cfg.prof.full);
  const ext = lin(m.angMax, cfg.ext.zero, cfg.ext.full);
  const alin = lin(m.alignMin, cfg.alin.zero, cfg.alin.full);
  const c = cfg.ctrl;
  const ctrl = m.dur <= c.tooFast ? 0
    : m.dur < c.okMin ? lin(m.dur, c.tooFast, c.okMin)
    : m.dur <= c.okMax ? 100
    : m.dur < c.tooSlow ? lin(m.dur, c.tooSlow, c.okMax) : 0;
  const nota = Math.round((prof * cfg.prof.w + ext * cfg.ext.w + alin * cfg.alin.w + ctrl * cfg.ctrl.w) / 100);
  const label = labelFor(nota, cfg);
  // consejo según el criterio que más puntos hace perder
  const loss = [
    ['prof', cfg.prof.w * (100 - prof), 'Baja más el pecho'],
    ['ext', cfg.ext.w * (100 - ext), 'Estira los brazos arriba'],
    ['alin', cfg.alin.w * (100 - alin), 'Mantén la cadera alineada'],
    ['ctrl', cfg.ctrl.w * (100 - ctrl), m.dur < c.okMin ? 'Más despacio' : 'Algo más fluido']
  ].sort((a, b) => b[1] - a[1])[0];
  const tip = loss[1] <= 300 ? '¡Muy bien!' : loss[2]; // 300 = unos 3 puntos de nota perdidos
  return { nota, prof: Math.round(prof), ext: Math.round(ext), alin: Math.round(alin), ctrl: Math.round(ctrl), label, tip, completa: nota >= cfg.regular };
}

export function summarize(reps) {
  const total = reps.length, completas = reps.filter(r => r.completa).length;
  const notaMedia = total ? Math.round(reps.reduce((a, r) => a + r.nota, 0) / total) : 0;
  const sorted = [...reps].sort((a, b) => b.nota - a.nota);
  return { total, completas, incompletas: total - completas, notaMedia, mejor: sorted[0] || null, peor: sorted[sorted.length - 1] || null };
}

// ---------- Máquina de estados ----------
// ARRIBA (codo > upDone) -> BAJANDO (< downStart) -> SUBIENDO (sube riseDelta desde el mínimo) -> ARRIBA (> upDone) => +1 rep
// Al cerrar se espera un instante al pico del codo (para medir la extensión real) y entonces se califica.
export function createMachine() {
  return { phase: 'ARRIBA', armed: false, rep: null, settle: false, tUp: 0, maxSinceMin: 0, noPlank: false, count: 0, discarded: 0 };
}

function finishRep(st, cfg) {
  const r = st.rep; st.rep = null; st.settle = false; st.phase = 'ARRIBA'; st.armed = true;
  const dur = st.tUp - r.t0;
  if (dur < cfg.minRepSec) { st.discarded++; return { type: 'discard', reason: 'rapida', dur }; }
  st.count++;
  const sc = scoreRep({ angMin: r.angMin, angMax: r.angMax, alignMin: r.alignMin, dur }, cfg);
  return { type: 'rep', rep: { n: st.count, ...sc, dur: Math.round(dur * 100) / 100, angMin: Math.round(r.angMin), t: Math.round(r.t0 * 100) / 100 } };
}
function dropRep(st, reason) {
  st.rep = null; st.settle = false; st.phase = 'ARRIBA'; st.armed = false; st.discarded++;
  return { type: 'discard', reason };
}

// s = { t (s), elbow, align, visible }. Devuelve un evento ({type:'rep'|'discard'}) o null.
export function stepMachine(st, s, cfg = PUSHUP_CFG) {
  const { t, elbow, align } = s;
  if (!s.visible || elbow == null) {
    if (!st.rep) return null;
    return st.settle ? finishRep(st, cfg) : dropRep(st, 'perdido');
  }
  let ev = null;
  if (align != null) st.noPlank = align < cfg.plankMin;

  if (st.rep) {
    const r = st.rep;
    if (align != null && align < r.alignMin) r.alignMin = align;
    if (st.settle) {
      if (elbow > r.angMax) r.angMax = elbow;
      if (elbow < cfg.downStart || elbow < r.angMax - cfg.settleDrop || t - st.tUp >= cfg.settleSec) {
        ev = finishRep(st, cfg);   // st.rep = null: sigue por si ya empezó otra bajada
      }
    } else {
      if (t - r.t0 > cfg.maxRepSec) return dropRep(st, 'larga');
      if (st.phase === 'BAJANDO') {
        if (elbow < r.angMin) r.angMin = elbow;
        else if (elbow > r.angMin + cfg.riseDelta) { st.phase = 'SUBIENDO'; st.maxSinceMin = elbow; }
      } else if (st.phase === 'SUBIENDO') {
        if (elbow > st.maxSinceMin) st.maxSinceMin = elbow;
        if (elbow < st.maxSinceMin - cfg.riseDelta) { st.phase = 'BAJANDO'; if (elbow < r.angMin) r.angMin = elbow; } // rebote
      }
      if (st.phase === 'SUBIENDO' && elbow >= cfg.upDone) { st.settle = true; st.tUp = t; r.angMax = elbow; }
    }
  }
  if (!st.rep) {
    if (elbow >= cfg.upDone) st.armed = true;
    if (st.armed && elbow < cfg.downStart && !st.noPlank) {
      st.rep = { t0: t, angMin: elbow, angMax: -Infinity, alignMin: align ?? 180 };
      st.phase = 'BAJANDO'; st.settle = false;
    }
  }
  return ev;
}
// Al terminar la serie: si había una repetición esperando el pico, se cierra
export function flushMachine(st, t, cfg = PUSHUP_CFG) {
  if (st.rep && st.settle) return finishRep(st, cfg);
  if (st.rep) return dropRep(st, 'incompleta');
  return null;
}

// ---------- Carga de MediaPipe (solo la primera vez que se usa) ----------
const MP_VER = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let mpPromise = null;

async function createLandmarker(mod, fileset, delegate) {
  return mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5
  });
}
// Devuelve { landmarker, delegate, reloadCpu() }
export function loadDetector() {
  if (!mpPromise) {
    mpPromise = (async () => {
      const mod = await import(MP_BASE + '/vision_bundle.mjs');
      const fileset = await mod.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
      const d = { landmarker: null, delegate: 'GPU', mod, fileset };
      try { d.landmarker = await createLandmarker(mod, fileset, 'GPU'); }
      catch (e) { console.warn('GPU no disponible, se usa CPU', e); d.delegate = 'CPU'; d.landmarker = await createLandmarker(mod, fileset, 'CPU'); }
      d.reloadCpu = async () => { try { d.landmarker.close(); } catch {} d.delegate = 'CPU'; d.landmarker = await createLandmarker(mod, fileset, 'CPU'); };
      return d;
    })().catch(e => { mpPromise = null; throw e; });
  }
  return mpPromise;
}

// ---------- Grabación ----------
export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
}

// ---------- Dibujo ----------
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12]];
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Sesión en vivo ----------
// startPushupSession({ video, canvas, onRep, onState, devTracking, mirror, fileMode })
// Dibuja la cámara (o el video) en el canvas con el HUD. begin() empieza a contar y a grabar.
// stop() devuelve Promise<{ reps, blob, mime, duracion, total, completas, notaMedia }>.
export async function startPushupSession(opts) {
  const { video, canvas, onRep = () => {}, onState = () => {}, mirror = false } = opts;
  let dev = typeof opts.devTracking === 'function' ? opts.devTracking : () => !!opts.devTracking;
  const cfg = PUSHUP_CFG;
  const det = await loadDetector();
  const ctx = canvas.getContext('2d');
  const useVideoClock = !video.srcObject;           // con un archivo, el tiempo es el del video
  const nowSec = () => (useVideoClock ? video.currentTime : performance.now() / 1000);

  let running = true, counting = false, paused = false;
  let machine = createMachine();
  let reps = [], side = null, lastLms = null, lastMeas = null, sm = { elbow: null, align: null };
  let tBegin = 0, pausedAt = 0, pausedTotal = 0, tStartClock = 0;
  let lastRep = null, lastRepAt = 0, hud = { serie: '' };
  let fps = 0, lastDetAt = 0, frameN = 0, detEvery = 1, lowCount = 0, tsLast = 0, badFrames = 0;
  let recorder = null, chunks = [], mime = '', stopPromise = null, wakeLock = null;

  // pantalla encendida mientras dura el ejercicio
  async function lockScreen() { try { if (navigator.wakeLock && !wakeLock && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {} }
  const onVis = () => { if (running) lockScreen(); };
  document.addEventListener('visibilitychange', onVis);
  lockScreen();

  function sizeCanvas() {
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return false;
    const k = Math.min(1, 1280 / Math.max(vw, vh)), w = Math.round(vw * k), h = Math.round(vh * k);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return true;
  }
  const elapsed = () => (counting ? Math.max(0, (paused ? pausedAt : performance.now() / 1000) - tStartClock - pausedTotal) : 0);

  function detect() {
    const ts = Math.max(performance.now(), tsLast + 1); tsLast = ts;
    let res;
    try { res = det.landmarker.detectForVideo(video, ts); }
    catch (e) {
      // algunos celulares aceptan GPU al crear pero fallan al detectar: se pasa a CPU
      if (det.delegate === 'GPU' && ++badFrames >= 1) { badFrames = 0; det.reloadCpu().catch(() => {}); }
      return;
    }
    const t1 = performance.now();
    if (lastDetAt) { const inst = 1000 / Math.max(1, t1 - lastDetAt); fps = fps ? fps + 0.15 * (inst - fps) : inst; }
    lastDetAt = t1;
    const lms = res && res.landmarks && res.landmarks[0];
    lastLms = lms || null;
    let visible = false, ev = null;
    if (lms) {
      side = pickSide(lms, side, cfg);
      const m = measurePose(lms, side, canvas.width, canvas.height, mirror);
      lastMeas = m;
      visible = m.vis >= cfg.minVis && m.elbow != null && m.align != null;
      if (visible) { sm.elbow = ema(sm.elbow, m.elbow); sm.align = ema(sm.align, m.align); }
      else { sm.elbow = sm.align = null; }
    } else { lastMeas = null; sm.elbow = sm.align = null; }
    if (counting && !paused) ev = stepMachine(machine, { t: nowSec(), elbow: sm.elbow, align: sm.align, visible }, cfg);
    if (ev && ev.type === 'rep') {
      const rep = { ...ev.rep, t: Math.round(elapsed() * 100) / 100 };
      reps.push(rep); lastRep = rep; lastRepAt = performance.now(); onRep(rep, summarize(reps));
    }
    // si el rendimiento es bajo, se detecta cada 2 frames (la grabación sigue a todo el ritmo)
    if (fps && fps < cfg.lowFps) { if (++lowCount > 45) detEvery = 2; } else lowCount = 0;
    onState({ phase: machine.phase, elbow: sm.elbow, align: sm.align, side, vis: lastMeas ? lastMeas.vis : 0, visible, noPlank: machine.noPlank, fps, delegate: det.delegate, count: machine.count, counting, paused, depth: lastMeas ? lastMeas.depth : null });
  }

  function drawHud(W, H) {
    const u = H / 720;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // contador
    const inc = reps.filter(r => !r.completa).length;
    rr(ctx, 16 * u, 16 * u, 190 * u, 120 * u, 14 * u); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${84 * u}px system-ui,Arial,sans-serif`; ctx.textAlign = 'left';
    ctx.fillText(String(reps.length), 32 * u, 100 * u);
    ctx.font = `600 ${17 * u}px system-ui,Arial,sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(inc ? `flexiones · ${inc} incompl.` : 'flexiones', 32 * u, 124 * u);
    // tiempo y serie
    ctx.textAlign = 'right'; ctx.font = `700 ${34 * u}px system-ui,Arial,sans-serif`;
    const txt = counting ? fmtTime(elapsed()) : '';
    if (txt) { const w = ctx.measureText(txt).width + 24 * u; rr(ctx, W - 16 * u - w, 16 * u, w, 50 * u, 12 * u); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(txt, W - 28 * u, 52 * u); }
    if (hud.serie) { ctx.font = `600 ${18 * u}px system-ui,Arial,sans-serif`; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(hud.serie, W - 28 * u, 90 * u); ctx.shadowBlur = 0; }
    // última repetición: grande 1,5 s y luego pequeña
    if (lastRep) {
      const col = NOTE_COLORS[lastRep.label], age = performance.now() - lastRepAt;
      if (age < 1500) {
        const a = age < 1200 ? 1 : 1 - (age - 1200) / 300;
        ctx.globalAlpha = a; ctx.textAlign = 'center';
        rr(ctx, W / 2 - 230 * u, H - 210 * u, 460 * u, 150 * u, 18 * u); ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fill();
        ctx.lineWidth = 5 * u; ctx.strokeStyle = col; ctx.stroke();
        ctx.fillStyle = col; ctx.font = `700 ${60 * u}px system-ui,Arial,sans-serif`; ctx.fillText(`${lastRep.nota} · ${lastRep.label}`, W / 2, H - 138 * u);
        ctx.fillStyle = '#fff'; ctx.font = `600 ${26 * u}px system-ui,Arial,sans-serif`; ctx.fillText(lastRep.tip, W / 2, H - 90 * u);
        ctx.globalAlpha = 1;
      } else {
        ctx.textAlign = 'left'; ctx.font = `700 ${22 * u}px system-ui,Arial,sans-serif`;
        const s = `#${lastRep.n}  ${lastRep.nota} ${lastRep.label}`, w = ctx.measureText(s).width + 20 * u;
        rr(ctx, 16 * u, 146 * u, w, 36 * u, 10 * u); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill(); ctx.fillStyle = col; ctx.fillText(s, 26 * u, 172 * u);
      }
    }
    // avisos
    let warn = '';
    if (paused) warn = 'PAUSA';
    else if (counting && !lastMeas) warn = 'No te veo: aleja el celular';
    else if (counting && machine.noPlank && machine.phase === 'ARRIBA') warn = 'Ponte en posición de plancha';
    if (warn) {
      ctx.textAlign = 'center'; ctx.font = `700 ${30 * u}px system-ui,Arial,sans-serif`;
      const w = ctx.measureText(warn).width + 36 * u; rr(ctx, W / 2 - w / 2, 16 * u, w, 52 * u, 12 * u);
      ctx.fillStyle = 'rgba(200,110,20,.9)'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(warn, W / 2, 52 * u);
    }
    ctx.restore();
  }

  function drawDev(W, H) {
    if (!lastLms) return;
    const u = H / 720, ix = SIDES[side] || SIDES.left, act = new Set(Object.values(ix));
    const px = p => ({ x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H });
    ctx.save();
    ctx.lineCap = 'round';
    BONES.forEach(([a, b]) => {
      const A = lastLms[a], B = lastLms[b]; if (!A || !B) return;
      const on = act.has(a) && act.has(b), pa = px(A), pb = px(B);
      ctx.strokeStyle = on ? '#00e5ff' : 'rgba(255,255,255,.35)'; ctx.lineWidth = (on ? 5 : 2) * u;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
    lastLms.forEach((p, i) => {
      const q = px(p), on = act.has(i);
      ctx.globalAlpha = on ? 1 : 0.5; ctx.fillStyle = on ? (p.visibility >= cfg.minVis ? '#ffeb3b' : '#ff5252') : '#fff';
      ctx.beginPath(); ctx.arc(q.x, q.y, (on ? 6 : 3) * u, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // arco y número del ángulo del codo; ángulo del cuerpo en la cadera
    const label = (p, s, col) => { ctx.font = `700 ${22 * u}px system-ui,Arial,sans-serif`; ctx.textAlign = 'left'; ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(s, p.x + 12 * u, p.y - 10 * u); ctx.fillStyle = col; ctx.fillText(s, p.x + 12 * u, p.y - 10 * u); };
    if (sm.elbow != null) {
      const sh = px(lastLms[ix.sh]), el = px(lastLms[ix.el]), wr = px(lastLms[ix.wr]);
      const a1 = Math.atan2(sh.y - el.y, sh.x - el.x), a2 = Math.atan2(wr.y - el.y, wr.x - el.x);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(el.x, el.y, 36 * u, a1, a1 + d, d < 0); ctx.stroke();
      label(el, `${Math.round(sm.elbow)}°`, '#ffb74d');
    }
    if (sm.align != null) label(px(lastLms[ix.hip]), `${Math.round(sm.align)}°`, '#80d8ff');
    // barra vertical de profundidad (según el ángulo del codo) con marcas de los umbrales
    const bx = W - 46 * u, by = 100 * u, bh = H - 260 * u, lo = 60, hi = 180, yOf = a => by + bh - ((clamp(a, lo, hi) - lo) / (hi - lo)) * bh;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(ctx, bx, by, 18 * u, bh, 6 * u); ctx.fill();
    [[cfg.prof.full, '#2ecc71'], [cfg.prof.zero, '#f0a92e'], [cfg.downStart, '#fff'], [cfg.upDone, '#fff']].forEach(([a, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(bx - 8 * u, yOf(a)); ctx.lineTo(bx + 26 * u, yOf(a)); ctx.stroke();
      ctx.font = `600 ${13 * u}px system-ui,Arial,sans-serif`; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(`${a}°`, bx - 10 * u, yOf(a) + 4 * u);
    });
    if (sm.elbow != null) { ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.arc(bx + 9 * u, yOf(sm.elbow), 9 * u, 0, 7); ctx.fill(); }
    // texto de estado
    const lines = [`Estado: ${machine.phase}${machine.settle ? ' (cierre)' : ''}${machine.noPlank ? ' · sin plancha' : ''}`, `Lado: ${side === 'left' ? 'izquierdo' : 'derecho'} · visib. ${lastMeas ? lastMeas.vis.toFixed(2) : '–'}`, `Detección: ${fps ? fps.toFixed(0) : '–'} FPS · ${det.delegate}${detEvery > 1 ? ' · cada 2 frames' : ''}`, `Profundidad: ${lastMeas && lastMeas.depth != null ? lastMeas.depth.toFixed(2) : '–'}`];
    ctx.font = `600 ${16 * u}px ui-monospace,Consolas,monospace`; ctx.textAlign = 'left';
    const bw = 360 * u, bh2 = (lines.length * 22 + 12) * u, y0 = H - bh2 - 12 * u;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, 12 * u, y0, bw, bh2, 8 * u); ctx.fill();
    ctx.fillStyle = '#9cff9c'; lines.forEach((s, i) => ctx.fillText(s, 22 * u, y0 + (24 + i * 22) * u));
    ctx.restore();
  }

  function frame() {
    if (!running) return;
    if (video.readyState >= 2 && sizeCanvas()) {
      const W = canvas.width, H = canvas.height;
      if (!paused && (++frameN % detEvery === 0)) detect();
      ctx.save();
      if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, W, H);
      ctx.restore();
      if (dev()) drawDev(W, H);
      drawHud(W, H);
    }
    schedule();
  }
  const hasRvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  function schedule() {
    if (!running) return;
    // con requestVideoFrameCallback hay un dibujo por frame real de la cámara; el reloj de reserva evita quedarse parado
    if (hasRvfc) { let done = false; const go = () => { if (!done) { done = true; frame(); } }; video.requestVideoFrameCallback(go); setTimeout(go, 250); }
    else requestAnimationFrame(frame);
  }
  schedule();

  return {
    get detector() { return det.delegate; },
    setDev(v) { dev = () => !!v; },
    setHud(h) { hud = { ...hud, ...h }; },
    // empieza a contar y a grabar
    begin() {
      machine = createMachine(); reps = []; lastRep = null; sm = { elbow: null, align: null };
      tBegin = nowSec(); tStartClock = performance.now() / 1000; pausedTotal = 0; paused = false; counting = true;
      mime = pickMime(); chunks = [];
      try {
        const stream = canvas.captureStream(30);
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : { videoBitsPerSecond: 2500000 });
        recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.start(1000);
      } catch (e) { console.warn('No se pudo iniciar la grabación', e); recorder = null; }
    },
    pause() { if (!counting || paused) return; paused = true; pausedAt = performance.now() / 1000; try { recorder && recorder.state === 'recording' && recorder.pause(); } catch {} },
    resume() { if (!paused) return; pausedTotal += performance.now() / 1000 - pausedAt; paused = false; try { recorder && recorder.state === 'paused' && recorder.resume(); } catch {} },
    get paused() { return paused; },
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        const dur = elapsed();
        if (counting) { const ev = flushMachine(machine, nowSec(), cfg); if (ev && ev.type === 'rep') { const rep = { ...ev.rep, t: Math.round(dur * 100) / 100 }; reps.push(rep); onRep(rep, summarize(reps)); } }
        running = false; counting = false;
        document.removeEventListener('visibilitychange', onVis);
        try { wakeLock && wakeLock.release(); } catch {} wakeLock = null;
        let blob = null;
        if (recorder) {
          await new Promise(res => { recorder.onstop = res; try { if (recorder.state !== 'inactive') recorder.stop(); else res(); } catch { res(); } });
          if (chunks.length) blob = new Blob(chunks, { type: (recorder.mimeType || mime || 'video/webm').split(';')[0] });
          recorder.stream && recorder.stream.getTracks().forEach(t => t.stop());
        }
        return { reps, blob, mime: blob ? blob.type : '', duracion: Math.round(dur), ...summarize(reps) };
      })();
      return stopPromise;
    }
  };
}
