/**
 * autorizar_youtube.js
 * ------------------------------------------------------------
 * SE CORRE UNA SOLA VEZ (por canal/cuenta de YouTube).
 * Abre tu navegador para que autorices el acceso a tu canal,
 * y guarda un "token.json" que los demás scripts van a usar
 * para subir videos sin pedirte permiso cada vez.
 *
 * Uso:
 *   node scripts/autorizar_youtube.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { google } = require("googleapis");

const BASE_DIR = path.join(__dirname, "..");
const CREDENTIALS_PATH = path.join(BASE_DIR, "config", "credentials.json");
const TOKEN_PATH = path.join(BASE_DIR, "config", "token.json");

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error("❌ No se encontró config/credentials.json. Descárgalo de Google Cloud primero.");
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
const { client_id, client_secret } = credentials.installed || credentials.web;

const REDIRECT_URI = "http://localhost:3000/oauth2callback";
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // necesario para obtener refresh_token (acceso permanente)
  scope: SCOPES,
  prompt: "consent",
});

console.log("🌐 Copia y pega esta URL en tu navegador para autorizar el acceso a tu canal:\n");
console.log(`   ${authUrl}\n`);
console.log("   (después de aceptar, vuelve aquí — esta ventana espera automáticamente)\n");

const server = http
  .createServer(async (req, res) => {
    if (!req.url.startsWith("/oauth2callback")) return;

    const qs = new URL(req.url, "http://localhost:3000").searchParams;
    const code = qs.get("code");

    res.end("✅ Autorización recibida. Ya puedes cerrar esta pestaña y volver a la terminal.");
    server.close();

    try {
      const { tokens } = await oAuth2Client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log(`\n✅ ¡Listo! Token guardado en: ${TOKEN_PATH}`);
      console.log("   Ya puedes usar subir_youtube.js sin volver a autorizar.");
      process.exit(0);
    } catch (err) {
      console.error("❌ Error obteniendo el token:", err.message);
      process.exit(1);
    }
  })
  .listen(3000);
