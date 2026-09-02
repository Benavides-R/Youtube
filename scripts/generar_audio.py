"""
generar_audio.py
------------------------------------------------------------
Lee output/guion.json y convierte el campo "guion" a audio
usando edge-tts. Genera output/subtitulos.ass con el tiempo
EXACTO de cada palabra, sacado escuchando el audio real con
Whisper (no es una estimación por conteo de palabras — es el
timing real del sonido, mucho más preciso).

Uso:
    python scripts/generar_audio.py

Requiere:
    pip install edge-tts faster-whisper num2words

Output:
    output/audio.mp3
    output/subtitulos.ass
------------------------------------------------------------
"""

import asyncio
import json
import os
import re
import sys

import edge_tts

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUION_PATH = os.path.join(BASE_DIR, "output", "guion.json")
AUDIO_PATH = os.path.join(BASE_DIR, "output", "audio.mp3")
ASS_PATH = os.path.join(BASE_DIR, "output", "subtitulos.ass")

RATE = "-12%"
PITCH = "+0Hz"


def segundos_a_timestamp_ass(segundos: float) -> str:
    """Formato ASS: H:MM:SS.cc (centésimas, no milisegundos)"""
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    segs = int(segundos % 60)
    centesimas = int((segundos - int(segundos)) * 100)
    return f"{horas}:{minutos:02d}:{segs:02d}.{centesimas:02d}"


def normalizar_numeros(texto: str) -> str:
    """
    Convierte números a palabras en español ANTES de la síntesis de voz
    (ej. "23:4" -> "veintitrés cuatro", "2024" -> "dos mil veinticuatro").
    Esto evita que Whisper transcriba mal referencias con números (el
    problema real detrás de los avisos de baja calidad de audio) — tanto
    la voz como la transcripción trabajan sobre el mismo texto claro.
    """
    try:
        from num2words import num2words
    except ImportError:
        return texto  # si no está instalado, seguimos sin normalizar (no es crítico)

    def reemplazar(match):
        numero = match.group()
        try:
            return num2words(int(numero), lang="es")
        except (ValueError, OverflowError):
            return numero

    return re.sub(r"\d+", reemplazar, texto)


def generar_encabezado_ass(ancho: int, alto: int, tamano_fuente: int, alineacion: int) -> str:
    """
    El encabezado .ass declara la resolución (PlayResX/PlayResY) de forma
    explícita — esto es lo que evita el bug de texto gigante que teníamos
    con .srt (que no declara resolución y a veces se escala mal).
    alineacion: 5 = centrado en pantalla (shorts), 2 = abajo centrado (largos)
    """
    import platform
    fuente = "Arial" if platform.system() == "Windows" else "DejaVu Sans"

    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: {ancho}
PlayResY: {alto}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{fuente},{tamano_fuente},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,{alineacion},10,10,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def generar_ass_desde_palabras(palabras_con_tiempo, ancho: int, alto: int, tamano_fuente: int, palabras_por_linea: int, alineacion: int) -> str:
    """
    palabras_con_tiempo: lista de dicts con 'text', 'inicio', 'fin' (en segundos)
    Agrupa palabras en líneas cortas y arma el archivo .ass completo.
    """
    contenido = generar_encabezado_ass(ancho, alto, tamano_fuente, alineacion)

    for i in range(0, len(palabras_con_tiempo), palabras_por_linea):
        grupo = palabras_con_tiempo[i : i + palabras_por_linea]
        if not grupo:
            continue
        inicio = segundos_a_timestamp_ass(grupo[0]["inicio"])
        fin = segundos_a_timestamp_ass(grupo[-1]["fin"])
        texto = " ".join(p["text"] for p in grupo)
        contenido += f"Dialogue: 0,{inicio},{fin},Default,,0,0,0,,{texto}\n"

    return contenido


async def generar_audio():
    if not os.path.exists(GUION_PATH):
        print(f"❌ No se encontró {GUION_PATH}. Corre primero generar_guion.js")
        sys.exit(1)

    with open(GUION_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    texto = data.get("guion")
    voz = data.get("voz", "es-CO-GonzaloNeural")
    formato = data.get("formato", "horizontal")
    es_short = formato == "vertical"

    if not texto:
        print("❌ El guion.json no tiene el campo 'guion'")
        sys.exit(1)

    # Limpiamos símbolos que la IA a veces mete (markdown) y que la voz
    # leería literal ("asterisco", "numeral", etc.)
    texto = re.sub(r"[*_#`~]", "", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    texto = normalizar_numeros(texto)

    async def generar_y_transcribir_audio():
        """Genera el audio con edge-tts y lo transcribe con Whisper.
        Devuelve (palabras_con_tiempo, coincidencia) o (None, 0) si falla."""
        communicate = edge_tts.Communicate(texto, voz, rate=RATE, pitch=PITCH)
        with open(AUDIO_PATH, "wb") as audio_file:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_file.write(chunk["data"])

        from faster_whisper import WhisperModel

        modelo = WhisperModel("small", device="cpu", compute_type="int8")
        segmentos, _ = modelo.transcribe(
            AUDIO_PATH,
            language="es",
            word_timestamps=True,
            beam_size=5,
            vad_filter=True,
        )

        palabras_con_tiempo = []
        for segmento in segmentos:
            for palabra in segmento.words:
                palabras_con_tiempo.append(
                    {"text": palabra.word.strip(), "inicio": palabra.start, "fin": palabra.end}
                )

        if not palabras_con_tiempo:
            return None, 0.0

        texto_normalizado = set(re.sub(r"[^\w\s]", "", texto.lower()).split())
        escuchado_normalizado = set(
            re.sub(r"[^\w\s]", "", " ".join(p["text"] for p in palabras_con_tiempo).lower()).split()
        )
        coincidencia = (
            len(texto_normalizado & escuchado_normalizado) / len(texto_normalizado) if texto_normalizado else 0.0
        )
        return palabras_con_tiempo, coincidencia

    print(f"🎙️  Generando audio con voz: {voz}")
    print(f"📝 Texto: {len(texto.split())} palabras")

    mejor_palabras, mejor_coincidencia = None, -1.0
    UMBRAL_REINTENTO = 0.60  # si sale peor que esto, vale la pena regenerar
    UMBRAL_AVISO = 0.75  # si sale peor que esto (tras reintentar o no), avisamos por Telegram

    for intento in range(1, 3):  # hasta 2 intentos
        print(f"👂 Intento {intento}: generando audio y transcribiendo con Whisper...")
        try:
            palabras, coincidencia = await generar_y_transcribir_audio()
        except Exception as err:
            print(f"⚠️  Falló el intento {intento}: {err}")
            palabras, coincidencia = None, 0.0

        print(f"🔍 Coincidencia audio↔texto: {coincidencia*100:.0f}%")

        if coincidencia > mejor_coincidencia:
            mejor_palabras, mejor_coincidencia = palabras, coincidencia
            # Guardamos una copia del mejor audio hasta ahora, por si el
            # segundo intento resulta peor y hay que quedarnos con este
            if os.path.exists(AUDIO_PATH):
                import shutil
                shutil.copyfile(AUDIO_PATH, AUDIO_PATH + ".mejor")

        if coincidencia >= UMBRAL_REINTENTO:
            break  # ya está lo suficientemente bien, no hace falta reintentar
        print("⚠️  Coincidencia baja, regenerando el audio una vez más...")

    # Nos aseguramos de que el archivo final sea el del mejor intento
    if os.path.exists(AUDIO_PATH + ".mejor"):
        import shutil
        shutil.move(AUDIO_PATH + ".mejor", AUDIO_PATH)

    tamaño_mb = os.path.getsize(AUDIO_PATH) / (1024 * 1024)
    print(f"✅ Audio generado: {AUDIO_PATH}")
    print(f"📦 Tamaño: {tamaño_mb:.2f} MB")

    if mejor_palabras:
        ANCHO = 1080 if es_short else 1920
        ALTO = 1920 if es_short else 1080
        TAMANO_FUENTE = 64 if es_short else 46
        PALABRAS_POR_LINEA = 4 if es_short else 7
        ALINEACION = 5 if es_short else 2  # 5=centrado (shorts), 2=abajo centrado (largos)

        contenido_ass = generar_ass_desde_palabras(
            mejor_palabras, ANCHO, ALTO, TAMANO_FUENTE, PALABRAS_POR_LINEA, ALINEACION
        )
        with open(ASS_PATH, "w", encoding="utf-8") as f:
            f.write(contenido_ass)
        print(f"✅ Subtítulos generados con timing real: {ASS_PATH}")

        if mejor_coincidencia < UMBRAL_AVISO:
            aviso_path = os.path.join(BASE_DIR, "output", "aviso_calidad_audio.txt")
            with open(aviso_path, "w", encoding="utf-8") as f:
                f.write(
                    f"Coincidencia audio-texto de solo {mejor_coincidencia*100:.0f}% (tras reintentar) — "
                    f"posible problema de pronunciación, revisa este video antes de publicarlo."
                )
            print("⚠️  Coincidencia sigue baja tras reintentar — se dejó un aviso para la notificación de Telegram")
    else:
        print("⚠️  No se pudieron generar subtítulos con Whisper. El video se genera igual, sin subtítulos.")


if __name__ == "__main__":
    asyncio.run(generar_audio())
