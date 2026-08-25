/**
 * notificar_telegram.js
 * ------------------------------------------------------------
 * Envía un mensaje a tu Telegram avisando que el video se
 * subió, con el link directo.
 *
 * Uso:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx node scripts/notificar_telegram.js
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
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
const RESULTADO_PATH = path.join(BASE_DIR, "output", "resultado_subida.json");

// El video_id se guarda en subir_youtube.js (ver ajuste abajo)
let mensaje;

if (fs.existsSync(RESULTADO_PATH)) {
  const resultado = JSON.parse(fs.readFileSync(RESULTADO_PATH, "utf-8"));
  mensaje = `✅ Video subido con éxito\n\n📹 ${resultado.titulo}\n🔗 https://youtube.com/watch?v=${resultado.videoId}\n📢 Canal: ${resultado.canal}\n\n⚠️ Está en PRIVADO, revísalo y publícalo desde YouTube Studio.`;
} else if (fs.existsSync(GUION_PATH)) {
  const guion = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));
  mensaje = `✅ Video generado: ${guion.titulo}`;
} else {
  mensaje = "✅ El proceso automático terminó.";
}

async function enviarMensaje() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telegram API error: ${errText}`);
  }

  console.log("✅ Notificación enviada a Telegram");
}

enviarMensaje().catch((err) => {
  console.error("❌ Error enviando notificación:", err.message);
  process.exit(1);
});
