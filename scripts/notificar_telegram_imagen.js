/**
 * notificar_telegram_imagen.js
 * ------------------------------------------------------------
 * Aviso de Telegram para la tarjeta de versículo (pieza aparte
 * del pipeline de videos, mismo bot).
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
const RESULTADO_PATH = path.join(BASE_DIR, "output", "resultado_imagen.json");
const CITA_PATH = path.join(BASE_DIR, "output", "cita.json");

let mensaje;
if (fs.existsSync(RESULTADO_PATH)) {
  const r = JSON.parse(fs.readFileSync(RESULTADO_PATH, "utf-8"));
  mensaje = `✅ Tarjeta de versículo publicada en Facebook\n\n📖 "${r.verso}"\n— ${r.referencia}`;
} else if (fs.existsSync(CITA_PATH)) {
  const c = JSON.parse(fs.readFileSync(CITA_PATH, "utf-8"));
  mensaje = `⚠️ Se generó el versículo pero no se pudo confirmar la subida a Facebook\n\n"${c.verso}" — ${c.referencia}`;
} else {
  mensaje = "⚠️ El proceso de la tarjeta de versículo terminó sin generar contenido.";
}

fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje }),
})
  .then((r) => (r.ok ? console.log("✅ Notificación enviada") : r.text().then((t) => Promise.reject(t))))
  .catch((err) => console.error("❌ Error enviando notificación:", err));
