# Portal de baristas

Una página, `sepiacoffee.cl/pages/baristas`, donde cada barista entra con un **ID y una
clave** que le das tú, completa su perfil (foto, talla de camisa, camioneta, datos personales y
bancarios, y la declaración de que puede emitir boleta de honorarios), ve los eventos, postula,
mira el ranking del equipo y sus ganancias. Tú confirmas a quién va a cada evento, asignas quién
lleva la camioneta y ves cuántos baristas necesitas, los horarios y lo que vas a pagar. La
administración entra con su correo: con un código por correo o, si activó su clave, con correo y clave.

## Cómo está armado

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| Base de datos y login | Supabase (plan gratis) | Guarda todo (incluidas las fotos de perfil) y decide quién ve qué |
| `esquema.sql` | este repo | Crea las tablas y las reglas de acceso |
| `assets/sepia-baristas.js` | tema de Shopify | Dibuja el portal y manda las consultas |
| `sections/sepia-baristas.liquid` | tema de Shopify | Estilos y los dos scripts |
| `templates/page.baristas.json` | tema de Shopify | Plantilla de la página «Baristas» |
| `apps-script/Codigo.gs` | Google Apps Script (cuenta de la administración) | Lee el calendario, manda los correos de seguimiento |

**Velocidad.** El portal pide los datos a la base en **3 viajes** (lo básico y lo común; lo de la
administración y el equipo de cada evento; las fotos) en vez de una consulta tras otra, que con la red
del celular demoraba hasta 20 segundos. La página abre de antemano la conexión con Supabase
(`preconnect`) y, desde que llega el HTML, muestra un vaso de Sepia llenándose («Preparando tu portal…»)
hasta que el portal está listo; si el celular pide menos movimiento, el vaso queda quieto.

La clave pública de Supabase queda en la página (está hecha para eso). Lo que
protege los datos son las reglas del `esquema.sql`, que se probaron con 184
comprobaciones (`pruebas/rls.sql`), 143 de la automatización (`pruebas/automatizacion.sql`), 143 de los accesos,
equipo, ranking y traslados (`pruebas/accesos.sql`) y 72 del historial (`pruebas/historial.sql`): un barista ve solo lo suyo, la dirección
exacta solo la ven los confirmados en ese evento, y los datos del cliente y los
de todos los baristas solo los ve la administración.

## Lo que ve cada uno

- **Barista con acceso:** los eventos abiertos que faltan **14 días o menos** (fecha, horario,
  comuna, lugar, cuántos se buscan, pago líquido y monto de su boleta), sus postulaciones y sus
  datos. Un evento más lejano no lo ve ni puede postular a él, aunque conozca su dirección web:
  lo decide la base de datos (`config.dias_publicacion`). Los que ya tiene asignados los ve siempre.
  Si lo confirmas, ve además la dirección exacta y las indicaciones, con quién va en su equipo
  (nombre y foto) y, si hay camioneta, quién la lleva.
- **Administración:** crea y edita eventos, ve a los postulantes, confirma o
  rechaza, y ve el resumen de pagos con la lista de a quién transferir (se baja
  en CSV).
- **Nadie de afuera** ve nada: sin sesión, la base de datos no entrega ni una fila.

## Accesos, perfil, ranking, ganancias y traslados

**Entrar con ID y clave.** En la pestaña *Admin: accesos* escribes el nombre de la persona y el
portal sugiere un ID (`camila.perez`: letras sin tilde, números, punto o guion). Al crear el
acceso aparece **una sola vez** la clave temporal (`xxxx-xxxx-xxxx`), con botones para copiarla o
mandarla por WhatsApp. En el primer ingreso el portal obliga a cambiarla (mínimo 8 caracteres, sin
repetir el ID) y a completar el perfil. Si alguien la olvida, *Restablecer clave* genera otra y
cierra sus sesiones abiertas. *Desactivar acceso* le quita la entrada sin borrar su historial
(deja de ver eventos y de recibir avisos); *Eliminar* borra el acceso y todos sus datos. Los
baristas ya no necesitan correo: el que ponen en el perfil es solo de contacto y para los avisos.

**Perfil.** Foto (se recorta cuadrada y se achica antes de subirla; JPG, PNG o WebP, hasta 2 MB;
es privada: solo la ve el equipo con sesión iniciada), talla de camisa, si tiene camioneta, y los
datos personales y bancarios de siempre. Tiene un botón «Pegar datos desde mi banco» que lee el
texto que entrega la app del banco y rellena banco, tipo y número de cuenta.

**Ranking.** Ordena al equipo por turnos (acumulado o por mes, hasta 12 meses atrás; los empates
comparten puesto). Cuenta el **historial** (ver más abajo) y las asistencias del portal: una
postulación o una foto no suman; suma cuando tú marcas **Asistió** en *Admin: seguimiento*
(aparece una vez pasada la fecha del evento). Además, el acumulado incluye los *otros turnos
previos (sin detalle)* que anotas en la ficha de cada persona (*Admin: accesos → Datos privados*).
Aparece quien tiene acceso activo y ya completó su perfil o ya tiene turnos (así, quien viene del
historial figura aunque todavía no haya entrado). Los baristas ven el ranking completo pero no los
datos privados de nadie.

**Historial anterior al portal.** Los turnos que ya se hicieron antes de usar el portal (por
ejemplo, el año hasta hoy) se cargan **una vez** con una consulta SQL (tabla `historial_turnos`,
solo la ve la administración): una fila por barista y evento, con su fecha y horas. **Esos datos
no van en este repositorio** (es público): se pegan directo en el editor SQL de Supabase. Cada
fila se une a un acceso por el **nombre**: igual sin importar tildes ni mayúsculas, o el acceso
con el nombre completo («Elio Aravena Soto») y el historial con nombre y primer apellido («Elio
Aravena»). Si hay dos posibles, no adivina. Pasa al crear el acceso o al correr la carga, y lo que
no calce se une a mano en *Admin: accesos* (cada persona tiene «Historial anterior al portal» con
un selector «Vincular historial», y un resumen arriba lista quién del historial todavía no tiene
acceso). Cargar dos veces el mismo historial no repite turnos. Al eliminar un acceso, su historial
no se borra: queda sin unir. «Mis ganancias» suma los turnos del historial a los turnos
registrados de cada barista.

**Mis ganancias.** Cada barista ve sus turnos, lo pagado y lo pendiente, y los reembolsos de
camioneta aparte. Solo ella y la administración ven esos montos.

**Traslados con camioneta.** En el evento marcas «Requiere camioneta» y, si quieres, los
kilómetros y el TAG/peajes (solo los ve la administración). En *Admin: seguimiento* asignas como
**conductor** a un asignado que declaró tener camioneta (uno por evento). El reembolso es
`km ÷ rendimiento × precio del litro + TAG + estacionamiento`, con 10 km/l y $1.400/l por defecto;
se cambian en *Admin: eventos → Ajustes de traslado con camioneta* (o `config.rendimiento_km_l`,
`config.precio_litro`). El estacionamiento lo ingresas tú al cierre. En *Admin: pagos →
Reembolsos de camioneta* registras que ya lo pagaste (no transfiere dinero). **No son honorarios
ni van en la boleta**, y no cuentan para el tope diario.

**Administración: clave o código.** En «Soy administración» se elige entre *correo y clave* y
*código por correo*. La primera vez que alguien de la administración entra con código y todavía no
tiene clave, el portal se la pide («Ahora no» la deja para después; la pestaña *Mi clave* sirve para
crearla, cambiarla o desactivarla). Mínimo 10 caracteres. Por seguridad, una clave sirve como
administración solo si esa persona la **activó** desde una sesión con código (`admins.clave_activa`,
funciones `admin_activar_clave` y `admin_clave_activa`): así nadie que haya creado una cuenta con el correo
de la administración antes que ella puede entrar con una clave puesta de antemano. Al crear la clave, ella
reemplaza cualquier otra. Quien es administración se define en la tabla `admins`:
`insert into public.admins (email) values ('correo@ejemplo.cl');` (en minúsculas), y esa persona tiene
que tener cuenta en Supabase (*Authentication → Users → Add user*, con «Auto Confirm User»): el botón de
código no crea cuentas. Para quitar a alguien: `delete from public.admins where email = '…';`.
Conviene, además, apagar «Allow new users to sign up» en *Authentication → Sign In / Providers → Email*:
el portal ya no usa registros nuevos (los accesos se crean desde «Admin: accesos»).

**Quien ya se había registrado con correo** (pruebas anteriores) pierde el acceso: hay que
crearle un ID y clave desde *Admin: accesos* y que vuelva a completar su perfil.

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
| Cada día, 6:00 | Lee el calendario; los servicios nuevos quedan cargados (solo los ves tú). Si hubo novedades, te llega un resumen | Administración |
| **14 días antes** (`config.dias_publicacion`), 9:00 | El evento **se abre a los baristas**: aparece en el portal y pueden postular. Si quedan cupos, correo «Se abrió un evento» | Baristas que aceptaron avisos |
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

En el portal, cada evento tuyo dice si los baristas ya lo ven («Abierto desde el …») o cuándo se
abre («Todavía no lo ven los baristas: se abre el …»). Para cambiar los 14 días, o apagar el correo
de «Se abrió un evento» (`config.avisar_eventos_nuevos`):
```sql
update public.config set dias_publicacion = 21;            -- 3 semanas
update public.config set avisar_eventos_nuevos = false;    -- sin ese correo
```

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
4. **Correo de salida (solo para tu código de administración).** En *Authentication* → *SMTP
   Settings* activa un SMTP propio, porque el de Supabase por defecto manda a muy pocas
   direcciones. Con Google Workspace: host `smtp.gmail.com`, puerto 587, usuario tu correo y una
   *contraseña de aplicación* (myaccount.google.com/apppasswords; pide la verificación en dos
   pasos). Los baristas ya no reciben códigos: entran con ID y clave.
5. **Texto del correo con el código.** En *Authentication* → *Email Templates*,
   en las plantillas *Magic Link* y *Confirm signup*, deja como asunto
   `Tu código de Baristas Sepia` y como mensaje:
   `Tu código para entrar es {{ .Token }}. Vale por una hora. Si no lo pediste, ignora este correo.`
   Sin `{{ .Token }}` el correo llega con un enlace y no con el código.
   Además, en *Authentication → Sign In / Providers → Email*, sube el largo mínimo de la
   contraseña a 8 o más (el portal ya lo exige, pero así queda también del lado de Supabase).
6. **Pasarme dos datos.** En *Project Settings* → *API* copia la *Project URL* y la
   clave *anon public*. **Nunca** la `service_role`.
7. **Entrar tú primero.** Antes de que se publique el portal, entra con tu correo
   de administración (botón «Soy administración») para dejar tu cuenta creada: ese botón no crea
   cuentas nuevas, solo deja entrar a una que ya existe.
8. **Crear el primer acceso.** En *Admin: accesos* crea el de una barista y pruébalo en otra
   ventana. Los IDs usan el dominio interno `equipo.sepiacoffee.cl` (constante `DOMINIO_ACCESO` en
   `assets/sepia-baristas.js` y en `crear_acceso()` de `esquema.sql`: si lo cambias, cámbialo en
   los dos). El `esquema.sql` también crea el almacén de fotos `perfiles` (privado, 2 MB).

## Sepia Equipo: la navegación y la forma de la interfaz de Jorge, con tus colores y esta misma base de datos

Una segunda página, `sepiacoffee.cl/pages/equipo`, con la **navegación y la forma** de «Sepia Equipo», la app que armó Jorge
(barra de navegación, tarjetas de evento con cupos «con camioneta» y «sin camioneta», «Mi próximo turno», pestañas
Disponibles / Mis turnos / Eventos listos, perfil por secciones, campana de avisos, ranking con podio, y para la administración un
panel con accesos directos, «Ver equipo» de cada evento y el botón «Vista barista»). **Pintada solo con la paleta de Sepia** (azul
#526EA0, azul noche #020526, celeste #B9C5D3, crema #E7E5D9, gris #F2F2F2 y blanco), la misma del portal de baristas. Funciona con la misma
base de datos de este portal: mismas cuentas, misma clave, mismos eventos y postulaciones (la sesión incluso se comparte). Las
cuentas, los IDs y las claves temporales se siguen creando y restableciendo como hasta ahora, desde el portal de baristas o desde
«Equipo» en esta página.

**Entrar**: una sola entrada, con ID y clave, para todos (Manuel, 22 oct). La administración es una **cuenta de barista marcada**: la misma
persona trabaja como barista y como administración con un solo ID. Adentro cambia de vista con **«Vista barista»** / **«Administración»**; ese botón
solo lo ve quien está marcado, y la base de datos lo decide (`es_admin()`): un barista no ve «Vista barista» ni «Administrar» ni recibe datos de
administración aunque los pida. La administración con cuenta de barista cambia su clave temporal y completa su perfil como cualquiera del equipo.
Para marcar o desmarcar a alguien, en el SQL Editor: `select public.hacer_admin('camila.perez');` y `select public.hacer_admin('camila.perez', false);`.
Si su acceso se desactiva, deja de ser administración. (La administración por correo de `public.admins` sigue existiendo para el portal de baristas,
pero la consola ya no tiene esa entrada.)

**Solicitudes de ingreso**: la página «Trabaja con nosotros» manda la postulación a `solicitar_ingreso` (sin sesión; si el mismo correo
ya tiene una pendiente, se actualiza; tope de 30 por hora). La administración la ve en **Administrar → Solicitudes** (con un aviso al entrar) y la aprueba
o rechaza. Al aprobar se crea su ID (`usuario_desde_nombre`: «Camila Pérez» → `camila.perez`, `camila.perez2` si ya existe) con clave temporal, que queda en
`accesos_por_enviar` hasta que el script de Google le manda el correo «Bienvenido al equipo» con su ID y su clave (tipo `acceso_nuevo`); al marcarlo enviado,
la clave se borra de la cola. Si la administración le restablece la clave antes, ese correo ya no sale. Cada solicitud nueva avisa también a
`config.correo_solicitudes` (`solicitud_nueva`, contacto@sepiacoffee.cl).

**Postulaciones con confirmación**: quien lleva menos de `config.eventos_para_confirmar` (2) eventos trabajados (`eventos_trabajados`: asistencias
registradas más el historial) o tiene tarjeta amarilla queda **pendiente** al postular («Postulación enviada. La administración la confirmará»); la
administración la ve en el equipo del evento y la confirma (con o sin camioneta, lo que pidió) o la elimina. Con 2 o más y sin amarilla, se confirma sola.

**Tarjeta amarilla** (`amarillas`, solo administración): se pone o quita en Administrar → Equipo («Poner amarilla»), donde también se ve cuántos eventos
lleva cada persona. Se ve como una tarjetita amarilla junto al nombre (única excepción a la paleta). El barista no la ve ni le llega en sus datos. Se quita
sola cuando le registran asistencia en un evento posterior a la tarjeta (al cerrar el evento, todos los confirmados quedan como asistidos: si alguno no
salió bien, vuelve a ponérsela).

**Una aplicación aparte, con salida al sitio**: la consola es una página completa, **sin el menú de sepiacoffee.cl** (no usa el encabezado ni el pie de la
tienda). Su logo (en la entrada y en la barra de arriba) lleva al inicio de la página web, y hay una pestaña **«Nosotros»** (también en la entrada)
que lleva a la página Nosotros de la tienda: la dirección sale del menú principal de Shopify (`snippets/sepia-equipo-sitio.liquid`; si no hay un
«Nosotros» en el menú, usa `/pages/nosotros`). La barra de abajo del celular reparte el ancho: 4 pestañas para el equipo (Eventos, Ranking, Mi Perfil, Nosotros)
y 5 para la administración (suma Administrar).

**Íconos**: el logo cuadrado de Sepia Coffee (fondo crema, «sepia coffee» en azul) es el ícono de la **aplicación descargable** (manifiesto con 192 y 512 px, y el de 180 px
para el iPhone, tal cual) y el **ícono de la pestaña del navegador** de la consola (32 y 64 px, el mismo logo recortado un poco más cerca para que se lea chico).
Los PNG están en `equipo/iconos/`. El de **sepiacoffee.cl** se fija en el tema (Configuración del tema → Favicon).

**Lo que se dejó fuera, a pedido**: la historia del café y «quiénes somos» (la pestaña «Sepia»), la pantalla de bienvenida con granos de
café, las fotos del turno (tres por evento), el botón «Necesito ayuda» y las boletas y pagos (siguen en el portal de baristas).

| Pieza | Qué hace |
|---|---|
| `equipo.sql` | Se corre **después** de `esquema.sql`. Funciones `eq_*` que arman los datos en la forma que la interfaz espera y aplican las reglas: eventos y postulaciones, perfil, cupos, camioneta, cancelación, ranking, equipo de un evento, avisos y ganancias |
| `equipo/fuente/` | La interfaz tal como la entregó Jorge (archivos compilados) |
| `equipo/iconos/` | Los íconos de la aplicación y de la pestaña, hechos con el logo cuadrado de Sepia Coffee |
| `equipo/construir.py` y `equipo/parches/` | Hacen los cambios de texto y de rutas (cada uno anotado con su motivo) y agregan la entrada de la administración, **pinta todo con la paleta** (cada color de Jorge pasa al de la paleta que cumple su papel) y deja `assets/sepia-equipo-v4-*` y `templates/page.equipo.liquid`. Se detiene si la fuente ya no calza |
| `assets/sepia-equipo-api.js` | El «servidor»: intercepta lo que la interfaz le pide a `/api/*` y lo traduce a Supabase (sesión, funciones `eq_*`, fotos de perfil en el almacenamiento privado) |
| `templates/page.equipo.liquid` | La página, sin el diseño de la tienda |
| `snippets/sepia-equipo-sitio.liquid` | Las direcciones del sitio a las que lleva la consola: inicio (logo) y Nosotros |
| `snippets/sepia-equipo-conexion.liquid` | La URL y la clave pública de Supabase. En el repo lleva los marcadores `SUPABASE_URL` y `SUPABASE_CLAVE`: reemplázalos antes de subirlo (`construir.py --salida … --url … --clave …` deja una copia lista) |
| `equipo/pruebas/` | Pruebas de punta a punta en un navegador real (ver más abajo) |

**Reglas** (las de Jorge, aplicadas por la base de datos y no por la pantalla): se postula con confirmación inmediata, por
orden de llegada, «con camioneta» o «sin camioneta»; cada evento reserva a lo más **un** cupo con camioneta y solo lo toma quien
declaró tenerla; en un evento de varios cupos, el último queda reservado para la camioneta mientras nadie lo tome; se puede
cancelar hasta 24 horas antes; los baristas ven los eventos desde 14 días antes; la dirección solo la ven los confirmados y el
cliente nunca; la administración asigna, confirma y saca gente a mano. El recordatorio del turno llega a la campana desde las
18:00 (hora de Chile) del día anterior.

**Lo que se cambió respecto de la app de Jorge** (además de los colores y de lo que se dejó fuera): el contacto para restablecer la clave
es Manuel; el ranking mensual es el mes en curso (antes era siempre octubre); el formulario de eventos pide además la comuna o zona (la
ve todo el equipo; antes quedaba «Por confirmar»); un evento de un solo cupo se puede tomar sin camioneta; al completar el perfil se avisa
que se aceptan el uso de los datos y la declaración de boleta (la base lo exige); el patrón del ID de acceso era inválido en los
navegadores nuevos. «Mis turnos y ganancias» lo ve solo la administración, como en la app de Jorge; cada barista ve sus ganancias en el portal.

**Puesta en marcha**: (1) en Supabase, correr `esquema.sql` de nuevo (cambió una regla) y después `equipo.sql`; (2) crear la
página «Equipo» (`/pages/equipo`, plantilla `equipo`) y subir al tema los archivos `assets/sepia-equipo-*`, `assets/sepia-equipo-api.js`,
`templates/page.equipo.liquid` y `snippets/sepia-equipo-conexion.liquid` (con la URL y la clave públicas de Supabase); (3) probar en la
vista previa del tema y publicarlo. Si cambias algo de `fuente/` o de `construir.py`, sube `VERSION` en `construir.py` para que los
navegadores no usen copias viejas.

## Probado, y lo que falta probar

Todo se corre desde la raíz del repositorio. Los datos de las pruebas son inventados.

- **Reglas de acceso y de la automatización (Postgres)**: `pruebas/rls.sql` (184),
  `pruebas/automatizacion.sql` (143: recordatorios, vacante, evento OK, grupo, boleta, pago,
  sincronización del calendario y sus resguardos) y `pruebas/accesos.sql` (143: crear, restablecer,
  desactivar y eliminar accesos, perfil, equipo, ranking, traslados y reglas del almacén de fotos) y
  `pruebas/historial.sql` (72: carga, vinculación por nombre, ranking con historial) y
  `pruebas/admin-clave.sql` (49: entrada de la administración con clave o código, y agregar administradores) y
  `pruebas/admin-barista.sql` (26: la administración con cuenta de barista, `hacer_admin` y el cambio de vista) y
  `pruebas/turnos.sql` (25: eventos con turnos, una tarjeta con dos opciones) y
  `pruebas/ingreso.sql` (60: solicitudes, correo con el ID y la clave, confirmación de postulaciones y tarjeta amarilla) y `pruebas/equipo.sql` (149: las funciones de
  Sepia Equipo). Se corren con `psql` sobre una base vacía: primero `pruebas/shim-supabase.sql`, luego `esquema.sql` (y `equipo.sql`
  para las pruebas de Sepia Equipo), luego el archivo de pruebas. Al romper
  una regla a propósito, las pruebas lo detectan.
- **Script de Google (Node)**: `node --test shopify/baristas/apps-script/pruebas/*.test.mjs` → 30
  comprobaciones del lector de calendario y de los correos, más 3 de punta a punta (el script
  real contra el esquema real, con el paso de los días simulado) si se define `PGHOST`,
  `PGPORT` y `PGUSER` de un Postgres de pruebas.
- **Interfaz**: `node shopify/baristas/pruebas/interfaz/prueba.mjs` → 278 comprobaciones en un
  navegador contra una simulación de Supabase (necesita Playwright: variables `PLAYWRIGHT` y
  `CHROMIUM` si no están en su lugar por defecto).
- **Sepia Equipo, de punta a punta**: `node shopify/equipo/pruebas/prueba.mjs` (con `PGHOST`, `PGPORT` y `PGUSER` de un Postgres
  de pruebas) → 171 comprobaciones en un navegador real: la interfaz de Jorge, el adaptador y las reglas de la base de datos
  de verdad (solo se simulan la librería de Supabase, su Auth y su Storage). Cubre entrar con ID y clave, clave y perfil obligatorios,
  postular con y sin camioneta, cupos, cancelar (24 horas), foto de perfil, ranking, avisos, cambio de clave, salir,
  toda la administración (crear y editar eventos, asignar, cuentas, restablecer, desactivar, ganancias), las dos formas de entrar de la
  administración (código o clave, y la clave que se crea la primera vez), que un barista no vea nada de administración, que la consola no traiga el menú del sitio, el logo que vuelve al inicio, «Nosotros», los íconos, el celular y que **toda pantalla use solo los colores de la paleta**. La página se
  sirve como la sirve la tienda (con `?v=` en las direcciones). `SECCION=A` (o `E`, etc.) corre solo una parte.
- **Probado en la tienda real**: la página en la vista previa del tema carga, muestra la entrada y un intento de entrar con datos
  falsos llega a Supabase y vuelve con «ID o clave incorrectos». Entrar de verdad necesita correr `equipo.sql` en Supabase.
- **Probado en el proyecto real de Supabase**: el envío del código por correo, el login y las
  consultas de una barista (20 comprobaciones).
- **Falta**: correr el `esquema.sql` nuevo en el proyecto real, instalar el script de Google y
  hacer las pruebas del paso 5 con los permisos reales (calendario y correo). Los accesos con ID y
  clave crean el usuario directamente en las tablas internas de Supabase Auth y la foto usa el
  almacén de Supabase: ninguna de las dos cosas se puede probar en una base local, así que hay
  que probarlas una vez en el proyecto real (crear un acceso de prueba, entrar con su clave,
  cambiarla y subir una foto).

## Ojo

- **Datos personales.** El RUT y la cuenta bancaria son datos personales. La
  Ley 21.719 parte el 1 de diciembre de 2026, salvo que el Senado la aplace. El
  portal pide solo lo necesario, muestra el aviso de uso y deja a cada persona
  borrar sus datos. Conviene que lo revise tu contador o abogado.
- **Honorarios o contrato.** Si las mismas personas trabajan seguido, con horarios
  que tú fijas, pueden considerarlas relación laboral. Consúltalo.
- **Nombres de eventos.** Los ven todos los baristas registrados: no pongas el
  apellido del cliente ahí. El cliente va en su campo aparte, que solo ves tú.
