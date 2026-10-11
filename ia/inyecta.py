# -*- coding: utf-8 -*-
"""Pega los tres JSON-LD generados dentro del <head> de index.html.

Antes esto se hacía a mano, y a mano es como se desincronizan: un precio
cambiado en datos.py que nunca llegó al <head> deja la página diciendo una
cosa y el JSON-LD otra. Google penaliza eso y los asistentes citan el
número equivocado.

    cd ia
    python3 gencatalogo.py && python3 genpreg.py && python3 genrecetas.py
    python3 inyecta.py

Los bloques van en el orden en que están en el archivo: tienda, preguntas,
recetas. Si cambia el orden, cambia ORDEN.
"""
import io, json, os

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, "..")
PAGINA = os.path.join(RAIZ, "index.html")
ABRE, CIERRA = '<script type="application/ld+json">', "</script>"

ORDEN = ["ld-tienda.json", "ld-faq.json", "ld-recetas.json"]


def bloques(texto):
    """Dónde empieza y termina el contenido de cada bloque JSON-LD."""
    sitios, desde = [], 0
    while True:
        i = texto.find(ABRE, desde)
        if i < 0:
            return sitios
        ini = i + len(ABRE)
        fin = texto.index(CIERRA, ini)
        sitios.append((ini, fin))
        desde = fin


def main():
    pagina = io.open(PAGINA, encoding="utf-8").read()
    sitios = bloques(pagina)
    if len(sitios) != len(ORDEN):
        raise SystemExit("index.html tiene %d bloques JSON-LD y esperaba %d"
                         % (len(sitios), len(ORDEN)))

    # De atrás hacia adelante, así los índices de los de arriba no se mueven.
    for (ini, fin), nombre in reversed(list(zip(sitios, ORDEN))):
        ruta = os.path.join(AQUI, nombre)
        datos = json.load(io.open(ruta, encoding="utf-8"))
        texto = json.dumps(datos, ensure_ascii=False, indent=2)
        pagina = pagina[:ini] + "\n" + texto + "\n" + pagina[fin:]

    io.open(PAGINA, "w", encoding="utf-8").write(pagina)

    # Comprobar que los tres quedaron parseables dentro de la página.
    for (ini, fin), nombre in zip(bloques(pagina), ORDEN):
        json.loads(pagina[ini:fin])
        print("  %-18s pegado, %d caracteres" % (nombre, fin - ini))


if __name__ == "__main__":
    main()
