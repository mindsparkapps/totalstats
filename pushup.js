// ===== Ejercicios con cámara (flexiones y sentadillas): pose (MediaPipe), conteo, calificación y grabación =====
// Módulo ES. rutina.js lo carga con import() solo cuando se abre el ejercicio.
// La lógica pura (ángulos, máquina de estados, nota) no toca el DOM y se prueba con Node.
//
// El conteo usa dos canales a la vez:
//   1) el ÁNGULO de la articulación principal (codo en flexiones, rodilla en sentadillas), fusionando los dos lados;
//   2) el MOVIMIENTO VERTICAL del cuerpo: cabeza (nariz, ojos, orejas, boca), hombros y cadera respecto del suelo.
// Se fusionan en una sola señal («main»). Si una falla (brazo tapado), cuenta el otro canal.

// ---------- Configuración: todos los umbrales juntos para afinarlos tras probar con personas ----------
export const PUSHUP_CFG = {
  id: 'flexiones', unit: 'flexión', units: 'flexiones',
  kind: 'pushup',                // cómo se mide la pose
  keys: ['sh', 'el', 'wr', 'hip', 'an'], // puntos que cuentan para la visibilidad de un lado
  floor: [15, 16, 27, 28, 31, 32],       // puntos que apoyan en el suelo (muñecas y pies)
  // máquina de estados (grados de la señal principal)
  upDone: 155,         // tope: por encima de esto la repetición se cierra
  upDoneMin: 140,      // el umbral de arriba se adapta al tope real de la persona, nunca por debajo de esto
  downGap: 15,         // la bajada empieza upDone - downGap grados por debajo
  riseDelta: 10,       // histéresis: cuánto debe subir/bajar para cambiar de fase
  settleDrop: 4,       // al cerrar se espera al pico; se termina cuando baja esto desde el máximo
  settleSec: 0.5,      // ...o tras este tiempo
  minRepSec: 0.4,      // un ciclo más corto se descarta
  maxRepSec: 15,       // un ciclo más largo se descarta
  plankMin: 135,       // hombro-cadera-tobillo mínimo para considerar plancha (null = no se exige postura)
  alignWorst: 'min',   // en la alineación, lo peor es el valor más bajo
  minVis: 0.4,         // visibilidad mínima de los puntos usados
  sideSwitchVis: 0.15, // ventaja de visibilidad para cambiar de lado principal
  smoothAlpha: 0.5,    // media móvil exponencial
  // canal vertical
  vWeight: 0.35,       // peso del canal vertical en la señal principal
  vMinRange: 0.08,     // recorrido vertical mínimo (en largos de torso) para fiarse de él
  vWindow: 6,          // segundos que se recuerdan para normalizar el recorrido
  vTop: 170, vBottom: 70, // ángulos equivalentes de arriba y abajo del canal vertical
  // calificación: zero = valor con 0 %, full = valor con 100 %
  prof: { w: 50, zero: 120, full: 75 },    // ángulo mínimo del codo
  ext: { w: 20, zero: 145, full: 165 },    // ángulo máximo del codo
  alin: { w: 20, zero: 145, full: 170 },   // peor ángulo hombro-cadera-tobillo
  ctrl: { w: 10, tooFast: 0.5, okMin: 1.2, okMax: 3, tooSlow: 6 }, // duración (s)
  tips: { prof: 'Baja más el pecho', ext: 'Estira los brazos arriba', alin: 'Mantén la cadera alineada', fast: 'Más despacio', slow: 'Algo más fluido', ok: '¡Muy bien!' },
  warnPosture: 'Ponte en posición de plancha',
  // etiquetas
  excelente: 85, buena: 70, regular: 50,
  // rendimiento
  lowFps: 12
};

export const SQUAT_CFG = {
  id: 'sentadillas', unit: 'sentadilla', units: 'sentadillas',
  kind: 'squat',
  keys: ['sh', 'hip', 'kn', 'an'],
  floor: [27, 28, 29, 30, 31, 32],         // tobillos y pies
  upDone: 165, upDoneMin: 150, downGap: 18,
  riseDelta: 10, settleDrop: 4, settleSec: 0.5,
  minRepSec: 0.8, maxRepSec: 20,
  plankMin: null,
  alignWorst: 'max',   // en el torso, lo peor es la inclinación más alta
  minVis: 0.4, sideSwitchVis: 0.15, smoothAlpha: 0.5,
  vWeight: 0.35, vMinRange: 0.1, vWindow: 6, vTop: 170, vBottom: 90,
  prof: { w: 50, zero: 135, full: 95 },    // ángulo mínimo de la rodilla (90° = muslos paralelos)
  ext: { w: 15, zero: 150, full: 168 },    // ángulo máximo de la rodilla al pararse
  alin: { w: 25, zero: 70, full: 35 },     // inclinación del torso respecto de la vertical (menos es mejor)
  ctrl: { w: 10, tooFast: 0.8, okMin: 1.5, okMax: 4, tooSlow: 8 },
  tips: { prof: 'Baja más la cadera', ext: 'Termina de pararte arriba', alin: 'Mantén el pecho erguido', fast: 'Más despacio', slow: 'Algo más fluido', ok: '¡Muy bien!' },
  warnPosture: '',
  excelente: 85, buena: 70, regular: 50,
  lowFps: 12
};

// --- Flexiones DE FRENTE: celular vertical con la cámara frontal, cabeza hacia la cámara y pies al fondo ---
// De frente el ángulo del codo no sirve (los brazos apuntan a la cámara). Se usa lo que sí se ve:
// la altura de la cabeza (nariz, ojos, orejas, boca) y de los hombros sobre las muñecas, medida en «anchos de manos»
// (las manos están quietas en el suelo, así que su separación es una regla que no cambia).
export const PUSHUP_FRONT_CFG = {
  ...PUSHUP_CFG,
  kind: 'pushup-front', view: 'frontal', noAngle: true,
  keys: ['sh', 'wr'],
  vMode: 'frontPushup', vWeight: 1, vMinRange: 0.12, vWindow: 8,
  upDone: 155, upDoneMin: 140, downGap: 25,   // en «ángulos equivalentes» del canal vertical
  riseDelta: 12, settleDrop: 5, minRepSec: 0.5,
  plankMin: null,
  profC: { zero: 40, full: 85 },              // recorrido vertical de la repetición, % del ancho de manos
  prof: { w: 80, zero: 120, full: 75 }, ext: { w: 0, zero: 145, full: 165 }, alin: { w: 0, zero: 145, full: 170 },
  ctrl: { w: 20, tooFast: 0.5, okMin: 1.2, okMax: 3, tooSlow: 6 },
  tips: { prof: 'Baja más el pecho', ext: '', alin: '', fast: 'Más despacio', slow: 'Algo más fluido', ok: '¡Muy bien!' },
  warnPosture: ''
};

// --- Abdominales: celular de costado; ángulo del tronco (hombro-cadera-rodilla) y altura de hombros y cabeza ---
export const CRUNCH_CFG = {
  ...SQUAT_CFG,
  id: 'abdominales', unit: 'abdominal', units: 'abdominales', kind: 'crunch', view: 'lateral',
  keys: ['sh', 'hip'], floor: [23, 24], vw: [0.5, 0.5, 0], vInvert: true, vBottom: 90,
  angLabel: v => `${Math.round(180 - v)}° tronco`,
  upDone: 168, upDoneMin: 160, downGap: 14, minRepSec: 0.6, maxRepSec: 15,
  prof: { w: 60, zero: 160, full: 105 }, ext: { w: 25, zero: 150, full: 172 }, alin: { w: 0, zero: 70, full: 35 },
  ctrl: { w: 15, tooFast: 0.6, okMin: 1.2, okMax: 4, tooSlow: 8 },
  tips: { prof: 'Sube más el torso', ext: 'Baja del todo hasta el suelo', alin: '', fast: 'Más despacio', slow: 'Algo más fluido', ok: '¡Muy bien!' }
};

// --- Sentadilla búlgara: celular de costado; se mide la rodilla de la pierna de adelante (la del tobillo más bajo) ---
export const BULGARIAN_CFG = {
  ...SQUAT_CFG,
  id: 'bulgaras', unit: 'sentadilla búlgara', units: 'sentadillas búlgaras', kind: 'bulgarian', view: 'lateral',
  floorMode: 'lowest', minRepSec: 1.0, maxRepSec: 25,
  prof: { w: 50, zero: 140, full: 95 },
  ctrl: { w: 10, tooFast: 0.8, okMin: 1.5, okMax: 4.5, tooSlow: 9 },
  tips: { prof: 'Baja más la cadera', ext: 'Termina de pararte arriba', alin: 'Mantén el pecho erguido', fast: 'Más despacio', slow: 'Algo más fluido', ok: '¡Muy bien!' }
};

// --- Elevaciones laterales con mancuernas: de frente a la cámara; ángulo de elevación de los brazos (0° = abajo, 90° = a la altura del hombro).
// La señal es 180° − elevación, para que «brazos abajo» sea el valor alto como en los demás ejercicios.
export const RAISE_CFG = {
  ...PUSHUP_CFG,
  id: 'laterales', unit: 'elevación', units: 'elevaciones', kind: 'raise', view: 'frontal',
  keys: ['sh', 'el', 'wr', 'hip'],
  vMode: 'wrists', vInvert: true, vTop: 170, vBottom: 90, vWeight: 0.35, vMinRange: 0.15,
  upDone: 160, upDoneMin: 145, downGap: 25, riseDelta: 10, minRepSec: 0.8, maxRepSec: 12,
  plankMin: null, alignWorst: 'min',
  prof: { w: 45, zero: 125, full: 90 },    // señal mínima: 90 = brazos a la altura de los hombros
  ext: { w: 15, zero: 140, full: 165 },    // señal máxima: brazos bien abajo
  alin: { w: 25, zero: 110, full: 155 },   // ángulo del codo: brazos casi rectos
  ctrl: { w: 15, tooFast: 0.8, okMin: 1.6, okMax: 4, tooSlow: 8 },
  angLabel: v => `${Math.round(180 - v)}° elev.`,
  tips: { prof: 'Sube hasta la altura de los hombros', ext: 'Baja del todo los brazos', alin: 'Mantén los brazos casi rectos', fast: 'Más despacio, sin balanceo', slow: 'Algo más fluido', ok: '¡Muy bien!' },
  warnPosture: ''
};

// --- Balón entre los pies: celular horizontal, de frente a la persona (cuerpo entero a la vista). ---
// Se usan dos detectores: la pose (para los pies) y un detector de objetos (para el balón, clase «sports ball»).
// Un «cambio de pie» se cuenta cuando el balón pasa de estar junto a un pie a estar junto al otro.
// Las distancias se miden en «largos de pierna» (cadera-tobillo), así no dependen de lo lejos que esté el celular.
export const BALL_CFG = {
  ...SQUAT_CFG,
  id: 'balon', unit: 'cambio de pie', units: 'cambios de pie', kind: 'ball', view: 'frontal',
  keys: ['kn', 'an'], minVis: 0.4, lowFps: 10,
  reach: 0.8,          // distancia máxima balón-pie para «tener» el balón (largos de pierna)
  margin: 0.8,         // el pie dueño debe estar al menos así de más cerca que el otro (0.8 = 20 % más cerca)
  minGapSec: 0.15,     // dos cambios más juntos que esto se toman como rebote
  maxGapSec: 2.5,      // si pasó más tiempo sin tocar, no cuenta como cambio (solo reinicia)
  lostSec: 1.5,        // sin ver el balón este tiempo se olvida quién lo tenía
  ballHoldSec: 0.35,   // cuánto tiempo se da por buena la última posición del balón
  closeFull: 0.2, closeZero: 0.8,       // control: distancia al pie con 100 % y con 0 % (largos de pierna)
  tempo: { tooFast: 0.2, okMin: 0.35, okMax: 1.2, tooSlow: 2.5 },
  tips: { prof: 'Mantén el balón más pegado al pie', ext: '', alin: '', fast: 'Más controlado, sin prisa', slow: 'Un poco más de ritmo', ok: '¡Muy bien!' }
};

// Estado del conteo de cambios de pie (función pura: se prueba con Node)
export function createBallState() { return { owner: null, ownerT: 0, touchD: Infinity, lastCount: -Infinity, count: 0, lastBallT: -Infinity, dL: null, dR: null }; }
// s = { t (s), ball: {x,y}|null, L: {x,y}|null, R: {x,y}|null, unit (px de un largo de pierna) }. Devuelve { type:'rep', rep } o null.
export function stepBall(st, s, cfg = BALL_CFG) {
  const { t, ball, L, R, unit } = s;
  if (!ball || !unit || (!L && !R)) { if (t - st.lastBallT > cfg.lostSec) { st.owner = null; st.touchD = Infinity; } return null; }
  st.lastBallT = t;
  const dL = L ? Math.hypot(ball.x - L.x, ball.y - L.y) / unit : Infinity, dR = R ? Math.hypot(ball.x - R.x, ball.y - R.y) / unit : Infinity;
  st.dL = dL; st.dR = dR;
  const cand = dL <= cfg.reach && dL < dR * cfg.margin ? 'L' : dR <= cfg.reach && dR < dL * cfg.margin ? 'R' : null;
  if (!cand) return null;                                  // en el aire o entre los dos pies: sigue valiendo el dueño anterior
  const d = cand === 'L' ? dL : dR;
  if (st.owner === null) { st.owner = cand; st.ownerT = t; st.touchD = d; return null; }
  if (cand === st.owner) { st.ownerT = t; st.touchD = Math.min(st.touchD, d); return null; }
  // el balón cambió de pie
  const prev = st.owner, gap = t - st.ownerT, touchD = st.touchD;
  st.owner = cand; st.ownerT = t; st.touchD = d;
  if (gap > cfg.maxGapSec) return null;
  if (t - st.lastCount < cfg.minGapSec) return null;
  const dur = Number.isFinite(st.lastCount) ? t - st.lastCount : gap;
  st.lastCount = t; st.count++;
  const dist = (Math.min(touchD, d) + d) / 2;              // cercanía media al pie en el cambio
  const prof = Math.round(lin(dist, cfg.closeZero, cfg.closeFull));
  const c = cfg.tempo;
  const ctrl = Math.round(dur <= c.tooFast ? 0 : dur < c.okMin ? lin(dur, c.tooFast, c.okMin) : dur <= c.okMax ? 100 : dur < c.tooSlow ? lin(dur, c.tooSlow, c.okMax) : 0);
  const nota = Math.round(0.6 * prof + 0.4 * ctrl), label = labelFor(nota, cfg);
  const tip = nota >= cfg.buena ? cfg.tips.ok : prof <= ctrl ? cfg.tips.prof : dur < c.okMin ? cfg.tips.fast : cfg.tips.slow;
  return { type: 'rep', rep: { n: st.count, nota, prof, ext: 100, alin: 100, ctrl, label, tip, completa: nota >= cfg.regular, dir: prev === 'L' ? 'ID' : 'DI', dist: Math.round(dist * 100), dur: Math.round(dur * 100) / 100, angMin: null, caida: null, t: 0 } };
}

// Detector de objetos para el balón (MediaPipe ObjectDetector, EfficientDet-Lite0 de COCO: clase «sports ball»)
const BALL_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
let ballPromise = null;
export function loadBallDetector(det) {
  if (!ballPromise) {
    const make = delegate => det.mod.ObjectDetector.createFromOptions(det.fileset, {
      baseOptions: { modelAssetPath: BALL_MODEL_URL, delegate }, runningMode: 'VIDEO', scoreThreshold: 0.2, maxResults: 6, categoryAllowlist: ['sports ball']
    });
    ballPromise = (async () => { try { return await make(det.delegate); } catch (e) { console.warn('Detector de balón: se usa CPU', e); return make('CPU'); } })().catch(e => { ballPromise = null; throw e; });
  }
  return ballPromise;
}

// Configuración de cada ejercicio y de cada posición del celular. La primera vista de cada lista es la predeterminada.
export const EXERCISE_CFG = {
  balon: { frontal: BALL_CFG },
  flexiones: { frontal: PUSHUP_FRONT_CFG, lateral: PUSHUP_CFG },
  sentadillas: { lateral: SQUAT_CFG },
  abdominales: { lateral: CRUNCH_CFG },
  bulgaras: { lateral: BULGARIAN_CFG },
  laterales: { frontal: RAISE_CFG }
};
export function getCfg(exercise, view) {
  const e = EXERCISE_CFG[exercise] || EXERCISE_CFG.flexiones;
  return e[view] || Object.values(e)[0];
}

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

// Índices de MediaPipe Pose (33 puntos): 0 nariz, 1-6 ojos, 7-8 orejas, 9-10 boca, 11-12 hombros, 13-14 codos,
// 15-16 muñecas, 17-22 manos, 23-24 caderas, 25-26 rodillas, 27-28 tobillos, 29-32 talones y puntas de los pies
export const SIDES = {
  left: { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27 },
  right: { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28 }
};
export const FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const KEYS = PUSHUP_CFG.keys;
const visOf = (lms, i) => (lms[i] && lms[i].visibility) ?? 0;
export function sideVisibility(lms, side, keys = KEYS) {
  const ix = SIDES[side];
  return keys.reduce((a, k) => a + visOf(lms, ix[k]), 0) / keys.length;
}
// Elige el lado del cuerpo con mejor visibilidad; con histéresis para no saltar de lado
export function pickSide(lms, prev = null, cfg = PUSHUP_CFG) {
  const l = sideVisibility(lms, 'left', cfg.keys), r = sideVisibility(lms, 'right', cfg.keys);
  if (!prev) return l >= r ? 'left' : 'right';
  const cur = prev === 'left' ? l : r, other = prev === 'left' ? r : l;
  return other > cur + cfg.sideSwitchVis ? (prev === 'left' ? 'right' : 'left') : prev;
}

// Punto medio (en píxeles) de los puntos visibles de una lista; null si no hay ninguno
function avgPts(lms, idxs, w, h, mirror, minV = 0.3) {
  let sx = 0, sy = 0, n = 0;
  idxs.forEach(i => { const p = lms[i]; if (p && visOf(lms, i) >= minV) { sx += (mirror ? 1 - p.x : p.x) * w; sy += p.y * h; n++; } });
  return n ? { x: sx / n, y: sy / n, n } : null;
}

// Canal vertical: altura del cuerpo medida contra una referencia fija. Según cfg.vMode:
//  'body'        cabeza (nariz, ojos, orejas, boca), hombros y cadera sobre el suelo, en largos de torso
//  'frontPushup' cabeza y hombros sobre las muñecas, en anchos de manos (flexiones de frente)
//  'wrists'      muñecas sobre la cadera, en largos de torso (elevaciones laterales)
export function verticalPose(lms, w, h, mirror = false, cfg = PUSHUP_CFG) {
  const mode = cfg.vMode || 'body';
  const head = avgPts(lms, FACE, w, h, mirror), sh = avgPts(lms, [11, 12], w, h, mirror), hip = avgPts(lms, [23, 24], w, h, mirror);
  const wr = avgPts(lms, [15, 16], w, h, mirror);
  const out = (vh, o) => ({ vh, head: null, sh: null, hip: null, floorY: null, headY: null, shY: sh ? sh.y : null, hipY: hip ? hip.y : null, torso: 0, faceN: head ? head.n : 0, floorName: 'suelo', headName: 'cabeza', shName: 'hombros', ...o });
  if (mode === 'frontPushup') {
    // la regla es la separación de las muñecas; si no se ven las dos, el ancho de hombros
    const wl = lms[15], wrr = lms[16], okW = wl && wrr && visOf(lms, 15) >= 0.3 && visOf(lms, 16) >= 0.3;
    const span = okW ? Math.hypot((wl.x - wrr.x) * w, (wl.y - wrr.y) * h) : (lms[11] && lms[12] ? Math.hypot((lms[11].x - lms[12].x) * w, (lms[11].y - lms[12].y) * h) : 0);
    if (!sh || !wr || span < 20) return null;
    const H = p => (p ? (wr.y - p.y) / span : null);
    const parts = [[H(head), 0.5], [H(sh), 0.5]].filter(x => x[0] != null);
    const vh = parts.reduce((a, x) => a + x[0] * x[1], 0) / parts.reduce((a, x) => a + x[1], 0);
    return out(vh, { head: H(head), sh: H(sh), floorY: wr.y, headY: head ? head.y : null, torso: span, floorName: 'muñecas' });
  }
  if (mode === 'wrists') {
    if (!sh || !hip || !wr) return null;
    const torso = Math.hypot(sh.x - hip.x, sh.y - hip.y);
    if (torso < 20) return null;
    const vh = (hip.y - wr.y) / torso;
    return out(vh, { head: vh, sh: (hip.y - sh.y) / torso, floorY: hip.y, headY: wr.y, torso, floorName: 'cadera', headName: 'muñecas' });
  }
  let floor = avgPts(lms, cfg.floor, w, h, mirror);
  if (floor && cfg.floorMode === 'lowest') {      // el apoyo es el punto más bajo (sentadilla búlgara: el pie de adelante)
    const pts = cfg.floor.filter(i => visOf(lms, i) >= 0.3).map(i => lms[i].y * h);
    if (pts.length) floor = { x: floor.x, y: Math.max(...pts), n: floor.n };
  }
  if (!sh || !hip || !floor) return null;
  const torso = Math.hypot(sh.x - hip.x, sh.y - hip.y);
  if (torso < 20) return null;
  const H = p => (p ? (floor.y - p.y) / torso : null);
  const vw = cfg.vw || [0.4, 0.35, 0.25];
  const parts = [[H(head), vw[0]], [H(sh), vw[1]], [H(hip), vw[2]]].filter(x => x[0] != null && x[1] > 0);
  const vh = parts.reduce((a, x) => a + x[0] * x[1], 0) / parts.reduce((a, x) => a + x[1], 0);
  return out(vh, { head: H(head), sh: H(sh), hip: H(hip), floorY: floor.y, headY: head ? head.y : null, torso });
}

// Mide una pose: landmarks normalizados (x,y en 0..1) y el tamaño de la imagen (para ángulos reales).
// Fusiona los dos lados del cuerpo (ponderados por visibilidad). Devuelve { ang, align, depth, vis, vert }.
export function measurePose(lms, side, w, h, mirror = false, cfg = PUSHUP_CFG) {
  const leanOf = (sh, hip) => (Math.atan2(Math.abs(sh.x - hip.x), hip.y - sh.y) * 180) / Math.PI; // 0 = erguido
  const one = sd => {
    const ix = SIDES[sd];
    const P = k => { const p = lms[ix[k]]; return { x: (mirror ? 1 - p.x : p.x) * w, y: p.y * h }; };
    const vis = sideVisibility(lms, sd, cfg.keys);
    if (cfg.kind === 'pushup-front') return { ang: null, align: null, depth: null, vis };
    if (cfg.kind === 'squat' || cfg.kind === 'bulgarian') {
      const sh = P('sh'), hip = P('hip'), kn = P('kn'), an = P('an');
      return { ang: angle(hip, kn, an), align: leanOf(sh, hip), depth: null, vis, anY: an.y };
    }
    if (cfg.kind === 'crunch') {
      // inclinación del tronco sobre el suelo (0° acostado, 90° sentado), sin depender de cuánto se flexionen las rodillas.
      // La señal es 180° − inclinación: acostado = 180 (valor alto, posición de partida), sentado = 90
      const sh = P('sh'), hip = P('hip');
      const elev = (Math.atan2(hip.y - sh.y, Math.abs(sh.x - hip.x)) * 180) / Math.PI;
      return { ang: 180 - Math.max(0, elev), align: null, depth: null, vis };
    }
    if (cfg.kind === 'raise') {                        // elevación del brazo = ángulo cadera-hombro-muñeca (0° abajo, 90° al lado)
      const el = angle(P('hip'), P('sh'), P('wr'));
      return { ang: el == null ? null : 180 - el, align: angle(P('sh'), P('el'), P('wr')), depth: null, vis };
    }
    const sh = P('sh'), el = P('el'), wr = P('wr'), hip = P('hip'), an = P('an');
    const fore = Math.hypot(wr.x - el.x, wr.y - el.y);
    return { ang: angle(sh, el, wr), align: angle(sh, hip, an), depth: fore > 1 ? (wr.y - sh.y) / fore : null, vis };
  };
  if (cfg.kind === 'pushup-front') {
    // de frente no hay «lado»: la visibilidad es la de hombros y muñecas de los dos lados
    const vis = [11, 12, 15, 16].reduce((a, i) => a + visOf(lms, i), 0) / 4;
    return { ang: null, align: null, depth: null, vis, visOther: vis, vert: verticalPose(lms, w, h, mirror, cfg) };
  }
  let main = one(side), other = one(side === 'left' ? 'right' : 'left');
  if (cfg.kind === 'bulgarian') {
    // la pierna de adelante es la del tobillo más bajo en la imagen (la de atrás está apoyada en un banco)
    const lo = main.anY >= other.anY ? main : other;
    return { ang: lo.ang, align: lo.align, depth: null, vis: Math.max(main.vis, other.vis), visOther: Math.min(main.vis, other.vis), vert: verticalPose(lms, w, h, mirror, cfg) };
  }
  let ang = main.ang, align = main.align;
  // el otro lado ayuda si también se ve: media ponderada por visibilidad
  if (other.vis >= cfg.minVis && other.ang != null && main.ang != null) {
    const a = main.vis, b = other.vis;
    ang = (main.ang * a + other.ang * b) / (a + b);
    if (other.align != null && main.align != null) align = (main.align * a + other.align * b) / (a + b);
  }
  return { ang, align, depth: main.depth, vis: main.vis, visOther: other.vis, vert: verticalPose(lms, w, h, mirror, cfg) };
}

export function labelFor(nota, cfg = PUSHUP_CFG) {
  return nota >= cfg.excelente ? 'Excelente' : nota >= cfg.buena ? 'Buena' : nota >= cfg.regular ? 'Regular' : 'Incompleta';
}

// Califica una repetición: m = { angMin, angMax, alignMin, dur }. Devuelve criterios 0..100, nota 0..100, etiqueta y consejo.
export function scoreRep(m, cfg = PUSHUP_CFG) {
  // sin ángulo fiable (flexiones de frente) la profundidad sale del recorrido vertical; un criterio con peso 0 no resta
  const prof = cfg.profC && m.caida != null ? lin(m.caida, cfg.profC.zero, cfg.profC.full) : lin(m.angMin, cfg.prof.zero, cfg.prof.full);
  const ext = cfg.ext.w ? lin(m.angMax, cfg.ext.zero, cfg.ext.full) : 100;
  const alin = cfg.alin.w ? lin(m.alignMin, cfg.alin.zero, cfg.alin.full) : 100;
  const c = cfg.ctrl, T = cfg.tips || PUSHUP_CFG.tips;
  const ctrl = m.dur <= c.tooFast ? 0
    : m.dur < c.okMin ? lin(m.dur, c.tooFast, c.okMin)
    : m.dur <= c.okMax ? 100
    : m.dur < c.tooSlow ? lin(m.dur, c.tooSlow, c.okMax) : 0;
  const nota = Math.round((prof * cfg.prof.w + ext * cfg.ext.w + alin * cfg.alin.w + ctrl * cfg.ctrl.w) / 100);
  const label = labelFor(nota, cfg);
  // consejo según el criterio que más puntos hace perder
  const loss = [
    ['prof', cfg.prof.w * (100 - prof), T.prof],
    ['ext', cfg.ext.w * (100 - ext), T.ext],
    ['alin', cfg.alin.w * (100 - alin), T.alin],
    ['ctrl', cfg.ctrl.w * (100 - ctrl), m.dur < c.okMin ? T.fast : T.slow]
  ].sort((a, b) => b[1] - a[1])[0];
  const tip = loss[1] <= 300 ? T.ok : loss[2]; // 300 = unos 3 puntos de nota perdidos
  return { nota, prof: Math.round(prof), ext: Math.round(ext), alin: Math.round(alin), ctrl: Math.round(ctrl), label, tip, completa: nota >= cfg.regular };
}

export function summarize(reps) {
  const total = reps.length, completas = reps.filter(r => r.completa).length;
  const notaMedia = total ? Math.round(reps.reduce((a, r) => a + r.nota, 0) / total) : 0;
  const sorted = [...reps].sort((a, b) => b.nota - a.nota);
  return { total, completas, incompletas: total - completas, notaMedia, mejor: sorted[0] || null, peor: sorted[sorted.length - 1] || null };
}

// ---------- Máquina de estados ----------
// ARRIBA (señal > upEff) -> BAJANDO (< downEff) -> SUBIENDO (sube riseDelta desde el mínimo) -> ARRIBA (> upEff) => +1 rep
// El umbral de arriba se adapta al tope real de la persona (topRef): quien no estira del todo igual cuenta.
// Al cerrar se espera un instante al pico (para medir la extensión real) y entonces se califica.
export function createMachine() {
  return { phase: 'ARRIBA', armed: false, rep: null, settle: false, tUp: 0, maxSinceMin: 0, noPlank: false, count: 0, discarded: 0, topRef: null, upEff: null, downEff: null };
}
function thresholds(st, cfg) {
  const up = st.topRef == null ? cfg.upDoneMin : clamp(st.topRef - 8, cfg.upDoneMin, cfg.upDone);
  st.upEff = up; st.downEff = up - cfg.downGap;
}

function finishRep(st, cfg) {
  const r = st.rep; st.rep = null; st.settle = false; st.phase = 'ARRIBA'; st.armed = true;
  const dur = st.tUp - r.t0;
  if (dur < cfg.minRepSec) { st.discarded++; return { type: 'discard', reason: 'rapida', dur }; }
  st.count++;
  st.topRef = st.topRef == null ? r.mMax : 0.6 * st.topRef + 0.4 * r.mMax;
  const caida = r.vMax > r.vMin ? Math.round((r.vMax - r.vMin) * 100) : null; // recorrido vertical, % de la regla (torso o ancho de manos)
  const sc = scoreRep({ angMin: r.angMin, angMax: r.angMax, alignMin: r.alignMin, dur, caida }, cfg);
  return { type: 'rep', rep: { n: st.count, ...sc, dur: Math.round(dur * 100) / 100, angMin: cfg.noAngle ? null : Math.round(r.angMin), caida, t: Math.round(r.t0 * 100) / 100 } };
}
function dropRep(st, reason) {
  st.rep = null; st.settle = false; st.phase = 'ARRIBA'; st.armed = false; st.discarded++;
  return { type: 'discard', reason };
}

// s = { t (s), elbow (ángulo para calificar), main (señal para contar; si falta se usa elbow), align, v (altura), visible }.
// Devuelve un evento ({type:'rep'|'discard'}) o null.
export function stepMachine(st, s, cfg = PUSHUP_CFG) {
  const { t, align } = s;
  const m = s.main != null ? s.main : s.elbow;
  const e = s.elbow != null ? s.elbow : m;
  if (!s.visible || m == null) {
    if (!st.rep) return null;
    return st.settle ? finishRep(st, cfg) : dropRep(st, 'perdido');
  }
  thresholds(st, cfg);
  let ev = null;
  if (align != null) st.noPlank = cfg.plankMin != null && align < cfg.plankMin;

  if (st.rep) {
    const r = st.rep;
    if (align != null) r.alignMin = cfg.alignWorst === 'max' ? Math.max(r.alignMin, align) : Math.min(r.alignMin, align);
    if (s.v != null) { if (s.v < r.vMin) r.vMin = s.v; if (s.v > r.vMax) r.vMax = s.v; }
    if (e < r.angMin) r.angMin = e;
    if (st.settle) {
      if (m > r.mMax) r.mMax = m;
      if (e > r.angMax) r.angMax = e;
      if (m < st.downEff || m < r.mMax - cfg.settleDrop || t - st.tUp >= cfg.settleSec) {
        ev = finishRep(st, cfg);   // st.rep = null: sigue por si ya empezó otra bajada
      }
    } else {
      if (t - r.t0 > cfg.maxRepSec) return dropRep(st, 'larga');
      if (st.phase === 'BAJANDO') {
        if (m < r.mMin) r.mMin = m;
        else if (m > r.mMin + cfg.riseDelta) { st.phase = 'SUBIENDO'; st.maxSinceMin = m; }
      } else if (st.phase === 'SUBIENDO') {
        if (m > st.maxSinceMin) st.maxSinceMin = m;
        if (m < st.maxSinceMin - cfg.riseDelta) { st.phase = 'BAJANDO'; if (m < r.mMin) r.mMin = m; } // rebote
      }
      if (st.phase === 'SUBIENDO' && m >= st.upEff) { st.settle = true; st.tUp = t; r.mMax = m; r.angMax = e; }
    }
  }
  if (!st.rep) {
    if (m >= st.upEff) st.armed = true;
    if (st.armed && m < st.downEff && !st.noPlank) {
      st.rep = { t0: t, mMin: m, mMax: -Infinity, angMin: e, angMax: -Infinity, alignMin: align ?? (cfg.alignWorst === 'max' ? 0 : 180), vMin: s.v ?? Infinity, vMax: s.v ?? -Infinity };
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

// Canal vertical -> ángulo equivalente. buf = [{t, v}] con las alturas recientes; devuelve null si aún no hay recorrido fiable.
export function verticalAngle(buf, v, cfg = PUSHUP_CFG) {
  if (v == null || buf.length < 6) return null;
  let lo = Infinity, hi = -Infinity;
  for (const p of buf) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
  const range = hi - lo;
  // sin recorrido todavía = la persona está quieta en la posición de partida («arriba»): así la primera repetición también cuenta
  if (range < cfg.vMinRange) return cfg.vTop;
  return cfg.vBottom + (cfg.vTop - cfg.vBottom) * clamp((v - lo) / range, 0, 1);
}
// Fusiona el ángulo (si se ve) y el canal vertical (si ya hay recorrido). Devuelve la señal principal o null.
export function fuseMain(ang, vAng, cfg = PUSHUP_CFG) {
  if (ang != null && vAng != null) return (1 - cfg.vWeight) * ang + cfg.vWeight * vAng;
  return ang != null ? ang : vAng;
}

// ---------- Carga de MediaPipe (solo la primera vez que se usa) ----------
const MP_VER = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
// Modelo «full»: más preciso que «lite» (unos 9 MB, se guarda en caché para usarlo sin conexión)
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
let mpPromise = null;

async function createLandmarker(mod, fileset, delegate) {
  return mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4
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
// Las 35 conexiones del esqueleto de MediaPipe: cara, brazos, manos, tronco, piernas y pies
const BONES = [[0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]];
const GROUP = i => (i <= 10 ? '#ff4fd8' : i <= 12 ? '#ffd54f' : i <= 16 ? '#4fc3f7' : i <= 22 ? '#9575cd' : i <= 24 ? '#ffb74d' : i <= 28 ? '#81c784' : '#a1887f');
const FACE_NAMES = { 0: 'nariz', 2: 'ojo', 5: 'ojo', 7: 'oreja', 8: 'oreja', 9: 'boca' };
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Sesión en vivo ----------
// startSession({ exercise: 'flexiones'|'sentadillas', video, canvas, onRep, onState, devTracking, mirror })
// Dibuja la cámara (o el video) en el canvas con el HUD. begin() empieza a contar y a grabar.
// stop() devuelve Promise<{ reps, blob, mime, duracion, total, completas, notaMedia }>.
export async function startSession(opts) {
  const { video, canvas, onRep = () => {}, onState = () => {}, mirror = false } = opts;
  let dev = typeof opts.devTracking === 'function' ? opts.devTracking : () => !!opts.devTracking;
  const cfg = getCfg(opts.exercise, opts.view);
  const det = await loadDetector();
  const isBall = cfg.kind === 'ball';
  const ballDet = isBall ? await loadBallDetector(det) : null;
  const ctx = canvas.getContext('2d');
  const useVideoClock = !video.srcObject;           // con un archivo, el tiempo es el del video
  const nowSec = () => (useVideoClock ? video.currentTime : performance.now() / 1000);

  let running = true, counting = false, paused = false;
  let machine = createMachine();
  let reps = [], side = null, lastLms = null, lastMeas = null, sm = { ang: null, main: null, align: null, v: null };
  let vbuf = [], vAng = null, trace = [];
  let pausedAt = 0, pausedTotal = 0, tStartClock = 0;
  let lastRep = null, lastRepAt = 0, hud = { serie: '' };
  let fps = 0, lastDetAt = 0, frameN = 0, detEvery = 1, lowCount = 0, tsLast = 0, badFrames = 0;
  let recorder = null, chunks = [], mime = '', stopPromise = null, wakeLock = null;
  let ballSt = createBallState(), ballLast = null, ballView = null, ballN = 0, tsLastB = 0;

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

  function resetSignals() { sm = { ang: null, main: null, align: null, v: null }; vAng = null; }

  // Balón entre los pies: pose para los pies + detector de objetos para el balón (cada 2 detecciones)
  function detectBall(lms, t1) {
    const W = canvas.width, H = canvas.height, tn = nowSec();
    if (++ballN % 2 === 1) {
      try {
        const r = ballDet.detectForVideo(video, Math.max(performance.now(), tsLastB + 1)); tsLastB = performance.now();
        const d = (r.detections || []).filter(x => x.categories && x.categories[0]).sort((a, b) => b.categories[0].score - a.categories[0].score)[0];
        if (d) {
          const bb = d.boundingBox, kx = W / video.videoWidth, ky = H / video.videoHeight; let x = (bb.originX + bb.width / 2) * kx; if (mirror) x = W - x;
          ballLast = { x, y: (bb.originY + bb.height / 2) * ky, r: Math.max(bb.width * kx, bb.height * ky) / 2, t: tn, score: d.categories[0].score };
        }
      } catch (e) { /* un frame sin detección */ }
    }
    const ball = ballLast && Math.abs(tn - ballLast.t) <= cfg.ballHoldSec ? ballLast : null;
    const P = i => (lms && lms[i] && visOf(lms, i) >= 0.3 ? { x: (mirror ? 1 - lms[i].x : lms[i].x) * W, y: lms[i].y * H } : null);
    const foot = ids => { const ps = ids.map(P).filter(Boolean); return ps.length ? { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length } : null; };
    const FL = foot([27, 29, 31]), FR = foot([28, 30, 32]);
    const dd = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null);
    const legs = [dd(P(23), P(27)), dd(P(24), P(28))].filter(v => v != null);
    const torso = dd(avgPts(lms || [], [11, 12], W, H, mirror), avgPts(lms || [], [23, 24], W, H, mirror));
    const unit = Math.max(40, legs.length ? legs.reduce((a, b) => a + b, 0) / legs.length : torso ? torso * 1.6 : H * 0.35);
    const feetOk = !!(FL && FR && Math.max(visOf(lms || [], 27), visOf(lms || [], 28)) >= cfg.minVis);
    lastMeas = lms ? { vis: feetOk ? 1 : 0.2, visOther: 0, vert: null, depth: null } : null;
    let ev = null;
    if (counting && !paused) ev = stepBall(ballSt, { t: tn, ball, L: FL, R: FR, unit }, cfg);
    ballView = { ball, FL, FR, unit, owner: ballSt.owner };
    if (ev && ev.type === 'rep') {
      const rep = { ...ev.rep, t: Math.round(elapsed() * 100) / 100 };
      reps.push(rep); lastRep = rep; lastRepAt = performance.now(); onRep(rep, summarize(reps));
    }
    if (fps && fps < cfg.lowFps) { if (++lowCount > 45) detEvery = 2; } else lowCount = 0;
    const hint = feetOk ? 'pon el balón entre tus pies, a la vista de la cámara.' : '';
    onState({ phase: ballSt.owner || '-', visible: feetOk && !!ball, feet: feetOk, ball: !!ball, hint, fps, delegate: det.delegate, count: ballSt.count, counting, paused, vis: feetOk ? 1 : 0, side: null });
  }

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
    if (isBall) { detectBall(lms || null, t1); return; }
    let visible = false, ev = null;
    if (lms) {
      side = pickSide(lms, side, cfg);
      const m = measurePose(lms, side, canvas.width, canvas.height, mirror, cfg);
      lastMeas = m;
      const angOk = m.vis >= cfg.minVis && m.ang != null;
      // canal vertical: altura del cuerpo normalizada con el recorrido de los últimos segundos
      // (vInvert: en abdominales y elevaciones laterales la posición de partida es la «baja», se invierte para que «arriba» sea el valor alto)
      const vh0 = m.vert ? m.vert.vh : null, vh = vh0 == null ? null : (cfg.vInvert ? -vh0 : vh0), tn = t1 / 1000;
      if (vh != null) { vbuf.push({ t: tn, v: vh }); while (vbuf.length && tn - vbuf[0].t > cfg.vWindow) vbuf.shift(); }
      vAng = verticalAngle(vbuf, vh, cfg);
      const main = fuseMain(angOk ? m.ang : null, vAng, cfg);
      // sin ángulo (flexiones de frente) basta con ver hombros y muñecas con cierta claridad
      visible = main != null && (angOk || m.vis >= (cfg.noAngle ? cfg.minVis : 0.25));
      if (visible) {
        sm.ang = angOk ? ema(sm.ang, m.ang, cfg.smoothAlpha) : null;
        sm.main = ema(sm.main, main, cfg.smoothAlpha);
        sm.align = m.align != null ? ema(sm.align, m.align, cfg.smoothAlpha) : sm.align;
        sm.v = vh != null ? ema(sm.v, vh, cfg.smoothAlpha) : sm.v;
      } else resetSignals();
    } else { lastMeas = null; resetSignals(); }
    if (counting && !paused) ev = stepMachine(machine, { t: nowSec(), elbow: sm.ang, main: sm.main, align: sm.align, v: sm.v, visible }, cfg);
    if (visible || counting) { trace.push({ t: t1 / 1000, main: sm.main, v: vAng }); while (trace.length && t1 / 1000 - trace[0].t > 6) trace.shift(); }
    if (ev && ev.type === 'rep') {
      const rep = { ...ev.rep, t: Math.round(elapsed() * 100) / 100 };
      reps.push(rep); lastRep = rep; lastRepAt = performance.now(); onRep(rep, summarize(reps));
    }
    // si el rendimiento es bajo, se detecta cada 2 frames (la grabación sigue a todo el ritmo)
    if (fps && fps < cfg.lowFps) { if (++lowCount > 45) detEvery = 2; } else lowCount = 0;
    onState({ phase: machine.phase, ang: sm.ang, main: sm.main, align: sm.align, side, vis: lastMeas ? lastMeas.vis : 0, visible, noPlank: machine.noPlank, fps, delegate: det.delegate, count: machine.count, counting, paused, depth: lastMeas ? lastMeas.depth : null });
  }

  function drawHud(W, H) {
    const u = Math.min(W / 1280, H / 720); // escala: igual en horizontal y en vertical (celular de pie)
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // contador
    const inc = reps.filter(r => !r.completa).length;
    rr(ctx, 16 * u, 16 * u, 210 * u, 120 * u, 14 * u); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${84 * u}px system-ui,Arial,sans-serif`; ctx.textAlign = 'left';
    ctx.fillText(String(reps.length), 32 * u, 100 * u);
    ctx.font = `600 ${17 * u}px system-ui,Arial,sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(inc ? `${cfg.units} · ${inc} incompl.` : cfg.units, 32 * u, 124 * u);
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
    else if (counting && cfg.warnPosture && machine.noPlank && machine.phase === 'ARRIBA') warn = cfg.warnPosture;
    if (warn) {
      ctx.textAlign = 'center'; ctx.font = `700 ${30 * u}px system-ui,Arial,sans-serif`;
      const w = ctx.measureText(warn).width + 36 * u; rr(ctx, W / 2 - w / 2, 16 * u, w, 52 * u, 12 * u);
      ctx.fillStyle = 'rgba(200,110,20,.9)'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(warn, W / 2, 52 * u);
    }
    ctx.restore();
  }

  // Balón: círculo sobre el balón, pies marcados y línea al pie que lo «tiene» (se ve también en el video grabado)
  function drawBall(W, H) {
    if (!ballView) return;
    const u = Math.min(W / 1280, H / 720), { ball, FL, FR, owner } = ballView;
    ctx.save(); ctx.lineCap = 'round';
    [['L', FL, 'I'], ['R', FR, 'D']].forEach(([k, p, txt]) => {
      if (!p) return; const on = owner === k;
      ctx.fillStyle = on ? '#2ecc71' : 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(p.x, p.y, (on ? 16 : 11) * u, 0, 7); ctx.fill();
      ctx.fillStyle = '#10241a'; ctx.font = `700 ${(on ? 18 : 14) * u}px system-ui,Arial,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(txt, p.x, p.y + 6 * u);
    });
    if (ball) {
      const own = owner === 'L' ? FL : owner === 'R' ? FR : null;
      if (own) { ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3 * u; ctx.setLineDash([8 * u, 6 * u]); ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(own.x, own.y); ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(ball.x, ball.y, Math.max(ball.r, 14 * u), 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  // Modo desarrollador: los 33 puntos del cuerpo (cara, manos y pies incluidos), las líneas de altura y las señales
  function drawDev(W, H) {
    if (!lastLms) return;
    if (isBall) {
      const u = Math.min(W / 1280, H / 720);
      ctx.save(); ctx.lineCap = 'round';
      BONES.forEach(([a, b]) => { const A = lastLms[a], B = lastLms[b]; if (!A || !B) return; const f = p => ({ x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H }), pa = f(A), pb = f(B); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); });
      const f2 = x => (x == null || !isFinite(x) ? '–' : x.toFixed(2));
      const lines = [`Dueño: ${ballSt.owner === 'L' ? 'pie izquierdo' : ballSt.owner === 'R' ? 'pie derecho' : '–'} · cambios ${ballSt.count}`,
        `Distancia al pie (largos de pierna): izq. ${f2(ballSt.dL)} · der. ${f2(ballSt.dR)} (alcance ${cfg.reach})`,
        `Balón: ${ballView && ballView.ball ? 'visto ' + Math.round(ballLast.score * 100) + ' %' : 'no se ve'} · largo de pierna ${ballView ? Math.round(ballView.unit) : '–'} px`,
        `${fps ? fps.toFixed(0) : '–'} FPS · ${det.delegate}${detEvery > 1 ? ' · cada 2 frames' : ''}`];
      ctx.font = `600 ${15 * u}px ui-monospace,Consolas,monospace`; ctx.textAlign = 'left';
      const bh2 = (lines.length * 21 + 12) * u, y0 = H - bh2 - 12 * u;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, 12 * u, y0, 560 * u, bh2, 8 * u); ctx.fill();
      ctx.fillStyle = '#9cff9c'; lines.forEach((s, i) => ctx.fillText(s, 22 * u, y0 + (22 + i * 21) * u));
      ctx.restore(); return;
    }
    const u = Math.min(W / 1280, H / 720), ix = SIDES[side] || SIDES.left, act = new Set(Object.values(ix));
    const px = p => ({ x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H });
    const label = (p, s, col, dx = 12, dy = -10) => { ctx.font = `700 ${20 * u}px system-ui,Arial,sans-serif`; ctx.textAlign = 'left'; ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(s, p.x + dx * u, p.y + dy * u); ctx.fillStyle = col; ctx.fillText(s, p.x + dx * u, p.y + dy * u); };
    ctx.save();
    ctx.lineCap = 'round';
    // líneas de altura: suelo y cabeza (lo que sube y baja)
    const v = lastMeas && lastMeas.vert;
    if (v) {
      ctx.setLineDash([10 * u, 8 * u]); ctx.lineWidth = 2 * u;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(0, v.floorY); ctx.lineTo(W, v.floorY); ctx.stroke();
      if (v.headY != null) { ctx.strokeStyle = '#ff4fd8'; ctx.beginPath(); ctx.moveTo(0, v.headY); ctx.lineTo(W, v.headY); ctx.stroke(); }
      ctx.strokeStyle = '#ffd54f'; ctx.beginPath(); ctx.moveTo(0, v.shY); ctx.lineTo(W, v.shY); ctx.stroke();
      ctx.setLineDash([]);
      label({ x: 8 * u, y: v.floorY }, v.floorName, '#fff', 0, -6);
      if (v.headY != null && v.head != null) label({ x: 8 * u, y: v.headY }, `${v.headName} ${v.head.toFixed(2)}`, '#ff4fd8', 0, -6);
      if (v.sh != null) label({ x: 8 * u, y: v.shY }, `${v.shName} ${v.sh.toFixed(2)}`, '#ffd54f', 0, -6);
    }
    BONES.forEach(([a, b]) => {
      const A = lastLms[a], B = lastLms[b]; if (!A || !B) return;
      const on = act.has(a) && act.has(b), pa = px(A), pb = px(B);
      ctx.strokeStyle = on ? '#00e5ff' : 'rgba(255,255,255,.4)'; ctx.lineWidth = (on ? 5 : 2) * u;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
    lastLms.forEach((p, i) => {
      const q = px(p), on = act.has(i), low = p.visibility < cfg.minVis;
      ctx.globalAlpha = low ? 0.45 : 1; ctx.fillStyle = low ? '#ff5252' : GROUP(i);
      ctx.beginPath(); ctx.arc(q.x, q.y, (on ? 7 : i <= 10 ? 4.5 : 3.5) * u, 0, 7); ctx.fill();
      if (FACE_NAMES[i] && !low) { ctx.globalAlpha = 1; label(q, FACE_NAMES[i], '#ff9bec', 8, -6); }
    });
    ctx.globalAlpha = 1;
    // arco y número del ángulo de la articulación principal (codo o rodilla) y del cuerpo
    const jn = cfg.kind === 'squat' || cfg.kind === 'bulgarian' ? ['hip', 'kn', 'an'] : cfg.kind === 'crunch' ? ['sh', 'hip', 'kn'] : cfg.kind === 'raise' ? ['hip', 'sh', 'wr'] : ['sh', 'el', 'wr'];
    if (sm.ang != null) {
      const A = px(lastLms[ix[jn[0]]]), B = px(lastLms[ix[jn[1]]]), C = px(lastLms[ix[jn[2]]]);
      const a1 = Math.atan2(A.y - B.y, A.x - B.x), a2 = Math.atan2(C.y - B.y, C.x - B.x);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(B.x, B.y, 36 * u, a1, a1 + d, d < 0); ctx.stroke();
      label(B, cfg.angLabel ? cfg.angLabel(sm.ang) : `${Math.round(sm.ang)}°`, '#ffb74d');
    }
    if (sm.align != null) label(px(lastLms[ix[cfg.kind === 'raise' ? 'el' : 'hip']]), `${Math.round(sm.align)}°${/squat|bulgarian/.test(cfg.kind) ? ' torso' : cfg.kind === 'raise' ? ' codo' : ''}`, '#80d8ff');
    // barra vertical de la señal principal con las marcas de los umbrales reales (adaptados a la persona)
    const bx = W - 46 * u, by = 100 * u, bh = H - 400 * u, lo = 50, hi = 180, yOf = a => by + bh - ((clamp(a, lo, hi) - lo) / (hi - lo)) * bh;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(ctx, bx, by, 18 * u, bh, 6 * u); ctx.fill();
    const marks = [[cfg.prof.full, '#2ecc71'], [cfg.prof.zero, '#f0a92e']];
    if (machine.upEff != null) marks.push([Math.round(machine.downEff), '#fff'], [Math.round(machine.upEff), '#fff']);
    marks.forEach(([a, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(bx - 8 * u, yOf(a)); ctx.lineTo(bx + 26 * u, yOf(a)); ctx.stroke();
      ctx.font = `600 ${13 * u}px system-ui,Arial,sans-serif`; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(`${a}°`, bx - 10 * u, yOf(a) + 4 * u);
    });
    if (sm.main != null) { ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.arc(bx + 9 * u, yOf(sm.main), 9 * u, 0, 7); ctx.fill(); }
    // gráfico de los últimos 6 s: señal principal (naranja) y canal vertical (rosa)
    const gx = W - 330 * u, gy = H - 150 * u, gw = 318 * u, gh = 126 * u, t1 = performance.now() / 1000;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, gx, gy, gw, gh, 8 * u); ctx.fill();
    const gY = a => gy + gh - 6 * u - ((clamp(a, lo, hi) - lo) / (hi - lo)) * (gh - 12 * u);
    if (machine.upEff != null) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1 * u; [machine.upEff, machine.downEff].forEach(a => { ctx.beginPath(); ctx.moveTo(gx, gY(a)); ctx.lineTo(gx + gw, gY(a)); ctx.stroke(); }); }
    [['main', '#ff9800'], ['v', '#ff4fd8']].forEach(([k, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2.5 * u; ctx.beginPath(); let started = false;
      trace.forEach(p => { if (p[k] == null) { started = false; return; } const x = gx + gw - ((t1 - p.t) / 6) * gw, y = gY(p[k]); if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; } });
      ctx.stroke();
    });
    // texto de estado
    const lines = [`Estado: ${machine.phase}${machine.settle ? ' (cierre)' : ''}${machine.noPlank ? ' · mala postura' : ''}`,
      `Lado: ${side === 'left' ? 'izq.' : 'der.'} · visib. ${lastMeas ? lastMeas.vis.toFixed(2) : '–'} / ${lastMeas ? lastMeas.visOther.toFixed(2) : '–'}`,
      `Umbrales: arriba ${machine.upEff != null ? Math.round(machine.upEff) : '–'}° · abajo ${machine.downEff != null ? Math.round(machine.downEff) : '–'}°`,
      `Vertical: ${v ? v.vh.toFixed(2) : '–'} × ${cfg.kind === 'pushup-front' ? 'ancho de manos' : 'torso'} · cara ${v ? v.faceN : 0}/11 pts`,
      `Señal: ${sm.main != null ? sm.main.toFixed(0) : '–'}° (áng. ${sm.ang != null ? sm.ang.toFixed(0) : '–'}° · vert. ${vAng != null ? vAng.toFixed(0) : '–'}°)`,
      `${fps ? fps.toFixed(0) : '–'} FPS · ${det.delegate}${detEvery > 1 ? ' · cada 2 frames' : ''}`];
    ctx.font = `600 ${15 * u}px ui-monospace,Consolas,monospace`; ctx.textAlign = 'left';
    const bw = 420 * u, bh2 = (lines.length * 21 + 12) * u, y0 = H - bh2 - 12 * u;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, 12 * u, y0, bw, bh2, 8 * u); ctx.fill();
    ctx.fillStyle = '#9cff9c'; lines.forEach((s, i) => ctx.fillText(s, 22 * u, y0 + (22 + i * 21) * u));
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
      if (isBall) drawBall(W, H);
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
      machine = createMachine(); reps = []; lastRep = null; resetSignals(); vbuf = []; trace = []; ballSt = createBallState();
      tStartClock = performance.now() / 1000; pausedTotal = 0; paused = false; counting = true;
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
        if (counting && !isBall) { const ev = flushMachine(machine, nowSec(), cfg); if (ev && ev.type === 'rep') { const rep = { ...ev.rep, t: Math.round(dur * 100) / 100 }; reps.push(rep); onRep(rep, summarize(reps)); } }
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
export const startPushupSession = opts => startSession({ ...opts, exercise: 'flexiones', view: opts.view || 'lateral' });
