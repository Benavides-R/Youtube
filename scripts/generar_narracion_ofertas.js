/**
 * generar_narracion_ofertas.js
 * ------------------------------------------------------------
 * Genera output/guion.json con una narración diseñada para TTS
 * que describe cada oferta mientras se muestra su card visual.
 *
 * Diferente al guion viejo (que narraba todo de corrido), este
 * guion pausa entre productos para que el video muestre la card
 * de cada oferta mientras la voz la describe.
 *
 * Uso:
 *   node scripts/generar_narracion_ofertas.js
 *
 * Requiere: obtener_ofertas.js primero
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const BASE_DIR = path.join(__dirname, "..");
const ELEGIDAS_PATH = path.join(BASE_DIR, "output", "elegidas.json");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
const OFERTAS_JSON_URL = process.env.OFERTAS_JSON_URL;
const VOZ = process.env.OFERTAS_VOZ || "es-CO-GonzaloNeural";

if (!OFERTAS_JSON_URL) {
  console.error("❌ Falta OFERTAS_JSON_URL");
  process.exit(1);
}

if (!fs.existsSync(ELEGIDAS_PATH)) {
  console.error("❌ No existe output/elegidas.json. Corre primero obtener_ofertas.js");
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────

function acortarParaVoz(titulo, maxPalabras = 8) {
  return titulo.split(/\s+/).slice(0, maxPalabras).join(" ");
}

function precioParaVoz(precioTexto) {
  if (!precioTexto) return null;
  // Limpiar $, ~, COP, espacios extra
  const limpio = precioTexto.replace(/[~$]/g, "").replace(/\s*COP\s*/i, "").trim();
  // Quitar puntos (separador de miles) para que el TTS lea el número limpio
  const numLimpio = limpio.replace(/\./g, "");
  const num = parseInt(numLimpio);
  if (isNaN(num) || num < 1000) return null;
  // Devolver el número sin puntos + "pesos" para que suene natural
  // "165.900 pesos" → "165900 pesos" → TTS dice "ciento sesenta y cinco mil novecientos pesos"
  return numLimpio + " pesos";
}

// Formatear número con puntos para mostrar en pantalla (no para TTS)
function formatearPrecio(precioTexto) {
  if (!precioTexto) return null;
  const limpio = precioTexto.replace(/[~$]/g, "").replace(/\s*COP\s*/i, "").trim();
  const num = parseInt(limpio.replace(/\./g, ""));
  if (isNaN(num) || num < 1000) return null;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function elegir(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// ─── Generar narración ────────────────────────────────────

const GANCHOS = [
  "Atentos que esto es lo mejor de hoy:",
  "Esto es lo que les traigo hoy, miren:",
  "Las mejores ofertas del día, aquí están:",
  "Prepárense que esto está muy bueno:",
];

const CONECTORES = [
  "Ahí les va otra:",
  "Y esta también está buena:",
  "Sigamos con esta:",
  "Miren esta también:",
  "Esta otra qué tal:",
];

const CONECTORES_FINAL = [
  "Y para cerrar, esta no se la pueden perder:",
  "Y la última de hoy:",
  "Para terminar, miren esta:",
];

const CIERRES = [
  "Y eso es todo por hoy. Los links están en la descripción. Síganos para más ofertas.",
  "Esas son las de hoy. Encuentran los links abajo. No se pierdan las próximas.",
  "Listo, esos son los descuentos de hoy. Link en la descripción. Hasta la próxima.",
];

function generarNarracionProducto(oferta, indice, total) {
  const nombre = acortarParaVoz(oferta.titulo);
  const precio = precioParaVoz(oferta.precio);

  let conector = "";
  if (indice === 0) {
    conector = elegir(GANCHOS) + " ";
  } else if (indice === total - 1) {
    conector = elegir(CONECTORES_FINAL) + " ";
  } else {
    conector = elegir(CONECTORES) + " ";
  }

  let frase = `${conector}${nombre}`;

  if (precio && oferta.descuento_pct) {
    // Calcular precio original para mencionarlo
    const numActual = parseInt(precio.replace(/\s*pesos/i, "").trim());
    const original = Math.round(numActual / (1 - oferta.descuento_pct / 100));
    // Formatear con puntos para que el TTS lea bien
    const originalLimpio = original.toString();
    frase += `, que costaba ${originalLimpio} pesos, ahora por tan solo ${precio}, con ${oferta.descuento_pct} por ciento de descuento`;
  } else if (precio) {
    frase += `, por tan solo ${precio}`;
  }

  if (oferta.tiene_cupon) {
    frase += `. Trae cupón especial, miren la descripción`;
  }

  frase += `. `;

  return frase;
}

(async () => {
  console.log("📝 Generando narración para ofertas...\n");

  try {
    const elegidas = JSON.parse(fs.readFileSync(ELEGIDAS_PATH, "utf-8"));

    const respuesta = await fetch(OFERTAS_JSON_URL);
    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status} al descargar seleccion_video.json`);
    }
    const todasLasOfertas = await respuesta.json();
    const linksSet = new Set(elegidas);
    const ofertasConDatos = todasLasOfertas.filter((o) => linksSet.has(o.link));

    if (ofertasConDatos.length === 0) {
      throw new Error("No se encontraron datos de las ofertas elegidas");
    }

    // Armar narración completa (si una oferta falla, se salta)
    const partes = [];
    for (let i = 0; i < ofertasConDatos.length; i++) {
      try {
        const parte = generarNarracionProducto(ofertasConDatos[i], i, ofertasConDatos.length);
        partes.push(parte);
      } catch (err) {
        console.error(`  ⚠️ Error narrando oferta ${i + 1}: ${err.message}, saltando...`);
      }
    }

    if (partes.length === 0) {
      throw new Error("No se pudo generar ninguna parte de la narración");
    }

    const ganchoFinal = elegir(CIERRES);
    const guionTexto = partes.join("") + ganchoFinal;

    // Título para YouTube
    const titulo = ofertasConDatos.length === 1
      ? `${acortarParaVoz(ofertasConDatos[0].titulo, 6)} — Oferta del día`
      : `${ofertasConDatos.length} Ofertas de Hoy que No Te Puedes Perder`;

    // Descripción para YouTube/Facebook
    const descripcion = ofertasConDatos.map((o, i) => {
      let linea = `${i + 1}. ${o.titulo}`;
      if (o.precio) linea += ` — ${o.precio}`;
      if (o.descuento_pct) linea += ` (-${o.descuento_pct}%)`;
      if (o.link) linea += `\n   ${o.link}`;
      return linea;
    }).join("\n\n") + "\n\nMas ofertas en nuestro Telegram.";

    // Tags
    const tags = [
      "ofertas",
      "descuentos",
      "amazon",
      "ofertas del día",
      "descuentos amazon",
      "compras inteligentes",
      "tecnología",
      "ahorro",
    ];

    const guionData = {
      titulo,
      canal: "ofertas",
      guion: guionTexto,
      descripcion,
      tags,
      voz: VOZ,
      formato: "vertical",
      subtitulos_abajo: true,
    };

    fs.mkdirSync(path.dirname(GUION_PATH), { recursive: true });
    fs.writeFileSync(GUION_PATH, JSON.stringify(guionData, null, 2));

    console.log(`✅ Narración generada (${partes.length}/${ofertasConDatos.length} ofertas)`);
    console.log(`📹 Título: ${titulo}`);
    console.log(`🎙️  Texto: ${guionTexto.slice(0, 100)}...`);
  } catch (err) {
    // Si falla todo, crear un guion mínimo para que el pipeline siga
    console.error(`⚠️  Error generando narración: ${err.message}`);
    console.log("📝 Creando guion de respaldo...");

    const guionFallback = {
      titulo: "Ofertas del día",
      canal: "ofertas",
      guion: "Estas son las mejores ofertas de hoy. Miren los links en la descripción.",
      descripcion: "Ofertas del día en nuestro canal.",
      tags: ["ofertas", "descuentos", "amazon"],
      voz: VOZ,
      formato: "vertical",
      subtitulos_abajo: true,
    };

    fs.mkdirSync(path.dirname(GUION_PATH), { recursive: true });
    fs.writeFileSync(GUION_PATH, JSON.stringify(guionFallback, null, 2));
    console.log("✅ Guion de respaldo generado");
  }
})();
