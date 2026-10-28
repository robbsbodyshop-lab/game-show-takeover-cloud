"""
Generates the game's sound effects and music procedurally so every cue is an
original, license-free asset in a 1970s network game-show style: brass
sections, electric piano, Hammond-style organ, vibraphone, disco drums, a sad
trombone and a studio audience. The Family Feud (ff_*) and Wheel of Fortune
(wof_*) cues evoke the role and energy of each TV moment without copying any
real melody, theme or sample. Run from the project root:

    python scripts/generate_sfx.py            # everything
    python scripts/generate_sfx.py alarm.mp3  # one cue

Outputs MP3 files into public/audio/ (see public/audio/README.md for the cue map).
Requires numpy, scipy and lameenc (pip install -r scripts/requirements-audio.txt).
"""
from __future__ import annotations

import math
import os
import struct
import sys
import zlib
from typing import Callable, Sequence

import numpy as np
from scipy.signal import butter, lfilter

try:
    import lameenc
except ImportError:  # pragma: no cover
    print("pip install lameenc", file=sys.stderr)
    raise

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
RNG = np.random.default_rng(1977)


# --------------------------------------------------------------------------- utils

def t(seconds: float) -> np.ndarray:
    return np.arange(int(SR * seconds)) / SR


def env(n: int, attack=0.005, decay=0.1, sustain=0.6, release=0.2) -> np.ndarray:
    """ADSR envelope for n samples."""
    a, d, r = int(attack * SR), int(decay * SR), int(release * SR)
    s = max(0, n - a - d - r)
    parts = [
        np.linspace(0, 1, a, endpoint=False),
        np.linspace(1, sustain, d, endpoint=False),
        np.full(s, sustain),
        np.linspace(sustain, 0, r),
    ]
    e = np.concatenate(parts)
    if len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return e[:n]


def osc(freq, seconds: float, shape="sine", vib_rate=0.0, vib_depth=0.0, glide_from: float | None = None) -> np.ndarray:
    """Oscillator with optional vibrato and a pitch glide into the note. `freq` may be an array."""
    x = t(seconds)
    f = np.full_like(x, freq) if np.isscalar(freq) else np.asarray(freq)
    if glide_from is not None:
        glide = np.exp(-x * 25)
        f = f * (1 - glide) + glide_from * glide
    if vib_rate:
        f = f * (1 + vib_depth * np.sin(2 * math.pi * vib_rate * x) * np.minimum(1.0, x * 6))
    phase = 2 * math.pi * np.cumsum(f) / SR
    if shape == "square":
        return np.sign(np.sin(phase))
    if shape == "saw":
        return 2 * ((phase / (2 * math.pi)) % 1.0) - 1
    if shape == "tri":
        return 2 * np.abs(2 * ((phase / (2 * math.pi)) % 1.0) - 1) - 1
    return np.sin(phase)


def tone(freq: float, seconds: float, shape="sine", harmonics=(1.0,)) -> np.ndarray:
    out = np.zeros(int(SR * seconds))
    for i, amp in enumerate(harmonics, start=1):
        out += amp * osc(freq * i, seconds, shape)
    return out / max(1e-9, np.max(np.abs(out)))


def sweep(f0: float, f1: float, seconds: float, shape="sine") -> np.ndarray:
    x = t(seconds)
    freqs = f0 * (f1 / f0) ** (x / seconds)
    return osc(freqs, seconds, shape)


def noise(seconds: float) -> np.ndarray:
    return RNG.uniform(-1, 1, int(SR * seconds))


def lowpass(sig: np.ndarray, cutoff: float, order=4) -> np.ndarray:
    b, a = butter(order, min(cutoff, SR / 2 - 100) / (SR / 2), btype="low")
    return lfilter(b, a, sig)


def highpass(sig: np.ndarray, cutoff: float, order=2) -> np.ndarray:
    b, a = butter(order, cutoff / (SR / 2), btype="high")
    return lfilter(b, a, sig)


def bandpass(sig: np.ndarray, lo: float, hi: float, order=2) -> np.ndarray:
    b, a = butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], btype="band")
    return lfilter(b, a, sig)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SR * seconds))


def mix(*parts: np.ndarray) -> np.ndarray:
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def place(base: np.ndarray, clip: np.ndarray, at: float, gain=1.0) -> np.ndarray:
    start = int(at * SR)
    end = start + len(clip)
    if end > len(base):
        base = np.pad(base, (0, end - len(base)))
    base[start:end] += clip * gain
    return base


def normalize(sig: np.ndarray, peak=0.9) -> np.ndarray:
    m = np.max(np.abs(sig)) or 1.0
    return sig / m * peak


def fade(sig: np.ndarray, fin=0.005, fout=0.02) -> np.ndarray:
    n_in, n_out = int(fin * SR), int(fout * SR)
    sig = sig.copy()
    if n_in:
        sig[:n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        sig[-n_out:] *= np.linspace(1, 0, n_out)
    return sig


def reverb(sig: np.ndarray, wet=0.25, decay=0.4, tail=0.6) -> np.ndarray:
    """Cheap studio room: four feedback combs plus a short allpass-ish smear."""
    sig = np.pad(sig, (0, int(tail * SR)))
    out = np.zeros_like(sig)
    for d_ms in (29.7, 37.1, 41.1, 43.7):
        d = int(d_ms / 1000 * SR)
        a = np.zeros(d + 1)
        a[0] = 1.0
        a[d] = -decay
        out += lfilter([1.0], a, sig)
    out = lowpass(out / 4, 5000)
    return sig * (1 - wet) + out * wet


def tremolo(sig: np.ndarray, rate=5.0, depth=0.3) -> np.ndarray:
    x = np.arange(len(sig)) / SR
    return sig * (1 - depth / 2 + depth / 2 * np.sin(2 * math.pi * rate * x))


def soft_clip(sig: np.ndarray, drive=1.5) -> np.ndarray:
    return np.tanh(sig * drive) / math.tanh(drive)


def exact_length(sig: np.ndarray, seconds: float) -> np.ndarray:
    """Pads or cuts to exactly `seconds` (timed beds start with a game clock and must end with it)."""
    n = int(round(seconds * SR))
    return np.pad(sig, (0, max(0, n - len(sig))))[:n]


def fold_loop(sig: np.ndarray, seconds: float) -> np.ndarray:
    """Cuts a bed to `seconds` and wraps everything that rings past the loop point back onto the start."""
    n = int(round(seconds * SR))
    sig = np.pad(sig, (0, max(0, n - len(sig))))
    out = sig[:n].copy()
    tail = sig[n:]
    while len(tail):
        k = min(n, len(tail))
        out[:k] += tail[:k]
        tail = tail[k:]
    return out


def trim_tail(sig: np.ndarray, floor_db=-60.0) -> np.ndarray:
    """Drops trailing near-silence (reverb padding) so a cue's file length matches what you hear."""
    peak = np.max(np.abs(sig)) or 1.0
    loud = np.nonzero(np.abs(sig) > peak * 10 ** (floor_db / 20))[0]
    if not len(loud):
        return sig
    return sig[: min(len(sig), loud[-1] + int(0.03 * SR))]


# MPEG-1 Layer III bitrates (kbps) by header index.
_BITRATES = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
_ENCODER_DELAY = 576  # LAME 3.100 look-ahead in samples (measured: decoders add 529 more)


def _crc16(buf: bytes, crc=0) -> int:
    """CRC-16/ARC, the checksum the LAME tag uses."""
    for byte in buf:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc & 0xFFFF


def with_info_tag(data: bytes, n_samples: int) -> bytes:
    """Prepends a LAME 'Info' frame recording the encoder delay and padding.

    Browsers (FFmpeg-based decoders), mpg123 and CoreAudio then trim the codec's
    leading silence and trailing padding, so the decoded file is exactly
    `n_samples` long: timed beds end with their clocks and loops wrap cleanly.
    Decoders that ignore the tag play it as one silent 26 ms frame.
    """
    frames = 0
    pos = 0
    while pos + 4 <= len(data):
        head = data[pos : pos + 4]
        if head[0] != 0xFF or (head[1] & 0xE0) != 0xE0:
            raise ValueError(f"lost MP3 frame sync at byte {pos}")
        pos += 144 * _BITRATES[head[2] >> 4] * 1000 // SR + ((head[2] >> 1) & 1)
        frames += 1
    padding = frames * 1152 - n_samples - _ENCODER_DELAY
    if not 0 <= padding < 4096:
        raise ValueError(f"unexpected encoder padding {padding}")
    header = bytearray(data[:4])
    header[2] &= 0xFD  # no padding slot
    header[3] &= 0xCF  # no joint-stereo mode extension
    size = 144 * _BITRATES[header[2] >> 4] * 1000 // SR
    total = size + len(data)
    tag = bytearray(size)
    tag[:4] = header
    xing = 4 + 32  # after the header and the (silent) stereo side info
    tag[xing : xing + 4] = b"Info"
    struct.pack_into(">III", tag, xing + 4, 0x0F, frames, total)  # flags: frames, bytes, TOC, quality
    tag[xing + 16 : xing + 116] = bytes(min(255, i * 256 // 100) for i in range(100))  # linear TOC (CBR)
    lame = xing + 120
    tag[lame : lame + 9] = b"LAME3.100"
    tag[lame + 9] = 0x01  # tag revision 0, CBR
    tag[lame + 20] = _BITRATES[header[2] >> 4]
    tag[lame + 21 : lame + 24] = ((_ENCODER_DELAY << 12) | padding).to_bytes(3, "big")
    struct.pack_into(">I", tag, lame + 28, total)
    struct.pack_into(">H", tag, lame + 32, _crc16(data))
    struct.pack_into(">H", tag, 190, _crc16(bytes(tag[:190])))
    return bytes(tag) + data


LOUDNESS_CEILING_DB = -8.0  # loudest 400 ms RMS (dBFS) after peak normalization; matches the strike and buzzers


def cap_loudness(sig: np.ndarray, ceiling_db=LOUDNESS_CEILING_DB) -> np.ndarray:
    """Turns down dense cues (buzzers, sustained whistles) whose loudest 400 ms would stand out above the set."""
    w = int(0.4 * SR)
    power = np.cumsum(np.insert(sig**2, 0, 0.0))
    loudest = np.max(power[w:] - power[:-w]) / w if len(sig) > w else power[-1] / max(1, len(sig))
    level = 10 * math.log10(loudest + 1e-12)
    return sig * 10 ** ((ceiling_db - level) / 20) if level > ceiling_db else sig


def write_mp3(name: str, sig: np.ndarray, bitrate=112, seconds: float | None = None, loop=False) -> None:
    """Normalizes to the shared 0.9 peak (with a loudness ceiling) and encodes. `seconds` forces an exact length;
    `loop` skips the edge fades."""
    if seconds is not None:
        sig = exact_length(sig, seconds)
    if loop:
        sig = normalize(sig)
    elif seconds is not None:
        sig = normalize(fade(sig, 0.002, 0.02))
    else:
        sig = normalize(fade(trim_tail(sig)))
    sig = cap_loudness(sig)
    pcm = (np.clip(sig, -1, 1) * 32767).astype(np.int16)
    stereo = np.repeat(pcm[:, None], 2, axis=1).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(bitrate)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    data = with_info_tag(enc.encode(stereo) + enc.flush(), len(pcm))
    path = os.path.join(OUT, name)
    with open(path, "wb") as fh:
        fh.write(data)
    print(f"wrote {name:28s} {len(sig)/SR:6.3f}s {len(data)//1024:4d} KB")


# --------------------------------------------------------------------------- notes

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}


def hz(name: str) -> float:
    """'C4' -> 261.63. Accepts sharps and flats."""
    octave = int(name[-1])
    pitch = name[:-1]
    pitch = FLATS.get(pitch, pitch)
    semis = NOTE_NAMES.index(pitch) + (octave + 1) * 12
    return 440.0 * 2 ** ((semis - 69) / 12)


# --------------------------------------------------------------------------- instruments
# Every instrument is (freq, seconds) -> mono signal, peak roughly 1.

def brass(f: float, seconds: float, bright=2800.0) -> np.ndarray:
    """Section brass: two detuned saws, a little vibrato, filter that opens after the attack."""
    a = osc(f, seconds, "saw", vib_rate=5.5, vib_depth=0.006)
    b = osc(f * 1.004, seconds, "saw", vib_rate=5.2, vib_depth=0.006)
    c = osc(f * 0.5, seconds, "saw") * 0.35
    sig = lowpass(a + b + c, bright)
    attack_open = lowpass(a + b + c, bright * 0.45) * np.exp(-t(seconds) * 40)
    sig = sig + attack_open
    return soft_clip(sig * 0.4, 1.8) * env(len(sig), 0.035, 0.08, 0.85, min(0.12, seconds / 3))


def trombone(f, seconds: float, glide_from: float | None = None) -> np.ndarray:
    a = osc(f, seconds, "saw", vib_rate=5.0, vib_depth=0.012, glide_from=glide_from)
    b = osc(f * 1.003, seconds, "saw", vib_rate=4.7, vib_depth=0.012, glide_from=glide_from)
    sig = lowpass(a + b, 1600)
    return soft_clip(sig * 0.5, 1.6) * env(len(sig), 0.05, 0.1, 0.9, min(0.15, seconds / 3))


def epiano(f: float, seconds: float) -> np.ndarray:
    """Rhodes-style tine piano: sine body, bright inharmonic 'tine' that dies fast, slow tremolo."""
    x = t(seconds)
    body = np.sin(2 * math.pi * f * x) * np.exp(-x * 2.2)
    second = 0.45 * np.sin(2 * math.pi * f * 2 * x) * np.exp(-x * 4.5)
    tine = 0.28 * np.sin(2 * math.pi * f * 6.02 * x) * np.exp(-x * 24)
    bark = 0.12 * np.sin(2 * math.pi * f * 3.01 * x) * np.exp(-x * 9)
    sig = body + second + tine + bark
    return tremolo(sig, 4.5, 0.25) * env(len(sig), 0.003, 0.05, 1.0, min(0.15, seconds / 3))


def organ(f: float, seconds: float) -> np.ndarray:
    """Drawbar organ (16', 8', 4', 2 2/3', 2') with a Leslie-ish wobble and key click."""
    x = t(seconds)
    sig = np.zeros_like(x)
    for ratio, amp in ((0.5, 0.6), (1.0, 1.0), (2.0, 0.7), (3.0, 0.35), (4.0, 0.45), (6.0, 0.15)):
        sig += amp * np.sin(2 * math.pi * f * ratio * x)
    sig /= 3.2
    click = highpass(noise(0.01), 3000) * np.exp(-t(0.01) * 900)
    sig = place(sig, click, 0.0, 0.15)[: len(x)]
    sig = tremolo(sig, 6.2, 0.35)
    return sig * env(len(sig), 0.004, 0.0, 1.0, min(0.06, seconds / 3))


def vibes(f: float, seconds: float) -> np.ndarray:
    """Vibraphone: pure fundamental, a 4th-partial shimmer, motor tremolo."""
    x = t(seconds)
    sig = np.sin(2 * math.pi * f * x) * np.exp(-x * 1.6)
    sig += 0.25 * np.sin(2 * math.pi * f * 4 * x) * np.exp(-x * 7)
    sig += 0.1 * np.sin(2 * math.pi * f * 10 * x) * np.exp(-x * 30)
    mallet = bandpass(noise(0.008), 2000, 6000) * np.exp(-t(0.008) * 700)
    sig = place(sig, mallet, 0.0, 0.3)[: len(x)]
    return tremolo(sig, 5.5, 0.35) * env(len(sig), 0.002, 0.02, 1.0, min(0.2, seconds / 2))


def marimba(f: float, seconds: float) -> np.ndarray:
    x = t(seconds)
    sig = np.sin(2 * math.pi * f * x) * np.exp(-x * 7)
    sig += 0.35 * np.sin(2 * math.pi * f * 3.93 * x) * np.exp(-x * 22)
    mallet = bandpass(noise(0.006), 1500, 5000) * np.exp(-t(0.006) * 900)
    return place(sig, mallet, 0.0, 0.4)[: len(x)] * env(len(x), 0.001, 0.0, 1.0, 0.03)


def bass(f: float, seconds: float) -> np.ndarray:
    """Round fingered electric bass with a plucky filter and a sub."""
    x = t(seconds)
    body = osc(f, seconds, "saw") * 0.6 + osc(f, seconds, "square") * 0.25
    sub = np.sin(2 * math.pi * f * x) * 0.7
    pluck = lowpass(body, 1200) * np.exp(-x * 10) + lowpass(body, 380)
    sig = pluck * 0.6 + sub
    return sig * env(len(sig), 0.004, 0.08, 0.75, min(0.06, seconds / 3))


def strings(f: float, seconds: float) -> np.ndarray:
    """String-machine pad: three detuned saws, slow attack, gentle chorus wobble."""
    sig = sum(osc(f * d, seconds, "saw", vib_rate=r, vib_depth=0.004) for d, r in ((1.0, 0.7), (1.006, 1.1), (0.994, 0.9)))
    sig = lowpass(sig, 1900) / 3
    return sig * env(len(sig), 0.18, 0.1, 0.9, min(0.35, seconds / 2))


def harp(f: float, seconds: float) -> np.ndarray:
    x = t(seconds)
    sig = np.sin(2 * math.pi * f * x) * np.exp(-x * 4) + 0.3 * np.sin(2 * math.pi * f * 2 * x) * np.exp(-x * 9)
    return sig * env(len(x), 0.001, 0.0, 1.0, 0.1)


def bell(f: float, seconds: float) -> np.ndarray:
    """Studio desk bell / tubular bell partials."""
    x = t(seconds)
    partials = [(1.0, 1.0), (2.0, 0.6), (2.76, 0.45), (5.4, 0.22), (8.9, 0.08)]
    sig = np.zeros_like(x)
    for ratio, amp in partials:
        if f * ratio > 0.45 * SR:  # skip partials that would alias on very high bells
            continue
        sig += amp * np.sin(2 * math.pi * f * ratio * x) * np.exp(-x * (2.2 + ratio * 0.8))
    return sig * env(len(x), 0.002, 0.04, 0.95, min(0.3, seconds / 2))


def buzzer(freq=110.0, seconds=0.8, harsh=True) -> np.ndarray:
    """Electromechanical wrong-answer buzzer: rasping square through a low-pass, 50 Hz mains flutter."""
    a = tone(freq, seconds, "square", harmonics=(1.0, 0.5, 0.25))
    b = tone(freq * 1.01, seconds, "saw")
    flutter = 1 - 0.35 * (np.sin(2 * math.pi * 50 * t(seconds)) > 0)
    sig = lowpass((a + 0.6 * b) * flutter, 1800 if harsh else 900)
    return sig * env(len(sig), attack=0.005, decay=0.02, sustain=1.0, release=0.08)


# --------------------------------------------------------------------------- drums

def kick(seconds=0.3):
    body = sweep(140, 42, seconds) * np.exp(-t(seconds) * 14)
    click = highpass(noise(0.01), 2500) * np.exp(-t(0.01) * 700)
    return place(body, click, 0.0, 0.5)


def snare(seconds=0.22):
    body = np.sin(2 * math.pi * 185 * t(seconds)) * np.exp(-t(seconds) * 28)
    hiss = highpass(noise(seconds), 1600) * np.exp(-t(seconds) * 20)
    return body * 0.5 + hiss * 0.8


def hat(seconds=0.05, open_=False):
    d = 0.32 if open_ else seconds
    return highpass(noise(d), 6500) * np.exp(-t(d) * (11 if open_ else 90))


def shaker(seconds=0.06):
    return bandpass(noise(seconds), 4000, 9000) * np.exp(-t(seconds) * 70)


def tambourine(seconds=0.2):
    sig = np.zeros(int(seconds * SR))
    for k in range(6):
        jingle = bandpass(noise(0.05), 5000 + k * 900, 9000 + k * 900) * np.exp(-t(0.05) * 60)
        sig = place(sig, jingle, k * 0.006, 0.6)[: len(sig)]
    return sig * np.exp(-t(seconds) * 18)


def woodblock(seconds=0.05):
    return bandpass(noise(seconds), 1200, 2400) * np.exp(-t(seconds) * 140) + np.sin(2 * math.pi * 1500 * t(seconds)) * np.exp(-t(seconds) * 120) * 0.5


def timpani(f=82.0, seconds=1.4):
    x = t(seconds)
    sig = np.sin(2 * math.pi * f * x * (1 + 0.04 * np.exp(-x * 20))) * np.exp(-x * 2.5)
    sig += 0.3 * np.sin(2 * math.pi * f * 1.5 * x) * np.exp(-x * 5)
    thump = lowpass(noise(0.05), 400) * np.exp(-t(0.05) * 80)
    return place(sig, thump, 0.0, 0.8)


def drum_roll(seconds: float, start_gap=0.07, end_gap=0.03) -> np.ndarray:
    """Snare roll that tightens and gets louder."""
    total = silence(seconds + 0.1)
    at = 0.0
    while at < seconds:
        p = at / seconds
        hit = highpass(noise(0.04), 1500) * np.exp(-t(0.04) * 70)
        total = place(total, hit, at, 0.3 + 0.7 * p)
        at += start_gap + (end_gap - start_gap) * p
    return total


# --------------------------------------------------------------------------- sequencing

Event = tuple[float, Sequence[str] | str, float]  # (beat, note or chord, length in beats)


def seq(bpm: float, events: Sequence[Event], inst: Callable[[float, float], np.ndarray], gain=1.0, legato=0.95) -> np.ndarray:
    beat = 60.0 / bpm
    last = max(b + d for b, _, d in events)
    total = silence(last * beat + 1.5)
    for b, notes, d in events:
        for n in [notes] if isinstance(notes, str) else notes:
            total = place(total, inst(hz(n), d * beat * legato), b * beat, gain)
    return total


def pattern(bpm: float, bars: int, step_hits: dict[str, Sequence[float]], gains: dict[str, float] | None = None) -> np.ndarray:
    """Drum grid: {'kick': [0, 1, 2, 3], 'snare': [1, 3], 'hat': [0, .5, ...]} in beats within one bar."""
    beat = 60.0 / bpm
    gains = gains or {}
    total = silence(beat * 4 * bars + 1.0)
    makers = {
        "kick": lambda: kick(),
        "snare": lambda: snare(),
        "hat": lambda: hat(),
        "ohat": lambda: hat(open_=True),
        "shaker": lambda: shaker(),
        "tamb": lambda: tambourine(),
        "block": lambda: woodblock(),
    }
    for bar in range(bars):
        base = bar * 4 * beat
        for name, beats in step_hits.items():
            for bpos in beats:
                total = place(total, makers[name](), base + bpos * beat, gains.get(name, 1.0))
    return total


def loop_len(bpm: float, bars: int) -> int:
    return int(60.0 / bpm * 4 * bars * SR)


# --------------------------------------------------------------------------- cues

def cue_wheel_letter_ding():
    """Vibraphone ding for a correct letter."""
    return reverb(vibes(hz("E6"), 0.9), 0.2)


def cue_ff_ding():
    """Survey says: desk bell, two strikes."""
    return reverb(mix(bell(hz("C6"), 1.1), place(silence(1.1), bell(hz("E6"), 0.9), 0.09, 0.8)), 0.25)


def cue_wheel_buzzer():
    return buzzer(98.0, 0.9)


def cue_ff_strike():
    """The strike: long rasping buzzer."""
    return buzzer(87.3, 1.1)


def cue_ff_buzzer():
    """Buzz-in: bright studio 'bing' so it reads as 'you're in', not 'wrong'."""
    a = bell(hz("G6"), 0.5)
    b = bell(hz("C7"), 0.45)
    return reverb(place(a, b, 0.07, 0.7), 0.15)


def cue_ff_you_said():
    """Drum roll into a timpani hit and a brass punch."""
    total = drum_roll(0.9)
    total = place(total, timpani(82.0, 1.2), 0.92, 1.0)
    total = place(total, brass(hz("C3"), 0.35, 2200), 0.92, 0.5)
    return reverb(total, 0.2)


def cue_puzzle_reveal():
    """Harp glissando up two octaves with a vibraphone chord on top."""
    total = silence(2.2)
    scale = ["C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5", "G5", "A5", "C6", "E6", "G6"]
    for i, n in enumerate(scale):
        total = place(total, harp(hz(n), 0.9), i * 0.045, 0.55)
    for n in ["C5", "E5", "G5", "C6"]:
        total = place(total, vibes(hz(n), 1.5), 0.62, 0.45)
    return reverb(total, 0.3)


def cue_bankrupt_lose_turn():
    """Sad trombone: wah, wah, wah, waaah."""
    total = silence(2.4)
    notes = [("Bb3", 0.32, 0.0), ("A3", 0.32, 0.38), ("Ab3", 0.32, 0.76), ("G3", 1.1, 1.14)]
    prev = None
    for name, dur, at in notes:
        f = hz(name)
        total = place(total, trombone(f, dur, glide_from=(prev or f) * 1.06), at, 0.9)
        prev = f
    # the last note sags flat
    x = t(0.5)
    sag = trombone(hz("G3") * (1 - 0.05 * x / 0.5), 0.5)
    total = place(total, sag * np.linspace(1, 0, len(sag)), 1.14 + 1.0, 0.7)
    return reverb(total, 0.25)


def cue_wheel_spin(seconds=7.0):
    """Wooden clicker flapping past brass pegs, slowing over the spin (matches the 7s animation)."""
    total = silence(seconds + 0.3)
    click = bandpass(noise(0.014), 1400, 5000) * np.exp(-t(0.014) * 400)
    at = 0.0
    while at < seconds:
        total = place(total, click, at, 0.9)
        progress = at / seconds
        at += 0.04 + 0.42 * progress ** 2.2
    return total


def cue_spin_tick():
    return bandpass(noise(0.02), 1400, 5000) * np.exp(-t(0.02) * 300)


def cue_vowel():
    """Organ blip for buying a vowel."""
    a = organ(hz("E5"), 0.13)
    b = organ(hz("A5"), 0.2)
    return reverb(place(a, b, 0.12), 0.15)


def cue_alarm():
    """Time's up: klaxon pulses, two beating tones through a horn-ish band."""
    total = silence(1.6)
    for i in range(3):
        blast = mix(osc(hz("A3"), 0.32, "square"), osc(hz("A3") * 1.02, 0.32, "square") * 0.8, osc(hz("E4"), 0.32, "saw") * 0.5)
        blast = bandpass(blast, 300, 2800) * env(len(blast), 0.005, 0.02, 1.0, 0.05)
        total = place(total, blast, i * 0.48, 0.8)
    return reverb(total, 0.15)


def cue_steal_success():
    """Short brass fanfare with a tambourine hit."""
    events: list[Event] = [(0, ["C4", "E4", "G4"], 0.4), (0.5, ["C4", "F4", "A4"], 0.4), (1.0, ["C4", "E4", "G4", "C5"], 1.6)]
    total = seq(150, events, brass, 0.55)
    total = place(total, tambourine(), 60 / 150 * 1.0, 0.7)
    total = place(total, kick(), 60 / 150 * 1.0, 0.8)
    return reverb(total, 0.25)


def cue_steal_fail():
    """Trombone slide down."""
    x = t(1.0)
    f = hz("E4") * (1 - 0.45 * np.minimum(1.0, x / 0.85))
    sig = trombone(f, 1.0)
    return reverb(sig, 0.25)


def cue_applause(seconds=4.5):
    """Studio audience: dense random claps over a roar, swelling in and thinning out."""
    total = silence(seconds + 0.5)
    n_claps = 2600
    times = RNG.uniform(0, seconds, n_claps)
    for at in times:
        p = at / seconds
        density = math.sin(math.pi * min(1.0, p * 1.15)) ** 0.7  # swell then fade
        if RNG.uniform() > density:
            continue
        length = RNG.uniform(0.004, 0.011)
        clap = bandpass(noise(length), RNG.uniform(900, 1600), RNG.uniform(2600, 4200)) * np.exp(-t(length) * RNG.uniform(250, 500))
        total = place(total, clap, at, RNG.uniform(0.3, 1.0) * 0.6)
    roar = bandpass(noise(seconds + 0.5), 250, 1800) * 0.35
    roar *= np.sin(math.pi * np.minimum(1.0, t(seconds + 0.5) / seconds)) ** 1.5
    whoop = sweep(hz("A4"), hz("E5"), 0.35, "tri") * np.exp(-t(0.35) * 6) * 0.15
    total = place(mix(total, roar), whoop, seconds * 0.35)
    return reverb(total, 0.35, 0.5)


def cue_winner_fanfare():
    """Big finish: drum roll, brass fanfare, organ swell, cymbal-ish splash, applause underneath."""
    bpm = 132
    beat = 60 / bpm
    fan: list[Event] = [
        (0, ["G3", "C4", "E4"], 0.5), (0.5, ["G3", "C4", "E4"], 0.5), (1.0, ["C4", "E4", "G4"], 1.0),
        (2.0, ["C4", "F4", "A4"], 0.5), (2.5, ["D4", "G4", "B4"], 0.5), (3.0, ["C4", "E4", "G4", "C5"], 3.0),
    ]
    total = seq(bpm, fan, brass, 0.5)
    total = place(total, seq(bpm, [(3.0, ["C3", "G3", "C4", "E4", "G4"], 3.0)], organ, 0.35), 0.0)
    total = place(total, seq(bpm, [(3.0, ["C5", "E5", "G5"], 3.0)], strings, 0.3), 0.0)
    total = place(total, drum_roll(beat * 2.8), 0.0, 0.5)
    total = place(total, kick(), 0.0, 0.9)
    total = place(total, kick(), beat * 1.0, 0.9)
    total = place(total, kick(), beat * 3.0, 1.0)
    total = place(total, tambourine(), beat * 3.0, 0.8)
    total = place(total, hat(open_=True), beat * 3.0, 0.6)
    total = place(total, cue_applause(4.2), beat * 2.6, 0.55)
    return reverb(total, 0.25)


# --------------------------------------------------------------------------- music

def music_hub_theme():
    """Funky studio theme, 112 bpm, 8 bars: disco drums, walking bass, tine piano, brass stabs, strings."""
    bpm, bars = 112, 8
    bass_line: list[Event] = []
    walk = [
        ["C2", "C2", "G2", "Bb2", "C3", "Bb2", "G2", "E2"],
        ["F2", "F2", "C3", "Eb3", "F3", "Eb3", "C3", "A2"],
        ["C2", "C2", "G2", "Bb2", "C3", "Bb2", "G2", "E2"],
        ["G2", "G2", "D3", "F3", "F2", "F2", "A2", "B2"],
    ]
    for bar in range(bars):
        for i, n in enumerate(walk[bar % 4]):
            bass_line.append((bar * 4 + i * 0.5, n, 0.5))

    chords = {0: ["E4", "G4", "Bb4", "D5"], 1: ["A4", "C5", "Eb5", "G5"], 2: ["E4", "G4", "Bb4", "D5"], 3: ["B4", "D5", "F5", "A5"]}
    ep: list[Event] = []
    for bar in range(bars):
        c = chords[bar % 4]
        ep += [(bar * 4 + 0.5, c, 0.5), (bar * 4 + 1.5, c, 0.5), (bar * 4 + 2.5, c, 1.0), (bar * 4 + 3.75, c, 0.25)]

    stabs: list[Event] = []
    for bar in (1, 3, 5, 7):
        stabs += [(bar * 4 + 2.5, ["G4", "Bb4", "D5"], 0.25), (bar * 4 + 3.0, ["A4", "C5", "E5"], 0.25), (bar * 4 + 3.5, ["Bb4", "D5", "F5"], 0.5)]
    stabs += [(7 * 4 + 3.5, ["C5", "E5", "G5", "C6"], 0.5)]

    lead: list[Event] = [
        (8, "G5", 0.5), (8.5, "Bb5", 0.5), (9, "C6", 1.0), (10, "Bb5", 0.5), (10.5, "G5", 0.5), (11, "F5", 1.0),
        (12, "Eb5", 0.5), (12.5, "F5", 0.5), (13, "G5", 1.5), (14.5, "Bb5", 0.5), (15, "C6", 1.0),
        (24, "C6", 0.5), (24.5, "Bb5", 0.5), (25, "G5", 1.0), (26, "F5", 0.5), (26.5, "Eb5", 0.5), (27, "F5", 1.0),
        (28, "G5", 0.5), (28.5, "Bb5", 0.5), (29, "C6", 0.5), (29.5, "D6", 0.5), (30, "Eb6", 2.0),
    ]
    pad: list[Event] = []
    for bar in range(bars):
        pad.append((bar * 4, {0: ["C5", "E5"], 1: ["C5", "F5"], 2: ["C5", "E5"], 3: ["B4", "D5"]}[bar % 4], 4))

    drums = pattern(
        bpm, bars,
        {"kick": [0, 1, 2, 3], "snare": [1, 3], "hat": [0, 1, 2, 3], "ohat": [0.5, 1.5, 2.5, 3.5], "shaker": [x / 4 for x in range(16)], "tamb": [1, 3]},
        {"kick": 0.95, "snare": 0.6, "hat": 0.35, "ohat": 0.3, "shaker": 0.18, "tamb": 0.25},
    )
    music = mix(
        seq(bpm, bass_line, bass, 0.75, 0.9),
        seq(bpm, ep, epiano, 0.28),
        seq(bpm, stabs, brass, 0.3),
        seq(bpm, lead, brass, 0.28, 0.9),
        seq(bpm, pad, strings, 0.16),
        drums * 0.8,
    )
    return reverb(music, 0.15)[: loop_len(bpm, bars)]


def music_countdown():
    """Think music, 126 bpm, 8 bars: vibraphone tune over marimba ostinato, walking bass, brushed drums, ticking block."""
    bpm, bars = 126, 8
    ost_bars = [
        ["F3", "A3", "C4", "A3", "F3", "A3", "C4", "A3"],
        ["Bb3", "D4", "F4", "D4", "Bb3", "D4", "F4", "D4"],
        ["F3", "A3", "C4", "A3", "F3", "A3", "C4", "A3"],
        ["C4", "E4", "G4", "E4", "C4", "E4", "G4", "E4"],
    ]
    ost: list[Event] = []
    for bar in range(bars):
        for i, n in enumerate(ost_bars[bar % 4]):
            ost.append((bar * 4 + i * 0.5, n, 0.5))
    tune: list[Event] = [
        (0, "A5", 1), (1, "C6", 1), (2, "A5", 0.5), (2.5, "G5", 0.5), (3, "F5", 1),
        (4, "D5", 1), (5, "F5", 1), (6, "D5", 2),
        (8, "A5", 1), (9, "C6", 1), (10, "A5", 0.5), (10.5, "G5", 0.5), (11, "F5", 1),
        (12, "G5", 1), (13, "E5", 1), (14, "C5", 2),
        (16, "F5", 0.5), (16.5, "G5", 0.5), (17, "A5", 1), (18, "C6", 0.5), (18.5, "A5", 0.5), (19, "G5", 1),
        (20, "Bb5", 1), (21, "A5", 1), (22, "F5", 2),
        (24, "C6", 1), (25, "A5", 1), (26, "G5", 0.5), (26.5, "F5", 0.5), (27, "E5", 1),
        (28, "G5", 1), (29, "E5", 1), (30, "F5", 2),
    ]
    bassline: list[Event] = []
    walk = [["F2", "A2", "C3", "A2"], ["Bb2", "D3", "F3", "D3"], ["F2", "A2", "C3", "A2"], ["C3", "E3", "G3", "E3"]]
    for bar in range(bars):
        for i, n in enumerate(walk[bar % 4]):
            bassline.append((bar * 4 + i, n, 1))
    drums = pattern(
        bpm, bars,
        {"kick": [0, 2.5], "snare": [1, 3], "hat": [0.5, 1.5, 2.5, 3.5], "shaker": [x / 2 for x in range(8)], "block": [0, 1, 2, 3]},
        {"kick": 0.6, "snare": 0.3, "hat": 0.25, "shaker": 0.2, "block": 0.45},
    )
    music = mix(
        seq(bpm, ost, marimba, 0.35),
        seq(bpm, tune, vibes, 0.5),
        seq(bpm, bassline, bass, 0.5, 0.85),
        drums,
    )
    return reverb(music, 0.18)[: loop_len(bpm, bars)]


def music_feud_intro():
    """Round opener (about 4s): drum pickup, rising brass fanfare, organ hit, tambourine."""
    bpm = 128
    beat = 60 / bpm
    fan: list[Event] = [
        (0, ["C4", "E4"], 0.5), (0.5, ["D4", "F4"], 0.5), (1.0, ["E4", "G4"], 0.5), (1.5, ["F4", "A4"], 0.5),
        (2.0, ["G4", "B4", "D5"], 1.0), (3.0, ["C4", "E4", "G4", "C5"], 2.5),
    ]
    total = seq(bpm, fan, brass, 0.55)
    total = place(total, seq(bpm, [(3.0, ["C3", "G3", "C4", "E4", "G4"], 2.5)], organ, 0.4), 0.0)
    total = place(total, seq(bpm, [(0, "C2", 1), (1, "E2", 1), (2, "G2", 1), (3, "C2", 2.5)], bass, 0.6), 0.0)
    for b in (0, 1, 2, 3):
        total = place(total, kick(), b * beat, 0.9)
        total = place(total, hat(), b * beat + beat / 2, 0.35)
    total = place(total, snare(), 1 * beat, 0.6)
    total = place(total, snare(), 2.5 * beat, 0.6)
    total = place(total, tambourine(), 3 * beat, 0.8)
    total = place(total, hat(open_=True), 3 * beat, 0.6)
    return reverb(total, 0.25)


# --------------------------------------------------------------------------- game-show instruments

def semi(f: float, semitones: float) -> float:
    return f * 2 ** (semitones / 12)


def partials(f: float, x: np.ndarray, parts: Sequence[tuple[float, float, float]]) -> np.ndarray:
    """Sum of decaying sine partials (ratio, amplitude, decay/s); anything above 0.45*SR is skipped to avoid aliasing."""
    sig = np.zeros_like(x)
    for ratio, amp, decay in parts:
        if f * ratio < 0.45 * SR:
            sig += amp * np.sin(2 * math.pi * f * ratio * x + ratio) * np.exp(-x * decay)
    return sig


def glock(f: float, seconds: float) -> np.ndarray:
    """Glockenspiel: bright bar partials and a hard mallet tick."""
    x = t(seconds)
    sig = partials(f, x, ((1.0, 1.0, 2.5), (2.76, 0.4, 8.0), (5.4, 0.18, 18.0)))
    tick = highpass(noise(0.004), 4000) * np.exp(-t(0.004) * 1500)
    sig = place(sig, tick, 0.0, 0.25)[: len(x)]
    return sig * env(len(x), 0.001, 0.0, 1.0, min(0.08, seconds / 3))


def chime(f: float, seconds: float) -> np.ndarray:
    """Tubular chime: slightly stretched partials with a long ring."""
    x = t(seconds)
    sig = partials(f, x, ((1.0, 1.0, 1.2), (2.0, 0.5, 2.0), (3.0, 0.35, 3.0), (4.2, 0.2, 4.5), (5.4, 0.12, 6.0)))
    return sig * env(len(x), 0.002, 0.0, 1.0, min(0.2, seconds / 3))


def clang(f: float, seconds: float) -> np.ndarray:
    """Bright metallic clang: inharmonic plate partials with a hard strike."""
    x = t(seconds)
    sig = partials(f, x, ((1.0, 1.0, 3.0), (1.51, 0.55, 4.5), (2.37, 0.5, 5.5), (3.19, 0.35, 7.0), (4.43, 0.25, 9.0), (6.12, 0.15, 12.0)))
    strike = bandpass(noise(0.02), 2500, 9000) * np.exp(-t(0.02) * 250)
    sig = place(sig, strike, 0.0, 0.6)[: len(x)]
    return sig * env(len(x), 0.001, 0.0, 1.0, min(0.1, seconds / 3))


def crash(seconds=1.6) -> np.ndarray:
    """Crash cymbal: clangorous square cluster plus hiss, long decay."""
    x = t(seconds)
    metal = sum(np.sign(np.sin(2 * math.pi * f * x)) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    sig = highpass(metal, 6000) * 0.25 + highpass(noise(seconds), 3500)
    return sig * np.exp(-x * 2.4) * env(len(x), 0.002, 0.0, 1.0, 0.1)


def beep(f: float, seconds: float, shape="square", cutoff=4000.0) -> np.ndarray:
    """Clean electronic quiz beep."""
    sig = lowpass(osc(f, seconds, shape), cutoff)
    return sig * env(len(sig), 0.003, 0.0, 1.0, 0.012)


def pluck(f: float, seconds: float) -> np.ndarray:
    """Plucked string (Karplus-Strong): a noise burst ringing in a damped delay line."""
    n = int(SR * seconds)
    period = max(2, int(round(SR / f - 0.5)))
    burst = lowpass(noise(period / SR + 0.001), 3000)[:period]
    excite = np.zeros(n)
    excite[: len(burst)] = burst
    a = np.zeros(period + 2)
    a[0], a[period], a[period + 1] = 1.0, -0.4975, -0.4975
    sig = lfilter([1.0], a, excite)
    return sig / (np.max(np.abs(sig)) or 1.0) * env(n, 0.001, 0.0, 1.0, min(0.05, seconds / 3))


def tv_bandpass(sig: np.ndarray, centre: np.ndarray, q=4.0, block=256) -> np.ndarray:
    """Band-pass whose centre follows `centre` (Hz per sample), for whooshes and moving vowel formants."""
    out = np.zeros_like(sig)
    zi = np.zeros(2)
    for s in range(0, len(sig), block):
        fc = float(np.clip(centre[min(s + block // 2, len(centre) - 1)], 40.0, SR / 2 - 500))
        w0 = 2 * math.pi * fc / SR
        alpha = math.sin(w0) / (2 * q)
        b = np.array([alpha, 0.0, -alpha]) / (1 + alpha)
        a = np.array([1.0, -2 * math.cos(w0) / (1 + alpha), (1 - alpha) / (1 + alpha)])
        out[s : s + block], zi = lfilter(b, a, sig[s : s + block], zi=zi)
    return out


def whoosh(seconds=0.3, f0=500.0, f1=6000.0, q=1.2) -> np.ndarray:
    """Air whoosh: noise through a band-pass sweeping f0 -> f1, swelling in and cutting off."""
    n = int(SR * seconds)
    x = np.arange(n) / n
    sig = tv_bandpass(noise(seconds), f0 * (f1 / f0) ** x, q)
    return sig * np.minimum(1.0, x / 0.8) ** 2 * np.minimum(1.0, (1 - x) / 0.2)


def timpani_roll(seconds: float, f: float, start=0.25, end=1.0) -> np.ndarray:
    """Timpani roll swelling from `start` to `end` gain."""
    total = silence(seconds + 1.0)
    at = 0.0
    while at < seconds:
        total = place(total, timpani(f, 0.6), at, start + (end - start) * at / seconds)
        at += 0.055
    return total


def steam_whistle(freqs: Sequence[float], seconds: float) -> np.ndarray:
    """Chime steam whistle: breathy pipes that scoop up into pitch and sag at the end."""
    x = t(seconds)
    scoop = 1 - 0.07 * np.exp(-x * 14)
    sag = 1 - 0.035 * np.clip((x - (seconds - 0.2)) / 0.2, 0, 1)
    sig = np.zeros_like(x)
    for i, f in enumerate(freqs):
        ph = 2 * math.pi * np.cumsum(f * scoop * sag * (1 + 0.003 * np.sin(2 * math.pi * (5 + i) * x))) / SR
        sig += np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
        sig += 4.0 * bandpass(noise(seconds), f * 0.94, f * 1.06)
    sig = sig / len(freqs) + highpass(noise(seconds), 2500) * 0.08
    return sig * env(len(x), 0.05, 0.05, 0.9, min(0.18, seconds / 3))


def claps(seconds: float, per_second=450.0, shape: Callable[[float], float] | None = None) -> np.ndarray:
    """Audience hand claps; `shape(progress)` sets the density over time (default: quick swell, slow thin-out)."""
    shape = shape or (lambda p: min(1.0, p / 0.12) * (1 - p) ** 1.3)
    total = silence(seconds + 0.2)
    for at in RNG.uniform(0, seconds, int(per_second * seconds)):
        if RNG.uniform() > shape(at / seconds):
            continue
        length = RNG.uniform(0.004, 0.011)
        clap = bandpass(noise(length), RNG.uniform(900, 1600), RNG.uniform(2600, 4200)) * np.exp(-t(length) * RNG.uniform(250, 500))
        total = place(total, clap, at, RNG.uniform(0.3, 1.0) * 0.6)
    return total


def crowd(
    seconds: float,
    voices: int,
    contour: Callable[[np.ndarray], np.ndarray],
    vowel_from: Sequence[float],
    vowel_to: Sequence[float],
    spread=0.12,
    pitch_range: tuple[float, float] | None = None,
) -> np.ndarray:
    """Studio audience voices: jittered glottal buzzes following a pitch contour, through moving vowel formants."""
    n = int(SR * seconds)
    src = np.zeros(n)
    for _ in range(voices):
        if pitch_range:
            p0 = RNG.uniform(*pitch_range)
        else:
            p0 = RNG.uniform(185, 290) if RNG.uniform() < 0.55 else RNG.uniform(100, 165)
        start = RNG.uniform(0, spread)
        dur = max(0.3, seconds - start - RNG.uniform(0, 0.3))
        x = t(dur)
        jitter = lowpass(RNG.standard_normal(len(x)), 6, 1)
        jitter /= np.max(np.abs(jitter)) or 1.0
        pitch = p0 * contour(x / dur) * (1 + 0.03 * jitter) * (1 + 0.01 * np.sin(2 * math.pi * RNG.uniform(4, 7) * x))
        phase = np.cumsum(pitch) / SR
        voice = (2 * (phase % 1.0) - 1) + 0.35 * noise(dur)
        amp = env(len(x), RNG.uniform(0.05, 0.18), 0.1, 0.85, min(0.5, dur * 0.45))
        src = place(src, voice * amp, start, RNG.uniform(0.4, 1.0))[:n]
    progress = np.linspace(0, 1, n)
    out = np.zeros(n)
    for k, (fa, fb) in enumerate(zip(vowel_from, vowel_to)):
        out += tv_bandpass(src, fa + (fb - fa) * progress, (5.0, 8.0, 10.0)[k]) * (1.0, 0.7, 0.35)[k]
    return lowpass(out, 5000)


def aww_contour(p: np.ndarray) -> np.ndarray:
    """Sympathetic groan: a small lift, then a long slide down."""
    return 1.0 + 0.1 * np.minimum(1.0, p / 0.12) - 0.38 * np.clip((p - 0.12) / 0.88, 0, 1) ** 1.1


def cheer_contour(p: np.ndarray) -> np.ndarray:
    """'Yeah!': a quick rise that settles."""
    return 1.0 + 0.45 * np.minimum(1.0, p / 0.25) - 0.25 * np.clip((p - 0.4) / 0.6, 0, 1)


def woo_contour(p: np.ndarray) -> np.ndarray:
    """'Woo!': a falsetto swoop up and over."""
    return 1.0 + 0.6 * np.sin(math.pi * np.minimum(1.0, p / 0.7)) ** 1.5


def cheer_layer(seconds: float) -> np.ndarray:
    """A short studio cheer: yeahs, a few woos, claps and room roar."""
    yeah = crowd(seconds, 28, cheer_contour, (550, 1850, 2600), (760, 1300, 2500), spread=0.1)
    woo = crowd(seconds * 0.9, 7, woo_contour, (330, 800, 2300), (360, 850, 2350), spread=0.3, pitch_range=(380, 620))
    roar = bandpass(noise(seconds), 250, 1800) * np.sin(math.pi * np.minimum(1.0, t(seconds) / seconds)) ** 0.8 * 0.25
    total = mix(normalize(yeah, 1.0), normalize(woo, 0.55), roar)
    return mix(total, normalize(claps(seconds, 520), 0.8))


def stab(total: np.ndarray, notes: Sequence[float], at: float, seconds: float, gain: float, inst=None) -> np.ndarray:
    """Places a chord (frequencies) with one instrument (brass by default)."""
    inst = inst or brass
    for f in notes:
        total = place(total, inst(f, seconds), at, gain)
    return total


# --------------------------------------------------------------------------- Family Feud cues

def cue_ff_reveal():
    """Board flip: a quick air whoosh into a bright metallic clang and a panel click."""
    total = place(silence(1.4), whoosh(0.2, 700, 7000, 1.1), 0.0, 0.5)
    at = 0.16
    total = place(total, bandpass(noise(0.012), 1500, 6000) * np.exp(-t(0.012) * 500), at, 0.7)
    total = place(total, clang(hz("A5"), 1.1), at, 1.0)
    total = place(total, bell(hz("E6"), 0.9), at + 0.004, 0.45)
    return reverb(total, 0.22)


def cue_ff_round_sting():
    """Round sting (about 3.5 s): snare pickup into a syncopated brass figure and a held tutti chord.
    Plays after 'give me A, give me B' and when a round is decided."""
    bpm = 138
    beat = 60 / bpm
    chords: list[Event] = [
        (1.0, ["Bb3", "D4", "F4"], 0.5), (1.75, ["C4", "Eb4", "G4"], 0.25), (2.0, ["D4", "F4", "Bb4"], 0.75),
        (3.0, ["Eb4", "G4", "C5"], 0.5), (3.5, ["D4", "F4", "Bb4"], 0.25), (3.75, ["F4", "A4", "C5"], 0.75),
        (5.0, ["Bb3", "D4", "F4", "Bb4"], 2.5),
    ]
    lead: list[Event] = [(1.0, "F5", 0.5), (1.75, "G5", 0.25), (2.0, "Bb5", 0.75), (3.0, "C6", 0.5), (3.5, "Bb5", 0.25), (3.75, "C6", 0.75), (5.0, "D6", 2.5)]
    low: list[Event] = [(1.0, "Bb1", 1), (2.0, "D2", 1), (3.0, "Eb2", 0.75), (3.75, "F2", 1.25), (5.0, "Bb1", 2.5)]
    total = mix(seq(bpm, chords, brass, 0.4), seq(bpm, lead, brass, 0.3, 0.9), seq(bpm, low, bass, 0.6, 0.9))
    total = place(total, seq(bpm, [(5.0, ["Bb2", "F3", "Bb3", "D4", "F4"], 2.5)], organ, 0.3), 0.0)
    total = place(total, seq(bpm, [(5.0, ["D5", "F5", "Bb5"], 2.5)], strings, 0.25), 0.0)
    for i in range(4):
        total = place(total, snare(0.15), i * beat / 4, 0.3 + 0.15 * i)
    for b in (1.0, 2.0, 3.0, 3.75, 5.0):
        total = place(total, kick(), b * beat, 0.9)
    for b in (2.0, 3.5):
        total = place(total, snare(), b * beat, 0.55)
    for b in (1.0, 5.0):
        total = place(total, crash(1.8), b * beat, 0.35)
    total = place(total, tambourine(), 5.0 * beat, 0.7)
    total = place(total, timpani(hz("Bb1"), 1.4), 5.0 * beat, 0.8)
    return reverb(total, 0.25)


def cue_ff_bank_award():
    """Bank to the family (about 1.5 s): a counter rolling up in pitch, landing on a bell and a brass button."""
    total = silence(1.6)
    at = 0.0
    while at < 1.0:
        p = at / 1.0
        total = place(total, beep(700 * 2 ** (p * 1.3), 0.024, "square", 5000) * np.exp(-t(0.024) * 60), at, 0.3)
        at += 0.045 - 0.02 * p
    total = place(total, bell(hz("C7"), 0.6), 1.02, 0.8)
    total = place(total, bell(hz("G6"), 0.6), 1.02, 0.5)
    total = stab(total, [hz("C4"), hz("E4"), hz("G4"), hz("C5")], 1.02, 0.22, 0.3)
    total = place(total, kick(), 1.02, 0.6)
    return reverb(total, 0.15)


def cue_ff_crowd_aww():
    """Studio audience groan: a crowd of voices sliding down on an 'aww'."""
    aww = crowd(1.8, 36, aww_contour, (780, 1200, 2550), (560, 880, 2450))
    murmur = bandpass(noise(1.8), 300, 1400) * env(int(SR * 1.8), 0.1, 0.2, 0.6, 0.8) * 0.02
    return reverb(mix(aww, murmur), 0.35, 0.5, 0.8)


def cue_ff_crowd_cheer():
    """Short studio cheer (about 2 s): yeahs, woos and applause."""
    return reverb(cheer_layer(2.0), 0.35, 0.5, 0.8)


def cue_ff_sudden_death():
    """Sudden Death sting (about 5 s): low minor hit, tremolo strings, heartbeat kicks, roll, final tutti."""
    total = silence(5.6)
    total = place(total, timpani(hz("D2"), 1.4), 0.0, 1.0)
    total = stab(total, [hz("D3"), hz("F3"), hz("A3")], 0.0, 0.55, 0.3)
    total = place(total, kick(), 0.0, 0.9)
    for f in ("D4", "F4", "Ab4", "B4"):
        pad = tremolo(strings(hz(f), 3.3), 11.0, 0.8)
        total = place(total, pad * np.linspace(0.3, 1.0, len(pad)), 0.3, 0.14)
    for at, f in ((0.9, "D2"), (1.6, "Eb2"), (2.2, "E2"), (2.7, "F2")):
        total = place(total, brass(hz(f), 0.35, 1200), at, 0.35)
    for at in (0.9, 1.6, 2.2, 2.7, 3.1):
        total = place(total, kick(), at, 0.7)
        total = place(total, kick(), at + 0.16, 0.45)
    total = place(total, drum_roll(1.3, 0.06, 0.025), 2.3, 0.5)
    ring = np.linspace(1.0, 0.0, int(SR * 1.6)) ** 1.6  # the final chord dies away instead of stopping
    for f in ("D2", "D3", "A3", "D4", "F4", "E5"):
        total = place(total, brass(hz(f), 1.6) * ring, 3.6, 0.26)
    for f in ("D2", "A2", "D3", "F3"):
        total = place(total, organ(hz(f), 1.6) * ring, 3.6, 0.3)
    total = place(total, timpani(hz("D2"), 1.4), 3.6, 1.0)
    total = place(total, crash(1.8), 3.6, 0.35)
    total = place(total, kick(), 3.6, 1.0)
    return reverb(total, 0.25)


def music_fm_clock(seconds: float) -> np.ndarray:
    """Fast Money clock bed: 144 bpm, a 3-beat pickup, full bars climbing a semitone every four bars, and a final
    downbeat button that rings out exactly at `seconds` (20 s = 11 bars, 25 s = 14 bars)."""
    bpm, pickup = 144.0, 3
    beat = 60 / bpm
    total_beats = int(round(seconds / beat))
    bars = (total_beats - pickup - 1) // 4
    if pickup + bars * 4 + 1 != total_beats:
        raise ValueError(f"{seconds}s does not fit a pickup + whole bars + button at {bpm} bpm")
    total = silence(seconds + 2.0)
    for i in range(pickup * 4):
        total = place(total, snare(0.12), i * beat / 4, 0.2 + 0.45 * i / (pickup * 4))
    for i, s in enumerate(range(-5, 1)):  # chromatic climb A3 -> D4 into bar 1
        total = place(total, brass(semi(hz("D4"), s), beat * 0.45), i * beat / 2, 0.3)
    bass_line = (0, 0, 12, 0, 10, 0, 7, 8)
    root = hz("D2")
    for bar in range(bars):
        seg = bar // 4
        root = semi(hz("D2"), seg)
        t0 = (pickup + bar * 4) * beat
        lift = 0.8 + 0.1 * seg
        for i, s in enumerate(bass_line):
            total = place(total, bass(semi(root, s), beat * 0.45), t0 + i * beat / 2, 0.55)
        for b in range(4):
            total = place(total, kick(), t0 + b * beat, 0.8)
            total = place(total, hat(0.04), t0 + b * beat, 0.35)
        for b in (1, 3):
            total = place(total, snare(), t0 + b * beat, 0.4 * lift)
        for k in range(16):
            total = place(total, shaker(), t0 + k * beat / 4, (0.1 if k % 2 else 0.18) * lift)
        minor = [semi(root * 4, s) for s in (0, 3, 7)]
        for b in (1.5, 3.5):
            total = stab(total, minor, t0 + b * beat, beat * 0.3, 0.14 * lift)
        for s in (0, 3, 8):
            total = place(total, strings(semi(root * 4, s), beat * 4), t0, 0.08 * lift)
        for k, s in enumerate((12, 15, 19, 15, 12, 15, 20, 15)):
            total = place(total, marimba(semi(root * 4, s), beat * 0.45), t0 + k * beat / 2, 0.12 * lift)
    end = (total_beats - 1) * beat
    total = stab(total, [root * 2, root * 4, semi(root * 4, 3), semi(root * 4, 7), root * 8], end, beat * 0.8, 0.28)
    total = place(total, timpani(root * 2, 0.6), end, 0.9)
    total = place(total, kick(), end, 1.0)
    total = place(total, crash(0.6), end, 0.35)
    return exact_length(reverb(total, 0.15), seconds)


def music_ff_fm_clock_20():
    return music_fm_clock(20.0)


def music_ff_fm_clock_25():
    return music_fm_clock(25.0)


def cue_ff_fm_done():
    """Fast Money clock stops (player done or time out): a rapid run of four bell dings."""
    total = silence(1.2)
    for i in range(4):
        total = place(total, bell(hz("E6"), 0.6), i * 0.1, 0.8)
    return reverb(total, 0.2)


def cue_ff_fm_timeup():
    """Fast Money time's up: a bright two-tone horn buzzer, higher and brassier than the strike."""
    sig = mix(osc(233.1, 1.25, "square"), osc(246.9, 1.25, "square") * 0.8, osc(466.2, 1.25, "saw") * 0.3)
    sig = soft_clip(bandpass(sig, 250, 4200) * 0.8, 2.0)
    return sig * env(len(sig), 0.004, 0.03, 1.0, 0.12)


def cue_ff_fm_duplicate():
    """Duplicate answer: a quick buzz-buzz."""
    b = soft_clip(buzzer(138.6, 0.15) * 1.2, 2.5)
    return place(place(silence(0.45), b, 0.0), b, 0.21)


def cue_ff_fm_blip():
    """Fast Money answer text appears: a short upward electronic blip."""
    x = t(0.07)
    sig = lowpass(osc(1500 + 700 * np.minimum(1.0, x / 0.02), 0.07, "square"), 5000)
    return sig * env(len(x), 0.002, 0.03, 0.5, 0.02)


def cue_ff_fm_points():
    """Fast Money points appear: one bright bell."""
    return reverb(mix(bell(hz("A6"), 0.9), bell(hz("E7"), 0.7) * 0.3), 0.2)


def cue_ff_fm_zero():
    """Fast Money zero: a low, short buzzer."""
    return buzzer(65.4, 0.38, harsh=False)


def cue_ff_fm_win():
    """Fast Money reaches 200 (about 6 s): a win bell, drum fill, brass fanfare and a cheering audience."""
    total = silence(6.2)
    total = place(total, bell(hz("C7"), 1.0), 0.0, 0.9)
    total = place(total, bell(hz("G6"), 1.0), 0.0, 0.6)
    bpm, start = 144, 0.9
    beat = 60 / bpm
    for i in range(4):
        total = place(total, snare(0.15), start - beat + i * beat / 4, 0.3 + 0.12 * i)
    lead: list[Event] = [
        (0, "G5", 0.25), (0.25, "G5", 0.25), (0.5, "A5", 0.5), (1, "C6", 0.75), (1.75, "A5", 0.25),
        (2, "D6", 1), (3, "C6", 0.5), (3.5, "D6", 0.5), (4, "E6", 4),
    ]
    chords: list[Event] = [(0, ["C4", "E4", "G4"], 1), (1, ["F4", "A4", "C5"], 1), (2, ["G4", "B4", "D5"], 1), (3, ["F4", "A4", "C5"], 1), (4, ["C4", "E4", "G4", "C5"], 4)]
    low: list[Event] = [(0, "C2", 1), (1, "F2", 1), (2, "G2", 1), (3, "F2", 1), (4, "C2", 4)]
    music = mix(seq(bpm, lead, brass, 0.3, 0.9), seq(bpm, chords, brass, 0.35), seq(bpm, low, bass, 0.55, 0.9))
    music = place(music, seq(bpm, [(4, ["C3", "G3", "C4", "E4", "G4"], 4)], organ, 0.3), 0.0)
    music = place(music, seq(bpm, [(4, ["E5", "G5", "C6"], 4)], strings, 0.22), 0.0)
    for i, n in enumerate(["C6", "E6", "G6", "C7", "E7"]):
        music = place(music, glock(hz(n), 1.2), 4 * beat + i * 0.05, 0.25)
    for b in range(5):
        music = place(music, kick(), b * beat, 0.9)
    for b in (1, 3):
        music = place(music, snare(), b * beat, 0.5)
    for b in (0, 4):
        music = place(music, crash(1.8), b * beat, 0.35)
    music = place(music, timpani(hz("C2"), 1.4), 4 * beat, 0.8)
    total = place(total, music, start, 1.0)
    total = place(total, cheer_layer(4.8), 1.0, 0.35)
    return reverb(total, 0.25)


def cue_ff_game_win():
    """Game won (about 5 s): a bouncing brass fanfare over drums and organ with the audience cheering."""
    bpm = 132
    beat = 60 / bpm
    lead: list[Event] = [
        (0, "C5", 0.5), (0.5, "F5", 0.5), (1, "A5", 0.5), (1.5, "G5", 0.25), (1.75, "A5", 0.25), (2, "C6", 1.0),
        (3, "A5", 0.5), (3.5, "Bb5", 0.5), (4, "C6", 0.5), (4.5, "D6", 0.5), (5, "F6", 3.0),
    ]
    chords: list[Event] = [
        (0, ["F3", "A3", "C4"], 1), (1, ["F3", "A3", "C4"], 1), (2, ["A3", "C4", "F4"], 1),
        (3, ["Bb3", "D4", "F4"], 1), (4, ["C4", "E4", "G4"], 1), (5, ["F3", "A3", "C4", "F4"], 3),
    ]
    low: list[Event] = [(0, "F2", 0.5), (1, "A2", 0.5), (2, "F2", 0.5), (3, "Bb1", 0.5), (4, "C2", 0.5), (4.5, "E2", 0.5), (5, "F1", 3)]
    total = mix(seq(bpm, lead, brass, 0.3, 0.9), seq(bpm, chords, brass, 0.35), seq(bpm, low, bass, 0.6, 0.9))
    total = place(total, seq(bpm, [(5, ["F2", "C3", "F3", "A3", "C4"], 3)], organ, 0.3), 0.0)
    total = place(total, seq(bpm, [(5, ["A5", "C6", "F6"], 3)], strings, 0.2), 0.0)
    for b in range(6):
        total = place(total, kick(), b * beat, 0.9)
        total = place(total, hat(open_=True), b * beat + beat / 2, 0.25)
    for b in (1, 3):
        total = place(total, snare(), b * beat, 0.5)
    for b in (0, 5):
        total = place(total, crash(1.8), b * beat, 0.35)
    total = place(total, tambourine(), 5 * beat, 0.7)
    total = place(total, timpani(hz("F1") * 2, 1.4), 5 * beat, 0.8)
    total = place(total, cheer_layer(4.6), 0.25, 0.35)
    return reverb(total, 0.25)


def cue_ff_time_warn():
    """Answer-timer warning: a dry, hollow woodblock 'tok'."""
    x = t(0.16)
    body = np.sin(2 * math.pi * 880 * x) * np.exp(-x * 45) + 0.5 * np.sin(2 * math.pi * 2310 * x) * np.exp(-x * 70)
    click = bandpass(noise(0.01), 1500, 5000) * np.exp(-t(0.01) * 600)
    return place(body, click, 0.0, 0.5)


# --------------------------------------------------------------------------- Wheel of Fortune cues

CATEGORY_CHIME = ["C6", "E6", "G6", "D7"]


def chime_run(notes: Sequence[str], gap=0.11, ring=1.5, up=0.0) -> np.ndarray:
    """Ascending chime figure: glockenspiel doubled an octave down by tubular chimes."""
    total = silence(gap * len(notes) + ring)
    for i, n in enumerate(notes):
        f = semi(hz(n), up)
        total = place(total, glock(f, ring), i * gap, 0.6)
        total = place(total, chime(f / 2, ring), i * gap, 0.35)
    return total


def cue_wof_category_chime():
    """New puzzle on the board: a bright four-note ascending chime."""
    return reverb(chime_run(CATEGORY_CHIME), 0.3)


def cue_wof_prize_chime():
    """Prize Puzzle: the category chime, then the same figure a fourth higher."""
    total = place(chime_run(CATEGORY_CHIME), chime_run(CATEGORY_CHIME, up=5), 0.62, 0.9)
    return reverb(total, 0.3)


def music_wof_tossup_bed():
    """Toss-up bed: a light 120 bpm, 8-bar loop (16.0 s) of marimba, tine piano, plucked bass, shaker and vibes."""
    bpm, bars = 120, 8
    beat = 60 / bpm
    prog = [  # bass root, chord tones for the keys
        ("C2", ["E4", "G4", "B4", "D5"]), ("A1", ["E4", "G4", "C5"]), ("D2", ["F4", "A4", "C5", "E5"]), ("G1", ["F4", "A4", "B4", "D5"]),
        ("E2", ["D4", "G4", "B4"]), ("A1", ["C#4", "G4", "B4"]), ("D2", ["C4", "F4", "A4"]), ("G1", ["B3", "F4", "A4"]),
    ]
    tune: list[Event] = [
        (0, "G5", 1), (1, "E5", 0.5), (1.5, "G5", 0.5), (2, "A5", 1), (3, "G5", 1),
        (4, "E5", 1.5), (5.5, "C5", 0.5), (6, "E5", 2),
        (8, "F5", 1), (9, "A5", 0.5), (9.5, "C6", 0.5), (10, "B5", 1), (11, "A5", 1),
        (12, "G5", 3),
        (16, "B5", 1), (17, "A5", 0.5), (17.5, "G5", 0.5), (18, "D5", 2),
        (20, "C#5", 1), (21, "E5", 1), (22, "G5", 1), (23, "B5", 1),
        (24, "A5", 1.5), (25.5, "F5", 0.5), (26, "D5", 1), (27, "C5", 1),
        (28, "B4", 1), (29, "D5", 1), (30, "F5", 1), (31, "G5", 1),
    ]
    total = silence(bars * 4 * beat + 2.0)
    for bar, (root, keys) in enumerate(prog):
        t0 = bar * 4 * beat
        r = hz(root)
        for b, s in ((0, 0), (1.5, 7), (2, 12), (3.5, 10 if bar % 4 == 3 else 7)):
            total = place(total, pluck(semi(r, s), beat * 1.2), t0 + b * beat, 0.5)
        for b in (0.5, 2.5):
            total = stab(total, [hz(n) for n in keys], t0 + b * beat, beat * 0.6, 0.16, epiano)
        tones = [hz(n) * 2 for n in keys]
        for k in range(8):
            total = place(total, marimba(tones[k % len(tones)], beat * 0.4), t0 + k * beat / 2, 0.14)
    drums = pattern(bpm, bars, {"kick": [0, 2], "snare": [1, 3], "shaker": [x / 2 for x in range(8)], "hat": [0.5, 1.5, 2.5, 3.5]},
                    {"kick": 0.5, "snare": 0.18, "shaker": 0.2, "hat": 0.18})
    total = mix(total, drums, seq(bpm, tune, vibes, 0.4))
    return fold_loop(reverb(total, 0.18), bars * 4 * beat)


def music_wof_frenzy_bed():
    """Fortune Frenzy bed, exactly 30.0 s: 160 bpm, a 3-beat pickup, 19 bars lifting a whole tone at bars 9 and 15,
    and a final downbeat button that rings out at 30.0 s."""
    seconds, bpm, pickup, bars = 30.0, 160.0, 3, 19
    beat = 60 / bpm
    total = silence(seconds + 2.0)
    for i in range(pickup * 4):
        total = place(total, snare(0.12), i * beat / 4, 0.2 + 0.5 * i / (pickup * 4))
    total = place(total, whoosh(pickup * beat, 300, 5000, 1.5), 0.0, 0.35)
    prog = (0, 5, 0, 7)  # I IV I V
    key = 0
    for bar in range(bars):
        key = 0 if bar < 8 else (2 if bar < 14 else 4)
        root = semi(hz("C2"), key + prog[bar % 4])
        t0 = (pickup + bar * 4) * beat
        for i in range(8):
            total = place(total, bass(root * (2 if i % 2 else 1), beat * 0.45), t0 + i * beat / 2, 0.5)
        for b in range(4):
            total = place(total, kick(), t0 + b * beat, 0.85)
            total = place(total, hat(open_=True), t0 + b * beat + beat / 2, 0.22)
        for b in (1, 3):
            total = place(total, snare(), t0 + b * beat, 0.45)
            total = place(total, tambourine(), t0 + b * beat, 0.3)
        for k in range(16):
            total = place(total, shaker(), t0 + k * beat / 4, 0.14 if k % 2 else 0.2)
        arp = (0, 4, 7, 12, 16, 12, 7, 4)
        for k in range(16):
            total = place(total, marimba(semi(root * 4, arp[k % 8]), beat * 0.3), t0 + k * beat / 4, 0.1)
        major = [semi(root * 4, s) for s in (0, 4, 7)]
        hits = (0, 0.75, 1.5) if bar % 2 == 0 else (2.5, 3.0)
        for b in hits:
            total = stab(total, major, t0 + b * beat, beat * 0.35, 0.14)
    end = (pickup + bars * 4) * beat
    root = semi(hz("C2"), key)
    total = stab(total, [root * 2, root * 4, semi(root * 4, 4), semi(root * 4, 7), root * 8], end, beat * 0.8, 0.28)
    total = place(total, kick(), end, 1.0)
    total = place(total, crash(0.6), end, 0.35)
    total = place(total, timpani(root * 2, 0.6), end, 0.8)
    return exact_length(reverb(total, 0.15), seconds)


def cue_wof_ring_in():
    """Toss-up ring-in: a crisp high bell."""
    return reverb(mix(bell(hz("A6"), 0.8), glock(hz("A6"), 0.8) * 0.5), 0.18)


def cue_wof_triple_ding():
    """Triple Toss-Up puzzle solved: a quick series of high dings."""
    total = silence(1.2)
    for i, n in enumerate(["E7", "C7", "E7", "C7", "E7"]):
        total = place(total, bell(hz(n), 0.6), i * 0.075, 0.6)
    return reverb(total, 0.2)


def cue_wof_solve():
    """Main-game solve: a one-bar brass phrase landing on a bright held chord."""
    bpm = 132
    beat = 60 / bpm
    chords: list[Event] = [(0, ["D4", "F#4", "A4"], 0.5), (0.75, ["G4", "B4", "D5"], 0.75), (1.5, ["A4", "C#5", "E5"], 0.5), (2, ["D4", "F#4", "A4", "D5"], 2)]
    lead: list[Event] = [(0, "A5", 0.5), (0.5, "B5", 0.25), (0.75, "D6", 0.75), (1.5, "E6", 0.5), (2, "F#6", 2)]
    total = mix(seq(bpm, chords, brass, 0.4), seq(bpm, lead, brass, 0.3, 0.9), seq(bpm, [(0, "D2", 0.75), (0.75, "G2", 0.75), (1.5, "A2", 0.5), (2, "D2", 2)], bass, 0.6))
    total = place(total, seq(bpm, [(2, ["D3", "A3", "D4", "F#4"], 2)], organ, 0.25), 0.0)
    for b in (0, 0.75, 2):
        total = place(total, kick(), b * beat, 0.9)
    total = place(total, snare(), 1.5 * beat, 0.5)
    total = place(total, crash(1.8), 2 * beat, 0.35)
    total = place(total, timpani(hz("D2"), 1.4), 2 * beat, 0.7)
    return reverb(total, 0.25)


def cue_wof_tossup_solve():
    """Toss-up solved: two quick brass stabs into a bright chord."""
    bpm = 150
    beat = 60 / bpm
    chords: list[Event] = [(0, ["G4", "B4", "D5"], 0.3), (0.5, ["A4", "C5", "E5"], 0.3), (1.0, ["C5", "E5", "G5", "C6"], 1.5)]
    total = mix(seq(bpm, chords, brass, 0.45), seq(bpm, [(0, "G2", 0.3), (0.5, "A2", 0.3), (1.0, "C2", 1.5)], bass, 0.6))
    for b in (0, 0.5, 1.0):
        total = place(total, kick(), b * beat, 0.9)
    total = place(total, crash(1.6), beat, 0.3)
    total = place(total, tambourine(), beat, 0.6)
    return reverb(total, 0.22)


def cue_wof_bankrupt():
    """BANKRUPT: a slide whistle deflating all the way down, then the last of the air."""
    x = t(1.3)
    p = x / 1.3
    f = 1500 * 0.17 ** (p**1.3) * (1 + 0.015 * np.sin(2 * math.pi * 7 * x) * p)
    ph = 2 * math.pi * np.cumsum(f) / SR
    sig = (np.sin(ph) + 0.12 * np.sin(2 * ph) + bandpass(noise(1.3), 1500, 6000) * 0.08) * env(len(x), 0.02, 0.05, 0.9, 0.25)
    total = place(sig, bandpass(noise(0.35), 400, 2500) * np.exp(-t(0.35) * 8), 1.15, 0.3)
    return reverb(total, 0.2)


def wah_note(f0: float, f1: float, seconds: float) -> np.ndarray:
    """Plunger-muted trumpet note bending f0 -> f1 with a wah that opens and closes."""
    x = t(seconds)
    f = f0 + (f1 - f0) * np.clip((x - seconds * 0.35) / (seconds * 0.65), 0, 1)
    sig = osc(f, seconds, "saw", vib_rate=5.5, vib_depth=0.01) + osc(f * 1.003, seconds, "saw") * 0.7
    wah = 500 + 1400 * np.sin(math.pi * np.minimum(1.0, x / (seconds * 0.9))) ** 0.7
    sig = tv_bandpass(sig, wah, 2.0) + lowpass(sig, 600) * 0.3
    return soft_clip(sig * 0.8, 1.6) * env(len(x), 0.03, 0.05, 0.9, min(0.12, seconds / 3))


def cue_wof_lose_turn():
    """LOSE A TURN: a short descending muted 'wah-wahh'."""
    total = place(silence(1.0), wah_note(hz("G4"), hz("G4"), 0.28), 0.0, 0.9)
    total = place(total, wah_note(hz("D4"), hz("C#4"), 0.6), 0.32, 1.0)
    return reverb(total, 0.2)


def cue_wof_time_up():
    """Time's up (Bonus Round clock, unsolved toss-up): a double buzz."""
    b = buzzer(123.5, 0.4)
    return place(place(silence(1.0), b, 0.0), b, 0.52)


def cue_wof_time_bell():
    """'We're running out of time': three quick ascending bell runs."""
    total = silence(2.0)
    run = ["C6", "D6", "E6", "G6", "A6", "C7"]
    for r in range(3):
        for i, n in enumerate(run):
            total = place(total, bell(hz(n), 0.5), r * 0.36 + i * 0.045, 0.5)
    return reverb(total, 0.25)


def cue_wof_mystery():
    """Mystery wedge: a whole-tone glockenspiel tinkle over a swelling augmented chord."""
    total = silence(3.0)
    scale = ["C6", "D6", "E6", "F#6", "G#6", "A#6", "C7"]
    for i in range(16):
        total = place(total, glock(hz(scale[int(RNG.integers(len(scale)))]), 0.8), i * 0.055 + RNG.uniform(0, 0.02), 0.45 * (1 - i / 20))
    for n in ("C4", "E4", "G#4", "B4"):
        total = place(total, strings(hz(n), 2.3), 0.2, 0.2)
        total = place(total, epiano(hz(n), 2.0), 0.25, 0.12)
    return reverb(total, 0.35)


def cue_wof_mystery_flip():
    """Mystery wedge flipped: a snare and timpani roll into an unresolved reveal hit."""
    total = silence(2.4)
    total = place(total, drum_roll(0.9, 0.06, 0.025), 0.0, 0.6)
    total = place(total, timpani_roll(0.9, hz("D2"), 0.15, 0.6), 0.0, 0.6)
    at = 0.95
    total = stab(total, [hz("D4"), hz("G4"), hz("A4"), hz("D5")], at, 0.8, 0.35)
    total = place(total, timpani(hz("D2"), 1.4), at, 0.9)
    total = place(total, crash(1.6), at, 0.35)
    total = place(total, kick(), at, 0.9)
    for i, n in enumerate(["D6", "G6", "A6", "D7"]):
        total = place(total, glock(hz(n), 1.0), at + i * 0.04, 0.2)
    return reverb(total, 0.25)


def cue_wof_express():
    """EXPRESS: a synthesized chime steam whistle, short then long."""
    pipes = [hz("E5"), hz("G5"), hz("C#6")]
    total = place(silence(1.8), steam_whistle(pipes, 0.42), 0.0, 1.0)
    total = place(total, steam_whistle(pipes, 1.05), 0.55, 1.0)
    echo = np.zeros(int(0.23 * SR))
    return mix(total, np.concatenate([echo, lowpass(total, 2500)]) * 0.25)


def music_wof_express_bed():
    """Express run bed: a driving 160 bpm, 8-bar loop (12.0 s) with a chugging snare, boogie bass, organ and brass."""
    bpm, bars = 160, 8
    beat = 60 / bpm
    roots = ["G1", "G1", "C2", "G1", "D2", "C2", "G1", "D2"]
    boogie = (0, 4, 7, 9, 10, 9, 7, 4)
    total = silence(bars * 4 * beat + 2.0)
    for bar, name in enumerate(roots):
        t0 = bar * 4 * beat
        r = hz(name)
        for i, s in enumerate(boogie):
            total = place(total, bass(semi(r, s), beat * 0.45), t0 + i * beat / 2, 0.55)
        for k in range(16):
            total = place(total, snare(0.08), t0 + k * beat / 4, 0.28 if k % 2 else 0.1)
        for b in (0, 2):
            total = place(total, kick(), t0 + b * beat, 0.85)
        dom = [semi(r * 4, s) for s in (0, 4, 7, 10)]
        for b in (0.5, 1.5, 2.5, 3.5):
            total = stab(total, dom, t0 + b * beat, beat * 0.3, 0.07, organ)
        if bar % 2 == 1:
            total = stab(total, [semi(r * 4, s) for s in (4, 7, 12)], t0 + 3.0 * beat, beat * 0.3, 0.16)
            total = stab(total, [semi(r * 4, s) for s in (7, 10, 16)], t0 + 3.5 * beat, beat * 0.4, 0.16)
    return fold_loop(reverb(total, 0.15), bars * 4 * beat)


def cue_wof_no_more_vowels():
    """No more vowels: three short beeps."""
    total = silence(0.5)
    for i in range(3):
        total = place(total, beep(hz("B5"), 0.09, "square", 3500), i * 0.16, 0.8)
    return total


def cue_wof_only_vowels():
    """Only vowels remain: two-tone beeps, high-low, high-low."""
    total = silence(0.65)
    for i, n in enumerate(["E6", "B5", "E6", "B5"]):
        total = place(total, beep(hz(n), 0.11, "square", 3500), i * 0.15, 0.8)
    return total


def cue_wof_bonus_spin():
    """Bonus wheel spin (about 5 s): light clicks slowing to a stop under a shimmering pad and glockenspiel twinkles."""
    seconds = 4.8
    total = silence(seconds + 0.6)
    click = bandpass(noise(0.01), 2500, 7000) * np.exp(-t(0.01) * 500)
    at = 0.0
    while at < seconds:
        total = place(total, click, at, 0.5)
        at += 0.035 + 0.33 * (at / seconds) ** 2.4
    for n in ("A4", "C#5", "E5", "B5"):
        pad = strings(hz(n), seconds)
        total = place(total, pad * np.sin(math.pi * np.linspace(0, 1, len(pad))) ** 0.5, 0.0, 0.1)
    for i, n in enumerate(["A3", "C#4", "E4", "A4", "C#5", "E5", "A5"]):
        total = place(total, harp(hz(n), 0.9), i * 0.05, 0.3)
    penta = ["A5", "B5", "C#6", "E6", "F#6", "A6"]
    for i in range(14):
        total = place(total, glock(hz(penta[int(RNG.integers(len(penta)))]), 0.7), 0.4 + i * 0.3, 0.18 * (1 - i / 18))
    return reverb(total, 0.3)


def cue_wof_bonus_chime():
    """Bonus envelope chosen: a single tubular chime with a glockenspiel sparkle."""
    return reverb(mix(chime(hz("E5"), 2.0), glock(hz("E6"), 1.2) * 0.4), 0.3)


def music_wof_bonus_clock_10():
    """Bonus Round clock bed, exactly 10.0 s: 144 bpm, a 3-beat harp pickup, five bars of pulsing tension climbing a
    semitone at a time, and a final downbeat button that rings out at 10.0 s."""
    seconds, bpm, pickup, bars = 10.0, 144.0, 3, 5
    beat = 60 / bpm
    total = silence(seconds + 2.0)
    for i, n in enumerate(["A3", "C4", "E4", "A4", "C5", "E5", "A5", "C6", "E6"]):
        total = place(total, harp(hz(n), 0.9), i * pickup * beat / 9, 0.3)
    swell = highpass(noise(pickup * beat), 3000) * np.linspace(0, 1, int(SR * pickup * beat)) ** 2
    total = place(total, swell, 0.0, 0.15)
    climb = (0, 0, 1, 2, 3)
    root = hz("A1")
    for bar in range(bars):
        root = semi(hz("A1"), climb[bar])
        t0 = (pickup + bar * 4) * beat
        lift = 0.8 + 0.08 * bar
        for i in range(8):
            total = place(total, bass(root * 2, beat * 0.4), t0 + i * beat / 2, 0.45 * lift)
            total = place(total, hat(0.04), t0 + i * beat / 2, 0.3 if i % 2 == 0 else 0.15)
        for b in (0, 2):
            total = place(total, kick(), t0 + b * beat, 0.7)
            total = place(total, kick(), t0 + b * beat + 0.15, 0.4)
        for s in (0, 3, 7):
            total = place(total, tremolo(strings(semi(root * 8, s), beat * 4), 10.0, 0.6), t0, 0.1 * lift)
        for i in range(4):
            total = place(total, glock(root * 16, 0.3), t0 + i * beat + beat / 2, 0.08 * lift)
    end = (pickup + bars * 4) * beat
    total = stab(total, [root * 2, root * 4, semi(root * 4, 3), semi(root * 4, 7)], end, beat * 0.8, 0.3)
    total = place(total, timpani(root * 2, 0.6), end, 1.0)
    total = place(total, crash(0.6), end, 0.3)
    return exact_length(reverb(total, 0.15), seconds)


def cue_wof_bonus_win():
    """Bonus Round won (about 5 s): triplet brass pickup, a big held chord, glockenspiel run, cymbals and applause."""
    bpm = 140
    beat = 60 / bpm
    third = 1 / 3
    chords: list[Event] = [
        (0, ["G3", "C4", "E4"], third), (third, ["G3", "C4", "E4"], third), (2 * third, ["G3", "C4", "E4"], third),
        (1, ["A3", "D4", "F4"], 0.5), (1.5, ["B3", "D4", "G4"], 0.5), (2, ["C4", "E4", "G4", "C5"], 5),
    ]
    lead: list[Event] = [(0, "G5", third), (third, "G5", third), (2 * third, "G5", third), (1, "A5", 0.5), (1.5, "B5", 0.5), (2, "C6", 5)]
    total = mix(seq(bpm, chords, brass, 0.4), seq(bpm, lead, brass, 0.3, 0.9), seq(bpm, [(1, "F2", 0.5), (1.5, "G2", 0.5), (2, "C2", 5)], bass, 0.6))
    total = place(total, seq(bpm, [(2, ["C3", "G3", "C4", "E4", "G4"], 5)], organ, 0.3), 0.0)
    total = place(total, seq(bpm, [(2, ["E5", "G5", "C6"], 5)], strings, 0.22), 0.0)
    for i, n in enumerate(["C6", "D6", "E6", "G6", "A6", "C7", "E7"]):
        total = place(total, glock(hz(n), 1.4), 2 * beat + i * 0.045, 0.25)
    for b in (0, 1, 1.5, 2):
        total = place(total, kick(), b * beat, 0.9)
    total = place(total, crash(2.0), 2 * beat, 0.4)
    total = place(total, timpani(hz("C2"), 1.4), 2 * beat, 0.9)
    total = place(total, tambourine(), 2 * beat, 0.7)
    total = place(total, cheer_layer(3.8), 2 * beat, 0.35)
    return reverb(total, 0.25)


def cue_wof_bonus_lose():
    """Bonus Round missed: a soft, sympathetic descending vibraphone phrase over a warm pad."""
    bpm = 92
    tune: list[Event] = [(0, "A5", 1), (1, "F5", 1), (2, "E5", 1), (3, "C5", 2.5)]
    pad: list[Event] = [(0, ["F4", "A4", "C5", "E5"], 3), (3, ["A3", "C4", "E4"], 2.5)]
    low: list[Event] = [(0, "F2", 3), (3, "A2", 2.5)]
    total = mix(seq(bpm, tune, vibes, 0.5), seq(bpm, pad, strings, 0.14), seq(bpm, pad, epiano, 0.1), seq(bpm, low, bass, 0.3))
    return reverb(total, 0.3)


def cue_wof_envelope():
    """Bonus envelope opening, exactly 3.0 s of suspense: timpani roll, climbing tremolo strings, quickening ticks."""
    seconds = 3.0
    total = silence(seconds + 1.0)
    total = place(total, timpani_roll(2.8, hz("A1"), 0.15, 0.9), 0.0, 0.8)
    for lo, hi in (("A3", "Bb3"), ("C4", "Db4"), ("Eb4", "E4")):
        x = t(2.9)
        f = hz(lo) * (hz(hi) / hz(lo)) ** np.clip((x - 1.2) / 1.2, 0, 1)
        voice = tremolo(lowpass(osc(f, 2.9, "saw") + osc(f * 1.005, 2.9, "saw"), 1900), 11.0, 0.8)
        total = place(total, voice * env(len(x), 0.3, 0.1, 1.0, 0.05) * np.linspace(0.3, 1.0, len(x)), 0.0, 0.05)
    at = 0.0
    while at < 2.8:
        total = place(total, hat(0.04), at, 0.25 + 0.3 * at / 2.8)
        at += 0.3 - 0.18 * at / 2.8
    return exact_length(reverb(total, 0.2), seconds)


def cue_wof_wild_card():
    """Wild Card claimed: a sparkling glockenspiel run into a bright brass stab."""
    total = silence(1.8)
    for i, n in enumerate(["C6", "E6", "G6", "A6", "C7", "E7"]):
        total = place(total, glock(hz(n), 1.0), i * 0.05, 0.35)
    at = 0.3
    total = stab(total, [hz("C4"), hz("E4"), hz("A4"), hz("D5")], at, 0.35, 0.35)
    total = place(total, bass(hz("C2"), 0.35), at, 0.6)
    total = place(total, tambourine(), at, 0.7)
    total = place(total, kick(), at, 0.9)
    return reverb(total, 0.25)


def cue_wof_million():
    """Million-Dollar Wedge claimed: a roll into three rising brass hits, the last one big and held, with sparkle."""
    bpm = 132
    beat = 60 / bpm
    total = silence(4.0)
    total = place(total, timpani_roll(2 * beat, hz("D2"), 0.2, 0.8), 0.0, 0.6)
    total = place(total, drum_roll(2 * beat), 0.0, 0.5)
    chords: list[Event] = [(2, ["Bb3", "D4", "F4", "Bb4"], 0.5), (2.5, ["C4", "E4", "G4", "C5"], 0.5), (3, ["D4", "F#4", "A4", "D5", "F#5"], 3)]
    total = place(total, seq(bpm, chords, brass, 0.4), 0.0)
    total = place(total, seq(bpm, [(2, "Bb1", 0.5), (2.5, "C2", 0.5), (3, "D2", 3)], bass, 0.6), 0.0)
    total = place(total, seq(bpm, [(3, ["D3", "A3", "D4", "F#4"], 3)], organ, 0.3), 0.0)
    total = place(total, seq(bpm, [(3, ["F#5", "A5", "D6"], 3)], strings, 0.22), 0.0)
    for b in (2, 2.5, 3):
        total = place(total, kick(), b * beat, 0.9)
    total = place(total, crash(2.0), 3 * beat, 0.4)
    total = place(total, timpani(hz("D2"), 1.4), 3 * beat, 1.0)
    total = place(total, tambourine(), 3 * beat, 0.7)
    for i, n in enumerate(["D6", "E6", "F#6", "A6", "B6", "D7", "F#7"]):
        total = place(total, glock(hz(n), 1.4), 3 * beat + i * 0.045, 0.25)
    return reverb(total, 0.25)


def cue_wof_final_spin():
    """Final Spin: timpani and low brass climbing beat by beat, a snare roll, then a held major chord."""
    bpm = 120
    beat = 60 / bpm
    total = silence(4.0)
    for b, (low, chord) in enumerate((("A1", ["A2", "E3", "A3"]), ("C2", ["C3", "G3", "C4"]), ("D2", ["D3", "A3", "D4"]))):
        total = place(total, timpani(hz(low) * 2, 1.0), b * beat, 0.9)
        total = stab(total, [hz(n) for n in chord], b * beat, beat * 0.5, 0.3)
        total = place(total, kick(), b * beat, 0.8)
    total = place(total, drum_roll(beat, 0.05, 0.025), 3 * beat, 0.6)
    at = 4 * beat
    total = stab(total, [hz(n) for n in ("E3", "B3", "E4", "G#4", "B4")], at, beat * 2, 0.3)
    total = place(total, seq(60, [(0, ["E2", "B2", "E3", "G#3"], 1.2)], organ, 0.3), at)
    total = place(total, timpani(hz("E2"), 1.4), at, 1.0)
    total = place(total, crash(1.8), at, 0.35)
    total = place(total, kick(), at, 1.0)
    return reverb(total, 0.25)


def cue_wof_letter_light():
    """One puzzle tile lights up: a short, soft sine ding (quieter and shorter than wheel_letter_ding)."""
    x = t(0.45)
    f = hz("B5")
    sig = (np.sin(2 * math.pi * f * x) * np.exp(-x * 7) + 0.25 * np.sin(2 * math.pi * 2 * f * x) * np.exp(-x * 12)) * env(len(x), 0.004, 0.0, 1.0, 0.05)
    return reverb(sig, 0.15, 0.3, 0.3)


CUES = {
    "wheel_letter_ding.mp3": cue_wheel_letter_ding,
    "ff_ding.mp3": cue_ff_ding,
    "wheel_buzzer.mp3": cue_wheel_buzzer,
    "ff_strike.mp3": cue_ff_strike,
    "ff_buzzer.mp3": cue_ff_buzzer,
    "ff_you_said.mp3": cue_ff_you_said,
    "puzzle_reveal.mp3": cue_puzzle_reveal,
    "bankrupt_lose_turn.mp3": cue_bankrupt_lose_turn,
    "wheel_spin.mp3": cue_wheel_spin,
    "spin_tick.mp3": cue_spin_tick,
    "vowel.mp3": cue_vowel,
    "alarm.mp3": cue_alarm,
    "steal_success.mp3": cue_steal_success,
    "steal_fail.mp3": cue_steal_fail,
    "applause.mp3": cue_applause,
    "winner_fanfare.mp3": cue_winner_fanfare,
    "hub_theme.mp3": music_hub_theme,
    "countdown_theme.mp3": music_countdown,
    "family_feud_intro.mp3": music_feud_intro,
    # Family Feud
    "ff_reveal.mp3": cue_ff_reveal,
    "ff_round_sting.mp3": cue_ff_round_sting,
    "ff_bank_award.mp3": cue_ff_bank_award,
    "ff_crowd_aww.mp3": cue_ff_crowd_aww,
    "ff_crowd_cheer.mp3": cue_ff_crowd_cheer,
    "ff_sudden_death.mp3": cue_ff_sudden_death,
    "ff_fm_clock_20.mp3": music_ff_fm_clock_20,
    "ff_fm_clock_25.mp3": music_ff_fm_clock_25,
    "ff_fm_done.mp3": cue_ff_fm_done,
    "ff_fm_timeup.mp3": cue_ff_fm_timeup,
    "ff_fm_duplicate.mp3": cue_ff_fm_duplicate,
    "ff_fm_blip.mp3": cue_ff_fm_blip,
    "ff_fm_points.mp3": cue_ff_fm_points,
    "ff_fm_zero.mp3": cue_ff_fm_zero,
    "ff_fm_win.mp3": cue_ff_fm_win,
    "ff_game_win.mp3": cue_ff_game_win,
    "ff_time_warn.mp3": cue_ff_time_warn,
    # Wheel of Fortune
    "wof_category_chime.mp3": cue_wof_category_chime,
    "wof_prize_chime.mp3": cue_wof_prize_chime,
    "wof_tossup_bed.mp3": music_wof_tossup_bed,
    "wof_frenzy_bed.mp3": music_wof_frenzy_bed,
    "wof_ring_in.mp3": cue_wof_ring_in,
    "wof_triple_ding.mp3": cue_wof_triple_ding,
    "wof_solve.mp3": cue_wof_solve,
    "wof_tossup_solve.mp3": cue_wof_tossup_solve,
    "wof_bankrupt.mp3": cue_wof_bankrupt,
    "wof_lose_turn.mp3": cue_wof_lose_turn,
    "wof_time_up.mp3": cue_wof_time_up,
    "wof_time_bell.mp3": cue_wof_time_bell,
    "wof_mystery.mp3": cue_wof_mystery,
    "wof_mystery_flip.mp3": cue_wof_mystery_flip,
    "wof_express.mp3": cue_wof_express,
    "wof_express_bed.mp3": music_wof_express_bed,
    "wof_no_more_vowels.mp3": cue_wof_no_more_vowels,
    "wof_only_vowels.mp3": cue_wof_only_vowels,
    "wof_bonus_spin.mp3": cue_wof_bonus_spin,
    "wof_bonus_chime.mp3": cue_wof_bonus_chime,
    "wof_bonus_clock_10.mp3": music_wof_bonus_clock_10,
    "wof_bonus_win.mp3": cue_wof_bonus_win,
    "wof_bonus_lose.mp3": cue_wof_bonus_lose,
    "wof_envelope.mp3": cue_wof_envelope,
    "wof_wild_card.mp3": cue_wof_wild_card,
    "wof_million.mp3": cue_wof_million,
    "wof_final_spin.mp3": cue_wof_final_spin,
    "wof_letter_light.mp3": cue_wof_letter_light,
}

# Cues that must be an exact length: timed beds start with a game clock and end with it; loops wrap at a bar line.
EXACT_SECONDS = {
    "ff_fm_clock_20.mp3": 20.0,
    "ff_fm_clock_25.mp3": 25.0,
    "wof_frenzy_bed.mp3": 30.0,
    "wof_bonus_clock_10.mp3": 10.0,
    "wof_envelope.mp3": 3.0,
    "wof_tossup_bed.mp3": 16.0,
    "wof_express_bed.mp3": 12.0,
}

# Seamless loops: no edge fades (the ringing tail is already folded onto the start).
LOOPS = {"wof_tossup_bed.mp3", "wof_express_bed.mp3"}


def reseed(name: str) -> None:
    """Gives every cue its own fixed noise seed so one cue renders the same alone or in a full run."""
    global RNG
    RNG = np.random.default_rng(zlib.crc32(name.encode()))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    unknown = only - set(CUES)
    if unknown:
        sys.exit(f"unknown cue(s): {', '.join(sorted(unknown))}")
    for name, fn in CUES.items():
        if only and name not in only:
            continue
        reseed(name)
        write_mp3(name, fn(), seconds=EXACT_SECONDS.get(name), loop=name in LOOPS)
