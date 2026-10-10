# -*- coding: utf-8 -*-
"""Catálogo real de sepia coffee. Fuente única de verdad.

De acá salen el JSON-LD de index.html y catalogo.json. Si cambia un precio
o entra un producto, se cambia acá y se vuelve a generar: así la página y
los datos estructurados no se pueden desincronizar (y que no coincidan
penaliza en Google).

PRECIOS: mientras `precio` sea None, la tarjeta muestra «Precio por
confirmar», no se puede agregar al carrito y el producto sale del JSON-LD
sin Offer. Es a propósito: una Offer sin precio es inválida, y publicar un
precio inventado es peor que no publicar ninguno.
"""

SITIO = "https://sepiacoffee.cl"

# ---------------------------------------------------------------------
# Opciones de variante. El primer valor es el que viene elegido.
# ---------------------------------------------------------------------
TAMANO_CAFE   = ("Formato", ["250 g", "1 kg"])
MOLIENDA      = ("Molienda", ["En grano", "Molido"])
FORMATO_MATCHA = ("Formato", ["30 g en lata", "80 g en sobre"])

# ---------------------------------------------------------------------
# id, nombre, categoría, arte, bajada, descripción larga,
# opciones, variantes {clave: precio}, etiqueta
#
# La clave de cada variante es la combinación de valores separada por ' · '
# en el mismo orden que `opciones`. Sin opciones, la clave es "".
# ---------------------------------------------------------------------
PRODUCTOS = [
 ("colombia", "Colombia", "Café en grano", "i-bolsa",
  "Nuestro único origen",
  "Café de especialidad de Colombia, tostado por nosotros en Santiago en "
  "lotes chicos y despachado recién tostado. Es el único café de la carta: "
  "preferimos hacer uno bien antes que cinco a medias. Lo eliges en grano o "
  "molido para tu método.",
  [TAMANO_CAFE, MOLIENDA],
  {"250 g · En grano": None, "250 g · Molido": None,
   "1 kg · En grano": None,  "1 kg · Molido": None},
  "Más vendido"),

 ("matcha", "Matcha", "Matcha", "i-tarro",
  "En lata o en sobre de recarga",
  "Matcha en polvo para batir en casa. La lata de 30 g es la de empezar y la "
  "que se ve bien en la repisa; el sobre de 80 g es la recarga, que sale más "
  "conveniente por gramo y genera menos envase.",
  [FORMATO_MATCHA],
  {"30 g en lata": None, "80 g en sobre": None},
  None),

 ("lata-edicion", "Lata edición limitada", "Café en grano", "i-lata-cafe",
  "200 g · mientras dure",
  "El mismo café de Colombia en lata de 200 g, con la gráfica de la edición. "
  "La lata sirve después para guardar el café del sobre, que es justamente "
  "para lo que está pensada. Cuando se acaba la tirada, no vuelve.",
  [],
  {"": None},
  "Edición limitada"),

 ("kit-matcha", "Kit matcha", "Kits", "i-batidor",
  "Todo para partir",
  "El kit para preparar matcha en casa como corresponde, sin grumos y sin "
  "comprar las cosas por separado.",
  [],
  {"": None},
  None),

 ("kit-cafetero", "Kit cafetero", "Kits", "i-caja",
  "Todo para partir",
  "El kit para quien recién se mete en el café de especialidad y no sabe por "
  "dónde empezar con el equipo.",
  [],
  {"": None},
  None),

 ("musette", "Musette", "Accesorios", "i-musette",
  "Bolso de hombro",
  "Musette de tela con el caminante de sepia coffee. Liviana, de un solo "
  "bolsillo y correa larga: la de salir a comprar el pan y volver con el "
  "café.",
  [],
  {"": None},
  None),

 ("polera", "Polera", "Accesorios", "i-polera",
  "Algodón, con el caminante",
  "Polera de algodón con el caminante de sepia coffee.",
  [],
  {"": None},
  None),

 ("vaso", "Vaso", "Accesorios", "i-taza",
  "Reutilizable",
  "Vaso reutilizable con el caminante de sepia coffee. Para el café de la "
  "mañana o para el matcha helado de la tarde.",
  [],
  {"": None},
  None),
]

# Categorías en el orden en que se muestran
CATEGORIAS = ["Café en grano", "Matcha", "Kits", "Accesorios"]

ENVIO_REDUCIDO = 30000
ENVIO_GRATIS = 65000
SUSCRIPCION_DESC = 15
