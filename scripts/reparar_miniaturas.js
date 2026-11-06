/**
 * reparar_miniaturas.js
 * ------------------------------------------------------------
 * Regenera miniaturas ya publicadas que quedaron con el cuadro
 * (tofu) que ffmpeg dibujaba al final de cada línea.
 *
 * No necesita el proyecto original: descarga la miniatura pública
 * del video, borra la zona del texto con un desenfoque y vuelve a
 * dibujar el texto limpio con UNA drawtext por línea (sin "\n").
 *
 * Uso:
 *   node scripts/reparar_miniaturas.js --canal biblia
 *   node scripts/reparar_miniaturas.js --canal superate
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const F = require("./formato_textos");

const BASE_DIR = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(BASE_DIR, "config", "reparar_publicados.json");
const OUT_DIR = path.join(BASE_DIR, "output", "reparaciones");
const ORIGINALES_DIR = path.join(OUT_DIR, "_originales");
const FONT_PATH =
  process.platform === "win32"
    ? "C:/Windows/Fonts/arialbd.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i !== -1) return process.argv[i + 1];
  const conIgual = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return conIgual ? conIgual.split("=").slice(1).join("=") : null;
}

const canal = arg("canal");
if (!canal) {
  console.error("❌ Falta --canal (biblia o superate)");
  process.exit(1);
}
if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`❌ No existe ${MANIFEST_PATH}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
const casos = (manifest.miniaturas || []).filter((m) => m.canal === canal);
if (casos.length === 0) {
  console.log(`ℹ️  No hay miniaturas por reparar para el canal ${canal}`);
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(ORIGINALES_DIR, { recursive: true });

async function descargar(url, destino) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${res.status})`);
  fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
}

(async () => {
  const fallos = [];
  for (const caso of casos) {
    const { video_id: videoId, texto, vertical } = caso;
    if (!videoId || !texto) {
      console.error(`⚠️  Entrada incompleta en el manifiesto: ${JSON.stringify(caso)}`);
      fallos.push(videoId || "(sin id)");
      continue;
    }

    const original = path.join(ORIGINALES_DIR, `${videoId}.jpg`);
    const salida = path.join(OUT_DIR, `${videoId}.jpg`);
    const textoLimpio = F.limpiarParaDibujo(texto);
    if (!textoLimpio) {
      console.error(`⚠️  ${videoId}: el texto quedó vacío después de limpiarlo`);
      fallos.push(videoId);
      continue;
    }

    let archivosTexto = [];
    try {
      if (!fs.existsSync(original)) {
        await descargar(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, original);
      }

      const ANCHO = vertical ? 720 : 1280;
      const ALTO = vertical ? 1280 : 720;
      const CAJA_Y = vertical ? Math.round(ALTO * 0.68) : 470;
      const CAJA_ALTO = vertical ? Math.round(ALTO * 0.22) : 250;
      const TEXTO_Y = CAJA_Y + Math.round(CAJA_ALTO * 0.15);

      const palabras = textoLimpio.toUpperCase().split(/\s+/).filter(Boolean);
      const mitad = Math.ceil(palabras.length / 2);
      const linea1 = palabras.slice(0, mitad).join(" ");
      const linea2 = palabras.slice(mitad).join(" ");

      // La miniatura vertical se publica dentro de un lienzo 16:9 con barras
      // negras: se recorta el centro (9:16) y se escala de vuelta a 720x1280.
      const base = vertical
        ? `crop=405:720:437:0,scale=${ANCHO}:${ALTO}`
        : `scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO}`;

      let fuente = vertical ? 62 : 78;
      const maxChars = Math.max(linea1.length, linea2.length, 1);
      const anchoEstimado = maxChars * fuente * 0.62;
      const anchoMax = ANCHO - 60;
      if (anchoEstimado > anchoMax) {
        fuente = Math.max(30, Math.floor((fuente * anchoMax) / anchoEstimado));
      }

      // Una drawtext por línea: con "\n" ffmpeg dibuja un cuadro al final.
      const dibujo = F.filtrosLineas([linea1, linea2].filter(Boolean), {
        dir: OUT_DIR,
        nombre: `${videoId}_texto`,
        fontPath: FONT_PATH,
        fontSize: fuente,
        yTop: TEXTO_Y,
        lineSpacing: 15,
        color: "white",
        borderw: 3,
        bordercolor: "black@0.8",
      });
      archivosTexto = dibujo.archivos;

      const filtro = [
        `[0:v]${base}[b]`,
        `[b]split[limpia][parabla]`,
        `[parabla]crop=${ANCHO}:${CAJA_ALTO}:0:${CAJA_Y},boxblur=24:2[borrosa]`,
        `[limpia][borrosa]overlay=0:${CAJA_Y}[fondo]`,
        `[fondo]drawbox=x=0:y=${CAJA_Y}:w=${ANCHO}:h=${CAJA_ALTO}:color=black@0.55:t=fill` +
          dibujo.filtros.map((f) => `,${f}`).join("") + "[out]",
      ].join(";");

      execFileSync("ffmpeg", [
        "-y",
        "-i", original,
        "-filter_complex", filtro,
        "-map", "[out]",
        "-frames:v", "1",
        "-q:v", "2",
        salida,
      ], { stdio: "pipe" });

      console.log(`✅ ${videoId} -> ${salida}`);
    } catch (err) {
      console.error(`❌ ${videoId}: ${err.message}`);
      fallos.push(videoId);
    } finally {
      archivosTexto.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    }
  }

  if (fallos.length) {
    console.error(`\n❌ ${fallos.length} miniatura(s) no se pudieron reparar: ${fallos.join(", ")}`);
    process.exit(1);
  }
  console.log(`\n✅ ${casos.length} miniatura(s) reparadas en ${OUT_DIR}`);
})();
