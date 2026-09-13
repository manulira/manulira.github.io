# Sepia Coffee Co — portada para Shopify

Dos archivos. Uno es la portada completa, el otro es opcional.

| Archivo | Para qué sirve |
|---|---|
| `sections/sepia-homepage.liquid` | La portada entera: estilos, contenido, comportamiento y panel de edición. Es el único archivo indispensable. |
| `templates/index.json` | Opcional. Deja la portada armada de una vez, sin tener que agregar la sección a mano. |

---

## Subirlo, paso a paso

1. En el panel de Shopify entrá a **Tienda online → Temas**.
2. En el tema donde vas a trabajar, abrí el menú **···** y elegí **Editar código**.
3. En la barra lateral buscá la carpeta **Secciones** y hacé clic en **Agregar una sección nueva**.
4. Ponele de nombre `sepia-homepage` y confirmá. Shopify crea el archivo con contenido de ejemplo.
5. Seleccioná todo ese contenido de ejemplo, borralo, y pegá el contenido completo de `sections/sepia-homepage.liquid`.
6. **Guardar**.
7. Volvé a **Personalizar**, entrá a la portada, tocá **Agregar sección** y elegí **Sepia — Portada**.
8. Arrastrala hasta arriba de todo y guardá.

Si además querés la plantilla lista: en **Plantillas** abrí `index.json`, reemplazá su contenido por el de `templates/index.json` y guardá. Eso deja la portada armada con los diez bloques por defecto ya cargados. Ojo que esto **reemplaza** lo que la portada tenga hoy, así que copiá el contenido actual a un lado antes, por si querés volver atrás.

---

## Conectar tu catálogo real

La sección arranca con seis cafés de ejemplo dibujados en vector. Para mostrar tus productos de verdad:

1. En el panel de la sección, en **Catálogo**, elegí la colección.
2. En cada producto, agregá estas etiquetas (Shopify las llama *tags*):

| Etiqueta | Qué hace | Ejemplo |
|---|---|---|
| `origen:` | Línea gris sobre el nombre | `origen:Colombia · Proceso honey` |
| `nota:` | Una por cada nota de cata | `nota:Caramelo` |
| `tueste:` | Nivel del 1 al 5, pinta los puntos | `tueste:2` |
| `metodo:` | Alimenta los filtros de arriba | `metodo:filtrado` |
| `perfil:` | Alimenta el recomendador | `perfil:dulce` |
| `acento:` | Color de la banda del envase dibujado | `acento:#A2604A` |

Valores que entiende `metodo:` → `filtrado`, `espresso`, `descafeinado`. Un producto puede llevar varias.
Valores que entiende `perfil:` → `frutal`, `dulce`, `equilibrado`. Una sola por producto.

Si un producto tiene foto, se usa la foto. Si no, se dibuja el envase con el color de `acento:`.
Si no ponés etiquetas, la ficha igual funciona: toma el tipo de producto como origen y asume tueste medio.

---

## Qué se edita desde el panel, sin tocar código

Todo el texto visible, los colores de acento, las dos fotos, y qué secciones se muestran.

- **Barra de anuncio** — tres mensajes. Apagala si tu tema ya tiene una.
- **Portada** — epígrafe, titular en dos líneas, bajada, dos botones, tres datos y tres fotos: la principal y las dos chicas que van en círculo.
- **Cinta** — las frases que corren, separadas por coma.
- **Catálogo** — títulos, colección, cuántos productos, filtros sí o no.
- **Recomendador** — se puede apagar entero.
- **Suscripción** — hasta cuatro planes, cada uno un bloque. El descuento por frecuencia se calcula solo sobre el precio base que cargues.
- **Origen** — textos y hasta cinco valores, cada uno un bloque.
- **Método** — hasta seis métodos, cada uno un bloque con proporción, molienda, agua, tiempo y pasos.
- **Diario** — elegí un blog y toma las tres notas más recientes.
- **Cafetería** — horario, dirección, correo y foto del local.
- **Boletín** — usa el formulario de clientes de Shopify, los correos entran a tu lista.
- **Extras** — número de WhatsApp para el botón flotante.

---

## Cómo se lleva con tu tema

- **No pisa los estilos del tema.** Todo el CSS está acotado a `.sepia-home` y las animaciones llevan prefijo propio.
- **No trae cabecera ni pie.** Esos los sigue poniendo tu tema, así el menú y el carrito siguen siendo los de siempre.
- **El carrito es el de Shopify.** «Agregar» usa la API de carrito sin recargar la página. Si el navegador no lo soporta, el formulario se envía a `/cart/add` como toda la vida.
- **Funciona sin JavaScript**, con menos adornos: se ve todo el contenido y se puede comprar.
- **Respeta «reducir movimiento»** del sistema operativo.
- Probada con productos reales y con los de ejemplo, sin errores de consola y sin desbordes horizontales desde 360 px.

---

## Antes de publicar, revisá estos datos

Vienen cargados con valores de ejemplo. Cambialos por los tuyos:

- Dirección y horario de la cafetería
- Correo de contacto (`hola@sepiacoffee.cl`)
- Número de WhatsApp
- El monto del envío gratis que menciona la barra de anuncio
- Los precios base de los tres planes de suscripción
- Los porcentajes de descuento por frecuencia, si querés otros: están en el marcado de la sección, en los atributos `data-desc` de los botones **Semanal**, **Cada 15 días** y **Mensual**.

---

## Vista previa sin Shopify

En la versión HTML las fotos van en `assets/fotos/` con nombres fijos. El archivo
`assets/fotos/LEEME.md` lista cuáles son, qué medida conviene y cómo sacarlas para
que peguen con la marca. Si una foto falta, esa posición vuelve sola a la ilustración.

`index.html`, en la raíz del repositorio, es la misma página en HTML plano. Sirve para mostrarla, aprobarla o publicarla en GitHub Pages mientras la tienda se termina de armar. Ahí el carrito es una demostración local: no cobra ni guarda nada.
