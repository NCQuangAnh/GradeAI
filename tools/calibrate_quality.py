"""Calibrate the blur / darkness warning used by the web app (Index.html: photoQuality).

Same measure as the browser: resize to 800px long side, grayscale, look at the centre 60%,
brightness = mean, sharpness = variance of the 4-neighbour Laplacian.
Runs on the real class photos plus artificially blurred / darkened copies.

Usage: python tools/calibrate_quality.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

DATA = Path(__file__).resolve().parent.parent / "data"


def measure(im: Image.Image) -> tuple[float, float]:
    s = 800 / max(im.size)
    im = im.convert("RGB").resize((round(im.width * s), round(im.height * s)), Image.BILINEAR)
    w, h = im.size
    px = im.load()
    x0, x1, y0, y1 = int(w * .2), int(w * .8), int(h * .2), int(h * .8)
    g = [[0.299 * px[x, y][0] + 0.587 * px[x, y][1] + 0.114 * px[x, y][2] for x in range(x0, x1)]
         for y in range(y0, y1)]
    mean = sum(map(sum, g)) / (len(g) * len(g[0]))
    lap = [4 * g[y][x] - g[y - 1][x] - g[y + 1][x] - g[y][x - 1] - g[y][x + 1]
           for y in range(1, len(g) - 1) for x in range(1, len(g[0]) - 1)]
    m = sum(lap) / len(lap)
    return mean, sum((v - m) ** 2 for v in lap) / len(lap)


def main() -> None:
    photos = sorted(DATA.glob("TA6/*/photos/*.jpg"))
    rows = []
    for p in photos:
        im = Image.open(p)
        rows.append(("gốc", p.name, *measure(im)))
        rows.append(("mờ nhẹ r=2", p.name, *measure(im.filter(ImageFilter.GaussianBlur(2)))))
        rows.append(("mờ r=4", p.name, *measure(im.filter(ImageFilter.GaussianBlur(4)))))
        rows.append(("tối x0.35", p.name, *measure(ImageEnhance.Brightness(im).enhance(0.35))))
    for kind in ("gốc", "mờ nhẹ r=2", "mờ r=4", "tối x0.35"):
        sel = [r for r in rows if r[0] == kind]
        br = sorted(r[2] for r in sel)
        sh = sorted(r[3] for r in sel)
        print(f"{kind:<12} n={len(sel):>2}  sáng min/median/max {br[0]:6.1f} {br[len(br)//2]:6.1f} {br[-1]:6.1f}"
              f"  nét min/median/max {sh[0]:7.1f} {sh[len(sh)//2]:7.1f} {sh[-1]:7.1f}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
