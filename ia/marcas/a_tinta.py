"""Convierte un logo plano en PNG negro con fondo transparente.

El muro de marcas pinta todo con filter:brightness(0), que lleva el color a
cero pero respeta el alfa. O sea: lo que mande es el alfa, no el color. Este
script arma ese alfa a partir del brillo de la imagen original.

  modo "oscura": la tinta es lo oscuro (ej. disco negro con letras blancas
                 caladas). alfa = 1 - brillo, así el calado queda transparente
                 y se ve el fondo de la tarjeta a través de las letras.
  modo "clara":  la tinta es lo claro (ej. letras blancas sobre fondo azul).
                 alfa = brillo.

Opcional --circulo cx cy r recorta un disco y deja fuera todo lo demás, para
sacar un logo redondo de una captura de pantalla.
"""
import sys, argparse, pymupdf as fitz

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst")
ap.add_argument("--modo", choices=("oscura", "clara"), required=True)
ap.add_argument("--circulo", nargs=3, type=int, metavar=("CX", "CY", "R"))
ap.add_argument("--piso", type=float, default=0.12)
ap.add_argument("--techo", type=float, default=0.88)
a = ap.parse_args()

p = fitz.Pixmap(a.src)
w, h, n, s = p.width, p.height, p.n, p.samples

if a.circulo:
    cx, cy, r = a.circulo
    x0, y0, x1, y1 = cx - r, cy - r, cx + r, cy + r
else:
    cx = cy = r = None
    x0, y0, x1, y1 = 0, 0, w - 1, h - 1
x0, y0 = max(0, x0), max(0, y0)
x1, y1 = min(w - 1, x1), min(h - 1, y1)
W, H = x1 - x0 + 1, y1 - y0 + 1

out = bytearray(W * H * 4)
for y in range(y0, y1 + 1):
    row = y * w * n
    orow = (y - y0) * W * 4
    for x in range(x0, x1 + 1):
        o = orow + (x - x0) * 4
        if r is not None and (x - cx) ** 2 + (y - cy) ** 2 > r * r:
            continue                      # fuera del disco: transparente
        i = row + x * n
        lum = (0.2126 * s[i] + 0.7152 * s[i+1] + 0.0722 * s[i+2]) / 255.0
        v = 1.0 - lum if a.modo == "oscura" else lum
        # rampa: aplasta el ruido de compresión sin comerse el antialias
        v = (v - a.piso) / (a.techo - a.piso)
        v = 0.0 if v < 0 else (1.0 if v > 1 else v)
        out[o + 3] = int(round(v * 255))  # color queda en negro (0,0,0)

fitz.Pixmap(fitz.csRGB, W, H, bytes(out), True).save(a.dst)
op = sum(1 for k in range(3, len(out), 4) if out[k] > 200)
print(f"  {a.src} -> {a.dst}  {W}x{H}  opacos {100*op/(W*H):.1f}%")
