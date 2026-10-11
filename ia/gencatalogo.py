# -*- coding: utf-8 -*-
"""Genera, desde datos.py:
   · parte_productos.html  — las tarjetas de producto
   · ld-tienda.json        — el JSON-LD del <head>
   · ../catalogo.json      — el feed legible por máquina
"""
import io, json, os, html, datetime
from datos import (PRODUCTOS as TODOS, CATEGORIAS, SITIO, ENVIO_GRATIS,
                   ENVIO_REDUCIDO, SUSCRIPCION_DESC)

# Solo los activos salen a la página y al JSON-LD. Los inactivos se
# quedan en datos.py y aparecen en catalogo.json marcados como tales.
PRODUCTOS = [p for p in TODOS if p[9]]

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, "..")

TONOS = ["#C8D9E6", "#FFFFFF", "#C8D9E6", "#FFFFFF", "#567C8D", "#FFFFFF",
         "#C8D9E6", "#FFFFFF"]
ACENTOS = ["#2F4156", "#567C8D", "#2F4156", "#567C8D", "#F5EFEB", "#2F4156",
           "#567C8D", "#C8D9E6"]

def clp(n):
    return "$" + format(n, ",d").replace(",", ".")

def esc(t):
    return html.escape(t, quote=False)

def clave_inicial(p):
    """La variante que viene elegida: el primer valor de cada eje."""
    opciones = p[6]
    if not opciones:
        return ""
    return " · ".join(vals[0] for _, vals in opciones)

# ===================================================================== HTML
def tarjetas():
    out = []
    for i, p in enumerate(PRODUCTOS):
        pid, nombre, cat, arte, bajada, desc, opciones, variantes, etq, activo = p
        tono, acento = TONOS[i % len(TONOS)], ACENTOS[i % len(ACENTOS)]
        ini = clave_inicial(p)
        precio = variantes.get(ini)
        precio_txt = clp(precio) if precio is not None else "Precio por confirmar"

        # chips de variante
        chips = ""
        if opciones:
            ejes = []
            for eje, vals in opciones:
                botones = "".join(
                    '<button type="button" data-val="%s" aria-pressed="%s">%s</button>'
                    % (esc(v), "true" if j == 0 else "false", esc(v))
                    for j, v in enumerate(vals))
                ejes.append(
                    '<div class="opcion" data-eje="%s"><span class="opcion-et">%s</span>'
                    '<div class="opcion-chips">%s</div></div>' % (esc(eje), esc(eje), botones))
            chips = '\n          <div class="opciones">%s</div>' % "".join(ejes)

        etiqueta = ('<span class="prod-etq">%s</span>' % esc(etq)) if etq else ""
        hay = precio is not None
        boton = (
            '<button class="prod-rapido" type="button" data-agregar%s>'
            '<svg class="ic" style="width:17px;height:17px" viewBox="0 0 24 24" aria-hidden="true">'
            '<use href="#i-mas"/></svg><span data-etq-agregar>%s</span></button>'
            % ("" if hay else " disabled",
               ("Agregar · " + clp(precio)) if hay else "Pronto"))

        out.append("""        <article class="prod" id="producto-{pid}" data-id="{pid}" data-nombre="{nombre}"
                 data-precio="{precio_num}" data-precio-txt="{precio_txt}"
                 data-variantes='{variantes}'
                 data-tono="{tono}" data-acento="{acento}" data-arte="{arte}" data-cat="{cat}">
          <div class="prod-media" style="--tono:{tono}">
            <img class="foto" src="assets/fotos/prod-{pid}.jpg" alt="{alt}" loading="lazy" decoding="async" onerror="this.remove()">
            <img class="foto alterna" src="assets/fotos/prod-{pid}-2.jpg" alt="{alt2}" loading="lazy" decoding="async" onerror="this.remove()">
            <svg class="arte" viewBox="0 0 200 272" style="--acento:{acento}" role="img" aria-label="{nombre}"><use href="#{arte}"/></svg>
            {etiqueta}
            {boton}
          </div>{chips}
          <div class="prod-info">
            <h3>{nombre}</h3>
            <p class="prod-sub">{bajada}</p>
            <p class="prod-precio{pend}" data-precio-txt>{precio_txt}</p>
          </div>
          <div class="compra" role="group" aria-label="Tipo de compra de {nombre}">
            <button type="button" data-plan="unica" aria-pressed="true">Una vez</button>
            <button type="button" data-plan="susc" aria-pressed="false">Suscripción <span class="ahorro">−{desc}%</span></button>
          </div>
        </article>""".format(
            pid=pid, nombre=esc(nombre), bajada=esc(bajada),
            precio_num=precio if precio is not None else "",
            precio_txt=esc(precio_txt), pend="" if hay else " pendiente",
            variantes=html.escape(json.dumps(variantes, ensure_ascii=False), quote=True),
            tono=tono, acento=acento, arte=arte, cat=esc(cat),
            alt=esc(ALT.get(pid, nombre)), alt2=esc(ALT2.get(pid, "")),
            etiqueta=etiqueta, boton=boton, chips=chips, desc=SUSCRIPCION_DESC))
    return "\n".join(out)

ALT = {
 "colombia": "Bolsa de café de especialidad de Colombia de sepia coffee, tostado en Santiago",
 "matcha": "Lata celeste de 30 g de matcha en polvo de sepia coffee",
 "lata-edicion": "Lata de edición limitada de 200 g de café de sepia coffee",
 "kit-matcha": "Kit de matcha de sepia coffee con batidor de bambú",
 "kit-cafetero": "Kit cafetero de sepia coffee para preparar café de especialidad en casa",
 "musette": "Musette de tela de sepia coffee con el caminante",
 "polera": "Polera de algodón de sepia coffee con el caminante",
 "vaso": "Vaso reutilizable de sepia coffee con el caminante",
}
ALT2 = {
 "colombia": "Granos de café de Colombia tostados por sepia coffee",
 "matcha": "Matcha batido en un bowl, con la espuma formada",
 "lata-edicion": "La lata de edición limitada abierta, con el café dentro",
 "kit-matcha": "El kit de matcha con todas sus piezas sobre una mesa",
 "kit-cafetero": "El kit cafetero con todas sus piezas sobre una mesa",
 "musette": "La musette de sepia coffee colgada al hombro",
 "polera": "La polera de sepia coffee puesta",
 "vaso": "El vaso de sepia coffee servido con café",
}

# ================================================================== JSON-LD
def nodo_producto(p):
    pid, nombre, cat, arte, bajada, desc, opciones, variantes, etq, activo = p
    base = {
        "@id": SITIO + "/#producto-" + pid,
        "name": nombre,
        "description": desc,
        "category": cat,
        "brand": {"@id": SITIO + "/#marca"},
        "image": SITIO + "/assets/fotos/prod-" + pid + ".jpg",
    }

    def oferta(clave, precio):
        o = {
            "@type": "Offer",
            "url": SITIO + "/#producto-" + pid,
            "priceCurrency": "CLP",
            "price": str(precio),
            "availability": "https://schema.org/InStock",
            "itemCondition": "https://schema.org/NewCondition",
            "seller": {"@id": SITIO + "/#tienda"},
            "shippingDetails": {"@id": SITIO + "/#envio-gratis"},
            "hasMerchantReturnPolicy": {"@id": SITIO + "/#devoluciones"},
        }
        return o

    if opciones:
        d = dict(base)
        d["@type"] = "ProductGroup"
        d["productGroupID"] = "sepia-" + pid
        d["variesBy"] = [eje for eje, _ in opciones]
        variantes_nodo = []
        for clave, precio in variantes.items():
            partes = clave.split(" · ")
            v = {
                "@type": "Product",
                "@id": SITIO + "/#producto-" + pid + "-" + (
                    clave.lower().replace(" · ", "-").replace(" ", "")),
                "name": "%s — %s" % (nombre, clave),
                "sku": "sepia-%s-%s" % (pid, "-".join(
                    x.lower().replace(" ", "") for x in partes)),
                "image": base["image"],
            }
            for (eje, _), val in zip(opciones, partes):
                v.setdefault("additionalProperty", []).append({
                    "@type": "PropertyValue", "name": eje, "value": val})
            if precio is not None:
                v["offers"] = oferta(clave, precio)
            variantes_nodo.append(v)
        d["hasVariant"] = variantes_nodo
        return d

    d = dict(base)
    d["@type"] = "Product"
    d["sku"] = "sepia-" + pid
    precio = list(variantes.values())[0]
    if precio is not None:
        d["offers"] = oferta("", precio)
    return d

def main():
    productos = [nodo_producto(p) for p in PRODUCTOS]

    marca = {"@type": "Brand", "@id": SITIO + "/#marca", "name": "sepia coffee",
             "url": SITIO + "/", "logo": SITIO + "/assets/sepia/logo-principal.png",
             "slogan": "La primera cosa buena del día."}

    tienda = {
        "@type": ["Organization", "OnlineStore"], "@id": SITIO + "/#tienda",
        "name": "sepia coffee", "alternateName": "sepiacoffee.cl",
        "url": SITIO + "/",
        "logo": {"@type": "ImageObject",
                 "url": SITIO + "/assets/sepia/logo-principal.png"},
        "image": SITIO + "/assets/fotos/hero-1.jpg",
        "description": (
            "sepia coffee es una marca chilena de café de especialidad y matcha. "
            "Trabajamos un solo origen de café, Colombia, que tostamos en Santiago "
            "en lotes chicos y despachamos recién tostado a todo Chile. Vendemos "
            "café en grano y molido, matcha en polvo, kits y accesorios."),
        "slogan": "La primera cosa buena del día.",
        "brand": {"@id": SITIO + "/#marca"},
        "areaServed": {"@type": "Country", "name": "Chile"},
        "currenciesAccepted": "CLP",
        "paymentAccepted": "Webpay, Mercado Pago, Visa, Mastercard",
        "knowsLanguage": "es-CL",
        # Completar con los perfiles reales. Sin esto, un asistente no puede
        # cruzar la marca con Instagram ni con la ficha de Google.
        "sameAs": [],
        "hasOfferCatalog": {"@id": SITIO + "/#catalogo"},
    }

    catalogo = {
        "@type": "OfferCatalog", "@id": SITIO + "/#catalogo",
        "name": "Catálogo sepia coffee", "numberOfItems": len(productos),
        # Solo las categorías que hoy tienen algún producto activo: una
        # categoría vacía en el JSON-LD es ruido para el rastreador.
        "itemListElement": [
            {"@type": "OfferCatalog", "name": c,
             "itemListElement": [{"@type": "Offer", "itemOffered": {"@id": pr["@id"]}}
                                 for pr in productos if pr["category"] == c]}
            for c in CATEGORIAS
            if any(pr["category"] == c for pr in productos)],
    }

    envio = {
        "@type": "OfferShippingDetails", "@id": SITIO + "/#envio-gratis",
        "shippingRate": {"@type": "MonetaryAmount", "value": "0", "currency": "CLP"},
        "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "CL"},
        "description": "Envío gratis a todo Chile en compras sobre %s. Envío con "
                       "descuento sobre %s." % (clp(ENVIO_GRATIS), clp(ENVIO_REDUCIDO)),
    }

    devoluciones = {
        "@type": "MerchantReturnPolicy", "@id": SITIO + "/#devoluciones",
        "applicableCountry": "CL",
        "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
        "merchantReturnDays": 10,
        "returnMethod": "https://schema.org/ReturnByMail",
        "returnFees": "https://schema.org/FreeReturn",
        "description": "Derecho a retracto de 10 días corridos según la ley chilena "
                       "del consumidor para compras a distancia.",
    }

    sitio = {"@type": "WebSite", "@id": SITIO + "/#sitio", "url": SITIO + "/",
             "name": "sepia coffee", "inLanguage": "es-CL",
             "publisher": {"@id": SITIO + "/#tienda"}}

    # El servicio de eventos. «Barra de café para eventos en Santiago» es
    # justo el tipo de consulta que llega a un asistente, así que conviene
    # que haya algo que citar.
    servicio = {
        "@type": "Service",
        "@id": SITIO + "/#eventos",
        "name": "Barra de café y coctelería con espresso para eventos",
        "serviceType": "Barra de café para eventos",
        "description": (
            "Servicio de barra de café para eventos en Santiago: espresso, "
            "americano, capuccino y latte preparados al momento, con opción de "
            "iced coffee y de cold brew con cold foam. También barra de "
            "coctelería con espresso: espresso martini y carajillo. Se cotiza "
            "por número de invitados y horas de servicio."),
        "provider": {"@id": SITIO + "/#tienda"},
        "areaServed": {"@type": "City", "name": "Santiago",
                       "containedInPlace": {"@type": "Country", "name": "Chile"}},
        "availableChannel": {"@type": "ServiceChannel",
                             "serviceUrl": SITIO + "/#eventos",
                             "name": "Cotizador en línea"},
        "hasOfferCatalog": {
            "@type": "OfferCatalog", "name": "Servicios para eventos",
            "itemListElement": [
                {"@type": "Offer", "itemOffered":
                 {"@type": "Service", "name": nom, "description": des}}
                for nom, des in [
                    ("Barra de café", "Espresso, americano, capuccino y latte "
                     "preparados al momento por nuestros baristas."),
                    ("Agregado: iced coffee", "Café helado servido en vaso alto."),
                    ("Agregado: cold brew con cold foam",
                     "Café extraído en frío, con espuma fría encima."),
                    ("Espresso martini y carajillo",
                     "Coctelería con espresso recién extraído."),
                ]]},
    }

    grafo = {"@context": "https://schema.org",
             "@graph": [tienda, marca, catalogo, envio, devoluciones, sitio,
                        servicio] + productos}
    io.open(os.path.join(AQUI, "ld-tienda.json"), "w", encoding="utf-8").write(
        json.dumps(grafo, ensure_ascii=False, indent=2))

    # ---- feed ----
    feed = {
        "marca": "sepia coffee", "sitio": SITIO + "/", "moneda": "CLP", "pais": "CL",
        "actualizado": datetime.date.today().isoformat(),
        "envio": {"gratis_sobre": ENVIO_GRATIS, "con_descuento_sobre": ENVIO_REDUCIDO,
                  "cobertura": "todo Chile"},
        "suscripcion": {"descuento_porcentaje": SUSCRIPCION_DESC,
                        "nota": "aplica a todos los productos"},
        "productos": [],
    }
    for pid, nombre, cat, arte, bajada, desc, opciones, variantes, etq, activo in TODOS:
        feed["productos"].append({
            "id": "sepia-" + pid, "nombre": nombre, "categoria": cat,
            "bajada": bajada, "descripcion": desc,
            "opciones": [{"nombre": e, "valores": v} for e, v in opciones],
            "variantes": [{"variante": k or None, "precio": v,
                           "precio_confirmado": v is not None}
                          for k, v in variantes.items()],
            "activo": activo,
            "url": SITIO + "/#producto-" + pid,
            "imagen": SITIO + "/assets/fotos/prod-" + pid + ".jpg",
        })
    io.open(os.path.join(RAIZ, "catalogo.json"), "w", encoding="utf-8").write(
        json.dumps(feed, ensure_ascii=False, indent=2) + "\n")

    io.open(os.path.join(AQUI, "parte_productos.html"), "w",
            encoding="utf-8").write(tarjetas() + "\n")

    sin = sum(1 for p in PRODUCTOS for v in p[7].values() if v is None)
    print("ld-tienda.json  %d nodos" % len(grafo["@graph"]))
    print("catalogo.json   %d productos, %d variantes" %
          (len(PRODUCTOS), sum(len(p[7]) for p in PRODUCTOS)))
    print("tarjetas        %d" % len(PRODUCTOS))
    if sin:
        print("\n  AVISO: %d variantes sin precio. Esas tarjetas muestran "
              "«Precio por confirmar»,\n  no se pueden agregar al carrito y "
              "salen del JSON-LD sin Offer." % sin)

main()
