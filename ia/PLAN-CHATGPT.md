# Plan para optimizar la presencia de sepia coffee en ChatGPT

Los 10 puntos del plan, con lo que ya quedó hecho en el código y lo que
depende de vos. Lo marcado **(tuyo)** no lo puedo hacer yo: necesita tus
cuentas, tus datos reales o tus fotos.

---

## 1 · Registra tu web — *parcial*

Hecho:
- `sitemap.xml` en la raíz, listo para enviar.
- `robots.txt` con la línea `Sitemap:` apuntando ahí.
- Datos estructurados de producto, reseñas y preguntas en JSON-LD dentro del
  `<head>` de `index.html`.
- Etiquetas de verificación vacías ya puestas en el `<head>`:
  `google-site-verification` y `msvalidate.01`.

**(tuyo)**
1. Entra a [Google Search Console](https://search.google.com/search-console),
   agrega `sepiacoffee.cl`, copia el código de verificación y pegalo en el
   `content=""` de la etiqueta `google-site-verification` del `<head>`.
2. Lo mismo en [Bing Webmaster Tools](https://www.bing.com/webmasters) con
   `msvalidate.01`. **Bing importa tanto como Google acá**: es el índice que
   alimenta las búsquedas de ChatGPT.
3. En las dos consolas, envía `https://sepiacoffee.cl/sitemap.xml`.

---

## 2 · Conecta tu catálogo — *parcial*

Hecho:
- `catalogo.json` en la raíz: feed de los 12 productos con precio, formato,
  descripción, imagen y disponibilidad.
- Cada producto también está como `Product` + `Offer` en el JSON-LD, que es
  lo que leen los rastreadores sin pedir permiso.

**(tuyo)**
- Cuando la tienda esté en Shopify, activa el canal de **Google & YouTube**
  (sincroniza el catálogo a Google Merchant Center solo). OpenAI toma datos
  de productos de ahí y del schema.org de la página.
- El catálogo ya es el real: café Colombia (250 g y 1 kg, en grano o
  molido), matcha (lata de 30 g y sobre de 80 g), lata de edición
  limitada, kit matcha, kit cafetero, musette, polera y vaso.
  **Faltan los precios**: mientras no estén, las variantes salen del
  JSON-LD sin Offer, que es lo correcto.

---

## 3 · Revisa el acceso — *hecho*

`robots.txt` permite de forma explícita a **GPTBot**, **OAI-SearchBot**,
**ChatGPT-User**, **PerplexityBot**, **ClaudeBot**, **Google-Extended**,
**Applebot-Extended**, **Bingbot** y el resto.

> Ojo con Shopify: el `robots.txt` lo genera el tema. Si pasas la tienda a
> Shopify, hay que replicar esto en `robots.txt.liquid`. Está explicado en
> `shopify/README.md`.

---

## 4 · Mejora tu estructura — *hecho*

- Un solo `<h1>`, jerarquía de `<h2>`/`<h3>` correcta por sección.
- Categorías explícitas en el JSON-LD: Café en grano, Cold brew, Matcha,
  Packs, Accesorios.
- Descripciones largas y concretas por producto en el JSON-LD (las tarjetas
  solo muestran una línea; el dato completo está en los datos estructurados).
- `meta description`, Open Graph y Twitter Card completos, con imagen.
- `hreflang` es-CL y `canonical`.
- Cada tarjeta de producto tiene `id="producto-…"`, así cada producto tiene
  una URL propia que se puede citar y enlazar.

---

## 5 · Publica contenido útil — *hecho*

Hecho, dos secciones:

- **«Lo que más nos preguntan»**: 10 respuestas reales (preparación del matcha,
  elección de café, guardado, cafeína, envíos, suscripción, devoluciones).
- **«Cómo se prepara»**: 6 recetas con medidas exactas — matcha latte helado,
  matcha caliente, V60, prensa francesa, cold brew en casa y cold brew tónica.
  Cada una es un `schema.org/Recipe` con ingredientes y pasos numerados, y
  enlaza con el producto que usa.

Las recetas son lo que más rinde para esto. Cuando alguien le pregunta a
ChatGPT «cómo preparo matcha para que no quede amargo», la respuesta ya está
escrita, medida y atribuida a la marca.

**(tuyo)** Lo que sigue se gana con constancia:
- Una nota por origen cada vez que entre un lote nuevo.
- Más recetas, sobre todo estacionales.

Cada una puede ser una página propia con su `Recipe` o su `Article`.

---

## 6 · Habla como tu cliente — *hecho*

> **Corregido:** todo el sitio estaba escrito en voseo rioplatense
> («querés», «tenés», «sumate»). Eso es argentino, no chileno, y para un
> cliente de Santiago suena a texto importado: es exactamente el tipo de
> detalle que hace que una página «se note». Son 352 reemplazos en toda la
> copia, incluyendo la sección de Shopify, el GPT y estos documentos.

Las preguntas de la sección están escritas tal como las hace alguien real
—«¿cuánto matcha uso por taza?», «¿qué café me conviene si recién
empiezo?»— y no como las escribiría una marca («Nuestra propuesta de valor
en matcha»). Eso es lo que permite que un asistente las empareje con lo que
el usuario escribió y cite la respuesta.

---

## 7 · Amplía tu presencia digital — *(tuyo)*

Lo único que puedo hacer desde el código es dejar el enganche listo: el
campo `sameAs` del JSON-LD está vacío, esperando tus perfiles.

**(tuyo)** Pásame y los agrego:
- el link de Instagram
- el link de TikTok
- el link de tu ficha de Google (Perfil de Empresa)
- cualquier nota de prensa o mención donde salga la marca

Ese campo es lo que le permite a un asistente entender que el Instagram, la
ficha de Google y la tienda son la misma marca, en vez de tres cosas sueltas.

---

## 8 · Crea un GPT de tu marca — *listo para pegar*

Está todo escrito en **`ia/gpt-sepia-coffee.md`**: nombre, descripción,
instrucciones completas, arranques de conversación y qué archivos subir.

**(tuyo)** Pegarlo en chatgpt.com → Explorar GPT → Crear. Necesita Plus y
toma unos diez minutos.

---

## 9 · Optimiza tus imágenes — *hecho en el código, falta el contenido*

Hecho:
- Texto alternativo descriptivo y con contexto en todas las imágenes. Antes
  el `alt` repetía el nombre del producto, que ya estaba en el título; ahora
  dice qué se ve («Lata celeste de 80 g de matcha ceremonial orgánico de
  sepia coffee»).
- Nombres de archivo descriptivos, listados en `assets/fotos/LEEME.md`.
- `loading="lazy"` y `decoding="async"` donde corresponde.
- La imagen del hero declarada como `og:image` con su propio `alt`.

**(tuyo)** Faltan las fotos. Hoy hay 4 de 39, y la página dibuja una
ilustración donde falta una. Las que más urgen: la bolsa de café, la lata de
matcha, la botella de cold brew y el local.

---

## 10 · Crea comparativas útiles — *hecho*

La sección **«¿Cuál me conviene?»** es una tabla real (`<table>`, no
imágenes) que compara los seis productos principales por qué son, cómo se
preparan, para quién son y cuánto cuestan.

Es el formato que un asistente cita casi textual, porque la respuesta a
«¿cuál me conviene?» ya viene resuelta en una fila.

---

# Lo que sigue dependiendo de vos

| Qué | Dónde se usa |
|---|---|
| Códigos de Search Console y Bing | `<head>` de `index.html` |
| Links de Instagram, TikTok y ficha de Google | `sameAs` del JSON-LD y el pie |
| Puntaje, cantidad y texto de las reseñas de Google | constante `GOOGLE` del script |
| Precios de las 12 variantes | `ia/datos.py`, y regenerar |

| Fotos de producto y del local | `assets/fotos/` |
| Confirmar la política de devoluciones | FAQ y `MerchantReturnPolicy` |

Nada de esto está inventado en el sitio: donde falta el dato, la sección se
esconde sola (las reseñas) o se dibuja la ilustración (las fotos).

---

## Cómo comprobar que quedó bien

| Qué | Dónde |
|---|---|
| Datos estructurados | https://search.google.com/test/rich-results |
| Que el JSON-LD no tenga errores | https://validator.schema.org |
| Que los bots puedan entrar | `curl https://sepiacoffee.cl/robots.txt` |
| Que ChatGPT te encuentre | preguntale «¿dónde compro matcha ceremonial en Chile?» una vez indexado |

El indexado no es inmediato: entre que envías el sitemap y que apareces en
las respuestas suelen pasar varias semanas.
