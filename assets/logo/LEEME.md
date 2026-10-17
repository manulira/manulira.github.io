# Logo de Sepia Coffee

El archivo que llegó venía con las letras crema sobre un rectángulo azul
`#526EA0`. Acá está sin fondo, en los dos colores que hacen falta:

| Archivo | Tinta | Para qué |
|---|---|---|
| `sepia-coffee-azul.png` | Azul principal `#526EA0` | Encabezado blanco, página de tarjeta de regalo, cualquier fondo claro |
| `sepia-coffee-crema.png` | Crema cálido `#E7E5D9` | Bloque Nosotros y cualquier fondo oscuro |

El azul del rectángulo original **es** el azul de marca: la paleta se sacó
después de ese mismo archivo. Hasta octubre de 2026 el wordmark se estaba
usando en `#3F5363`, de la paleta anterior, y quedó corregido.

## Cuidado con la resolución

El original mide 374 × 82 px y, ya recortado, el wordmark queda en 321 × 58.
En el encabezado se muestra a 36 px de alto, así que en una pantalla normal
se ve bien, pero en una retina queda algo blando: pide 72 px de alto y solo
hay 58. Si aparece el vectorial (SVG, AI o PDF), conviene reemplazarlo.

Se arman con `ia/marcas/a_color.py`: el alfa sale del brillo, así que el
fondo se va a transparente y la tinta queda del color que se le pase. Si lo
único que cambia es el color y el recorte ya está hecho, va más directo
`ia/marcas/retinta.py`, que respeta el alfa y solo repinta.

Los dos archivos están además subidos a Shopify con el mismo nombre, así que
el tema los referencia por `shopify://shop_images/`. Para cambiarles el color
hay que repintarlos acá y reemplazar el archivo en Shopify conservando el
nombre: si se sube uno nuevo, el encabezado sigue apuntando al viejo.
