// scripts/formato_textos.js
const PROHIBIDAS_DESC = /(me encontr[eé]|yo lo uso|a m[ií] me|me pas[oó]|lo uso a diario|lo uso todos los d[ií]as)/i;

function ajustarTitulo(t) {
  let base = String(t || "").replace(/#shorts/gi, "").replace(/\s+/g, " ").trim();
  if (base.length > 52) base = base.slice(0, 52).replace(/\s+\S*$/, "").trim();
  return `${base} #Shorts`;
}

function largoTituloOk(t, max = 52) {
  return String(t || "").replace(/#shorts/gi, "").trim().length <= max;
}

function ajustarTituloLargo(t) {
  let base = String(t || "").replace(/#shorts/gi, "").replace(/\s+/g, " ").trim();
  if (base.length > 60) base = base.slice(0, 60).replace(/\s+\S*$/, "").trim();
  return base;
}

function sanearHashtags(h, porDefecto) {
  const base = Array.isArray(h) ? h : [];
  const limpios = base
    .map((x) => String(x).trim())
    .map((x) => (x.startsWith("#") ? x : "#" + x))
    .filter((x) => /^#[\p{L}\p{N}_]{3,30}$/u.test(x) && x.toLowerCase() !== "#shorts");
  return [...new Set([...limpios, ...(porDefecto || ["#Shorts2"]).filter((x) => x.toLowerCase() !== "#shorts")])].slice(0, 2);
}

function frases(t) {
  return String(t || "").match(/[^.!?]+[.!?]*/g) || [String(t || "")];
}

function limpiarParrafo(t) {
  const s = String(t || "").replace(/https?:\/\/\S+/g, "").replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  const todas = frases(s).map((f) => f.trim()).filter(Boolean);
  const buenas = todas.filter((f) => !PROHIBIDAS_DESC.test(f));
  return (buenas.length ? buenas : todas).join(" ").trim();
}

function quitarSuscripcion(t) {
  const sin = frases(t).filter((f) => !/suscr[ií]b/i.test(f)).map((f) => f.trim()).join(" ").trim();
  return sin || t;
}

function lineaFinal(promo, hashtags) {
  let ultimo = "";
  if (promo && promo.activa && promo.link_telegram) ultimo += `👇 Más ofertas y cupones en Telegram: ${promo.link_telegram}`;
  if (hashtags && hashtags.length) ultimo += (ultimo ? "\n" : "") + hashtags.join(" ");
  return ultimo;
}

// YouTube: línea inicial opcional (ej. el pasaje bíblico), link de ofertas si existe, párrafo útil, Telegram y hashtags.
function armarDescripcion(parrafo, promo, hashtags, inicial) {
  const partes = [];
  if (inicial) partes.push(inicial);
  if (promo && promo.link_sitio) partes.push(`👉 Ofertas de gadgets al mejor precio: ${promo.link_sitio}`);
  partes.push(parrafo.trim());
  const ultimo = lineaFinal(promo, hashtags);
  if (ultimo) partes.push(ultimo);
  return partes.join("\n\n");
}

// Facebook: la invitación propia de Facebook va PRIMERO (visible antes del "ver más"),
// después el contenido útil, sin "suscríbete" ni #Shorts.
// Ojo: Facebook reduce el alcance de los posts con links externos, así que NO se pegan
// las URLs (sitio ni Telegram); en su lugar se indica que los enlaces están en la
// biografía de la página. Los hashtags sí se conservan. (En YouTube sí se pueden llevar links.)
function armarDescripcionFacebook(parrafo, promo, hashtags, cierreFb, inicial) {
  const partes = [];
  if (cierreFb) partes.push(cierreFb);
  if (inicial) partes.push(inicial);
  partes.push(quitarSuscripcion(parrafo).trim());
  if (promo && promo.activa) partes.push("Los enlaces de ofertas están en la biografía de la página.");
  if (hashtags && hashtags.length) partes.push(hashtags.join(" "));
  return partes.join("\n\n");
}

// cierre_facebook puede ser string (se usa tal cual) o array de variantes (elige 1 al azar).
function elegirCierreFacebook(cierre) {
  if (Array.isArray(cierre)) return cierre.length ? cierre[Math.floor(Math.random() * cierre.length)] : null;
  return cierre || null;
}

function palabrasClave(t) {
  return new Set(
    String(t || "").toLowerCase().replace(/#shorts/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  );
}

// true si dos títulos comparten demasiadas palabras (se consideran "el mismo")
function similares(a, b, umbral = 0.6) {
  const A = palabrasClave(a), B = palabrasClave(b);
  if (!A.size || !B.size) return false;
  let comunes = 0;
  A.forEach((w) => { if (B.has(w)) comunes++; });
  return comunes / Math.min(A.size, B.size) >= umbral;
}

module.exports = {
  ajustarTitulo, ajustarTituloLargo, largoTituloOk, sanearHashtags, limpiarParrafo, quitarSuscripcion,
  armarDescripcion, armarDescripcionFacebook, elegirCierreFacebook, similares,
};
