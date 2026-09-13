# Sepia Coffee Co — secciones para Shopify

Hay dos portadas distintas. Elegí una.

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
4. Borrá el contenido de ejemplo, pegá el archivo entero y guardá
5. En **Personalizar**, agregá la sección y subila al tope

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
9. Bloque editorial
10. Boletín
11. Pie con columnas plegables

Cada módulo se apaga dejando su título vacío o quitando sus bloques.

### Cabecera y pie
Vienen **apagados** por defecto. Tu tema ya trae los suyos y si encendés estos
quedan dos. Enciéndelos solo si vas a ocultar los del tema.

### Mega menú
Cada ítem del menú es un bloque. En **Submenú** va una línea por enlace,
con el formato `Nombre | /ruta`. Con dos o más líneas se arma el mega menú de
tres columnas más la tarjeta destacada. Con el campo vacío queda un enlace simple.

### Catálogo real
Elegí una colección en cada carrusel. Estas etiquetas de producto completan la ficha:

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

## Antes de publicar, cambiá estos datos

Vienen con valores de ejemplo:

- Las valoraciones y la cantidad de reseñas de cada producto
- Las cuatro tarjetas de testimonios
- El «4,9 · 1.284 reseñas» de la cinta de ventajas
- El monto del envío gratis del anuncio
- Enlaces de redes sociales y páginas legales

---

## Vista previa sin Shopify

En la raíz del repositorio:

- `index.html` es la portada v2 en HTML plano
- `v1-editorial.html` es la v1

Las dos sirven para mostrar y aprobar el diseño, o para publicar en GitHub Pages
mientras la tienda se termina. Ahí el carrito es una demostración local.
Las fotos van en `assets/fotos/`, con los nombres que lista `assets/fotos/LEEME.md`.
