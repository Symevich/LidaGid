#!/usr/bin/env python3
"""Generate PNG icons for the LidaGid PWA (no external deps, pure stdlib)."""

import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "icons")

BG_TOP = (0x1A, 0x22, 0x33)
BG_BOTTOM = (0x2F, 0x6D, 0xF6)
FG = (0xFF, 0xFF, 0xFF)

SS = 4  # supersampling factor


def rounded_rect_contains(x, y, size, radius):
    """x, y in pixel coords relative to a size x size rounded square."""
    if x < 0 or y < 0 or x > size or y > size:
        return False
    r = radius
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r


def tower(x, y, u, v):
    """u, v are normalised coords (0..1). Castle tower with crenellations."""
    # x: left, right, top, bottom of the tower body
    x0, x1, top = u
    bottom = v
    if not (x0 <= x <= x1 and top <= y <= bottom):
        return False
    # crenellation band: top 8% of the tower, alternate merlon/crenel
    band = bottom - (bottom - top) * 0.0 - (bottom - top) * 0.001
    h = bottom - top
    if y < top + h * 0.09:
        w = x1 - x0
        # 3 merlons + 2 gaps across the width
        rel = (x - x0) / w
        return not (0.30 < rel < 0.44 or 0.56 < rel < 0.70)
    return True


def castle(x, y):
    """White castle silhouette: three crenellated towers joined by walls."""
    # side towers
    if tower(x, y, (0.13, 0.31, 0.42), 0.79):
        return True
    if tower(x, y, (0.69, 0.87, 0.42), 0.79):
        return True
    # central keep (taller)
    if tower(x, y, (0.41, 0.59, 0.26), 0.79):
        # gate arch cut out of the keep
        gate_w = 0.085
        if abs(x - 0.5) < gate_w:
            gate_top = 0.63
            if y > gate_top:
                r = gate_w
                if y < gate_top + r:
                    if (x - 0.5) ** 2 + (y - (gate_top + r)) ** 2 < r * r:
                        return False
                else:
                    return False
        return True
    # connecting walls
    if 0.31 <= x <= 0.41 and 0.56 <= y <= 0.79:
        return True
    if 0.59 <= x <= 0.69 and 0.56 <= y <= 0.79:
        return True
    # ground line
    if 0.09 <= x <= 0.91 and 0.80 <= y <= 0.855:
        return True
    return False


def pixel(x, y):
    """Return RGBA for pixel centre (x, y) using supersampling."""
    bg_hits = 0
    fg_hits = 0
    for sy in range(SS):
        for sx in range(SS):
            px = x + (sx + 0.5) / SS
            py = y + (sy + 0.5) / SS
            if rounded_rect_contains(px, py, SIZE, SIZE * 0.22):
                bg_hits += 1
                if castle(px / SIZE, py / SIZE):
                    fg_hits += 1
    if bg_hits == 0:
        return (0, 0, 0, 0)
    total = SS * SS
    bg_cov = bg_hits / total
    fg_cov = fg_hits / total
    t = y / SIZE
    base = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
    r, g, b = (round(base[i] * (1 - fg_cov) + FG[i] * fg_cov) for i in range(3))
    return (r, g, b, round(255 * bg_cov))


def write_png(path, size, maskable=False):
    global SIZE
    SIZE = size
    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # filter type: none
        for x in range(size):
            if maskable:
                # maskable icons are full-bleed with a safe zone
                px = (x - size / 2) / (size * 0.62) + 0.5
                py = (y - size / 2) / (size * 0.62) + 0.5
                bg_cov = 1
                fg_cov = 1 if (0 <= px <= 1 and 0 <= py <= 1 and castle(px, py)) else 0
                t = y / size
                base = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
                row += bytes(
                    (round(base[i] * (1 - fg_cov) + FG[i] * fg_cov) for i in range(3))
                )
                row += bytes((255 * bg_cov,))
            else:
                row += bytes(pixel(x, y))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, size, maskable in (
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ):
        p = write_png(os.path.join(OUT_DIR, name), size, maskable)
        print(f"wrote {os.path.relpath(p, os.path.join(OUT_DIR, '..', '..'))} ({os.path.getsize(p)} bytes)")


if __name__ == "__main__":
    main()
