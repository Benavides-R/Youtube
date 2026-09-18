# MEMORY.md - Historial de Cambios del Pipeline de Ofertas

## Fecha: 18 de Septiembre 2026

---

## Resumen General

Se construyó un pipeline completo de automatización de ofertas de Amazon para YouTube Shorts y Facebook Reels, partiendo de un sistema que solo generaba cards estáticas para Telegram.

---

## Pipeline Final (el que queda activo)

```
obtener_ofertas.js          → Descarga ofertas del JSON externo
generar_card_oferta.js      → Crea cards profesionales (1080x1920)
generar_narracion_ofertas.js → Genera narración TTS para cada oferta
copiar cards → imagenes/    → Prepara escenas para ensamblar
generar_audio.py            → TTS con voz colombiana + subtítulos Whisper
ensamblar_video.js          → Ensambla: cards + audio + música + subtítulos
subir_youtube.js            → Sube a YouTube (privado)
subir_facebook.js           → Sube a Facebook Reels
notificar_telegram.js       → Notifica resultado por Telegram
enviar_telegram_respaldo.js → Envía video a Telegram si falla YouTube
marcar_ofertas_usadas.js    → Marca ofertas procesadas
```

---

## Archivos Creados (Nuevos)

### scripts/generar_card_oferta.js
- Genera tarjetas profesionales de oferta (1080x1920)
- Fondo oscuro con glow sutil centrado
- Producto centrado sin estirar (contain, 750px)
- Badge rojo "OFERTA DEL DÍA"
- Precio original tachado + precio con descuento en amarillo
- Líneas decorativas sutiles
- Logo centrado abajo
- Retry 3 intentos con rotación de paleta
- 6 paletas de colores profesionales

### scripts/generar_narracion_ofertas.js
- Genera narración diseñada para TTS
- Menciona precio original cuando hay descuento
- Precio sin puntos para que TTS lea bien ("165900 pesos" no "165.900 pesos")
- Ganchos aleatorios colombianos
- Conectores variados entre productos
- Cierres profesionales

### .github/workflows/canal_ofertas_video.yml
- Workflow completo de 12 pasos
- Incluye git stash para evitar conflictos de push
- Credenciales YouTube escritas desde secrets
- Cards copiadas a imagenes/ antes de ensamblar
- Respaldo a Telegram si falla YouTube/Facebook

### docs/OFERTAS_README.md
- Documentación completa del pipeline
- Incluye narración de ejemplo
- Incluye descripción de ejemplo
- Instrucciones de prueba

---

## Archivos Eliminados

### canal_ofertas_cards.yml
- Workflow viejo que solo generaba cards para Telegram
- Reemplazado por canal_ofertas_video.yml

### enviar_telegram_ofertas.js
- Script que enviaba cards a Telegram como album
- Solo lo usaba canal_ofertas_cards.yml
- Ya no es necesario con el pipeline de video

---

## Cambios en Archivos Existentes

### obtener_ofertas.js
- Eliminado límite MAX_OFERTAS_POR_VIDEO = 5
- Ahora procesa TODAS las ofertas disponibles
- MIN_OFERTAS_POR_VIDEO = 1

### ensamblar_video.js
- Sin cambios, funciona con cards (1080x1920) igual que con fotos

### subir_youtube.js
- Sin cambios, funciona igual

### subir_facebook.js
- Sin cambios, funciona igual

---

## Manejo de Precios

### En Cards (generar_card_oferta.js)
- `extraerPrecio()`: Extrae número del texto, valida > 1000
- `calcularPrecioOriginal()`: Calcula precio original desde actual + descuento
- Si hay descuento: precio original tachado (gris) + precio actual en amarillo
- Si no hay descuento: precio actual en verde
- Si no hay precio válido: "VER OFERTA" en color de acento

### En Narración (generar_narracion_ofertas.js)
- `precioParaVoz()`: Limpia $, ~, COP, quita puntos
- Precio se lee como número limpio: "165900 pesos" (no "165.900 pesos")
- num2words en generar_audio.py convierte a palabras
- `formatearPrecio()`: Para mostrar en pantalla con puntos

### Ejemplo de Narración
```
"Atentos que esto es lo mejor de hoy: Impresora térmica Bluetooth, 
que costaba 237000 pesos, ahora por tan solo 165900 pesos, 
con 30 por ciento de descuento."
```

---

## Manejo de Subtítulos

### Formato ASS con Karaoke
- `generar_audio.py` genera subtítulos .ass con tags \k
- Cada palabra se resalta en amarillo cuando se pronuncia
- Timing real obtenido de Whisper (no estimado)
- Alineación: 2 (abajo centrado) para no tapar producto
- Resolución: 1080x1920

---

## Variables de Entorno Requeridas

### GitHub Secrets
| Secret | Uso |
|--------|-----|
| `YT_CREDENTIALS_JSON` | OAuth YouTube (canal tecnología) |
| `YT_TOKEN_JSON` | Token OAuth YouTube |
| `FB_PAGE_ID_TECNOLOGIA` | Facebook Page ID |
| `FB_ACCESS_TOKEN_TECNOLOGIA` | Facebook Access Token |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram |
| `TELEGRAM_CHAT_ID` | Chat ID Telegram |

### GitHub Variables
| Variable | Uso |
|----------|-----|
| `OFERTAS_JSON_URL` | URL raw de seleccion_video.json |

---

## Cron Job

- **Horario:** 7:00 PM diario
- **Workflow:** `canal_ofertas_video.yml`
- **URL:** `https://api.github.com/repos/Benavides-R/Youtube/actions/workflows/canal_ofertas_video.yml/dispatches`

---

## Errores Encontrados y Corregidos

1. **FFmpeg logo input index**: `[1:v]` usado dos veces → corregido a `[2:v]`
2. **Telegram sendMediaGroup captions**: Solo primer caption visible → todo en uno
3. **Precio tachado mostraba precio actual**: Mostraba precio actual tachado en vez de original → corregido
4. **TTS leía puntos en precios**: "165.900" podía causar problemas → ahora lee "165900"
5. **Git push error**: `cannot pull with rebase: unstaged changes` → agregado `git stash`
6. **Límite de ofertas**: Solo procesaba 5 máximo → ahora procesa todas
7. **Glow effect fallaba**: `geq` filter complejo → simplificado a rectángulo semitransparente

---

## Canales YouTube Configurados

| Canal | Credenciales |
|-------|-------------|
| Sabiduria Biblica | `YT_CREDENTIALS_JSON_BIBLIA` + `YT_TOKEN_JSON_BIBLIA` |
| Superate777 | `YT_CREDENTIALS_JSON_SUPERATE` + `YT_TOKEN_JSON_SUPERATE` |
| Tecnología / Ofertas | `YT_CREDENTIALS_JSON` + `YT_TOKEN_JSON` |

---

## Canales Facebook Configurados

| Página | Credenciales |
|--------|-------------|
| Sabiduria Biblica | `FB_PAGE_ID_BIBLIA` + `FB_ACCESS_TOKEN_BIBLIA` |
| Superate777 | `FB_PAGE_ID_SUPERATE` + `FB_ACCESS_TOKEN_SUPERATE` |
| Tecnología / Ofertas | `FB_PAGE_ID_TECNOLOGIA` + `FB_ACCESS_TOKEN_TECNOLOGIA` |

---

## Logos

| Archivo | Canal |
|---------|-------|
| `assets/logo.png` | Sabiduria Biblica |
| `assets/logo_superate.png` | Superate777 |
| `assets/logo_ofertas.png` | Ofertas |

---

## Notas Importantes

1. **Sin límite de ofertas**: El pipeline procesa todas las ofertas disponibles en el JSON
2. **Fotos de Amazon no se usan en cards**: Las cards usan las fotos descargadas pero sobre fondo profesional
3. **YouTube sube en privado**: Siempre sube como privado, revisar antes de hacer público
4. **Facebook sube como Reel**: Solo funciona con formato vertical
5. **Telegram es respaldo**: Solo se envía si YouTube Y Facebook fallan
6. **Ofertas se marcan después**: Solo se marcan como usadas si la subida fue exitosa
