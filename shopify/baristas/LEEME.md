# Portal de baristas

Una página, `sepiacoffee.cl/pages/baristas`, donde los baristas entran con su
correo, se registran (datos personales, datos bancarios y la declaración de que
pueden emitir boleta de honorarios), ven los eventos y postulan. Tú confirmas a
quién va a cada evento y ves cuántos baristas necesitas, los horarios y lo que
vas a pagar.

## Cómo está armado

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| Base de datos y login | Supabase (plan gratis) | Guarda todo y decide quién ve qué |
| `esquema.sql` | este repo | Crea las tablas y las reglas de acceso |
| `assets/sepia-baristas.js` | tema de Shopify | Dibuja el portal y manda las consultas |
| `sections/sepia-baristas.liquid` | tema de Shopify | Estilos y los dos scripts |
| `templates/page.baristas.json` | tema de Shopify | Plantilla de la página «Baristas» |

La clave pública de Supabase queda en la página (está hecha para eso). Lo que
protege los datos son las reglas del `esquema.sql`, que se probaron con 165
comprobaciones (`pruebas/rls.sql`): un barista ve solo lo suyo, la dirección
exacta solo la ven los confirmados en ese evento, y los datos del cliente y los
de todos los baristas solo los ve la administración.

## Lo que ve cada uno

- **Barista registrado:** eventos abiertos (fecha, horario, comuna, lugar, cuántos
  se buscan, pago líquido y monto de su boleta), sus postulaciones y sus datos.
  Si lo confirmas, ve además la dirección exacta y las indicaciones.
- **Administración:** crea y edita eventos, ve a los postulantes, confirma o
  rechaza, y ve el resumen de pagos con la lista de a quién transferir (se baja
  en CSV).
- **Nadie de afuera** ve nada: sin sesión, la base de datos no entrega ni una fila.

## Seguimiento de cada evento

**Dos confirmaciones distintas.** Tú *asignas* a un postulante (queda «Asignado»). Después
el barista *confirma que va* desde el portal («Confirmo que voy»). Si deja de estar
asignado o se retira, esa confirmación se borra sola. La fecha de la confirmación la pone
el servidor, no el navegador.

**Semáforo** (pestaña *Admin: seguimiento*, solo eventos próximos y no borradores):

| Estado | Cuándo |
|---|---|
| **ALERTA** | Faltan baristas por asignar y quedan 7 días o menos. O hay asignados sin reconfirmar y quedan 4 días o menos |
| **Pendiente** | Faltan baristas o reconfirmaciones, pero aún hay tiempo |
| **OK** | Cupos completos y todos reconfirmaron |

Los plazos (7 y 4 días) están en `config.dias_alerta_baristas` y
`config.dias_alerta_reconfirmar`. La pestaña muestra cuántas alertas hay.

**Checklist por evento.** Cinco puntos por defecto: grupo de WhatsApp creado, dirección y
hora enviadas, equipo y materiales listos, transporte y recolección coordinados, cliente
confirmó hora y lugar. Se cambian en `config.checklist_items`. También hay un botón para
copiar los teléfonos de los asignados y armar el grupo, y un botón de WhatsApp por barista.

**Cierre.** Cuando el evento ya pasó queda «Por cerrar» hasta registrar: el documento
emitido al cliente (fecha y folio) y, por cada barista, la boleta de honorarios recibida
(fecha y folio) y los honorarios pagados (fecha). Pasados `config.dias_alerta_cierre`
(7) días sin cerrar, pasa a ALERTA. La pestaña *Admin: pagos* puede mostrar solo lo que
falta pagar.

**Lo que todavía no hace solo (etapa 2):** mandar los correos. La propuesta es un
recordatorio al barista asignado que no ha confirmado a los 7, 6 y 5 días; después, un
correo a los demás baristas inscritos que aceptaron recibir avisos (casilla opcional del
registro, `baristas.acepta_avisos`) para avisar que hay un cupo; y un resumen diario para
la administración. Requiere una tarea programada en Supabase. Ver «Etapa 2» abajo.

## Cuánto se paga

Se guarda en la tabla `config` y se puede cambiar sin tocar código:

| Duración del evento | Pago líquido por barista |
|---|---|
| hasta 2 horas | $25.000 |
| más de 2 y hasta 4 horas | $40.000 |
| más de 4 horas | $10.000 por hora, hasta el tope diario |

**Tope diario: $70.000 líquidos por barista y por día.** Ningún pago calculado lo pasa
(una jornada de 10 horas paga $70.000, no $100.000). Si un evento lleva un pago fijo
propio, ese manda sobre la tarifa y sobre el tope, porque es una decisión puesta a mano.
Se cambia en `config.tope_dia`. Quien ya había corrido `esquema.sql` antes del tope
tiene que correr `migraciones/001-tope-diario.sql` una vez.

**Monto de la boleta.** Los baristas pasan boleta de honorarios, y el SII retiene
un porcentaje (15,25 % en 2026, 16 % en 2027, 17 % desde 2028). Para que a la
persona le queden $10.000 líquidos, la boleta tiene que ser por
`líquido ÷ (1 − retención)`. El portal lo calcula y se lo muestra a cada barista.
Cada enero hay que actualizar la retención:

```sql
update public.config set retencion = 0.16;   -- 2027
```

## Puesta en marcha (una sola vez, unos 15 minutos)

1. **Crear el proyecto.** En supabase.com crea una cuenta y un proyecto nuevo
   (nombre `sepia-baristas`, región São Paulo). Guarda la contraseña de la base
   de datos en un lugar seguro.
2. **Crear las tablas.** En *SQL Editor* → *New query*, pega todo
   `shopify/baristas/esquema.sql` y presiona *Run*.
3. **Declararte administrador.** En otra consulta, con tu correo real:
   `insert into public.admins (email) values ('tu-correo@ejemplo.cl');`
   (no lo escribas en el repositorio: es público).
4. **Correo de salida.** En *Authentication* → *SMTP Settings* activa un SMTP
   propio. El de Supabase por defecto solo manda a unas pocas direcciones y no
   sirve para baristas. Con Google Workspace: host `smtp.gmail.com`, puerto 587,
   usuario tu correo y una *contraseña de aplicación* (se crea en
   myaccount.google.com/apppasswords; pide tener la verificación en dos pasos).
5. **Texto del correo con el código.** En *Authentication* → *Email Templates*,
   en las plantillas *Magic Link* y *Confirm signup*, deja como asunto
   `Tu código de Baristas Sepia` y como mensaje:
   `Tu código para entrar es {{ .Token }}. Vale por una hora. Si no lo pediste, ignora este correo.`
   Sin `{{ .Token }}` el correo llega con un enlace y no con el código.
6. **Pasarme dos datos.** En *Project Settings* → *API* copia la *Project URL* y la
   clave *anon public*. **Nunca** la `service_role`.
7. **Entrar tú primero.** Antes de que se publique el portal, entra con tu correo
   de administración para dejar tu cuenta creada.

## Probado, y lo que falta probar

- Reglas de acceso: 165 comprobaciones contra un Postgres de prueba. Al romper una
  regla a propósito, las pruebas lo detectan.
- Interfaz: 77 comprobaciones en el navegador contra una simulación de Supabase
  (registro, validaciones, postular, retirarse, confirmar, resumen, CSV).
- **Falta**: la prueba de punta a punta con el proyecto real (el envío del código
  por correo, el login y las consultas contra Supabase de verdad). Se hace al
  conectar el proyecto.

## Etapa 2: correos automáticos (pendiente)

Se arma con una tarea diaria dentro de Supabase (una función y un horario) que revisa los
eventos y manda los correos desde la misma cuenta de envío. Cada correo enviado queda
anotado para no repetirlo. Se instala pegando el código y guardando la clave del correo
como secreto. Todavía no está escrita.

## Ojo

- **Datos personales.** El RUT y la cuenta bancaria son datos personales. La
  Ley 21.719 parte el 1 de diciembre de 2026, salvo que el Senado la aplace. El
  portal pide solo lo necesario, muestra el aviso de uso y deja a cada persona
  borrar sus datos. Conviene que lo revise tu contador o abogado.
- **Honorarios o contrato.** Si las mismas personas trabajan seguido, con horarios
  que tú fijas, pueden considerarlas relación laboral. Consúltalo.
- **Nombres de eventos.** Los ven todos los baristas registrados: no pongas el
  apellido del cliente ahí. El cliente va en su campo aparte, que solo ves tú.
