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

function envolverTexto(texto, maxChars = 30, maxLineas = 2) {
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

  if (lineas.length > maxLineas) {
    const limitadas = lineas.slice(0, maxLineas);
    let ultima = limitadas[maxLineas - 1];
    if (ultima.length > maxChars - 3) ultima = ultima.slice(0, maxChars - 3);
    limitadas[maxLineas - 1] = ultima.replace(/\s+$/, "") + "...";
    return limitadas.join("\n");
  }
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
  if (!precioActual || !descuentoPct || descuentoPct < 5 || descuentoPct > 85) return null;
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

  const tituloCorto = oferta.titulo.slice(0, 44);
  const tituloEnvuelto = envolverTexto(tituloCorto, 22); // máx. 2 líneas garantizado
  const precio = extraerPrecio(oferta.precio || "");
  const tieneDescuento = !!oferta.descuento_pct && precio;

  fs.writeFileSync(tempFiles.titulo, tituloEnvuelto, "utf-8");

  const fontEsc = fontPath.replace(/:/g, "\\:");
  const tituloEsc = tempFiles.titulo.replace(/\\/g, "/").replace(/:/g, "\\:");

  const f = [];

  // 1. Fondo base oscuro
  f.push(`color=c=${fondo}:s=${ANCHO}x${ALTO}:d=1[base]`);

  // 2. Glow real detrás del producto (caja de color + desenfoque gaussiano
  // fuerte = efecto de luz radial suave, mucho más premium que un
  // rectángulo translúcido plano)
  f.push(`color=c=${glow}:s=680x680:d=1,format=rgba,colorchannelmixer=aa=0.5,gblur=sigma=60[glow]`);
  f.push(`[base][glow]overlay=(W-w)/2:220[con_glow]`);

  // 3. Esquinas tipo "premium/tech" (marcas en L en las 4 esquinas de la
  // zona del producto, look de visor/scanner en vez de líneas planas)
  const gx1 = 80, gx2 = 920, gy1 = 260, gy2 = 1140, largo = 60, grosor = 4;
  f.push(`[con_glow]drawbox=x=${gx1}:y=${gy1}:w=${largo}:h=${grosor}:color=${acento}:t=fill,
    drawbox=x=${gx1}:y=${gy1}:w=${grosor}:h=${largo}:color=${acento}:t=fill,
    drawbox=x=${gx2 - largo}:y=${gy1}:w=${largo}:h=${grosor}:color=${acento}:t=fill,
    drawbox=x=${gx2 - grosor}:y=${gy1}:w=${grosor}:h=${largo}:color=${acento}:t=fill,
    drawbox=x=${gx1}:y=${gy2}:w=${largo}:h=${grosor}:color=${acento}:t=fill,
    drawbox=x=${gx1}:y=${gy2 - largo}:w=${grosor}:h=${largo}:color=${acento}:t=fill,
    drawbox=x=${gx2 - largo}:y=${gy2}:w=${largo}:h=${grosor}:color=${acento}:t=fill,
    drawbox=x=${gx2 - grosor}:y=${gy2 - largo}:w=${grosor}:h=${largo}:color=${acento}:t=fill[con_esquinas]`);

  // 4. Producto GRANDE (820px = ~76% del ancho del canvas)
  f.push(`[1:v]format=rgba,scale=800:-1:force_original_aspect_ratio=decrease,
    pad=820:820:(ow-iw)/2:(oh-ih)/2:color=${fondo}[producto]`);

  // 5. Borde blanco alrededor del producto
  f.push(`[producto]drawbox=x=0:y=0:w=820:h=820:color=white@0.9:t=3[con_marco]`);

  // 6. Superponer producto centrado
  f.push(`[con_esquinas][con_marco]overlay=(W-w)/2:280[con_producto]`);

  // 7. Badge rojo GRANDE
  f.push(`[con_producto]drawbox=x=210:y=70:w=660:h=90:color=0xdc2626:t=fill[con_badge_bg]`);
  f.push(`[con_badge_bg]drawtext=fontfile='${fontEsc}':text='OFERTA DEL DIA':fontcolor=white:fontsize=58:x=(w-text_w)/2:y=88:borderw=2:bordercolor=black@0.3[con_badge]`);

  // 8. Nombre del producto centrado (máx. 2 líneas garantizado arriba)
  f.push(`[con_badge]drawtext=fontfile='${fontEsc}':textfile='${tituloEsc}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=1130:line_spacing=14:borderw=2:bordercolor=black@0.7[con_titulo]`);

  // 9. Bloque de precio -- fondo blanco, letras negras (mismo estilo del
  // badge rojo del título), solo el precio final, sin tachado
  const FONTSIZE_PRECIO = 72;
  if (tieneDescuento || precio) {
    const rutaDescuento = tempFiles.descuento.replace(/\\/g, "/").replace(/:/g, "\\:");
    if (tieneDescuento) fs.writeFileSync(tempFiles.descuento, `-${oferta.descuento_pct}\\%`, "utf-8");
    const rutaPrecio = tempFiles.precio.replace(/\\/g, "/").replace(/:/g, "\\:");
    fs.writeFileSync(tempFiles.precio, `$${precio}`, "utf-8");
    const textoPrecio = `$${precio}`;
    const anchoBadge = Math.round(textoPrecio.length * FONTSIZE_PRECIO * 0.62) + 60;
    f.push(`[con_titulo]drawbox=x=(iw-${anchoBadge})/2:y=1305:w=${anchoBadge}:h=110:color=white:t=fill[con_precio_bg]`);
    f.push(`[con_precio_bg]drawtext=fontfile='${fontEsc}':textfile='${rutaPrecio}':fontcolor=black:fontsize=${FONTSIZE_PRECIO}:x=(w-text_w)/2:y=1330[con_precio]`);
    let salidaPrecio = "con_precio";
    if (tieneDescuento) {
      // Etiqueta roja de descuento en la esquina de la foto -- más grande
      f.push(`[con_precio]drawbox=x=${gx1 - 15}:y=${gy1 + 25}:w=165:h=85:color=0xdc2626:t=fill[con_badge2_bg]`);
      f.push(`[con_badge2_bg]drawtext=fontfile='${fontEsc}':textfile='${rutaDescuento}':fontcolor=white:fontsize=44:x=${gx1 - 15 + 14}:y=${gy1 + 42}:borderw=1:bordercolor=black@0.3[con_con_desc]`);
      salidaPrecio = "con_con_desc";
    }
    // Badge de cupón, debajo del precio -- solo si la oferta trae uno
    if (oferta.cupon) {
      const rutaCupon = tempFiles.cupon.replace(/\\/g, "/").replace(/:/g, "\\:");
      fs.writeFileSync(tempFiles.cupon, `Cupon: ${oferta.cupon}`, "utf-8");
      const anchoCupon = Math.round((oferta.cupon.length + 7) * 30 * 0.58) + 50;
      f.push(`[${salidaPrecio}]drawbox=x=(iw-${anchoCupon})/2:y=1440:w=${anchoCupon}:h=64:color=0x16a34a:t=fill[con_cupon_bg]`);
      f.push(`[con_cupon_bg]drawtext=fontfile='${fontEsc}':textfile='${rutaCupon}':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=1458:borderw=1:bordercolor=black@0.3[con_precio_final]`);
    } else {
      f.push(`[${salidaPrecio}]null[con_precio_final]`);
    }
  } else {
    f.push(`[con_titulo]drawtext=fontfile='${fontEsc}':text='VER OFERTA':fontcolor=${acento}:fontsize=54:x=(w-text_w)/2:y=1340:borderw=2:bordercolor=black@0.4[con_precio_final]`);
  }

  // 10. Línea de acento
  f.push(`[con_precio_final]drawbox=x=290:y=1560:w=500:h=4:color=${acento}:t=fill[con_linea_final]`);

  // 11. CTA
  f.push(`[con_linea_final]drawtext=fontfile='${fontEsc}':text='Link en comentarios':fontcolor=white@0.8:fontsize=36:x=(w-text_w)/2:y=1600:borderw=1:bordercolor=black@0.3[con_cta]`);

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

  try {
    execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${imagenPath}"`,
      { stdio: "pipe", timeout: 10000 });
  } catch {
    console.error(`  ⚠️  escena_${numeroImagen}.jpg está corrupta o vacía (descarga falló), saltando esta oferta...`);
    return null;
  }

  const fontPath = process.platform === "win32"
    ? "C:/Windows/Fonts/arial.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

  const tempFiles = {
    titulo: path.join(BASE_DIR, "output", `_card_titulo_${numeroImagen}.txt`),
    tachado: path.join(BASE_DIR, "output", `_card_tachado_${numeroImagen}.txt`),
    precio: path.join(BASE_DIR, "output", `_card_precio_${numeroImagen}.txt`),
    descuento: path.join(BASE_DIR, "output", `_card_descuento_${numeroImagen}.txt`),
    cupon: path.join(BASE_DIR, "output", `_card_cupon_${numeroImagen}.txt`),
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
      const salida = err.stderr ? err.stderr.toString() : err.message;
      const errMsg = salida.slice(-400); // el error real queda al final, no al principio (ahí solo sale el banner de versión de ffmpeg)
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
  const mapaOfertas = new Map(todasLasOfertas.map((o) => [o.link, o]));
  // OJO: el orden importa -- tiene que ser el mismo orden de "elegidas"
  // (el que usó obtener_ofertas.js para guardar escena_01.jpg,
  // escena_02.jpg...). Si se reordena distinto aquí, la card N termina
  // con el título/precio de una oferta y la foto de otra.
  const ofertasConDatos = elegidas.map((link) => mapaOfertas.get(link)).filter(Boolean);

  if (ofertasConDatos.length === 0) {
    console.log("ℹ️  No hay ofertas para procesar hoy, nada que generar.");
    process.exit(0);
  }

  console.log(`📋 ${ofertasConDatos.length} ofertas para generar cards\n`);

  fs.mkdirSync(CARDS_DIR, { recursive: true });

  const cardsGeneradas = [];
  const ofertasExitosas = [];
  for (let i = 0; i < ofertasConDatos.length; i++) {
    const card = await generarCardOferta(ofertasConDatos[i], i, ofertasConDatos.length);
    if (card) {
      cardsGeneradas.push(card);
      ofertasExitosas.push(ofertasConDatos[i]);
    }
  }
  fs.writeFileSync(
    path.join(BASE_DIR, "output", "ofertas_exitosas.json"),
    JSON.stringify(ofertasExitosas, null, 2)
  );

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
