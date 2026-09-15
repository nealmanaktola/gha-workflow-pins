"""Draw the extension icons with the standard library only.

Run: python3 tools/make_icons.py
"""

import math
import pathlib
import struct
import zlib

BACKGROUND = (13, 17, 23)
STAR = (255, 200, 61)
SUPERSAMPLE = 4


def star_polygon(size: float) -> list[tuple[float, float]]:
    centre = size / 2
    outer = size * 0.34
    inner = outer * 0.4
    points = []
    for index in range(10):
        radius = outer if index % 2 == 0 else inner
        angle = -math.pi / 2 + index * math.pi / 5
        points.append((centre + radius * math.cos(angle), centre + radius * math.sin(angle)))
    return points


def inside(polygon: list[tuple[float, float]], x: float, y: float) -> bool:
    hit = False
    count = len(polygon)
    for i in range(count):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % count]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def rounded_square(size: float, radius: float, x: float, y: float) -> bool:
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2


def render(size: int) -> bytes:
    scale = SUPERSAMPLE
    big = size * scale
    polygon = star_polygon(big)
    radius = big * 0.22
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            red = green = blue = alpha = 0
            for sy in range(scale):
                for sx in range(scale):
                    x = px * scale + sx + 0.5
                    y = py * scale + sy + 0.5
                    if not rounded_square(big, radius, x, y):
                        continue
                    colour = STAR if inside(polygon, x, y) else BACKGROUND
                    red += colour[0]
                    green += colour[1]
                    blue += colour[2]
                    alpha += 255
            samples = scale * scale
            row += bytes((red // samples, green // samples, blue // samples, alpha // samples))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path: pathlib.Path, size: int) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(render(size), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"{path} ({len(png)} bytes)")


if __name__ == "__main__":
    icons = pathlib.Path(__file__).resolve().parent.parent / "icons"
    icons.mkdir(exist_ok=True)
    for dimension in (16, 32, 48, 128):
        write_png(icons / f"icon-{dimension}.png", dimension)
