# Fotos del sitio

## Las seis que más cambian el sitio

Si vas a sacar pocas, sacá estas primero. Con estas seis la página deja de
verse como una plantilla:

**Ya cargadas** con la foto de los dos vasos que mandaste: `hero-1.jpg`,
`nosotros-1.jpg`, `cat-cafe.jpg` y `cat-matcha.jpg`. Cuando tengas fotos
propias para cada una, reemplazalas y listo.

| Orden | Archivo | Qué es |
|---|---|---|
| 1 | `hero-1.jpg` | Portada. Va en el panel derecho, conviene vertical 3:4 |
| 2 | `prod-cordillera.jpg` | El café principal |
| 3 | `prod-matcha-ceremonial.jpg` | La lata de matcha |
| 4 | `prod-cold-clasico.jpg` | La botella |
| 5 | `cafeteria.jpg` | El local, para el bloque editorial |
| 6 | `cat-cafe.jpg` | La ficha de categoría de café |

El resto puede esperar. Cada archivo que falte sigue mostrando la ilustración,
así que podés ir subiéndolas de a una sin que nada se rompa.

---


Dejá los archivos acá con estos nombres exactos y la página los toma sola.
**No hay que tocar código.** Si un archivo no está, esa posición muestra la
ilustración vectorial, así que el sitio nunca se ve roto ni con imágenes rotas.

## Portada

| Archivo | Medida | Qué va |
|---|---|---|
| `hero-1.jpg` | 2400 × 1200 | Foto ancha del primer slide. El texto va sobre la mitad izquierda, dejá esa zona despejada |
| `hero-2.jpg` | 2400 × 1200 | Lo mismo para el segundo slide |

## Productos

Dos fotos por producto. La segunda aparece al pasar el mouse por encima.
El nombre va después de `prod-`, igual que el identificador de la ficha.

| Producto | Archivos |
|---|---|
| Cordillera | `prod-cordillera.jpg` · `prod-cordillera-2.jpg` |
| Cold Brew Clásico | `prod-cold-clasico.jpg` · `prod-cold-clasico-2.jpg` |
| Matcha Ceremonial | `prod-matcha-ceremonial.jpg` · `prod-matcha-ceremonial-2.jpg` |
| Yirgacheffe | `prod-yirgacheffe.jpg` · `prod-yirgacheffe-2.jpg` |
| Matcha Coco | `prod-matcha-coco.jpg` · `prod-matcha-coco-2.jpg` |
| Taza de cerámica | `prod-taza-sepia.jpg` · `prod-taza-sepia-2.jpg` |
| Cold Brew Vainilla | `prod-cold-vainilla.jpg` · `prod-cold-vainilla-2.jpg` |
| Pack Descubrir | `prod-pack-descubrir.jpg` · `prod-pack-descubrir-2.jpg` |
| Pack Ritual | `prod-pack-ritual.jpg` · `prod-pack-ritual-2.jpg` |
| Pack Matcha | `prod-pack-matcha.jpg` · `prod-pack-matcha-2.jpg` |
| Pack Cold Brew | `prod-pack-coldbrew.jpg` · `prod-pack-coldbrew-2.jpg` |
| Pack Oficina | `prod-pack-oficina.jpg` · `prod-pack-oficina-2.jpg` |
| Pack Regalo | `prod-pack-regalo.jpg` · `prod-pack-regalo-2.jpg` |

Todas **cuadradas, 1000 × 1000**, con el mismo encuadre y el mismo fondo.
Si una se sale del patrón, la grilla se nota despareja enseguida.

## Categorías

Cuadradas, 800 × 800.

`cat-cafe.jpg` · `cat-coldbrew.jpg` · `cat-matcha.jpg` · `cat-packs.jpg` · `cat-accesorios.jpg`

## Mega menú

Apaisadas, 800 × 500. Son las tarjetas que aparecen a la derecha al desplegar el menú.

`mega-cafe.jpg` · `mega-coldbrew.jpg` · `mega-matcha.jpg` · `mega-packs.jpg`

## Bloque "Hecho en Santiago"

Verticales, 800 × 1060.

`nosotros-1.jpg` · `nosotros-2.jpg`

---

## Cómo sacarlas

- Fondo de un solo color plano, en alguno de los tonos de la paleta. Es lo que hace
  que las tarjetas se vean parejas.
- Producto centrado, con aire alrededor. Nada pegado al borde.
- Luz pareja, sombra corta debajo del producto. Sin sombras duras ni reflejos.
- La segunda foto de cada producto conviene que sea otro ángulo o el producto en uso,
  no la misma foto con otro recorte.

## Formato

- `.jpg` con calidad 80 a 85.
- Que ninguna pase de 400 KB. Las del hero pueden llegar a 600 KB por el ancho.
- También sirve `.webp`: cambiá la extensión en el nombre y ajustá el `src` en `index.html`.

## En Shopify es distinto

Ahí no se usa esta carpeta. Las fotos de producto se cargan en cada producto,
y las de portada, categorías y mega menú desde el panel de la sección.
