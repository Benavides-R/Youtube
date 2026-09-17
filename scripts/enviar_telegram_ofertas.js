/**
 * enviar_telegram_ofertas.js
 * ------------------------------------------------------------
 * Envía las cards de ofertas generadas a Telegram junto con
 * el guión para que el usuario grabe su voz y suba el video.
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

// Enviar foto a Telegram
async function enviarFoto(filePath, caption) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("caption", caption);
  formData.append("photo", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));

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
  const cards = fs.readdirSync(CARDS_DIR).filter((f) => f.startsWith("card_") && f.endsWith(".jpg")).sort();

  if (cards.length === 0) {
    console.error("❌ No hay cards en output/cards/");
    process.exit(1);
  }

  // 1. Mensaje introductorio
  await enviarMensaje(
    `🔥 OFERTAS DEL DÍA 🔥\n\n` +
    `Hola! Te envío las ${cards.length} ofertas de hoy para que grabes tu video.\n\n` +
    `📸 Las ${cards.length} fotos están abajo\n` +
    `🎙️ Guión para tu voz más abajo\n` +
    `🔗 Link de cada producto en la descripción\n\n` +
    `Cuando grabes, súbelo como Reel a Facebook!`
  );
  console.log("  ✅ Mensaje intro enviado");

  // 2. Enviar cada card con información de la oferta
  const linksElegidos = JSON.parse(fs.readFileSync(ELEGIDAS_PATH, "utf-8"));
  const OFERTAS_JSON_URL = process.env.OFERTAS_JSON_URL;

  let datosOfertas = [];
  if (OFERTAS_JSON_URL) {
    const respuesta = await fetch(OFERTAS_JSON_URL);
    if (respuesta.ok) {
      datosOfertas = await respuesta.json();
    }
  }

  for (let i = 0; i < cards.length; i++) {
    const cardPath = path.join(CARDS_DIR, cards[i]);
    const link = linksElegidos[i];
    const oferta = datosOfertas.find((o) => o.link === link);

    let caption = `📸 Card ${i + 1}/${cards.length}`;
    if (oferta) {
      caption += `\n\n🏷️ ${oferta.titulo}`;
      caption += `\n💰 ${oferta.precio}`;
      if (oferta.descuento_pct) caption += ` (-${oferta.descuento_pct}%)`;
      if (oferta.tiene_cupon) caption += `\n🎫 Tiene cupón`;
      caption += `\n🔗 ${oferta.link}`;
    }

    await enviarFoto(cardPath, caption);
    console.log(`  ✅ Card ${i + 1}/${cards.length} enviada`);

    // Pequeña pausa para no saturar la API
    if (i < cards.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 3. Enviar guión para la voz
  const guionParaVoz =
    `🎙️ GUIÓN PARA TU VOZ:\n\n` +
    `---\n` +
    `${guion.guion}\n` +
    `---\n\n` +
    `📋 DESCRIPCIÓN PARA FACEBOOK:\n\n` +
    `${guion.descripcion}\n\n` +
    `🏷️ Tags: ${guion.tags.join(", ")}\n\n` +
    `💡 Tip: Graba en un lugar tranquilo, con energía, como si le hablaras a un amigo. ` +
    `Los ${cards.length} productos aparecen en el orden de las fotos.`;

  await enviarMensaje(guionParaVoz);
  console.log("  ✅ Guión enviado");

  // 4. Resumen
  await enviarMensaje(
    `✅ Todo listo!\n\n` +
    `📸 ${cards.length} cards guardadas\n` +
    `🎙️ Guión listo para grabar\n\n` +
    `Cuando subas tu video a Facebook, las ofertas se marcarán como usadas automáticamente.`
  );

  console.log("\n✅ Ofertas enviadas a Telegram exitosamente!");
})().catch((err) => {
  console.error("❌ Error enviando ofertas a Telegram:", err.message);
  process.exit(1);
});
