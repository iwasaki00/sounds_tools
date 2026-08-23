from __future__ import annotations

import math
import random
import wave
from pathlib import Path
from typing import Callable


SAMPLE_RATE = 44_100
MAX_PEAK = 0.38
OUTPUT_DIR = Path(__file__).resolve().parent / "assets" / "sfx"
SampleFn = Callable[[float, float], float]


def sine(freq: float, t: float) -> float:
    return math.sin(2.0 * math.pi * freq * t)


def square(freq: float, t: float) -> float:
    return 1.0 if sine(freq, t) >= 0.0 else -1.0


def triangle(freq: float, t: float) -> float:
    phase = (freq * t) % 1.0
    return 4.0 * abs(phase - 0.5) - 1.0


def saw(freq: float, t: float) -> float:
    return 2.0 * ((freq * t) % 1.0) - 1.0


def decay(t: float, duration: float, amount: float = 5.0) -> float:
    return math.exp(-amount * t / max(duration, 1e-6))


def attack_release(t: float, duration: float, attack: float = 0.01, release: float = 0.12) -> float:
    attack_gain = min(1.0, t / max(attack, 1e-6))
    release_gain = min(1.0, max(0.0, duration - t) / max(release, 1e-6))
    return attack_gain * release_gain


def normalize(samples: list[float]) -> list[float]:
    peak = max((abs(sample) for sample in samples), default=0.0)
    if peak <= 1e-9:
        return samples
    scale = MAX_PEAK / peak
    return [max(-1.0, min(1.0, sample * scale)) for sample in samples]


def fade_edges(samples: list[float], fade_ms: float = 5.0) -> list[float]:
    fade_size = max(1, int(SAMPLE_RATE * fade_ms / 1000.0))
    last = len(samples) - 1
    for index, sample in enumerate(samples):
        gain = 1.0
        if index < fade_size:
            gain = min(gain, index / fade_size)
        if last - index < fade_size:
            gain = min(gain, (last - index) / fade_size)
        samples[index] = sample * max(0.0, gain)
    return samples


def render(duration: float, fn: SampleFn, fade_ms: float = 5.0) -> list[float]:
    count = int(SAMPLE_RATE * duration)
    samples = [fn(index / SAMPLE_RATE, duration) for index in range(count)]
    return normalize(fade_edges(samples, fade_ms))


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for sample in samples:
            frames.extend(int(sample * 32767).to_bytes(2, "little", signed=True))
        wav_file.writeframes(frames)


def kick_voice(local: float, duration: float, body_freq: float = 54.0, weight: float = 1.0) -> float:
    if local < 0.0 or local >= duration:
        return 0.0
    p = local / duration
    freq = body_freq + 165.0 * (1.0 - p) ** 3.2
    body = sine(freq, local) * decay(local, duration, 5.6)
    click = random.uniform(-1.0, 1.0) * decay(local, 0.028, 14.0) * 0.22
    return (body + click) * weight


def snare_voice(local: float, duration: float, tone: float = 185.0, weight: float = 1.0) -> float:
    if local < 0.0 or local >= duration:
        return 0.0
    body = triangle(tone * (1.0 - 0.18 * local / duration), local) * decay(local, duration, 6.0) * 0.42
    noise = random.uniform(-1.0, 1.0) * decay(local, duration, 8.0) * 0.9
    return (body + noise) * weight


def hat_voice(local: float, duration: float, weight: float = 1.0) -> float:
    if local < 0.0 or local >= duration:
        return 0.0
    metallic = square(7_300.0, local) * 0.18 + square(9_850.0, local) * 0.13
    hiss = random.uniform(-1.0, 1.0) * 0.74
    return (metallic + hiss) * decay(local, duration, 12.0) * weight


def make_metal(duration: float, reverse: bool = False, ride: bool = False) -> list[float]:
    def voice(t: float, d: float) -> float:
        p = t / d
        env = p**1.7 if reverse else decay(t, d, 3.0 if ride else 2.2)
        partials = (
            square(3_210.0, t) * 0.17
            + square(4_760.0, t) * 0.14
            + sine(6_830.0, t) * 0.12
            + sine(9_110.0, t) * 0.08
        )
        wash = random.uniform(-1.0, 1.0) * (0.55 if ride else 0.75)
        ping = sine(2_420.0, t) * decay(t, d, 8.5) * (0.32 if ride else 0.12)
        return (partials + wash) * env + ping

    return render(duration, voice, 3.0)


def make_rim_shot() -> list[float]:
    return render(
        0.14,
        lambda t, d: (
            sine(1_920.0, t) * 0.65
            + sine(3_180.0, t) * 0.35
            + random.uniform(-1.0, 1.0) * 0.18
        )
        * decay(t, d, 13.0),
        1.0,
    )


def make_tambourine() -> list[float]:
    hits = (0.0, 0.035, 0.074, 0.118)

    def voice(t: float, d: float) -> float:
        value = 0.0
        for start in hits:
            local = t - start
            if 0.0 <= local < 0.08:
                metal = square(5_900.0, local) * 0.18 + square(8_200.0, local) * 0.14
                value += (metal + random.uniform(-1.0, 1.0) * 0.7) * decay(local, 0.08, 10.0)
        return value

    return render(0.24, voice, 2.0)


def make_shaker() -> list[float]:
    return render(
        0.15,
        lambda t, d: random.uniform(-1.0, 1.0)
        * (0.45 + 0.55 * abs(sine(34.0, t)))
        * decay(t, d, 9.0),
        1.0,
    )


def make_hand_drum(kind: str) -> list[float]:
    settings = {
        "conga": (245.0, 138.0, 0.30),
        "bongo": (390.0, 235.0, 0.22),
        "djembe": (170.0, 82.0, 0.34),
    }
    start, end, duration = settings[kind]

    def voice(t: float, d: float) -> float:
        p = t / d
        freq = start + (end - start) * p
        skin = sine(freq, t) * decay(t, d, 5.0)
        slap = random.uniform(-1.0, 1.0) * decay(t, 0.035, 13.0) * 0.28
        overtone = sine(freq * 1.72, t) * decay(t, d, 8.0) * 0.22
        return skin + slap + overtone

    return render(duration, voice, 2.0)


def make_kick(style: str) -> list[float]:
    if style == "heavy":
        return render(0.48, lambda t, d: kick_voice(t, d, 45.0) + sine(31.0, t) * decay(t, d, 3.0) * 0.28, 2.0)
    return render(0.30, lambda t, d: kick_voice(t, d, 63.0, 0.78), 2.0)


def make_brush_snare() -> list[float]:
    def voice(t: float, d: float) -> float:
        brush = random.uniform(-1.0, 1.0) * (0.55 + 0.45 * sine(16.0, t) ** 2)
        body = sine(178.0, t) * decay(t, d, 5.0) * 0.22
        return (brush * 0.74 + body) * attack_release(t, d, 0.02, 0.18)

    return render(0.42, voice, 8.0)


def make_ghost_snare() -> list[float]:
    return render(0.18, lambda t, d: snare_voice(t, d, 210.0, 0.72), 2.0)


def make_break_slice(amen: bool) -> list[float]:
    duration = 0.96
    kick_times = (0.0, 0.50, 0.72) if amen else (0.0, 0.43, 0.69)
    snare_times = (0.24, 0.58, 0.82) if amen else (0.25, 0.57, 0.78)
    hat_times = tuple(index * 0.06 for index in range(16))

    def voice(t: float, d: float) -> float:
        value = 0.0
        for start in kick_times:
            value += kick_voice(t - start, 0.24, 58.0, 0.75)
        for start in snare_times:
            value += snare_voice(t - start, 0.17, 192.0, 0.68)
        for start in hat_times:
            value += hat_voice(t - start, 0.045, 0.20)
        return math.tanh(value * (1.35 if amen else 1.1))

    return render(duration, voice, 2.0)


def make_bass(style: str) -> list[float]:
    settings = {
        "analog": (65.41, 0.34),
        "acid": (73.42, 0.32),
        "sub": (49.00, 0.52),
        "deep": (55.00, 0.44),
        "finger": (82.41, 0.34),
        "driving": (73.42, 0.24),
        "reece": (55.00, 0.52),
        "distortion": (65.41, 0.38),
        "rolling": (73.42, 0.22),
        "dirty": (61.74, 0.40),
        "funky": (82.41, 0.30),
        "808": (49.00, 0.68),
        "electric": (82.41, 0.38),
        "acoustic": (73.42, 0.44),
        "upright": (65.41, 0.52),
    }
    freq, duration = settings[style]

    def voice(t: float, d: float) -> float:
        env = attack_release(t, d, 0.004, min(0.16, d * 0.45))
        if style == "acid":
            sweep = 1.0 + 1.6 * decay(t, d, 2.8)
            raw = saw(freq, t) * 0.46 + sine(freq * sweep * 3.0, t) * 0.30 + sine(freq * 0.5, t) * 0.34
            return raw * decay(t, d, 3.0) * env
        if style == "sub":
            return (sine(freq, t) * 0.88 + sine(freq * 2.0, t) * 0.12) * decay(t, d, 2.6) * env
        if style == "808":
            bend = freq + 45.0 * decay(t, 0.09, 7.0)
            return math.tanh((sine(bend, t) + sine(bend * 2.0, t) * 0.12) * 1.4) * decay(t, d, 2.2) * env
        if style == "reece":
            raw = saw(freq * 0.985, t) * 0.44 + saw(freq * 1.015, t) * 0.44 + sine(freq * 0.5, t) * 0.26
            return math.tanh(raw * 1.35) * decay(t, d, 2.8) * env
        if style in {"distortion", "dirty"}:
            raw = saw(freq, t) * 0.6 + square(freq * 0.5, t) * 0.32 + sine(freq * 2.0, t) * 0.18
            return math.tanh(raw * (2.4 if style == "distortion" else 1.8)) * decay(t, d, 3.6) * env
        if style in {"finger", "funky", "electric", "acoustic", "upright"}:
            pick = random.uniform(-1.0, 1.0) * decay(t, 0.025, 16.0) * 0.24
            woody = sine(freq, t) * 0.62 + triangle(freq * 2.0, t) * 0.18 + sine(freq * 3.0, t) * 0.10
            decay_amount = 4.7 if style in {"finger", "funky", "electric"} else 3.7
            return (woody * decay(t, d, decay_amount) + pick) * env
        raw = saw(freq, t) * 0.42 + square(freq * 0.5, t) * 0.24 + sine(freq, t) * 0.42
        pulse = 0.86 + 0.14 * sine(7.0 if style == "rolling" else 4.0, t)
        return raw * decay(t, d, 4.4 if style in {"driving", "rolling"} else 3.4) * env * pulse

    return render(duration, voice, 2.0)


def make_tonal(style: str) -> list[float]:
    settings = {
        "saw_lead": (523.25, 0.34, (0,)),
        "square_lead": (659.25, 0.28, (0,)),
        "pad": (220.00, 0.88, (0, 3, 7)),
        "piano": (261.63, 0.52, (0, 4, 7)),
        "electric_piano": (261.63, 0.58, (0, 4, 7)),
        "organ": (261.63, 0.62, (0, 4, 7)),
        "strings": (220.00, 0.82, (0, 3, 7)),
        "supersaw": (440.00, 0.42, (0,)),
        "synth_brass": (220.00, 0.46, (0, 4, 7)),
        "synth_strings": (220.00, 0.78, (0, 4, 7)),
        "bell": (659.25, 0.62, (0,)),
        "lead": (587.33, 0.34, (0,)),
        "dark_pad": (110.00, 0.90, (0, 3, 7)),
        "stab": (220.00, 0.34, (0, 3, 7)),
        "fm_bell": (783.99, 0.54, (0,)),
        "atmos_pad": (164.81, 0.94, (0, 7, 12)),
        "arpeggio": (440.00, 0.72, (0,)),
        "brass": (196.00, 0.46, (0, 4, 7)),
        "marimba": (523.25, 0.40, (0,)),
        "kalimba": (659.25, 0.36, (0,)),
        "pan_flute": (523.25, 0.52, (0,)),
        "flute": (659.25, 0.48, (0,)),
        "sitar": (392.00, 0.48, (0,)),
        "koto": (523.25, 0.42, (0,)),
        "grand_piano": (261.63, 0.62, (0, 4, 7)),
        "brass_section": (196.00, 0.52, (0, 4, 7, 10)),
        "vibraphone": (523.25, 0.68, (0,)),
    }
    root, duration, intervals = settings[style]

    def voice(t: float, d: float) -> float:
        value = 0.0
        for semitone in intervals:
            freq = root * 2.0 ** (semitone / 12.0)
            if style == "saw_lead":
                tone = saw(freq, t) * 0.58 + sine(freq * 2.0, t) * 0.18
            elif style == "square_lead":
                tone = square(freq, t) * 0.52 + triangle(freq * 2.0, t) * 0.18
            elif style in {"pad", "strings", "synth_strings", "dark_pad", "atmos_pad"}:
                tone = saw(freq * 0.994, t) * 0.24 + saw(freq * 1.006, t) * 0.24 + sine(freq * 0.5, t) * 0.20
            elif style == "supersaw":
                tone = sum(saw(freq * ratio, t) for ratio in (0.982, 0.991, 1.0, 1.009, 1.018)) * 0.16
            elif style in {"piano", "grand_piano"}:
                hammer = random.uniform(-1.0, 1.0) * decay(t, 0.018, 16.0) * 0.12
                tone = (
                    sine(freq, t) * 0.56
                    + sine(freq * 2.0, t) * 0.24
                    + sine(freq * 3.0, t) * 0.12
                    + hammer
                )
            elif style == "electric_piano":
                tone = sine(freq, t) * 0.54 + sine(freq * 3.01, t + sine(freq, t) * 0.0004) * 0.25
            elif style == "organ":
                tone = sine(freq, t) * 0.48 + sine(freq * 2.0, t) * 0.25 + sine(freq * 3.0, t) * 0.13
            elif style in {"bell", "fm_bell", "vibraphone"}:
                modulation = sine(freq * (2.71 if style == "fm_bell" else 2.0), t)
                tone = sine(freq, t + modulation * 0.0007) * 0.58 + sine(freq * 3.0, t) * 0.18
            elif style in {"synth_brass", "brass", "brass_section"}:
                tone = saw(freq, t) * 0.44 + square(freq * 0.5, t) * 0.18 + sine(freq * 2.0, t) * 0.14
            elif style in {"marimba", "kalimba", "koto"}:
                tone = triangle(freq, t) * 0.48 + sine(freq * 3.0, t) * 0.22 + random.uniform(-1.0, 1.0) * decay(t, 0.015, 18.0) * 0.10
            elif style in {"pan_flute", "flute"}:
                breath = random.uniform(-1.0, 1.0) * 0.10
                tone = sine(freq * (1.0 + 0.003 * sine(5.5, t)), t) * 0.72 + breath
            elif style == "sitar":
                buzz = saw(freq * 2.0, t) * 0.16 * (0.5 + 0.5 * sine(31.0, t))
                tone = triangle(freq, t) * 0.52 + buzz + sine(freq * 3.0, t) * 0.14
            else:
                tone = saw(freq, t) * 0.44 + square(freq * 0.5, t) * 0.18 + sine(freq * 2.0, t) * 0.18
            value += tone

        if style == "arpeggio":
            notes = (0, 4, 7, 12, 7, 4, 0, 7)
            step = min(len(notes) - 1, int(t / d * len(notes)))
            freq = root * 2.0 ** (notes[step] / 12.0)
            value = triangle(freq, t) * 0.62 + sine(freq * 2.0, t) * 0.18

        if style in {"pad", "strings", "synth_strings", "dark_pad", "atmos_pad", "organ"}:
            env = attack_release(t, d, 0.08, 0.20)
        else:
            env = attack_release(t, d, 0.005, min(0.18, d * 0.42)) * decay(t, d, 2.6 if style in {"bell", "fm_bell", "vibraphone"} else 3.8)
        return value * env / max(1.0, len(intervals) * 0.62)

    return render(duration, voice, 4.0)


def make_noise_fx(style: str) -> list[float]:
    durations = {
        "white": 0.34,
        "sweep_up": 0.78,
        "sweep_down": 0.72,
        "noise_sweep": 0.82,
        "riser": 0.90,
        "downlifter": 0.82,
        "reverse_fx": 0.62,
        "vinyl_stop": 0.68,
        "scratch": 0.34,
        "glitch": 0.38,
        "brush": 0.46,
    }
    duration = durations[style]

    def voice(t: float, d: float) -> float:
        p = t / d
        raw_noise = random.uniform(-1.0, 1.0)
        if style == "white":
            return raw_noise * decay(t, d, 5.0)
        if style in {"sweep_up", "noise_sweep", "riser"}:
            carrier = sine(180.0 + 2_800.0 * p * p, t) * 0.34
            return (raw_noise * (0.2 + 0.8 * p) + carrier) * attack_release(t, d, 0.04, 0.04)
        if style in {"sweep_down", "downlifter"}:
            carrier = saw(2_200.0 - 2_050.0 * p, t) * 0.28
            return (raw_noise * (1.0 - 0.65 * p) + carrier) * decay(t, d, 1.5)
        if style == "reverse_fx":
            return (raw_noise * 0.65 + sine(240.0 + 1_600.0 * p, t) * 0.35) * p**1.6
        if style == "vinyl_stop":
            freq = 880.0 * max(0.08, (1.0 - p) ** 2.2)
            return (saw(freq, t) * 0.56 + sine(freq * 0.5, t) * 0.30) * (1.0 - p)
        if style == "scratch":
            direction = sine(5.5, t)
            freq = 480.0 + 1_100.0 * abs(direction)
            return (saw(freq, t) * 0.42 + raw_noise * 0.35) * attack_release(t, d, 0.01, 0.05)
        if style == "glitch":
            gate = 1.0 if int(t * 90.0) % 3 != 0 else 0.0
            freq = 180.0 + 1_600.0 * ((int(t * 28.0) * 0.37) % 1.0)
            return (square(freq, t) * 0.44 + raw_noise * 0.28) * gate * decay(t, d, 2.0)
        return raw_noise * (0.4 + 0.6 * p) * attack_release(t, d, 0.02, 0.10)

    return render(duration, voice, 4.0)


def make_impact(explosion: bool = False, hit: bool = False) -> list[float]:
    duration = 0.74 if explosion else (0.32 if hit else 0.58)

    def voice(t: float, d: float) -> float:
        p = t / d
        body_freq = (62.0 if explosion else 84.0) * (1.0 - 0.35 * p)
        body = sine(body_freq, t) * decay(t, d, 3.0) * 0.88
        crack = random.uniform(-1.0, 1.0) * decay(t, d, 7.5 if hit else 5.0) * (0.82 if explosion else 0.58)
        metal = sine(1_480.0, t) * decay(t, d, 10.0) * (0.18 if hit else 0.10)
        return body + crack + metal

    return render(duration, voice, 2.0)


def make_vinyl_noise() -> list[float]:
    pops = (0.08, 0.21, 0.49, 0.73)

    def voice(t: float, d: float) -> float:
        rumble = random.uniform(-1.0, 1.0) * 0.14 + sine(43.0, t) * 0.05
        crackle = 0.0
        for start in pops:
            local = t - start
            if 0.0 <= local < 0.012:
                crackle += random.uniform(-1.0, 1.0) * decay(local, 0.012, 11.0)
        return rumble + crackle

    return render(0.86, voice, 8.0)


def formant_voice(style: str) -> list[float]:
    settings = {
        "chop": (0.28, ((0.0, 0.28, 190.0, (720.0, 1_200.0, 2_500.0)),)),
        "yeah": (0.46, ((0.0, 0.46, 145.0, (680.0, 1_150.0, 2_400.0)),)),
        "come_on": (
            0.72,
            (
                (0.0, 0.30, 132.0, (520.0, 1_050.0, 2_300.0)),
                (0.34, 0.34, 118.0, (640.0, 920.0, 2_150.0)),
            ),
        ),
        "fx": (0.48, ((0.0, 0.48, 105.0, (540.0, 1_480.0, 2_700.0)),)),
        "sample": (
            0.66,
            (
                (0.0, 0.27, 124.0, (740.0, 1_100.0, 2_450.0)),
                (0.31, 0.31, 98.0, (500.0, 1_350.0, 2_300.0)),
            ),
        ),
    }
    duration, syllables = settings[style]

    def voice(t: float, d: float) -> float:
        value = 0.0
        for start, length, pitch, formants in syllables:
            local = t - start
            if 0.0 <= local < length:
                sweep = 1.0 + (0.18 if style == "yeah" else -0.08) * local / length
                glottal = saw(pitch * sweep, local) * 0.24
                resonances = sum(sine(freq * sweep, local) for freq in formants) * 0.13
                breath = random.uniform(-1.0, 1.0) * 0.07
                value += (glottal + resonances + breath) * attack_release(local, length, 0.025, 0.08)
        return math.tanh(value * 1.5)

    return render(duration, voice, 5.0)


def make_nature(style: str) -> list[float]:
    duration = 0.88

    def voice(t: float, d: float) -> float:
        p = t / d
        noise = random.uniform(-1.0, 1.0)
        if style == "bird":
            chirp_a = sine(1_700.0 + 1_200.0 * sine(4.0, t), t) * max(0.0, sine(7.0, t)) ** 5
            chirp_b = sine(2_400.0 + 900.0 * p, t) * max(0.0, sine(11.0, t)) ** 7
            return (chirp_a * 0.7 + chirp_b * 0.45) * attack_release(t, d, 0.02, 0.08)
        if style == "river":
            bubbles = sine(780.0 + 480.0 * sine(2.7, t), t) * max(0.0, sine(13.0, t)) ** 8
            return noise * 0.32 + bubbles * 0.24
        if style == "wind":
            gust = 0.25 + 0.65 * (0.5 + 0.5 * sine(0.9, t))
            return noise * gust + sine(180.0 + 90.0 * sine(0.6, t), t) * 0.14
        if style == "forest":
            insects = sine(4_100.0, t) * max(0.0, sine(18.0, t)) ** 10 * 0.25
            return noise * 0.18 + insects + sine(1_250.0 + 300.0 * sine(3.0, t), t) * max(0.0, sine(5.0, t)) ** 8 * 0.18
        drops = max(0.0, sine(47.0, t) + sine(61.0, t) - 1.45)
        return noise * 0.46 + drops * sine(2_800.0, t) * 0.44

    return render(duration, voice, 10.0)


def make_ambience(style: str) -> list[float]:
    duration = 0.86

    def voice(t: float, d: float) -> float:
        noise = random.uniform(-1.0, 1.0)
        if style == "applause":
            bursts = max(0.0, sine(13.0, t)) ** 6 + max(0.0, sine(17.0, t + 0.1)) ** 8
            return noise * (0.24 + bursts * 0.68)
        if style == "snap":
            return (noise * 0.72 + sine(1_850.0, t) * 0.35) * decay(t, d, 15.0)
        murmur = sine(92.0, t) * 0.14 + sine(137.0, t) * 0.11 + noise * 0.17
        glasses = sine(2_600.0, t) * max(0.0, sine(5.0, t)) ** 12 * 0.08
        return murmur + glasses

    return render(0.14 if style == "snap" else duration, voice, 4.0)


SOUNDS: dict[str, Callable[[], list[float]]] = {
    "genre_ride.wav": lambda: make_metal(0.58, ride=True),
    "genre_rim_shot.wav": make_rim_shot,
    "genre_tambourine.wav": make_tambourine,
    "genre_crash.wav": lambda: make_metal(0.82),
    "genre_amen_break.wav": lambda: make_break_slice(True),
    "genre_ghost_snare.wav": make_ghost_snare,
    "genre_heavy_kick.wav": lambda: make_kick("heavy"),
    "genre_breakbeat_loop.wav": lambda: make_break_slice(False),
    "genre_conga.wav": lambda: make_hand_drum("conga"),
    "genre_bongo.wav": lambda: make_hand_drum("bongo"),
    "genre_djembe.wav": lambda: make_hand_drum("djembe"),
    "genre_shaker.wav": make_shaker,
    "genre_jazz_kick.wav": lambda: make_kick("jazz"),
    "genre_snare_brush.wav": make_brush_snare,
    "genre_analog_bass.wav": lambda: make_bass("analog"),
    "genre_acid_bass.wav": lambda: make_bass("acid"),
    "genre_sub_bass.wav": lambda: make_bass("sub"),
    "genre_deep_bass.wav": lambda: make_bass("deep"),
    "genre_finger_bass.wav": lambda: make_bass("finger"),
    "genre_driving_bass.wav": lambda: make_bass("driving"),
    "genre_reece_bass.wav": lambda: make_bass("reece"),
    "genre_distortion_bass.wav": lambda: make_bass("distortion"),
    "genre_rolling_bass.wav": lambda: make_bass("rolling"),
    "genre_dirty_bass.wav": lambda: make_bass("dirty"),
    "genre_funky_bass.wav": lambda: make_bass("funky"),
    "genre_808_bass.wav": lambda: make_bass("808"),
    "genre_electric_bass.wav": lambda: make_bass("electric"),
    "genre_acoustic_bass.wav": lambda: make_bass("acoustic"),
    "genre_upright_bass.wav": lambda: make_bass("upright"),
    "genre_saw_lead.wav": lambda: make_tonal("saw_lead"),
    "genre_square_lead.wav": lambda: make_tonal("square_lead"),
    "genre_pad.wav": lambda: make_tonal("pad"),
    "genre_piano.wav": lambda: make_tonal("piano"),
    "genre_electric_piano.wav": lambda: make_tonal("electric_piano"),
    "genre_organ.wav": lambda: make_tonal("organ"),
    "genre_strings.wav": lambda: make_tonal("strings"),
    "genre_supersaw.wav": lambda: make_tonal("supersaw"),
    "genre_synth_brass.wav": lambda: make_tonal("synth_brass"),
    "genre_synth_strings.wav": lambda: make_tonal("synth_strings"),
    "genre_bell.wav": lambda: make_tonal("bell"),
    "genre_lead.wav": lambda: make_tonal("lead"),
    "genre_dark_pad.wav": lambda: make_tonal("dark_pad"),
    "genre_stab.wav": lambda: make_tonal("stab"),
    "genre_fm_bell.wav": lambda: make_tonal("fm_bell"),
    "genre_atmos_pad.wav": lambda: make_tonal("atmos_pad"),
    "genre_arpeggio.wav": lambda: make_tonal("arpeggio"),
    "genre_brass.wav": lambda: make_tonal("brass"),
    "genre_marimba.wav": lambda: make_tonal("marimba"),
    "genre_kalimba.wav": lambda: make_tonal("kalimba"),
    "genre_pan_flute.wav": lambda: make_tonal("pan_flute"),
    "genre_flute.wav": lambda: make_tonal("flute"),
    "genre_sitar.wav": lambda: make_tonal("sitar"),
    "genre_koto.wav": lambda: make_tonal("koto"),
    "genre_grand_piano.wav": lambda: make_tonal("grand_piano"),
    "genre_brass_section.wav": lambda: make_tonal("brass_section"),
    "genre_vibraphone.wav": lambda: make_tonal("vibraphone"),
    "genre_white_noise.wav": lambda: make_noise_fx("white"),
    "genre_filter_sweep_up.wav": lambda: make_noise_fx("sweep_up"),
    "genre_filter_sweep_down.wav": lambda: make_noise_fx("sweep_down"),
    "genre_reverse_cymbal.wav": lambda: make_metal(0.78, reverse=True),
    "genre_impact.wav": make_impact,
    "genre_vinyl_noise.wav": make_vinyl_noise,
    "genre_vocal_chop.wav": lambda: formant_voice("chop"),
    "genre_voice_yeah.wav": lambda: formant_voice("yeah"),
    "genre_voice_come_on.wav": lambda: formant_voice("come_on"),
    "genre_noise_sweep.wav": lambda: make_noise_fx("noise_sweep"),
    "genre_riser.wav": lambda: make_noise_fx("riser"),
    "genre_voice_fx.wav": lambda: formant_voice("fx"),
    "genre_glitch.wav": lambda: make_noise_fx("glitch"),
    "genre_reverse_fx.wav": lambda: make_noise_fx("reverse_fx"),
    "genre_vinyl_stop.wav": lambda: make_noise_fx("vinyl_stop"),
    "genre_downlifter.wav": lambda: make_noise_fx("downlifter"),
    "genre_scratch.wav": lambda: make_noise_fx("scratch"),
    "genre_explosion.wav": lambda: make_impact(explosion=True),
    "genre_voice_sample.wav": lambda: formant_voice("sample"),
    "genre_fx_hit.wav": lambda: make_impact(hit=True),
    "genre_bird.wav": lambda: make_nature("bird"),
    "genre_river.wav": lambda: make_nature("river"),
    "genre_wind.wav": lambda: make_nature("wind"),
    "genre_forest.wav": lambda: make_nature("forest"),
    "genre_rain.wav": lambda: make_nature("rain"),
    "genre_applause.wav": lambda: make_ambience("applause"),
    "genre_finger_snap.wav": lambda: make_ambience("snap"),
    "genre_club_ambience.wav": lambda: make_ambience("club"),
    "genre_brush_sweep.wav": lambda: make_noise_fx("brush"),
}


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, maker in SOUNDS.items():
        random.seed(sum((index + 1) * ord(char) for index, char in enumerate(filename)))
        samples = maker()
        if not 0.1 * SAMPLE_RATE <= len(samples) <= 1.0 * SAMPLE_RATE:
            raise ValueError(f"{filename}: duration out of range")
        output_path = OUTPUT_DIR / filename
        write_wav(output_path, samples)
        print(f"{filename}: {len(samples) / SAMPLE_RATE:.2f}s")


if __name__ == "__main__":
    main()
