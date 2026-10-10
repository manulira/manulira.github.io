# -*- coding: utf-8 -*-
"""Genera el bloque JSON-LD de index.html y el archivo catalogo.json."""
import io, json, os, sys, datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, "..")
from datos import PRODUCTOS, SITIO, ENVIO_GRATIS, ENVIO_REDUCIDO

def oferta(pid, precio, antes):
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

def producto(p):
    pid, nombre, precio, antes, cat, desc, tam, _arte = p
    d = {
        "@type": "Product",
        "@id": SITIO + "/#producto-" + pid,
        "name": nombre,
        "sku": "sepia-" + pid,
        "description": desc,
        "category": cat,
        "brand": {"@id": SITIO + "/#marca"},
        "image": SITIO + "/assets/fotos/prod-" + pid + ".jpg",
        "size": tam,
        "offers": oferta(pid, precio, antes),
    }
    return d

def main():
    productos = [producto(p) for p in PRODUCTOS]

    marca = {
        "@type": "Brand",
        "@id": SITIO + "/#marca",
        "name": "sepia coffee",
        "url": SITIO + "/",
        "logo": SITIO + "/assets/sepia/logo-principal.png",
        "slogan": "La primera cosa buena del día.",
    }

    # Organization, no LocalBusiness: todavia no tengo la direccion real
    # de la cafeteria, y no la voy a inventar. Ver IA-CHECKLIST.md.
    tienda = {
        "@type": ["Organization", "OnlineStore"],
        "@id": SITIO + "/#tienda",
        "name": "sepia coffee",
        "alternateName": "sepiacoffee.cl",
        "url": SITIO + "/",
        "logo": {
            "@type": "ImageObject",
            "url": SITIO + "/assets/sepia/logo-principal.png",
        },
        "image": SITIO + "/assets/fotos/hero-1.jpg",
        "description": (
            "sepia coffee es una marca chilena de café de especialidad y matcha. "
            "Compramos lotes chicos de fincas que podemos nombrar, los tostamos en "
            "Santiago y los despachamos recién tostados a todo Chile. Vendemos café "
            "en grano, cold brew en botella, matcha ceremonial, packs y accesorios."
        ),
        "slogan": "La primera cosa buena del día.",
        "brand": {"@id": SITIO + "/#marca"},
        "areaServed": {"@type": "Country", "name": "Chile"},
        "currenciesAccepted": "CLP",
        "paymentAccepted": "Webpay, Mercado Pago, Visa, Mastercard",
        "knowsLanguage": "es-CL",
        # Completá sameAs con tus perfiles reales: sin esto los asistentes
        # no pueden cruzar la marca con Instagram ni con la ficha de Google.
        "sameAs": [],
        "hasOfferCatalog": {"@id": SITIO + "/#catalogo"},
    }

    catalogo = {
        "@type": "OfferCatalog",
        "@id": SITIO + "/#catalogo",
        "name": "Catálogo sepia coffee",
        "numberOfItems": len(productos),
        "itemListElement": [
            {
                "@type": "OfferCatalog",
                "name": cat,
                "itemListElement": [
                    {"@type": "Offer", "itemOffered": {"@id": pr["@id"]}}
                    for pr in productos if pr["category"] == cat
                ],
            }
            for cat in ["Café en grano", "Cold brew", "Matcha", "Packs", "Accesorios"]
        ],
    }

    envio = {
        "@type": "OfferShippingDetails",
        "@id": SITIO + "/#envio-gratis",
        "shippingRate": {
            "@type": "MonetaryAmount", "value": "0", "currency": "CLP",
        },
        "shippingDestination": {
            "@type": "DefinedRegion", "addressCountry": "CL",
        },
        "description": (
            "Envío gratis a todo Chile en compras sobre $%s. Envío con descuento "
            "sobre $%s." % (format(ENVIO_GRATIS, ",d").replace(",", "."),
                            format(ENVIO_REDUCIDO, ",d").replace(",", "."))
        ),
    }

    devoluciones = {
        "@type": "MerchantReturnPolicy",
        "@id": SITIO + "/#devoluciones",
        "applicableCountry": "CL",
        "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
        "merchantReturnDays": 10,
        "returnMethod": "https://schema.org/ReturnByMail",
        "returnFees": "https://schema.org/FreeReturn",
        "description": (
            "Derecho a retracto de 10 días corridos según la ley chilena del "
            "consumidor para compras a distancia."
        ),
    }

    sitio = {
        "@type": "WebSite",
        "@id": SITIO + "/#sitio",
        "url": SITIO + "/",
        "name": "sepia coffee",
        "inLanguage": "es-CL",
        "publisher": {"@id": SITIO + "/#tienda"},
    }

    grafo = {"@context": "https://schema.org", "@graph":
             [tienda, marca, catalogo, envio, devoluciones, sitio] + productos}

    # ---- JSON-LD para pegar en el <head> ----
    ld = json.dumps(grafo, ensure_ascii=False, indent=2)
    io.open(os.path.join(AQUI, "ld-tienda.json"), "w", encoding="utf-8").write(ld)

    # ---- catalogo.json: feed plano, mas facil de leer para una maquina ----
    feed = {
        "marca": "sepia coffee",
        "sitio": SITIO + "/",
        "moneda": "CLP",
        "pais": "CL",
        "actualizado": datetime.date.today().isoformat(),
        "envio": {
            "gratis_sobre": ENVIO_GRATIS,
            "con_descuento_sobre": ENVIO_REDUCIDO,
            "cobertura": "todo Chile",
        },
        "suscripcion": {"descuento_porcentaje": 15,
                        "nota": "aplica a todos los productos"},
        "productos": [
            {
                "id": "sepia-" + p[0],
                "nombre": p[1],
                "categoria": p[4],
                "precio": p[2],
                "precio_antes": p[3],
                "formato": p[6],
                "descripcion": p[5],
                "url": SITIO + "/#producto-" + p[0],
                "imagen": SITIO + "/assets/fotos/prod-" + p[0] + ".jpg",
                "disponible": True,
            } for p in PRODUCTOS
        ],
    }
    io.open(os.path.join(RAIZ, "catalogo.json"), "w", encoding="utf-8").write(
        json.dumps(feed, ensure_ascii=False, indent=2) + "\n")

    print("ld-tienda.json  %d bytes, %d nodos" % (len(ld), len(grafo["@graph"])))
    print("catalogo.json   %d productos" % len(feed["productos"]))

main()
