/**
 * subir_facebook.js
 * ------------------------------------------------------------
 * Sube output/video_final.mp4 a una página de Facebook como
 * REEL (no como video normal), usando la API oficial de Meta.
 * Solo corre si el video es vertical (short) — Reels es
 * exclusivamente formato vertical corto.
 *
 * Uso:
 *   FB_PAGE_ID=xxx FB_ACCESS_TOKEN=xxx node scripts/subir_facebook.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

const BASE_DIR = path.join(__dirname, "..");
const VIDEO_PATH = path.join(BASE_DIR, "output", "video_final.mp4");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");

if (!FB_PAGE_ID || !FB_ACCESS_TOKEN) {
  console.error("❌ Faltan FB_PAGE_ID y/o FB_ACCESS_TOKEN");
  process.exit(1);
}

if (!fs.existsSync(VIDEO_PATH) || !fs.existsSync(GUION_PATH)) {
  console.error("❌ Falta video_final.mp4 o guion.json. Corre el resto del pipeline primero.");
  process.exit(1);
}

const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));

if (guionData.formato !== "vertical") {
  console.log("ℹ️  Este video es horizontal, no aplica para Facebook Reels. Se omite este paso.");
  process.exit(0);
}

const GRAPH_VERSION = "v21.0";

// ------------------------------------------------------------
// 1. Iniciar la sesión de subida (Meta nos da un video_id y una URL)
// ------------------------------------------------------------
async function iniciarSubida() {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${FB_PAGE_ID}/video_reels?upload_phase=start&access_token=${FB_ACCESS_TOKEN}`;
  const response = await fetch(url, { method: "POST" });
  const data = await response.json();
  if (!response.ok) throw new Error(`Error iniciando subida: ${JSON.stringify(data)}`);
  return data; // { video_id, upload_url }
}

// ------------------------------------------------------------
// 2. Subir el archivo de video al servidor de Meta
// ------------------------------------------------------------
async function subirArchivo(uploadUrl, videoId) {
  const videoBuffer = fs.readFileSync(VIDEO_PATH);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${FB_ACCESS_TOKEN}`,
      "Content-Type": "application/octet-stream",
      offset: "0",
      file_size: videoBuffer.length.toString(),
    },
    body: videoBuffer,
  });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(`Error subiendo el archivo: ${JSON.stringify(data)}`);
  }
  return data;
}

// ------------------------------------------------------------
// 3. Publicar el Reel (marcarlo como listo, con título/descripción)
// ------------------------------------------------------------
async function publicarReel(videoId) {
  const descripcionCompleta = `${guionData.titulo}\n\n${guionData.descripcion}`;
  const params = new URLSearchParams({
    upload_phase: "finish",
    video_id: videoId,
    description: descripcionCompleta,
    video_state: "PUBLISHED",
    access_token: FB_ACCESS_TOKEN,
  });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${FB_PAGE_ID}/video_reels?${params}`;
  const response = await fetch(url, { method: "POST" });
  const data = await response.json();
  if (!response.ok) throw new Error(`Error publicando el reel: ${JSON.stringify(data)}`);
  return data;
}

// ------------------------------------------------------------
// Ejecutar los 3 pasos en orden
// ------------------------------------------------------------
(async () => {
  try {
    console.log("📤 Iniciando subida a Facebook Reels...");
    const { video_id, upload_url } = await iniciarSubida();
    console.log(`  ✅ Sesión iniciada, video_id: ${video_id}`);

    console.log("📦 Subiendo archivo de video...");
    await subirArchivo(upload_url, video_id);
    console.log("  ✅ Archivo subido");

    console.log("🚀 Publicando el Reel...");
    await publicarReel(video_id);
    console.log(`\n✅ Reel publicado en Facebook con éxito (video_id: ${video_id})`);
  } catch (err) {
    console.error("❌ Error subiendo a Facebook:", err.message);
    // No detenemos el resto del proceso por esto — el video ya se subió
    // a YouTube de todas formas, Facebook es un extra
    process.exit(0);
  }
})();
