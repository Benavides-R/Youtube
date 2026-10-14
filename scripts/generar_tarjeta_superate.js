/**
 * generar_tarjeta_superate.js
 * ------------------------------------------------------------
 * Lee output/frase.json, busca una foto de fondo atmosférica
 * en Pexels, y escribe la frase + autor encima con FFmpeg.
 * Si existe assets/logo_superate.png, lo agrega en una esquina
 * (si no, usa assets/logo.png como respaldo, o sin logo).
 *
 * Uso:
 *   PEXELS_API_KEY=xxx node scripts/generar_tarjeta_superate.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const BASE_DIR = path.join(__dirname, "..");
const FRASE_PATH = path.join(BASE_DIR, "output", "frase.json");
const FONDO_PATH = path.join(BASE_DIR, "output", "fondo_superate.jpg");
const OUTPUT_PATH = path.join(BASE_DIR, "output", "tarjeta_superate.jpg");
const TEXTO_TEMP_PATH = path.join(BASE_DIR, "output", "_superate_texto.txt");
const AUTOR_TEMP_PATH = path.join(BASE_DIR, "output", "_superate_autor.txt");

// Logo específico de Superate o respaldo al genérico
const LOGO_PATH = fs.existsSync(path.join(BASE_DIR, "assets", "logo_superate.png"))
  ? path.join(BASE_DIR, "assets", "logo_superate.png")
  : path.join(BASE_DIR, "assets", "logo.png");

if (!PEXELS_API_KEY) { console.error("❌ Falta PEXELS_API_KEY"); process.exit(1); }
if (!fs.existsSync(FRASE_PATH)) { console.error("❌ No existe output/frase.json. Corre primero generar_frase_motivacional.js"); process.exit(1); }

const frase = JSON.parse(fs.readFileSync(FRASE_PATH, "utf-8"));

const ANCHO = 1080;
const ALTO = 1350; // formato 4:5, buen rendimiento en Facebook/Instagram

async function buscarYDescargarFondo() {
  const opciones = frase.palabras_clave_imagen;
  const query = opciones[Math.floor(Math.random() * opciones.length)];
  const paginaAlAzar = Math.floor(Math.random() * 5) + 1;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait&page=${paginaAlAzar}`;
  const response = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  const data = await response.json();

  if (!data.photos || data.photos.length === 0) throw new Error(`Pexels no encontró fotos para "${query}"`);

  const foto = data.photos[Math.floor(Math.random() * data.photos.length)];
  const imgResponse = await fetch(foto.src.large2x);
  const buffer = Buffer.from(await imgResponse.arrayBuffer());
  fs.writeFileSync(FONDO_PATH, buffer);
  console.log(`  🖼️  Fondo: "${query}" (pág ${paginaAlAzar})`);
}

function envolverTexto(texto, caracteresPorLinea = 26) {
  const palabras = texto.split(" ");
  const lineas = [];
  let lineaActual = "";
  for (const palabra of palabras) {
    const candidata = lineaActual ? `${lineaActual} ${palabra}` : palabra;
    if (candidata.length > caracteresPorLinea && lineaActual) {
      lineas.push(lineaActual);
      lineaActual = palabra;
    } else {
      lineaActual = candidata;
    }
  }
  if (lineaActual) lineas.push(lineaActual);
  return lineas.join("\n");
}

(async () => {
  try {
    console.log("🖼️  Buscando imagen de fondo...");
    await buscarYDescargarFondo();

    const isWin = process.platform === "win32";
    const fontPath = isWin ? "C:/Windows/Fonts/arialbd.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const fontPathEsc = fontPath.replace(/:/g, "\\:");

    // Bebas Neue (assets/fonts) para el autor: look editorial en mayúsculas
    const fontAutorPath = path.join(BASE_DIR, "assets", "fonts", "BebasNeue-Regular.ttf");
    const fontAutorUsado = fs.existsSync(fontAutorPath) ? fontAutorPath : fontPath;
    const fontAutorEsc = fontAutorUsado.replace(/\\/g, "/").replace(/:/g, "\\:");
    const ACENTO = "0xD4AF37"; // mismo dorado que la tarjeta bíblica

    // Frase entre comillas decorativas (curvas), respetando sin_comillas
    const textoFrase = envolverTexto(frase.sin_comillas ? frase.frase : `\u201C${frase.frase}\u201D`, 26);
    fs.writeFileSync(TEXTO_TEMP_PATH, textoFrase, "utf-8");
    const textoEsc = TEXTO_TEMP_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");

    // Autor sin guion: la barra de acento lo separa de la frase
    fs.writeFileSync(AUTOR_TEMP_PATH, `${frase.autor}`, "utf-8");
    const autorEsc = AUTOR_TEMP_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");

    const hayLogo = fs.existsSync(LOGO_PATH);
    const inputs = hayLogo ? `-i "${FONDO_PATH}" -i "${LOGO_PATH}"` : `-i "${FONDO_PATH}"`;

    // El autor va justo debajo de la frase -- se calcula en JS según
    // cuántas líneas ocupó la frase, para que no se encimen con frases
    // largas ni queden muy separados con frases cortas.
    const FONTSIZE_FRASE = 52, LINE_SPACING_FRASE = 18, MARGEN_AUTOR = 72;
    const numLineasFrase = textoFrase.split("\n").length;
    const altoFraseEstimado = numLineasFrase * FONTSIZE_FRASE + (numLineasFrase - 1) * LINE_SPACING_FRASE;
    const yFraseTop = (ALTO - altoFraseEstimado) / 2 - 70;
    const yAutor = Math.min(Math.round(yFraseTop + altoFraseEstimado + MARGEN_AUTOR), ALTO - 140);
    const yBarra = yAutor - 46;
    const xBarra = Math.round((ANCHO - 120) / 2); // posición fija (evita paréntesis en drawbox)

    const filtroBase = [
      `scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO}`,
      `gblur=sigma=6`,                          // desenfoque suave: el texto resalta sobre la foto
      `vignette=PI/4.5`,                        // oscurece los bordes (enfoque en el centro)
      `drawbox=x=0:y=0:w=${ANCHO}:h=${ALTO}:color=black@0.42:t=fill`,
      `drawtext=fontfile='${fontPathEsc}':textfile='${textoEsc}':fontcolor=white:fontsize=${FONTSIZE_FRASE}:x=max(60\\, (w-text_w)/2):y=(h-text_h)/2-70:line_spacing=${LINE_SPACING_FRASE}:borderw=2:bordercolor=black@0.55:expansion=none`,
      `drawbox=x=${xBarra}:y=${yBarra}:w=120:h=4:color=${ACENTO}@0.95:t=fill`,
      `drawtext=fontfile='${fontAutorEsc}':textfile='${autorEsc}':fontcolor=${ACENTO}:fontsize=40:x=(w-text_w)/2:y=${yAutor}:expansion=none`,
    ].join(",");

    let cmd;
    if (hayLogo) {
      cmd = `ffmpeg -y ${inputs} -filter_complex "[0:v]${filtroBase}[base];[1:v]scale=180:-1[logo];[base][logo]overlay=W-w-25:H-h-25" "${OUTPUT_PATH}"`;
    } else {
      cmd = `ffmpeg -y ${inputs} -vf "${filtroBase}" "${OUTPUT_PATH}"`;
    }

    execSync(cmd, { stdio: "pipe" });
    console.log(`✅ Tarjeta generada: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error("❌ Error:", err.stderr ? err.stderr.toString() : err.message);
    process.exit(1);
  } finally {
    [TEXTO_TEMP_PATH, AUTOR_TEMP_PATH].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
  }
})();
