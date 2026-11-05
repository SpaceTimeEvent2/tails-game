#!/usr/bin/env python3
"""Импульс для реверберации голоса в ролике. Запуск: python3 tools/howto-ir.py ir.wav, затем tools/howto-voice.sh ir.wav store/video"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

sr = 44100
n = int(sr * 1.1)
rng = np.random.default_rng(7)
t = np.arange(n) / sr
out = []
for ch in range(2):
    x = rng.standard_normal(n) * np.exp(-t / 0.28)
    b, a = butter(2, [250 / (sr / 2), 4200 / (sr / 2)], 'band')
    x = lfilter(b, a, x)
    x[:int(.012 * sr)] = 0
    out.append(x)
ir = np.stack(out, 1)
ir /= np.sqrt((ir ** 2).sum(0)).max()
wavfile.write(sys.argv[1], sr, (ir * 0.9).astype(np.float32))
