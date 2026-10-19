# -*- coding: utf-8 -*-
"""Pega en index.html todo lo que generan los otros scripts.

Antes esto se hacía a mano, y a mano es como se desincronizan: un café
nuevo en datos.py que nunca llegó a la página, o un precio cambiado que
quedó solo en el JSON-LD. Google penaliza la diferencia y los asistentes
citan el número equivocado.

    cd ia
    python3 gencatalogo.py && python3 genpreg.py && python3 genrecetas.py
    python3 inyecta.py

Pega dos cosas distintas:

 · los tres JSON-LD del <head>, en el orden en que están en el archivo;
 · los tres trozos de HTML: las tarjetas de producto dentro del carrusel,
   y las secciones completas de recetas y de preguntas.
"""
import io, json, os

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, "..")
PAGINA = os.path.join(RAIZ, "index.html")

ABRE, CIERRA = '<script type="application/ld+json">', "</script>"
ORDEN_LD = ["ld-tienda.json", "ld-faq.json", "ld-recetas.json"]

# Las secciones que se reemplazan enteras: (archivo, comentario que las abre).
# El trozo generado ya trae el comentario y el <section>, así que se cambia
# desde el comentario hasta el </section> que lo cierra.
SECCIONES = [
    ("parte_recetas.html",   "<!-- ===================== 08 · RECETAS ====================="),
    ("parte_preguntas.html", "<!-- ===================== 09 · PREGUNTAS FRECUENTES ====================="),
]

# Los dos carruseles de productos: se reemplaza el contenido del div, no
# el div. Cada producto va en uno solo, así que no se duplican los id.
PISTAS = ["cafes", "packs"]

# El cuerpo de la tabla comparativa: solo las filas, no el <tbody>.
TBODY = "<tbody>"


def bloques_ld(texto):
    sitios, desde = [], 0
    while True:
        i = texto.find(ABRE, desde)
        if i < 0:
            return sitios
        ini = i + len(ABRE)
        fin = texto.index(CIERRA, ini)
        sitios.append((ini, fin))
        desde = fin


def cierre_del_div(texto, abre):
    """Dónde cierra el div que empieza en `abre`, contando anidamiento."""
    i, hondo = abre, 0
    while True:
        sig_abre = texto.find("<div", i + 1)
        sig_cierra = texto.index("</div>", i + 1)
        if sig_abre != -1 and sig_abre < sig_cierra:
            hondo += 1
            i = sig_abre
            continue
        if hondo == 0:
            return sig_cierra
        hondo -= 1
        i = sig_cierra


def leer(nombre):
    return io.open(os.path.join(AQUI, nombre), encoding="utf-8").read()


def main():
    pagina = io.open(PAGINA, encoding="utf-8").read()

    # ---- secciones completas, de abajo hacia arriba
    for nombre, marca in reversed(SECCIONES):
        if marca not in pagina:
            raise SystemExit("no encuentro en index.html el comentario:\n  " + marca)
        ini = pagina.index(marca)
        fin = pagina.index("\n</section>", ini) + len("\n</section>")
        pagina = pagina[:ini] + leer(nombre).rstrip("\n") + pagina[fin:]
        print("  %-22s sección reemplazada" % nombre)

    # ---- tarjetas de producto, cada una en su carrusel
    for pista in reversed(PISTAS):
        marca = '<div class="car-pista rev" data-pista="%s">' % pista
        if marca not in pagina:
            raise SystemExit("no encuentro el carrusel %s en index.html" % pista)
        trozo = leer("parte_productos_%s.html" % pista).rstrip("\n")
        abre = pagina.index(marca)
        ini = abre + len(marca)
        fin = cierre_del_div(pagina, abre)
        pagina = pagina[:ini] + "\n" + trozo + "\n      " + pagina[fin:]
        print("  carrusel %-6s       %d tarjetas"
              % (pista, trozo.count('<article class="prod"')))

    # ---- las filas de la tabla comparativa
    ini = pagina.index(TBODY, pagina.index('id="comparar"')) + len(TBODY)
    fin = pagina.index("</tbody>", ini)
    filas = leer("parte_comparar.html").rstrip("\n")
    pagina = pagina[:ini] + "\n" + filas + "\n          " + pagina[fin:]
    print("  %-22s %d filas" % ("parte_comparar.html", filas.count("<tr>")))

    # ---- los tres JSON-LD, de abajo hacia arriba
    sitios = bloques_ld(pagina)
    if len(sitios) != len(ORDEN_LD):
        raise SystemExit("index.html tiene %d bloques JSON-LD y esperaba %d"
                         % (len(sitios), len(ORDEN_LD)))
    for (ini, fin), nombre in reversed(list(zip(sitios, ORDEN_LD))):
        datos = json.load(io.open(os.path.join(AQUI, nombre), encoding="utf-8"))
        pagina = (pagina[:ini] + "\n"
                  + json.dumps(datos, ensure_ascii=False, indent=2)
                  + "\n" + pagina[fin:])

    io.open(PAGINA, "w", encoding="utf-8").write(pagina)

    for (ini, fin), nombre in zip(bloques_ld(pagina), ORDEN_LD):
        json.loads(pagina[ini:fin])
        print("  %-22s pegado, %d caracteres" % (nombre, fin - ini))


if __name__ == "__main__":
    main()
