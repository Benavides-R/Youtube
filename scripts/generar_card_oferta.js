/**
 * generar_card_oferta.js
 * ------------------------------------------------------------
 * Genera tarjetas profesionales de oferta (imagen estática)
 * con producto centrado sobre fondo dinámico, precio con
 * descuento, badge y logo.
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

// Paleta profesional de fondos con acentos
const PALETA = [
  { fondo: "0x0f172a", acento: "0x3b82f6", glow: "0x1e40af" },
  { fondo: "0x1e293b", acento: "0x6366f1", glow: "0x4338ca" },
  { fondo: "0x0c1222", acento: "0x8b5cf6", glow: "0x6d28d9" },
  { fondo: "0x18181b", acento: "0xf59e0b", glow: "0xd97706" },
  { fondo: "0x1a1a2e", acento: "0x06b6d4", glow: "0x0891b2" },
  { fondo: "0x111827", acento: "0x10b981", glow: "0x059669" },
];

// ─── Helpers ──────────────────────────────────────────────

function envolverTexto(texto, maxChars = 30) {
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
  if (!txt) return null;
  const m = txt.match(/[\d.]+/);
  if (!m) return null;
  const num = m[0].replace(/\./g, "");
  if (parseInt(num) < 1000) return null;
  return m[0];
}

// Calcular precio original a partir del precio actual y el descuento
// Si el precio actual es 165.900 y el descuento es 30%, el original era ~237.000
function calcularPrecioOriginal(precioActual, descuentoPct) {
  if (!precioActual || !descuentoPct) return null;
  const numActual = parseInt(precioActual.replace(/\./g, ""));
  const original = Math.round(numActual / (1 - descuentoPct / 100));
  // Formatear con puntos como separador de miles
  return original.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function limpiarTemp(files) {
  files.forEach((f) => {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  });
}

function ejecutarFFmpeg(cmd) {
  execSync(cmd, { stdio: "pipe", timeout: 30000 });
}

// Verificar que la card generada no esté corrupta
function validarCard(cardPath) {
  if (!fs.existsSync(cardPath)) return false;
  const stats = fs.statSync(cardPath);
  if (stats.size < 10000) return false; // menor a 10KB = probablemente corrupta
  return true;
}

// ─── Generar una card ─────────────────────────────────────

function intentarGenerarCard(opts) {
  const { oferta, imagenPath, cardPath, paleta, tempFiles, fontPath } = opts;
  const { fondo, acento, glow } = paleta;

  const tituloCorto = oferta.titulo.slice(0, 55);
  const tituloEnvuelto = envolverTexto(tituloCorto, 26);
  const precio = extraerPrecio(oferta.precio || "");
  const tieneDescuento = !!oferta.descuento_pct && precio;

  fs.writeFileSync(tempFiles.titulo, tituloEnvuelto, "utf-8");

  const fontEsc = fontPath.replace(/:/g, "\\:");
  const tituloEsc = tempFiles.titulo.replace(/\\/g, "/").replace(/:/g, "\\:");

  const f = [];

  // 1. Fondo base oscuro
  f.push(`color=c=${fondo}:s=${ANCHO}x${ALTO}:d=1[base]`);

  // 2. Glow sutil centrado (rectángulo semitransparente)
  f.push(`color=c=${glow}:s=600x600:d=1,format=rgba,colorchannelmixer=aa=0.15[glow]`);
  f.push(`[base][glow]overlay=(W-w)/2:(H-h)/2-100[con_glow]`);

  // 3. Líneas decorativas sutiles
  f.push(`[con_glow]drawbox=x=50:y=250:w=100:h=2:color=${acento}@0.15:t=fill,
    drawbox=x=930:y=250:w=100:h=2:color=${acento}@0.15:t=fill,
    drawbox=x=50:y=1650:w=100:h=2:color=${acento}@0.15:t=fill,
    drawbox=x=930:y=1650:w=100:h=2:color=${acento}@0.15:t=fill[con_lineas]`);

  // 4. Producto GRANDE (750px = ~70% del ancho)
  f.push(`[1:v]scale=750:-1:force_original_aspect_ratio=decrease,
    pad=770:770:(ow-iw)/2:(oh-ih)/2:color=${fondo}[producto]`);

  // 5. Borde blanco alrededor del producto
  f.push(`[producto]drawbox=x=0:y=0:w=770:h=770:color=white@0.9:t=3[con_marco]`);

  // 6. Superponer producto centrado
  f.push(`[con_lineas][con_marco]overlay=(W-w)/2:320[con_producto]`);

  // 7. Badge rojo GRANDE
  f.push(`[con_producto]drawbox=x=240:y=80:w=600:h=80:color=0xdc2626:t=fill[con_badge_bg]`);
  f.push(`[con_badge_bg]drawtext=fontfile='${fontEsc}':text='OFERTA DEL DIA':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=93:borderw=2:bordercolor=black@0.3[con_badge]`);

  // 8. Nombre del producto centrado
  f.push(`[con_badge]drawtext=fontfile='${fontEsc}':textfile='${tituloEsc}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=1150:line_spacing=16:borderw=2:bordercolor=black@0.7[con_titulo]`);

  // 9. Bloque de precio
  if (tieneDescuento) {
    const precioOriginal = calcularPrecioOriginal(precio, oferta.descuento_pct);
    if (precioOriginal) {
      // Precio original tachado (gris) -- ffmpeg no tiene "strikethrough" real
      // en drawtext, se simula con una línea (drawbox) encima del texto.
      const textoTachado = `$${precioOriginal}`;
      const anchoLinea = Math.round(textoTachado.length * 42 * 0.56);
      f.push(`[con_titulo]drawtext=fontfile='${fontEsc}':text='${textoTachado}':fontcolor=0x6b7280:fontsize=42:x=(w-text_w)/2:y=1320[con_ptachado_txt]`);
      f.push(`[con_ptachado_txt]drawbox=x=(iw-${anchoLinea})/2:y=1320+21:w=${anchoLinea}:h=3:color=0x6b7280:t=fill[con_ptachado]`);
      // Precio con descuento (amarillo grande)
      f.push(`[con_ptachado]drawtext=fontfile='${fontEsc}':text='$${precio} (-${oferta.descuento_pct}\\%)':fontcolor=0xfbbf24:fontsize=64:x=(w-text_w)/2:y=1400:borderw=3:bordercolor=black@0.5[con_precio]`);
    } else {
      // Sin precio original calculable, solo mostrar precio actual
      f.push(`[con_titulo]drawtext=fontfile='${fontEsc}':text='$${precio} (-${oferta.descuento_pct}\\%)':fontcolor=0xfbbf24:fontsize=64:x=(w-text_w)/2:y=1360:borderw=3:bordercolor=black@0.5[con_precio]`);
    }
  } else if (precio) {
    f.push(`[con_titulo]drawtext=fontfile='${fontEsc}':text='$${precio}':fontcolor=0x22c55e:fontsize=80:x=(w-text_w)/2:y=1360:borderw=3:bordercolor=black@0.5[con_precio]`);
  } else {
    f.push(`[con_titulo]drawtext=fontfile='${fontEsc}':text='VER OFERTA':fontcolor=${acento}:fontsize=56:x=(w-text_w)/2:y=1380:borderw=2:bordercolor=black@0.4[con_precio]`);
  }

  // 10. Línea de acento
  f.push(`[con_precio]drawbox=x=290:y=1580:w=500:h=4:color=${acento}:t=fill[con_linea_final]`);

  // 11. CTA
  f.push(`[con_linea_final]drawtext=fontfile='${fontEsc}':text='Link en comentarios':fontcolor=white@0.8:fontsize=38:x=(w-text_w)/2:y=1620:borderw=1:bordercolor=black@0.3[con_cta]`);

  // 12. Logo centrado abajo
  let mapaFinal;
  if (fs.existsSync(LOGO_PATH)) {
    f.push(`[2:v]scale=200:-1[logo]`);
    f.push(`[con_cta][logo]overlay=(W-w)/2:H-h-40[salida]`);
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
  };

  const paletaBase = PALETA[indice % PALETA.length];

  for (let intento = 1; intento <= MAX_RETRIES; intento++) {
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

      // Validar que la card no esté corrupta
      if (!validarCard(cardPath)) {
        throw new Error("Card generada pero corrupta o muy pequeña");
      }

      console.log(`  ✅ card_${numeroImagen}.jpg — ${oferta.titulo.slice(0, 40)}...`);
      return cardPath;
    } catch (err) {
      const errMsg = err.stderr ? err.stderr.toString().slice(0, 150) : err.message;
      if (intento < MAX_RETRIES) {
        console.log(`  ⚠️  Intento ${intento}/${MAX_RETRIES} falló, reintentando...`);
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
    console.error("\n❌ No se generó ninguna card — no hay con qué armar el video");
    process.exit(1);
  }

  if (cardsGeneradas.length < ofertasConDatos.length) {
    console.log(`\n⚠️  Solo ${cardsGeneradas.length}/${ofertasConDatos.length} cards se generaron bien. Las demás fallaron.`);
  }

  fs.writeFileSync(
    path.join(BASE_DIR, "output", "cards_generadas.json"),
    JSON.stringify(cardsGeneradas, null, 2)
  );

  console.log(`\n✅ ${cardsGeneradas.length}/${ofertasConDatos.length} cards generadas en output/cards/`);
})();
