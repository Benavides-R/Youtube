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

function envolverTexto(texto, palabrasPorLinea) {
  const palabras = texto.split(" ");
  const lineas = [];
  for (let i = 0; i < palabras.length; i += palabrasPorLinea) {
    lineas.push(palabras.slice(i, i + palabrasPorLinea).join(" "));
  }
  return lineas.join("\n");
}

(async () => {
  try {
    console.log("🖼️  Buscando imagen de fondo...");
    await buscarYDescargarFondo();

    const isWin = process.platform === "win32";
    const fontPath = isWin ? "C:/Windows/Fonts/arialbd.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const fontPathEsc = fontPath.replace(/:/g, "\\:");

    // Frase entre comillas decorativas
    const textoFrase = envolverTexto(`"${frase.frase}"`, 5);
    fs.writeFileSync(TEXTO_TEMP_PATH, textoFrase, "utf-8");
    const textoEsc = TEXTO_TEMP_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");

    // Autor abajo
    fs.writeFileSync(AUTOR_TEMP_PATH, `— ${frase.autor}`, "utf-8");
    const autorEsc = AUTOR_TEMP_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");

    const hayLogo = fs.existsSync(LOGO_PATH);
    const inputs = hayLogo ? `-i "${FONDO_PATH}" -i "${LOGO_PATH}"` : `-i "${FONDO_PATH}"`;

    const filtroBase = [
      `scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO}`,
      `drawbox=x=0:y=0:w=${ANCHO}:h=${ALTO}:color=black@0.40:t=fill`,
      `drawtext=fontfile='${fontPathEsc}':textfile='${textoEsc}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2-70:line_spacing=18:borderw=2:bordercolor=black@0.7`,
      `drawtext=fontfile='${fontPathEsc}':textfile='${autorEsc}':fontcolor=#f0c060:fontsize=34:x=(w-text_w)/2:y=(h/2)+160:borderw=2:bordercolor=black@0.7`,
    ].join(",");

    let cmd;
    if (hayLogo) {
      cmd = `ffmpeg -y ${inputs} -filter_complex "[0:v]${filtroBase}[base];[1:v]scale=130:-1[logo];[base][logo]overlay=W-w-25:H-h-25" "${OUTPUT_PATH}"`;
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
