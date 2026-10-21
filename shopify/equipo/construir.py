#!/usr/bin/env python3
"""Arma «Sepia Equipo» para el tema de Shopify.

Toma la interfaz del equipo (fuente/: los archivos compilados tal como los entregó Jorge, con las imágenes
ya optimizadas), le hace unos pocos cambios de texto y de rutas, y deja:

  assets/sepia-equipo-<versión>-*.js|css|png|jpg|json.liquid  la interfaz, en la carpeta plana de assets del tema
  templates/page.equipo.liquid                           la plantilla de la página /pages/equipo
  snippets/sepia-equipo-conexion.liquid                  la URL y la clave pública de Supabase (en el repo, marcadores)

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
VERSION = 'v2'             # súbelo si cambias los archivos ya publicados: así el navegador no usa copias viejas
PREFIJO = 'sepia-equipo-' + VERSION + '-'

JS = ['rolldown-runtime-C60lm6uB.js', 'framework-D_rUT4EX.js', 'layout-segment-context-hvT46ZPC.js',
      'index-B0KDm-6B.js', 'client-app-3nlm5eU_.js', 'BrandStory-CKBrxk2p.js']
CSS = ['index.DiFSpdfw.css']
# nombre en la fuente → nombre armado (solo los íconos de la página: la historia de Sepia y la pantalla de bienvenida
# con sus fotos quedaron fuera)
IMAGENES = {'sepia-blue-64.png': 'icon-64.png', 'sepia-blue-180.png': 'icon-180.png'}

# Direcciones que los datos de arranque de la interfaz piden en la raíz del sitio → archivo armado
RUTAS_ARRANQUE = {'/_next/static/css/index.DiFSpdfw.css': 'index.DiFSpdfw.css',
                  '/icons/sepia-blue-64.png': 'icon-64.png',
                  '/icons/sepia-blue-180.png': 'icon-180.png',
                  '/manifest.webmanifest': 'manifest.json'}

# Shopify no acepta archivos .json en assets: va como .json.liquid (se publica como .json y puede nombrar el ícono)
MANIFIESTO = '''{
  "name": "Sepia Coffee · Equipo",
  "short_name": "Sepia",
  "description": "Tu equipo, tus turnos y la historia detrás de cada café.",
  "lang": "es-CL",
  "theme_color": "#020526",
  "background_color": "#ffffff",
  "display": "standalone",
  "start_url": "/pages/equipo",
  "scope": "/pages/",
  "icons": [
    { "src": "{{ '%sicon-180.png' | asset_url }}", "sizes": "180x180", "type": "image/png", "purpose": "any" }
  ]
}
''' % PREFIJO


# ---------------------------------------------------------------------------
# Colores: solo los de la paleta de Sepia (los mismos del portal de baristas)
# ---------------------------------------------------------------------------
PALETA = {'azul': (0x52, 0x6e, 0xa0), 'noche': (0x02, 0x05, 0x26), 'celeste': (0xb9, 0xc5, 0xd3),
          'crema': (0xe7, 0xe5, 0xd9), 'gris': (0xf2, 0xf2, 0xf2), 'blanco': (0xff, 0xff, 0xff)}
ESPECIALES = {(0x40, 0x5b, 0x8b): 'noche'}      # el azul «al pasar el mouse» de los botones


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


def cambiar(texto, antes, despues, veces=1, donde=''):
    """Reemplaza `antes` por `despues`, exigiendo que esté exactamente `veces` veces."""
    n = texto.count(antes)
    if n != veces:
        sys.exit('ERROR %s: «%s…» aparece %d veces y se esperaban %d.' % (donde, antes[:60], n, veces))
    return texto.replace(antes, despues)


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
<meta name="description" content="El espacio del equipo Sepia: turnos, nuestra historia y registro fotográfico de cada evento.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#020526">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="sepia-shell" content="v2">
<link rel="icon" href="{{ '%(p)sicon-64.png' | asset_url | split: '?' | first }}">
<link rel="apple-touch-icon" href="{{ '%(p)sicon-180.png' | asset_url | split: '?' | first }}">
<link rel="manifest" href="{{ '%(p)smanifest.json' | asset_url | split: '?' | first }}">
{%% render 'sepia-equipo-conexion' %%}
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
            escribir(os.path.join(carpeta_assets, PREFIJO + nombre), recolorear(leer(nombre)))
        for origen, destino in IMAGENES.items():
            with open(os.path.join(FUENTE, 'imagenes', origen), 'rb') as f:
                datos = f.read()
            with open(os.path.join(carpeta_assets, PREFIJO + destino), 'wb') as f:
                f.write(datos)
        escribir(os.path.join(carpeta_assets, PREFIJO + 'manifest.json.liquid'), MANIFIESTO)
        escribir(os.path.join(carpeta_plantillas, 'page.equipo.liquid'), plantilla())
        escribir(os.path.join(raiz, 'snippets', 'sepia-equipo-conexion.liquid'), conexion(url, clave))
    print('Listo: %d archivos de interfaz + plantilla + conexión.' % (len(js) + len(CSS) + len(IMAGENES) + 1))


if __name__ == '__main__':
    main()
