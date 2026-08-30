"""
generar_audio.py
------------------------------------------------------------
Lee output/guion.json y convierte el campo "guion" a audio
usando edge-tts. Además genera output/subtitulos.srt.

Nota importante: no todas las voces de edge-tts entregan
información exacta de tiempo por palabra (WordBoundary) — las
voces es-CO, por ejemplo, no la dan. Cuando eso pasa, este
script calcula los subtítulos de forma APROXIMADA, repartiendo
el texto en partes según la duración total del audio (sigue
quedando bien sincronizado en la práctica, solo no es exacto
al milisegundo).

Uso:
    python scripts/generar_audio.py

Requiere:
    pip install edge-tts

Output:
    output/audio.mp3
    output/subtitulos.srt
------------------------------------------------------------
"""

import asyncio
import json
import os
import subprocess
import sys

import edge_tts

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUION_PATH = os.path.join(BASE_DIR, "output", "guion.json")
AUDIO_PATH = os.path.join(BASE_DIR, "output", "audio.mp3")
SRT_PATH = os.path.join(BASE_DIR, "output", "subtitulos.srt")

RATE = "-12%"
PITCH = "+0Hz"
PALABRAS_POR_LINEA = 4


def segundos_a_timestamp_srt(segundos: float) -> str:
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    segs = int(segundos % 60)
    milisegs = int((segundos - int(segundos)) * 1000)
    return f"{horas:02d}:{minutos:02d}:{segs:02d},{milisegs:03d}"


def generar_srt_exacto(palabras_con_tiempo):
    """Usa el timing real que dio edge-tts (cuando la voz lo soporta)"""
    lineas = []
    numero = 1
    for i in range(0, len(palabras_con_tiempo), PALABRAS_POR_LINEA):
        grupo = palabras_con_tiempo[i : i + PALABRAS_POR_LINEA]
        if not grupo:
            continue
        inicio_seg = grupo[0]["offset"] / 10_000_000
        fin_seg = (grupo[-1]["offset"] + grupo[-1]["duration"]) / 10_000_000
        texto = " ".join(p["text"] for p in grupo)
        lineas.append(
            f"{numero}\n{segundos_a_timestamp_srt(inicio_seg)} --> {segundos_a_timestamp_srt(fin_seg)}\n{texto}\n"
        )
        numero += 1
    return "\n".join(lineas)


def obtener_duracion_audio(ruta_audio: str) -> float:
    salida = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            ruta_audio,
        ]
    )
    return float(salida.decode().strip())


def generar_srt_aproximado(texto: str, duracion_total_seg: float):
    """
    Respaldo: si la voz no da timing exacto, repartimos el texto
    en líneas y le asignamos tiempo proporcional a la cantidad de
    palabras de cada línea (funciona bien porque el ritmo de habla
    de edge-tts es bastante constante).
    """
    palabras = texto.split()
    total_palabras = len(palabras)
    # Repartimos el tiempo según cuántas LETRAS tiene cada palabra (no
    # cuántas palabras hay) — así una palabra larga ocupa más tiempo que
    # una corta, y el desfase acumulado a lo largo del video es mucho menor.
    total_letras = sum(len(p) for p in palabras)
    segundos_por_letra = duracion_total_seg / total_letras

    lineas = []
    numero = 1
    tiempo_actual = 0.0

    for i in range(0, total_palabras, PALABRAS_POR_LINEA):
        grupo = palabras[i : i + PALABRAS_POR_LINEA]
        letras_grupo = sum(len(p) for p in grupo)
        duracion_linea = letras_grupo * segundos_por_letra
        inicio = tiempo_actual
        fin = tiempo_actual + duracion_linea
        texto_linea = " ".join(grupo)

        lineas.append(
            f"{numero}\n{segundos_a_timestamp_srt(inicio)} --> {segundos_a_timestamp_srt(fin)}\n{texto_linea}\n"
        )
        tiempo_actual = fin
        numero += 1

    return "\n".join(lineas)


async def generar_audio():
    if not os.path.exists(GUION_PATH):
        print(f"❌ No se encontró {GUION_PATH}. Corre primero generar_guion.js")
        sys.exit(1)

    with open(GUION_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    texto = data.get("guion")
    voz = data.get("voz", "es-CO-GonzaloNeural")

    if not texto:
        print("❌ El guion.json no tiene el campo 'guion'")
        sys.exit(1)

    # Limpiamos símbolos que la IA a veces mete (markdown) y que la voz
    # leería literal ("asterisco", "numeral", etc.)
    import re
    texto = re.sub(r"[*_#`~]", "", texto)
    texto = re.sub(r"\s+", " ", texto).strip()

    print(f"🎙️  Generando audio con voz: {voz}")
    print(f"📝 Texto: {len(texto.split())} palabras")

    communicate = edge_tts.Communicate(texto, voz, rate=RATE, pitch=PITCH)

    palabras_con_tiempo = []
    with open(AUDIO_PATH, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                palabras_con_tiempo.append(
                    {"text": chunk["text"], "offset": chunk["offset"], "duration": chunk["duration"]}
                )

    tamaño_mb = os.path.getsize(AUDIO_PATH) / (1024 * 1024)
    print(f"✅ Audio generado: {AUDIO_PATH}")
    print(f"📦 Tamaño: {tamaño_mb:.2f} MB")

    if palabras_con_tiempo:
        print("📝 Generando subtítulos con timing exacto...")
        srt_contenido = generar_srt_exacto(palabras_con_tiempo)
    else:
        print("📝 Esta voz no da timing exacto — generando subtítulos aproximados...")
        duracion = obtener_duracion_audio(AUDIO_PATH)
        srt_contenido = generar_srt_aproximado(texto, duracion)

    with open(SRT_PATH, "w", encoding="utf-8") as f:
        f.write(srt_contenido)
    print(f"✅ Subtítulos generados: {SRT_PATH}")


if __name__ == "__main__":
    asyncio.run(generar_audio())
