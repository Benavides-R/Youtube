/**
 * obtener_ofertas.js
 * ------------------------------------------------------------
 * Reemplaza a generar_guion.js + generar_imagenes.js para el canal
 * de ofertas: no usa IA ni Pexels -- lee seleccion_video.json (el
 * archivo público que arma el bot de arbitraje-telegram con las
 * ofertas que elegiste) y arma directo:
 *   - output/guion.json (narración simple con los datos reales,
 *     compatible con generar_audio.py / ensamblar_video.js / etc.)
 *   - output/imagenes/escena_01.jpg, escena_02.jpg... (las fotos
 *     reales de cada producto, descargadas tal cual)
 *
 * Lleva su propio registro de qué ofertas (por link) ya se usaron
 * en data/ofertas_procesadas.json, para no repetir un producto en
 * dos videos.
 *
 * Uso:
 *   OFERTAS_JSON_URL=https://raw.githubusercontent.com/... node scripts/obtener_ofertas.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const OFERTAS_JSON_URL = process.env.OFERTAS_JSON_URL;
const MIN_OFERTAS_POR_VIDEO = 1;
const VOZ = process.env.OFERTAS_VOZ || "es-CO-GonzaloNeural";

const BASE_DIR = path.join(__dirname, "..");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
const IMAGENES_DIR = path.join(BASE_DIR, "output", "imagenes");
const PROCESADAS_PATH = path.join(BASE_DIR, "data", "ofertas_procesadas.json");

if (!OFERTAS_JSON_URL) {
  console.error("❌ Falta OFERTAS_JSON_URL (la URL raw de seleccion_video.json)");
  process.exit(1);
}

const DIAS_BLOQUEO_REPETIDO = 3; // pasado esto, una oferta se puede volver a generar en video

function cargarProcesadas() {
  if (!fs.existsSync(PROCESADAS_PATH)) return [];
  try {
    const datos = JSON.parse(fs.readFileSync(PROCESADAS_PATH, "utf-8"));
    const corte = Date.now() - DIAS_BLOQUEO_REPETIDO * 24 * 3600 * 1000;
    // Compatible con el formato viejo (solo strings, sin fecha) -- esos se
    // tratan como ya vencidos, para no dejar nada bloqueado para siempre.
    return datos
      .filter((d) => typeof d === "object" && d.fecha && new Date(d.fecha).getTime() > corte)
      .map((d) => d.link);
  } catch {
    return [];
  }
}

// Recorta un título largo de Amazon a algo que suene natural al leerlo
// en voz alta, sin cortar una palabra a la mitad.
function acortarParaVoz(titulo, maxPalabras = 10) {
  const palabras = titulo.split(/\s+/).slice(0, maxPalabras);
  return palabras.join(" ");
}

// El precio viene como "~$165.900 COP" (para mostrar en pantalla) -- para
// que el TTS lo lea bien, se limpia el "~", el "$" y "COP" y se dice
// "pesos" al final, en vez de arriesgarnos a que lo lea mal.
function precioParaVoz(precioTexto) {
  return precioTexto.replace(/[~$]/g, "").replace(/\s*COP\s*/i, "").trim() + " pesos";
}

function armarGuion(ofertas) {
  const cuerpo = ofertas.map((o) => `Miren esta: ${acortarParaVoz(o.titulo)}.`).join(" ");
  return `Les traemos las mejores ofertas de hoy. ${cuerpo} Recuerden que los links están en los comentarios. `
    + `Estas fueron las mejores ofertas de Amazon de hoy.`;
}

async function descargarImagen(url, destino) {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} al descargar ${url}`);
  const buffer = Buffer.from(await respuesta.arrayBuffer());
  fs.writeFileSync(destino, buffer);
}

(async () => {
  console.log("📥 Descargando selección de ofertas...");
  const respuesta = await fetch(OFERTAS_JSON_URL);
  if (!respuesta.ok) {
    console.error(`❌ No se pudo descargar seleccion_video.json (HTTP ${respuesta.status})`);
    process.exit(1);
  }
  const todas = await respuesta.json();

  const procesadas = new Set(cargarProcesadas());
  const disponibles = todas.filter((o) => o.link && !procesadas.has(o.link));

  if (disponibles.length < MIN_OFERTAS_POR_VIDEO) {
    console.log(`ℹ️  Solo hay ${disponibles.length} oferta(s) nueva(s), se necesitan al menos ${MIN_OFERTAS_POR_VIDEO}. No hay ofertas para procesar.`);
    process.exit(1);
  }

  const elegidas = disponibles;
  console.log(`✅ ${elegidas.length} ofertas para este lote: ${elegidas.map((o) => o.titulo).join(" | ")}`);

  // 1. guion.json
  const guionTexto = armarGuion(elegidas);
  const guionData = {
    titulo: elegidas.length === 1
      ? `${elegidas[0].titulo.slice(0, 60)} 🔥`
      : `${elegidas.length} OFERTAS que no puedes dejar pasar 🔥`,
    guion: guionTexto,
    descripcion: elegidas.map((o) => `• ${o.titulo} - ${o.precio}`).join("\n") +
      "\n\n👉 Todas las ofertas del día en nuestro Telegram.",
    tags: ["ofertas", "descuentos", "amazon", "tecnologia"],
  };
  fs.mkdirSync(path.dirname(GUION_PATH), { recursive: true });
  fs.writeFileSync(GUION_PATH, JSON.stringify(guionData, null, 2));
  console.log("✅ guion.json generado");

  // 2. Fotos de cada producto
  if (fs.existsSync(IMAGENES_DIR)) {
    fs.readdirSync(IMAGENES_DIR).forEach((f) => fs.unlinkSync(path.join(IMAGENES_DIR, f)));
  }
  fs.mkdirSync(IMAGENES_DIR, { recursive: true });

  for (let i = 0; i < elegidas.length; i++) {
    const numero = String(i + 1).padStart(2, "0");
    const destino = path.join(IMAGENES_DIR, `escena_${numero}.jpg`);
    try {
      await descargarImagen(elegidas[i].imagen, destino);
      console.log(`  ✅ escena_${numero}.jpg (${elegidas[i].titulo.slice(0, 40)}...)`);
    } catch (err) {
      console.error(`  ⚠️ No se pudo descargar la foto de "${elegidas[i].titulo}": ${err.message}`);
    }
  }

  if (fs.readdirSync(IMAGENES_DIR).length === 0) {
    console.error("❌ No se pudo descargar ninguna foto, no hay con qué armar el video.");
    process.exit(1);
  }

  // 3. Guardar cuáles se eligieron para este intento -- OJO: todavía no se
  // marcan como "procesadas" en el registro definitivo. Eso solo pasa al
  // final del workflow, si Facebook confirma que el video se publicó. Así,
  // si algo falla más adelante (audio, ensamblado, subida), estas mismas
  // ofertas se vuelven a intentar en la siguiente corrida en vez de
  // perderse sin haberse publicado nunca.
  fs.writeFileSync(
    path.join(BASE_DIR, "output", "elegidas.json"),
    JSON.stringify(elegidas.map((o) => o.link), null, 2)
  );
  console.log(`✅ ${elegidas.length} ofertas listas para este intento (se marcarán como usadas solo si se publica bien)`);
})().catch((err) => {
  console.error("❌ Error obteniendo ofertas:", err.message);
  process.exit(1);
});
