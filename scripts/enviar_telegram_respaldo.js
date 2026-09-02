/**
 * enviar_telegram_respaldo.js
 * ------------------------------------------------------------
 * Se usa SOLO cuando falla la subida a YouTube. Manda el video
 * completo + título + descripción directo al chat de Telegram,
 * para poder descargarlo y subirlo a mano mientras se resuelve
 * el problema de YouTube.
 *
 * Uso:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx node scripts/enviar_telegram_respaldo.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const BASE_DIR = path.join(__dirname, "..");
const VIDEO_PATH = path.join(BASE_DIR, "output", "video_final.mp4");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("❌ Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID");
  process.exit(0);
}

if (!fs.existsSync(VIDEO_PATH) || !fs.existsSync(GUION_PATH)) {
  console.log("ℹ️  No hay video generado, no hay nada que enviar de respaldo.");
  process.exit(0);
}

const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));

// Telegram limita el "caption" a 1024 caracteres — recortamos si hace falta
function armarCaption() {
  let caption = `⚠️ YouTube falló — aquí tienes el video para subirlo tú mismo\n\n📹 TÍTULO:\n${guionData.titulo}\n\n📝 DESCRIPCIÓN:\n${guionData.descripcion}`;
  if (caption.length > 1024) {
    caption = caption.slice(0, 1000) + "... (descripción completa recortada, revisa el guion.json)";
  }
  return caption;
}

(async () => {
  try {
    const tamañoMB = fs.statSync(VIDEO_PATH).size / (1024 * 1024);
    console.log(`📤 Enviando video de respaldo a Telegram (${tamañoMB.toFixed(1)} MB)...`);

    if (tamañoMB > 49) {
      console.log("⚠️  El video pesa más de 49MB, el límite de Telegram para bots — no se puede enviar así.");
      process.exit(0);
    }

    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    form.append("caption", armarCaption());
    form.append("video", new Blob([fs.readFileSync(VIDEO_PATH)]), "video.mp4");

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
      method: "POST",
      body: form,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    console.log("✅ Video de respaldo enviado a Telegram");
  } catch (err) {
    console.error("❌ Error enviando el video de respaldo:", err.message);
    process.exit(0); // nunca tumbamos el workflow por esto
  }
})();
