// scripts/buscar_temas.js
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
        fuente: new URL(url).hostname.replace(/^www\./, ""),
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
    return isNaN(t) || t >= limite;
  });
  todos.sort((a, b) => (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0));
  const porFuente = {};
  const salida = [];
  for (const x of todos) {
    porFuente[x.fuente] = (porFuente[x.fuente] || 0) + 1;
    if (porFuente[x.fuente] <= 3) salida.push(x);
    if (salida.length >= max) break;
  }
  return salida;
}

module.exports = { buscarCandidatos };
