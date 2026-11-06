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
const F = require("./formato_textos");

const BASE_DIR = path.join(__dirname, "..");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
const IMAGENES_DIR = path.join(BASE_DIR, "output", "imagenes");
const OUTPUT_PATH = path.join(BASE_DIR, "output", "miniatura.jpg");

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
const esShort = guionData.formato === "vertical";
const ANCHO = esShort ? 720 : 1280;
const ALTO = esShort ? 1280 : 720;
const CAJA_Y = esShort ? Math.round(ALTO * 0.68) : 470;
const CAJA_ALTO = esShort ? Math.round(ALTO * 0.22) : 250;
const TEXTO_Y = CAJA_Y + Math.round(CAJA_ALTO * 0.15);

// Fuente según sistema operativo
const fontPath =
  process.platform === "win32"
    ? "C:/Windows/Fonts/arialbd.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

// Texto corto para miniatura (generado específico por la IA), con respaldo
// al título completo si un guion viejo no lo trae.
// Se limpia porque la IA a veces devuelve dos líneas ("PRIORIDAD\nHOY") o
// emojis: el salto/símbolo se dibujaba como un cuadro raro en la miniatura.
const textoBase =
  F.limpiarParaDibujo(guionData.texto_miniatura) ||
  F.limpiarParaDibujo(guionData.titulo) ||
  "VIDEO";
let titulo = textoBase.toUpperCase();
// Corta en límite de PALABRA (antes un slice a secas podía partir "NADIE" en "NAD")
if (titulo.length > 35) {
  titulo = titulo.slice(0, 35);
  const ultimoEspacio = titulo.lastIndexOf(" ");
  if (ultimoEspacio > 10) titulo = titulo.slice(0, ultimoEspacio);
}
const palabras = titulo.split(/\s+/).filter(Boolean);
const mitad = Math.ceil(palabras.length / 2);
const linea1 = palabras.slice(0, mitad).join(" ");
const linea2 = palabras.slice(mitad).join(" ");

// Fuente más grande que antes (62/78), pero si el texto es largo se reduce
// proporcionalmente para que NUNCA se salga del ancho de la imagen
let TAMANO_FUENTE = esShort ? 62 : 78;
const maxLineaChars = Math.max(linea1.length, linea2.length, 1);
const anchoEstimado = maxLineaChars * TAMANO_FUENTE * 0.62; // mayúsculas Arial Bold ≈0.62
const anchoMax = ANCHO - 60;
if (anchoEstimado > anchoMax) {
  TAMANO_FUENTE = Math.max(30, Math.floor((TAMANO_FUENTE * anchoMax) / anchoEstimado));
  console.log(`ℹ️  Texto largo (${maxLineaChars} chars): fuente reducida a ${TAMANO_FUENTE}px para que quepa`);
}

// Se dibuja UNA línea por drawtext (ver formato_textos.filtrosLineas).
// Antes se escribían las dos líneas juntas con un "\n" y ffmpeg dibujaba
// un cuadro (tofu) al final de la primera línea.
const lineas = [linea1, linea2].filter(Boolean);
const dibujo = F.filtrosLineas(lineas, {
  dir: path.join(BASE_DIR, "output"),
  nombre: "miniatura_texto",
  fontPath,
  fontSize: TAMANO_FUENTE,
  yTop: TEXTO_Y,
  lineSpacing: 15,
  color: "white",
  borderw: 3,
  bordercolor: "black@0.8",
});

const filtro = [
  `scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO}`,
  `drawbox=x=0:y=${CAJA_Y}:w=${ANCHO}:h=${CAJA_ALTO}:color=black@0.55:t=fill`,
  ...dibujo.filtros,
].join(",");

const cmd = `ffmpeg -y -i "${primeraImagen}" -vf "${filtro}" "${OUTPUT_PATH}"`;

try {
  execSync(cmd, { stdio: "pipe" });
  console.log(`✅ Miniatura generada: ${OUTPUT_PATH}`);
} catch (err) {
  console.error("❌ Error generando miniatura:", err.stderr ? err.stderr.toString() : err.message);
  console.error("   (esto no detiene el proceso, el video se sube igual sin miniatura personalizada)");
} finally {
  dibujo.archivos.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
}
