// ===== Libreta del Míster - Cuenta de Google + sincronización con Google Drive =====
// Mismo patrón que ApiTrack y ZenBan. Los datos se guardan en la carpeta oculta de la app
// en tu Drive (appDataFolder): libreta-data.json -> jugadores, sesiones y jugadas.

const SYNC = {
  token: null,
  tokenExp: 0,
  tokenClient: null,
  fileId: null,
  busy: false,
  again: false,
  gen: 0,
  timer: null,
  status: 'off'
};

const SYNC_KEYS = {
  ENABLED: 'libreta_sync_enabled',
  USER: 'libreta_sync_user',
  DIRTY: 'libreta_sync_dirty',
  LAST: 'libreta_sync_last',
  DELETED: 'libreta_deleted',
  STATE: 'libreta_oauth_state'
};
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const DATA_FILE_NAME = 'libreta-data.json';

function googleClientId() {
  return ((window.LIBRETA_CONFIG && window.LIBRETA_CONFIG.googleClientId) || '').trim();
}
function syncEnabled() { return localStorage.getItem(SYNC_KEYS.ENABLED) === '1'; }
function savedUser() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEYS.USER) || 'null'); } catch (e) { return null; }
}
function isDirty() { return localStorage.getItem(SYNC_KEYS.DIRTY) === '1'; }
function setDirty(v) { localStorage.setItem(SYNC_KEYS.DIRTY, v ? '1' : '0'); }
function lastSyncedAt() { return Number(localStorage.getItem(SYNC_KEYS.LAST) || 0); }

function deletions() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEYS.DELETED) || '{}'); } catch (e) { return {}; }
}
function saveDeletions(map) {
  // Se guardan como máximo las 2000 eliminaciones más recientes
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 2000);
  localStorage.setItem(SYNC_KEYS.DELETED, JSON.stringify(Object.fromEntries(entries)));
}
function recordDeletion(store, id) {
  const map = deletions();
  map[`${store}:${id}`] = Date.now();
  saveDeletions(map);
}

// Lo llama app.js cada vez que se agrega, edita o elimina un registro
function onLocalDataChanged() {
  SYNC.gen++;
  setDirty(true);
  if (!syncEnabled()) return;
  if (SYNC.token) scheduleSync(2500);
  else setSyncStatus('pending');
}

function scheduleSync(delay = 2500) {
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(syncNow, delay);
}

// ----- Interfaz -----
const SYNC_STATUS_TEXT = {
  off: 'Sin sincronizar',
  syncing: 'Sincronizando…',
  ok: 'Todo sincronizado con Drive',
  pending: 'Hay cambios sin subir. Toca tu foto para reconectar.',
  expired: 'La sesión de Google expiró. Toca tu foto para reconectar.',
  offline: 'Sin conexión. Se sincronizará al volver.',
  error: 'No se pudo sincronizar. Se reintentará.'
};

function el(id) { return document.getElementById(id); }

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setSyncStatus(status) {
  SYNC.status = status;
  const dot = el('syncDot');
  if (!dot) return;
  dot.dataset.status = status;
  let text = SYNC_STATUS_TEXT[status] || '';
  if (status === 'ok' && lastSyncedAt()) {
    text += ` · ${new Date(lastSyncedAt()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  el('syncStatusText').textContent = text;
  el('accountChip').title = SYNC_STATUS_TEXT[status] || 'Cuenta';
}

function renderAccount() {
  const user = savedUser();
  const enabled = syncEnabled() && user;
  el('googleSignInBtn').hidden = !!enabled;
  el('accountChip').hidden = !enabled;
  if (!enabled) {
    el('accountMenu').hidden = true;
    return;
  }
  el('accountName').textContent = user.name || 'Cuenta de Google';
  el('accountEmail').textContent = user.email || '';
  el('accountAvatar').innerHTML = user.picture
    ? `<img src="${escapeAttr(user.picture)}" alt="" referrerpolicy="no-referrer">`
    : escapeAttr((user.name || user.email || '?').charAt(0).toUpperCase());
  if (!SYNC.token) setSyncStatus(isDirty() ? 'pending' : 'expired');
}

// ----- Inicio de sesión (Google Identity Services) -----
function initTokenClient() {
  if (SYNC.tokenClient) return true;
  if (!(window.google && google.accounts && google.accounts.oauth2)) return false;
  SYNC.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: googleClientId(),
    scope: DRIVE_SCOPES,
    callback: onTokenResponse,
    error_callback: (err) => {
      console.warn('Google sign-in', err);
      if (err && err.type === 'popup_closed') return;
      showToast('No se pudo abrir el inicio de sesión de Google. Revisa que no estén bloqueadas las ventanas emergentes.', 'error');
    }
  });
  return true;
}

// En la app instalada (pantalla completa) la ventana emergente de Google no siempre
// devuelve la sesión, así que ahí se usa el inicio de sesión por redirección
function isInstalledApp() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function signInWithRedirect() {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem(SYNC_KEYS.STATE, state);
  const user = savedUser();
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: location.origin + location.pathname.replace(/index\.html$/, ''),
    response_type: 'token',
    scope: DRIVE_SCOPES,
    include_granted_scopes: 'true',
    state
  });
  if (user && user.email) params.set('login_hint', user.email);
  else params.set('prompt', 'select_account');
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// Al volver de Google por redirección, el token llega en la dirección (#access_token=...)
function consumeRedirectToken() {
  if (!location.hash || location.hash.indexOf('access_token=') === -1 && location.hash.indexOf('error=') === -1) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = localStorage.getItem(SYNC_KEYS.STATE);
  localStorage.removeItem(SYNC_KEYS.STATE);
  if (!expected || h.get('state') !== expected) return null;
  if (h.get('error')) return { error: h.get('error') };
  return { access_token: h.get('access_token'), expires_in: h.get('expires_in') };
}

function signInWithGoogle() {
  if (!googleClientId()) {
    showToast('Falta configurar el ID de cliente de Google (config.js)', 'error');
    return;
  }
  if (isInstalledApp()) {
    signInWithRedirect();
    return;
  }
  if (!initTokenClient()) {
    showToast('Cargando Google… inténtalo de nuevo en un momento', 'info');
    return;
  }
  const user = savedUser();
  SYNC.tokenClient.requestAccessToken({ prompt: user ? '' : 'select_account', login_hint: user ? user.email : undefined });
}

async function onTokenResponse(resp) {
  if (!resp || resp.error) {
    showToast('No se completó el inicio de sesión con Google', 'error');
    return;
  }
  SYNC.token = resp.access_token;
  SYNC.tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
  try {
    const info = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${SYNC.token}` }
    })).json();
    const previous = savedUser();
    if (previous && previous.email !== info.email) localStorage.setItem(SYNC_KEYS.LAST, '0');
    localStorage.setItem(SYNC_KEYS.USER, JSON.stringify({ email: info.email, name: info.name, picture: info.picture }));
  } catch (e) {
    console.warn('userinfo', e);
    // Aunque falle la foto y el nombre, la sesión sí quedó iniciada
    if (!savedUser()) localStorage.setItem(SYNC_KEYS.USER, JSON.stringify({ email: '', name: 'Cuenta de Google' }));
  }
  localStorage.setItem(SYNC_KEYS.ENABLED, '1');
  renderAccount();
  showToast('Sesión iniciada. Sincronizando con Google Drive…', 'info');
  await syncNow();
}

function signOutGoogle() {
  if (SYNC.token && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(SYNC.token, () => {}); } catch (e) {}
  }
  SYNC.token = null;
  SYNC.fileId = null;
  localStorage.setItem(SYNC_KEYS.ENABLED, '0');
  localStorage.removeItem(SYNC_KEYS.USER);
  localStorage.setItem(SYNC_KEYS.LAST, '0');
  setSyncStatus('off');
  renderAccount();
  showToast('Sesión cerrada. Tus datos siguen en este dispositivo.', 'info');
}

// ----- Google Drive -----
async function driveFetch(url, opts = {}) {
  if (!SYNC.token || Date.now() > SYNC.tokenExp) {
    SYNC.token = null;
    throw new Error('auth');
  }
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${SYNC.token}` } });
  if (r.status === 401) {
    SYNC.token = null;
    throw new Error('auth');
  }
  if (r.status === 403) {
    let reason = '';
    try { const j = await r.clone().json(); reason = ((j.error && j.error.errors && j.error.errors[0]) || {}).reason || ''; } catch (e) {}
    if (/scope|auth/i.test(reason)) { SYNC.token = null; throw new Error('auth'); }
    const err = new Error('forbidden'); err.status = 403; throw err;
  }
  if (!r.ok) { const err = new Error(`drive ${r.status}`); err.status = r.status; throw err; }
  return r;
}

async function findDataFile() {
  const q = encodeURIComponent(`name='${DATA_FILE_NAME}'`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id,modifiedTime,version)`);
  const j = await r.json();
  return (j.files && j.files[0]) || null;
}

async function driveUpload(name, blob, existingId = null) {
  if (existingId) {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, { method: 'PATCH', body: blob });
    return existingId;
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' }));
  form.append('file', blob);
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form });
  return (await r.json()).id;
}

// ----- Fusión elemento por elemento -----
async function readLocal() {
  const stores = {};
  for (const store of STORES) stores[store] = await dbGetAll(store);
  return { version: 1, stores, deleted: deletions() };
}

function mergePayloads(local, remote) {
  const deleted = { ...(remote.deleted || {}) };
  Object.entries(local.deleted || {}).forEach(([k, t]) => { if (!deleted[k] || deleted[k] < t) deleted[k] = t; });
  const stores = {};
  for (const store of STORES) {
    const byId = new Map();
    ((remote.stores || {})[store] || []).forEach(r => byId.set(r.id, r));
    ((local.stores || {})[store] || []).forEach(r => {
      const other = byId.get(r.id);
      if (!other || (r.updatedAt || 0) >= (other.updatedAt || 0)) byId.set(r.id, r);
    });
    stores[store] = [...byId.values()].filter(r => {
      const t = deleted[`${store}:${r.id}`];
      return !t || (r.updatedAt || 0) > t;
    }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return { version: 1, stores, deleted };
}

function sortedStores(p) {
  const out = {};
  for (const s of STORES) out[s] = [...((p.stores || {})[s] || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return out;
}
function sameStores(a, b) {
  return JSON.stringify(sortedStores(a)) === JSON.stringify(sortedStores(b));
}

// Reemplaza el contenido de IndexedDB por el resultado fusionado
async function applyPayload(payload) {
  for (const store of STORES) {
    const items = (payload.stores || {})[store] || [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      os.clear();
      items.forEach(item => os.put(item));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  saveDeletions(payload.deleted || {});
  await refreshFromDb();
}

function countRecords(payload) {
  return STORES.reduce((n, s) => n + ((payload.stores || {})[s] || []).length, 0);
}

// ----- Ciclo de sincronización -----
async function syncNow() {
  if (!syncEnabled() || !db) return;
  if (!SYNC.token || Date.now() > SYNC.tokenExp) {
    SYNC.token = null;
    setSyncStatus(isDirty() ? 'pending' : 'expired');
    return;
  }
  if (!navigator.onLine) { setSyncStatus('offline'); return; }
  if (SYNC.busy) { SYNC.again = true; return; }
  SYNC.busy = true;
  setSyncStatus('syncing');
  try {
    const gen = SYNC.gen;
    const file = await findDataFile();
    SYNC.fileId = file ? file.id : null;
    const remote = file ? await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)).json() : null;
    const local = await readLocal();

    let result = local;
    if (remote) {
      if (lastSyncedAt() === 0 && countRecords(local) > 0 && countRecords(remote) > 0) {
        // Primera vez en este dispositivo y ya hay datos en Drive: nunca se pisa nada sin preguntar
        const useDrive = confirm('Ya hay datos de Libreta del Míster en tu Google Drive.\n\nAceptar: usar esos datos en este dispositivo (lo que hay aquí se reemplaza).\nCancelar: combinar esos datos con lo que hay en este dispositivo (no se pierde nada).');
        result = useDrive ? remote : mergePayloads(local, remote);
      } else {
        result = mergePayloads(local, remote);
      }
    }

    // Si hubo cambios locales mientras se descargaba, se vuelve a empezar para no perderlos
    if (SYNC.gen !== gen) { SYNC.again = true; return; }

    if (!sameStores(result, local)) await applyPayload(result);
    else saveDeletions(result.deleted || {});

    if (!remote || !sameStores(result, remote) || JSON.stringify(result.deleted || {}) !== JSON.stringify(remote.deleted || {})) {
      // Si otro dispositivo guardó mientras tanto, se vuelve a combinar antes de subir
      if (file) {
        const now = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?fields=version`)).json();
        if (String(now.version) !== String(file.version)) { SYNC.again = true; return; }
      }
      const data = { ...result, savedAt: Date.now() };
      SYNC.fileId = await driveUpload(DATA_FILE_NAME, new Blob([JSON.stringify(data)], { type: 'application/json' }), SYNC.fileId);
    }
    localStorage.setItem(SYNC_KEYS.LAST, String(Date.now()));
    if (SYNC.gen === gen) setDirty(false);
    setSyncStatus(isDirty() ? 'syncing' : 'ok');
  } catch (err) {
    console.warn('Sincronización', err);
    if (err.message === 'auth') setSyncStatus(isDirty() ? 'pending' : 'expired');
    else setSyncStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    SYNC.busy = false;
    if (SYNC.again || (isDirty() && SYNC.token)) {
      SYNC.again = false;
      scheduleSync(2000);
    }
  }
}

// ----- Arranque -----
function startSync() {
  const redirected = consumeRedirectToken();
  el('googleSignInBtn').addEventListener('click', signInWithGoogle);
  el('accountChip').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!SYNC.token || Date.now() > SYNC.tokenExp) { signInWithGoogle(); return; }
    el('accountMenu').hidden = !el('accountMenu').hidden;
  });
  document.addEventListener('click', (e) => {
    if (!el('accountMenu').hidden && !e.target.closest('#accountArea')) el('accountMenu').hidden = true;
  });
  el('syncNowBtn').addEventListener('click', () => { el('accountMenu').hidden = true; syncNow(); });
  el('signOutBtn').addEventListener('click', () => { el('accountMenu').hidden = true; signOutGoogle(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && SYNC.token) syncNow();
  });
  window.addEventListener('online', () => { if (SYNC.token) syncNow(); });
  window.addEventListener('offline', () => { if (syncEnabled()) setSyncStatus('offline'); });
  // Revisa cambios de los otros dispositivos cada 45 segundos mientras la app está visible
  let lastPoll = 0;
  setInterval(() => {
    if (!SYNC.token || document.visibilityState !== 'visible') return;
    if (Date.now() - lastPoll < 45000) return;
    lastPoll = Date.now();
    syncNow();
  }, 5000);

  renderAccount();
  if (redirected) onTokenResponse(redirected);
}
