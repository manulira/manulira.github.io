# Bitácora de Sepia Coffee

Registro compartido de **quién pidió qué, qué se hizo y dónde** (GitHub, Supabase, Shopify, Google), para todas las personas
que trabajan con Claude Code en este proyecto. Las reglas están en `CLAUDE.md`, sección «Trabajo compartido». Lo más nuevo va arriba.
Hora de Santiago.

## En curso

Quién está cambiando algo ahora. Se anota al empezar un cambio y se borra al terminarlo (la entrada pasa al registro).

| Desde | Quién pidió | Qué está cambiando | Plataformas | Sesión |
|---|---|---|---|---|
| 24-10 01:15 | contacto@sepiacoffee.cl (Jorge) | Ranking con podio (sin el cuadro «Más turnos…») y nueva sección «Academia» (tragos, botellas, videos) | GitHub, Supabase, Shopify (borrador) | https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8 |

## Registro

### 24-10-2026 00:30 · contacto@sepiacoffee.cl (Jorge)
- **Pidió**: si al publicar la v13 puede borrar los temas anteriores.
- **Hecho**: solo consulta en Shopify (lista de temas). Respuesta: sí, después de publicar la v13; borrar v9, v10, v11 (borrador) y v12, y dejar
  unos días el publicado anterior como respaldo. Los datos están en Supabase y el código en GitHub. Sin cambios.
- **Dónde**: Shopify (solo lectura).
- **Ejecutó**: Claude Code · https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8

### 24-10-2026 00:30 · contacto@sepiacoffee.cl (Jorge)
- **Pidió** (23 oct, noche): cuadrar la app en el celular; medidores uno abajo del otro; que no se pueda hacer zoom; sacar «Nosotros»
  (confirmó saber que era decisión de Manuel); «Crear acceso de barista» como un rectángulo «Agregar barista» que se abra; en Mi Perfil, la foto
  a la derecha y el menú siempre abierto a la izquierda, cómodo en el celular; ajustar la foto al círculo; todos los datos obligatorios con
  foto; avisos obligatorios que lleguen al celular (eligió: por correo + obligatorio, porque Shopify no permite avisos «push»).
- **Hecho**: **v13** sobre la v12 de Manuel (se conserva su botón de instalar). Ver «Decisiones de Jorge» en `CLAUDE.md`. También se arregló que
  el lugar del evento mostrara una coma suelta. Se encontró que al completar el perfil en Sepia Equipo **no quedaba activado `acepta_avisos`**
  (los correos automáticos no les llegaban): ahora queda siempre activado y se activó para los 2 perfiles que había.
  Pruebas: interfaz 204/204; SQL obligatorios 13, niveles 29, y las demás iguales (4 de `pruebas/equipo.sql` fallan pasada la medianoche
  también con la versión anterior: dependen de la hora, no de este cambio).
- **Dónde**: GitHub `0fac7bb` (y este commit). Supabase: migración `foto_y_avisos_obligatorios` (`config.foto_obligatoria` = true,
  `eq_perfil_guardar`, `eq_estado`, `eq_accion`; `acepta_avisos` = true en los perfiles existentes). Shopify: borrador
  **«Sepia Coffee · equipo v13 (borrador, Jorge)» (`193580990828`)**, copia del borrador v12 de Manuel (`193580826988`, sin tocar), sin publicar.
- **Ojo**: el tema publicado sigue siendo la v10 (`193575944556`), sin el diseño corregido. La base ya pide foto para postular: en la v10 el barista
  ve el mensaje «Sube tu foto de perfil para postular (Mi Perfil)» y la puede subir ahí.
- **Ejecutó**: Claude Code · https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8

### 24-10-2026 · manuel@sepiacoffee.cl
- **Pidió** (23 oct): «ya no me instala automático la app al hacer clic en descargar, y en el celular no aparece». Y que el repositorio quede anotado en SEPIA-COFFEE.
- **Hecho**: Sepia Equipo **v12** = la v11 de Jorge + instalar la app: el botón «Instalar aplicación» se ve también en el celular (la interfaz original
  lo escondía en pantallas chicas) y se oculta si ya está abierta como app; en Android y computador instala con un toque (el aviso del navegador llegaba
  antes de que la interfaz escuchara y se perdía; ahora lo guarda `sepia-equipo-api.js`). En iPhone sigue siendo a mano (Apple no permite otra cosa).
  Nada del diseño de Jorge cambió. Pruebas de interfaz 194/194 (nueva sección M). `CLAUDE.md` e `ia/skill-marca.md` apuntan a SEPIA-COFFEE.
  (Se hizo primero sobre la v9 el 23 oct, pero no se pudo subir por el cambio de dueño del repositorio; se rehízo sobre la v11.)
- **Dónde**: GitHub `6220c6c`. Shopify: borrador **«Sepia Coffee · equipo v12 (borrador)» (`193580826988`)**, copia de la v11 corregida de Jorge
  (`193576042860`) con los 14 archivos `sepia-equipo-v12-*`, `templates/page.equipo.liquid` y `assets/sepia-equipo-api.js` (tamaños y MD5 iguales a GitHub).
  Vista previa revisada en computador y celular, sin errores: `https://sepiacoffee.cl/pages/equipo?preview_theme_id=193580826988`. **Sin publicar**.
  Hoy la tienda muestra la v11 (tema publicado `193575944556`).
- **Ejecutó**: Claude Code · https://claude.ai/code/session_013LPJvjtj6V3tw2qf51APbK

### 23-10-2026 20:50 · contacto@sepiacoffee.cl (Jorge)
- **Pidió**: que la app se vea bien («está realmente horrible»): sacar la cuadrícula del saludo y dejar solo el rectángulo celeste, que lo que se
  selecciona sean rectángulos redondeados y no círculos, que la ficha de cada barista quede ordenada en computador y celular, todo en armonía.
- **Hecho**: v11 (`893039a`): «Mi próximo turno» legible (azul noche con letras blancas; antes salía blanco sobre blanco), menú activo como
  rectángulo celeste, saludo celeste liso, sin cuadrícula ni damero, botones/pestañas/filtros con esquinas redondeadas, ficha del equipo ordenada.
  191 pruebas pasan. Revisado con datos realistas en 1440 px y 390 px.
- **Shopify**: la v10 quedó **publicada** (tema `193575420268`, MAIN) y luego también el borrador `193575944556` (copia sin cambios) antes de subirle
  la v11. La v11 quedó en **`193576042860`** («… v11 corregida»), sin publicar; Jorge la publica a mano. Los temas `193575420268`,
  `193575944556` y `193517551980` (v9) quedan sin uso.
- **Ejecutó**: Claude Code · https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8

### 23-10-2026 20:35 · contacto@sepiacoffee.cl (Jorge)
- **Pidió**: el paso a paso para tener la app actualizada; conectó Shopify y pidió usarlo.
- **Hecho**: se vio que Manuel ya publicó la v9 («Sepia Coffee · equipo v9 (borrador)», `193517551980`, hoy MAIN). Se duplicó como
  **«Sepia Coffee · equipo v10 (borrador, Jorge)» (`193575420268`)** y se subieron los 14 archivos `sepia-equipo-v10-*` y
  `templates/page.equipo.liquid` (desde `raw.githubusercontent.com` fijado a `ff93727`; tamaños y MD5 iguales a GitHub). La conexión con
  Supabase del tema no se tocó. La vista previa carga la v10 en computador y celular, sin errores. **No se publicó.**
- **Dónde**: Shopify, tema `193575420268` (sin publicar). Vista previa: `https://sepiacoffee.cl/pages/equipo?preview_theme_id=193575420268`.
- **Ejecutó**: Claude Code · https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8

### 23-10-2026 20:40 · contacto@sepiacoffee.cl (Jorge)
- **Pidió**: dos documentos: una guía de cómo funciona la app para los baristas, y uno con todos los IDs, claves y el mensaje de
  WhatsApp para cada barista. Confirmó crear claves nuevas para los 25 baristas que nunca habían entrado.
- **Hecho**: **claves temporales nuevas para 25 cuentas** (todas las que no son administración y nunca entraron; creadas el 21-oct) con
  `restablecer_clave` (cierra sesiones y pide cambiarla al entrar). Cualquier clave anterior de esas 25 cuentas ya no sirve.
  `jorge.hurtado` y `manuel.lira` no se tocaron. Se comprobó que las 25 funcionan. Las claves **no** están en el repositorio: están en
  un Word privado de Jorge. La guía de baristas quedó en un documento de Claude de Jorge.
- **Dónde**: Supabase (`auth.users` y `accesos.debe_cambiar_clave` de esas 25 cuentas; sin migración).
- **Ejecutó**: Claude Code · https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8

### 23-10-2026 20:10 · contacto@sepiacoffee.cl (Jorge)
- **Pidió**: en el perfil de administración (solo Jorge y Manuel), un medidor de 5 niveles para la experiencia del barista y cómo hace su
  pega (Profesional, Alta, Media, Baja, Ninguna), dos iguales: con máquina y sin máquina. Y el diseño de la app inspirado en la foto de la
  futura cafetería, manteniendo el logo, su diseño y su letra (sin la figura caminando), que funcione perfecto en computador y celular.
- **Hecho**: medidores en Administrar → Equipo, guardados en la base y ocultos para los baristas. Diseño nuevo con la paleta de Manuel
  (no se tocaron sus colores ni el logo). Probado en computador (1100 px) y celular (390 px). Versión **v10**.
- **Dónde**: GitHub `ff93727` (y este commit); Supabase: migración `nivel_experiencia` (tabla `niveles`, `poner_nivel`, `eq_estado`, `eq_accion`).
  Shopify: **sin subir todavía**; falta acceso de Jorge a Temas, o que lo suba Manuel.
- **Pendiente con Manuel**: Jorge pidió que se entre con **RUT** y clave enviados por **WhatsApp**: choca con dos decisiones de Manuel
  (ID tipo `camila.perez`; correo automático al aprobar). No se cambió nada; queda para que lo conversen.
- **Ejecutó**: Claude Code · https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8

### 23-10-2026 17:00 · contacto@sepiacoffee.cl (Jorge)
- **Pidió**: comprobar que ya tiene acceso a GitHub y Supabase, y revisar el audio de Manuel («que siempre lea el archivo .md que está en GitHub»).
- **Hecho**: solo lectura. Se clonó esta rama y se leyeron `CLAUDE.md` y `BITACORA.md`; se comprobó acceso al proyecto Supabase «Sepia Crew» (`luvtodxuuqjewuguoxcx`). Sin cambios en Supabase, Shopify ni Google.
- **Dónde**: GitHub (este commit).
- **Ejecutó**: Claude Code · https://claude.ai/code/session_01AcbBF1qQ8MtNek9DtF8La8

### 23-10-2026 · manuel@sepiacoffee.cl
- **Pidió**: que cada conversación con Claude (suya o de otra persona) quede registrada en GitHub con quién lo pidió, y que Claude
  avise de los cambios de otras personas y advierta si un pedido choca con lo que pidió otra persona. Lo mismo para Supabase y las demás plataformas.
- **Hecho**: esta bitácora y las reglas de «Trabajo compartido» en `CLAUDE.md`. Quedó pendiente el aviso automático al abrir sesión
  y en cada mensaje (`.claude/settings.json`): Claude Code no deja que Claude se lo instale solo, hace falta el permiso de Manuel.
- **Dónde**: GitHub (este commit).
- **Ejecutó**: Claude Code · https://claude.ai/code/session_013LPJvjtj6V3tw2qf51APbK

### 23-10-2026 · manuel@sepiacoffee.cl
- **Pidió**: «No puedo postular, sale error».
- **Hecho**: se reprodujo en el sitio real con una cuenta de prueba (`prueba.claude`, ya borrada): postular funciona. Se arregló que la
  campana de avisos (`eq_avisos`) diera error a cuentas sin perfil de barista. Falta que Manuel mande captura del error si sigue.
- **Dónde**: Supabase (migración `avisos_sin_error_sin_perfil`), GitHub `542d66e`.
- **Ejecutó**: Claude Code · https://claude.ai/code/session_013LPJvjtj6V3tw2qf51APbK

### 22-10-2026 · manuel@sepiacoffee.cl (resumen del día, anotado después)
- **Pidió y se hizo**: logo de la tienda en Sepia Equipo; formulario «Trabaja con nosotros» a Supabase; una sola entrada (administración =
  barista marcada); solicitudes de ingreso con correo automático; confirmación automática desde 2 eventos; tarjeta amarilla (también sin perfil);
  Cenco como una tarjeta con dos turnos (camioneta); sin botón «Portal Baristas» ni cuenta de clientes en la barra; filtro con / sin máquina;
  baristas ven solo los próximos 14 días.
- **Dónde**: GitHub (commits del 22-10 en esta rama), Supabase (`esquema.sql` y `equipo.sql`), Shopify (borrador `193517551980`, sin publicar;
  página `713403400556`), Google Apps Script (`Codigo.gs`, disparadores).
- **Ejecutó**: Claude Code · https://claude.ai/code/session_013LPJvjtj6V3tw2qf51APbK
