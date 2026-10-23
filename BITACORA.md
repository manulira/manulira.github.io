# Bitácora de Sepia Coffee

Registro compartido de **quién pidió qué, qué se hizo y dónde** (GitHub, Supabase, Shopify, Google), para todas las personas
que trabajan con Claude Code en este proyecto. Las reglas están en `CLAUDE.md`, sección «Trabajo compartido». Lo más nuevo va arriba.
Hora de Santiago.

## En curso

Quién está cambiando algo ahora. Se anota al empezar un cambio y se borra al terminarlo (la entrada pasa al registro).

| Desde | Quién pidió | Qué está cambiando | Plataformas | Sesión |
|---|---|---|---|---|
| — | — | — | — | — |

## Registro

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
