/**
 * notificar_telegram_superate.js
 * ------------------------------------------------------------
 * Aviso de Telegram cuando se publica la tarjeta motivacional.
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
const FRASE_PATH = path.join(BASE_DIR, "output", "frase.json");

let mensaje;
if (fs.existsSync(FRASE_PATH)) {
  const f = JSON.parse(fs.readFileSync(FRASE_PATH, "utf-8"));
  mensaje = `✅ Tarjeta motivacional publicada en Facebook\n\n💬 "${f.frase}"\n— ${f.autor}`;
} else {
  mensaje = "⚠️ El proceso de la tarjeta motivacional terminó sin generar contenido.";
}

fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje }),
})
  .then((r) => (r.ok ? console.log("✅ Notificación enviada") : r.text().then((t) => Promise.reject(t))))
  .catch((err) => console.error("❌ Error enviando notificación:", err));
