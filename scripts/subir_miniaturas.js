/**
 * subir_miniaturas.js
 * ------------------------------------------------------------
 * Sube a YouTube las miniaturas reparadas que dejó
 * scripts/reparar_miniaturas.js en output/reparaciones/.
 *
 * Necesita config/credentials.json y config/token.json (el workflow
 * los escribe desde los secrets del canal).
 *
 * Uso:
 *   node scripts/subir_miniaturas.js --canal biblia
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const BASE_DIR = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(BASE_DIR, "config", "reparar_publicados.json");
const OUT_DIR = path.join(BASE_DIR, "output", "reparaciones");
const CREDENTIALS_PATH = path.join(BASE_DIR, "config", "credentials.json");
const TOKEN_PATH = path.join(BASE_DIR, "config", "token.json");
const LIMITE_BYTES = 2 * 1024 * 1024;

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i !== -1) return process.argv[i + 1];
  const conIgual = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return conIgual ? conIgual.split("=").slice(1).join("=") : null;
}

const canal = arg("canal");
if (!canal) {
  console.error("❌ Falta --canal (biblia o superate)");
  process.exit(1);
}
for (const [nombre, ruta] of [
  ["config/credentials.json", CREDENTIALS_PATH],
  ["config/token.json", TOKEN_PATH],
  ["config/reparar_publicados.json", MANIFEST_PATH],
]) {
  if (!fs.existsSync(ruta)) {
    console.error(`❌ Falta ${nombre}`);
    process.exit(1);
  }
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
const { client_id, client_secret } = credentials.installed || credentials.web || {};
if (!client_id || !client_secret) {
  console.error("❌ credentials.json no tiene client_id/client_secret");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3000/oauth2callback");
oAuth2Client.setCredentials(token);
const youtube = google.youtube({ version: "v3", auth: oAuth2Client });

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
const casos = (manifest.miniaturas || []).filter((m) => m.canal === canal && m.video_id);

(async () => {
  const fallos = [];
  let subidas = 0;
  for (const { video_id: videoId } of casos) {
    const archivo = path.join(OUT_DIR, `${videoId}.jpg`);
    if (!fs.existsSync(archivo)) {
      console.log(`⏭️  ${videoId}: no hay miniatura reparada, se omite`);
      continue;
    }
    const bytes = fs.statSync(archivo).size;
    if (bytes > LIMITE_BYTES) {
      console.error(`❌ ${videoId}: la imagen pesa ${(bytes / 1024 / 1024).toFixed(2)} MB (máximo 2 MB)`);
      fallos.push(videoId);
      continue;
    }
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(archivo) },
      });
      subidas++;
      console.log(`✅ Miniatura actualizada: ${videoId}`);
    } catch (err) {
      console.error(`❌ ${videoId}: ${err.message}`);
      fallos.push(videoId);
    }
  }

  console.log(`\nMiniaturas subidas: ${subidas}/${casos.length}`);
  if (fallos.length) {
    console.error(`❌ Fallaron: ${fallos.join(", ")}`);
    process.exit(1);
  }
})();
