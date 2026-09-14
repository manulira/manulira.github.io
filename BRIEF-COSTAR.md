# Brief COSTAR — Sitio web sepia coffee

Documento de definición previa al desarrollo. Modelo COSTAR: Contexto, Objetivo, Estilo, Tono, Audiencia, Respuesta.

---

## C — Contexto

sepia coffee es una tostaduría de café de especialidad en Santiago de Chile. Posicionamiento: lujo accesible con estética editorial y calidez latinoamericana. La referencia de calidad entregada por el cliente es **cervezaloa.cl**, un e-commerce chileno construido sobre Shopify con catálogo, packs armables, editorial de marca y footer completo de soporte.

El dominio de destino es **sepiacoffee.cl** y la tienda vivirá sobre **Shopify**, por lo que el entregable debe poder subirse al tema sin depender de archivos externos ni de un build.

La identidad ya existe: logotipo en tres versiones, paleta cerrada de cinco colores, tipografía serif editorial más sans geométrica espaciada, y una guía fotográfica inspirada en Blue Bottle Coffee con más textura y temperatura.

## O — Objetivo

Una homepage que convierta visitantes en dos acciones concretas, en este orden de prioridad:

1. **Compra de café en grano de 250 g** desde el catálogo.
2. **Alta en la suscripción recurrente**, que es el ingreso predecible del negocio.

Objetivos secundarios: comunicar trazabilidad de origen, educar sobre método de preparación para reducir la fricción del comprador nuevo, y capturar correo para remarketing.

Lo que **no** es objetivo: replicar la arquitectura de packs armables de la referencia. Loa vende cerveza por unidad y volumen; Sepia vende un ritual. Se toma de la referencia la solidez comercial y la estructura de secciones, no su energía visual.

## S — Estilo

Arquitectura de tienda headless llevada a un sitio estático y a una sección de
Shopify: módulos apilados, tarjetas de esquina muy redondeada, display grueso y
redondo, y bloques de color plano.

### Paleta bloqueada

Estos cinco colores son los únicos de marca. No se agregan otros.

| Uso | Color | HEX |
|---|---|---|
| Principal | Sky Blue · Celeste | `#C8D9E6` |
| Secundario | Beige | `#F5EFEB` |
| Logos y textos | Navy · Azul marino | `#2F4156` |
| Apoyo | Teal · Azul petróleo | `#567C8D` |
| Apoyo | White · Blanco | `#FFFFFF` |

Reglas de uso en la página:

- Fondo de página: Beige. Paneles y tarjetas claras: Blanco.
- Todo el texto y los bloques oscuros: Navy.
- Fondos de tarjeta de producto y de categoría: alternan Celeste, Blanco y Teal,
  en ese orden de frecuencia. El Teal va poco, para dar acento.
- Cinta de ventajas: fondo Teal, texto Blanco.
- Botones principales: Navy con texto Blanco. Secundarios: Blanco o contorno Navy.
- Todo gris, borde o texto secundario es Navy con transparencia, nunca un gris nuevo.

Las únicas excepciones son las rampas de sombra dentro de los dibujos de producto,
que son tintes y sombras del Beige para dar volumen cilíndrico a las bolsas y la
cerámica. No son colores de marca ni se usan como fondo de nada.

### Packaging

- **Lata de matcha:** fondo Sky Blue, textos y caminante en Navy. Está fijo en el
  dibujo, no cambia con el color de la ficha.
- **Bolsa de café:** cuerpo en Beige con la banda de etiqueta en Navy o Teal.
- **Botella de cold brew:** cuerpo en Navy o Teal, etiqueta en Beige.

### Logotipo

El caminante no es un adorno: es el punto de la «i» de *sepia*. El lockup se arma
con la cabeza sobre la letra y las piernas cruzando bajo la línea base, entre la
«p» y la «a». Existen tres versiones:

- **Lockup completo:** wordmark con el caminante integrado. Es el uso principal.
- **Wordmark solo:** cuando el espacio es muy angosto o el caminante ya aparece cerca.
- **Caminante solo:** como sello, en el envase, el patrón y la aplicación chica.

En el sitio, las piernas van en contorno y el pantalón toma el color del fondo con
la variable `--cam-fondo`. Para tamaños chicos hay una versión sólida, porque bajo
los 30 px el contorno desaparece.

### Tipografía

**Poppins** para el wordmark y todos los títulos, que es la geométrica del logotipo.
**DM Sans** para el texto corrido y las fichas técnicas. Las dos son libres, así que
sirven igual para la web y para impresión, sin licencia.

### Movimiento

Acompaña, no protagoniza. Apariciones suaves al hacer scroll, carruseles con
autoplay pausable, y todo se desactiva si el sistema pide movimiento reducido.

## T — Tono

Cálido pero contenido. Frases cortas, afirmativas, sin adjetivos apilados y sin signos de exclamación. Español chileno natural, sin inglés forzado.

- Correcto: *"Café de especialidad. Sin complicaciones."*
- Incorrecto: *"¡Descubre la magia de cada sorbo!"*

Se habla del café con precisión (origen, proceso, altura, tueste) sin convertir la página en una ficha técnica.

## A — Audiencia

**Primaria.** Adultos de 28 a 45 años en Santiago, ingreso medio-alto, que ya toman café de especialidad y compran en línea. Conocen el vocabulario básico y comparan orígenes. Buscan consistencia y frescura de tueste.

**Secundaria.** El que recién llega desde el café de supermercado. Necesita que le digan qué comprar y cómo prepararlo sin sentirse evaluado. Para esta audiencia existen el recomendador y la sección de método.

**Terciaria.** Cafeterías y oficinas que compran volumen, atendidas desde el plan mayor de suscripción y el contacto directo.

## R — Respuesta (entregable)

Tres archivos, listos para usar:

| Archivo | Qué es |
|---|---|
| `index.html` | La página completa, autocontenida. Sirve de vista previa y funciona publicada tal cual en GitHub Pages. |
| `shopify/sections/sepia-homepage.liquid` | La misma página como sección de Shopify, en un solo archivo, con panel de edición para cambiar textos, imágenes y colores sin tocar código. |
| `shopify/templates/index.json` | Plantilla opcional que arma la portada con la sección ya puesta. |

**Arquitectura de la homepage**, en orden de scroll:

1. Barra de anuncio y cabecera fija con carrito
2. Portada con titular, promesa y doble llamado a la acción
3. Cinta de atributos en movimiento
4. Catálogo de seis cafés, filtrable por método
5. Recomendador de tres preguntas
6. Suscripción con selector de frecuencia
7. Origen, con diagrama del cinturón cafetero
8. Método, con calculadora de proporción agua-café
9. Diario editorial
10. Cafetería y visita
11. Captura de correo
12. Footer completo

**Criterios de aceptación.** Carga sin dependencias externas más allá de las fuentes. Responde correctamente desde 360 px. Contraste accesible en toda la paleta. Navegable por teclado. Datos estructurados para buscadores. Todo texto, precio e imagen editable desde el panel de Shopify.
