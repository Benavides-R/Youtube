/**
 * subir_youtube.js
 * ------------------------------------------------------------
 * Sube output/video_final.mp4 a YouTube, usando el título,
 * descripción y tags que ya generamos en output/guion.json.
 * Requiere haber corrido antes autorizar_youtube.js una vez.
 *
 * Uso:
 *   node scripts/subir_youtube.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const BASE_DIR = path.join(__dirname, "..");
const CREDENTIALS_PATH = path.join(BASE_DIR, "config", "credentials.json");
const TOKEN_PATH = path.join(BASE_DIR, "config", "token.json");
const VIDEO_PATH = path.join(BASE_DIR, "output", "video_final.mp4");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");

// ------------------------------------------------------------
// 1. Validaciones
// ------------------------------------------------------------
for (const [nombre, ruta] of [
  ["credentials.json", CREDENTIALS_PATH],
  ["token.json (corre autorizar_youtube.js primero)", TOKEN_PATH],
  ["video_final.mp4 (corre ensamblar_video.js primero)", VIDEO_PATH],
  ["guion.json", GUION_PATH],
]) {
  if (!fs.existsSync(ruta)) {
    console.error(`❌ Falta: ${nombre}`);
    process.exit(1);
  }
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));

const { client_id, client_secret } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3000/oauth2callback");
oAuth2Client.setCredentials(token);

const youtube = google.youtube({ version: "v3", auth: oAuth2Client });

// ------------------------------------------------------------
// 2. Subir el video
// ------------------------------------------------------------
async function subirVideo() {
  console.log(`📤 Subiendo: "${guionData.titulo}"...`);

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: guionData.titulo,
        description: guionData.descripcion,
        tags: guionData.tags,
        categoryId: "28", // "Science & Technology" — cámbialo según el canal
      },
      status: {
        privacyStatus: "private", // por seguridad: empieza en privado
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(VIDEO_PATH),
    },
  });

  const videoId = response.data.id;

  const resultadoPath = path.join(BASE_DIR, "output", "resultado_subida.json");
  fs.writeFileSync(
    resultadoPath,
    JSON.stringify(
      {
        videoId,
        titulo: guionData.titulo,
        canal: guionData.canal,
        fecha: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`\n✅ Video subido con éxito`);
  console.log(`🔗 https://youtube.com/watch?v=${videoId}`);
  console.log(`⚠️  Está en modo PRIVADO. Cámbialo a público desde YouTube Studio cuando lo revises.`);

  const miniaturaPath = path.join(BASE_DIR, "output", "miniatura.jpg");
  if (fs.existsSync(miniaturaPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(miniaturaPath) },
      });
      console.log(`🖼️  Miniatura personalizada subida`);
    } catch (err) {
      console.log(`⚠️  No se pudo subir la miniatura (algunas cuentas necesitan verificación por teléfono en YouTube): ${err.message}`);
    }
  }
}

subirVideo().catch((err) => {
  console.error("❌ Error subiendo el video:", err.message);
  process.exit(1);
});
