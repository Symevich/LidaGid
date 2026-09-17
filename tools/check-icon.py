#!/usr/bin/env python3
"""Temporary sanity check: decode a generated PNG and print a coarse ASCII view."""
import struct
import sys
import zlib


def decode(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, size = 8, b"", None
    while pos < len(data):
        ln, tag = struct.unpack(">I", data[pos:pos + 4])[0], data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            size = struct.unpack(">IIBBBBB", body)[:2]
        elif tag == b"IDAT":
            idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    w, h = size
    stride = w * 4 + 1
    px = []
    for y in range(h):
        assert raw[y * stride] == 0, "unexpected filter"
        px.append(raw[y * stride + 1:(y + 1) * stride])
    return w, h, px


def main(path):
    w, h, px = decode(path)
    print(f"{path}: {w}x{h}")
    print(f"corner alphas: TL={px[0][3] / 255:.2f} TR={px[0][-1] / 255:.2f} "
          f"BL={px[-1][3] / 255:.2f} BR={px[-1][-1] / 255:.2f}")
    cx, cy = w // 2, h // 2
    print(f"centre rgba: {tuple(px[cy][cx * 4:cx * 4 + 4])}")
    cols, rows = 48, 24
    for r in range(rows):
        line = ""
        for c in range(cols):
            x = int((c + 0.5) * w / cols)
            y = int((r + 0.5) * h / rows)
            R, G, B, A = px[y][x * 4:x * 4 + 4]
            if A < 40:
                line += " "
            elif R > 200 and G > 200 and B > 200:
                line += "#"
            else:
                line += "."
        print(line)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        main(p)
        print()
