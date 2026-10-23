#!/usr/bin/env python3
"""Arma «Sepia Equipo» para el tema de Shopify.

Toma la interfaz del equipo (fuente/: los archivos compilados tal como los entregó Jorge, con las imágenes
ya optimizadas), le hace unos pocos cambios de texto y de rutas, y deja:

  assets/sepia-equipo-<versión>-*.js|css|png|jpg|json.liquid  la interfaz, en la carpeta plana de assets del tema
  templates/page.equipo.liquid                           la plantilla de la página /pages/equipo
  snippets/sepia-equipo-conexion.liquid                  la URL y la clave pública de Supabase (en el repo, marcadores)
  snippets/sepia-equipo-sitio.liquid                     el menú del sitio, para la barra de arriba

El adaptador que la conecta a Supabase es assets/sepia-equipo-api.js (a mano, no se genera).

Uso:
  python3 construir.py                      # deja todo en el repo (shopify/assets y shopify/templates)
  python3 construir.py --salida DIR --url https://xxxx.supabase.co --clave sb_publishable_...
                                            # además deja una copia lista para subir, con la conexión escrita
                                            # (el repo lleva marcadores en el snippet de la conexión)

Cada cambio al código compilado se anota abajo con su motivo. Si el texto a cambiar no está EXACTAMENTE
las veces esperadas, el armado se detiene: así un cambio de la fuente no pasa inadvertido.
"""
import argparse
import colorsys
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, 'fuente')
REPO_SHOPIFY = os.path.dirname(AQUI)
VERSION = 'v10'            # súbelo si cambias los archivos ya publicados: así el navegador no usa copias viejas
PREFIJO = 'sepia-equipo-' + VERSION + '-'

JS = ['rolldown-runtime-C60lm6uB.js', 'framework-D_rUT4EX.js', 'layout-segment-context-hvT46ZPC.js',
      'index-B0KDm-6B.js', 'client-app-3nlm5eU_.js', 'BrandStory-CKBrxk2p.js']
CSS = ['index.DiFSpdfw.css']
# Íconos: el logo cuadrado de Sepia Coffee (equipo/iconos/). Los de 64 y 180 px los pide la interfaz con el nombre de la
# izquierda; el de 32 px (pestaña del navegador) y los de 192 y 512 px (la aplicación descargable) los usa la plantilla
# y el manifiesto. La historia de Sepia y la pantalla de bienvenida con sus fotos quedaron fuera.
IMAGENES = {'sepia-blue-64.png': 'icon-64.png', 'sepia-blue-180.png': 'icon-180.png',
            # El logo horizontal azul de la tienda (el mismo de sepiacoffee.cl): carga, entrada y barra de arriba.
            'sepia-coffee-logo.png': 'logo.png'}
ICONOS_EXTRA = ['icon-32.png', 'icon-192.png', 'icon-512.png']

# Direcciones que los datos de arranque de la interfaz piden en la raíz del sitio → archivo armado
RUTAS_ARRANQUE = {'/_next/static/css/index.DiFSpdfw.css': 'index.DiFSpdfw.css',
                  '/icons/sepia-blue-64.png': 'icon-64.png',
                  '/icons/sepia-blue-180.png': 'icon-180.png',
                  '/manifest.webmanifest': 'manifest.json'}

# Shopify no acepta archivos .json en assets: va como .json.liquid (se publica como .json y puede nombrar el ícono)
MANIFIESTO = '''{
  "name": "Sepia Coffee · Equipo",
  "short_name": "Sepia Equipo",
  "description": "Tus turnos, tu perfil y el ranking del equipo de Sepia Coffee.",
  "lang": "es-CL",
  "theme_color": "#020526",
  "background_color": "#ffffff",
  "display": "standalone",
  "start_url": "/pages/equipo",
  "scope": "/pages/",
  "icons": [
    { "src": "{{ '%(p)sicon-192.png' | asset_url | split: '?' | first }}", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "{{ '%(p)sicon-512.png' | asset_url | split: '?' | first }}", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "{{ '%(p)sicon-512.png' | asset_url | split: '?' | first }}", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
''' % {'p': PREFIJO}


# ---------------------------------------------------------------------------
# Colores: solo los de la paleta de Sepia (los mismos del portal de baristas)
# ---------------------------------------------------------------------------
PALETA = {'azul': (0x52, 0x6e, 0xa0), 'noche': (0x02, 0x05, 0x26), 'celeste': (0xb9, 0xc5, 0xd3),
          'crema': (0xe7, 0xe5, 0xd9), 'gris': (0xf2, 0xf2, 0xf2), 'blanco': (0xff, 0xff, 0xff)}
ESPECIALES = {(0x40, 0x5b, 0x8b): 'noche'}      # el azul «al pasar el mouse» de los botones


# Estilos que se agregan a los de la interfaz (solo colores de la paleta). Después va parches/diseno.css: el diseño
# inspirado en la futura cafetería (Jorge, 23 oct), que también pasa por recolorear() para que no se cuele otro color.
CSS_EXTRA = """
/* Sepia: el logo de la entrada es un enlace al inicio del sitio; «Nosotros» lleva a la página Nosotros */
a.required-profile-brand{text-decoration:none}
/* Sepia: la tarjeta amarilla (solo administración). Es la única excepción a la paleta, a pedido de Manuel: una
   tarjeta como la del fútbol se reconoce por su color. */
.sepia-amarilla{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:2px 8px 2px 5px;border-radius:999px;background:#fff6cc;color:#020526;font-size:11px;font-weight:700;vertical-align:middle;white-space:nowrap}
.sepia-amarilla-carta{display:inline-block;width:9px;height:12px;border-radius:2px;background:#f5c400;box-shadow:0 0 0 1px #c99f00}
.sepia-amarilla-panel{margin-top:10px}
.sepia-amarilla-panel .field-hint{margin:0 0 6px}
.sepia-niveles{flex:1 1 100%;grid-column:1/-1;width:100%;max-width:560px;box-sizing:border-box;margin-top:14px;padding:12px 14px;border-radius:14px;background:#f2f2f2;display:grid;gap:12px}
.sepia-niveles-nota{margin:0;font-size:12px;color:#526ea0;font-weight:600}
.sepia-medidor-cabeza{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}
.sepia-medidor-titulo{font-weight:700;color:#020526;font-size:14px}
.sepia-medidor-valor{font-size:13px;font-weight:700;color:#526ea0}
.sepia-medidor-valor.es-vacio{color:#526ea0;opacity:.7;font-weight:500}
.sepia-medidor-barra{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.sepia-medidor-paso{min-height:40px;padding:4px 2px;border:1px solid #b9c5d3;border-radius:10px;background:#ffffff;color:#020526;font:inherit;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.1}
.sepia-medidor-paso.es-lleno{background:#b9c5d3;border-color:#b9c5d3}
.sepia-medidor-paso.es-actual{background:#526ea0;border-color:#526ea0;color:#ffffff}
.sepia-medidor-paso:hover:not(:disabled){border-color:#526ea0}
.sepia-medidor-paso:focus-visible{outline:2px solid #020526;outline-offset:2px}
.sepia-medidor-paso:disabled{cursor:wait}
.sepia-medidor-texto{white-space:nowrap}
@media (max-width:480px){.sepia-medidor-barra{gap:3px}.sepia-medidor-paso{min-height:44px;padding:4px 0;font-size:10px;letter-spacing:-.2px}}
@media (max-width:350px){.sepia-medidor-paso{font-size:9px;letter-spacing:-.3px}}
.sepia-solicitud dl{display:grid;gap:6px;margin:10px 0 14px}
.sepia-solicitud dl div{display:grid;grid-template-columns:minmax(110px,34%) 1fr;gap:10px}
.sepia-solicitud dt{font-weight:600;color:#526ea0}
.sepia-solicitud dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.sepia-solicitudes>.ops-card{margin-bottom:14px}
.ops-admin-list>.ops-card.sepia-solicitud{display:block}
.sepia-solicitud h3{margin:0 0 2px}
.sepia-solicitud .ops-actions{justify-content:flex-start}
/* Sepia: el logo de la tienda (imagen) en la carga, la entrada, la barra y el pie */
.brand-logo{display:block;width:auto;height:30px;max-width:100%}
.required-profile-brand .brand-logo{height:34px}
.boot-screen .brand-logo{height:44px}
.app-footer .brand-logo{height:22px}
.login-nosotros{display:block;margin:22px auto 0;width:max-content;color:#526ea0;font-size:14px;font-weight:600;text-decoration:none}
.login-nosotros:hover{text-decoration:underline}
.login-nosotros:focus-visible{outline:2px solid #526ea0;outline-offset:3px}
/* Sepia: la barra de abajo en el celular reparte el ancho entre las pestañas que haya (con «Nosotros» son 4 o 5) */
.ops-shell.is-admin .bottom-nav,.ops-shell:not(.is-admin) .bottom-nav{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}
"""


def a_paleta(r, g, b):
    """El color de la paleta que reemplaza a (r, g, b). La interfaz de Jorge usaba además naranja y muchos beige y
    marrones; acá cada uno pasa al color de la paleta que cumple su papel: fondos claros → blanco, gris o crema;
    líneas y bordes → celeste; acentos y textos suaves → azul; textos y fondos oscuros → azul noche."""
    for nombre, v in PALETA.items():
        if (r, g, b) == v:
            return nombre
    if (r, g, b) in ESPECIALES:
        return ESPECIALES[(r, g, b)]
    h, l, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    calido = sat >= 0.10 and 10 <= h * 360 <= 75
    if l >= 0.955:
        return 'blanco'
    if calido:
        return 'crema' if l >= 0.84 else 'celeste' if l >= 0.70 else 'azul' if l >= 0.30 else 'noche'
    return 'gris' if l >= 0.915 else 'celeste' if l >= 0.70 else 'azul' if l >= 0.30 else 'noche'


def recolorear(texto):
    """Cambia cada color «#…» de un CSS por uno de la paleta (conservando la transparencia)."""
    def uno(m):
        h = m.group(0)[1:]
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        if len(h) not in (6, 8):
            return m.group(0)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        alfa = h[6:8]
        if alfa == '00':
            return m.group(0)                      # transparente: queda igual
        return '#%02x%02x%02x%s' % (PALETA[a_paleta(r, g, b)] + (alfa,))
    return re.sub(r'#[0-9a-fA-F]{3,8}\b', uno, texto)


# Direcciones del sitio a las que lleva la consola: el logo (inicio) y «Nosotros». «Nosotros» sale del menú de la tienda
# (si no está, queda /pages/nosotros). La consola NO muestra el menú del sitio: es una aplicación aparte.
SITIO = """{%- comment -%}
  Direcciones del sitio de Sepia Coffee a las que lleva la consola de «Sepia Equipo»: el logo vuelve al inicio y la
  pestaña «Nosotros» lleva a la página Nosotros de la tienda (se toma del menú principal; si no está, /pages/nosotros).
{%- endcomment -%}
{%- assign sepia_nosotros = '/pages/nosotros' -%}
{%- for link in linklists['main-menu'].links -%}
  {%- assign titulo = link.title | downcase | strip -%}
  {%- if titulo == 'nosotros' -%}{%- assign sepia_nosotros = link.url -%}{%- endif -%}
{%- endfor -%}
<script>
  window.SEPIA_EQUIPO_SITIO = { inicio: {{ routes.root_url | json }}, nosotros: {{ sepia_nosotros | json }} };
</script>
"""


def cambiar(texto, antes, despues, veces=1, donde=''):
    """Reemplaza `antes` por `despues`, exigiendo que esté exactamente `veces` veces."""
    n = texto.count(antes)
    if n != veces:
        sys.exit('ERROR %s: «%s…» aparece %d veces y se esperaban %d.' % (donde, antes[:60], n, veces))
    return texto.replace(antes, despues)


def leer_parche(nombre):
    with open(os.path.join(AQUI, 'parches', nombre), encoding='utf-8') as f:
        return f.read()


def leer(nombre):
    with open(os.path.join(FUENTE, nombre), encoding='utf-8') as f:
        return f.read()


def armar_js():
    salida = {}
    for nombre in JS:
        t = leer(nombre)

        # Entre los archivos: los «import» se hacen por nombre relativo; los archivos del tema llevan prefijo.
        for otro in JS + CSS:
            t = t.replace('./' + otro, './' + PREFIJO + otro)

        if nombre == 'index-B0KDm-6B.js':
            # Los archivos que se precargan se buscaban en «/_next/…»; acá están en la carpeta de assets del tema.
            t = cambiar(t, 'Cl=function(e){return`/`+e}', 'Cl=function(e){return window.SEPIA_EQUIPO.file(e)}', 1, nombre)

        if nombre == 'client-app-3nlm5eU_.js':
            # Cerrar sesión: «volver a /» llevaba a la portada de la tienda; se queda en esta página.
            t = cambiar(t, 'await fetch(`/api/auth/logout`,{method:`POST`}),location.assign(`/`)',
                        'await fetch(`/api/auth/logout`,{method:`POST`}),location.reload()', 1, nombre)
            t = cambiar(t, 'href:`/`,target:`_top`', 'href:location.href,target:`_top`', 2, nombre)
            # Ahora quien administra es Manuel.
            t = cambiar(t, 'Jorge o Manuel', 'Manuel', 2, nombre)
            # Un evento de un solo cupo se puede tomar «sin camioneta» (la base de datos lo permite).
            t = cambiar(t, 'none:Math.min(a,Math.max(0,t-1-r))', 'none:Math.min(a,Math.max(0,(t>1?t-1:t)-r))', 1, nombre)
            # El ranking mensual era siempre «Octubre 2026»: ahora es el mes en curso.
            t = cambiar(t, '`2026-10`', 'window.SEPIA_EQUIPO.mes().key', 3, nombre)
            t = cambiar(t, 'children:`Octubre`', 'children:window.SEPIA_EQUIPO.mes().name', 1, nombre)
            # Al completar el perfil se aceptan el uso de los datos y la boleta (la base de datos lo exige).
            t = cambiar(t, 'Tus datos personales y bancarios solo los ven tú y administración.',
                        'Tus datos personales y bancarios solo los ven tú y administración. Al completar tu perfil '
                        'aceptas que Sepia los use para coordinar y pagar tus turnos, y declaras que puedes emitir '
                        'boleta de honorarios y que la cuenta bancaria es tuya.', 1, nombre)
            # El formulario de eventos no pedía la comuna: sin ella, todo el equipo vería «Por confirmar» como lugar.
            t = cambiar(t, 'children:a(`address`,`Dirección`)}',
                        'children:[a(`address`,`Dirección`),a(`location`,`Comuna o zona (la ve todo el equipo)`)]}', 1, nombre)
            # El ID de acceso: el patrón original no es válido en los navegadores nuevos (se ignoraba con un error en la
            # consola); ahora dice lo mismo que la base de datos: 3 a 30 letras sin tilde, números, punto, guion o guion bajo.
            t = cambiar(t, 'pattern:`[A-Za-z0-9-]{3,40}`', 'pattern:`[A-Za-z0-9][A-Za-z0-9._\\\\-]{2,29}`', 1, nombre)
            # Sin «service worker» (no hay archivo para él en la tienda).
            t = cambiar(t, 'navigator.serviceWorker.register(`/sw.js`).catch(()=>{})', '0', 1, nombre)
            # ---- La entrada: una sola, con ID y clave (Manuel, 22 oct) ----
            # Todos entran igual. La administración es una cuenta de barista marcada (accesos.admin, con hacer_admin):
            # adentro cambia de vista con «Vista barista» / «Administrar», que solo ve quien es administración (la base
            # lo exige). parches/entrada.js trae lo que usa la entrada (la dirección de «Nosotros»).
            t = cambiar(t, 'function we({onSuccess:e}){let[t,n]=(0,D.useState)(``)',
                        leer_parche('entrada.js') + leer_parche('ingreso.js') + 'function we({onSuccess:e}){let[t,n]=(0,D.useState)(``)', 1, nombre)

            # ---- Solicitudes de ingreso, confirmación de postulaciones y tarjeta amarilla (Manuel, 22 oct) ----
            # parches/ingreso.js. Las reglas están en la base (esquema.sql, sección 11): acá solo se muestran.
            # El mensaje de una acción puede depender de la respuesta (p. ej. «postulación pendiente» o el ID creado).
            t = cambiar(t, 'return await F(),y(n),!0}', 'return await F(),y(typeof n==`function`?n(i):n),!0}', 1, nombre)
            # Al postular: si la base la deja pendiente (menos de 2 eventos trabajados, o amarilla), se dice eso.
            t = cambiar(t, "await I(`apply`,{eventId:U.id,vehicleMode:e},`¡Turno confirmado! Tu cupo quedó reservado.`)",
                        "await I(`apply`,{eventId:U.id,vehicleMode:e},e=>e&&e.pending?`Postulación enviada. La administración la confirmará y te avisaremos.`:`¡Turno confirmado! Tu cupo quedó reservado.`)", 1, nombre)
            # Eventos con turnos (Cenco Costanera: 3 horas sin camioneta y 4 horas con camioneta): la base los junta en una
            # tarjeta y manda en «turns» el texto de cada opción; la ventana para postular lo muestra en vez de solo «Con/Sin camioneta».
            t = cambiar(t, '[[`pickup`,`🛻`,`Con camioneta`],[`none`,`👤`,`Sin camioneta`]].map(',
                        '[[`pickup`,`🛻`,i&&i.turns&&i.turns.pickup||`Con camioneta`],[`none`,`👤`,i&&i.turns&&i.turns.none||`Sin camioneta`]].filter(([e])=>!i||!i.turns||i.turns[e]).map(', 1, nombre)
            t = cambiar(t, '(0,W.jsx)(`legend`,{children:`Elige tu turno`})',
                        '(0,W.jsx)(`legend`,{children:i&&i.turns?`Elige uno de los dos turnos`:`Elige tu turno`})', 1, nombre)
            # Administrar: un acceso «Solicitudes» con su pantalla.
            t = cambiar(t, '[`members`,`Equipo`,`Perfiles y accesos`,m,e.members.length,()=>l(`members`)],',
                        '[`members`,`Equipo`,`Perfiles y accesos`,m,e.members.length,()=>l(`members`)],'
                        '[`requests`,`Solicitudes`,`Postulaciones nuevas`,m,(e.requests||[]).length,()=>l(`requests`)],', 1, nombre)
            t = cambiar(t, 's===`home`?(0,W.jsxs)(`div`,{className:`admin-welcome`,children:[(0,W.jsx)(`h2`,{children:`¿Qué quieres hacer hoy?`}),(0,W.jsx)(`p`,{children:`Elige una opción para comenzar.`})]}):',
                        's===`home`?(0,W.jsxs)(`div`,{className:`admin-welcome`,children:[(0,W.jsx)(`h2`,{children:`¿Qué quieres hacer hoy?`}),(0,W.jsx)(`p`,{children:'
                        '(e.requests||[]).length?`Tienes ${(e.requests||[]).length===1?`1 solicitud nueva`:`${(e.requests||[]).length} solicitudes nuevas`} para entrar al equipo: revisa «Solicitudes».`:`Elige una opción para comenzar.`})]}):'
                        's===`requests`?(0,W.jsx)(SepiaSolicitudes,{data:e,busy:t,act:n}):', 1, nombre)
            # Equipo (administración): la amarilla junto al nombre, cuántos eventos lleva y el botón para ponerla o quitarla.
            t = cambiar(t, '(0,W.jsx)(`h3`,{children:e.name})]}),(0,W.jsx)(`p`,{children:e.profile.email||`Sin correo de contacto`})',
                        '(0,W.jsx)(`h3`,{children:e.name}),(0,W.jsx)(SepiaAmarilla,{yellow:e.yellow})]}),(0,W.jsx)(`p`,{children:e.profile.email||`Sin correo de contacto`})', 1, nombre)
            t = cambiar(t, 'children:e.status===`disabled`?`Restaurar acceso`:`Desactivar acceso`})',
                        'children:e.status===`disabled`?`Restaurar acceso`:`Desactivar acceso`}),(0,W.jsx)(SepiaAmarillaBoton,{member:e,busy:t,act:n}),'
                        '(0,W.jsx)(SepiaNiveles,{member:e,busy:t,act:n})', 1, nombre)
            # (Jorge, 23 oct) Después de la amarilla: los dos medidores de experiencia, con y sin máquina (solo administración).
            # Equipo de un evento: la amarilla junto al nombre de quien postuló (solo llega a la administración).
            t = cambiar(t, '(0,W.jsxs)(`div`,{children:[(0,W.jsx)(`strong`,{children:e.name}),(0,W.jsx)(`p`,{children:{pending:`Postuló · pendiente`',
                        '(0,W.jsxs)(`div`,{children:[(0,W.jsxs)(`strong`,{children:[e.name,(0,W.jsx)(SepiaAmarilla,{yellow:e.yellow})]}),(0,W.jsx)(`p`,{children:{pending:`Postuló · pendiente`', 1, nombre)
            # Esta consola es una aplicación aparte (sin el menú de la tienda), pero su logo lleva al inicio de
            # sepiacoffee.cl y hay una pestaña «Nosotros» que lleva a la página Nosotros del sitio.
            t = cambiar(t, '(0,W.jsx)(`a`,{href:`#eventos`,children:(0,W.jsx)(lt,{})})',
                        '(0,W.jsx)(`a`,{href:`/`,"aria-label":`Sepia Coffee: volver al inicio del sitio`,children:(0,W.jsx)(lt,{})})', 1, nombre)
            t = cambiar(t, '(0,W.jsx)(`span`,{className:`required-profile-brand`,children:`sepia.`})',
                        '(0,W.jsx)(`a`,{className:`required-profile-brand`,href:`/`,"aria-label":`Sepia Coffee: volver al inicio del sitio`,children:'
                        '(0,W.jsx)(`img`,{className:`brand-logo`,src:SEPIA_LOGO,alt:`Sepia Coffee`})})', 2, nombre)
            # El logo (Manuel): el de la tienda, no el «sepia.» ni el «sepia coffee · SEPIA CREW» escritos con letras. lt() es el
            # logo de la pantalla de carga, de la barra de arriba y del pie.
            t = cambiar(t, 'function lt(){return(0,W.jsxs)(`div`,{className:`brand brand-stacked`,"aria-label":`Sepia Coffee · Sepia Crew`,children:['
                           '(0,W.jsxs)(`span`,{className:`brand-name`,children:[(0,W.jsx)(`span`,{children:`sepia`}),(0,W.jsx)(`span`,{children:`coffee`})]}),'
                           '(0,W.jsx)(`span`,{className:`brand-divider`}),(0,W.jsxs)(`span`,{className:`brand-caption`,children:[`SEPIA`,(0,W.jsx)(`br`,{}),`CREW`]})]})}',
                        'var SEPIA_LOGO=(window.SEPIA_EQUIPO&&window.SEPIA_EQUIPO.files||{})[`sepia-coffee-logo.png`]||`/images/sepia-coffee-logo.png`;'
                        'function lt(){return(0,W.jsx)(`div`,{className:`brand`,children:(0,W.jsx)(`img`,{className:`brand-logo`,src:SEPIA_LOGO,alt:`Sepia Coffee`})})}', 1, nombre)
            t = cambiar(t, 'restablecerla.`})]})]})}function Te',
                        'restablecerla.`})]}),'
                        '(0,W.jsx)(`a`,{className:`login-nosotros`,href:SEPIA_NOSOTROS,children:`Nosotros`})]})}function Te', 1, nombre)
            t = cambiar(t, 'function L(e){x(e),location.hash=e,y(``),o(``)}',
                        'function L(e){if(e===`nosotros`){location.href=SEPIA_NOSOTROS;return}x(e),location.hash=e,y(``),o(``)}', 1, nombre)
            t = cambiar(t, '[`admin`,`Administrar`,se]]:[]];if(!e)', '[`admin`,`Administrar`,se]]:[],[`nosotros`,`Nosotros`,_]];if(!e)', 1, nombre)

            # ---- Lo que se dejó fuera (decisión de Manuel) ----
            # La historia de Sepia y «quiénes somos» (la pestaña «Sepia»).
            t = cambiar(t, '[`sepia`,`Sepia`,_],', '', 1, nombre)
            t = cambiar(t, ':b===`sepia`?(0,W.jsx)(S,{})', '', 1, nombre)
            # Las boletas y los pagos se gestionan en el portal de baristas: ni la pestaña ni el acceso directo.
            t = cambiar(t, '...e?.admin?[[`pagos`,`Boletas`,c]]:[],', '', 1, nombre)
            t = cambiar(t, '[`billing`,`Boletas y pagos`,`Revisar documentos`,c,null,()=>l(`billing`)],', '', 1, nombre)
            t = cambiar(t, ',(0,W.jsx)(`button`,{className:`secondary-btn`,onClick:()=>{O(null),L(`pagos`)},children:`Boleta y pago de este turno`})', '', 1, nombre)
            # «Necesito ayuda» (el WhatsApp de Manuel) y las fotos del turno.
            t = cambiar(t, '(0,W.jsx)(le,{event:U,name:e.user.name},U.id),', '', 1, nombre)
            t = cambiar(t, ',(e.admin||z.some(t=>t.event_id===U.id&&t.member_id===e.memberId&&[`approved`,`completed`].includes(t.status)))&&(0,W.jsx)(st,{eventId:U.id})', '', 1, nombre)
            # La pantalla de bienvenida con granos de café cayendo. Mientras se mostraba, el resto de la página quedaba
            # «inerte» (sin poder tocarse): hay que apagarla también, no solo dejar de dibujarla.
            t = cambiar(t, 'r(!0);let n=()=>{e&&(a(e=>e+1),r(!0))};', 'let n=()=>{};', 1, nombre)
            t = cambiar(t, 'n&&(0,W.jsx)(vt,{onComplete:o},i)', 'null', 1, nombre)
            # El fondo de las fotos de perfil con transparencia, en blanco de la paleta.
            t = cambiar(t, '`#f6f0e5`', '`#ffffff`', 1, nombre)

        if nombre == 'BrandStory-CKBrxk2p.js':
            # Los datos de la demostración de Jorge (un ID y una clave de ejemplo) no se usan acá: no se publican.
            t = cambiar(t, 'de=`SEPIA-001`,fe=`Sepia2026!`', 'de=``,fe=``', 1, nombre)

        salida[nombre] = t
    return salida


def extraer_html():
    """Del index.html de la fuente: la «carga» inicial y los scripts con los datos de arranque."""
    h = leer('index.html')
    cuerpo = h[h.index('<body>') + len('<body>'):h.index('</body>')]
    boot = re.search(r'<div class="boot-screen">.*?</div>', cuerpo, re.S).group(0)
    inline = re.findall(r'<script>(.*?)</script>', h, re.S)
    if not inline:
        sys.exit('ERROR: el index.html de la fuente no trae los scripts de arranque.')
    return boot, inline


def plantilla():
    boot, inline = extraer_html()
    archivos = {}
    for nombre in JS + CSS:
        archivos[nombre] = PREFIJO + nombre
    for origen, destino in IMAGENES.items():
        archivos[origen] = PREFIJO + destino
    mapa = ',\n'.join('      "%s": {{ "%s" | asset_url | split: "?" | first | json }}' % (k, v) for k, v in archivos.items())
    entrada = PREFIJO + 'index-B0KDm-6B.js'
    pre = '\n'.join('<link rel="modulepreload" href="{{ "%s" | asset_url | split: "?" | first }}" crossorigin>' % (PREFIJO + n)
                    for n in ['framework-D_rUT4EX.js', 'client-app-3nlm5eU_.js', 'BrandStory-CKBrxk2p.js'])
    bloques = '\n'.join('<script>\n%s\n</script>' % s for s in inline)
    # Los datos de arranque piden el CSS, los íconos y el manifiesto en «/_next/…» y «/icons/…»: acá están en assets.
    for ruta, destino in RUTAS_ARRANQUE.items():
        if ruta not in bloques:
            sys.exit('ERROR: los datos de arranque ya no mencionan ' + ruta)
        bloques = bloques.replace(ruta, "{%% endraw %%}{{ '%s' | asset_url | split: '?' | first }}{%% raw %%}" % (PREFIJO + destino))
    return '''{%% layout none %%}
{%%- comment -%%}
  SEPIA COFFEE · Sepia Equipo (página /pages/equipo)

  La interfaz del equipo (turnos, perfil, ranking, administración), conectada a la misma base de datos
  Supabase del portal de baristas. No usa el diseño de la tienda: es una página completa.
  Los archivos están en assets/sepia-equipo-*; el «servidor» es assets/sepia-equipo-api.js.
  Se arma con equipo/construir.py. La conexión con Supabase (URL y clave pública) está en
  snippets/sepia-equipo-conexion.liquid: reemplaza ahí SUPABASE_URL y SUPABASE_CLAVE antes de subirlo.
{%%- endcomment -%%}
<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sepia Coffee · Equipo</title>
<meta name="description" content="El espacio del equipo Sepia Coffee: tus turnos, tu perfil y el ranking del equipo.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#020526">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="sepia-shell" content="v2">
<link rel="icon" type="image/png" sizes="32x32" href="{{ '%(p)sicon-32.png' | asset_url | split: '?' | first }}">
<link rel="icon" type="image/png" sizes="64x64" href="{{ '%(p)sicon-64.png' | asset_url | split: '?' | first }}">
<link rel="apple-touch-icon" href="{{ '%(p)sicon-180.png' | asset_url | split: '?' | first }}">
<link rel="manifest" href="{{ '%(p)smanifest.json' | asset_url | split: '?' | first }}">
{%% render 'sepia-equipo-conexion' %%}
{%% render 'sepia-equipo-sitio' %%}
{%%- comment -%%} La carga inicial (antes de que arranque la app) muestra el logo de la tienda en lugar del «sepia.» escrito con
  letras. Se cambia solo con estilo: el HTML de la carga tiene que quedar igual al de la fuente o React falla al tomar la página. {%%- endcomment -%%}
<style>.boot-screen>span{display:block;width:234px;max-width:80vw;height:44px;font-size:0;color:transparent;background:url("{{ '%(p)slogo.png' | asset_url | split: '?' | first }}") center/contain no-repeat}</style>
{%%- comment -%%} Diseño inspirado en la futura cafetería (Jorge, 23 oct; parches/diseno.css): títulos en Poppins y textos en DM Sans,
  las mismas letras de los títulos y textos de sepiacoffee.cl. El logo sigue siendo la imagen de la tienda. {%%- endcomment -%%}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="{{ '%(p)sindex.DiFSpdfw.css' | asset_url | split: '?' | first }}" data-rsc-css-href="{{ '%(p)sindex.DiFSpdfw.css' | asset_url | split: '?' | first }}" data-precedence="vite-rsc/importer-resources">
%(pre)s
<script>
  window.SEPIA_EQUIPO = {
    portal: "/pages/baristas",
    files: {
%(mapa)s
    }
  };
  Object.assign(window.SEPIA_EQUIPO, window.SEPIA_EQUIPO_CONEXION);
</script>
<script
  src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.js"
  integrity="sha384-K1nraABOP/zFehpLIUksXebbs7jMpB8gYMlb+uhVKZcWT/9Vkq1+qhv6ndC+1Yuz"
  crossorigin="anonymous"
  defer
></script>
<script src="{{ 'sepia-equipo-api.js' | asset_url }}" defer></script>
{%% raw %%}
%(bloques)s
{%% endraw %%}
</head>
<body>%(boot)s<script type="module" src="{{ '%(entrada)s' | asset_url | split: '?' | first }}"></script></body>
</html>
''' % {'p': PREFIJO, 'pre': pre, 'mapa': mapa, 'bloques': bloques, 'boot': boot, 'entrada': entrada}


def conexion(url, clave):
    """El snippet con la conexión a Supabase: la clave pública (anon/publishable) está hecha para ir en la página;
    lo que protege los datos son las reglas de la base. En el repo lleva marcadores."""
    return '''{%%- comment -%%} Conexión de Sepia Equipo con Supabase (URL del proyecto y clave pública). {%%- endcomment -%%}
<link rel="preconnect" href="%s" crossorigin>
<script>window.SEPIA_EQUIPO_CONEXION = { url: "%s", key: "%s" };</script>
''' % (url, url, clave)


def escribir(ruta, contenido):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(contenido)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--salida', help='carpeta donde dejar además una copia lista para subir (con la conexión escrita)')
    ap.add_argument('--url', default='SUPABASE_URL')
    ap.add_argument('--clave', default='SUPABASE_CLAVE')
    a = ap.parse_args()

    js = armar_js()
    destinos = [(REPO_SHOPIFY, 'SUPABASE_URL', 'SUPABASE_CLAVE')]
    if a.salida:
        destinos.append((a.salida, a.url, a.clave))
    for raiz, url, clave in destinos:
        carpeta_assets, carpeta_plantillas = os.path.join(raiz, 'assets'), os.path.join(raiz, 'templates')
        for nombre, texto in js.items():
            escribir(os.path.join(carpeta_assets, PREFIJO + nombre), texto)
        for nombre in CSS:
            escribir(os.path.join(carpeta_assets, PREFIJO + nombre), recolorear(leer(nombre)) + CSS_EXTRA + recolorear(leer_parche('diseno.css')))
        for destino in list(IMAGENES.values()) + ICONOS_EXTRA:
            with open(os.path.join(AQUI, 'iconos', destino), 'rb') as f:
                datos = f.read()
            with open(os.path.join(carpeta_assets, PREFIJO + destino), 'wb') as f:
                f.write(datos)
        escribir(os.path.join(carpeta_assets, PREFIJO + 'manifest.json.liquid'), MANIFIESTO)
        escribir(os.path.join(carpeta_plantillas, 'page.equipo.liquid'), plantilla())
        escribir(os.path.join(raiz, 'snippets', 'sepia-equipo-conexion.liquid'), conexion(url, clave))
        escribir(os.path.join(raiz, 'snippets', 'sepia-equipo-sitio.liquid'), SITIO)
    print('Listo: %d archivos de interfaz + plantilla + conexión.' % (len(js) + len(CSS) + len(IMAGENES) + len(ICONOS_EXTRA) + 1))


if __name__ == '__main__':
    main()
