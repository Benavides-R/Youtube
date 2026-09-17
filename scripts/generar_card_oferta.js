/**
 * generar_card_oferta.js
 * ------------------------------------------------------------
 * Genera una tarjeta profesional de oferta (imagen estática)
 * con el producto centrado sobre fondo de color sólido, precio
 * tachado → precio real, nombre del producto, badge y logo.
 *
 * Formato: vertical 1080x1920 (ideal para Stories/Reels)
 *
 * Uso:
 *   node scripts/generar_card_oferta.js
 *
 * Requiere que obtener_ofertas.js haya corrido primero
 * (necesita output/elegidas.json con las ofertas seleccionadas
 * y output/imagenes/ con las fotos descargadas).
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_DIR = path.join(__dirname, "..");
const ELEGIDAS_PATH = path.join(BASE_DIR, "output", "elegidas.json");
const IMAGENES_DIR = path.join(BASE_DIR, "output", "imagenes");
const CARDS_DIR = path.join(BASE_DIR, "output", "cards");
const LOGO_PATH = path.join(BASE_DIR, "assets", "logo.png");

const ANCHO = 1080;
const ALTO = 1920;

// Colores de fondo (rotación para variar entre cards)
const COLORES_FONDO = [
  "0x1a365d", // azul marino
  "0x111827", // gris oscuro
  "0x1e3a5f", // azul petróleo
  "0x2d1b4e", // morado oscuro
  "0x1a2332", // azul非常 oscuro
];

// Colores de acento para precios
const COLOR_PRECIO_REAL = "0x22c55e"; // verde
const COLOR_PRECIO_TACHADO = "0x9ca3af"; // gris
const COLOR_Badge = "0xef4444"; // rojo

if (!fs.existsSync(ELEGIDAS_PATH)) {
  console.error("❌ No existe output/elegidas.json. Corre primero obtener_ofertas.js");
  process.exit(1);
}

const elegidas = JSON.parse(fs.readFileSync(ELEGIDAS_PATH, "utf-8"));

// También necesitamos los datos completos de las ofertas (título, precio, etc.)
// obtener_ofertas.js guarda las ofertas completas en elegidas.json como array de links,
// pero necesitamos los datos. Vamos a re-leer el JSON original.
const OFERTAS_JSON_URL = process.env.OFERTAS_JSON_URL;

async function cargarDatosOfertas() {
  if (!OFERTAS_JSON_URL) {
    console.error("❌ Falta OFERTAS_JSON_URL para obtener datos de las ofertas");
    process.exit(1);
  }
  const respuesta = await fetch(OFERTAS_JSON_URL);
  if (!respuesta.ok) {
    console.error(`❌ No se pudo descargar seleccion_video.json (HTTP ${respuesta.status})`);
    process.exit(1);
  }
  return await respuesta.json();
}

// Escapar texto para FFmpeg drawtext (reemplazar caracteres especiales)
function escaparTexto(texto) {
  return texto
    .replace(/\\/g, "\\\\\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\n/g, "");
}

// Envolver texto en líneas (para nombre del producto)
function envolverTexto(texto, caracteresPorLinea = 30) {
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

// Extraer solo el precio numérico de un string como "~$165.900 COP"
function extraerPrecio(precioTexto) {
  const match = precioTexto.match(/[\d.]+/);
  return match ? match[0] : precioTexto;
}

async function generarCardOferta(oferta, indice, total) {
  const colorFondo = COLORES_FONDO[indice % COLORES_FONDO.length];
  const numeroImagen = String(indice + 1).padStart(2, "0");
  const imagenPath = path.join(IMAGENES_DIR, `escena_${numeroImagen}.jpg`);
  const cardPath = path.join(CARDS_DIR, `card_${numeroImagen}.jpg`);

  if (!fs.existsSync(imagenPath)) {
    console.error(`  ⚠️ No existe imagen escena_${numeroImagen}.jpg, saltando...`);
    return null;
  }

  // Preparar textos
  const tituloCorto = oferta.titulo.slice(0, 50);
  const tituloEnvuelto = envolverTexto(tituloCorto, 28);
  const precioOriginal = extraerPrecio(oferta.precio || "");
  const descuento = oferta.descuento_pct ? `-${oferta.descuento_pct}%` : "";

  // Archivos temporales para drawtext (FFmpeg necesita archivos, no strings)
  const tempTitulo = path.join(BASE_DIR, "output", `_card_titulo_${numeroImagen}.txt`);
  const tempPrecio = path.join(BASE_DIR, "output", `_card_precio_${numeroImagen}.txt`);

  fs.writeFileSync(tempTitulo, tituloEnvuelto, "utf-8");
  fs.writeFileSync(tempPrecio, `$${precioOriginal}`, "utf-8");

  const fontPath =
    process.platform === "win32"
      ? "C:/Windows/Fonts/arial.ttf"
      : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const fontPathEscapado = fontPath.replace(/:/g, "\\:");
  const tempTituloEscapado = tempTitulo.replace(/\\/g, "/").replace(/:/g, "\\:");
  const tempPrecioEscapado = tempPrecio.replace(/\\/g, "/").replace(/:/g, "\\:");

  try {
    // Construir filtro FFmpeg
    const filtros = [];

    // 1. Fondo de color sólido
    filtros.push(`color=c=${colorFondo}:s=${ANCHO}x${ALTO}:d=1[base]`);

    // 2. Producto centrado con padding (contain, no stretch)
    //    Escalar para que quepa dentro de un rectángulo 700x700 centrado
    filtros.push(`[1:v]scale=600:-1:force_original_aspect_ratio=decrease,pad=620:620:(ow-iw)/2:(oh-ih)/2:color=${colorFondo}[producto]`);

    // 3. Superponer producto sobre el fondo
    filtros.push(`[base][producto]overlay=(W-w)/2:400[con_producto]`);

    // 4. Badge "OFERTA DEL DÍA" arriba
    filtros.push(`[con_producto]drawbox=x=340:y=120:w=400:h=60:color=0xef4444:t=fill[con_badge]`);

    // 5. Texto del badge
    filtros.push(`[con_badge]drawtext=fontfile='${fontPathEscapado}':text='OFERTA DEL DIA':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=130:borderw=1:bordercolor=black@0.3[con_badge_texto]`);

    // 6. Nombre del producto (abajo del producto)
    filtros.push(`[con_badge_texto]drawtext=fontfile='${fontPathEscapado}':textfile='${tempTituloEscapado}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=1100:line_spacing=12:borderw=2:bordercolor=black@0.5[con_titulo]`);

    // 7. Precio tachado (si hay descuento)
    if (descuento) {
      filtros.push(`[con_titulo]drawtext=fontfile='${fontPathEscapado}':text='$${precioOriginal}':fontcolor=0x9ca3af:fontsize=48:x=(w-text_w)/2:y=1300:strikethrough=1[con_precio_tachado]`);

      // 8. Precio real (más grande, verde)
      filtros.push(`[con_precio_tachado]drawtext=fontfile='${fontPathEscapado}':text='${descuento}':fontcolor=0xef4444:fontsize=56:x=(w-text_w)/2:y=1380:borderw=2:bordercolor=black@0.3[con_precio_final]`);
    } else {
      // Sin descuento, solo mostrar precio
      filtros.push(`[con_titulo]drawtext=fontfile='${fontPathEscapado}':textfile='${tempPrecioEscapado}':fontcolor=0x22c55e:fontsize=64:x=(w-text_w)/2:y=1320:borderw=2:bordercolor=black@0.3[con_precio_final]`);
    }

    // 9. Link / CTA abajo
    filtros.push(`[con_precio_final]drawtext=fontfile='${fontPathEscapado}':text='Link en comentarios 👇':fontcolor=white@0.8:fontsize=36:x=(w-text_w)/2:y=1600:borderw=1:bordercolor=black@0.3[con_cta]`);

    let filtroFinal;
    let inputs;
    let mapaFinal;

    if (fs.existsSync(LOGO_PATH)) {
      // Con logo
      filtros.push(`[1:v]scale=180:-1[logo]`);
      filtros.push(`[con_cta][logo]overlay=W-w-30:H-h-30[salida]`);
      filtroFinal = filtros.join(",");
      inputs = `-i "${imagenPath}" -i "${LOGO_PATH}"`;
      mapaFinal = "[salida]";
    } else {
      filtroFinal = filtros.join(",");
      inputs = `-i "${imagenPath}"`;
      mapaFinal = "[con_cta]";
    }

    // Crear directorio de salida
    fs.mkdirSync(CARDS_DIR, { recursive: true });

    const cmd = `ffmpeg -y -f lavfi -i "color=c=${colorFondo}:s=${ANCHO}x${ALTO}:d=1" ${inputs} -filter_complex "${filtroFinal}" -map "${mapaFinal}" -frames:v 1 "${cardPath}"`;

    execSync(cmd, { stdio: "pipe" });

    console.log(`  ✅ card_${numeroImagen}.jpg — ${tituloCorto}`);
    return cardPath;
  } catch (err) {
    console.error(`  ❌ Error generando card para "${oferta.titulo}":`, err.stderr ? err.stderr.toString().slice(0, 200) : err.message);
    return null;
  } finally {
    // Limpiar archivos temporales
    [tempTitulo, tempPrecio].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
  }
}

(async () => {
  console.log("🖼️  Generando cards de ofertas...");

  // Cargar datos completos de ofertas
  const todasLasOfertas = await cargarDatosOfertas();
  const linksElegidos = new Set(elegidas);

  // Filtrar solo las ofertas que fueron elegidas
  const ofertasConDatos = todasLasOfertas.filter((o) => linksElegidos.has(o.link));

  if (ofertasConDatos.length === 0) {
    console.error("❌ No se encontraron datos de las ofertas elegidas");
    process.exit(1);
  }

  console.log(`📋 ${ofertasConDatos.length} ofertas para generar cards`);

  const cardsGeneradas = [];
  for (let i = 0; i < ofertasConDatos.length; i++) {
    const card = await generarCardOferta(ofertasConDatos[i], i, ofertasConDatos.length);
    if (card) cardsGeneradas.push(card);
  }

  if (cardsGeneradas.length === 0) {
    console.error("❌ No se generó ninguna card");
    process.exit(1);
  }

  // Guardar lista de cards generadas
  fs.writeFileSync(
    path.join(BASE_DIR, "output", "cards_generadas.json"),
    JSON.stringify(cardsGeneradas, null, 2)
  );

  console.log(`\n✅ ${cardsGeneradas.length} cards generadas en output/cards/`);
})();
