# Sepia Coffee: cómo retomar este proyecto

Lee esto primero. Detalle técnico de cada pieza: `shopify/baristas/LEEME.md` (portal de baristas y Sepia Equipo),
`shopify/README.md`, `shopify/FACTURA.md`, `shopify/PRODUCTOS.md`, `shopify/RETIRO.md`, `BRIEF-COSTAR.md` (marca y sitio).

## Trabajo compartido (obligatorio en cada sesión; Manuel, 23 oct)

Varias personas trabajan con Claude Code en este proyecto (Manuel y quien use `contacto@sepiacoffee.cl`, entre otras). Todo queda en
`BITACORA.md`: quién pidió qué, qué se hizo, dónde y en qué sesión. Reglas:

1. **Al empezar**, antes de responder nada: `git pull` de la rama `claude/cepia-coffee-website-ef9m00` (si la sesión partió en otra rama, el
   proyecto vive en esa) y leer `BITACORA.md`. Si hay entradas de **otra persona** desde la última vez que habló quien te escribe, contárselo
   primero, corto: quién, qué pidió y qué se hizo.
2. **Quién pide**: es el correo de la cuenta de Claude de la persona que te escribe (lo trae el contexto de la sesión). Si no viene, preguntar su nombre.
3. **Antes de cambiar algo** (archivos, Supabase, Shopify, Google): volver a hacer `git pull` y revisar «En curso» y el registro.
   - Si **otra persona** pidió algo distinto o contrario sobre lo mismo, **advertir antes de hacerlo**: «Ojo: Manuel pidió el 22 oct que …
     ¿Seguro que lo cambio?». Esperar la respuesta.
   - Si otra persona lo tiene **en curso**, avisar quién y desde cuándo, y preguntar si seguir.
   - Lo mismo con «Decisiones de Manuel» (abajo): cambiarlas requiere que la persona lo confirme sabiendo que es una decisión de Manuel.
4. **Al empezar un cambio** que tome más de un mensaje, anotarlo en «En curso» y subirlo (commit + push) de inmediato, para que las demás sesiones lo vean.
5. **Al terminar cada pedido** (aunque sea solo una consulta que tocó una plataforma): agregar una entrada arriba del registro con fecha y hora de Santiago,
   quién pidió, «Pidió» (sus palabras, resumidas), «Hecho», «Dónde» (commit, migración de Supabase, id de tema o página de Shopify, Google) y
   «Ejecutó» (Claude Code + enlace de la sesión). Sacar lo suyo de «En curso». Commit y push **a la rama del proyecto** el mismo turno.
6. **Commits**: agregar la línea `Pedido-por: <correo>` al final del mensaje, junto a las de atribución.
7. **Supabase y Shopify** no guardan quién pidió: por eso todo cambio ahí se anota en la bitácora. Antes de tocar Supabase, comparar
   `list_migrations` con la bitácora; una migración que no aparece en la bitácora la hizo otra persona o se hizo a mano: avisar.
8. Al subir, si `git push` falla porque otra sesión subió antes: `git pull --rebase`, releer lo nuevo, contarlo y volver a subir.
   Nunca `push --force`.

## Con quién se trabaja

- **Manuel Lira**, dueño de Sepia Coffee (tostaduría de café de especialidad y servicio de barras para eventos, Santiago; tienda
  `sepiacoffee.cl` en Shopify). Escribe **en español y casi siempre desde el celular**: responder en español, corto y claro, sin jerga.
- **Jorge Hurtado** armó «Sepia Equipo» (la app de turnos). Su código compilado está en `shopify/equipo/fuente/`.
- Manuel está pasando a una cuenta de empresa (`manuel@sepiacoffee.cl`): las conversaciones y los conectores no se traspasan; **todo lo
  importante está en este repositorio** (rama `claude/cepia-coffee-website-ef9m00`; no se ha fusionado a `main`).
- **Dónde vive** (desde el 23 oct): organización de GitHub **SEPIA-COFFEE**, repositorio `SEPIA-COFFEE/manulira.github.io` (antes en la cuenta
  personal `manulira`; GitHub redirige la dirección vieja). La idea de Manuel: un repositorio por área (web, CRM, eventos, contabilidad), todos en
  esa organización, con la misma base de Supabase y su propia `BITACORA.md`.

## Qué hay

| Pieza | Dónde | Qué es |
|---|---|---|
| Portal de baristas | `/pages/baristas` · `shopify/baristas/`, `shopify/assets/sepia-baristas*` | Postulación a eventos, accesos con ID y clave, perfil, boletas, pagos, historial 2026. Supabase + Apps Script de Google (calendario y correos) |
| **Sepia Equipo** | `/pages/equipo` · `shopify/equipo/`, `shopify/assets/sepia-equipo-*`, `shopify/templates/page.equipo.liquid` | La app de Jorge (turnos, perfil, ranking, administración) sobre **nuestra** base de datos. Consola aparte, sin el menú del sitio |
| Base de datos | `shopify/baristas/esquema.sql` y `equipo.sql` (en ese orden) | Supabase (Postgres). Las reglas viven en la base (RLS y funciones `eq_*`), no en la pantalla |
| Tienda | `shopify/sections`, `snippets`, `layout`, `paginas/` | Portada, Nosotros, Eventos, factura, retiro |
| Sitio antiguo | raíz del repo (`index.html`, `css/`, `js/`) | Sitio estático previo a Shopify |

## Decisiones de Manuel (no volver a discutirlas)

- **Colores**: solo la paleta de Sepia: azul `#526EA0`, azul noche `#020526`, celeste `#B9C5D3`, crema `#E7E5D9`, gris `#F2F2F2`, blanco. Una
  prueba revisa que todas las pantallas de Sepia Equipo la respeten. **Única excepción**: la tarjeta amarilla (`.sepia-amarilla`, amarillo de verdad; Manuel, 22 oct).
- **Códigos, IDs y claves**: el sistema es el del portal de baristas (ID tipo `camila.perez` + clave temporal que se cambia al entrar). No se toca.
- **Logos**: en Sepia Equipo va el logo horizontal azul de la tienda (`equipo/iconos/logo.png`) en la carga, la entrada, la barra y el pie; ya no el «sepia.» ni el «sepia coffee · SEPIA CREW» escritos con letras (Manuel, 22 oct). Logo de la tienda: horizontal azul. Logo cuadrado (crema): ícono de la app
  descargable y de la pestaña del navegador (`shopify/equipo/iconos/`, y favicon del tema).
- **La consola es una app aparte**: sin el menú de sepiacoffee.cl; su logo vuelve al inicio del sitio y una pestaña «Nosotros» lleva a `/pages/nosotros`.
- **Una sola entrada** (Manuel, 22 oct; reemplaza a la entrada separada): todos entran con ID y clave. La administración es una cuenta de barista
  marcada (`accesos.admin`, con `select public.hacer_admin('su.id');`): es barista y administración a la vez y cambia con «Vista barista» / «Administración».
  Ese botón y «Administrar» son **solo** de administración y la base lo exige. La entrada por correo (`public.admins`) ya no está en la consola.
- **Ingreso de baristas** (Manuel, 22 oct): «Trabaja con nosotros» guarda la solicitud en la base (`solicitar_ingreso`); la administración la ve en
  Administrar → Solicitudes y la aprueba o rechaza; al aprobar se crea el ID y **el script de Google** le manda el correo con su ID y clave temporal
  (solo correo automático; no hay botón de WhatsApp). Cada solicitud nueva avisa también a `config.correo_solicitudes` (contacto@).
- **Postulaciones**: se confirman solas desde `config.eventos_para_confirmar` (2) eventos trabajados (asistencia registrada + historial) y sin amarilla;
  si no, quedan pendientes hasta que la administración las confirme. La administración se confirma sola.
- **Eventos con turnos** (Manuel, 22 oct): un evento partido en turnos por el script (TURNOS_FIJOS, `gcal_id` con `#3h`, `#4h`) se ve en la consola del
  equipo como **una tarjeta con dos opciones**: «con camioneta» toma el turno que la exige (el más largo, o `eventos.exige_camioneta`) y «sin camioneta» el otro;
  cada barista toma uno solo. La administración sigue viendo cada turno por separado. Cenco Costanera: 3 horas sin camioneta ($25.000), 4 horas con camioneta ($40.000).
- **Tarjeta amarilla**: la pone o quita la administración en «Equipo», también a quien todavía no entra ni completa su perfil; el barista **no** puede saberlo (ni en la pantalla ni en sus datos). Con amarilla,
  sus postulaciones esperan confirmación; se quita sola cuando le registran asistencia en un evento posterior a la tarjeta (al cerrar el evento).
- **Filtro con / sin máquina**: lo marcado a mano manda; si no, `eq_maquina` lo deduce de lo que se sirve: con café (mesa cafetero) = con máquina; solo espresso martini o carajillo (mesa martini) y Cenco = sin máquina.
- **Tienda**: sin botón «Portal Baristas» en la barra (no quedó bien) y sin ingreso de clientes (ícono de cuenta oculto).
- **Fuera de la consola**: historia del café y «quiénes somos» (el Nosotros es el del sitio), fotos del turno, «Necesito ayuda», pantalla de
  bienvenida con granos, y boletas y pagos (siguen en el portal de baristas).
- **De Jorge se tomó** la navegación y la forma (barra, tarjetas de evento, pestañas y próximo turno, perfil por secciones, campana de avisos,
  ranking con podio, panel de administración con accesos directos, «Ver equipo»).
- No leer ni usar la carpeta de credenciales ni los datos personales de la carpeta de traspaso de Jorge en Drive.

## Decisiones de Jorge (23 oct)

- **Nivel de experiencia**: cada barista tiene dos medidores iguales, **con máquina** y **sin máquina**, de 5 niveles (Ninguna, Baja, Media,
  Alta, Profesional), para medir su experiencia y cómo hace su pega. Solo la administración lo ve y lo cambia (Administrar → Equipo); el barista
  no puede saberlo, igual que la amarilla. Tabla `niveles`, `poner_nivel`, acción `skillLevel`; pruebas en `pruebas/niveles.sql` y sección L.
- **Diseño inspirado en la futura cafetería** (`equipo/parches/diseno.css`, revisado el 23 oct a pedido de Jorge): fondo crema, el saludo en un
  **rectángulo celeste liso** (sin cuadrícula), «Mi próximo turno» en azul noche con letras blancas, tarjetas blancas redondeadas, la franja de
  toldo solo arriba de la barra, títulos en Poppins (la letra de los títulos de sepiacoffee.cl). **Todo lo que se selecciona o se aprieta (menú,
  pestañas, filtros, botones) es un rectángulo de esquinas redondeadas**, no círculos ni píldoras. Ficha de cada barista ordenada: datos a la
  izquierda, amarilla y desactivar a la derecha, medidores lado a lado abajo (en el celular, una columna). **El logo se mantiene tal cual** y
  **sin la figura caminando** por ahora. Respeta la paleta de Manuel (la prueba de colores sigue pasando).
- La foto de referencia de la cafetería es **privada**: no se sube a este repositorio (es público) ni a ninguna parte.

## Cómo se trabaja

- **Armar Sepia Equipo**: `python3 shopify/equipo/construir.py` (usa `fuente/`, `parches/` e `iconos/`; deja `assets/sepia-equipo-<VERSION>-*`, la plantilla y
  los snippets). Cada cambio al código compilado se anota con su motivo y el armado se detiene si la fuente ya no calza. **Si cambias algo ya publicado, sube
  `VERSION`** en `construir.py` (hoy `v12`) para que los navegadores no usen copias viejas. El adaptador `assets/sepia-equipo-api.js` es a mano.
- **Pruebas** (ver `shopify/baristas/LEEME.md`, sección «Probado»): SQL con `psql` sobre un Postgres vacío (`pruebas/shim-supabase.sql`, luego `esquema.sql`, `equipo.sql`
  y el archivo de pruebas) y la interfaz con `node shopify/equipo/pruebas/prueba.mjs` (194 comprobaciones; `SECCION=I` corre una parte; necesita Playwright y `PGHOST`/`PGPORT`/`PGUSER`
  de un Postgres de pruebas). Al cambiar la interfaz, correr todas antes de subir.
- **Supabase**: se corre `esquema.sql` y después `equipo.sql` en el SQL Editor cuando cambian. La URL y la clave pública (publishable) del proyecto están en Supabase →
  Project Settings → API; en el repo van como marcadores (`SUPABASE_URL`, `SUPABASE_CLAVE`) y los valores reales solo se suben al tema (`snippets/sepia-equipo-conexion.liquid`).
- **Subir a Shopify** (conector Shopify, GraphQL): escribir en el tema **publicado** está bloqueado, así que se duplica (`themeDuplicate`) y se sube al **borrador** con
  `themeFilesUpsert` (archivos grandes con `type: URL` desde `raw.githubusercontent.com/SEPIA-COFFEE/manulira.github.io/<commit>/…`; archivos chicos o con claves con `TEXT`). El procesamiento es asíncrono:
  repetir la consulta hasta ver el tamaño y el `checksumMd5` correctos. **Manuel publica el tema a mano** (Tienda online → Temas → Publicar). Los `.json` de `assets` van como
  `.json.liquid`. Probar siempre en la vista previa: `https://sepiacoffee.cl/pages/equipo?preview_theme_id=<id>`. Para descargar páginas de la tienda usar un navegador (Playwright): `curl` recibe 429.
- Tampoco se pueden borrar archivos del tema por la API: los viejos (`sepia-equipo-v1/v2/v3-*`) quedan sin usar hasta que Manuel los borre.

## Cuidados técnicos (ya costaron tiempo)

- Las direcciones de los módulos de la app **no pueden llevar `?v=`** (`| asset_url | split: '?' | first`): con `?v=` el navegador carga el módulo dos veces y la app falla. El servidor de pruebas imita el `?v=`
  para atraparlo.
- La interfaz de Jorge hidrata `document` completo (React 19): agregar elementos al `<body>` antes de que cargue rompe la hidratación.
- La tienda impide mostrarse dentro de otra página (`X-Frame-Options: DENY`): por eso la consola es una página completa y no un iframe ni parte del tema.
- `signInWithOtp` con `shouldCreateUser: false` (portal de baristas): el código por correo solo llega a correos que ya existen en Supabase Auth (`crear_admin`).
- En plpgsql, un `count(*)` en el mismo `select` que una función que inserta no ve el insert (instantánea de la sentencia).

## Estado (23 oct 2026, noche)

- **v11** (Jorge, 23 oct): medidor de experiencia + diseño revisado. En GitHub (`893039a`), probada (191 + SQL); base en Supabase (migración
  `nivel_experiencia`). En Shopify: borrador **«Sepia Coffee · equipo v11 corregida» (`193576042860`)**; Jorge lo publica a mano. Antes quedó
  publicada la v10 (`193575420268`). Los temas `193575944556`, `193575420268` y `193517551980` quedan sin uso cuando se publique la v11.

- Shopify: tema publicado «botón Portal Baristas» (`193508933996`). Borrador **«Sepia Coffee · equipo v9 (borrador)» (`193517551980`)**: v9 (turnos en una tarjeta, amarilla también sin perfil) y la barra sin el botón «Portal Baristas» ni el ícono de cuenta de clientes (`snippets/sepia-portal-boton.liquid`, que ahora solo oculta la cuenta); falta que Manuel lo publique. Página `equipo` (`714057089388`, plantilla `equipo`); el menú principal apunta
  «Portal Baristas» a `/pages/equipo`. Imágenes en Archivos: `sepia-coffee-logo.png` y `sepia-coffee-favicon.png`. Logo del tema: `settings.logo`, `logo_height` 50, `logo_height_mobile` 26; favicon: `settings.favicon`.
- Página «Trabaja con nosotros» (`713403400556`): el formulario manda a `solicitar_ingreso` de Supabase (copia en `shopify/paginas/trabaja-con-nosotros.html` con marcadores
  `SUPABASE_URL`/`SUPABASE_CLAVE`; la página publicada lleva los valores reales). Cotización y contacto siguen con el formulario de Shopify (correo de contacto de la tienda, hoy `manuel@sepiacoffee.cl`).
- Supabase: al día con este repositorio. `config.eventos_para_confirmar` = 2 (encendido al publicar v7). Administración con cuenta de barista: `jorge.hurtado` y `manuel.lira`.
  El conector de Supabase pide confirmación para `drop …` y para tocar funciones que borran en `auth`: si una migración se queda colgada 60 s, es eso (usar `create or replace trigger`).
- Pruebas: SQL admin-clave 49, admin-barista 28, ingreso 62, turnos 25, equipo 149, accesos 143, rls 184, automatización 143, historial 72; script de Google 33; interfaz de Sepia Equipo 194; niveles 29.

## Pendientes y decisiones abiertas

   Correos: que cotizaciones, contacto y postulaciones lleguen también a `contacto@sepiacoffee.cl` (correo de contacto de la tienda + grupo o reenvío en Google Workspace).
2. Apagar el registro abierto de usuarios en Supabase (en los ajustes de Authentication; recomendado). Los accesos se crean desde la administración, no hace falta que nadie se registre solo.
3. Apps Script (calendario y correos): en marcha desde el 22 oct (`Codigo.gs` actualizado, `MODO_PRUEBA` = `no`, disparadores instalados; la sincronización
   del calendario ya corrió). Revisar que salgan los primeros correos (tabla `notificaciones`).
4. Este repositorio es **público** y ahora contiene el código compilado de Jorge: Manuel debe decidir si lo pasa a privado.
5. Boletas y pagos siguen solo en el portal de baristas (`/pages/baristas`); no están en Sepia Equipo.
6. Borrar a mano los archivos viejos `sepia-equipo-v1/v2/v3-*` del tema (opcional).

## Lo que NO está en el repositorio (a propósito)

- Los datos personales del historial 2026, los accesos con sus claves temporales y las claves reales: eran privados y ya se cargaron en Supabase.
- La guía de instalación paso a paso (un artifact de la cuenta personal de Manuel: https://claude.ai/artifact/1BEHjEttoB8JCJEgRfpALg). Contiene los mismos SQL de este repositorio; si hace falta, se rehace desde
  `esquema.sql`, `equipo.sql` y `shopify/baristas/LEEME.md`.
- Ningún secreto: la clave pública de Supabase no es secreta, pero igual se mantiene fuera del repo.
