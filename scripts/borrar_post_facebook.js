/**
 * borrar_post_facebook.js
 * ------------------------------------------------------------
 * Borra una publicación de Facebook por su ID. Se usa al reponer
 * una tarjeta vieja con el cuadro: primero se borra la anterior y
 * después se publica la corregida.
 *
 * Uso:
 *   FB_POST_ID=123_456 FB_ACCESS_TOKEN=xxx node scripts/borrar_post_facebook.js
 * ------------------------------------------------------------
 */

const FB_POST_ID = process.env.FB_POST_ID || process.argv[2];
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

if (!FB_POST_ID || !FB_ACCESS_TOKEN) {
  console.error("❌ Faltan FB_POST_ID y/o FB_ACCESS_TOKEN");
  process.exit(1);
}

(async () => {
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${FB_POST_ID}?access_token=${encodeURIComponent(FB_ACCESS_TOKEN)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    console.log(`✅ Publicación borrada: ${FB_POST_ID}`);
  } catch (err) {
    console.error(`❌ No se pudo borrar ${FB_POST_ID}: ${err.message}`);
    process.exit(1);
  }
})();
