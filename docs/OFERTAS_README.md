# Pipeline de Ofertas - Video Automático

## Resumen

Genera videos automáticos de ofertas de Amazon para YouTube Shorts y Facebook Reels.

## Flujo Completo

```
7:00 PM (cron)
    │
    ▼
obtener_ofertas.js          ← Descarga ofertas del JSON externo
    │
    ▼
generar_card_oferta.js      ← Crea cards profesionales (fondo oscuro, producto grande)
    │
    ▼
generar_narracion_ofertas.js ← Genera narración para TTS
    │
    ▼
copiar cards → imagenes/    ← Prepara escenas para ensamblar
    │
    ▼
generar_audio.py            ← TTS con voz colombiana + subtítulos Whisper
    │
    ▼
ensamblar_video.js          ← Ensambla: cards + audio + música + subtítulos
    │
    ▼
subir_youtube.js            ← Sube a YouTube (privado)
    │
    ▼
subir_facebook.js           ← Sube a Facebook Reels
    │
    ▼
notificar_telegram.js       ← Notifica resultado
    │
    ▼ (si YouTube + Facebook fallan)
enviar_telegram_respaldo.js ← Envía video a Telegram como respaldo
```

## Archivos

| Archivo | Función |
|---------|---------|
| `obtener_ofertas.js` | Descarga ofertas, crea guion.json + imagenes/ |
| `generar_card_oferta.js` | Crea cards profesionales en cards/ |
| `generar_narracion_ofertas.js` | Genera narración TTS para cada oferta |
| `generar_audio.py` | Convierte texto a voz + subtítulos ASS |
| `ensamblar_video.js` | Ensambla video final con FFmpeg |
| `subir_youtube.js` | Sube a YouTube via API |
| `subir_facebook.js` | Sube a Facebook Reels via API |
| `notificar_telegram.js` | Notifica resultado por Telegram |
| `enviar_telegram_respaldo.js` | Envía video a Telegram si falla YouTube |

## Variables de Entorno

### GitHub Secrets

| Secret | Uso |
|--------|-----|
| `YT_CREDENTIALS_JSON` | OAuth credentials YouTube (canal tecnología) |
| `YT_TOKEN_JSON` | OAuth token YouTube |
| `FB_PAGE_ID_TECNOLOGIA` | Facebook Page ID |
| `FB_ACCESS_TOKEN_TECNOLOGIA` | Facebook Access Token |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram |
| `TELEGRAM_CHAT_ID` | Chat ID Telegram |

### GitHub Variables

| Variable | Uso |
|----------|-----|
| `OFERTAS_JSON_URL` | URL raw de seleccion_video.json |

## Narración (TTS)

La narración se genera automáticamente para cada oferta:

```
"Atentos que esto es lo mejor de hoy: Impresora térmica Bluetooth, 
por tan solo ochenta y nueve mil novecientos pesos, con treinta 
por ciento de descuento. Ahí les va otra: Detector de cámara oculta, 
por cuarenta y cinco mil pesos. Y eso es todo por hoy. Los links 
están en la descripción. Síganos para más ofertas."
```

- Voz: `es-CO-GonzaloNeural` (colombiano)
- Velocidad: -18% (más pausado)
- Subtítulos: timing real con Whisper

## Descripción para YouTube

```
1. Impresora térmica Bluetooth de etiquetas — ~$89.900 COP (-30%)
   🔗 https://amazon.com/dp/...

2. Detector de cámara oculta y rastreador GPS — ~$45.000 COP
   🔗 https://amazon.com/dp/...

📢 Más ofertas en nuestro Telegram.
```

## Tags

```
ofertas, descuentos, amazon, ofertas del día, descuentos amazon, 
compras inteligentes, tecnología, ahorro
```

## Formato del Video

| Parámetro | Valor |
|-----------|-------|
| Resolución | 1080x1920 (vertical) |
| FPS | 30 |
| Formato | H.264 + AAC |
| Duración | Variable (según cantidad de ofertas) |
| Música | Fondo con ducking automático |
| Subtítulos | Karaoke (ASS con timing real) |

## Cómo Probar

1. GitHub → Actions → **Canal Ofertas - Video Automático**
2. Click **Run workflow**
3. Esperar ~5-10 minutos
4. Revisar YouTube Studio (video en privado)
5. Revisar Facebook (Reel publicado)
6. Revisar Telegram (notificación)
