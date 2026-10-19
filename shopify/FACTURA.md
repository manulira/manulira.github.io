# Factura y boleta electrónica

Estado a 19 de octubre de 2026. El bloque «Necesito factura» está publicado en la
tienda desde el 18 de octubre (tema «Sepia Coffee · borrador factura y captcha») y
se volvió a probar en vivo: las 8 pruebas del carrito pasan. Falta elegir la app
que emite los documentos ante el SII.

## Qué hay en el tema

| Archivo | Para qué |
|---|---|
| `snippets/sepia-factura.liquid` | Interruptor «Necesito factura» encima del botón Pagar, en la página del carrito y en el cajón |
| `layout/theme.liquid` | Igual que el original de Horizon, más `{% render 'sepia-factura' %}` al final del `body` |
| `snippets/sepia-anti-spam.liquid` | Trampas anti-robot de los formularios de contacto y la línea visible de hCaptcha |
| `templates/page.contact.json` | Sin el texto fijo «Submit» del botón: toma «Enviar» en español |

## Cómo funciona

- El cliente enciende «Necesito factura» y completa razón social, RUT, giro,
  dirección, comuna y correo. El RUT se valida con su dígito verificador.
- Con la factura encendida y algo incompleto, el botón Pagar no deja avanzar.
  Sin factura, Pagar funciona como siempre y no toca el carrito.
- Los datos se guardan como atributos del carrito y pasan al pedido, donde
  aparecen en «Detalles adicionales»:
  `factura` (vale `Sí`), `factura_razon_social`, `factura_rut`, `factura_giro`,
  `factura_direccion`, `factura_comuna`, `factura_correo`.
  Si el cliente apaga el interruptor, se borran.

## Por qué en el carrito y no en el checkout

La tienda está en el plan Advanced. Los campos propios dentro de los pasos de
datos, envío y pago del checkout son solo del plan Plus. El carrito es el último
paso donde se puede pedir algo antes de pagar.

**Límite:** «Comprar ahora» en la ficha del producto y los pagos exprés se saltan
el carrito, y ahí no se puede pedir factura antes. Esos casos se resuelven con el
portal de autoservicio de la app (convertir una boleta en factura después de la
compra).

## Pendiente

1. Elegir la app. Candidatas en la Shopify App Store: «e‑Boletas · DTE Chile SII»
   y «Haulmer: Boleta y Factura». Preguntarles si leen los atributos
   `factura_*` del pedido para emitir factura directo en lugar de boleta.
2. Tener un medio de pago activo: las apps emiten al confirmarse el pago.
