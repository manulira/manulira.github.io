# sepia coffee — secciones para Shopify

Hay dos portadas distintas. Elige una.

| Archivo | Qué es |
|---|---|
| `sections/sepia-portada.liquid` | **Portada v2.** Arquitectura de tienda headless: hero en carrusel, cinta de ventajas, carruseles de producto, grilla de categorías, testimonios y bloque editorial. Trae mega menú y pie opcionales. |
| `sections/sepia-homepage.liquid` | **Portada v1.** Estilo editorial y sereno: catálogo filtrable, recomendador de tres preguntas, calculadora de proporción, diario. |
| `templates/index.json` | Plantilla opcional para la v1. |

Las dos son de un solo archivo, sin dependencias, y el CSS de cada una está acotado
a su propio contenedor, así que no se pisan entre ellas ni con el tema.

---

## Subirlas

1. **Tienda online → Temas → ··· → Editar código**
2. **Secciones → Agregar una sección nueva**
3. Ponele de nombre `sepia-portada` (o `sepia-homepage` para la v1)
4. Borra el contenido de ejemplo, pega el archivo entero y guarda
5. En **Personalizar**, agrega la sección y subila al tope

---

## Portada v2, en detalle

### Módulos, en orden
1. Barra de anuncio
2. Cabecera con mega menú
3. Hero en carrusel con autoplay
4. Cinta de ventajas en movimiento
5. Carrusel de destacados
6. Grilla de categorías
7. Carrusel de packs
8. Testimonios
9. Guía comparativa
10. Recetas
11. Bloque editorial
12. Preguntas frecuentes
13. Boletín
14. Pie con columnas plegables

Cada módulo se apaga dejando su título vacío o quitando sus bloques.

### Cabecera y pie
Vienen **apagados** por defecto. Tu tema ya trae los suyos y si enciendes estos
quedan dos. Enciéndelos solo si vas a ocultar los del tema.

### Mega menú
Cada ítem del menú es un bloque. En **Submenú** va una línea por enlace,
con el formato `Nombre | /ruta`. Con dos o más líneas se arma el mega menú de
tres columnas más la tarjeta destacada. Con el campo vacío queda un enlace simple.

### Catálogo real
Elige una colección en cada carrusel. Estas etiquetas de producto completan la ficha:

| Etiqueta | Qué hace |
|---|---|
| `sub:Blend de casa · 250 g` | Línea bajo el nombre |
| `tono:#F7D9C4` | Color de fondo de la tarjeta |
| `acento:#8B4A3C` | Color del envase dibujado |
| `arte:bolsa` | `bolsa`, `botella`, `tarro`, `taza`, `caja` o `batidor` |
| `etq:Más vendido` | Etiqueta de la esquina |
| `etqc:rojo` | Color de la etiqueta: `rojo` o `lima` |
| `muestra:#2F7D4F` | Una por cada color disponible |
| `rating:4.9` y `resenas:412` | Valoración mostrada |

Si el producto tiene fotos se usan las dos primeras: la segunda aparece al pasar
el mouse. Si no tiene, se dibuja el envase con el color de `acento:`.
Sin colección elegida se muestran productos de ejemplo.

### Carrito
Usa el carrito de Shopify. «Agregar» va contra `/cart/add.js` sin recargar y
actualiza el contador. Si el navegador no lo soporta, el formulario se envía
a `/cart/add` como siempre.

---

## Que ChatGPT te encuentre

Los puntos del plan que están resueltos en la sección. El plan completo, con
lo que falta hacer fuera del código, está en `ia/PLAN-CHATGPT.md`.

### Datos estructurados de la tienda
Ajuste **«Datos estructurados de la tienda»**. Publica un `Organization` +
`OnlineStore` armado con los datos reales de tu Shopify: nombre, dirección,
correo, teléfono, moneda. No hay nada que escribir dos veces.

Lo único que sí tienes que cargar es **«Perfiles de la marca»**: un enlace por
línea, con tu Instagram, tu TikTok, tu ficha de Google y tu GPT. Ese campo
(`sameAs`) es lo que le permite a un asistente entender que todo eso es la
misma marca y no cuatro cosas sueltas.

> Apagalo si tu tema ya publica un `Organization` propio. Dos se pisan.

Shopify ya publica el `Product` de cada ficha, así que eso no hay que tocarlo.

### Guía comparativa
Bloques **«Fila de la comparativa»**. Es una tabla de «cuál me conviene»: qué
es cada producto, cómo se prepara, para quién y cuánto cuesta.

Si en la fila eliges un producto del catálogo, toma su nombre y su precio
reales y se actualizan solos. Si no, escribes el nombre y el precio a mano.

En el teléfono la tabla se apila en tarjetas, pero sigue siendo una `<table>`
de verdad: eso es justo lo que leen los rastreadores.

### Preguntas frecuentes
Bloques **«Pregunta frecuente»**. Cada uno sale en la página y además en el
`FAQPage` de los datos estructurados, que es el formato que un asistente cita.

Escribe la pregunta **como la hace un cliente**: «¿cuánto matcha uso por
taza?», no «Dosificación del matcha ceremonial». La idea es que coincida con
lo que la persona efectivamente escribió en el chat.

### Recetas
Bloques **«Receta»**. Título, minutos, rinde, ingredientes (uno por línea),
pasos (uno por línea) y un dato al pie. Si eliges un producto, la receta queda
enlazada con su ficha.

Cada una se publica además como `schema.org/Recipe`. Es el contenido que más
rinde: cuando alguien le pregunta a un asistente «cómo preparo matcha para que
no quede amargo», la respuesta ya está medida y atribuida a la marca.

El preset trae seis recetas listas.

### robots.txt
`templates/robots.txt.liquid`. En Shopify el `robots.txt` lo genera el tema, no
es un archivo que puedas subir. Sin esta plantilla quedan las reglas por
defecto y no hay garantía de que GPTBot y los demás puedan entrar.

1. Templates → Agregar una plantilla nueva → **robots.txt**
2. Borrar lo que venga, pegar el archivo entero
3. Comprobar en `https://tu-tienda.cl/robots.txt`

Mantiene las reglas por defecto de Shopify (que ya esconden carrito y checkout)
y suma de forma explícita los rastreadores de IA.

### Lo que no se puede hacer desde acá
Registrar la tienda en [Google Search Console](https://search.google.com/search-console)
y en [Bing Webmaster Tools](https://www.bing.com/webmasters), y enviar el
sitemap que Shopify genera solo en `/sitemap.xml`. **Bing importa tanto como
Google**: es el índice que alimenta las búsquedas de ChatGPT.

---

## Antes de publicar, cambia estos datos

Vienen con valores de ejemplo:

- Las valoraciones y la cantidad de reseñas de cada producto
- Las cuatro tarjetas de testimonios
- El «4,9 · 1.284 reseñas» de la cinta de ventajas
- El monto del envío gratis del anuncio
- Enlaces de redes sociales y páginas legales
- Los textos de ejemplo de la comparativa y de las preguntas frecuentes
- El campo «Perfiles de la marca», que viene vacío

---

## Vista previa sin Shopify

En la raíz del repositorio:

- `index.html` es la portada v2 en HTML plano
- `v1-editorial.html` es la v1

Las dos sirven para mostrar y aprobar el diseño, o para publicar en GitHub Pages
mientras la tienda se termina. Ahí el carrito es una demostración local.
Las fotos van en `assets/fotos/`, con los nombres que lista `assets/fotos/LEEME.md`.
