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
const RESULTADO_FB_PATH = path.join(BASE_DIR, "output", "resultado_facebook.json");

let mensaje;
const hayResultadoYoutube = fs.existsSync(RESULTADO_PATH);
const hayResultadoFacebook = fs.existsSync(RESULTADO_FB_PATH);

if (hayResultadoYoutube || hayResultadoFacebook) {
  const partes = [];

  if (hayResultadoYoutube) {
    const r = JSON.parse(fs.readFileSync(RESULTADO_PATH, "utf-8"));
    partes.push(`✅ YouTube: subido (privado)\n🔗 https://youtube.com/watch?v=${r.videoId}\n📹 ${r.titulo}\n📢 Canal: ${r.canal}`);
  } else {
    partes.push("❌ YouTube: falló la subida, revisa el log en GitHub Actions");
  }

  if (hayResultadoFacebook) {
    const rf = JSON.parse(fs.readFileSync(RESULTADO_FB_PATH, "utf-8"));
    partes.push(rf.exito ? "✅ Facebook: publicado" : `❌ Facebook: falló (${rf.error})`);
  }

  mensaje = partes.join("\n\n");
} else if (fs.existsSync(GUION_PATH)) {
  const guion = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));
  mensaje = `⚠️ Se generó el guion ("${guion.titulo}") pero no se completó ninguna subida. Revisa el log en GitHub Actions.`;
} else {
  mensaje = "❌ El proceso automático terminó sin generar contenido. Revisa el log en GitHub Actions.";
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
