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
protege los datos son las reglas del `esquema.sql`, que se probaron con 107
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

- Reglas de acceso: 107 comprobaciones contra un Postgres de prueba. Al romper una
  regla a propósito, las pruebas lo detectan.
- Interfaz: 48 comprobaciones en el navegador contra una simulación de Supabase
  (registro, validaciones, postular, retirarse, confirmar, resumen, CSV).
- **Falta**: la prueba de punta a punta con el proyecto real (el envío del código
  por correo, el login y las consultas contra Supabase de verdad). Se hace al
  conectar el proyecto.

## Ojo

- **Datos personales.** El RUT y la cuenta bancaria son datos personales. La
  Ley 21.719 parte el 1 de diciembre de 2026, salvo que el Senado la aplace. El
  portal pide solo lo necesario, muestra el aviso de uso y deja a cada persona
  borrar sus datos. Conviene que lo revise tu contador o abogado.
- **Honorarios o contrato.** Si las mismas personas trabajan seguido, con horarios
  que tú fijas, pueden considerarlas relación laboral. Consúltalo.
- **Nombres de eventos.** Los ven todos los baristas registrados: no pongas el
  apellido del cliente ahí. El cliente va en su campo aparte, que solo ves tú.
