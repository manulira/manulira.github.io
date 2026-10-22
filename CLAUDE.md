# Sepia Coffee: cómo retomar este proyecto

Lee esto primero. Detalle técnico de cada pieza: `shopify/baristas/LEEME.md` (portal de baristas y Sepia Equipo),
`shopify/README.md`, `shopify/FACTURA.md`, `shopify/PRODUCTOS.md`, `shopify/RETIRO.md`, `BRIEF-COSTAR.md` (marca y sitio).

## Con quién se trabaja

- **Manuel Lira**, dueño de Sepia Coffee (tostaduría de café de especialidad y servicio de barras para eventos, Santiago; tienda
  `sepiacoffee.cl` en Shopify). Escribe **en español y casi siempre desde el celular**: responder en español, corto y claro, sin jerga.
- **Jorge Hurtado** armó «Sepia Equipo» (la app de turnos). Su código compilado está en `shopify/equipo/fuente/`.
- Manuel está pasando a una cuenta de empresa (`manuel@sepiacoffee.cl`): las conversaciones y los conectores no se traspasan; **todo lo
  importante está en este repositorio** (rama `claude/cepia-coffee-website-ef9m00`; no se ha fusionado a `main`).

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
  prueba revisa que todas las pantallas de Sepia Equipo la respeten.
- **Códigos, IDs y claves**: el sistema es el del portal de baristas (ID tipo `camila.perez` + clave temporal que se cambia al entrar). No se toca.
- **Logos**: en Sepia Equipo va el logo horizontal azul de la tienda (`equipo/iconos/logo.png`) en la carga, la entrada, la barra y el pie; ya no el «sepia.» ni el «sepia coffee · SEPIA CREW» escritos con letras (Manuel, 22 oct). Logo de la tienda: horizontal azul. Logo cuadrado (crema): ícono de la app
  descargable y de la pestaña del navegador (`shopify/equipo/iconos/`, y favicon del tema).
- **La consola es una app aparte**: sin el menú de sepiacoffee.cl; su logo vuelve al inicio del sitio y una pestaña «Nosotros» lleva a `/pages/nosotros`.
- **Una sola entrada** (Manuel, 22 oct; reemplaza a la entrada separada): todos entran con ID y clave. La administración es una cuenta de barista
  marcada (`accesos.admin`, con `select public.hacer_admin('su.id');`): es barista y administración a la vez y cambia con «Vista barista» / «Administración».
  Ese botón y «Administrar» son **solo** de administración y la base lo exige. La entrada por correo (`public.admins`) ya no está en la consola.
- **Fuera de la consola**: historia del café y «quiénes somos» (el Nosotros es el del sitio), fotos del turno, «Necesito ayuda», pantalla de
  bienvenida con granos, y boletas y pagos (siguen en el portal de baristas).
- **De Jorge se tomó** la navegación y la forma (barra, tarjetas de evento, pestañas y próximo turno, perfil por secciones, campana de avisos,
  ranking con podio, panel de administración con accesos directos, «Ver equipo»).
- No leer ni usar la carpeta de credenciales ni los datos personales de la carpeta de traspaso de Jorge en Drive.

## Cómo se trabaja

- **Armar Sepia Equipo**: `python3 shopify/equipo/construir.py` (usa `fuente/`, `parches/` e `iconos/`; deja `assets/sepia-equipo-<VERSION>-*`, la plantilla y
  los snippets). Cada cambio al código compilado se anota con su motivo y el armado se detiene si la fuente ya no calza. **Si cambias algo ya publicado, sube
  `VERSION`** en `construir.py` (hoy `v6`) para que los navegadores no usen copias viejas. El adaptador `assets/sepia-equipo-api.js` es a mano.
- **Pruebas** (ver `shopify/baristas/LEEME.md`, sección «Probado»): SQL con `psql` sobre un Postgres vacío (`pruebas/shim-supabase.sql`, luego `esquema.sql`, `equipo.sql`
  y el archivo de pruebas) y la interfaz con `node shopify/equipo/pruebas/prueba.mjs` (145 comprobaciones; `SECCION=I` corre una parte; necesita Playwright y `PGHOST`/`PGPORT`/`PGUSER`
  de un Postgres de pruebas). Al cambiar la interfaz, correr todas antes de subir.
- **Supabase**: se corre `esquema.sql` y después `equipo.sql` en el SQL Editor cuando cambian. La URL y la clave pública (publishable) del proyecto están en Supabase →
  Project Settings → API; en el repo van como marcadores (`SUPABASE_URL`, `SUPABASE_CLAVE`) y los valores reales solo se suben al tema (`snippets/sepia-equipo-conexion.liquid`).
- **Subir a Shopify** (conector Shopify, GraphQL): escribir en el tema **publicado** está bloqueado, así que se duplica (`themeDuplicate`) y se sube al **borrador** con
  `themeFilesUpsert` (archivos grandes con `type: URL` desde `raw.githubusercontent.com` fijado al commit; archivos chicos o con claves con `TEXT`). El procesamiento es asíncrono:
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

## Estado (22 oct 2026, noche)

- Shopify: tema publicado **«Sepia Coffee · logo nuevo (borrador)» (`193484423532`)**, con Sepia Equipo v4. Borrador **«Sepia Coffee · equipo v6 (borrador)» (`193491042668`)**:
  trae v6 (logo de la tienda en la consola y una sola entrada); **falta que Manuel lo publique**. Página `equipo` (`714057089388`, plantilla `equipo`); el menú principal apunta
  «Portal Baristas» a `/pages/equipo`. Imágenes en Archivos: `sepia-coffee-logo.png` y `sepia-coffee-favicon.png`. Logo del tema: `settings.logo`, `logo_height` 50, `logo_height_mobile` 26; favicon: `settings.favicon`.
- Página «Trabaja con nosotros»: formulario de postulación (formulario de contacto de Shopify) y botón a la consola; copia en `shopify/paginas/trabaja-con-nosotros.html`.
  Los formularios de contacto (cotización, contacto, postulación) llegan al correo de contacto de la tienda (hoy `manuel@sepiacoffee.cl`).
- Supabase: al día con este repositorio (migración `admin_con_cuenta_de_barista` aplicada). Administración con cuenta de barista: `jorge.hurtado`. Manuel no tiene cuenta de barista todavía.
- Pruebas: SQL admin-clave 49, admin-barista 26, equipo 149, accesos 143, rls 184, automatización 143, historial 72; interfaz de Sepia Equipo 145.

## Pendientes y decisiones abiertas

1. Que Manuel publique el borrador v6, y antes tenga su propia cuenta de barista marcada como administración (si no, no puede entrar a la consola).
   Correos: que cotizaciones, contacto y postulaciones lleguen también a `contacto@sepiacoffee.cl` (correo de contacto de la tienda + grupo o reenvío en Google Workspace).
2. Apagar el registro abierto de usuarios en Supabase (en los ajustes de Authentication; recomendado). Los accesos se crean desde la administración, no hace falta que nadie se registre solo.
3. Apps Script (calendario y correos): puesta en marcha pendiente (`MODO_PRUEBA` = `no` e `instalarDisparadores`); ver LEEME, sección «Automatización».
4. Este repositorio es **público** y ahora contiene el código compilado de Jorge: Manuel debe decidir si lo pasa a privado.
5. Boletas y pagos siguen solo en el portal de baristas (`/pages/baristas`); no están en Sepia Equipo.
6. Borrar a mano los archivos viejos `sepia-equipo-v1/v2/v3-*` del tema (opcional).

## Lo que NO está en el repositorio (a propósito)

- Los datos personales del historial 2026, los accesos con sus claves temporales y las claves reales: eran privados y ya se cargaron en Supabase.
- La guía de instalación paso a paso (un artifact de la cuenta personal de Manuel: https://claude.ai/artifact/1BEHjEttoB8JCJEgRfpALg). Contiene los mismos SQL de este repositorio; si hace falta, se rehace desde
  `esquema.sql`, `equipo.sql` y `shopify/baristas/LEEME.md`.
- Ningún secreto: la clave pública de Supabase no es secreta, pero igual se mantiene fuera del repo.
