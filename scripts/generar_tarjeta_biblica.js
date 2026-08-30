/**
 * generar_tarjeta_biblica.js
 * ------------------------------------------------------------
 * Lee output/cita.json, busca una foto de fondo atmosférica en
 * Pexels, y le escribe encima el versículo + referencia con
 * FFmpeg. Si existe assets/logo.png, lo agrega en una esquina.
 *
 * Uso:
 *   PEXELS_API_KEY=xxx node scripts/generar_tarjeta_biblica.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const BASE_DIR = path.join(__dirname, "..");
const CITA_PATH = path.join(BASE_DIR, "output", "cita.json");
const FONDO_PATH = path.join(BASE_DIR, "output", "fondo_tarjeta.jpg");
const OUTPUT_PATH = path.join(BASE_DIR, "output", "tarjeta_final.jpg");
const LOGO_PATH = path.join(BASE_DIR, "assets", "logo.png");
const TEXTO_TEMP_PATH = path.join(BASE_DIR, "output", "_tarjeta_texto.txt");
const REF_TEMP_PATH = path.join(BASE_DIR, "output", "_tarjeta_ref.txt");

if (!PEXELS_API_KEY) {
  console.error("❌ Falta PEXELS_API_KEY");
  process.exit(1);
}
if (!fs.existsSync(CITA_PATH)) {
  console.error("❌ No existe output/cita.json. Corre primero generar_cita_biblica.js");
  process.exit(1);
}

const cita = JSON.parse(fs.readFileSync(CITA_PATH, "utf-8"));
const ANCHO = 1080;
const ALTO = 1350; // formato 4:5, buen rendimiento en Facebook/Instagram

// ------------------------------------------------------------
// 1. Buscar y descargar una foto de fondo (vertical)
// ------------------------------------------------------------
async function buscarYDescargarFondo() {
  const query = cita.palabras_clave_imagen[0];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait`;
  const response = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  const data = await response.json();

  if (!data.photos || data.photos.length === 0) {
    throw new Error(`Pexels no encontró fotos para "${query}"`);
  }

  const foto = data.photos[Math.floor(Math.random() * data.photos.length)];
  const imgResponse = await fetch(foto.src.large2x);
  const buffer = Buffer.from(await imgResponse.arrayBuffer());
  fs.writeFileSync(FONDO_PATH, buffer);
}

// ------------------------------------------------------------
// 2. Envolver el texto del versículo en varias líneas (a mano,
// simple, para que quepa bien en la tarjeta)
// ------------------------------------------------------------
function envolverTexto(texto, palabrasPorLinea) {
  const palabras = texto.split(" ");
  const lineas = [];
  for (let i = 0; i < palabras.length; i += palabrasPorLinea) {
    lineas.push(palabras.slice(i, i + palabrasPorLinea).join(" "));
  }
  return lineas.join("\n");
}

// ------------------------------------------------------------
// 3. Armar la tarjeta con FFmpeg
// ------------------------------------------------------------
(async () => {
  try {
    console.log("🖼️  Buscando imagen de fondo...");
    await buscarYDescargarFondo();

    const fontPath =
      process.platform === "win32" ? "C:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const fontPathEscapado = fontPath.replace(/:/g, "\\:");

    const versoTexto = envolverTexto(`"${cita.verso}"`, 5);
    fs.writeFileSync(TEXTO_TEMP_PATH, versoTexto, "utf-8");
    const versoPathEscapado = TEXTO_TEMP_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");

    fs.writeFileSync(REF_TEMP_PATH, `— ${cita.referencia}`, "utf-8");
    const refPathEscapado = REF_TEMP_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");

    let filtro = [
      `scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO}`,
      `drawbox=x=0:y=0:w=${ANCHO}:h=${ALTO}:color=black@0.35:t=fill`, // oscurece un poco el fondo para que el texto resalte
      `drawtext=fontfile='${fontPathEscapado}':textfile='${versoPathEscapado}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2-60:line_spacing=20:borderw=2:bordercolor=black@0.6`,
      `drawtext=fontfile='${fontPathEscapado}':textfile='${refPathEscapado}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=(h/2)+180:borderw=2:bordercolor=black@0.6`,
    ];

    let inputs = `-i "${FONDO_PATH}"`;
    let mapaFinal = "[base]";

    if (fs.existsSync(LOGO_PATH)) {
      inputs += ` -i "${LOGO_PATH}"`;
      // Filtro combinado: primero el texto sobre el fondo, luego el logo encima en la esquina inferior derecha
      const filtroTexto = filtro.join(",");
      const cmd = `ffmpeg -y ${inputs} -filter_complex "[0:v]${filtroTexto}[base];[1:v]scale=140:-1[logo];[base][logo]overlay=W-w-30:H-h-30" "${OUTPUT_PATH}"`;
      execSync(cmd, { stdio: "pipe" });
    } else {
      const cmd = `ffmpeg -y ${inputs} -vf "${filtro.join(",")}" "${OUTPUT_PATH}"`;
      execSync(cmd, { stdio: "pipe" });
      console.log("ℹ️  No se encontró assets/logo.png — tarjeta generada sin logo (opcional)");
    }

    console.log(`✅ Tarjeta generada: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error("❌ Error generando la tarjeta:", err.stderr ? err.stderr.toString() : err.message);
    process.exit(1);
  } finally {
    [TEXTO_TEMP_PATH, REF_TEMP_PATH].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
  }
})();
