"""Le cambia el color a un PNG que ya está calado, sin tocar el alfa.

Sirve cuando la pieza ya quedó bien recortada y lo único que cambia es el
color de la tinta: a diferencia de a_color.py, no vuelve a calcular el alfa
desde el brillo del original, así que no hace falta tener el archivo de
partida ni se pierde el recorte que ya estaba hecho.
"""
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst")
ap.add_argument("--color", required=True, help="hex del color final, ej #526EA0")
a = ap.parse_args()

R, G, B = (int(a.color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
im = Image.open(a.src).convert("RGBA")
alfa = im.getchannel("A")
fuera = Image.new("RGBA", im.size, (R, G, B, 0))
fuera.putalpha(alfa)
fuera.save(a.dst)
op = sum(alfa.histogram()[201:])
print(f"  {a.dst.split('/')[-1]:26s} {im.width}x{im.height}  tinta {a.color}  opacos {100*op/(im.width*im.height):.1f}%")
