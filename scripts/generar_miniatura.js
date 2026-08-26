/**
 * generar_miniatura.js
 * ------------------------------------------------------------
 * Toma la primera imagen descargada y le pone el título del
 * video en texto grande, tipo miniatura de YouTube.
 *
 * Uso:
 *   node scripts/generar_miniatura.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_DIR = path.join(__dirname, "..");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
const IMAGENES_DIR = path.join(BASE_DIR, "output", "imagenes");
const OUTPUT_PATH = path.join(BASE_DIR, "output", "miniatura.jpg");
const TEXTO_TEMP_PATH = path.join(BASE_DIR, "output", "_miniatura_texto.txt");

if (!fs.existsSync(GUION_PATH)) {
  console.error("❌ No existe output/guion.json. Corre primero generar_guion.js");
  process.exit(1);
}

const imagenes = fs
  .readdirSync(IMAGENES_DIR)
  .filter((f) => f.match(/\.(jpg|jpeg|png)$/i))
  .sort();

if (imagenes.length === 0) {
  console.error("❌ No hay imágenes en output/imagenes/. Corre primero generar_imagenes.js");
  process.exit(1);
}

const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));
const primeraImagen = path.join(IMAGENES_DIR, imagenes[0]);

// Fuente según sistema operativo
const fontPathRaw =
  process.platform === "win32"
    ? "C:/Windows/Fonts/arialbd.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
// Escapamos el ":" del drive letter en Windows para el filtro de ffmpeg
const fontPath = fontPathRaw.replace(/:/g, "\\:");

// Texto corto para miniatura (generado específico por la IA), con respaldo
// al título completo si un guion viejo no lo trae
let titulo = (guionData.texto_miniatura || guionData.titulo).toUpperCase().slice(0, 35);
const palabras = titulo.split(" ");
const mitad = Math.ceil(palabras.length / 2);
const linea1 = palabras.slice(0, mitad).join(" ");
const linea2 = palabras.slice(mitad).join(" ");

// IMPORTANTE: el texto va en un ARCHIVO aparte, no directo en el comando.
// Meter un salto de línea real dentro del comando rompe la terminal en
// Windows (lo interpreta como si fueran 2 comandos distintos).
fs.writeFileSync(TEXTO_TEMP_PATH, `${linea1}\n${linea2}`, "utf-8");

// Ruta del archivo de texto, también escapada para el filtro de ffmpeg
const textoPathEscapado = TEXTO_TEMP_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");

const filtro = [
  "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
  "drawbox=x=0:y=470:w=1280:h=250:color=black@0.55:t=fill",
  `drawtext=fontfile='${fontPath}':textfile='${textoPathEscapado}':fontcolor=white:fontsize=70:x=(w-text_w)/2:y=500:line_spacing=15:borderw=3:bordercolor=black@0.8`,
].join(",");

const cmd = `ffmpeg -y -i "${primeraImagen}" -vf "${filtro}" "${OUTPUT_PATH}"`;

try {
  execSync(cmd, { stdio: "pipe" });
  console.log(`✅ Miniatura generada: ${OUTPUT_PATH}`);
} catch (err) {
  console.error("❌ Error generando miniatura:", err.stderr ? err.stderr.toString() : err.message);
  console.error("   (esto no detiene el proceso, el video se sube igual sin miniatura personalizada)");
} finally {
  if (fs.existsSync(TEXTO_TEMP_PATH)) fs.unlinkSync(TEXTO_TEMP_PATH);
}
