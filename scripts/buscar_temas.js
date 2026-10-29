// scripts/buscar_temas.js

// --- Filtro de calidad de noticias (canal de tecnología) ---
// El canal es de trucos y apps para gente de Colombia: las ofertas, los precios
// y las noticias de disponibilidad en otros países (EE. UU., México, India...)
// no le sirven a la audiencia. Los feeds de tecnología traen mucho de eso, así
// que se descarta antes de que el LLM elija una idea.
const DESCARTAR = [
  // ofertas, descuentos, cupones y promociones
  /\bofertas?\b|descuentos?|descuentazo|rebajas?|cup[oó]n|promoci[oó]n|\bpromos?\b|black friday|cyber monday|prime day/i,
  /\bdeals?\b|\bdiscount|price drop|best buy|\bsave \$|\$\s?\d/i,
  // precios y consejos de compra
  /\bprecio\b|\bcomprar\b|\bcompra\b|\bdesde \$|\bpor \$/i,
  // resultados financieros / bolsa
  /\bearnings\b|\brevenue\b|resultados financieros|\bingresos\b|\bacciones\b|\bbolsa\b|\bQ[1-4]\b/i,
  // disponibilidad o precios que no aplican en Colombia
  /\bAT&T\b|\bVerizon\b|\bT-Mobile\b|US-only|en EE\. ?UU\.?|en Estados Unidos|\bM[eé]xico\b|\bMXN\b|pesos mexicanos|\bIndia\b|₹|\bBizum\b/i,
];

// Temas que sí le sirven al canal: Android, apps, seguridad, privacidad, batería...
const RELEVANTE = /android|google|pixel|samsung|galaxy|xiaomi|redmi|poco|oppo|vivo|oneplus|motorola|one ?ui|hyperos|whatsapp|telegram|gmail|chrome|youtube|play store|\bapps?\b|actualizaci[oó]n|seguridad|privacidad|estafa|fraude|phishing|contrase[nñ]a|SMS|bater[ií]a|cargador|wi-?fi|bluetooth|datos m[oó]viles|celular|smartphone|m[oó]vil/i;

function aptoParaCanal(n) {
  const titulo = String(n.titulo || "");
  const texto = `${titulo} ${n.resumen || ""}`;
  if (DESCARTAR.some((re) => re.test(texto))) return false;
  // La relevancia se exige en el TÍTULO: si solo aparece en el resumen, suele ser
  // una noticia de otro tema que menciona una app de pasada (huelgas, sucesos...).
  return RELEVANTE.test(titulo);
}

// Nombre legible de la fuente (weblogssl aloja Xataka y Xataka Android en feeds distintos).
function nombreFuente(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^feeds\./, "");
  if (host === "weblogssl.com") {
    return /xatakandroid/i.test(u.pathname) ? "xatakandroid.com" : "xataka.com";
  }
  return host;
}

function limpiar(s) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function leerFeed(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CanalBot/1.0)" },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
    return items.slice(0, 12).map((it) => {
      const g = (tag) => {
        const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return m ? limpiar(m[1]) : "";
      };
      return {
        fuente: nombreFuente(url),
        feed: url, // dos feeds del mismo dominio (Xataka / Xataka Android) no comparten cupo
        titulo: g("title"),
        resumen: g("description").slice(0, 300),
        fecha: g("pubDate"),
        link: g("link"),
      };
    }).filter((x) => x.titulo);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function buscarCandidatos(feeds, max = 15, diasMax = 14) {
  const lotes = await Promise.all((feeds || []).map(leerFeed));
  const limite = Date.now() - diasMax * 24 * 3600 * 1000;
  const todos = lotes.flat().filter((x) => {
    const t = Date.parse(x.fecha);
    return (isNaN(t) || t >= limite) && aptoParaCanal(x);
  });
  todos.sort((a, b) => (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0));
  const porFuente = {};
  const salida = [];
  for (const x of todos) {
    const clave = x.feed || x.fuente;
    porFuente[clave] = (porFuente[clave] || 0) + 1;
    if (porFuente[clave] <= 3) salida.push(x);
    if (salida.length >= max) break;
  }
  return salida;
}

module.exports = { buscarCandidatos, aptoParaCanal };
