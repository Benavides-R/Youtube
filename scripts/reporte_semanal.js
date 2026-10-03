// Reporte semanal de progreso de YouTube → Telegram
//
// Por cada canal activo (reportes/canales.json) mide:
//   - suscriptores y vistas totales (delta vs. semana anterior)
//   - videos publicados en los últimos 7 días + vistas/likes de esos videos
//   - el video con más vistas de la semana
// Envía el resumen por Telegram y guarda snapshot para comparar
// la próxima semana. Solo fetch nativo (Node 18+), sin dependencias.
//
// Env:
//   YOUTUBE_API_KEY     - API key con YouTube Data API v3 habilitado (obligatorio)
//   TELEGRAM_BOT_TOKEN  - igual que los demás scripts (obligatorio)
//   TELEGRAM_CHAT_ID    - igual que los demás scripts (obligatorio)

const fs = require("fs");
const path = require("path");

const BASE_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BASE_DIR, "reportes", "canales.json");
const SNAPSHOT_PATH = path.join(BASE_DIR, "reportes", "snapshot.json");
const API = "https://www.googleapis.com/youtube/v3";
const DIAS = 7;

const num = new Intl.NumberFormat("es-CO");

const { YOUTUBE_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

if (!YOUTUBE_API_KEY) {
  console.error("❌ Falta el secret YOUTUBE_API_KEY.");
  console.error("   Cómo crearlo:");
  console.error("   1. https://console.cloud.google.com/apis/credentials (mismo proyecto donde está la OAuth)");
  console.error("   2. Crear credenciales → API key");
  console.error("   3. Si te lo pide, habilita 'YouTube Data API v3'");
  console.error("   4. Repo → Settings → Secrets and variables → Actions → New secret → nombre: YOUTUBE_API_KEY");
  process.exit(1);
}
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("❌ Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (secrets del repo).");
  process.exit(1);
}

async function api(ruta, params) {
  const url = new URL(`${API}/${ruta}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const motivo = (data.error && data.error.message) || res.statusText;
    throw new Error(`${ruta}: ${motivo}`);
  }
  return data;
}

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Resuelve el channel_id (UC...) una sola vez y lo cachea en canales.json
async function resolverCanal(canal) {
  if (canal.channel_id) return canal.channel_id;
  if (canal.handle) {
    const r = await api("channels", { part: "id,snippet", forHandle: canal.handle });
    if (r.items && r.items.length) {
      canal.channel_id = r.items[0].id;
      return canal.channel_id;
    }
  }
  let r = await api("search", { part: "snippet", type: "channel", maxResults: "5", q: canal.nombre });
  let items = r.items || [];
  if (!items.length) {
    // Reintenta sin el sufijo después de " - " (ej: "... - Android Apps y Trucos")
    const corto = canal.nombre.replace(/\s+[-–—|].*$/, "").trim();
    if (corto && corto !== canal.nombre) {
      console.warn(`⚠️  Sin resultados con "${canal.nombre}"; reintento con "${corto}"`);
      r = await api("search", { part: "snippet", type: "channel", maxResults: "5", q: corto });
      items = r.items || [];
    }
  }
  if (!items.length) throw new Error(`No encontré el canal "${canal.nombre}"`);
  const exacto = items.find((i) => norm(i.snippet.title) === norm(canal.nombre));
  const elegido = exacto || items[0];
  if (!exacto) {
    console.warn(`⚠️  "${canal.nombre}" no coincide exacto; elegí "${elegido.snippet.title}" — verifica reportes/canales.json`);
  }
  // En search de canales el ID viene en id.channelId (NO en snippet)
  const cid = elegido.id?.channelId || elegido.snippet?.channelId;
  if (!cid) throw new Error(`La búsqueda de "${canal.nombre}" no devolvió channel_id`);
  canal.channel_id = cid;
  return canal.channel_id;
}

async function obtenerDatos(canal) {
  const id = await resolverCanal(canal);
  const ch = await api("channels", { part: "snippet,statistics,contentDetails", id });
  const item = ch.items && ch.items[0];
  if (!item) throw new Error(`El canal ${id} no existe`);
  const stats = item.statistics;

  const uploads = item.contentDetails.relatedPlaylists.uploads;
  let recientes = [];
  let aviso = null;
  if (!uploads) {
    aviso = "el canal no expone su playlist de uploads — no pude revisar videos de la semana";
  } else {
    try {
      const lista = await api("playlistItems", { part: "contentDetails,snippet", playlistId: uploads, maxResults: "25" });
      const desde = Date.now() - DIAS * 86400000;
      recientes = (lista.items || [])
        .map((i) => ({
          id: i.contentDetails.videoId,
          fecha: Date.parse(i.contentDetails.videoPublishedAt || i.snippet.publishedAt),
          titulo: i.snippet.title,
        }))
        .filter((v) => v.fecha >= desde);
    } catch (err) {
      aviso = `no pude leer los videos de la semana (${err.message})`;
    }
  }

  let vistasSemana = 0;
  let likesSemana = 0;
  let top = null;
  if (recientes.length) {
    const vids = await api("videos", { part: "statistics", id: recientes.map((v) => v.id).join(",") });
    const porId = new Map((vids.items || []).map((v) => [v.id, v.statistics]));
    for (const v of recientes) {
      const s = porId.get(v.id) || {};
      const views = parseInt(s.viewCount || "0", 10);
      vistasSemana += views;
      likesSemana += parseInt(s.likeCount || "0", 10);
      if (!top || views > top.views) top = { titulo: v.titulo, views };
    }
  }

  return {
    id,
    nombre: item.snippet.title,
    subs: parseInt(stats.subscriberCount || "0", 10),
    subsVisibles: stats.subscriberCount !== undefined,
    vistas: parseInt(stats.viewCount || "0", 10),
    videosSemana: recientes.length,
    vistasSemana,
    likesSemana,
    top,
    aviso,
  };
}

function delta(actual, previo) {
  if (previo === undefined || previo === null) return "n/a";
  const d = actual - previo;
  if (d === 0) return "±0";
  return (d > 0 ? "+" : "") + num.format(d);
}

(async () => {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  const activos = cfg.canales.filter((c) => c.activo !== false);
  const previo = fs.existsSync(SNAPSHOT_PATH)
    ? JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"))
    : { canales: {} };

  const resultados = [];
  const errores = [];
  for (const canal of activos) {
    try {
      resultados.push(await obtenerDatos(canal));
      console.log(`✅ ${canal.nombre}`);
    } catch (err) {
      errores.push(`${canal.nombre}: ${err.message}`);
      console.error(`❌ ${canal.nombre}: ${err.message}`);
    }
  }
  if (!resultados.length) {
    console.error("❌ Ningún canal pudo medirse — no se envía reporte.");
    process.exit(1);
  }

  // Persiste los channel_id resueltos (el workflow los commitea)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");

  const fecha = (d) => d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  const inicio = new Date(Date.now() - DIAS * 86400000);
  const lineas = [`📊 Reporte semanal YouTube — ${fecha(inicio)} al ${fecha(new Date())}`, ""];

  let tSubs = 0;
  let tSubsPrev = 0;
  let tVistasSem = 0;
  let tVideosSem = 0;
  let hayPrevio = false;

  for (const r of resultados) {
    const p = previo.canales[r.id];
    if (p) hayPrevio = true;
    tSubs += r.subs;
    tSubsPrev += p ? p.subs : 0;
    tVistasSem += r.vistasSemana;
    tVideosSem += r.videosSemana;

    lineas.push(`${r.nombre}`);
    lineas.push(
      `  👥 Suscriptores: ${r.subsVisibles ? num.format(r.subs) : "ocultos"} (${p ? delta(r.subs, p.subs) : "n/a"})`
    );
    lineas.push(
      `  👁️ Vistas totales: ${num.format(r.vistas)} (${p ? delta(r.vistas, p.vistas) : "n/a"})`
    );
    lineas.push(
      `  🎬 +${r.videosSemana} videos · ${num.format(r.vistasSemana)} vistas · ${num.format(r.likesSemana)} likes`
    );
    if (r.top) {
      const t = r.top.titulo.length > 58 ? r.top.titulo.slice(0, 58) + "…" : r.top.titulo;
      lineas.push(`  🔥 Top: "${t}" — ${num.format(r.top.views)} vistas`);
    }
    if (r.aviso) lineas.push(`  ⚠️ ${r.aviso}`);
    lineas.push("");
  }

  lineas.push(
    `🏁 Total: ${num.format(tSubs)} subs (${hayPrevio ? delta(tSubs, tSubsPrev) : "n/a"}) · ` +
      `${num.format(tVistasSem)} vistas esta semana · +${tVideosSem} videos`
  );
  if (errores.length) {
    lineas.push("");
    lineas.push("⚠️ Con problemas:");
    for (const e of errores) lineas.push(`• ${e}`);
  }
  const mensaje = lineas.join("\n");
  console.log("\n" + mensaje);

  // Envía primero; solo si llega, guarda el snapshot de esta semana
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje }),
  });
  if (!res.ok) {
    throw new Error(`Telegram: ${await res.text()}`);
  }

  const nuevo = {
    fecha: new Date().toISOString(),
    canales: { ...previo.canales },
  };
  for (const r of resultados) {
    nuevo.canales[r.id] = { subs: r.subs, vistas: r.vistas };
  }
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(nuevo, null, 2) + "\n");

  console.log("✅ Reporte enviado por Telegram");
})().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
