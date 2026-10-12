"""Saca el fondo de un logo plano y lo deja en el color que se le pida.

Igual que a_tinta.py, el alfa sale del brillo: acá la tinta es lo claro
(letras crema sobre fondo azul), así que alfa = brillo y el fondo se va a
transparente. La diferencia es que el color no queda en negro sino en el
que se pase, para poder sacar la misma pieza en azul de marca para fondo
claro y en crema para fondo oscuro.
"""
import sys, argparse, pymupdf as fitz

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst")
ap.add_argument("--color", required=True, help="hex del color final, ej #526EA0")
ap.add_argument("--piso", type=float, default=0.55)
ap.add_argument("--techo", type=float, default=0.85)
a = ap.parse_args()

R, G, B = (int(a.color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
p = fitz.Pixmap(a.src)
w, h, n, s = p.width, p.height, p.n, p.samples
out = bytearray(w * h * 4)
for y in range(h):
    row = y * w * n
    for x in range(w):
        i, o = row + x * n, (y * w + x) * 4
        lum = (0.2126 * s[i] + 0.7152 * s[i+1] + 0.0722 * s[i+2]) / 255.0
        v = (lum - a.piso) / (a.techo - a.piso)
        v = 0.0 if v < 0 else (1.0 if v > 1 else v)
        out[o] , out[o+1], out[o+2] = R, G, B
        out[o+3] = int(round(v * 255))
fitz.Pixmap(fitz.csRGB, w, h, bytes(out), True).save(a.dst)
op = sum(1 for k in range(3, len(out), 4) if out[k] > 200)
print(f"  {a.dst.split('/')[-1]:24s} {w}x{h}  tinta {a.color}  opacos {100*op/(w*h):.1f}%")
