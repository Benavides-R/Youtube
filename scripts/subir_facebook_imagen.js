/**
 * subir_facebook_imagen.js
 * ------------------------------------------------------------
 * Sube output/tarjeta_final.jpg a una página de Facebook como
 * publicación de foto, con la descripción generada.
 *
 * Uso:
 *   FB_PAGE_ID=xxx FB_ACCESS_TOKEN=xxx node scripts/subir_facebook_imagen.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

const BASE_DIR = path.join(__dirname, "..");
const IMAGEN_PATH = path.join(BASE_DIR, "output", "tarjeta_final.jpg");
const CITA_PATH = path.join(BASE_DIR, "output", "cita.json");

if (!FB_PAGE_ID || !FB_ACCESS_TOKEN) {
  console.error("❌ Faltan FB_PAGE_ID y/o FB_ACCESS_TOKEN");
  process.exit(1);
}
if (!fs.existsSync(IMAGEN_PATH) || !fs.existsSync(CITA_PATH)) {
  console.error("❌ Falta la tarjeta o la cita generada.");
  process.exit(1);
}

const cita = JSON.parse(fs.readFileSync(CITA_PATH, "utf-8"));

(async () => {
  try {
    const form = new FormData();
    form.append("caption", cita.descripcion);
    form.append("access_token", FB_ACCESS_TOKEN);
    form.append("source", new Blob([fs.readFileSync(IMAGEN_PATH)]), "tarjeta.jpg");

    const response = await fetch(`https://graph.facebook.com/v21.0/${FB_PAGE_ID}/photos`, {
      method: "POST",
      body: form,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    console.log(`✅ Tarjeta publicada en Facebook (post_id: ${data.post_id || data.id})`);

    fs.writeFileSync(
      path.join(BASE_DIR, "output", "resultado_imagen.json"),
      JSON.stringify({ verso: cita.verso, referencia: cita.referencia }, null, 2)
    );
  } catch (err) {
    console.error("❌ Error subiendo la tarjeta a Facebook:", err.message);
    process.exit(0); // no tumbamos el workflow por esto
  }
})();
