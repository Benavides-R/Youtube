/**
 * enviar_telegram_ofertas.js
 * ------------------------------------------------------------
 * Envía las cards de ofertas generadas a Telegram en UN solo
 * mensaje (album) junto con el guión para que el usuario
 * grabe su voz y suba el video.
 *
 * Uso:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx node scripts/enviar_telegram_ofertas.js
 *
 * Requiere que generar_card_oferta.js haya corrido primero
 * (necesita output/cards/ y output/guion.json).
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("❌ Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID");
  process.exit(1);
}

const BASE_DIR = path.join(__dirname, "..");
const CARDS_DIR = path.join(BASE_DIR, "output", "cards");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
const ELEGIDAS_PATH = path.join(BASE_DIR, "output", "elegidas.json");

if (!fs.existsSync(CARDS_DIR)) {
  console.error("❌ No existe output/cards/. Corre primero generar_card_oferta.js");
  process.exit(1);
}

if (!fs.existsSync(GUION_PATH)) {
  console.error("❌ No existe output/guion.json. Corre primero obtener_ofertas.js");
  process.exit(1);
}

// Enviar album de fotos en UN solo mensaje (sendMediaGroup)
async function enviarAlbum(cards, captions) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`;

  // Construir array de medios
  const media = cards.map((card, i) => ({
    type: "photo",
    media: `attach://${path.basename(card)}`,
    caption: captions[i] || "",
  }));

  // Crear FormData con todas las fotos
  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("media", JSON.stringify(media));

  // Agregar cada foto como archivo
  for (const card of cards) {
    const nombre = path.basename(card);
    formData.append(nombre, new Blob([fs.readFileSync(card)]), nombre);
  }

  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telegram API error: ${errText}`);
  }
  return await response.json();
}

// Enviar mensaje de texto
async function enviarMensaje(texto) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texto }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telegram API error: ${errText}`);
  }
  return await response.json();
}

// Frases variadas para que el guion no suene repetitivo con muchos productos
const CONECTORES = ["Miren esta", "También esta", "Y esta", "Ahí va otra", "Miren esta también"];

function armarGuion(ofertas) {
  const cuerpo = ofertas.map((o, i) =>
    `${CONECTORES[i % CONECTORES.length]}: ${o.titulo.split(/\s+/).slice(0, 10).join(" ")}.`
  ).join(" ");
  return `Les traemos las mejores ofertas de hoy. ${cuerpo} Recuerden que los links están en los comentarios. `
    + `Estas fueron las mejores ofertas de Amazon de hoy.`;
}

function armarDescripcion(ofertas) {
  const gancho = "🔥 Estas son las ofertas del día — ¡no se las pierdan!";
  const lineas = ofertas.map((o) => {
    const desc = o.descuento_pct ? ` (-${o.descuento_pct}%)` : "";
    const cup = o.cupon ? ` [Cupón: ${o.cupon}]` : "";
    return `• ${o.titulo} - ${o.precio}${desc}${cup}`;
  });
  return `${gancho}\n\n${lineas.join("\n")}\n\n👉 Síguenos para no perderte las promociones de cada día.`;
}

(async () => {
  console.log("📱 Enviando ofertas a Telegram...");

  const OFERTAS_EXITOSAS_PATH = path.join(BASE_DIR, "output", "ofertas_exitosas.json");
  if (!fs.existsSync(OFERTAS_EXITOSAS_PATH)) {
    console.error("❌ No existe output/ofertas_exitosas.json. Corre primero generar_card_oferta.js");
    process.exit(1);
  }
  const ofertasExitosas = JSON.parse(fs.readFileSync(OFERTAS_EXITOSAS_PATH, "utf-8"));

  const cards = fs.readdirSync(CARDS_DIR).filter((f) => f.startsWith("card_") && f.endsWith(".jpg")).sort()
    .map((f) => path.join(CARDS_DIR, f));

  if (cards.length === 0 || ofertasExitosas.length === 0) {
    console.log("ℹ️  No hay cards para enviar hoy.");
    process.exit(0);
  }

  // 1. Álbum de fotos, caption corto (el detalle va en mensajes aparte)
  const captionPrincipal = `🔥 OFERTAS DEL DÍA — ${cards.length} productos\n\n👇 Guión, descripción y links en los próximos mensajes`;
  const captions = [captionPrincipal, ...Array(cards.length - 1).fill("")];

  console.log(`  📸 Enviando album de ${cards.length} cards...`);
  await enviarAlbum(cards, captions);
  console.log(`  ✅ Album enviado`);

  // 2. Guión (para tu voz) -- construido SOLO con las ofertas que sí
  // tienen card (si alguna falló, no aparece mencionada aquí)
  await enviarMensaje(`🎙️ GUIÓN PARA TU VOZ:\n\n${armarGuion(ofertasExitosas)}`);
  console.log("  ✅ Guión enviado");

  // 3. Descripción para Facebook, en su propio mensaje para copiar y pegar
  await enviarMensaje(`📋 DESCRIPCIÓN PARA FACEBOOK:\n\n${armarDescripcion(ofertasExitosas)}`);
  console.log("  ✅ Descripción enviada");

  // 4. Links, en su propio mensaje para copiar y pegar
  const linksTexto = ofertasExitosas.map((o, i) => {
    const lineaCupon = o.cupon ? `\n   🎫 Cupón: ${o.cupon}` : "";
    return `${i + 1}. ${o.titulo.slice(0, 40)}${lineaCupon}\n   ${o.link}`;
  }).join("\n\n");
  const mensajeLinks = `🔗 LINKS DE PRODUCTOS:\n\n${linksTexto}`;
  for (let i = 0; i < mensajeLinks.length; i += 4000) {
    await enviarMensaje(mensajeLinks.slice(i, i + 4000));
  }
  console.log("  ✅ Links enviados");

  console.log(`\n✅ Todo enviado (${cards.length} cards + guión + descripción + links, en mensajes separados)`);
})().catch((err) => {
  console.error("❌ Error enviando ofertas a Telegram:", err.message);
  process.exit(1);
});
