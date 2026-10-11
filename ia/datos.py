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
# opciones, variantes {clave: precio}, etiqueta, activo
#
# activo=False: el producto se queda guardado acá pero no sale en la página,
# ni en el JSON-LD, ni como disponible en el feed. Sirve para tener listo algo
# que todavía no se vende. Para activarlo, basta cambiarlo a True.
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
  "Más vendido", True),

 ("matcha", "Matcha", "Matcha", "i-tarro",
  "En lata o en sobre de recarga",
  "Matcha en polvo para batir en casa. La lata de 30 g es la de empezar y la "
  "que se ve bien en la repisa; el sobre de 80 g es la recarga, que sale más "
  "conveniente por gramo y genera menos envase.",
  [FORMATO_MATCHA],
  {"30 g en lata": None, "80 g en sobre": None},
  None, True),

 ("lata-edicion", "Lata edición limitada", "Café en grano", "i-lata-cafe",
  "200 g · mientras dure",
  "El mismo café de Colombia en lata de 200 g, con la gráfica de la edición. "
  "La lata sirve después para guardar el café del sobre, que es justamente "
  "para lo que está pensada. Cuando se acaba la tirada, no vuelve.",
  [],
  {"": None},
  "Edición limitada", True),

 ("coldbrew-lata", "Cold brew en lata", "Cold brew", "i-coldbrew-lata",
  "Listo para tomar",
  "Café de especialidad extraído en frío, sin azúcar y sin endulzantes, en "
  "lata. Viene listo: lo sirves con hielo y nada más. Para quien no tiene "
  "cafetera o quiere café frío sin prepararlo.",
  [],
  {"": None},
  None, False),   # <- guardado, todavía no se vende

 ("kit-matcha", "Kit matcha", "Kits", "i-batidor",
  "Todo para partir",
  "El kit para preparar matcha en casa como corresponde, sin grumos y sin "
  "comprar las cosas por separado.",
  [],
  {"": None},
  None, True),

 ("kit-cafetero", "Kit cafetero", "Kits", "i-caja",
  "Todo para partir",
  "El kit para quien recién se mete en el café de especialidad y no sabe por "
  "dónde empezar con el equipo.",
  [],
  {"": None},
  None, True),

 ("musette", "Musette", "Accesorios", "i-musette",
  "Bolso de hombro",
  "Musette de tela con el caminante de sepia coffee. Liviana, de un solo "
  "bolsillo y correa larga: la de salir a comprar el pan y volver con el "
  "café.",
  [],
  {"": None},
  None, True),

 ("polera", "Polera", "Accesorios", "i-polera",
  "Algodón, con el caminante",
  "Polera de algodón con el caminante de sepia coffee.",
  [],
  {"": None},
  None, True),

 ("vaso", "Vaso", "Accesorios", "i-taza",
  "Reutilizable",
  "Vaso reutilizable con el caminante de sepia coffee. Para el café de la "
  "mañana o para el matcha helado de la tarde.",
  [],
  {"": None},
  None, True),
]

# Categorías en el orden en que se muestran
CATEGORIAS = ["Café en grano", "Matcha", "Cold brew", "Kits", "Accesorios"]

ENVIO_REDUCIDO = 0   # ya no hay tramo intermedio
ENVIO_GRATIS = 50000
SUSCRIPCION_DESC = 15

# ---------------------------------------------------------------- EVENTOS
# Las dos tablas del catálogo, en pesos y con IVA incluido. Son dos mesas
# distintas y no se mezclan:
#
#  · MESA CAFETERO: la negra, con máquina espresso. Es una sola mesa, y lo
#    que cambia es qué sirve. Con la carta cambia el equipo.
#  · MESA MARTINI: la barra clara, sin máquina. Siempre sirve espresso
#    martini y carajillo juntos, nunca uno solo. Lo que cambia es cuántas
#    mesas se montan, y el precio de dos no es el doble de una.
#
# Las llaves son las horas de servicio. Mínimo 2 horas.

HORAS_EVENTO = [2, 3, 4, 5]

# carta -> (nombre, baristas, {horas: precio})
MESA_CAFETERO = {
 "cafe":     ("Solo café", 1,
              {2: 450000, 3: 600000, 4: 750000, 5: 890000}),
 "cocteles": ("Martini y carajillo", 2,
              {2: 660000, 3: 900000, 4: 1120000, 5: 1310000}),
 "ambos":    ("Las dos cartas", 3,
              {2: 850000, 3: 1150000, 4: 1430000, 5: 1690000}),
}

# número de mesas -> {horas: precio}
MESA_MARTINI = {
 1: {2: 590000,  3: 810000,  4: 1010000, 5: 1180000},
 2: {2: 950000,  3: 1290000, 4: 1610000, 5: 1890000},
 3: {2: 1240000, 3: 1690000, 4: 2110000, 5: 2480000},
}
BARISTAS_POR_MESA_MARTINI = 2

# Viáticos por zona, que van aparte del valor del servicio.
VIATICOS = [
 ("Lo Barnechea, Vitacura, Las Condes o Providencia", 30000),
 ("Otra comuna de Santiago", 60000),
 ("Buin o Pirque", 70000),
 ("Valparaíso o Rancagua", 120000),
]

EVENTO_MIN_PERSONAS = 80      # bajo esto se aplica el descuento
EVENTO_MAX_PERSONAS = 500     # sobre esto se cotiza aparte
EVENTO_DESCUENTO = 40         # % bajo 80 personas
EVENTO_ABONO = 50             # % para reservar la fecha
