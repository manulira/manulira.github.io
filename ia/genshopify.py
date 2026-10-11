# -*- coding: utf-8 -*-
"""Genera shopify/PRODUCTOS.md: la ficha de cada producto lista para copiar
y pegar en Shopify, sacada de datos.py para que no se desincronice."""
import io, os
from datos import PRODUCTOS, CATEGORIAS, SUSCRIPCION_DESC

AQUI = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(AQUI, "..", "shopify", "PRODUCTOS.md")

# Etiquetas que lee la sección para pintar la tarjeta
TONOS = {"colombia": "#AEBFC2", "matcha": "#AEBFC2", "lata-edicion": "#E8E2D7",
         "coldbrew-lata": "#706962", "kit-matcha": "#FFFFFF",
         "kit-cafetero": "#FFFFFF", "musette": "#AEBFC2", "polera": "#FFFFFF",
         "vaso": "#FFFFFF"}
ACENTOS = {"colombia": "#3F5363", "matcha": "#3F5363", "lata-edicion": "#3F5363",
           "coldbrew-lata": "#E8E2D7", "kit-matcha": "#706962",
           "kit-cafetero": "#3F5363", "musette": "#706962", "polera": "#AEBFC2",
           "vaso": "#AEBFC2"}
ARTE = {"i-bolsa": "bolsa", "i-tarro": "tarro", "i-lata-cafe": "tarro",
        "i-coldbrew-lata": "botella", "i-batidor": "batidor", "i-caja": "caja",
        "i-musette": "caja", "i-polera": "caja", "i-taza": "taza"}

out = ["""# Productos para cargar en Shopify

Las nueve fichas, listas para copiar. Salen de `ia/datos.py`, así que si
cambias algo allá, vuelve a generar este archivo con `python3 ia/genshopify.py`.

**Los precios no están**: los pones tú en cada ficha. Todo lo demás se puede
pegar tal cual.

Las etiquetas (`tags`) son las que lee la sección para pintar la tarjeta sin
que tengas que tocar código. Van separadas por coma en el campo Etiquetas de
Shopify.

---
"""]

for pid, nombre, cat, arte, bajada, desc, opciones, variantes, etq, activo in PRODUCTOS:
    out.append("## %s%s\n" % (nombre, "" if activo else "  ·  *(guardado, no publicar todavía)*"))
    out.append("**Título**  \n`%s`\n" % nombre)
    out.append("**Descripción**\n\n> %s\n" % desc)
    out.append("**Categoría del producto**  \n`%s`\n" % cat)

    if opciones:
        out.append("**Opciones**\n")
        for i, (eje, vals) in enumerate(opciones, 1):
            out.append("%d. `%s` → %s" % (i, eje, ", ".join("`%s`" % v for v in vals)))
        out.append("")
        out.append("**Variantes** (%d)\n" % len(variantes))
        out.append("| Variante | SKU | Precio |")
        out.append("|---|---|---|")
        for clave in variantes:
            sku = "sepia-%s-%s" % (pid, "-".join(
                x.lower().replace(" ", "") for x in clave.split(" · ")))
            out.append("| %s | `%s` | *(por definir)* |" % (clave, sku))
        out.append("")
    else:
        out.append("**Variantes**  \nNinguna. SKU: `sepia-%s`\n" % pid)

    tags = ["sub:%s" % bajada, "tono:%s" % TONOS.get(pid, "#FFFFFF"),
            "acento:%s" % ACENTOS.get(pid, "#3F5363"),
            "arte:%s" % ARTE.get(arte, "caja")]
    if etq:
        tags.append("etq:%s" % etq)
    out.append("**Etiquetas**\n")
    out.append("```\n%s\n```\n" % ", ".join(tags))
    out.append("**Foto**  \n`assets/fotos/prod-%s.jpg` del repositorio, cuando la tengas.  \n"
               "Texto alternativo sugerido en `assets/fotos/LEEME.md`.\n" % pid)
    out.append("---\n")

out.append("""## Colecciones

Arma estas dos y elígelas en los ajustes de cada carrusel de la sección:

| Colección | Productos |
|---|---|
| **Café y matcha** | Colombia, Matcha, Lata edición limitada |
| **Kits y accesorios** | Kit matcha, Kit cafetero, Musette, Polera, Vaso |

El cold brew en lata queda fuera hasta que lo actives.

## Después de cargar todo

1. Pon los precios en cada variante.
2. Sube las fotos.
3. Elige las dos colecciones en los carruseles de la sección.
4. Activa la suscripción con %d%% de descuento, si vas a ofrecerla. Necesita
   una app de suscripciones; la sección ya muestra el selector «Una vez /
   Suscripción» en cada tarjeta.
5. Carga las tarifas del cotizador de eventos en los ajustes de la sección.
""" % SUSCRIPCION_DESC)

io.open(DEST, "w", encoding="utf-8").write("\n".join(out))
print("shopify/PRODUCTOS.md · %d fichas (%d activas)"
      % (len(PRODUCTOS), sum(1 for p in PRODUCTOS if p[9])))
