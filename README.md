# TotalStats

Seguimiento del progreso futbolístico de un grupo de jugadores, con una pizarra táctica para mostrar posiciones y jugadas.
App web instalable (PC y celular). Inicia sesión con Google para sincronizar tus datos entre dispositivos a través de tu Google Drive.

App publicada: https://mindsparkapps.github.io/totalstats/

## Secciones

### Panel
- Número de jugadores, media del grupo, sesiones de los últimos 30 días y goles más asistencias.
- Gráfica de la media del grupo por mes.
- Quién ha progresado más, los mejor valorados y la actividad reciente.

### Jugadores
Una ficha por jugador con dorsal, posición, media actual, una pequeña gráfica de evolución y el progreso desde la primera evaluación. Al abrir una ficha ves:
- un gráfico de sus atributos, comparando la primera evaluación con la última,
- una gráfica de evolución, de la media o de cada atributo,
- su objetivo personal y el historial de sesiones.

### Sesiones
- Registro de entrenos, partidos o pruebas físicas con minutos, goles, asistencias y notas.
- Cada uno de los 6 atributos (velocidad, técnica, pase, tiro, defensa y resistencia) se valora de 1 a 10.
- Historial que se puede filtrar por jugador y por tipo de sesión.

### Táctica
La pizarra, sobre un campo a escala real.
- **Fichas:** las de tu equipo son naranjas, las del rival azules, y también hay balón. Se arrastran con el ratón o con el dedo, y con las flechas del teclado. En el celular las fichas se ven más grandes para poder moverlas con el dedo.
- **Formaciones:** 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2 y 3-4-3, para cada equipo.
- **Flechas:** de **pase** (línea continua) y de **desmarque** (discontinua). Se pueden borrar una a una o todas a la vez.
- **Pasos:** cada paso es una posición de las fichas. Con **▶ Reproducir** las fichas se mueven de un paso al siguiente para mostrar la jugada.
- **Asignar jugadores:** puedes poner un jugador de tu plantilla en cada ficha y aparecen su dorsal y su nombre.
- **Jugadas guardadas:** se guardan con un nombre, como "salida de balón" o "córner", y se pueden volver a abrir.
- **Compartir imagen:** en el celular abre el menú de compartir (WhatsApp, correo…) con una imagen de la pizarra; en el PC la descarga.

### Rutina
Ejercicios con la cámara del celular: **Flexiones de brazo** y **Sentadillas**; el catálogo está preparado para más. El conteo combina el ángulo de la articulación (codo o rodilla, fusionando los dos lados) con el movimiento vertical de la cabeza (nariz, ojos, orejas, boca), los hombros y la cadera, y se adapta a lo que estira cada persona arriba. La versión y el commit se ven arriba, junto al nombre de la app (`version.js`).
- **Cómo colocar el celular:** apoyado en el suelo, **de costado** al jugador, a 1,5–2 m y en horizontal, con el cuerpo entero a la vista. Hasta que el semáforo diga «Cuerpo completo visible ✔» no se habilita **Empezar**. Hay cuenta atrás de 3 s.
- **Qué hace:** el celular detecta la pose (MediaPipe, dentro del navegador), cuenta cada flexión, la califica y graba un video con el contador y la nota impresos. La primera vez descarga el detector (unos 5 MB) y después funciona sin conexión.
- **Nota de cada flexión (0 a 100):** profundidad del codo 50 %, extensión arriba 20 %, alineación hombro-cadera-tobillo 20 % y control del ritmo 10 %. **≥ 85 Excelente**, **70–84 Buena**, **50–69 Regular**, **< 50 Incompleta**. Las incompletas se cuentan aparte y cada nota trae un consejo («Baja más el pecho», «Estira los brazos arriba», «Mantén la cadera alineada», «Más despacio»). Los umbrales están en `PUSHUP_CFG`, al principio de `pushup.js`.
- **Rutinas:** nombre, jugador (opcional) y ejercicios con series, repeticiones y descanso. Cada serie guarda un entreno con su video.
- **Historial:** fecha, jugador, repeticiones, nota media y 🎬 si hay video; al tocar una fila se ve el detalle, el video y se puede descargar o compartir.
- **Los videos no se suben a Drive**: solo quedan en el dispositivo donde se grabaron (son unos 20 MB por minuto). Las rutinas y los entrenos sí se sincronizan.
- **Modo desarrollador** (al pie de la pestaña): **Trackeo de cámara** dibuja el esqueleto, los ángulos, el estado del contador y los FPS sobre la imagen y el video; **Usar archivo de video en vez de cámara** permite probar en el PC con un video del ejercicio tomado de costado. Dibuja los 33 puntos del cuerpo (cara, manos y pies), las líneas de altura del suelo, la cabeza y los hombros, los umbrales reales y un gráfico de la señal.

Para probar la app sin datos propios, en el Panel está el botón **Cargar datos de ejemplo**. Esos datos llevan la etiqueta "Ejemplo" y se borran con un botón.

## Cuenta de Google y sincronización
- Funciona sin conexión y sin iniciar sesión: los datos se guardan al instante en el dispositivo (IndexedDB).
- Con **Iniciar sesión** (Google) los datos se guardan también en la carpeta oculta de la app en tu Google Drive (`libreta-data.json`), así que son los mismos en el PC y en el celular.
- La sincronización corre al abrir la app, al volver a tener conexión, unos segundos después de cada cambio y cada 45 segundos mientras la app está abierta. Si dos dispositivos cambian cosas distintas, se combinan registro por registro.
- El punto junto a tu foto indica el estado: verde sincronizado, amarillo pendiente o sin conexión, rojo error.

## Instalar como app
- **Android (Chrome):** menú ⋮ → **Agregar a pantalla de inicio** (o **Instalar app**).
- **iPhone (Safari):** botón Compartir → **Agregar a pantalla de inicio**.
- **PC (Chrome o Edge):** el ícono de instalar en la barra de direcciones.

## Estructura
```
index.html       interfaz
styles.css       estilos (tema claro y oscuro)
app.js           lógica de la app, IndexedDB y pizarra táctica
rutina.js        pestaña Rutina: catálogo, rutinas, historial y modo desarrollador
pushup.js        flexiones: MediaPipe, conteo, nota y grabación (módulo ES)
sync.js          login con Google y sincronización con Google Drive
config.js        ID del cliente OAuth "MindSpark"
manifest.json    datos de la app instalable
sw.js            service worker (modo sin conexión)
icons/           íconos (normales, maskable y Apple)
```

## Configuración de Google
Usa el cliente OAuth compartido "MindSpark". En Google Cloud Console, el cliente debe tener `https://mindsparkapps.github.io` en **Orígenes de JavaScript autorizados** (ya está si ZenBan y ApiTrack funcionan) y, para el inicio de sesión dentro de la app instalada, `https://mindsparkapps.github.io/totalstats/` en **URI de redireccionamiento autorizados**.
