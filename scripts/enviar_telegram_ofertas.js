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

(async () => {
  console.log("📱 Enviando ofertas a Telegram...");

  const guion = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));
  const cards = fs.readdirSync(CARDS_DIR).filter((f) => f.startsWith("card_") && f.endsWith(".jpg")).sort()
    .map((f) => path.join(CARDS_DIR, f));

  if (cards.length === 0) {
    console.error("❌ No hay cards en output/cards/");
    process.exit(1);
  }

  // Cargar datos de ofertas
  const linksElegidos = JSON.parse(fs.readFileSync(ELEGIDAS_PATH, "utf-8"));
  const OFERTAS_JSON_URL = process.env.OFERTAS_JSON_URL;

  let datosOfertas = [];
  if (OFERTAS_JSON_URL) {
    const respuesta = await fetch(OFERTAS_JSON_URL);
    if (respuesta.ok) {
      datosOfertas = await respuesta.json();
    }
  }

  // 1. Caption corto para la PRIMERA card (el detalle completo va después,
  // en un mensaje de texto aparte, que no tiene el límite de 1024
  // caracteres que sí tienen los captions de fotos en Telegram)
  const captionPrincipal = `🔥 OFERTAS DEL DÍA — ${cards.length} productos\n\n👇 Detalle, guión y links más abajo`;

  // 2. Enviar album (primera card con caption, las demás sin caption)
  const captions = [captionPrincipal, ...Array(cards.length - 1).fill("")];

  console.log(`  📸 Enviando album de ${cards.length} cards...`);
  await enviarAlbum(cards, captions);
  console.log(`  ✅ Album enviado`);

  // 4. Enviar guión + links + descripción (un solo mensaje)
  const linksTexto = linksElegidos.map((link, i) => {
    const oferta = datosOfertas.find((o) => o.link === link);
    const nombre = oferta ? oferta.titulo.slice(0, 40) : `Producto ${i + 1}`;
    return `${i + 1}. ${nombre}\n   ${link}`;
  }).join("\n\n");

  const mensajeFinal =
    `🎙️ GUIÓN PARA TU VOZ:\n\n` +
    `---\n` +
    `${guion.guion}\n` +
    `---\n\n` +
    `📋 DESCRIPCIÓN PARA FACEBOOK:\n\n` +
    `${guion.descripcion}\n\n` +
    `🔗 LINKS DE PRODUCTOS:\n\n` +
    `${linksTexto}\n\n` +
    `🏷️ Tags: ${guion.tags.join(", ")}\n\n` +
    `💡 Tips:\n` +
    `- Graba en lugar tranquilo, con energía\n` +
    `- Muestra las cards en el orden que aparecen\n` +
    `- Estas ofertas ya quedaron marcadas como usadas (desde que se enviaron aquí)`;

  for (let i = 0; i < mensajeFinal.length; i += 4000) {
    await enviarMensaje(mensajeFinal.slice(i, i + 4000));
  }
  console.log("  ✅ Guión + links enviados");

  console.log(`\n✅ Todo enviado en 2 mensajes (${cards.length} cards + guión)`);
})().catch((err) => {
  console.error("❌ Error enviando ofertas a Telegram:", err.message);
  process.exit(1);
});
