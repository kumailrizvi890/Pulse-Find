#!/usr/bin/env python3
"""Generate Pulse Find PWA icons from the repo's own pulse mark.

Reads the waveform path out of src/app/icon.svg (the same red ECG line
the logo uses) and draws it in three layers (soft red glow, red core,
white hairline) on the app's dark background, at 512, 192 and 180 px.
No hotlinked assets, no new dependency: Pillow only. Run from the repo
root: python3 scripts/gen-pwa-icons.py
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SVG_PATH = ROOT / "src" / "app" / "icon.svg"
OUT_DIR = ROOT / "public" / "icons"

BG = (13, 12, 16, 255)          # --bg #0d0c10
RED = (253, 88, 93)             # --accent #fd585d
WHITE = (255, 255, 255)

# (width in viewBox units, color, opacity) — mirrors the three strokes
# in icon.svg: a wide faint glow, a mid red stroke, a thin white core.
LAYERS = [
    (7.0, RED, 77),    # ~0.3 opacity glow
    (3.5, RED, 191),   # ~0.75 opacity core
    (1.8, WHITE, 255), # white hairline
]


def parse_points(svg: str) -> list[tuple[float, float]]:
    m = re.search(r'<path d="([^"]+)"', svg)
    if not m:
        raise SystemExit("no path found in icon.svg")
    d = m.group(1)
    tokens = re.findall(r"([MLH])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?", d)
    pts: list[tuple[float, float]] = []
    x = y = 0.0
    for cmd, a, b in tokens:
        if cmd == "M":
            x, y = float(a), float(b)
            pts.append((x, y))
        elif cmd == "H":
            x = float(a)
            pts.append((x, y))
        elif cmd == "L":
            x, y = float(a), float(b)
            pts.append((x, y))
    return pts


def draw_mark(size: int, points: list[tuple[float, float]]) -> Image.Image:
    ss = 2  # supersample, then downscale for smooth edges
    big = size * ss
    scale = big / 32.0
    canvas = Image.new("RGBA", (big, big), BG)
    for width, color, alpha in LAYERS:
        layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        w = width * scale
        scaled = [(x * scale, y * scale) for x, y in points]
        draw.line(scaled, fill=color + (alpha,), width=int(round(w)), joint="curve")
        # Round caps and joins: a disc at every vertex.
        r = w / 2
        for px, py in scaled:
            draw.ellipse([px - r, py - r, px + r, py + r], fill=color + (alpha,))
        canvas = Image.alpha_composite(canvas, layer)
    return canvas.resize((size, size), Image.LANCZOS).convert("RGB")


def main() -> None:
    points = parse_points(SVG_PATH.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)]:
        out = OUT_DIR / name
        draw_mark(size, points).save(out, "PNG")
        print(f"wrote {out} ({size}x{size})")


if __name__ == "__main__":
    main()
