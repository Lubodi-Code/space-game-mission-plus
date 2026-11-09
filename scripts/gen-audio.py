#!/usr/bin/env python3
"""Generador offline de audio sintetizado (sin samples ajenos).

Uso (desde la raíz del repo):  python scripts/gen-audio.py
Salida: game/sounds/gen/<banco>/NN.ogg (SFX mono 44.1k) y game/sounds/gen/music/<nombre>.ogg (estéreo).
Semilla fija: la salida es reproducible. Requiere numpy, scipy e imageio_ffmpeg (ffmpeg con libvorbis).
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy import signal

import imageio_ffmpeg

SR = 44100
FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game', 'sounds', 'gen')
ROOT = os.path.normpath(ROOT)


def pick_codec():
    """libvorbis si existe; si no, libopus dentro de .ogg."""
    out = subprocess.run([FF, '-hide_banner', '-encoders'], capture_output=True, text=True).stdout
    return 'libvorbis' if 'libvorbis' in out else 'libopus'


CODEC = pick_codec()
REPORT = []


# ------------------------------------------------------------------ utilidades DSP
def rngf(seed):
    return np.random.default_rng(seed)


def tt(n):
    return np.arange(n) / SR


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, min(f, SR * 0.45), 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)


def chirp(f0, f1, n):
    """Fase de un barrido exponencial f0→f1 en n muestras."""
    f = f0 * (f1 / f0) ** (np.arange(n) / max(1, n - 1))
    return 2 * np.pi * np.cumsum(f) / SR


def saw_ph(ph):
    return 2 * ((ph / (2 * np.pi)) % 1.0) - 1


def decay(n, tau):
    return np.exp(-tt(n) / tau)


def adsr(n, a, rel, curve=1.0):
    e = np.ones(n)
    na = max(1, int(a * SR))
    nr = max(1, int(rel * SR))
    na = min(na, n)
    nr = min(nr, n)
    e[:na] *= np.linspace(0, 1, na) ** curve
    e[n - nr:] *= np.linspace(1, 0, nr) ** curve
    return e


def soft(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def ir(rng, dur, brightness=4000, stereo=False):
    n = int(dur * SR)
    shape = (n, 2) if stereo else (n,)
    x = rng.standard_normal(shape) * (np.exp(-6.9 * np.arange(n) / n)).reshape((-1,) + (1,) * (len(shape) - 1))
    return lp(x, brightness, 1) if not stereo else np.stack([lp(x[:, 0], brightness, 1), lp(x[:, 1], brightness, 1)], 1)


def reverb_mono(x, rng, dur=0.25, mix=0.25):
    wet = signal.fftconvolve(x, ir(rng, dur, 5000) * 0.05)[: len(x) + int(dur * SR)]
    out = np.zeros(len(wet))
    out[: len(x)] += x * (1 - mix * 0.5)
    out += wet * mix * 6
    return out


def finish(x, peak_db=-3.0, fi=0.003, fo=0.005):
    """Fundidos de entrada/salida (sin clics), recorte de silencio final y normalización a pico."""
    x = np.asarray(x, dtype=np.float64)
    x = x - np.mean(x[: int(0.01 * SR)]) * 0  # sin DC extra
    x = hp(x, 20, 1)
    m = np.max(np.abs(x))
    keep = np.where(np.abs(x) > m * 0.002)[0]
    if len(keep):
        x = x[: keep[-1] + 1 + int(0.01 * SR)]
    nfi, nfo = int(fi * SR), int(fo * SR)
    x[:nfi] *= np.linspace(0, 1, nfi)
    x[-nfo:] *= np.linspace(1, 0, nfo)
    x = x / (np.max(np.abs(x)) + 1e-12) * 10 ** (peak_db / 20)
    return x


# ------------------------------------------------------------------ salida
def write_ogg(x, path, q=3):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    x = np.asarray(x)
    ch = 1 if x.ndim == 1 else 2
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    fd, tmp = tempfile.mkstemp(suffix='.wav')
    os.close(fd)
    try:
        with wave.open(tmp, 'wb') as w:
            w.setnchannels(ch)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run([FF, '-y', '-loglevel', 'error', '-i', tmp, '-c:a', CODEC, '-q:a', str(q), path], check=True)
    finally:
        os.remove(tmp)
    REPORT.append((os.path.relpath(path, ROOT).replace('\\', '/'), os.path.getsize(path), len(x) / SR))


def bank(name, items):
    for i, x in enumerate(items, 1):
        write_ogg(x, os.path.join(ROOT, name, f'{i:02d}.ogg'))


# ------------------------------------------------------------------ bancos SFX
def laser_gen(i):
    r = rngf(100 + i)
    f0, f1 = [(2600, 520), (3200, 700), (2100, 380), (3800, 900), (2900, 450)][i]
    dur = [0.22, 0.17, 0.28, 0.15, 0.24][i]
    ratio = [2.0, 3.0, 1.5, 4.0, 2.5][i]
    idx = [2.5, 1.5, 3.5, 1.0, 2.0][i]
    n = int(dur * SR)
    ph = chirp(f0, f1, n)
    mod = np.sin(ph * ratio) * idx * decay(n, dur * 0.4)
    x = np.sin(ph + mod) + 0.35 * np.sin(2 * ph + mod * 0.5) + 0.15 * np.sin(3 * ph)
    x *= decay(n, dur * 0.35) * adsr(n, 0.002, 0.02)
    x += 0.04 * lp(r.standard_normal(n), 6000) * decay(n, 0.02)
    return finish(reverb_mono(x, r, 0.22, 0.3))


def laser_heavy(i):
    r = rngf(200 + i)
    dur = [0.55, 0.7, 0.45, 0.62][i]
    f0 = [4200, 3000, 5200, 3600][i]
    n = int(dur * SR)
    ph = chirp(f0, 90, n)
    x = saw_ph(ph) * 0.5 + np.sin(ph) * 0.6
    x = lp(x, 7000) * decay(n, dur * 0.3)
    nz = bp(r.standard_normal(n), 800, 6000) * decay(n, 0.12) * 0.7
    sub = np.sin(chirp(90, 38, n)) * decay(n, dur * 0.35) * 0.9
    out = (x + nz + sub) * adsr(n, 0.002, 0.04)
    return finish(reverb_mono(soft(out, 1.4), r, 0.3, 0.35))


def mortar_launch(i):
    r = rngf(300 + i)
    dur = [0.5, 0.42, 0.6, 0.48][i]
    n = int(dur * SR)
    f0 = [150, 180, 120, 160][i]
    memb = np.sin(chirp(f0, 42, n)) * decay(n, 0.13 + 0.03 * i)
    thump = lp(r.standard_normal(n), [900, 1300, 700, 1100][i]) * decay(n, 0.05) * 0.8
    click = hp(r.standard_normal(n), 2500) * decay(n, 0.004) * 0.3
    x = soft(memb * 1.2 + thump + click, 1.5) * adsr(n, 0.001, 0.03)
    return finish(reverb_mono(x, r, 0.3, 0.25))


def mortar_whistle(i):
    r = rngf(400 + i)
    dur = [0.5, 0.65, 0.4][i]
    n = int(dur * SR)
    f0, f1 = [(2400, 800), (2000, 600), (2800, 1000)][i]
    vib = 1 + 0.01 * np.sin(2 * np.pi * 9 * tt(n))
    ph = chirp(f0, f1, n) * vib
    env = np.sin(np.linspace(0, np.pi, n)) ** 0.7
    x = np.sin(ph) + 0.2 * np.sin(2 * ph)
    x = x * env * 0.8 + bp(r.standard_normal(n), f1, f0 * 1.2) * env * 0.25
    return finish(x, -9, 0.01, 0.02)


def mortar_impact(i):
    r = rngf(500 + i)
    dur = [1.3, 1.1, 1.6, 1.4][i]
    n = int(dur * SR)
    sub = np.sin(chirp([95, 80, 110, 70][i], 28, n)) * decay(n, 0.3 + 0.05 * i)
    body = lp(r.standard_normal(n), 1800) * decay(n, 0.22)
    # barrido del filtro hacia abajo (ruido que se apaga y oscurece)
    body2 = lp(r.standard_normal(n), 400) * decay(n, 0.55)
    crack = hp(r.standard_normal(n), 1500) * decay(n, 0.012) * 0.9
    x = soft(sub * 1.3 + body * 0.9 + body2 * 0.7 + crack, 1.6) * adsr(n, 0.001, 0.15, 2)
    wet = signal.fftconvolve(x, ir(r, 0.8, 1800) * 0.04)[:n]
    return finish(x + wet * 4)


def enemy_shot(i):
    r = rngf(600 + i)
    dur = [0.28, 0.22, 0.34, 0.25, 0.3][i]
    n = int(dur * SR)
    f0, f1 = [(900, 260), (1300, 400), (600, 180), (1700, 520), (1000, 140)][i]
    ph = chirp(f0, f1, n)
    carrier = lp(saw_ph(ph), [3000, 4500, 2200, 5000, 3500][i])
    ring = np.sin(2 * np.pi * [140, 233, 90, 310, 180][i] * tt(n) + 3 * np.sin(2 * np.pi * 14 * tt(n)))
    x = carrier * (0.45 + 0.55 * ring) + 0.2 * np.sin(ph)
    x *= decay(n, dur * 0.4) * adsr(n, 0.002, 0.03)
    x += hp(r.standard_normal(n), 3000) * decay(n, 0.01) * 0.15
    return finish(reverb_mono(x, r, 0.2, 0.2))


def enemy_heavy(i):
    r = rngf(700 + i)
    dur = [0.65, 0.55, 0.75, 0.6][i]
    n = int(dur * SR)
    ph = chirp([150, 190, 120, 170][i], 38, n)
    x = saw_ph(ph) * 0.7 + np.sin(ph) * 0.8 + np.sin(chirp(300, 60, n)) * 0.3 * decay(n, 0.1)
    x = lp(soft(x * decay(n, dur * 0.35), 3.0), 2500)
    x += lp(r.standard_normal(n), 1200) * decay(n, 0.08) * 0.6
    x *= adsr(n, 0.002, 0.05)
    return finish(reverb_mono(x, r, 0.35, 0.3))


def chord_voice(freqs, n, glide, cutoff0, cutoff1, r):
    """Acorde de sierras que cae de tono (glide = razón final/inicial) con filtro que se cierra."""
    x = np.zeros(n)
    for k, f in enumerate(freqs):
        for det in (-0.006, 0.0, 0.006):
            ph = chirp(f * (1 + det), f * (1 + det) * glide, n)
            x += saw_ph(ph + r.uniform(0, 6.28)) / (len(freqs) * 3)
    # filtro que se cierra: mezcla progresiva entre versión brillante y oscura
    bright, dark = lp(x, cutoff0), lp(x, cutoff1)
    w = np.linspace(0, 1, n) ** 0.6
    return bright * (1 - w) + dark * w


def defeat(i):
    r = rngf(800 + i)
    dur = [3.2, 4.0][i]
    n = int(dur * SR)
    # explosión del núcleo
    boom = np.sin(chirp(90, 24, n)) * decay(n, 0.55)
    noi = lp(r.standard_normal(n), 2500) * decay(n, 0.35) + lp(r.standard_normal(n), 500) * decay(n, 0.9) * 0.8
    crack = hp(r.standard_normal(n), 1200) * decay(n, 0.02)
    expl = soft(boom * 1.2 + noi * 0.8 + crack * 0.6, 1.5)
    # acorde menor descendente (power down), entra tras la explosión
    t0 = int(0.25 * SR)
    m = n - t0
    base = [196.0, 174.6][i]  # G3 / F3 → menor: 1, b3, 5, octava
    freqs = [base, base * 2 ** (3 / 12), base * 2 ** (7 / 12), base * 2]
    ch = chord_voice(freqs, m, [0.5, 0.42][i], 2400, 140, r)
    ch *= np.minimum(1, tt(m) / 0.15) * np.exp(-tt(m) / (dur * 0.45))
    x = expl.copy()
    x[t0:] += ch * 0.9
    x = x * adsr(n, 0.002, 0.4)
    wet = signal.fftconvolve(x, ir(r, 1.2, 2500) * 0.03)[:n]
    return finish(x + wet * 3, -3, 0.003, 0.05)


# ------------------------------------------------------------------ música: utilidades
def midi(n):
    return 440.0 * 2 ** ((np.asarray(n, dtype=float) - 69) / 12)


class Song:
    """Búfer estéreo circular: lo que se pasa del final se envuelve al principio (loop limpio)."""

    def __init__(self, bpm, bars, loop=True):
        self.bpm = bpm
        self.bar = int(round(4 * 60 / bpm * SR))
        self.beat = self.bar / 4
        self.step = self.bar / 16
        self.n = self.bar * bars
        self.loop = loop
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((self.n, 2))
        return self.buses[name]

    def add(self, name, start, sig, pan=0.0, gain=1.0):
        b = self.bus(name)
        start = int(round(start))
        ang = (pan + 1) * np.pi / 4
        l, rr = np.cos(ang) * gain, np.sin(ang) * gain
        pos = start % self.n if self.loop else start
        if not self.loop and pos >= self.n:
            return
        end = pos + len(sig)
        first = min(end, self.n) - pos
        b[pos:pos + first, 0] += sig[:first] * l
        b[pos:pos + first, 1] += sig[:first] * rr
        rest = len(sig) - first
        if rest > 0 and self.loop:
            while rest > 0:  # la cola puede dar más de una vuelta si es larguísima
                k = min(rest, self.n)
                b[:k, 0] += sig[len(sig) - rest:len(sig) - rest + k] * l
                b[:k, 1] += sig[len(sig) - rest:len(sig) - rest + k] * rr
                rest -= k


def circ_reverb(x, rng, dur=2.2, bright=3500):
    """Reverb estéreo circular: se convoluciona sobre 3 copias y se toma la del medio."""
    h = ir(rng, dur, bright, stereo=True) * 0.02
    n = len(x)
    tile = np.concatenate([x, x, x])
    out = np.zeros_like(x)
    for c in range(2):
        # canales cruzados para ancho estéreo
        w = signal.fftconvolve(tile[:, c], h[:, c])[: 3 * n]
        out[:, c] = w[n:2 * n]
    return out


def circ_delay(x, secs, fb=0.4, taps=5, cross=True):
    out = np.zeros_like(x)
    d = int(secs * SR)
    for k in range(1, taps + 1):
        s = np.roll(x, d * k, axis=0) * fb ** k
        out += s[:, ::-1] if (cross and k % 2) else s
    return out


def compress(x, thr=0.45, ratio=3.0, att=0.005, rel=0.12):
    """Compresor simple de pico con suavizado de envolvente."""
    lvl = np.max(np.abs(x), axis=1)
    a, r_ = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    env = np.zeros_like(lvl)
    # seguimiento por bloques de 64 muestras (suficiente y rápido)
    blk = 64
    pk = lvl[: len(lvl) // blk * blk].reshape(-1, blk).max(axis=1)
    e = 0.0
    eb = np.zeros_like(pk)
    for i, v in enumerate(pk):
        c = a ** blk if v < e else r_ ** blk
        # ataque rápido hacia arriba, release hacia abajo
        e = v + (e - v) * (np.exp(-blk / (att * SR)) if v > e else np.exp(-blk / (rel * SR)))
        eb[i] = e
    env[: len(eb) * blk] = np.repeat(eb, blk)
    env[len(eb) * blk:] = eb[-1]
    g = np.where(env > thr, (thr / np.maximum(env, 1e-9)) ** (1 - 1 / ratio), 1.0)
    return x * g[:, None]


def master(song, levels, rev=None, dly=None, peak_db=-2.5, drive=1.3, rng=None, rev_dur=2.2):
    """Mezcla de buses con reverb/delay opcional, saturación suave, compresión y normalización."""
    rng = rng or rngf(1)
    mix = np.zeros((song.n, 2))
    for name, g in levels.items():
        if name not in song.buses:
            continue
        b = song.buses[name] * g
        mix += b
        if rev and name in rev:
            mix += circ_reverb(b, rng, rev_dur) * rev[name]
        if dly and name in dly:
            secs, amt, fb = dly[name]
            mix += circ_delay(b, secs, fb) * amt
    mix[:, 0] = hp(mix[:, 0], 28, 1)
    mix[:, 1] = hp(mix[:, 1], 28, 1)
    mix = soft(mix, drive)
    mix = compress(mix)
    mix = mix / np.max(np.abs(mix)) * 10 ** (peak_db / 20)
    return mix


# ------------------------------------------------------------------ voces de música (épico / espacial)
def v_drone(f, dur, rng):
    """Dron sub-grave que evoluciona: sinusoides desafinadas + sierra oscura, con respiración lenta."""
    n = int(dur * SR)
    t = tt(n)
    x = np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 1.003 * t + 1.0)
    x += 0.35 * np.sin(2 * np.pi * f * 2 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t))
    x += 0.5 * lp(saw_ph(2 * np.pi * f * 1.002 * t), 180)
    x *= 0.75 + 0.25 * np.sin(2 * np.pi * rng.uniform(0.05, 0.09) * t + rng.uniform(0, 6))
    return x * adsr(n, dur * 0.35, dur * 0.4, 1.5)


FORMANTS = {'aah': [(800, 1.0), (1150, 0.5), (2900, 0.15)], 'ooh': [(325, 1.0), (700, 0.35), (2530, 0.1)]}


def v_choir(freqs, dur, vowel, rng, a=1.2, rel=1.6):
    """Coro sintético: sierras desafinadas con vibrato lento filtradas por formantes."""
    n = int(dur * SR)
    t = tt(n)
    src = np.zeros(n)
    for f in freqs:
        for det in (-0.006, 0.0, 0.006):
            vib = 1 + 0.004 * np.sin(2 * np.pi * rng.uniform(4.5, 5.8) * t + rng.uniform(0, 6))
            src += saw_ph(np.cumsum(2 * np.pi * f * (1 + det) * vib / SR))
    src += 0.04 * rng.standard_normal(n) * len(freqs)  # aire
    y = np.zeros(n)
    for fc, g in FORMANTS[vowel]:
        y += g * bp(src, fc * 0.88, fc * 1.12)
    return y / (len(freqs) * 2.5) * adsr(n, a, rel, 1.5)


def v_brass(freqs, dur, open_t, rng=None):
    """Metal sintético: pila de sierras desafinadas con filtro que se abre despacio, ataque suave."""
    n = int(dur * SR)
    t = tt(n)
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.009, -0.003, 0.003, 0.009):
            x += saw_ph(2 * np.pi * f * (1 + det) * t + (rng.uniform(0, 6.28) if rng is not None else 0))
    x /= len(freqs) * 3
    w = np.clip(t / open_t, 0, 1)
    y = lp(x, 350) * (1 - w) + lp(x, 1800) * w + lp(x, 4200) * w ** 3 * 0.25
    return y * adsr(n, min(0.35, dur * 0.3), min(0.7, dur * 0.4), 1.3)


def v_taiko(pitch=62, hard=1.0, seed=31):
    """Tambor grande: membrana grave con caída de tono + golpe de ruido filtrado."""
    n = int(1.4 * SR)
    r = rngf(seed)
    body = np.sin(chirp(pitch * 1.7, pitch, n)) * np.exp(-tt(n) / 0.22)
    body += 0.5 * np.sin(chirp(pitch * 2.6, pitch * 1.6, n)) * np.exp(-tt(n) / 0.12)
    hit = lp(r.standard_normal(n), 1400) * np.exp(-tt(n) / 0.025) * 0.9 * hard
    skin = bp(r.standard_normal(n), 200, 900) * np.exp(-tt(n) / 0.09) * 0.4
    return soft(body * 1.2 + hit + skin, 1.4) * adsr(n, 0.001, 0.1)


def v_boom(dur=2.8, f0=75, seed=41):
    """Golpe sub (boom) para los cambios de sección."""
    n = int(dur * SR)
    r = rngf(seed)
    x = np.sin(chirp(f0, 27, n)) * np.exp(-tt(n) / (dur * 0.3))
    x += lp(r.standard_normal(n), 260) * np.exp(-tt(n) / 0.35) * 0.7
    return soft(x * 1.3, 1.3) * adsr(n, 0.002, 0.3, 2)


def v_riser(dur, f0=250, f1=7000, seed=51):
    """Whoosh ascendente: ruido pasa-banda barrido (bandas cruzadas en el tiempo)."""
    n = int(dur * SR)
    r = rngf(seed)
    src = r.standard_normal(n)
    t = np.linspace(0, 1, n)
    y = np.zeros(n)
    K = 9
    for k in range(K):
        c = f0 * (f1 / f0) ** (k / (K - 1))
        wgt = np.exp(-((t - k / (K - 1)) ** 2) / (2 * 0.12 ** 2))
        y += bp(src, c * 0.75, c * 1.3) * wgt
    return y * t ** 2.2 * adsr(n, 0.05, 0.05)


def v_siren(dur, f_lo, f_hi, rate=0.22):
    """Sirena de alarma lenta y oscura (sierra filtrada con barrido senoidal)."""
    n = int(dur * SR)
    t = tt(n)
    f = f_lo + (f_hi - f_lo) * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t - np.pi / 2))
    x = lp(saw_ph(np.cumsum(2 * np.pi * f / SR)), 1400)
    return x * adsr(n, dur * 0.3, dur * 0.3, 1.3)


def v_str(f, dur, cut=1200):
    """Ostinato tipo cuerdas graves: dos sierras filtradas, ataque con mordida corta."""
    n = int(dur * SR)
    t = tt(n)
    x = saw_ph(2 * np.pi * f * t) + saw_ph(2 * np.pi * f * 1.004 * t + 0.7)
    e = np.exp(-t / 0.05)
    y = lp(x, 500) * (1 - e) + lp(x, cut * 2.2) * e
    return lp(y, cut) * adsr(n, 0.012, 0.05) * 0.5


def v_bell(f, dur, ratio=3.5, idx=2.0):
    """Campana FM (inarmónica con ratio no entero)."""
    n = int(dur * SR)
    t = tt(n)
    mod = np.sin(2 * np.pi * f * ratio * t) * idx * np.exp(-t / (dur * 0.25))
    x = np.sin(2 * np.pi * f * t + mod) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t)
    return x * np.exp(-t / (dur * 0.35)) * adsr(n, 0.003, 0.05)


def v_metal_echo(f, dur):
    """Eco metálico lejano: campana inarmónica."""
    return v_bell(f, dur, 2.76, 1.4)


def triad(minor=True):
    return [0, 3 if minor else 4, 7]


def combat_pulse():
    """Tensión de combate: ostinato grave en corcheas, taikos y metales que crecen (re eólico)."""
    S = Song(96, 24)
    r = rngf(1000)
    scale = [62, 64, 65, 67, 69, 70, 72, 74]  # re eólico
    for bar in range(24):
        ph, c = bar // 4, bar % 4
        root = [38, 34, 36, 38][c]
        if c == 3 and ph in (2, 4):
            root = 39  # i–bII: el Mi bemol raspa contra el re
        ivs = triad(root == 38)
        sec = 0 if bar < 4 else 1 if bar < 12 else 2 if bar < 20 else 3
        lvl = [0.45, 0.75, 1.0, 0.5][sec]
        t0 = bar * S.bar
        if bar % 2 == 0:
            S.add('drone', t0, v_drone(midi(root - 12), S.bar * 2.8 / SR, r), 0, 0.8)
        if bar >= 2:
            pat = [0, 0, 12, 0, 0, 7, 0, 12] if c != 3 else [0, 0, 12, 0, 1, 0, 7, 0]
            for s in range(8):
                acc = 1.0 if s % 4 == 0 else 0.7
                S.add('ost', t0 + s * S.beat / 2, v_str(midi(root + 12 + pat[s]), S.beat * 0.47 / SR), -0.15, lvl * acc)
        if bar >= 4:
            hits = [0, 2.5] if sec != 3 else [0]
            if c == 3 and sec in (1, 2):
                hits = [0, 2, 2.5, 3, 3.5]
            for h in hits:
                S.add('taiko', t0 + h * S.beat, v_taiko(60 if h % 2 == 0 else 72, 1.0, 31 + int(h * 2)), 0.1 if h > 1 else -0.1, lvl * (1.0 if h == 0 else 0.7))
        if bar % 8 == 4 or bar == 0:
            S.add('boom', t0, v_boom(), 0, 0.9)
        if bar >= 8 and sec != 3:
            fr = [midi(root + 12 + iv) for iv in ivs] + [midi(root + 24)]
            S.add('brass', t0, v_brass(fr, S.bar * 1.15 / SR, S.bar * 0.9 / SR, r), 0, [0, 0.45, 0.8][sec] * (0.6 + 0.4 * (c / 3)))
            if sec == 2 and c == 3:
                S.add('brass', t0, v_brass([midi(root + 12), midi(root + 13), midi(root + 18)], S.bar / SR, S.bar * 0.7 / SR, r), 0, 0.4)
            S.add('choir', t0, v_choir([midi(root + 24 + iv) for iv in ivs], S.bar * 1.4 / SR, 'aah' if sec == 2 else 'ooh', r), 0, 0.4 if sec == 2 else 0.25)
        if bar in (10, 18):
            S.add('riser', t0, v_riser(S.bar * 2 / SR, seed=51 + bar), 0, 0.7)
        if bar % 4 == 1:
            # Campana aguda ('shim') quitada a pedido de Luis (2026-11-09): sonaba como un «tiiing» cada rato.
            # Se siguen consumiendo los números al azar para que el resto de la pista no cambie.
            r.integers(3, 8); r.uniform(-0.7, 0.7)
    return master(S, {'drone': 0.9, 'ost': 0.8, 'taiko': 1.0, 'boom': 0.9, 'brass': 0.65, 'choir': 0.6, 'riser': 0.5, 'shim': 0.5},
                  rev={'taiko': 0.9, 'brass': 0.5, 'choir': 0.8, 'riser': 0.5, 'shim': 1.0, 'ost': 0.15},
                  dly={'shim': (S.beat * 1.5 / SR, 0.5, 0.5)}, peak_db=-3.0, drive=1.1, rng=r, rev_dur=3.2)


def orbit_drift():
    """Vacío e inmensidad: drones, coro lejano, notas sueltas con reverb enorme (mi frigio)."""
    S = Song(64, 16)
    r = rngf(2000)
    scale = [64, 65, 67, 69, 71, 72, 74]  # mi frigio
    prog = [(40, [0, 3, 7]), (41, [0, 4, 7]), (40, [0, 3, 7]), (36, [0, 4, 7])]  # i–bII–i–bVI
    for bar in range(16):
        root, ivs = prog[bar % 4]
        t0 = bar * S.bar
        if bar % 2 == 0:
            S.add('drone', t0, v_drone(midi(root - 12), S.bar * 2.9 / SR, r), 0, 0.9)
            S.add('drone', t0, v_drone(midi(root), S.bar * 2.9 / SR, r), 0.3, 0.35)
        S.add('choir', t0 + S.bar * 0.1, v_choir([midi(root + 24 + iv) for iv in ivs], S.bar * 1.5 / SR, 'ooh', r, a=1.8, rel=2.2), 0, 0.5)
        if bar % 4 == 2:  # segunda menor suspendida: tensión lejana
            S.add('choir', t0 + S.bar * 0.3, v_choir([midi(root + 24), midi(root + 25)], S.bar * 1.2 / SR, 'ooh', r, a=1.5, rel=2.0), 0.4, 0.3)
        for _ in range(int(r.integers(1, 3))):
            nn = scale[int(r.integers(0, len(scale)))] + 12 * int(r.integers(0, 2))
            S.add('note', t0 + r.uniform(0, S.bar * 0.7), v_bell(midi(nn), r.uniform(3.5, 5.0), 2.76, 1.2), r.uniform(-0.8, 0.8), 0.45)
        if bar % 4 == 0:
            r.uniform(-0.6, 0.6)  # campana aguda quitada (2026-11-09); se consume el azar igual
        if bar in (6, 14):
            S.add('riser', t0, v_riser(S.bar * 2 / SR, 200, 4500, seed=60 + bar), 0, 0.25)
        if bar % 8 == 0:
            S.add('boom', t0, v_boom(3.5, 55, 42), 0, 0.55)
            S.add('taiko', t0 + S.beat * 2, v_taiko(55, 0.5, 33), 0.2, 0.4)
    return master(S, {'drone': 0.9, 'choir': 0.7, 'note': 0.6, 'shim': 0.5, 'riser': 0.5, 'boom': 0.8, 'taiko': 0.6},
                  rev={'choir': 1.0, 'note': 1.4, 'shim': 1.2, 'taiko': 1.0, 'drone': 0.2},
                  dly={'note': (S.beat * 1.5 / SR, 0.6, 0.55), 'shim': (S.beat * 2 / SR, 0.5, 0.55)},
                  peak_db=-3.5, drive=1.0, rng=r, rev_dur=4.5)


def boss_siege():
    """Asedio: do frigio, ostinato grave con b2, golpes sub, cluster disonante y sirena."""
    S = Song(84, 20)
    r = rngf(3000)
    prog = [(36, [0, 3, 7]), (37, [0, 4, 7]), (36, [0, 3, 7]), (34, [0, 4, 7])]  # i–bII–i–bVII
    for bar in range(20):
        c = bar % 4
        root, ivs = prog[c]
        sec = 0 if bar < 4 else 1 if bar < 12 else 2 if bar < 18 else 3
        lvl = [0.7, 0.9, 1.0, 0.7][sec]
        t0 = bar * S.bar
        if bar % 2 == 0:
            S.add('drone', t0, v_drone(midi(root - 12), S.bar * 2.8 / SR, r), 0, 0.9)
        pat = [0, 0, 1, 0, 0, 12, 1, 0] if c % 2 == 0 else [0, 0, 0, 1, 0, 7, 6, 0]
        for s in range(8):
            S.add('ost', t0 + s * S.beat / 2, v_str(midi(root + 12 + pat[s]), S.beat * 0.46 / SR, 1000), 0, lvl * (1.0 if s % 2 == 0 else 0.65))
        if bar >= 2:
            hits = [0, 1.5, 2] if sec >= 1 else [0]
            if c == 3:
                hits = [0, 2, 2.5, 3, 3.25, 3.5, 3.75]
            for h in hits:
                S.add('taiko', t0 + h * S.beat, v_taiko(52 if h in (0, 2) else 66, 1.2, 60 + int(h * 4)), 0.1 if h else -0.1, lvl * (1.1 if h == 0 else 0.7))
        if bar % 4 == 0:
            S.add('boom', t0, v_boom(3.0, 70, 43 + bar), 0, 1.0)
        if sec >= 1 and sec != 3:
            fr = [midi(root + 12), midi(root + 12 + ivs[1]), midi(root + 19)]
            S.add('brass', t0, v_brass(fr, S.bar * 1.2 / SR, S.bar * 0.8 / SR, r), 0, 0.6)
        if sec == 2:  # cluster disonante: segunda menor + tritono en metales
            S.add('brass', t0, v_brass([midi(root + 24), midi(root + 25), midi(root + 30)], S.bar * 1.1 / SR, S.bar * 0.6 / SR, r), 0.1, 0.5)
            S.add('choir', t0, v_choir([midi(root + 12), midi(root + 15), midi(root + 19)], S.bar * 1.4 / SR, 'aah', r, a=0.5), 0, 0.4)
        if bar in (12, 16):
            S.add('siren', t0, v_siren(S.bar * 4 / SR, 330, 520), 0, 0.28)
        if bar in (8, 16):
            S.add('riser', t0, v_riser(S.bar * 2 / SR, 150, 6000, seed=70 + bar), 0, 0.7)
        if bar % 4 == 2:
            r.uniform(-0.6, 0.6)  # campana aguda quitada (2026-11-09); se consume el azar igual
    return master(S, {'drone': 0.9, 'ost': 0.85, 'taiko': 1.0, 'boom': 1.0, 'brass': 0.7, 'choir': 0.6, 'siren': 0.5, 'riser': 0.5, 'shim': 0.5},
                  rev={'taiko': 0.8, 'brass': 0.5, 'choir': 0.8, 'riser': 0.5, 'shim': 1.0, 'siren': 0.7},
                  dly={'shim': (S.beat * 1.5 / SR, 0.5, 0.5)}, peak_db=-3.0, drive=1.3, rng=r, rev_dur=3.2)


def victory_theme():
    """Victoria ganada con esfuerzo: arranca en re menor con un golpe y resuelve a RE MAYOR (tercera de picardía)."""
    S = Song(80, 4, loop=False)  # 3 compases + 1 de cola
    r = rngf(4000)
    b = S.bar
    S.add('boom', 0, v_boom(3.0, 70, 44), 0, 1.0)
    S.add('taiko', 0, v_taiko(58, 1.2, 35), 0, 1.0)
    for k in range(6):  # redoble que crece hacia el cambio
        S.add('taiko', b * 1.0 + k * S.beat * 0.5 * (1 - 0.04 * k), v_taiko(62 + k, 0.6, 36 + k), 0.15, 0.25 + 0.1 * k)
    S.add('taiko', 2 * b, v_taiko(55, 1.4, 37), 0, 1.0)
    S.add('boom', 2 * b, v_boom(3.5, 65, 45), 0, 0.9)
    # compás 1: re menor; 2: si bemol → do (tensión); 3: RE MAYOR
    S.add('drone', 0, v_drone(midi(26), b * 3.4 / SR, r), 0, 0.9)
    S.add('brass', 0, v_brass([midi(50), midi(57), midi(62), midi(65)], b * 1.1 / SR, b * 0.8 / SR, r), 0, 0.6)
    S.add('choir', 0, v_choir([midi(62), midi(65), midi(69)], b * 1.3 / SR, 'ooh', r, a=0.7), 0, 0.4)
    S.add('brass', b, v_brass([midi(46), midi(53), midi(58), midi(62)], b * 0.55 / SR, b * 0.4 / SR, r), 0, 0.65)
    S.add('brass', b * 1.5, v_brass([midi(48), midi(55), midi(60), midi(64)], b * 0.6 / SR, b * 0.4 / SR, r), 0, 0.75)
    S.add('choir', b, v_choir([midi(65), midi(70), midi(72)], b * 1.2 / SR, 'aah', r, a=0.5), 0, 0.45)
    S.add('brass', 2 * b, v_brass([midi(50), midi(57), midi(62), midi(66), midi(69), midi(74)], b * 1.9 / SR, b * 0.8 / SR, r), 0, 1.0)
    S.add('choir', 2 * b, v_choir([midi(62), midi(66), midi(69), midi(74)], b * 1.9 / SR, 'aah', r, a=0.5, rel=2.0), 0, 0.75)
    S.add('shim', 2 * b, v_metal_echo(midi(86), 4.0), 0.3, 0.3)
    S.add('shim', 2 * b + S.beat, v_metal_echo(midi(90), 4.0), -0.3, 0.25)
    out = master(S, {'drone': 0.9, 'boom': 0.9, 'taiko': 0.9, 'brass': 0.75, 'choir': 0.7, 'shim': 0.5},
                 rev={'taiko': 0.7, 'brass': 0.5, 'choir': 0.8, 'shim': 1.0}, peak_db=-3.0, drive=1.1, rng=r, rev_dur=2.8)
    out = out[: int(11.8 * SR)]
    fo = int(2.0 * SR)
    out[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    return out


def make_loop(x):
    """Comprueba el empalme final→inicio; aplica un fundido corto cruzado si hay salto."""
    jump = np.max(np.abs(x[0] - x[-1]))
    if jump > 0.05:
        k = 64
        w = np.linspace(0, 1, k)[:, None]
        x[:k] *= w
        x[-k:] *= (1 - w)
    return x


# ------------------------------------------------------------------ principal
def main():
    print(f'ffmpeg: {FF}\ncodec: {CODEC}\nsalida: {ROOT}')
    bank('laserGen', [laser_gen(i) for i in range(5)])
    bank('laserHeavy', [laser_heavy(i) for i in range(4)])
    bank('mortarLaunch', [mortar_launch(i) for i in range(4)])
    bank('mortarWhistle', [mortar_whistle(i) for i in range(3)])
    bank('mortarImpact', [mortar_impact(i) for i in range(4)])
    bank('enemyShot', [enemy_shot(i) for i in range(5)])
    bank('enemyHeavyShot', [enemy_heavy(i) for i in range(4)])
    bank('defeat', [defeat(i) for i in range(2)])
    for name, fn in (('combatPulse', combat_pulse), ('orbitDrift', orbit_drift), ('bossSiege', boss_siege)):
        print(f'música {name}…', flush=True)
        write_ogg(make_loop(fn()), os.path.join(ROOT, 'music', f'{name}.ogg'))
    write_ogg(victory_theme(), os.path.join(ROOT, 'music', 'victoryTheme.ogg'))

    total = 0
    print(f'\n{"archivo":34s} {"bytes":>9s} {"segundos":>9s}')
    for name, size, dur in REPORT:
        total += size
        print(f'{name:34s} {size:9d} {dur:9.2f}')
    print(f'\n{len(REPORT)} archivos, total {total / 1024 / 1024:.2f} MB')
    if total > 6 * 1024 * 1024:
        print('ERROR: supera 6 MB', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
