#!/usr/bin/env python3
"""Замок для уровня «Замок» в «Хвостах»: 4 стадии роста по рисункам (одна башня → крепость со шпилем).

Только numpy, GLB пишется вручную. Геометрия — низкополигональные коробки/призмы с цветом вершин,
нормалей нет: GLTFLoader в three.js тогда сам включает flatShading — грани ровные, мультяшные,
а файл в разы легче. Узел «ballista» (колесо-прицел с крестом и стрелой) — отдельный: игра крутит
его на врага. Все стадии в одном масштабе (единица = единица игры, плита ≈ 6.4 в поперечнике),
пол на y=0, центр по x/z — в 0, фасад смотрит в +Z (к камере игры).

Запуск: python3 tools/castle_glb.py [папка]   (по умолчанию assets/castle рядом с игрой)
"""
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "assets" / "castle"

# ── палитра (sRGB) ──
STONE = [0x9b9ba1, 0x8f8f95, 0xa3a3a9, 0x97979d, 0xa8a8ae]
STONE_LIGHT = [0xb6b4ae, 0xbdbab2, 0xaeaca6, 0xc4c0b6]   # «кирпичи» поверх кладки (тёплые, как на рисунке)
STONE_DARK = 0x6e6e76
SEAM = 0x55555d
HOLE = 0x2a2830           # окна, бойницы, проёмы
WOOD = 0x8b5a2b
WOOD_DARK = 0x6b4220
WOOD_LIGHT = 0xa36d38
IRON = 0x3a3a40
RED = 0xd8473c
YELLOW = 0xf2c84b
ROSE = 0xe0705e
CREAM = 0xf1e2a4

rng = np.random.default_rng(7)


def lin(c):
    """sRGB 0xRRGGBB → линейные 0..255 (glTF хранит цвет вершин в линейном пространстве)."""
    out = []
    for s in ((c >> 16) & 255, (c >> 8) & 255, c & 255):
        v = s / 255
        v = v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        out.append(round(v * 255))
    return out + [255]


class Mesh:
    def __init__(self):
        self.pos, self.col, self.idx = [], [], []

    def _add(self, verts, faces, color):
        base = len(self.pos)
        c = lin(color)
        for v in verts:
            self.pos.append([float(x) for x in v])
            self.col.append(c)
        for f in faces:
            self.idx.append([base + i for i in f])

    def box(self, c, s, color, rot_y=0.0, rot=None):
        """Коробка: центр c, размеры s; rot — матрица 3×3 (поверх rot_y)."""
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        v = np.array([[x, y, z] for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)])
        m = np.eye(3)
        if rot_y:
            cy, sy = math.cos(rot_y), math.sin(rot_y)
            m = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        if rot is not None:
            m = m @ rot
        v = v @ m.T + np.asarray(c, float)
        # индексы: x-бит 4, y-бит 2, z-бит 1
        f = [(0, 1, 3), (0, 3, 2), (4, 6, 7), (4, 7, 5),      # -x, +x
             (0, 4, 5), (0, 5, 1), (2, 3, 7), (2, 7, 6),      # -y, +y
             (0, 2, 6), (0, 6, 4), (1, 5, 7), (1, 7, 3)]      # -z, +z
        self._add(v, f, color)

    def prism(self, c, r, h, n, color, r_top=None, phase=0.0):
        """n-угольная призма/усечённый конус: низ в c[1], высота h."""
        r_top = r if r_top is None else r_top
        x0, y0, z0 = c
        verts = []
        for i in range(n):
            a = phase + 2 * math.pi * i / n
            verts.append([x0 + r * math.cos(a), y0, z0 + r * math.sin(a)])
        for i in range(n):
            a = phase + 2 * math.pi * i / n
            verts.append([x0 + r_top * math.cos(a), y0 + h, z0 + r_top * math.sin(a)])
        faces = []
        for i in range(n):
            j = (i + 1) % n
            faces += [(i, n + j, j), (i, n + i, n + j)]
        if r_top > 1e-6:
            for i in range(1, n - 1):
                faces.append((n, n + i + 1, n + i))
        else:
            verts = verts[:n] + [[x0, y0 + h, z0]]
            faces = [(i, n, (i + 1) % n) for i in range(n)]
        for i in range(1, n - 1):
            faces.append((0, i, i + 1))
        self._add(verts, faces, color)

    def merge(self, other):
        base = len(self.pos)
        self.pos += other.pos
        self.col += other.col
        self.idx += [[a + base, b + base, c + base] for a, b, c in other.idx]


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def stone():
    return STONE[rng.integers(len(STONE))]


# ── детали ──

def bricks(m, x0, x1, y0, y1, face_z, count, side=False, x_face=0.0, z0=0.0, z1=0.0):
    """Светлые «кирпичи» на фасаде (+Z) или на правом боку (+X), как обводка кладки на рисунках."""
    for _ in range(count):
        w, h = rng.uniform(0.32, 0.55), rng.uniform(0.16, 0.22)
        y = rng.uniform(y0 + h, y1 - h)
        col = STONE_LIGHT[rng.integers(len(STONE_LIGHT))]
        if not side:
            x = rng.uniform(x0 + w / 2 + 0.05, x1 - w / 2 - 0.05)
            m.box((x, y, face_z + 0.02), (w, h, 0.06), col)
        else:
            z = rng.uniform(z0 + w / 2 + 0.05, z1 - w / 2 - 0.05)
            m.box((x_face + 0.02, y, z), (0.06, h, w), col)


def window(m, x, y, z, w=0.26, h=0.42, side=False):
    """Тёмное окно в каменной рамке; side — окно на боку +X."""
    if side:
        m.box((x + 0.03, y, z), (0.08, h + 0.14, w + 0.14), STONE_DARK)
        m.box((x + 0.06, y, z), (0.06, h, w), HOLE)
    else:
        m.box((x, y, z + 0.03), (w + 0.14, h + 0.14, 0.08), STONE_DARK)
        m.box((x, y, z + 0.06), (w, h, 0.06), HOLE)


def door(m, x, z, w=0.62, h=1.05):
    m.box((x, h / 2 + 0.06, z + 0.04), (w + 0.24, h + 0.2, 0.1), STONE_DARK)        # каменный проём
    m.box((x, h + 0.2, z + 0.08), (w + 0.36, 0.16, 0.12), STONE_LIGHT[1])            # перемычка
    m.box((x, h / 2, z + 0.1), (w, h, 0.06), WOOD)                                    # створка
    for k in (-1, 0, 1):                                                               # доски
        m.box((x + k * w / 3, h / 2, z + 0.135), (0.035, h - 0.04, 0.02), WOOD_DARK)
    for yy in (0.25, h - 0.25):                                                        # петли-полосы
        m.box((x, yy, z + 0.14), (w - 0.04, 0.06, 0.02), IRON)
    m.box((x + w * 0.3, h * 0.5, z + 0.15), (0.06, 0.06, 0.03), IRON)


def merlons(m, cx, cz, w, d, y, mh=0.42, mw=0.34, per_side=None):
    """Зубцы по краю площадки w×d (верх стены y)."""
    for (ax, along, fixed, sign) in (("x", w, d, 1), ("x", w, d, -1), ("z", d, w, 1), ("z", d, w, -1)):
        n = per_side or max(2, int(round(along / 0.7)))
        step = (along - mw) / (n - 1)
        for i in range(n):
            t = -along / 2 + mw / 2 + i * step
            if ax == "x":
                m.box((cx + t, y + mh / 2, cz + sign * (fixed / 2 - 0.12)), (mw, mh, 0.24), stone())
            else:
                if i in (0, n - 1):
                    continue          # углы уже стоят
                m.box((cx + sign * (fixed / 2 - 0.12), y + mh / 2, cz + t), (0.24, mh, mw), stone())


def tower(m, x, z, w, h, *, door_=False, windows=2, side_windows=1, crown=0.32, base=True):
    """Квадратная башня: цоколь, кладка, навесная корона с машикулями и зубцами. Возвращает верх площадки."""
    if base:
        m.box((x, 0.25, z), (w + 0.22, 0.5, w + 0.22), STONE_DARK)                       # цоколь
    m.box((x, h / 2, z), (w, h, w), stone())
    # корона шире ствола, под ней консоли
    cw = w + crown * 2
    for i in range(int(round(w / 0.42)) + 1):
        t = -w / 2 + i * (w / max(1, int(round(w / 0.42))))
        m.box((x + t, h - 0.12, z + w / 2 + 0.1), (0.18, 0.26, 0.24), STONE_DARK)
        m.box((x + w / 2 + 0.1, h - 0.12, z + t), (0.24, 0.26, 0.18), STONE_DARK)
    m.box((x, h + 0.2, z), (cw, 0.42, cw), stone())
    m.box((x, h + 0.42, z), (cw - 0.04, 0.04, cw - 0.04), SEAM)
    merlons(m, x, z, cw, cw, h + 0.41)
    # кладка
    bricks(m, x - w / 2, x + w / 2, 0.5, h - 0.3, z + w / 2, int(h * 2.4))
    bricks(m, 0, 0, 0.5, h - 0.3, 0, int(h * 1.6), side=True, x_face=x + w / 2, z0=z - w / 2, z1=z + w / 2)
    # окна: по вертикали в верхней части
    for i in range(windows):
        yy = h * (0.5 + 0.32 * i / max(1, windows - 1)) if windows > 1 else h * 0.66
        window(m, x + (0.28 if (i % 2 == 0 and door_) else 0), yy, z + w / 2)
    for i in range(side_windows):
        window(m, x + w / 2, h * (0.72 - 0.3 * i), z, side=True)
    if door_:
        door(m, x, z + w / 2)
    return h + 0.41


def wall(m, x0, x1, z, h, t=0.9, windows=2, slit=False):
    w = x1 - x0
    xc = (x0 + x1) / 2
    m.box((xc, h / 2, z), (w, h, t), stone())
    m.box((xc, 0.18, z + 0.05), (w, 0.36, t + 0.1), STONE_DARK)
    m.box((xc, h + 0.05, z), (w + 0.04, 0.12, t + 0.12), stone())
    n = max(2, int(round(w / 0.62)))
    step = w / n
    for i in range(n):
        m.box((x0 + step * (i + 0.5), h + 0.11 + 0.19, z + t / 2 - 0.12), (step * 0.55, 0.38, 0.24), stone())
        m.box((x0 + step * (i + 0.5), h + 0.11 + 0.19, z - t / 2 + 0.12), (step * 0.55, 0.38, 0.24), stone())
    bricks(m, x0, x1, 0.4, h - 0.2, z + t / 2, int(w * h * 1.1))
    for i in range(windows):
        xx = x0 + w * (i + 1) / (windows + 1)
        window(m, xx, h * 0.6, z + t / 2, w=0.18 if slit else 0.24, h=0.5 if slit else 0.42)


def scaffold(m, x, z, h, d=0.9, w=0.7):
    """Деревянные леса: стойки, ярусы, раскосы и настилы."""
    for dx in (-w / 2, w / 2):
        for dz in (-d / 2, d / 2):
            m.box((x + dx, h / 2, z + dz), (0.09, h, 0.09), WOOD)
    levels = [h * 0.33, h * 0.66, h * 0.97]
    for y in levels:
        m.box((x, y, z + d / 2), (w + 0.18, 0.08, 0.08), WOOD_DARK)
        m.box((x, y, z - d / 2), (w + 0.18, 0.08, 0.08), WOOD_DARK)
        m.box((x - w / 2, y, z), (0.08, 0.08, d + 0.18), WOOD_DARK)
        m.box((x + w / 2, y, z), (0.08, 0.08, d + 0.18), WOOD_DARK)
        m.box((x, y + 0.06, z), (w, 0.04, d), WOOD_LIGHT)                 # настил
    prev = 0.0
    for i, y in enumerate(levels):                                         # раскосы на фасаде
        ln = math.hypot(w, y - prev)
        a = math.atan2(y - prev, w) * (1 if i % 2 == 0 else -1)
        m.box((x, (y + prev) / 2, z + d / 2 + 0.06), (ln, 0.07, 0.06), WOOD, rot=rot_z(a))
        prev = y


def ladder(m, x0, y0, x1, y1, z, width=0.36, rungs=7):
    """Лестница вдоль фасада от (x0,y0) к (x1,y1)."""
    ln = math.hypot(x1 - x0, y1 - y0)
    a = math.atan2(y1 - y0, x1 - x0)
    r = rot_z(a)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for s in (-1, 1):
        off = np.array([0, 0, s * width / 2])
        m.box(np.array([cx, cy, z]) + off, (ln, 0.07, 0.07), WOOD, rot=r)
    for i in range(1, rungs + 1):
        t = i / (rungs + 1)
        m.box((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z), (0.05, 0.05, width), WOOD_DARK)


def flag(m, x, z, y, pole=1.1, color=RED, color2=None, length=0.62, side=1):
    """Флагшток и вымпел (две ступеньки — будто развевается)."""
    m.box((x, y + pole / 2, z), (0.06, pole, 0.06), WOOD_DARK)
    m.box((x, y + pole + 0.04, z), (0.1, 0.08, 0.1), YELLOW)
    fy = y + pole - 0.2
    seg = length / 3
    for i in range(3):
        hh = 0.34 * (1 - i * 0.22)
        dy = 0.04 * (i % 2)
        m.box((x + side * (0.03 + seg * (i + 0.5)), fy + dy, z), (seg + 0.01, hh, 0.04),
              color2 if (color2 and i == 1) else color)


def gallery(m, x0, x1, z, y_deck, h=1.1, d=1.0):
    """Крытая деревянная галерея на каменной арке."""
    w = x1 - x0
    xc = (x0 + x1) / 2
    # арка: опоры у башен + свод (проём сквозной)
    m.box((xc, y_deck - 0.25, z), (w, 0.5, d), stone())
    for k in range(5):                                                     # клинья свода
        t = (k + 0.5) / 5
        ang = math.pi * t
        yy = y_deck - 0.5 - math.sin(ang) * 0.0 - (1 - math.sin(ang)) * 0.9
        m.box((x0 + w * t, yy + 0.25, z), (w / 5 + 0.02, 0.5 + (1 - math.sin(ang)) * 1.8, d * 0.9), stone())
    # деревянный короб
    m.box((xc, y_deck + 0.05, z), (w + 0.1, 0.1, d + 0.1), WOOD_DARK)
    m.box((xc, y_deck + h / 2 + 0.1, z), (w, h, d - 0.08), WOOD)
    for i in range(int(w / 0.3)):                                           # доски на фасаде
        m.box((x0 + 0.15 + i * 0.3, y_deck + h / 2 + 0.1, z + d / 2 - 0.02), (0.03, h, 0.03), WOOD_DARK)
    for i in range(3):                                                      # арочные окна
        xx = x0 + w * (i + 1) / 4
        m.box((xx, y_deck + h * 0.55, z + d / 2), (0.24, 0.48, 0.06), HOLE)
        m.box((xx, y_deck + h * 0.55 + 0.28, z + d / 2), (0.3, 0.08, 0.07), WOOD_DARK)
    # двускатная крыша
    roof_w = d / 2 + 0.2
    for s in (-1, 1):
        a = math.radians(28) * s
        m.box((xc, y_deck + h + 0.3, z + s * roof_w / 2 * 0.88), (w + 0.25, 0.09, roof_w), WOOD_LIGHT, rot=rot_x(a))
        for i in range(int(w / 0.35)):
            m.box((x0 + 0.1 + i * 0.35, y_deck + h + 0.33, z + s * roof_w / 2 * 0.88), (0.04, 0.03, roof_w * 0.95),
                  WOOD_DARK, rot=rot_x(a))


def banner(m, x, z, y_top, h=1.5, w=0.42):
    """Красно-жёлтое знамя на стене (полосы наискосок — ступеньками)."""
    m.box((x, y_top + 0.04, z), (w + 0.2, 0.06, 0.06), WOOD_DARK)
    steps = 6
    for i in range(steps):
        y = y_top - (i + 0.5) * h / steps
        k = (i + 1) / steps
        m.box((x - w / 2 + w * k / 2, y, z), (w * k, h / steps + 0.005, 0.04), YELLOW)
        if k < 1:
            m.box((x + w * k / 2, y, z), (w * (1 - k), h / steps + 0.005, 0.04), RED)
    m.box((x - w / 4, y_top - h - 0.1, z), (w / 2, 0.2, 0.04), RED)                 # «ласточкин хвост»
    m.box((x + w / 4, y_top - h - 0.1, z), (w / 2, 0.2, 0.04), YELLOW)


def ballista():
    """Колесо-прицел: столб, обод, крест, стрела наискосок. Начало координат — у основания столба."""
    b = Mesh()
    b.box((0, 0.45, 0), (0.12, 0.9, 0.12), WOOD_DARK)
    b.box((0, 0.08, 0), (0.36, 0.16, 0.36), WOOD)
    cy, r, n = 1.35, 0.58, 14
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        seg = 2 * r * math.sin(math.pi / n) + 0.02
        b.box((r * math.cos(a), cy + r * math.sin(a), 0), (seg, 0.11, 0.11), WOOD, rot=rot_z(a + math.pi / 2))
    for a in (math.radians(65), math.radians(155)):                                    # крест (наклонный)
        b.box((0, cy, 0), (2 * r, 0.08, 0.08), WOOD, rot=rot_z(a))
    b.box((0, cy, 0), (0.18, 0.18, 0.18), WOOD_DARK)                                   # ступица
    a = math.radians(42)                                                                # стрела насквозь
    ln = 2.1
    b.box((0, cy, 0.09), (ln, 0.05, 0.05), WOOD_DARK, rot=rot_z(a))
    tip = np.array([math.cos(a), math.sin(a), 0]) * (ln / 2)
    b.box((tip[0], cy + tip[1], 0.09), (0.2, 0.12, 0.04), IRON, rot=rot_z(a))
    tail = -tip
    for s in (-1, 1):
        b.box((tail[0] + 0.05, cy + tail[1] + 0.05, 0.09 + s * 0.05), (0.24, 0.1, 0.02), CREAM, rot=rot_z(a))
    return b


def keep(m, x, z):
    """Центральная многоярусная башня (стадия 4): три яруса, шпиль, крест."""
    tiers = [(2.5, 0.0, 5.6), (1.9, 5.6, 2.2), (1.35, 7.8, 1.8)]
    for i, (w, y0, h) in enumerate(tiers):
        m.box((x, y0 + h / 2, z), (w, h, w), stone())
        bricks(m, x - w / 2, x + w / 2, y0 + 0.3, y0 + h - 0.2, z + w / 2, int(h * 2.2))
        bricks(m, 0, 0, y0 + 0.3, y0 + h - 0.2, 0, int(h * 1.4), side=True, x_face=x + w / 2, z0=z - w / 2, z1=z + w / 2)
        top = y0 + h
        cw = w + 0.4
        m.box((x, top + 0.18, z), (cw, 0.36, cw), stone())
        merlons(m, x, z, cw, cw, top + 0.36, mh=0.36, mw=0.3)
        for k in (-1, 1):
            window(m, x + k * w * 0.22, y0 + h * 0.55, z + w / 2, w=0.22, h=0.44)
        window(m, x + w / 2, y0 + h * 0.55, z, side=True, w=0.22, h=0.44)
    top = 7.8 + 1.8 + 0.36
    m.prism((x, top, z), 0.62, 1.5, 4, STONE_DARK, r_top=0.0, phase=math.pi / 4)    # шпиль
    m.box((x, top + 1.5 + 0.35, z), (0.08, 0.7, 0.08), WOOD_DARK)                     # крест
    m.box((x, top + 1.5 + 0.48, z), (0.36, 0.08, 0.08), WOOD_DARK)
    return tiers


# ── стадии ──

def stage1():
    m = Mesh()
    top = tower(m, 0, 0, 2.1, 5.0, door_=True, windows=2)
    return m, [(-0.86, top - 0.41 + 0.42, 0.55)], 0


def stage2():
    m = Mesh()
    top = tower(m, -2.3, 0, 2.1, 5.0, door_=True, windows=2)
    wall(m, -1.25, 1.45, -0.1, 3.5, windows=2, slit=True)
    tower(m, 2.4, 0, 1.9, 4.5, windows=1, side_windows=2)
    scaffold(m, -3.95, 0.0, 3.6)
    scaffold(m, 4.0, 0.0, 3.3)
    return m, [(-3.16, top + 0.01, 0.55)], 0


def stage3():
    m = Mesh()
    top = tower(m, -3.4, 0, 2.1, 5.0, door_=True, windows=2)
    wall(m, -2.35, -0.95, -0.1, 3.4, windows=2)
    tower(m, 0.0, 0, 1.9, 4.6, windows=2)
    gallery(m, 0.95, 2.75, 0.0, 2.5)
    tower(m, 3.7, 0, 1.9, 4.2, windows=1, side_windows=2)
    ladder(m, -2.35, 3.55, -1.6, 5.35, 0.85)
    ladder(m, -1.1, 3.55, -0.75, 5.0, 0.85, rungs=5)
    flag(m, 0.6, -0.5, 5.0, pole=1.3, color=CREAM)
    return m, [(-4.26, top + 0.01, 0.55)], 0


def stage4():
    m = Mesh()
    top = tower(m, -3.6, 0.2, 2.1, 5.0, door_=True, windows=2)
    wall(m, -2.55, -0.95, 0.0, 3.5, windows=2)
    keep(m, -0.3, -1.3)
    tower(m, 0.0, 0.3, 1.9, 4.8, windows=2)
    gallery(m, 0.95, 2.75, 0.2, 2.6)
    tower(m, 3.7, 0.2, 1.9, 4.4, windows=1, side_windows=2)
    banner(m, -1.78, 0.48, 3.3, h=1.4, w=0.38)
    flag(m, -0.5, 0.95, 5.2, pole=1.0, color=ROSE)
    flag(m, 0.45, -0.95, 9.95, pole=0.9, color=RED)                    # на верхнем ярусе донжона
    flag(m, 3.2, 0.75, 4.8, pole=1.0, color=RED)
    flag(m, 3.75, 0.75, 4.8, pole=1.15, color=YELLOW)
    flag(m, 4.3, 0.75, 4.8, pole=1.0, color=ROSE)
    return m, [(-4.46, top + 0.01, 0.75)], 0


# ── запись GLB ──

def pack(meshes_nodes):
    """meshes_nodes: [(name, Mesh, translation)] → (json, bin)."""
    buf = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def add_view(data, target):
        while len(buf) % 4:
            buf.append(0)
        views.append({"buffer": 0, "byteOffset": len(buf), "byteLength": len(data), "target": target})
        buf.extend(data)
        return len(views) - 1

    for name, mesh, tr in meshes_nodes:
        pos = np.asarray(mesh.pos, np.float32)
        col = np.asarray(mesh.col, np.uint8)
        idx = np.asarray(mesh.idx, np.uint32).ravel()
        itype, idt = (5123, np.uint16) if len(pos) < 65535 else (5125, np.uint32)
        vp = add_view(pos.tobytes(), 34962)
        accessors.append({"bufferView": vp, "componentType": 5126, "count": len(pos), "type": "VEC3",
                          "min": pos.min(0).tolist(), "max": pos.max(0).tolist()})
        vc = add_view(col.tobytes(), 34962)
        accessors.append({"bufferView": vc, "componentType": 5121, "normalized": True, "count": len(col),
                          "type": "VEC4"})
        vi = add_view(idx.astype(idt).tobytes(), 34963)
        accessors.append({"bufferView": vi, "componentType": itype, "count": len(idx), "type": "SCALAR"})
        a0 = len(accessors) - 3
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": a0, "COLOR_0": a0 + 1},
                                                      "indices": a0 + 2, "material": 0}]})
        node = {"name": name, "mesh": len(meshes) - 1}
        if tr is not None:
            node["translation"] = [float(v) for v in tr]
        nodes.append(node)
    while len(buf) % 4:
        buf.append(0)
    root = {"name": "castle", "children": list(range(len(nodes)))}
    nodes.append(root)
    gl = {
        "asset": {"version": "2.0", "generator": "hvosty castle_glb.py"},
        "scene": 0, "scenes": [{"nodes": [len(nodes) - 1]}], "nodes": nodes, "meshes": meshes,
        "materials": [{"name": "toon", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1],
                                                                 "metallicFactor": 0, "roughnessFactor": 0.9}}],
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(buf)}],
    }
    return gl, bytes(buf)


def write_glb(path, gl, bin_):
    js = json.dumps(gl, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942) + bin_)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for n, fn in enumerate((stage1, stage2, stage3, stage4), 1):
        body, ball_pos, _ = fn()
        pos = np.asarray(body.pos)
        # центр по x/z — в ноль (баллиста сдвигается вместе с телом)
        cx = (pos[:, 0].min() + pos[:, 0].max()) / 2
        cz = (pos[:, 2].min() + pos[:, 2].max()) / 2
        body.pos = (pos - [cx, 0, cz]).tolist()
        bp = [ball_pos[0][0] - cx, ball_pos[0][1], ball_pos[0][2] - cz]
        gl, bin_ = pack([("body", body, None), ("ballista", ballista(), bp)])
        out = OUT / f"stage{n}.glb"
        write_glb(out, gl, bin_)
        p = np.asarray(body.pos)
        print(f"{out.name}: {len(body.idx)} треуг., {out.stat().st_size / 1024:.0f} КБ, "
              f"размер {np.ptp(p[:, 0]):.1f}×{p[:, 1].max():.1f}×{np.ptp(p[:, 2]):.1f}")


if __name__ == "__main__":
    main()
