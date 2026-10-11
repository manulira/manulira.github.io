# -*- coding: utf-8 -*-
"""Las preguntas frecuentes, agrupadas.

El criterio: estas son las preguntas que la gente le hace a ChatGPT sobre
matcha y café, no las que una marca querría que le hicieran. Cada respuesta
que da pie a una compra cierra con una oferta, como hace Matcha Addict en su
blog: cuerpo educativo, cierre comercial.

Registro: chileno, tuteo, cercano pero formal. Nada de jerga ni emojis.

Donde la respuesta honesta no favorece la venta, va la respuesta honesta.
Un asistente no cita afirmaciones de salud sin respaldo, así que exagerar
acá es contraproducente además de deshonesto.
"""

# grupo, pregunta, [párrafos], (texto del enlace, ancla) o None
GRUPOS = [
 ("matcha", "Matcha", "Lo que más nos preguntan sobre el matcha."),
 ("cafe", "Café", "Grano, molienda, tueste y todo lo que viene después."),
 ("pedido", "Tu pedido", "Envíos, suscripción y devoluciones."),
]

PREGUNTAS = [
 # ------------------------------------------------------------ MATCHA
 ("matcha", "¿El matcha tiene más cafeína que el café?",
  ["No. Una taza de matcha de 2 gramos tiene alrededor de 60 mg de cafeína, "
   "y una taza de café de filtro de 240 ml anda en los 95 mg. El matcha está "
   "más cerca de un espresso que de un café largo.",
   "Lo que cambia no es tanto la cantidad como la forma en que llega. El "
   "matcha trae L-teanina, un aminoácido del té verde al que se atribuye una "
   "subida más pareja y sin el bajón de media mañana. Por eso mucha gente lo "
   "usa para reemplazar el segundo café del día, no el primero.",
   "La cifra exacta varía según la cosecha y cuánto polvo uses, así que "
   "tómala como referencia."],
  ("Ver el matcha", "producto-matcha")),

 ("matcha", "¿Por qué mi matcha sabe amargo o a pasto?",
  ["Casi siempre es una de tres cosas, en este orden:",
   "<b>El agua estaba muy caliente.</b> Sobre 80 °C el polvo se quema y "
   "aparece el amargor. Si no tienes termómetro, hierve y deja reposar dos "
   "minutos fuera del fuego.",
   "<b>Es matcha culinario, no ceremonial.</b> El culinario viene de cosechas "
   "posteriores y es naturalmente más áspero. Sirve para repostería, donde el "
   "azúcar lo compensa, pero no para tomarlo solo.",
   "<b>Está viejo o mal guardado.</b> El matcha se oxida con la luz, el calor "
   "y el aire. Si el verde se fue apagando hacia un tono oliva, ya perdió."],
  ("Ver el matcha", "producto-matcha")),

 ("matcha", "¿Puedo tomar matcha todos los días?",
  ["Sí. Una o dos tazas al día es lo habitual y equivale, en cafeína, a uno o "
   "dos espressos.",
   "Si estás embarazada, amamantando, tomas medicamentos o tienes indicación "
   "médica de limitar la cafeína, conversa con tu médico antes. No somos "
   "quienes para dar ese consejo."],
  None),

 ("matcha", "¿El matcha sirve para bajar de peso?",
  ["Por sí solo, no. No hay evidencia de que tomar matcha haga bajar de peso, "
   "y cualquier marca que te diga lo contrario te está vendiendo humo.",
   "Lo que sí pasa, y no es menor: un matcha sin azúcar reemplaza bien a un "
   "café con leche azucarado o a una bebida. Ahí el cambio es real, pero es "
   "por lo que dejas de tomar, no por el matcha."],
  None),

 ("matcha", "¿Qué leche va mejor con el matcha?",
  ["La de avena, con diferencia. Es la que mejor espuma y la que menos tapa "
   "el sabor del matcha. Si la consigues en versión barista, mejor todavía.",
   "La entera funciona bien y deja una textura más cremosa. La de almendra es "
   "la más liviana, pero también la que más opaca el matcha. La de soya tiende "
   "a cortarse si el matcha está muy caliente."],
  None),

 ("matcha", "¿Necesito batidor de bambú o puedo usar otra cosa?",
  ["El batidor de bambú (chasen) es lo que mejor funciona: las cañas finas "
   "deshacen los grumos y levantan espuma de una forma que una cuchara no "
   "logra.",
   "Si todavía no tienes uno, la alternativa que mejor resulta es un frasco "
   "con tapa: pones el matcha tamizado y el agua, cierras y agitas fuerte "
   "quince segundos. Un mini espumador eléctrico también sirve.",
   "Lo que no funciona es revolver con cuchara. Vas a tener grumos."],
  ("Ver el Kit matcha, con batidor incluido", "producto-kit-matcha")),

 ("matcha", "¿Cuánto dura el matcha una vez abierto?",
  ["Entre cuatro y seis semanas en su mejor momento. No se echa a perder "
   "después, pero el color se apaga y el sabor pierde dulzor.",
   "Guárdalo cerrado, en un lugar fresco y oscuro, lejos del horno. Si vives "
   "en una casa calurosa, el refrigerador sirve, pero sácalo y déjalo llegar "
   "a temperatura ambiente antes de abrirlo: si lo abres frío, se condensa "
   "humedad adentro y eso sí lo arruina."],
  None),

 ("matcha", "¿Cuál es la diferencia entre matcha ceremonial y culinario?",
  ["El ceremonial se hace con las hojas más jóvenes de la primera cosecha. "
   "Queda verde intenso, de textura sedosa y con dulzor natural, pensado para "
   "tomarlo solo con agua o con leche.",
   "El culinario viene de cosechas posteriores. Es más áspero y más barato, y "
   "está hecho para repostería o mezclas donde el sabor queda tapado.",
   "Un detalle que conviene saber: «ceremonial» no es una categoría regulada, "
   "así que cualquiera puede escribirlo en una lata. Lo que sí se nota es el "
   "color, la finura del polvo y si el productor dice de dónde viene."],
  ("Ver el matcha", "producto-matcha")),

 # ------------------------------------------------------------- CAFÉ
 ("cafe", "¿Qué diferencia hay entre café de especialidad y el del supermercado?",
  ["Tres cosas, y ninguna tiene que ver con el precio en sí:",
   "<b>Trazabilidad.</b> En especialidad se sabe de qué finca viene el lote, "
   "quién lo produjo y cómo se procesó. En el café industrial eso se pierde "
   "en la mezcla.",
   "<b>Frescura.</b> El café muere lento desde que sale del tostador. Una "
   "bolsa de supermercado puede llevar meses envasada; nosotros tostamos en "
   "lotes chicos y despachamos recién tostado.",
   "<b>Tueste.</b> El café industrial se tuesta oscuro de forma pareja para "
   "que todos los lotes sepan igual. En especialidad el tueste se ajusta al "
   "grano para que se note de dónde viene."],
  ("Ver los cafés", "cafes")),

 ("cafe", "¿Qué molienda uso para cada método?",
  ["De más gruesa a más fina:",
   "<b>Prensa francesa:</b> gruesa, como sal de mar. "
   "<b>Filtro y V60:</b> media, como arena de playa. "
   "<b>Cafetera italiana:</b> media-fina. "
   "<b>Espresso:</b> fina, como azúcar flor.",
   "Si el café sale aguado y rápido, muele más fino. Si sale amargo y demora "
   "demasiado, muele más grueso. Esa es toda la regla."],
  ("Ver los cafés", "cafes")),

 ("cafe", "¿Me conviene comprarlo en grano o molido?",
  ["En grano, si tienes molinillo. El café molido pierde la mayor parte del "
   "aroma en los primeros días, por mucho que lo guardes bien: la superficie "
   "expuesta al aire se multiplica apenas lo mueles.",
   "Si no tienes molinillo, un molido para tu método rinde perfectamente bien "
   "durante una o dos semanas. No te compliques: es mejor tomar buen café "
   "molido que no tomarlo."],
  None),

 ("cafe", "¿Cómo guardo el café para que no se pase?",
  ["Envase hermético, lugar fresco y oscuro, lejos del horno y del sol.",
   "En el refrigerador no. La humedad y los olores lo arruinan más rápido que "
   "el aire, y cada vez que lo sacas se condensa agua en el grano.",
   "Un café tostado rinde bien unas cuatro semanas desde la fecha de tueste. "
   "Por eso la fecha que importa en la bolsa es esa, no la de vencimiento."],
  None),

 ("cafe", "¿Tueste claro u oscuro?",
  ["El tueste claro conserva más del carácter del origen: más acidez, más "
   "notas florales o frutales. El oscuro borra parte de eso y aporta cuerpo, "
   "chocolate y amargor.",
   "Ninguno es mejor. Si vienes de tomar café de supermercado, el claro te va "
   "a parecer ácido al principio; vale la pena darle tres o cuatro tazas antes "
   "de decidir."],
  ("Comparar los cafés", "comparar")),

 ("cafe", "¿Qué formato me conviene si recién empiezo?",
  ["Los 250 g molidos para tu método. Es la cantidad que se toma en dos o tres "
   "semanas, que es justo el tiempo en que el café está en su mejor momento, y "
   "el molido te ahorra comprar molinillo mientras decides.",
   "El kilo conviene cuando ya sabes que este café te gusta, o si en la casa se "
   "toma más de una taza al día. Si vas a comprar el kilo, pídelo en grano: a "
   "ese volumen la diferencia de frescura se nota."],
  ("Ver el Colombia", "producto-colombia")),

 ("cafe", "¿Por qué tienen un solo café?",
  ["Porque preferimos hacer uno bien antes que cinco a medias. Trabajamos un "
   "origen de Colombia, lo tostamos nosotros y ajustamos el tueste a ese grano "
   "en particular.",
   "Tener una sola referencia también significa que el lote rota rápido: lo que "
   "te llega es café recién tostado, no una bolsa que llevaba meses esperando "
   "en una bodega."],
  ("Ver el Colombia", "producto-colombia")),

 # ----------------------------------------------------------- PEDIDO
 ("pedido", "¿Hacen envíos a todo Chile? ¿Cuánto cuesta?",
  ["Sí, despachamos a todo Chile. Sobre $50.000 el envío es gratis. Bajo ese "
   "monto el valor depende de la comuna y lo ves antes de pagar."],
  None),

 ("pedido", "¿Cómo funciona la suscripción?",
  ["Eliges el producto, marcas «Suscripción» en vez de «Una vez» y queda con "
   "15% de descuento en cada entrega. La pausas o la cancelas cuando quieras "
   "desde tu cuenta, sin llamar a nadie.",
   "Es la forma más barata de mantener café fresco en la casa, porque llega "
   "recién tostado en vez de quedarse semanas en la despensa."],
  ("Ver los kits", "packs")),

 ("pedido", "¿Puedo devolver un pedido?",
  ["Si el pedido llegó dañado o no es lo que pediste, lo reponemos.",
   "Por la ley del consumidor, en las compras a distancia tienes además 10 "
   "días corridos de derecho a retracto, siempre que el producto esté sin "
   "abrir."],
  None),

 ("pedido", "¿Tuestan ustedes el café?",
  ["Sí. Compramos lotes chicos de fincas que podemos nombrar, los tostamos en "
   "Santiago y los despachamos recién tostados.",
   "Por eso no tenemos stock de todo el año: cuando se termina un lote, entra "
   "otro. Es la contra de tostar en lotes chicos, y la asumimos."],
  None),
]
