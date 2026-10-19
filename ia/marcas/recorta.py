"""Recorta los bordes transparentes de un PNG RGBA y lo guarda."""
import sys, pymupdf as fitz

src, dst = sys.argv[1], sys.argv[2]
p = fitz.Pixmap(src)
if not p.alpha:
    raise SystemExit(f"{src}: no tiene canal alfa")
n, w, h, s = p.n, p.width, p.height, p.samples
x0, y0, x1, y1 = w, h, -1, -1
for y in range(h):
    row = y * w * n
    for x in range(w):
        if s[row + x * n + n - 1] > 8:
            x0 = min(x0, x); x1 = max(x1, x)
            y0 = min(y0, y); y1 = max(y1, y)
if x1 < 0:
    raise SystemExit(f"{src}: la imagen está completamente transparente")
pad = 2
x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
x1, y1 = min(w - 1, x1 + pad), min(h - 1, y1 + pad)
W2, H2 = x1 - x0 + 1, y1 - y0 + 1
buf = bytearray(W2 * H2 * n)
for y in range(y0, y1 + 1):
    buf[(y - y0) * W2 * n:(y - y0) * W2 * n + W2 * n] = s[y * w * n + x0 * n: y * w * n + (x1 + 1) * n]
out = fitz.Pixmap(p.colorspace, W2, H2, bytes(buf), True)
out.save(dst)
print(f"  {src.split('/')[-1]:28s} {w}x{h} -> {W2}x{H2}")
