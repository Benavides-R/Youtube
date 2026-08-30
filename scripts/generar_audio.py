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
    pip install edge-tts faster-whisper

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

    print(f"🎙️  Generando audio con voz: {voz}")
    print(f"📝 Texto: {len(texto.split())} palabras")

    communicate = edge_tts.Communicate(texto, voz, rate=RATE, pitch=PITCH)
    with open(AUDIO_PATH, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])

    tamaño_mb = os.path.getsize(AUDIO_PATH) / (1024 * 1024)
    print(f"✅ Audio generado: {AUDIO_PATH}")
    print(f"📦 Tamaño: {tamaño_mb:.2f} MB")

    print("👂 Transcribiendo el audio real con Whisper para timing exacto...")
    try:
        from faster_whisper import WhisperModel

        modelo = WhisperModel("base", device="cpu", compute_type="int8")
        segmentos, _ = modelo.transcribe(AUDIO_PATH, language="es", word_timestamps=True)

        palabras_con_tiempo = []
        for segmento in segmentos:
            for palabra in segmento.words:
                palabras_con_tiempo.append(
                    {"text": palabra.word.strip(), "inicio": palabra.start, "fin": palabra.end}
                )

        if not palabras_con_tiempo:
            raise ValueError("Whisper no devolvió palabras")

        ANCHO = 1080 if es_short else 1920
        ALTO = 1920 if es_short else 1080
        TAMANO_FUENTE = 64 if es_short else 46
        PALABRAS_POR_LINEA = 4 if es_short else 7
        ALINEACION = 5 if es_short else 2  # 5=centrado (shorts), 2=abajo centrado (largos)

        contenido_ass = generar_ass_desde_palabras(
            palabras_con_tiempo, ANCHO, ALTO, TAMANO_FUENTE, PALABRAS_POR_LINEA, ALINEACION
        )
        with open(ASS_PATH, "w", encoding="utf-8") as f:
            f.write(contenido_ass)
        print(f"✅ Subtítulos generados con timing real: {ASS_PATH}")

    except Exception as err:
        print(f"⚠️  No se pudieron generar subtítulos con Whisper ({err}). El video se genera igual, sin subtítulos.")


if __name__ == "__main__":
    asyncio.run(generar_audio())
