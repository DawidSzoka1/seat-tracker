"""Generuje seats.js (pozycje i numeracja miejsc) z obrazka planu widowni.

Użycie:  python3 tools/build_layout.py plan.jpg seats.js

Wykrywa kolorowe prostokąty (miejsca) na planie, a potem przypisuje im
sekcję, rząd i numer według numeracji z planu "Duża Scena – plan widowni".
Każda grupa jest sprawdzana z oczekiwaną liczbą miejsc – jeśli coś się
nie zgadza, skrypt przerywa działanie.
"""
import json
import math
import sys
from collections import deque

import numpy as np
from PIL import Image

SCALE = 0.5  # współrzędne obrazka -> współrzędne SVG


def detect(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(int)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    masks = {
        1: (R > 90) & (R < 160) & (G < 70) & (B > 100) & (B < 170),   # fiolet – Strefa I
        2: (R > 220) & (G > 160) & (G < 215) & (B < 80),              # żółty – Strefa II
        3: (R > 210) & (G > 80) & (G < 140) & (B < 80),               # pomarańcz – Strefa III
        4: (R < 60) & (G > 110) & (G < 170) & (B > 40) & (B < 110),   # zielony – Strefa IV
    }
    H, W = R.shape
    zone = np.zeros((H, W), np.int8)
    for z, m in masks.items():
        zone[m] = z
    lab = np.zeros((H, W), bool)
    blobs = []
    for y0, x0 in zip(*np.nonzero(zone)):
        if lab[y0, x0]:
            continue
        z = zone[y0, x0]
        q = deque([(y0, x0)])
        lab[y0, x0] = True
        n = sx = sy = 0
        while q:
            y, x = q.popleft()
            n += 1; sx += x; sy += y
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H and 0 <= xx < W and not lab[yy, xx] and zone[yy, xx] == z:
                    lab[yy, xx] = True
                    q.append((yy, xx))
        if n >= 150:
            blobs.append({'x': sx / n, 'y': sy / n, 'z': int(z), 'n': n})
    # scal kawałki jednego miejsca rozcięte białym numerem
    merged = True
    while merged:
        merged = False
        for i in range(len(blobs)):
            for j in range(i + 1, len(blobs)):
                p, q2 = blobs[i], blobs[j]
                if p['z'] == q2['z'] and math.hypot(p['x'] - q2['x'], p['y'] - q2['y']) < 16:
                    n = p['n'] + q2['n']
                    p['x'] = (p['x'] * p['n'] + q2['x'] * q2['n']) / n
                    p['y'] = (p['y'] * p['n'] + q2['y'] * q2['n']) / n
                    p['n'] = n
                    del blobs[j]
                    merged = True
                    break
            if merged:
                break
    # bez kwadracików legendy
    return [b for b in blobs if not (b['x'] < 200 and b['y'] > 1950)]


def take(pool, pred):
    out = [b for b in pool if pred(b)]
    for b in out:
        pool.remove(b)
    return out


def split_by(items, key, sizes):
    """Dzieli posortowane wg key elementy na grupy o podanych liczebnościach."""
    items = sorted(items, key=key)
    assert len(items) == sum(sizes), (len(items), sizes)
    out, i = [], 0
    for s in sizes:
        out.append(items[i:i + s]); i += s
    return out


def main(src, dst):
    pool = detect(src)
    assert len(pool) == 756, len(pool)
    seats = []

    def add(sec, row, nums, group, order_key, rot=0):
        group = sorted(group, key=order_key)
        assert len(group) == len(nums), (sec, row, len(group), len(nums))
        for b, n in zip(group, nums):
            r = rot(b) if callable(rot) else rot
            seats.append({'sec': sec, 'row': row, 'n': n, 'zone': b['z'], 'x': b['x'], 'y': b['y'], 'rot': r})

    rng = lambda a, b: list(range(a, b + 1))
    CX, CY = 992, 10  # środek łuków parteru
    rad = lambda b: math.hypot(b['x'] - CX, b['y'] - CY)
    ang = lambda b: math.atan2(b['x'] - CX, b['y'] - CY)  # od lewej do prawej
    radial = lambda b: math.degrees(math.atan2(b['y'] - CY, b['x'] - CX)) - 90
    K = 0.0002
    arc = lambda b: -math.degrees(math.atan(2 * K * (b['x'] - 992)))

    # ---------- Balkon I środkowy + Balkon II (dół planu) ----------
    b2 = take(pool, lambda b: b['y'] > 2120)
    r1, r2 = split_by(b2, lambda b: b['y'] + K * (b['x'] - 992) ** 2, [19, 16])
    add('B2', 1, rng(1, 19), r1, lambda b: b['x'], arc)
    add('B2', 2, rng(1, 16), r2, lambda b: b['x'], arc)

    b1 = take(pool, lambda b: b['y'] > 1800)
    flat = lambda b: b['y'] + K * (b['x'] - 992) ** 2
    yel = [b for b in b1 if b['z'] == 2]; pur = [b for b in b1 if b['z'] == 1]; ora = [b for b in b1 if b['z'] == 3]
    ry1, ry4 = split_by(yel, flat, [27, 22])
    rp2, rp3 = split_by(pur, flat, [24, 23])
    add('B1', 1, rng(1, 27), ry1, lambda b: b['x'], arc)
    add('B1', 2, rng(1, 24), rp2, lambda b: b['x'], arc)
    add('B1', 3, rng(1, 23), rp3, lambda b: b['x'], arc)
    add('B1', 4, rng(1, 22), ry4, lambda b: b['x'], arc)
    add('B1', 5, rng(1, 12), ora, lambda b: b['x'], lambda b: 50 if b['x'] < 700 else (-50 if b['x'] > 1280 else 0))

    # ---------- Balkony boczne i loże ----------
    L, R = (lambda b: b['x'] < 992), (lambda b: b['x'] >= 992)
    gL = take(pool, lambda b: b['z'] == 4 and b['x'] < 380)
    gR = take(pool, lambda b: b['z'] == 4 and b['x'] > 1604)
    for sec, g, outer_first in (('BL', gL, True), ('BP', gR, False)):
        # kolumna zewnętrzna 1–10, wewnętrzna 18 (góra) … 11 (dół)
        nx = 0.966 if sec == 'BL' else -0.966
        outer, inner = split_by(g, lambda b: b['x'] * nx + b['y'] * 0.259, [10, 8])
        add(sec, None, rng(1, 10), outer, lambda b: b['y'], -28 if sec == 'BL' else 28)
        add(sec, None, list(range(18, 10, -1)), inner, lambda b: b['y'], -28 if sec == 'BL' else 28)
    add('L3', None, rng(1, 4), take(pool, lambda b: b['z'] == 4 and b['x'] < 992 and b['y'] < 1300), lambda b: b['y'], -30)
    add('L4', None, rng(1, 4), take(pool, lambda b: b['z'] == 4 and b['x'] > 992 and b['y'] < 1300), lambda b: b['y'], 30)
    add('L1', None, rng(1, 7), take(pool, lambda b: b['z'] == 3 and b['x'] < 560 and b['y'] < 1250), lambda b: b['y'], -30)
    add('L2', None, rng(1, 7), take(pool, lambda b: b['z'] == 3 and b['x'] > 1420 and b['y'] < 1250), lambda b: b['y'], 30)

    # Loża V / VI: kolumny 1–3 (wewn.), 4–8, 9–16 (zewn.)
    for sec, pred, sgn in (('L5', lambda b: b['z'] == 2 and b['x'] < 600 and b['y'] > 1300, 1), ('L6', lambda b: b['z'] == 2 and b['x'] > 1380 and b['y'] > 1300, -1)):
        g = take(pool, pred)
        c9, c4, c1 = split_by(g, lambda b: sgn * b['x'] * 0.906 - b['y'] * 0.423, [8, 5, 3])
        for nums, c in ((rng(1, 3), c1), (rng(4, 8), c4), (rng(9, 16), c9)):
            add(sec, None, nums, c, lambda b: b['y'], 45)
    # Loża VIII / VII: 1–5 (wewn.), 6–11 (zewn.)
    for sec, pred, sgn in (('L8', lambda b: b['z'] == 3 and b['x'] < 430 and b['y'] > 1450, 1), ('L7', lambda b: b['z'] == 3 and b['x'] > 1550 and b['y'] > 1450, -1)):
        g = take(pool, pred)
        c6, c1 = split_by(g, lambda b: sgn * b['x'] * 0.85 - b['y'] * 0.53, [6, 5])
        add(sec, None, rng(1, 5), c1, lambda b: b['y'], 33 * sgn)
        add(sec, None, rng(6, 11), c6, lambda b: b['y'], 33 * sgn)

    # ---------- Parter: skrzydła rzędów 18–20 ----------
    wl = take(pool, lambda b: b['z'] == 3 and b['x'] < 740 and b['y'] > 1500)
    w18, w19, w20 = split_by(wl, lambda b: -b['x'] * 0.616 + b['y'] * 0.788, [4, 5, 7])
    add('P', 18, rng(1, 4), w18, lambda b: b['x'], 38); add('P', 19, rng(1, 5), w19, lambda b: b['x'], 38); add('P', 20, rng(1, 7), w20, lambda b: b['x'], 38)
    wr = take(pool, lambda b: b['z'] == 3 and b['x'] > 1240 and b['y'] > 1500)
    w18, w19, w20 = split_by(wr, lambda b: b['x'] * 0.616 + b['y'] * 0.788, [4, 5, 7])
    add('P', 18, rng(21, 24), w18, lambda b: b['x'], -38); add('P', 19, rng(23, 27), w19, lambda b: b['x'], -38); add('P', 20, rng(8, 14), w20, lambda b: b['x'], -38)

    # ---------- Parter: rzędy łukowe ----------
    par = take(pool, lambda b: True)
    rows = {}
    for z, sizes, first in ((3, [27, 28, 29], 1), (2, [30, 31, 32, 31, 32, 31], 4), (1, [30, 29, 28, 25], 10)):
        grp = [b for b in par if b['z'] == z]
        if z == 3:
            grp = sorted(grp, key=rad)[:sum(sizes)]
        for i, g in enumerate(split_by(grp, rad, sizes)):
            rows[first + i] = g
    used = {id(b) for g in rows.values() for b in g}
    rest = [b for b in par if id(b) not in used]
    for i, g in enumerate(split_by(rest, rad, [14, 10, 14, 15, 16, 17])):
        rows[14 + i] = g
    numbering = {r: rng(1, len(rows[r])) for r in range(1, 14)}
    numbering.update({14: rng(1, 7) + rng(16, 22), 15: rng(1, 5) + rng(13, 17), 16: rng(1, 14), 17: rng(1, 15), 18: rng(5, 20), 19: rng(6, 22)})
    for r, g in rows.items():
        add('P', r, numbering[r], g, ang, radial)

    assert len(seats) == 756, len(seats)
    ids = {(s['sec'], s['row'], s['n']) for s in seats}
    assert len(ids) == 756, 'zduplikowane numery'

    out = [{'sec': s['sec'], 'row': s['row'], 'n': s['n'], 'zone': s['zone'],
            'x': round(s['x'] * SCALE, 1), 'y': round(s['y'] * SCALE, 1), 'rot': round(s['rot'], 1)} for s in seats]
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('// WYGENEROWANE przez tools/build_layout.py z planu widowni – nie edytuj ręcznie.\n')
        f.write('// sec, row (null = bez rzędu), n = numer miejsca, zone = strefa 1–4, x/y/rot = pozycja na planie\n')
        f.write('export const SEAT_DATA = [\n')
        for s in out:
            f.write('  ' + json.dumps(s, ensure_ascii=False) + ',\n')
        f.write('];\n')
    print('OK', len(out))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
