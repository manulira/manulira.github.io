# -*- coding: utf-8 -*-
"""Genera, desde py:
   · parte_productos.html  — las tarjetas de producto
   · ld-tienda.json        — el JSON-LD del <head>
   · ../catalogo.json      — el feed legible por máquina
"""
import io, json, os, html, datetime
from datos import (PRODUCTOS as TODOS, CATEGORIAS, SITIO, ENVIO_GRATIS,
                   ENVIO_RM, ENVIO_REGIONES, SUSCRIPCION_DESC,
                   MESA_CAFETERO, MESA_MARTINI, BARISTAS_POR_MESA_MARTINI,
                   EVENTO_MIN_PERSONAS, EVENTO_MAX_PERSONAS,
                   EVENTO_DESCUENTO, EVENTO_ABONO, COMPARAR)

# Solo los activos salen a la página y al JSON-LD. Los inactivos se
# quedan en py y aparecen en catalogo.json marcados como tales.
PRODUCTOS = [p for p in TODOS if p[9]]

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, "..")

# El color de fondo de cada tarjeta, por producto y no por posición: así
# agregar un café no le corre el color a todos los que vienen detrás. Los
# dos cafés llevan el color de su propia bolsa.
TONOS = {
 "colombia": "#E69B4A", "bolivia": "#DA9296", "matcha": "#FFFFFF",
 "lata-edicion": "#C8D9E6", "coldbrew-lata": "#FFFFFF",
 "kit-matcha": "#567C8D", "kit-cafetero": "#FFFFFF",
 "musette": "#C8D9E6", "polera": "#FFFFFF", "vaso": "#C8D9E6",
}
ACENTOS = {
 "colombia": "#2F4156", "bolivia": "#2F4156", "matcha": "#567C8D",
 "lata-edicion": "#2F4156", "coldbrew-lata": "#567C8D",
 "kit-matcha": "#F5EFEB", "kit-cafetero": "#2F4156",
 "musette": "#567C8D", "polera": "#567C8D", "vaso": "#2F4156",
}
TONO_POR_DEFECTO, ACENTO_POR_DEFECTO = "#FFFFFF", "#2F4156"

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
# La página tiene dos carruseles y un producto va en uno o en el otro,
# nunca en los dos: repetirlo duplica el id y rompe los enlaces #producto-x.
CARRUSELES = [
    ("cafes", ["Café en grano", "Matcha", "Cold brew"]),
    ("packs", ["Kits", "Accesorios"]),
]


def tarjetas(lista=None):
    out = []
    for i, p in enumerate(PRODUCTOS if lista is None else lista):
        pid, nombre, cat, arte, bajada, desc, opciones, variantes, etq, activo = p
        tono = TONOS.get(pid, TONO_POR_DEFECTO)
        acento = ACENTOS.get(pid, ACENTO_POR_DEFECTO)
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

def comparativa():
    """La tabla «¿Cuál me conviene?», con el precio sacado de las variantes."""
    filas = []
    for p in PRODUCTOS:
        pid, nombre, cat, arte, bajada, desc, opciones, variantes, etq, activo = p
        if pid not in COMPARAR:
            continue
        que, como, elige = COMPARAR[pid]
        precios = [v for v in variantes.values() if v is not None]
        if not precios:
            precio = "Por confirmar"
        elif len(set(precios)) == 1:
            precio = clp(precios[0])
        else:
            precio = "Desde " + clp(min(precios))
        pildora = ('<span class="pildora">%s</span>' % esc(etq)) if etq else ""
        filas.append(
            '            <tr>\n'
            '              <th scope="row">%s %s</th>\n'
            '              <td data-etq="Qué es">%s</td>\n'
            '              <td data-etq="Cómo se prepara">%s</td>\n'
            '              <td data-etq="Elígelo si…">%s</td>\n'
            '              <td data-etq="Precio" class="precio">%s</td>\n'
            '            </tr>'
            % (esc(nombre), pildora, esc(que), esc(como), esc(elige), precio))
    return "\n".join(filas)


ALT = {
 "colombia": "Bolsa blanca de café de especialidad Colombia de Sepia Coffee, con la etiqueta naranja y el sello holográfico",
 "bolivia": "Bolsa blanca de café de especialidad Bolivia de Sepia Coffee, con la etiqueta rosada y el sello holográfico",
 "matcha": "Lata celeste de 30 g de matcha en polvo de Sepia Coffee",
 "lata-edicion": "Lata de edición limitada de 200 g de café de Sepia Coffee",
 "kit-matcha": "Kit de matcha de Sepia Coffee con batidor de bambú",
 "kit-cafetero": "Kit cafetero de Sepia Coffee para preparar café de especialidad en casa",
 "musette": "Musette de tela de Sepia Coffee con el caminante",
 "polera": "Polera de algodón de Sepia Coffee con el caminante",
 "vaso": "Vaso reutilizable de Sepia Coffee con el caminante",
}
ALT2 = {
 "colombia": "La bolsa de Colombia sobre un tronco de madera, con granos de café al lado",
 "bolivia": "La bolsa de Bolivia sobre un tronco de madera, con granos de café al lado",
 "matcha": "Matcha batido en un bowl, con la espuma formada",
 "lata-edicion": "La lata de edición limitada abierta, con el café dentro",
 "kit-matcha": "El kit de matcha con todas sus piezas sobre una mesa",
 "kit-cafetero": "El kit cafetero con todas sus piezas sobre una mesa",
 "musette": "La musette de Sepia Coffee colgada al hombro",
 "polera": "La polera de Sepia Coffee puesta",
 "vaso": "El vaso de Sepia Coffee servido con café",
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

    marca = {"@type": "Brand", "@id": SITIO + "/#marca", "name": "Sepia Coffee",
             "url": SITIO + "/", "logo": SITIO + "/assets/sepia/logo-principal.png"}

    tienda = {
        "@type": ["Organization", "OnlineStore"], "@id": SITIO + "/#tienda",
        "name": "Sepia Coffee", "alternateName": "sepiacoffee.cl",
        "url": SITIO + "/",
        "logo": {"@type": "ImageObject",
                 "url": SITIO + "/assets/sepia/logo-principal.png"},
        "image": SITIO + "/assets/fotos/hero-1.jpg",
        "description": (
            "Sepia Coffee es una marca chilena de café de especialidad y matcha. "
            "Trabajamos dos orígenes de café, Colombia y Bolivia, que tostamos en "
            "Santiago en lotes chicos y despachamos recién tostados a todo Chile. "
            "Vendemos "
            "café en grano y molido, matcha en polvo, kits y accesorios."),
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
        "name": "Catálogo Sepia Coffee", "numberOfItems": len(productos),
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
        "description": "Envío gratis a todo Chile en compras sobre %s. Bajo ese "
                       "monto, %s en la Región Metropolitana y %s en regiones."
                       % (clp(ENVIO_GRATIS), clp(ENVIO_RM), clp(ENVIO_REGIONES)),
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
             "name": "Sepia Coffee", "inLanguage": "es-CL",
             "publisher": {"@id": SITIO + "/#tienda"}}

    # El servicio de eventos. «Barra de café para eventos en Santiago» o
    # «cuánto cuesta una barra de espresso martini para un matrimonio» son
    # justo el tipo de consulta que llega a un asistente, así que conviene
    # que haya precios reales que citar, no una invitación a escribir.
    #
    # Son dos mesas distintas, con tablas distintas, y así van acá: una
    # mesa cafetero que cambia según qué sirve, y una mesa martini que
    # cambia según cuántas mesas se montan.
    def oferta(nombre, descripcion, tabla):
        horas = sorted(tabla)
        return {
            "@type": "Offer",
            "itemOffered": {"@type": "Service", "name": nombre,
                            "description": descripcion},
            "priceSpecification": [
                {"@type": "UnitPriceSpecification",
                 "price": tabla[h], "priceCurrency": "CLP",
                 "valueAddedTaxIncluded": True,
                 "referenceQuantity": {"@type": "QuantitativeValue",
                                       "value": h, "unitCode": "HUR"},
                 "name": "%d horas de servicio" % h}
                for h in horas],
            "eligibleQuantity": {"@type": "QuantitativeValue",
                                 "minValue": EVENTO_MIN_PERSONAS,
                                 "maxValue": EVENTO_MAX_PERSONAS,
                                 "unitText": "personas"},
            "areaServed": {"@type": "City", "name": "Santiago"},
        }

    ofertas = [
        oferta("Mesa cafetero · " + nom,
               "Mesa con máquina espresso a la vista, con %d %s. %s"
               % (bar, "barista" if bar == 1 else "baristas", det), tabla)
        for nom, bar, tabla, det in [
            (MESA_CAFETERO["cafe"][0], MESA_CAFETERO["cafe"][1],
             MESA_CAFETERO["cafe"][2],
             "Espresso, americano, capuccino y latte preparados al momento."),
            (MESA_CAFETERO["cocteles"][0], MESA_CAFETERO["cocteles"][1],
             MESA_CAFETERO["cocteles"][2],
             "Espresso martini y carajillo, con espresso recién extraído."),
            (MESA_CAFETERO["ambos"][0], MESA_CAFETERO["ambos"][1],
             MESA_CAFETERO["ambos"][2],
             "Café de especialidad, espresso martini y carajillo desde la misma barra."),
        ]]
    ofertas += [
        oferta("Mesa martini · %d %s" % (n, "mesa" if n == 1 else "mesas"),
               "Barra de alto flujo, sin máquina espresso. Sirve espresso "
               "martini y carajillo, siempre los dos. Van %d baristas."
               % (n * BARISTAS_POR_MESA_MARTINI),
               MESA_MARTINI[n])
        for n in sorted(MESA_MARTINI)]

    servicio = {
        "@type": "Service",
        "@id": SITIO + "/#eventos",
        "name": "Barra de café y coctelería con espresso para eventos",
        "serviceType": "Barra de café para eventos",
        "description": (
            "Barras de café y de coctelería con espresso para matrimonios, "
            "eventos corporativos y celebraciones privadas en Santiago. Hay "
            "dos mesas, con precios distintos. La mesa cafetero lleva máquina "
            "espresso y se cobra según qué sirva: solo café, solo espresso "
            "martini y carajillo, o las dos cartas. La mesa martini es una "
            "barra de alto flujo sin máquina espresso, sirve siempre espresso "
            "martini y carajillo juntos, y se cobra según cuántas mesas se "
            "monten. Mínimo 2 horas. Los valores incluyen IVA y no incluyen "
            "copas. Bajo %d personas se aplica %d%% de descuento. El viático "
            "depende de la comuna y va aparte."
            % (EVENTO_MIN_PERSONAS, EVENTO_DESCUENTO)),
        "provider": {"@id": SITIO + "/#tienda"},
        "areaServed": {"@type": "City", "name": "Santiago",
                       "containedInPlace": {"@type": "Country", "name": "Chile"}},
        "termsOfService": (
            "Mínimo 2 horas de servicio. Se pueden sumar horas hasta 48 horas "
            "antes del evento. Para reservar la fecha se paga el %d%% y el "
            "resto la semana del evento. Necesitamos corriente a menos de 10 "
            "metros del stand." % EVENTO_ABONO),
        "availableChannel": {"@type": "ServiceChannel",
                             "serviceUrl": SITIO + "/#eventos",
                             "name": "Cotizador en línea"},
        "hasOfferCatalog": {
            "@type": "OfferCatalog", "name": "Mesas para eventos",
            "itemListElement": ofertas},
    }

    grafo = {"@context": "https://schema.org",
             "@graph": [tienda, marca, catalogo, envio, devoluciones, sitio,
                        servicio] + productos}
    io.open(os.path.join(AQUI, "ld-tienda.json"), "w", encoding="utf-8").write(
        json.dumps(grafo, ensure_ascii=False, indent=2))

    # ---- feed ----
    feed = {
        "marca": "Sepia Coffee", "sitio": SITIO + "/", "moneda": "CLP", "pais": "CL",
        "actualizado": datetime.date.today().isoformat(),
        "envio": {"gratis_sobre": ENVIO_GRATIS,
                  "region_metropolitana": ENVIO_RM, "regiones": ENVIO_REGIONES,
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

    io.open(os.path.join(AQUI, "parte_comparar.html"), "w",
            encoding="utf-8").write(comparativa() + "\n")

    for pista, cats in CARRUSELES:
        suyos = [p for p in PRODUCTOS if p[2] in cats]
        io.open(os.path.join(AQUI, "parte_productos_%s.html" % pista), "w",
                encoding="utf-8").write(tarjetas(suyos) + "\n")
        print("  carrusel %-6s %d tarjetas: %s"
              % (pista, len(suyos), ", ".join(x[1] for x in suyos)))

    sueltos = [p[1] for p in PRODUCTOS
               if not any(p[2] in c for _, c in CARRUSELES)]
    if sueltos:
        print("  AVISO: sin carrusel: " + ", ".join(sueltos))

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
