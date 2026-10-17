# Retiro en Tabancura 1484: apagado por ahora

El retiro en Tabancura 1484, cocina 62 (Vitacura) está **desactivado** desde el
14 de octubre de 2026. Esta nota deja a mano todo lo que se sacó, para
reactivarlo en minutos cuando se decida.

## Qué se apagó

| Dónde | Antes | Ahora |
|---|---|---|
| Shopify · ubicación «Tabancura 1484» | Retiro local activo, preparación en 1 hora | Retiro local desactivado |
| Página «Despachos» (antes «Retiros y despachos») | Sección «Retiro» + mención en la intro | Solo despacho a domicilio |
| Página Contacto, «Dónde estamos» | Decía que se podía retirar en Tabancura | Solo «Despachamos a todo Chile» |
| Página Nosotros, «Dónde estamos» | Párrafo «Si prefieres retirar…» | Sin ese párrafo |
| Pie de página | Enlace «Retiros y despachos» | «Despachos» |
| Preguntas frecuentes y Términos | Enlace «Retiros y despachos» | «Despachos» |

La dirección de la página no cambió (`/pages/retiros-y-despachos`), así que
ningún enlace ni marcador se rompió.

## Cómo reactivarlo

1. **Shopify:** Configuración → Envíos y entrega → Retiro local → ubicación
   «Tabancura 1484» → activar. Datos que tenía:
   - Tiempo de preparación: **1 hora**
   - Instrucciones: *Retiro en Tabancura 1484, cocina 62, Vitacura. Te avisamos
     por correo cuando el pedido esté listo; no vengas antes de ese aviso. Trae
     el número de pedido. Acá solo hacemos entrega: no es tienda ni hay venta
     en el lugar.*
2. **Stock:** el retiro local solo se ofrece para los productos con inventario
   en esa ubicación. Hoy «Tabancura 1484» tiene el envío de inventario apagado,
   así que hay que cargarle stock a lo que se quiera retirar.
3. **Textos:** devolver lo que está abajo, y el nombre «Retiros y despachos» a
   la página y al enlace del pie.

## Textos que se sacaron

**Página «Despachos», primera línea.** Decía:

```html
<p>Despachamos a todo Chile, y si estás en Santiago también puedes retirar.</p>
```

**Página «Despachos», sección completa**, entre «Despacho a domicilio» y
«Cuándo sale tu pedido»:

```html
<h2>Retiro</h2>
<p>Puedes retirar en <strong>Tabancura 1484, cocina 62, Vitacura</strong>. Eliges «Retiro» al pagar, y te avisamos por correo cuando el pedido esté listo. No vengas antes de ese aviso.</p>
<p>Dos cosas importantes: ahí <strong>solo entregamos pedidos ya hechos</strong>, no es tienda y no hay venta en el lugar; y el stock disponible para retiro es acotado, así que no siempre vas a ver la opción para todos los productos. Si no aparece, es que ese formato está solo para despacho.</p>
<p>Lleva el número de pedido.</p>
```

**Página Contacto, «Dónde estamos»:**

```html
<p>Por ahora la venta es solo en línea. Despachamos a todo Chile y puedes retirar en <strong>Tabancura 1484, cocina 62, Vitacura</strong>, eligiendo esa opción al pagar.</p>
```

**Página Nosotros, «Dónde estamos»**, después del primer párrafo:

```html
<p>Si prefieres retirar, puedes hacerlo en <strong>Tabancura 1484, Vitacura</strong>: eliges esa opción al pagar y te avisamos por correo cuando el pedido esté listo. Ahí solo entregamos pedidos ya hechos; no es tienda ni hay venta en el lugar.</p>
```

## Ojo

Esa es la dirección que sí es pública. La de la bodega de despachos
(la ubicación «Bodega · despachos») es particular y no debe aparecer en el
sitio ni en este repositorio.
