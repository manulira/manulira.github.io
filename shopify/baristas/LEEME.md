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
| `apps-script/Codigo.gs` | Google Apps Script (cuenta de la administración) | Lee el calendario, manda los correos de seguimiento |

La clave pública de Supabase queda en la página (está hecha para eso). Lo que
protege los datos son las reglas del `esquema.sql`, que se probaron con 165
comprobaciones (`pruebas/rls.sql`) más 127 de la automatización (`pruebas/automatizacion.sql`): un barista ve solo lo suyo, la dirección
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

**Cierre desde el portal.** Pasado el evento, el barista asignado ve en «Mis postulaciones» el
monto de su boleta y un botón «Ya emití mi boleta de honorarios» (con el folio, si quiere). A ti
te aparece en *Admin: seguimiento → Por cerrar* como «boleta declarada: revisar en el SII». La
revisas en el SII y presionas **Marcar pagado** (pide confirmar; deja la boleta como recibida,
anota la fecha de hoy y le llega un correo al barista).

**Eventos por revisar.** Los que entran desde el calendario con datos dudosos (sin lugar, sin
comuna, horario por confirmar, cupos supuestos) o que cambian de fecha quedan marcados «Por
revisar» con el motivo, hasta que aprietas «Ya lo revisé».

## Automatización: calendario y correos

Un script de Google (`apps-script/Codigo.gs`) corre con tu cuenta, lee el calendario y manda los
correos. **Quién recibe qué y cuándo lo decide la base de datos** (`calcular_notificaciones()` en
`esquema.sql`, probada con `pruebas/automatizacion.sql`); el script solo pregunta qué toca, lo
manda y lo anota. Cada correo tiene una clave única: aunque el script corra mil veces, nadie
recibe el mismo aviso dos veces.

| Cuándo | Qué pasa | Para quién |
|---|---|---|
| Cada día, 6:00 | Lee el calendario; los servicios nuevos quedan **abiertos** para inscribirse. Si hubo novedades, te llega un resumen | Administración |
| 5 días antes (`config.dias_vacante_cupos`, 0 lo apaga) | Si todavía hay cupos libres: aviso de vacante | Baristas que aceptaron avisos |
| **7 días antes**, 9:00 | Recordatorio 1: «reconfirma que vas» a cada asignado que no ha confirmado | Barista |
| 7 días antes | **Estado de la semana**: todos los eventos de los próximos 7 días, con OK / Pendiente / ALERTA y quién falta | Administración |
| 6 y 5 días antes | Recordatorios 2 y 3 a quien siga sin confirmar | Barista |
| 12 horas después del 3.º (≈ 4 días y medio) | **Vacante**: «hay un cupo» a los baristas inscritos que aceptaron avisos y no están asignados; copia con quién no confirmó | Baristas · Administración |
| Cuando todos reconfirman (a 7 días o menos) | **Evento OK**, con nombre y teléfono (enlace de WhatsApp) de a quién agregar al **grupo de WhatsApp** | Administración |
| Día siguiente al OK | Recordatorio de crear el grupo (hasta 2) hasta que marques «Grupo de WhatsApp creado» en el checklist | Administración |
| 4 días antes y no está OK | Alerta con el detalle | Administración |
| Día siguiente al evento (y a los 4 y 8 días) | Pide la boleta de honorarios, con el monto, hasta que la persona avise que la emitió | Barista |
| Cada día con boletas declaradas por pagar | Resumen para revisar en el SII; también los cierres atrasados | Administración |
| Al marcar «Pagado» | «Te hicimos la transferencia» | Barista |

Los recordatorios salen entre 9:00 y 20:59 (hora de Santiago), uno por día por persona. Si el
script no corrió unos días, no se amontonan: igual sale uno por día.

### Qué eventos del calendario se publican

Se publican los que se llaman **«Servicio …»**, los que llevan **🍸** y los que llevan **#barista**
en el título o la descripción. No se publican reuniones, «Pagar …», eventos de todo el día,
cancelados/anulados ni los que dicen **#sinbaristas**. Si hay un evento largo o con lugar que no
entró, el resumen del día te lo avisa una vez.

De la descripción lee, si están: `Baristas: 3`, `Servicio: …`, `Lugar exacto: …`, `Lugar: …`,
`Nombre completo:` / `Cliente:`. Cuántos baristas: lo que diga el calendario (mínimo 2; si el
servicio lleva café y martini, mínimo 3); si no dice, 2, o 3 con café y martini. El pago es el
bloque completo del calendario.

**Lo que ven los baristas** es solo: nombre neutro («Servicio de barra · Casona X»), fecha,
horario, lugar y comuna, cupos y pago. El nombre del cliente va a la tabla privada (solo la
administración). El RUT, el correo, los montos del cliente y los datos de transferencia del
calendario **nunca se copian**.

Un evento cargado a mano que tenga el mismo día, hora de inicio y hora de fin que uno del
calendario se **adopta** (no se duplica). Lo que editas a mano (nombre, cupos, pago, dirección) no
se pisa. Si cambia la fecha u horario en el calendario, se actualiza y queda «Por revisar». Si lo
borras del calendario, se cancela (y si el calendario llega vacío, o se iban a cancelar casi
todos, no cancela nada y te avisa).

### Instalación (una vez, unos 20 minutos)

1. **Actualiza la base.** Pega el `esquema.sql` completo en *SQL Editor → Run* (se puede correr
   de nuevo sin riesgo).
2. **Inventa una clave larga** (30 letras y números al azar) y guárdala en la base. Reemplaza
   `LA-CLAVE-LARGA` por la tuya y corre:
   ```sql
   update public.automatizacion
     set secreto_hash = encode(sha256(convert_to('LA-CLAVE-LARGA', 'UTF8')), 'hex');
   ```
3. **Crea el script.** Con la cuenta de la administración (la dueña del calendario), entra a
   script.google.com → *Nuevo proyecto*, borra lo que traiga y pega `apps-script/Codigo.gs`. En
   *Configuración del proyecto* marca «Mostrar el archivo de manifiesto appsscript.json», ábrelo y
   pega `apps-script/appsscript.json` (deja la hora de Santiago).
4. **Ajustes.** *Configuración del proyecto → Propiedades de la secuencia de comandos*: agrega
   `SUPABASE_URL`, `SUPABASE_KEY` (la clave pública), `SECRETO` (la clave larga del paso 2),
   `EMAIL_PRUEBA` (tu correo) y deja `MODO_PRUEBA` en `si`. Opcionales: `PORTAL_URL`,
   `CALENDARIO_ID`, `ADMIN_EMAIL`, `TURNOS_FIJOS`, `ALIAS_LUGARES`.
5. **Pruebas, en este orden** (Ejecutar cada función; la primera pide permisos de calendario y
   correo): `probarConexion` → `vistaPreviaCalendario` (mira cómo entiende cada evento) →
   `enviarMuestras` (te manda un ejemplo de cada correo) → `sincronizarCalendario` →
   `enviarNotificaciones`. En modo de prueba **todos los correos llegan a tu casilla** con
   «[PRUEBA · iría a …]» en el asunto y no se marca nada como enviado. `reiniciarPrueba` vuelve a
   mandar lo ya visto.
6. **Salir a producción.** Cambia `MODO_PRUEBA` a `no` y ejecuta `instalarDisparadores` (el
   calendario cada día a las 6:00 y los correos cada hora). Para volver atrás: `quitarDisparadores`.

`TURNOS_FIJOS` sirve para un evento que se reparte en turnos con pago fijo. Ejemplo (un bloque
con dos turnos, de 3 y 4 horas):
```json
[{"patron":"torneo","nombre":"Torneo","lugar":"Gimnasio","comuna":"Providencia","cliente":"Torneo","turnos":[{"horas":3,"pago":25000},{"horas":4,"pago":40000}]}]
```
`ALIAS_LUGARES` enseña comunas a lugares que no las dicen: `{"punta los lunes":"Puchuncaví"}`.

Si algo falla, te llega un correo (máximo uno cada 6 horas por función) y el portal marca en rojo
«hace más de un día que no se lee el calendario». Los errores también quedan en *Ejecuciones*.
Los correos salen de tu cuenta y las respuestas de los baristas llegan a tu casilla. Google deja
enviar unos 1.500 correos al día con Workspace (100 con una cuenta gratuita).

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

Todo se corre desde la raíz del repositorio. Los datos de las pruebas son inventados.

- **Reglas de acceso y de la automatización (Postgres)**: `pruebas/rls.sql` (165) y
  `pruebas/automatizacion.sql` (127: recordatorios, vacante, evento OK, grupo, boleta, pago,
  sincronización del calendario y sus resguardos). Se corren con `psql` sobre una base vacía:
  primero `pruebas/shim-supabase.sql`, luego `esquema.sql`, luego el archivo de pruebas. Al romper
  una regla a propósito, las pruebas lo detectan.
- **Script de Google (Node)**: `node --test shopify/baristas/apps-script/pruebas/` → 29
  comprobaciones del lector de calendario y de los correos, más 3 de punta a punta (el script
  real contra el esquema real, con el paso de los días simulado) si se define `PGHOST`,
  `PGPORT` y `PGUSER` de un Postgres de pruebas.
- **Interfaz**: `node shopify/baristas/pruebas/interfaz/prueba.mjs` → 106 comprobaciones en un
  navegador contra una simulación de Supabase (necesita Playwright: variables `PLAYWRIGHT` y
  `CHROMIUM` si no están en su lugar por defecto).
- **Probado en el proyecto real de Supabase**: el envío del código por correo, el login y las
  consultas de una barista (20 comprobaciones).
- **Falta**: correr el `esquema.sql` nuevo en el proyecto real, instalar el script de Google y
  hacer las pruebas del paso 5 con los permisos reales (calendario y correo).

## Ojo

- **Datos personales.** El RUT y la cuenta bancaria son datos personales. La
  Ley 21.719 parte el 1 de diciembre de 2026, salvo que el Senado la aplace. El
  portal pide solo lo necesario, muestra el aviso de uso y deja a cada persona
  borrar sus datos. Conviene que lo revise tu contador o abogado.
- **Honorarios o contrato.** Si las mismas personas trabajan seguido, con horarios
  que tú fijas, pueden considerarlas relación laboral. Consúltalo.
- **Nombres de eventos.** Los ven todos los baristas registrados: no pongas el
  apellido del cliente ahí. El cliente va en su campo aparte, que solo ves tú.
