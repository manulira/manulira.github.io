# Plan para optimizar la presencia de sepia coffee en ChatGPT

Los 10 puntos del plan, con lo que ya quedó hecho en el código y lo que
depende de vos. Lo marcado **(tuyo)** no lo puedo hacer yo: necesita tus
cuentas, tus datos reales o tus fotos.

---

## 1 · Registrá tu web — *parcial*

Hecho:
- `sitemap.xml` en la raíz, listo para enviar.
- `robots.txt` con la línea `Sitemap:` apuntando ahí.
- Datos estructurados de producto, reseñas y preguntas en JSON-LD dentro del
  `<head>` de `index.html`.
- Etiquetas de verificación vacías ya puestas en el `<head>`:
  `google-site-verification` y `msvalidate.01`.

**(tuyo)**
1. Entrá a [Google Search Console](https://search.google.com/search-console),
   agregá `sepiacoffee.cl`, copiá el código de verificación y pegalo en el
   `content=""` de la etiqueta `google-site-verification` del `<head>`.
2. Lo mismo en [Bing Webmaster Tools](https://www.bing.com/webmasters) con
   `msvalidate.01`. **Bing importa tanto como Google acá**: es el índice que
   alimenta las búsquedas de ChatGPT.
3. En las dos consolas, enviá `https://sepiacoffee.cl/sitemap.xml`.

---

## 2 · Conectá tu catálogo — *parcial*

Hecho:
- `catalogo.json` en la raíz: feed de los 12 productos con precio, formato,
  descripción, imagen y disponibilidad.
- Cada producto también está como `Product` + `Offer` en el JSON-LD, que es
  lo que leen los rastreadores sin pedir permiso.

**(tuyo)**
- Cuando la tienda esté en Shopify, activá el canal de **Google & YouTube**
  (sincroniza el catálogo a Google Merchant Center solo). OpenAI toma datos
  de productos de ahí y del schema.org de la página.
- Revisá que los precios de `catalogo.json` sean los reales antes de
  publicar. Hoy son los que veníamos usando de ejemplo.

---

## 3 · Revisá el acceso — *hecho*

`robots.txt` permite de forma explícita a **GPTBot**, **OAI-SearchBot**,
**ChatGPT-User**, **PerplexityBot**, **ClaudeBot**, **Google-Extended**,
**Applebot-Extended**, **Bingbot** y el resto.

> Ojo con Shopify: el `robots.txt` lo genera el tema. Si pasás la tienda a
> Shopify, hay que replicar esto en `robots.txt.liquid`. Está explicado en
> `shopify/README.md`.

---

## 4 · Mejorá tu estructura — *hecho*

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

## 5 · Publicá contenido útil — *empezado*

Hecho: la sección **«Lo que más nos preguntan»** con 10 respuestas reales
(preparación del matcha, elección de café, guardado, cafeína, envíos,
suscripción, devoluciones).

**(tuyo)** Esto se gana con constancia. Lo que más rinde para una marca de
café:
- Una guía de preparación por método (V60, prensa, espresso).
- Una nota por origen cuando entre un lote nuevo.
- La receta de matcha latte helado.

Cada una es una página nueva, con su propio `FAQPage` o `HowTo`.

---

## 6 · Hablá como tu cliente — *hecho*

Las preguntas de la sección están escritas tal como las hace alguien real
—«¿cuánto matcha uso por taza?», «¿qué café me conviene si recién
empiezo?»— y no como las escribiría una marca («Nuestra propuesta de valor
en matcha»). Eso es lo que permite que un asistente las empareje con lo que
el usuario escribió y cite la respuesta.

---

## 7 · Ampliá tu presencia digital — *(tuyo)*

Lo único que puedo hacer desde el código es dejar el enganche listo: el
campo `sameAs` del JSON-LD está vacío, esperando tus perfiles.

**(tuyo)** Pasame y los agrego:
- el link de Instagram
- el link de TikTok
- el link de tu ficha de Google (Perfil de Empresa)
- cualquier nota de prensa o mención donde salga la marca

Ese campo es lo que le permite a un asistente entender que el Instagram, la
ficha de Google y la tienda son la misma marca, en vez de tres cosas sueltas.

---

## 8 · Creá un GPT de tu marca — *listo para pegar*

Está todo escrito en **`ia/gpt-sepia-coffee.md`**: nombre, descripción,
instrucciones completas, arranques de conversación y qué archivos subir.

**(tuyo)** Pegarlo en chatgpt.com → Explorar GPT → Crear. Necesita Plus y
toma unos diez minutos.

---

## 9 · Optimizá tus imágenes — *hecho en el código, falta el contenido*

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

## 10 · Creá comparativas útiles — *hecho*

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
| Precios reales de los 12 productos | `ia/datos.py` y las tarjetas |
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

El indexado no es inmediato: entre que enviás el sitemap y que aparecés en
las respuestas suelen pasar varias semanas.
