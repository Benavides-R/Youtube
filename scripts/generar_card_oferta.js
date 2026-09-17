/**
 * generar_card_oferta.js
 * ------------------------------------------------------------
 * Genera tarjetas profesionales de oferta (imagen estática)
 * con producto centrado sobre fondo de color sólido, precio
 * tachado → precio real, badge y logo.
 *
 * Formato: vertical 1080x1920 (Stories/Reels)
 *
 * Uso:
 *   node scripts/generar_card_oferta.js
 *
 * Requiere: obtener_ofertas.js primero
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_DIR = path.join(__dirname, "..");
const ELEGIDAS_PATH = path.join(BASE_DIR, "output", "elegidas.json");
const IMAGENES_DIR = path.join(BASE_DIR, "output", "imagenes");
const CARDS_DIR = path.join(BASE_DIR, "output", "cards");
const LOGO_PATH = path.join(BASE_DIR, "assets", "logo_ofertas.png");

const ANCHO = 1080;
const ALTO = 1920;
const MAX_RETRIES = 3;

// Paleta profesional de fondos
const PALETA = [
  { fondo: "0x0f172a", acento: "0x3b82f6", nombre: "slate-900/blue" },
  { fondo: "0x1e293b", acento: "0x6366f1", nombre: "slate-800/indigo" },
  { fondo: "0x0c1222", acento: "0x8b5cf6", nombre: "navy/violet" },
  { fondo: "0x18181b", acento: "0xf59e0b", nombre: "zinc-900/amber" },
  { fondo: "0x1a1a2e", acento: "0x06b6d4", nombre: "dark/cyan" },
  { fondo: "0x111827", acento: "0x10b981", nombre: "gray-900/emerald" },
];

// Extras visuales
const BORDE_GRADIENTE = "0x374151"; // borde sutil alrededor del producto
const SHADOW_COLOR = "black@0.4";

// ─── Helpers ──────────────────────────────────────────────

function envolverTexto(texto, maxChars = 28) {
  const palabras = texto.split(" ");
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const candidata = actual ? `${actual} ${p}` : p;
    if (candidata.length > maxChars && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.join("\n");
}

function extraerPrecio(txt) {
  const m = txt.match(/[\d.]+/);
  return m ? m[0] : txt;
}

function limpiarTemp(files) {
  files.forEach((f) => {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  });
}

function ejecutarFFmpeg(cmd) {
  execSync(cmd, { stdio: "pipe", timeout: 30000 });
}

// ─── Generar una card ─────────────────────────────────────

function intentarGenerarCard(opts) {
  const { oferta, imagenPath, cardPath, paleta, tempFiles, fontPath } = opts;
  const { fondo, acento } = paleta;

  const tituloCorto = oferta.titulo.slice(0, 50);
  const tituloEnvuelto = envolverTexto(tituloCorto, 28);
  const precioOriginal = extraerPrecio(oferta.precio || "");
  const tieneDescuento = !!oferta.descuento_pct;
  const descuento = tieneDescuento ? `-${oferta.descuento_pct}\\%` : "";

  // Escribir textos temporales
  fs.writeFileSync(tempFiles.titulo, tituloEnvuelto, "utf-8");
  fs.writeFileSync(tempFiles.precio, `$${precioOriginal}`, "utf-8");

  const fontEsc = fontPath.replace(/:/g, "\\:");
  const tituloEsc = tempFiles.titulo.replace(/\\/g, "/").replace(/:/g, "\\:");
  const precioEsc = tempFiles.precio.replace(/\\/g, "/").replace(/:/g, "\\:");

  // ── Filtros FFmpeg ──
  const f = [];

  // 1. Fondo sólido
  f.push(`color=c=${fondo}:s=${ANCHO}x${ALTO}:d=1[base]`);

  // 2. Producto centrado (contain, sin estirar)
  f.push(`[1:v]scale=580:-1:force_original_aspect_ratio=decrease,
    pad=600:600:(ow-iw)/2:(oh-ih)/2:color=${fondo}[producto]`);

  // 3. Superponer producto directo sobre el fondo
  f.push(`[base][producto]overlay=(W-w)/2:390[con_producto]`);

  // 5. Badge rojo "OFERTA DEL DÍA"
  f.push(`[con_producto]drawbox=x=290:y=100:w=500:h=65:color=0xdc2626:t=fill[con_badge_bg]`);
  f.push(`[con_badge_bg]drawtext=fontfile='${fontEsc}':text='OFERTA DEL DIA':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=110:borderw=1:bordercolor=black@0.2[con_badge]`);

  // 6. Línea decorativa debajo del badge
  f.push(`[con_badge]drawbox=x=340:y=190:w=400:h=3:color=${acento}:t=fill[con_linea]`);

  // 7. Nombre del producto
  f.push(`[con_linea]drawtext=fontfile='${fontEsc}':textfile='${tituloEsc}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1080:line_spacing=14:borderw=2:bordercolor=black@0.6[con_titulo]`);

  // 8. Precios
  if (tieneDescuento) {
    // Precio tachado: ffmpeg no tiene "strikethrough" real en drawtext, se
    // simula dibujando una línea (drawbox) encima del texto, con un ancho
    // estimado a partir del número de caracteres (no es exacto al pixel,
    // pero se ve bien y es mucho más simple que medir la fuente real).
    const textoPrecioTachado = `$${precioOriginal}`;
    const anchoLineaTachado = Math.round(textoPrecioTachado.length * 50 * 0.56);
    f.push(`[con_titulo]drawtext=fontfile='${fontEsc}':text='${textoPrecioTachado}':fontcolor=0x6b7280:fontsize=50:x=(w-text_w)/2:y=1280[con_ptachado_txt]`);
    f.push(`[con_ptachado_txt]drawbox=x=(iw-${anchoLineaTachado})/2:y=1280+25:w=${anchoLineaTachado}:h=4:color=0x6b7280:t=fill[con_ptachado]`);
    // Descuento (rojo grande)
    f.push(`[con_ptachado]drawtext=fontfile='${fontEsc}':text='${descuento}':fontcolor=0xef4444:fontsize=72:x=(w-text_w)/2:y=1360:borderw=3:bordercolor=black@0.4[con_precio]`);
  } else {
    // Solo precio real (verde grande)
    f.push(`[con_titulo]drawtext=fontfile='${fontEsc}':textfile='${precioEsc}':fontcolor=0x22c55e:fontsize=80:x=(w-text_w)/2:y=1320:borderw=3:bordercolor=black@0.4[con_precio]`);
  }

  // 9. Línea decorativa inferior
  f.push(`[con_precio]drawbox=x=340:y=1500:w=400:h=3:color=${acento}:t=fill[con_linea2]`);

  // 10. CTA
  f.push(`[con_linea2]drawtext=fontfile='${fontEsc}':text='Link en comentarios':fontcolor=white@0.7:fontsize=34:x=(w-text_w)/2:y=1540:borderw=1:bordercolor=black@0.3[con_cta]`);

  // 11. Logo (opcional)
  let mapaFinal;
  if (fs.existsSync(LOGO_PATH)) {
    f.push(`[2:v]scale=160:-1[logo]`);
    f.push(`[con_cta][logo]overlay=W-w-25:H-h-25[salida]`);
    mapaFinal = "[salida]";
  } else {
    mapaFinal = "[con_cta]";
  }

  const filtroFinal = f.join(",");
  const inputs = fs.existsSync(LOGO_PATH)
    ? `-i "${imagenPath}" -i "${LOGO_PATH}"`
    : `-i "${imagenPath}"`;

  const cmd = `ffmpeg -y -f lavfi -i "color=c=${fondo}:s=${ANCHO}x${ALTO}:d=1" ${inputs} -filter_complex "${filtroFinal}" -map "${mapaFinal}" -frames:v 1 "${cardPath}"`;

  ejecutarFFmpeg(cmd);
}

// ─── Flujo principal ──────────────────────────────────────

async function generarCardOferta(oferta, indice, total) {
  const numeroImagen = String(indice + 1).padStart(2, "0");
  const imagenPath = path.join(IMAGENES_DIR, `escena_${numeroImagen}.jpg`);
  const cardPath = path.join(CARDS_DIR, `card_${numeroImagen}.jpg`);

  if (!fs.existsSync(imagenPath)) {
    console.error(`  ⚠️  No existe escena_${numeroImagen}.jpg, saltando...`);
    return null;
  }

  const fontPath = process.platform === "win32"
    ? "C:/Windows/Fonts/arial.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

  const tempFiles = {
    titulo: path.join(BASE_DIR, "output", `_card_titulo_${numeroImagen}.txt`),
    precio: path.join(BASE_DIR, "output", `_card_precio_${numeroImagen}.txt`),
  };

  // Rotar paleta por índice para variar entre cards
  const paletaBase = PALETA[indice % PALETA.length];

  for (let intento = 1; intento <= MAX_RETRIES; intento++) {
    // En reintentos, rotar a siguiente paleta
    const paleta = intento === 1
      ? paletaBase
      : PALETA[(indice + intento) % PALETA.length];

    try {
      limpiarTemp(Object.values(tempFiles));

      intentarGenerarCard({
        oferta,
        imagenPath,
        cardPath,
        paleta,
        tempFiles,
        fontPath,
      });

      console.log(`  ✅ card_${numeroImagen}.jpg — ${oferta.titulo.slice(0, 40)}...`);
      return cardPath;
    } catch (err) {
      const errMsg = err.stderr ? err.stderr.toString().slice(0, 150) : err.message;
      if (intento < MAX_RETRIES) {
        console.log(`  ⚠️  Intento ${intento}/${MAX_RETRIES} falló, reintentando con otro color...`);
      } else {
        console.error(`  ❌ Card ${numeroImagen} falló tras ${MAX_RETRIES} intentos: ${errMsg}`);
      }
    } finally {
      limpiarTemp(Object.values(tempFiles));
    }
  }

  return null;
}

// ─── Main ─────────────────────────────────────────────────

(async () => {
  console.log("🖼️  Generando cards de ofertas...\n");

  if (!fs.existsSync(ELEGIDAS_PATH)) {
    console.error("❌ No existe output/elegidas.json. Corre primero obtener_ofertas.js");
    process.exit(1);
  }

  const elegidas = JSON.parse(fs.readFileSync(ELEGIDAS_PATH, "utf-8"));
  const OFERTAS_JSON_URL = process.env.OFERTAS_JSON_URL;

  if (!OFERTAS_JSON_URL) {
    console.error("❌ Falta OFERTAS_JSON_URL");
    process.exit(1);
  }

  const respuesta = await fetch(OFERTAS_JSON_URL);
  if (!respuesta.ok) {
    console.error(`❌ No se pudo descargar seleccion_video.json (HTTP ${respuesta.status})`);
    process.exit(1);
  }
  const todasLasOfertas = await respuesta.json();
  const linksSet = new Set(elegidas);
  const ofertasConDatos = todasLasOfertas.filter((o) => linksSet.has(o.link));

  if (ofertasConDatos.length === 0) {
    console.error("❌ No se encontraron datos de las ofertas elegidas");
    process.exit(1);
  }

  console.log(`📋 ${ofertasConDatos.length} ofertas para generar cards\n`);

  fs.mkdirSync(CARDS_DIR, { recursive: true });

  const cardsGeneradas = [];
  for (let i = 0; i < ofertasConDatos.length; i++) {
    const card = await generarCardOferta(ofertasConDatos[i], i, ofertasConDatos.length);
    if (card) cardsGeneradas.push(card);
  }

  if (cardsGeneradas.length === 0) {
    console.error("\n❌ No se generó ninguna card");
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(BASE_DIR, "output", "cards_generadas.json"),
    JSON.stringify(cardsGeneradas, null, 2)
  );

  console.log(`\n✅ ${cardsGeneradas.length}/${ofertasConDatos.length} cards generadas en output/cards/`);
})();
