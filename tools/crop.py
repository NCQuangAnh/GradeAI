"""Zoom into part of a photo to check an ambiguous handwritten word.

Coordinates are fractions of the image (0-1), so they work at any resolution.

Usage:
    python tools/crop.py data/TA6/19-9/photos/IMG_7283.jpg 0.2 0.5 0.8 0.6
    -> writes data/TA6/19-9/zoom/IMG_7283_20-50-80-60.jpg (2x upscaled)
"""
import sys
from pathlib import Path

from PIL import Image

if len(sys.argv) != 6:
    raise SystemExit(__doc__)
src = Path(sys.argv[1])
x0, y0, x1, y1 = (float(v) for v in sys.argv[2:])
im = Image.open(src)
w, h = im.size
part = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
part = part.resize((part.width * 2, part.height * 2), Image.LANCZOS)
out = src.parent.parent / "zoom" / f"{src.stem}_{int(x0*100)}-{int(y0*100)}-{int(x1*100)}-{int(y1*100)}.jpg"
out.parent.mkdir(exist_ok=True)
part.save(out, quality=90)
print(out)
