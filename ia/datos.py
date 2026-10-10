# -*- coding: utf-8 -*-
"""Fuente unica de verdad de los productos.
De aca salen el JSON-LD que va dentro de index.html y el archivo
catalogo.json. Asi no se pueden desincronizar."""

SITIO = "https://sepiacoffee.cl"

# id, nombre, precio, antes, categoria, descripcion, tamano
PRODUCTOS = [
    # ---- mas vendidos ----
    ("cordillera", "Cordillera", 9900, None, "Café en grano",
     "Nuestro blend de casa: la taza de todos los días. Dulce, de cuerpo medio y "
     "equilibrada, funciona igual de bien en filtro, en prensa francesa y en espresso. "
     "Tostada en Santiago en lotes chicos y despachada recién tostada.",
     "250 g", "i-bolsa"),
    ("cold-clasico", "Cold Brew Clásico", 7900, None, "Cold brew",
     "Café de especialidad extraído en frío, sin azúcar y sin "
     "endulzantes. Viene listo para tomar: lo sirves con hielo directo de la botella. "
     "Botella de 1 litro, rinde unos cuatro vasos.",
     "1 L", "i-botella"),
    ("matcha-ceremonial", "Matcha Ceremonial", 16900, None, "Matcha",
     "Matcha de grado ceremonial de primera cosecha. Es el grado más "
     "alto: color verde intenso, textura sedosa y sabor dulce sin amargor, pensado para "
     "tomarlo solo con agua o con leche. Orgánico.",
     "80 g", "i-tarro"),
    ("yirgacheffe", "Yirgacheffe", 13500, None, "Café en grano",
     "Café de origen de Yirgacheffe, Etiopía, proceso lavado. Es el más floral y ácido "
     "de la carta, ideal para métodos de filtro como V60 o Chemex si te gustan las tazas "
     "limpias y perfumadas.",
     "250 g", "i-bolsa"),
    ("matcha-coco", "Matcha Coco", 17900, None, "Matcha",
     "Matcha ceremonial mezclado con coco deshidratado. Edición de verano, más dulce y "
     "cremoso que el ceremonial puro: pensado para matcha latte helado.",
     "80 g", "i-tarro"),
    ("taza-sepia", "Taza de cerámica", 14900, None, "Accesorios",
     "Taza de cerámica esmaltada en mate con el caminante de sepia coffee.",
     "300 ml", "i-taza"),
    # ---- packs ----
    ("pack-descubrir", "Starter Pack", 29900, 35700, "Packs",
     "El pack para empezar: un poco de todo. Lleva café en grano, matcha y la taza de "
     "cerámica, así pruebas las tres cosas antes de decidir cuál repites. Es la forma más "
     "barata de conocer la marca.",
     "Café + matcha + taza", "i-caja"),
    ("pack-ritual", "Pack Ritual", 22900, 24800, "Packs",
     "Cordillera 250 g más la taza de cerámica. Para regalar o para armar el ritual de "
     "la mañana de una vez.",
     "Café + taza", "i-taza"),
    ("pack-matcha", "Pack Matcha", 28900, 31800, "Packs",
     "Matcha ceremonial 80 g más el batidor de bambú (chasen). Todo lo que hace falta "
     "para preparar matcha en casa como corresponde, sin grumos.",
     "Matcha + batidor", "i-batidor"),
    ("pack-coldbrew", "Pack Cold Brew", 28900, 31600, "Packs",
     "Cuatro botellas de 1 litro de cold brew, y eliges los sabores. Rinde unos "
     "dieciséis vasos: es el pack para tener la semana cubierta.",
     "4 × 1 L", "i-botella"),
    ("pack-oficina", "Pack Oficina", 54900, 62400, "Packs",
     "Un kilo de café en grano más dos tazas. Pensado para equipos chicos o para quien "
     "toma varias tazas al día y no quiere quedarse sin café.",
     "1 kg + 2 tazas", "i-caja"),
    ("pack-regalo", "Pack Regalo", 39900, None, "Packs",
     "Surtido de café, matcha y accesorios en una caja de madera, listo para entregar "
     "sin envolver nada.",
     "Caja de madera", "i-caja"),
]

ENVIO_REDUCIDO = 30000
ENVIO_GRATIS = 65000
