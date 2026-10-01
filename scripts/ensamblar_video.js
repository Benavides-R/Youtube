/**
 * ensamblar_video.js
 * ------------------------------------------------------------
 * Toma output/audio.mp3 + las fotos de output/imagenes/ y arma
 * output/video_final.mp4:
 *   - Cada imagen con zoom lento (Ken Burns) y DURACIÓN VARIABLE
 *     (no todas iguales, así no se siente robótico)
 *   - TRANSICIONES suaves (crossfade) entre cada imagen
 *   - Subtítulos quemados (si existe output/subtitulos.srt)
 *   - Música de fondo bajita mezclada con la voz (opcional)
 *
 * Uso:
 *   node scripts/ensamblar_video.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_DIR = path.join(__dirname, "..");
const AUDIO_PATH = path.join(BASE_DIR, "output", "audio.mp3");
const IMAGENES_DIR = path.join(BASE_DIR, "output", "imagenes");
const SRT_PATH = path.join(BASE_DIR, "output", "subtitulos.ass");
const MUSICA_DIR = path.join(BASE_DIR, "assets", "musica");
const OUTPUT_PATH = path.join(BASE_DIR, "output", "video_final.mp4");
const TEMP_DIR = path.join(BASE_DIR, "output", "_temp");

const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
let esShort = false;
let canalNombre = "";
if (fs.existsSync(GUION_PATH)) {
  try {
    const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));
    esShort = guionData.formato === "vertical";
    canalNombre = guionData.canal || "";
  } catch {
    esShort = false;
  }
}

// ------------------------------------------------------------
// Logo de marca de agua — uno por canal (assets/). Si el canal no
// tiene logo asignado o el archivo no existe, el video se arma sin
// overlay (opcional, nunca tumba el pipeline).
// ------------------------------------------------------------
function resolverLogo(nombreCanal) {
  const n = (nombreCanal || "").toLowerCase();
  let archivo;
  if (n.includes("superate")) archivo = "logo_superate.png";
  else if (n.includes("cristian") || n.includes("android") || n.includes("tecnolog")) archivo = "logo_tecnologia.png";
  else if (n.includes("biblia") || n.includes("sabidur")) archivo = "logo.png";
  else return null;
  const ruta = path.join(BASE_DIR, "assets", archivo);
  return fs.existsSync(ruta) ? ruta : null;
}

const LOGO_PATH = resolverLogo(canalNombre);
// Tamaño por alto (mantiene la proporción aunque el logo no sea cuadrado)
const LOGO_ALTO = esShort ? 120 : 84;
const LOGO_MARGEN = 30;

// Validación del logo ANTES de ensamblar: decode COMPLETO con ffmpeg
// (ffprobe solo lee el header y no basta — un PNG con basura pasa ffprobe
// pero revienta al decodificar). SIN -xerror ffmpeg devuelve exit 0 aunque
// haya errores de decode, así que es OBLIGATORIO para que el catch dispare.
// Si falla, descartamos el logo aquí y el video se arma sin marca de agua
// en vez de tumbar el pipeline al final.
let logoValido = false;
if (LOGO_PATH) {
  try {
    execSync(`ffmpeg -v error -xerror -i "${LOGO_PATH}" -f null -`, { stdio: "pipe" });
    logoValido = true;
  } catch {
    console.log(`⚠️  El logo ${path.basename(LOGO_PATH)} está corrupto — video sin marca de agua`);
  }
}

const ANCHO = esShort ? 1080 : 1920;
const ALTO = esShort ? 1920 : 1080;
const FPS = 30;
const VOLUMEN_MUSICA_DB = "-28dB";

// Activos solo en shorts: en videos largos el timing aproximado
// (sin datos exactos de la voz) se desincroniza notoriamente por
// el error acumulado; en un short de 45s el margen es mínimo.
const SUBTITULOS_ACTIVADOS = true;

// Cuánto se superponen 2 imágenes durante la transición
const DURACION_TRANSICION = esShort ? 0.3 : 0.6;

// Rango de duración por imagen (varía dentro de este rango, no es fija)
// Los shorts van con ritmo más rápido, imágenes más cortas
const DURACION_MIN = esShort ? 2 : 5;
const DURACION_MAX = esShort ? 4 : 9;

console.log(`📐 Formato: ${esShort ? "vertical (short)" : "horizontal"} — ${ANCHO}x${ALTO}`);
console.log(`🏷️  Logo: ${LOGO_PATH ? path.basename(LOGO_PATH) : "ninguno"}`);

// ------------------------------------------------------------
// 1. Validaciones
// ------------------------------------------------------------
if (!fs.existsSync(AUDIO_PATH)) {
  console.error("❌ No existe output/audio.mp3. Corre primero generar_audio.py");
  process.exit(1);
}
if (!fs.existsSync(IMAGENES_DIR) || fs.readdirSync(IMAGENES_DIR).length === 0) {
  console.error("❌ No hay escenas en output/imagenes/. Corre primero generar_imagenes.js");
  process.exit(1);
}
try {
  execSync("ffmpeg -version", { stdio: "ignore" });
} catch {
  console.error("❌ FFmpeg no está instalado.");
  process.exit(1);
}

const hayMusica = fs.existsSync(MUSICA_DIR) && fs.readdirSync(MUSICA_DIR).some((f) => f.endsWith(".mp3"));
const haySubtitulos = SUBTITULOS_ACTIVADOS && fs.existsSync(SRT_PATH);

console.log(`🎵 Música de fondo: ${hayMusica ? "sí" : "no (opcional)"}`);
console.log(`📝 Subtítulos: ${haySubtitulos ? "sí" : "no"}`);

function obtenerDuracion(archivo) {
  const salida = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${archivo}"`
  ).toString();
  return parseFloat(salida.trim());
}

const duracionTotal = obtenerDuracion(AUDIO_PATH);
console.log(`🎙️  Duración de la voz: ${duracionTotal.toFixed(1)}s`);

// ------------------------------------------------------------
// 2. Repartir la duración total entre las imágenes, de forma
//    RANDOM (dentro de DURACION_MIN-DURACION_MAX) pero que la
//    suma dé exacto el total del audio.
// ------------------------------------------------------------
const escenas = fs
  .readdirSync(IMAGENES_DIR)
  .filter((f) => f.match(/\.(jpg|jpeg|png|mp4)$/i))
  .sort();

function generarDuracionesVariables(cantidad, total) {
  const duraciones = [];
  for (let i = 0; i < cantidad; i++) {
    duraciones.push(DURACION_MIN + Math.random() * (DURACION_MAX - DURACION_MIN));
  }
  const sumaActual = duraciones.reduce((a, b) => a + b, 0);
  // Escalamos todas proporcionalmente para que la suma dé justo el total
  const factor = total / sumaActual;
  return duraciones.map((d) => d * factor);
}

const duraciones = generarDuracionesVariables(escenas.length, duracionTotal);
console.log(
  `🎬 ${escenas.length} escenas, duración variable (${DURACION_MIN}-${DURACION_MAX}s cada una aprox.)`
);

if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

// ------------------------------------------------------------
// 3. Generar un clip individual por imagen (con zoom), cada
//    uno con SU PROPIA duración (+ el extra para la transición)
// ------------------------------------------------------------
console.log("🎬 Generando clips individuales...");
const clipsInfo = [];

escenas.forEach((archivo, idx) => {
  const inputPath = path.join(IMAGENES_DIR, archivo);
  const clipPath = path.join(TEMP_DIR, `clip_${idx}.mp4`);
  const esVideo = /\.mp4$/i.test(archivo);
  // Le sumamos la transición extra (menos al último) para que al recortar
  // con el crossfade no se quede corto
  const esUltimo = idx === escenas.length - 1;
  const duracionClip = duraciones[idx] + (esUltimo ? 0 : DURACION_TRANSICION);

  let cmd;
  if (esVideo) {
    // Video real: se recorta a la duración del slot (o se repite en loop
    // si el clip original es más corto), y se escala+recorta para llenar
    // el encuadre exacto sin dejar franjas ni deformar la imagen -- el
    // propio movimiento del video reemplaza el zoom Ken Burns, no se le
    // aplica encima porque se vería sobrecargado.
    cmd = [
      "ffmpeg -y",
      `-stream_loop -1 -i "${inputPath}"`,
      `-vf "scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO},fps=${FPS}"`,
      `-t ${duracionClip}`,
      "-an", // el video de stock no aporta audio propio, solo se usa la voz
      "-c:v libx264 -pix_fmt yuv420p",
      `"${clipPath}"`,
    ].join(" ");
  } else {
    const totalFrames = Math.round(duracionClip * FPS);
    cmd = [
      "ffmpeg -y",
      `-loop 1 -i "${inputPath}"`,
      `-vf "scale=${ANCHO * 1.2}:${ALTO * 1.2},zoompan=z='min(zoom+0.0008,1.15)':d=${totalFrames}:s=${ANCHO}x${ALTO}:fps=${FPS}"`,
      `-t ${duracionClip}`,
      "-c:v libx264 -pix_fmt yuv420p",
      `"${clipPath}"`,
    ].join(" ");
  }

  execSync(cmd, { stdio: "ignore" });
  clipsInfo.push({ path: clipPath, duracion: duracionClip });
  console.log(`  ✅ clip ${idx + 1}/${escenas.length} (${esVideo ? "video" : "foto"}, ${duracionClip.toFixed(1)}s)`);
});

// ------------------------------------------------------------
// 4. Encadenar todos los clips con transición xfade (crossfade)
//    Se hace de a pares, acumulando: primero une clip1+clip2,
//    el resultado se une con clip3, y así sucesivamente.
// ------------------------------------------------------------
console.log("🔗 Uniendo clips con transiciones...");

const inputs = clipsInfo.map((c) => `-i "${c.path}"`).join(" ");
let filterComplex = "";
let acumuladoOffset = clipsInfo[0].duracion - DURACION_TRANSICION;
let etiquetaAnterior = "[0:v]";

for (let i = 1; i < clipsInfo.length; i++) {
  const etiquetaSalida = i === clipsInfo.length - 1 ? "[video_final]" : `[v${i}]`;
  filterComplex += `${etiquetaAnterior}[${i}:v]xfade=transition=fade:duration=${DURACION_TRANSICION}:offset=${acumuladoOffset.toFixed(
    2
  )}${etiquetaSalida};`;
  etiquetaAnterior = etiquetaSalida;
  if (i < clipsInfo.length - 1) {
    acumuladoOffset += clipsInfo[i].duracion - DURACION_TRANSICION;
  }
}

// Si solo hay 1 imagen, no hay nada que encadenar
const usaXfade = clipsInfo.length > 1;

const filterScriptPath = path.join(TEMP_DIR, "filtro.txt");
fs.writeFileSync(filterScriptPath, filterComplex.replace(/;$/, ""), "utf-8");

const videoSinAudioPath = path.join(TEMP_DIR, "video_sin_audio.mp4");

if (usaXfade) {
  const cmdXfade = `ffmpeg -y ${inputs} -filter_complex_script "${filterScriptPath}" -map "[video_final]" -c:v libx264 -pix_fmt yuv420p "${videoSinAudioPath}"`;
  execSync(cmdXfade, { stdio: "pipe" });
} else {
  fs.copyFileSync(clipsInfo[0].path, videoSinAudioPath);
}

// ------------------------------------------------------------
// 5. Música de fondo (si hay)
// ------------------------------------------------------------
let audioFinalPath = AUDIO_PATH;

if (hayMusica) {
  console.log("🎶 Mezclando música de fondo con ducking automático (baja sola cuando hay voz)...");
  const canciones = fs.readdirSync(MUSICA_DIR).filter((f) => f.endsWith(".mp3"));
  const cancionElegida = canciones[Math.floor(Math.random() * canciones.length)];
  const cancionPath = path.join(MUSICA_DIR, cancionElegida);
  console.log(`  🎵 Canción elegida: ${cancionElegida}`);

  audioFinalPath = path.join(TEMP_DIR, "audio_mezclado.mp3");

  // sidechaincompress: la música se comprime (baja) automáticamente
  // usando la voz como referencia — cuando hay voz, la música baja sola;
  // en silencios, vuelve a subir. Más natural que un volumen fijo parejo.
  const cmdMezcla = [
    "ffmpeg -y",
    `-i "${AUDIO_PATH}"`,
    `-stream_loop -1 -i "${cancionPath}"`,
    `-filter_complex "[1:a]volume=${VOLUMEN_MUSICA_DB}[musica_base];[musica_base][0:a]sidechaincompress=threshold=0.03:ratio=10:attack=5:release=300:makeup=1[musica_ducked];[0:a][musica_ducked]amix=inputs=2:duration=first:dropout_transition=2[audio_final]"`,
    `-map "[audio_final]"`,
    `-t ${duracionTotal}`,
    `"${audioFinalPath}"`,
  ].join(" ");

  execSync(cmdMezcla, { stdio: "ignore" });
}

// ------------------------------------------------------------
// 6. Pegar audio + subtítulos
// ------------------------------------------------------------
console.log("🎙️  Agregando audio final...");

const srtEscapado = SRT_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");
// El estilo nuevo usa la fuente Bebas Neue -- va empacada en el repo
// (assets/fonts/BebasNeue-Regular.ttf), fontsdir le dice a libass dónde
// buscarla en vez de depender de que esté instalada en el runner.
const fontsDir = path.join(BASE_DIR, "assets", "fonts").replace(/\\/g, "/").replace(/:/g, "\\:");
// El archivo .ass ya trae su propia resolución (PlayResX/PlayResY) y
// estilo declarados en el encabezado — no necesita force_style ni
// original_size, eso es justo lo que evita el bug de tamaño anterior.

// El logo va arriba-derecha en AMBOS formatos: los subtítulos van
// abajo/centrados, esquina superior libre de colisiones y de la
// watermark de YouTube (que aparece abajo-derecha en videos largos).
const usarLogo = logoValido; // false => misma ruta que antes de tener logo
let filtroVideo;
let codificadoVideo = "-c:v copy";
if (usarLogo) {
  const subs = haySubtitulos ? `subtitles='${srtEscapado}':fontsdir='${fontsDir}'` : null;
  const escalaLogo = `scale=-1:${LOGO_ALTO}`; // -1 conserva la proporción
  const overlay = `overlay=W-w-${LOGO_MARGEN}:${LOGO_MARGEN}`;
  filtroVideo = subs
    ? `-filter_complex "[0:v]${subs}[vsub];[2:v]${escalaLogo}[logo];[vsub][logo]${overlay}[vout]" -map "[vout]" -map 1:a`
    : `-filter_complex "[2:v]${escalaLogo}[logo];[0:v][logo]${overlay}[vout]" -map "[vout]" -map 1:a`;
  codificadoVideo = "-c:v libx264 -pix_fmt yuv420p";
} else if (haySubtitulos) {
  filtroVideo = `-vf "subtitles='${srtEscapado}':fontsdir='${fontsDir}'"`;
  codificadoVideo = "-c:v libx264 -pix_fmt yuv420p";
} else {
  filtroVideo = "";
}

const inputsFinales = [
  `-i "${videoSinAudioPath}"`,
  `-i "${audioFinalPath}"`,
  usarLogo ? `-i "${LOGO_PATH}"` : "",
].filter(Boolean).join(" ");

const cmdFinal = [
  "ffmpeg -y",
  inputsFinales,
  filtroVideo,
  codificadoVideo,
  // loudnorm normaliza el volumen a un estándar de streaming (-16 LUFS,
  // el que usa YouTube/Spotify) — así todos los videos suenan parejo,
  // sin importar si uno quedó más bajito o más fuerte que otro
  '-af "loudnorm=I=-16:TP=-1.5:LRA=11"',
  "-c:a aac -shortest",
  `"${OUTPUT_PATH}"`,
].filter(Boolean).join(" ");

// Si algo relacionado al logo revienta ffmpeg (aunque lo hayamos validado),
// UN último reintento SIN logo: el video se publica sin marca de agua en
// vez de perder la corrida entera. Cualquier otro fallo sí propaga.
let videoGenerado = false;
try {
  execSync(cmdFinal, { stdio: "ignore" });
  videoGenerado = true;
} catch (err) {
  if (usarLogo) {
    console.log("⚠️  ffmpeg falló con el logo — reintentando SIN logo...");
    const cmdSinLogo = [
      "ffmpeg -y",
      `-i "${videoSinAudioPath}"`,
      `-i "${audioFinalPath}"`,
      haySubtitulos ? `-vf "subtitles='${srtEscapado}':fontsdir='${fontsDir}'"` : "-c:v copy",
      haySubtitulos ? "-c:v libx264 -pix_fmt yuv420p" : "",
      '-af "loudnorm=I=-16:TP=-1.5:LRA=11"',
      "-c:a aac -shortest",
      `"${OUTPUT_PATH}"`,
    ].filter(Boolean).join(" ");
    execSync(cmdSinLogo, { stdio: "ignore" }); // si esto falla sí, es otro problema y propaga
    console.log("✅ Video generado sin logo (el logo falló)");
  } else {
    throw err; // sin logo de por medio: el fallo es real, corta como antes
  }
}

if (usarLogo && videoGenerado) console.log(`🏷️  Logo aplicado: ${path.basename(LOGO_PATH)} (alto ${LOGO_ALTO}px, arriba-derecha)`);
else if (!usarLogo) console.log("ℹ️  Sin logo para este canal — video sin marca de agua");

// ------------------------------------------------------------
// 7. Limpiar
// ------------------------------------------------------------
fs.rmSync(TEMP_DIR, { recursive: true });

const tamañoMB = fs.statSync(OUTPUT_PATH).size / (1024 * 1024);
console.log(`\n✅ Video final generado: ${OUTPUT_PATH}`);
console.log(`📦 Tamaño: ${tamañoMB.toFixed(1)} MB`);
