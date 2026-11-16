# Plan: menú «Rutina» y ejercicio «Flexiones de brazo» con cámara

Es para que Sonnet lo implemente. La app es una PWA estática sin build: `index.html`, `app.js` (una IIFE), `sync.js` (sincroniza con Drive), `styles.css` y `sw.js`. Los datos viven en IndexedDB `libreta-del-mister` (versión 1, stores `jugadores`, `sesiones`, `jugadas`) y se suben a Google Drive.

## 1. Alcance

1. Una pestaña nueva, **Rutina**, en el `nav.tabs`, junto a Panel, Jugadores, Sesiones y Táctica.
2. Dentro hay un **catálogo de ejercicios**. Por ahora tiene uno solo, *Flexiones de brazo*, y queda preparado para sumar más.
3. Un **constructor de rutinas**: nombre, jugador (opcional) y una lista de ejercicios con series y repeticiones objetivo, más el descanso.
4. El ejercicio **Flexiones de brazo** usa la cámara del celular:
   - detecta la pose del cuerpo y cuenta cada flexión (sube y baja);
   - califica cada repetición según la profundidad y la calidad del recorrido;
   - **graba en video** la sesión con el contador y la nota de cada flexión impresos en la imagen;
   - guarda el resultado y deja ver el historial.
5. Un **Modo desarrollador** con el checkbox **«Trackeo de cámara»**. Si está activo, se dibuja sobre la imagen lo que detectó el celular.

## 2. Tecnología de detección

- **MediaPipe Tasks Vision `PoseLandmarker`**: corre en el navegador (WASM y GPU), en Android, iOS y PC, sin servidor.
  - Se carga por ESM, solo al abrir el ejercicio, con un `import()` dinámico de `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`. El WASM sale de la misma versión en `/wasm`.
  - El modelo es `pose_landmarker_lite.task` (unos 5 MB), de `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`. Se usa `lite` porque el celular es de gama media. Si la detección falla mucho, se prueba `full`.
  - Va en `runningMode: 'VIDEO'` con `detectForVideo(video, performance.now())` dentro de un bucle de `requestVideoFrameCallback`, o `requestAnimationFrame` como alternativa.
  - Usa `delegate: 'GPU'` y, si falla, pasa a `'CPU'`.
- **Sin conexión:** el `sw.js` actual ignora las peticiones a otros orígenes. Hay que cachear explícitamente las URLs de MediaPipe (bundle, wasm y modelo) en una caché `libreta-ml-v1` la primera vez que se usan, para que el ejercicio funcione después sin internet. Mientras se descarga se muestra «Cargando detector… (solo la primera vez)».

## 3. Cómo se cuenta y se califica una flexión

**Posición de la cámara:** el celular va apoyado en el suelo, **de costado** al jugador, a unos 1,5 a 2 m, en horizontal. La pantalla previa a empezar lo explica con un dibujo y muestra el semáforo «Cuerpo completo visible ✔» antes de habilitar **Empezar**.

**Puntos que se usan** (landmarks de MediaPipe), del lado del cuerpo con mejor `visibility` (izquierdo 11/13/15/23/27 o derecho 12/14/16/24/28):
- hombro, codo y muñeca, para el **ángulo del codo**;
- hombro, cadera y tobillo, para la **alineación del cuerpo** (la plancha);
- la altura del hombro respecto de la muñeca, normalizada por el largo del antebrazo, para la **profundidad**.

Las señales se suavizan con una media móvil exponencial (α ≈ 0,4) o un filtro One-Euro para quitar el temblor.

**Máquina de estados** (con histéresis, para no contar dos veces):

```
ARRIBA  (codo > 155°) ──baja──▶ BAJANDO ──codo mín.──▶ SUBIENDO ──codo > 155°──▶ ARRIBA  ⇒ +1 rep
```

- Se empieza a contar la repetición cuando el codo baja de 140°. Al volver por encima de 155° se cierra y se califica.
- Si el ciclo dura menos de 0,4 s, o se pierde el cuerpo (visibilidad < 0,5) en medio, se descarta.
- No se cuenta si no hay plancha (hombro-cadera-tobillo < 140°, es decir, está de rodillas o parado). Para la v1 basta con avisar «Ponte en posición de plancha». Las flexiones de rodillas pueden ser una variante más adelante.

**Calificación de cada repetición (0 a 100):**

| Criterio | Peso | Cómo se mide | 100 % | 0 % |
|---|---|---|---|---|
| Profundidad | 50 | ángulo mínimo del codo en la bajada | ≤ 75° | ≥ 120° |
| Extensión arriba | 20 | ángulo máximo del codo al subir | ≥ 165° | ≤ 145° |
| Alineación | 20 | peor ángulo hombro-cadera-tobillo en la rep | ≥ 170° | ≤ 145° |
| Control | 10 | duración de la rep | 1,2–3 s | < 0,5 s o > 6 s |

Entre los extremos la puntuación es lineal. La nota final se muestra con etiqueta y color (puede reutilizar `ratingColor` de `app.js`):
- **≥ 85 Excelente** (verde), **70–84 Buena**, **50–69 Regular** (ámbar), **< 50 Incompleta** (rojo).
- Las *incompletas* se cuentan aparte: «12 flexiones · 2 incompletas».
- Junto a la nota sale un consejo corto según el peor criterio: «Baja más el pecho», «Estira los brazos arriba», «Mantén la cadera alineada» o «Más despacio».

Todos los umbrales van en un solo objeto `PUSHUP_CFG`, al principio del módulo, para ajustarlos fácilmente tras probar con personas reales.

## 4. Grabación en video

- Un `<canvas>` de composición dibuja en cada frame:
  1. el frame del `<video>` de la cámara;
  2. el HUD: contador grande, nota y etiqueta de la última repetición (en grande 1,5 s y luego en pequeño), tiempo transcurrido y serie actual;
  3. **solo si «Trackeo de cámara» está activo**, el esqueleto, los ángulos y el estado de la máquina (ver §6).
- Se graba con `canvas.captureStream(30)` y `MediaRecorder`. El tipo de video se elige con `MediaRecorder.isTypeSupported`, en este orden: `video/mp4;codecs=avc1` (iOS Safari y Chrome reciente), luego `video/webm;codecs=vp9`, luego `video/webm`. La tasa es de unos 2,5 Mbps.
- Al terminar, el video queda como `Blob`:
  - se guarda en un store **solo local**, `videos` (ver §5). No se sube a Drive porque es demasiado pesado.
  - en el resultado se puede **Ver**, **Descargar o Compartir** (`navigator.share({ files })` si existe; si no, un enlace de descarga) y **Borrar video**.
- Durante el ejercicio se pide `navigator.wakeLock.request('screen')` para que la pantalla no se apague, y se libera al salir.

## 5. Datos

Se sube `indexedDB.open('libreta-del-mister', 2)` y se crean en `onupgradeneeded`:

| Store | Se sincroniza | Contenido |
|---|---|---|
| `rutinas` | sí | `{ id, nombre, jugadorId?, items: [{ ejercicio: 'flexiones', series, reps, descansoSeg }], creado }` |
| `entrenos` | sí | `{ id, rutinaId?, jugadorId?, ejercicio: 'flexiones', fecha, inicio, duracionSeg, reps: [{ n, nota, prof, ext, alin, ctrl, dur, angMin, completa }], total, completas, notaMedia, videoId? }` |
| `videos` | **no** | `{ id, blob, mime, duracionSeg, creado }` |

- En `app.js`: `STORES = ['jugadores','sesiones','jugadas','rutinas','entrenos']` (lo usa `sync.js`) y una constante aparte, `LOCAL_STORES = ['videos']`. `openDb` crea los dos grupos. `sync.js` **no** debe tocar `videos`; hay que revisar `readLocal`, `applyPayload` y `mergePayloads`, que recorren `STORES`.
- En el `S` de `app.js` se agregan `rutinas: []` y `entrenos: []`.
- Borrar un entreno borra también su video.

## 6. Modo desarrollador

- Al pie de la vista Rutina va un bloque `<details>` llamado «⚙️ Modo desarrollador», cerrado por defecto. Adentro está el checkbox **Trackeo de cámara**.
- Se guarda en `localStorage`: `ts-dev-tracking = '1' | '0'`. No se sincroniza porque es una preferencia del dispositivo.
- El checkbox también se ve y se puede cambiar **en la pantalla del ejercicio**, con un botón pequeño 🐞, y tiene efecto en vivo.
- Con el trackeo activo se dibuja sobre la cámara y en el video grabado:
  - los 33 puntos y las líneas del esqueleto (lado activo resaltado y el otro tenue);
  - un arco y el número del ángulo del codo, y el ángulo hombro-cadera-tobillo;
  - una barra vertical de profundidad con las marcas de los umbrales;
  - un texto: estado de la máquina, lado usado, visibilidad media, FPS de detección y delegate (GPU o CPU).
- Además, el modo desarrollador agrega la opción **«Usar archivo de video en vez de cámara»** (`<input type="file" accept="video/*">`). Así se puede probar en el PC con un video de flexiones, sin celular, y es lo que usará Sonnet para verificar.

## 7. Interfaz

**Pestaña Rutina** (`#v-rutina`), con el mismo estilo de `card`, `head-row` y `btn` que el resto:
- **Ejercicios:** una tarjeta «Flexiones de brazo» con icono, una descripción breve y el botón **Practicar** (sesión libre, sin rutina).
- **Mis rutinas:** una lista con nombre, jugador y ejercicios, y los botones **Iniciar**, **Editar** y **Borrar** (con `arm()` para confirmar). El botón **Nueva rutina** abre `dlg-rutina`, el diálogo del constructor.
- **Historial de entrenos:** una tabla con fecha, jugador, ejercicio, reps (completas/total), nota media y 🎬 si tiene video. Al tocar una fila se abre el detalle con la lista de reps y el reproductor.
- **Modo desarrollador** (§6).

**Pantalla del ejercicio** (`dlg-ejercicio`, a pantalla completa y orientación horizontal sugerida):
1. *Preparación:* vista de la cámara, guía de colocación, selector de jugador, objetivo de reps y un indicador de cuerpo detectado. Los botones son **Empezar** y 🔄 Cambiar cámara, reutilizando la lógica de `startCam` de la foto. Para este ejercicio la cámara por defecto es la **trasera** (`environment`), y la frontal sirve si el jugador se graba solo.
2. *Cuenta atrás* de 3 s, con voz o pitido, y luego se arranca la grabación.
3. *En curso:* el HUD. Cada rep dice su número por voz (`speechSynthesis`, en es-ES y desactivable) y hace un destello del color de la nota. Los botones son **Pausa** y **Terminar**.
4. *Resultado:* total, completas, nota media, la mejor y la peor rep, una gráfica pequeña de la nota por rep (con `lineChart` de `app.js`) y el video. Los botones son **Guardar**, **Descartar** y **Repetir**.
- En una rutina con varias series se pasa por el descanso con temporizador hasta la siguiente serie. El video es uno por serie.

## 8. Archivos y cambios

| Archivo | Cambio |
|---|---|
| `index.html` | Botón `data-tab="rutina"`, `<section id="v-rutina">`, `dlg-rutina`, `dlg-ejercicio` y `dlg-entreno`, y `<script src="rutina.js"></script>` después de `app.js`. |
| `app.js` | DB versión 2 y `LOCAL_STORES`. Agregar `rutina` a la lista de `hashchange` (línea 296). `renderAll()` llama a `window.Rutina?.render()`. Exponer una API mínima, `window.App = { S, store, toast, uid, esc, today, fdate, playerById, ratingColor, lineChart, arm }`, porque hoy todo está dentro de la IIFE. |
| `rutina.js` (nuevo) | UI de la pestaña, constructor de rutinas, historial y modo desarrollador. Usa `window.App`. |
| `pushup.js` (nuevo, ES module) | Carga de MediaPipe, bucle de detección, `PUSHUP_CFG`, máquina de estados, calificación, composición en canvas y `MediaRecorder`. Expone `startPushupSession({ video, canvas, onRep, onState, devTracking })` y devuelve `{ stop(): Promise<{reps, blob, mime, duracion}> }`. Se separa la lógica pura (ángulos, estados y nota) en funciones exportadas para poder probarlas. |
| `sync.js` | Confirmar que solo recorre `STORES` y que nunca toca `videos`. |
| `styles.css` | Estilos de la pestaña, del HUD y del diálogo a pantalla completa. |
| `sw.js` | `CACHE_NAME = 'libreta-v4'`, agregar `rutina.js` y `pushup.js` a `ASSETS`, y la caché `libreta-ml-v1` para las URLs de MediaPipe. |
| `README.md` | Una sección «Rutina» con cómo colocar el celular y qué significa cada nota. |

## 9. Orden de trabajo sugerido para Sonnet

1. Datos: DB v2, `LOCAL_STORES`, `window.App`, y comprobar que `sync.js` sigue funcionando.
2. Pestaña Rutina con el catálogo, el constructor y el historial, sin cámara.
3. `pushup.js` con la lógica pura (ángulos, estados y nota), probada con secuencias de ángulos sintéticas en un script de Node o en consola.
4. Detección en vivo con MediaPipe, más el modo desarrollador con el overlay y el «archivo de video».
5. HUD y grabación con `MediaRecorder`, y guardado del video y del entreno.
6. Pantalla de resultado, voz, wake lock y series con descanso.
7. `sw.js` (versión y caché de MediaPipe), README y `graphify update .`.

## 10. Verificación

- **PC (preview `.claude/launch.json`):** activar el modo desarrollador, cargar un video de flexiones de costado (buscar uno de dominio público o grabar uno) y comprobar que el conteo coincide con el real (±0), que una flexión a medias sale «Incompleta» o «Regular», que el overlay se ve y que el video descargado contiene el HUD.
- **Celular** (GitHub Pages es HTTPS, requisito de la cámara): probar en Chrome de Android (el Redmi por adb) y, si se puede, en Safari de iOS. Comprobar los permisos, la cámara trasera, el wake lock, el MP4 o WebM reproducible y compartido, y la memoria con una sesión de 2 minutos.
- **Sincronización:** crear una rutina y un entreno, sincronizar y comprobar en otro dispositivo que llegan los dos y que el video **no** viaja.
- **Sin conexión:** después del primer uso, en modo avión, el ejercicio abre y detecta.

## 11. Riesgos y decisiones abiertas

- **Precisión:** con la cámara de costado y el cuerpo entero visible, el ángulo del codo es fiable. De frente es mucho peor, por eso la v1 exige vista lateral. Los umbrales de `PUSHUP_CFG` habrá que afinarlos con pruebas reales.
- **Rendimiento:** en gama media `lite` debería dar entre 15 y 30 FPS. Si cae por debajo de 12, se baja la resolución de entrada a 640×360 y la detección se hace cada 2 frames, mientras la grabación sigue a 30 FPS.
- **Tamaño de los videos:** son unos 20 MB por minuto. Se avisa del espacio usado en el historial y se ofrece borrarlos.
- **Decisiones para el usuario** (tienen valores por defecto, así que no bloquean):
  - El entreno se asocia a un jugador de la plantilla de forma opcional. ¿Debe ser obligatorio?
  - ¿Los entrenos de flexiones deben aparecer también en la ficha del jugador y en el Panel? En la v1, no.
  - Los videos no se suben a Drive. ¿Hace falta una opción para subir un video concreto?
