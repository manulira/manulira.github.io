# Logo de Sepia Coffee

El archivo que llegó venía con las letras crema sobre un rectángulo azul
`#526EA0`. Acá está sin fondo, en los dos colores que hacen falta:

| Archivo | Tinta | Para qué |
|---|---|---|
| `sepia-coffee-azul.png` | Azul principal `#3F5363` | Encabezado blanco, página de tarjeta de regalo, cualquier fondo claro |
| `sepia-coffee-crema.png` | Crema `#E8E2D7` | Bloque Nosotros y cualquier fondo oscuro |

El azul del archivo original (`#526EA0`) no es el de la paleta: el de marca
es `#3F5363`. Por eso el wordmark va en ese y no en el del rectángulo.

## Cuidado con la resolución

El original mide 374 × 82 px y, ya recortado, el wordmark queda en 321 × 58.
En el encabezado se muestra a 36 px de alto, así que en una pantalla normal
se ve bien, pero en una retina queda algo blando: pide 72 px de alto y solo
hay 58. Si aparece el vectorial (SVG, AI o PDF), conviene reemplazarlo.

Se arman con `ia/marcas/a_color.py`: el alfa sale del brillo, así que el
fondo se va a transparente y la tinta queda del color que se le pase.
