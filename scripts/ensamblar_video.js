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
if (fs.existsSync(GUION_PATH)) {
  try {
    const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));
    esShort = guionData.formato === "vertical";
  } catch {
    esShort = false;
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

// ------------------------------------------------------------
// 1. Validaciones
// ------------------------------------------------------------
if (!fs.existsSync(AUDIO_PATH)) {
  console.error("❌ No existe output/audio.mp3. Corre primero generar_audio.py");
  process.exit(1);
}
if (!fs.existsSync(IMAGENES_DIR) || fs.readdirSync(IMAGENES_DIR).length === 0) {
  console.error("❌ No hay imágenes en output/imagenes/. Corre primero generar_imagenes.js");
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
const imagenes = fs
  .readdirSync(IMAGENES_DIR)
  .filter((f) => f.match(/\.(jpg|jpeg|png)$/i))
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

const duraciones = generarDuracionesVariables(imagenes.length, duracionTotal);
console.log(
  `🖼️  ${imagenes.length} imágenes, duración variable (${DURACION_MIN}-${DURACION_MAX}s cada una aprox.)`
);

if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

// ------------------------------------------------------------
// 3. Generar un clip individual por imagen (con zoom), cada
//    uno con SU PROPIA duración (+ el extra para la transición)
// ------------------------------------------------------------
console.log("🎬 Generando clips individuales...");
const clipsInfo = [];

imagenes.forEach((img, idx) => {
  const inputPath = path.join(IMAGENES_DIR, img);
  const clipPath = path.join(TEMP_DIR, `clip_${idx}.mp4`);
  // Le sumamos la transición extra (menos al último) para que al recortar
  // con el crossfade no se quede corto
  const esUltimo = idx === imagenes.length - 1;
  const duracionClip = duraciones[idx] + (esUltimo ? 0 : DURACION_TRANSICION);
  const totalFrames = Math.round(duracionClip * FPS);

  const cmd = [
    "ffmpeg -y",
    `-loop 1 -i "${inputPath}"`,
    `-vf "scale=${ANCHO * 1.2}:${ALTO * 1.2},zoompan=z='min(zoom+0.0008,1.15)':d=${totalFrames}:s=${ANCHO}x${ALTO}:fps=${FPS}"`,
    `-t ${duracionClip}`,
    "-c:v libx264 -pix_fmt yuv420p",
    `"${clipPath}"`,
  ].join(" ");

  execSync(cmd, { stdio: "ignore" });
  clipsInfo.push({ path: clipPath, duracion: duracionClip });
  console.log(`  ✅ clip ${idx + 1}/${imagenes.length} (${duracionClip.toFixed(1)}s)`);
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
  console.log("🎶 Mezclando música de fondo con la voz...");
  const canciones = fs.readdirSync(MUSICA_DIR).filter((f) => f.endsWith(".mp3"));
  const cancionElegida = canciones[Math.floor(Math.random() * canciones.length)];
  const cancionPath = path.join(MUSICA_DIR, cancionElegida);
  console.log(`  🎵 Canción elegida: ${cancionElegida}`);

  audioFinalPath = path.join(TEMP_DIR, "audio_mezclado.mp3");

  const cmdMezcla = [
    "ffmpeg -y",
    `-i "${AUDIO_PATH}"`,
    `-stream_loop -1 -i "${cancionPath}"`,
    `-filter_complex "[1:a]volume=${VOLUMEN_MUSICA_DB}[musica];[0:a][musica]amix=inputs=2:duration=first:dropout_transition=2[audio_final]"`,
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

let filtroSubtitulos = "";
if (haySubtitulos) {
  const srtEscapado = SRT_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");
  // El archivo .ass ya trae su propia resolución (PlayResX/PlayResY) y
  // estilo declarados en el encabezado — no necesita force_style ni
  // original_size, eso es justo lo que evita el bug de tamaño anterior.
  filtroSubtitulos = `-vf "subtitles='${srtEscapado}'"`;
}

const cmdFinal = [
  "ffmpeg -y",
  `-i "${videoSinAudioPath}"`,
  `-i "${audioFinalPath}"`,
  filtroSubtitulos,
  filtroSubtitulos ? "-c:v libx264 -pix_fmt yuv420p" : "-c:v copy",
  "-c:a aac -shortest",
  `"${OUTPUT_PATH}"`,
].join(" ");

execSync(cmdFinal, { stdio: "ignore" });

// ------------------------------------------------------------
// 7. Limpiar
// ------------------------------------------------------------
fs.rmSync(TEMP_DIR, { recursive: true });

const tamañoMB = fs.statSync(OUTPUT_PATH).size / (1024 * 1024);
console.log(`\n✅ Video final generado: ${OUTPUT_PATH}`);
console.log(`📦 Tamaño: ${tamañoMB.toFixed(1)} MB`);
