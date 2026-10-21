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
import os
import re
import shutil
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, 'fuente')
REPO_SHOPIFY = os.path.dirname(AQUI)
VERSION = 'v1'             # súbelo si cambias los archivos ya publicados: así el navegador no usa copias viejas
PREFIJO = 'sepia-equipo-' + VERSION + '-'

JS = ['rolldown-runtime-C60lm6uB.js', 'framework-D_rUT4EX.js', 'layout-segment-context-hvT46ZPC.js',
      'index-B0KDm-6B.js', 'client-app-3nlm5eU_.js', 'BrandStory-CKBrxk2p.js']
CSS = ['index.DiFSpdfw.css']
# nombre en la fuente → nombre armado (las imágenes se optimizaron; dos cambiaron de PNG a JPG)
IMAGENES = {'coffee-bean-real.png': 'coffee-bean-real.png', 'espresso-martini.jpg': 'espresso-martini.jpg',
            'colombia.jpg': 'colombia.jpg', 'bolivia.jpg': 'bolivia.jpg',
            'sepia-blue-64.png': 'icon-64.png', 'sepia-blue-180.png': 'icon-180.png'}

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
  "theme_color": "#33271f",
  "background_color": "#f7f5f0",
  "display": "standalone",
  "start_url": "/pages/equipo",
  "scope": "/pages/",
  "icons": [
    { "src": "{{ '%sicon-180.png' | asset_url }}", "sizes": "180x180", "type": "image/png", "purpose": "any" }
  ]
}
''' % PREFIJO


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
            # La animación de granos de café.
            t = cambiar(t, '`/images/coffee-bean-real.png`', 'window.SEPIA_EQUIPO.file(`coffee-bean-real.png`)', 2, nombre)
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
            # «Boletas y pagos»: la gestión de boletas y pagos sigue en el portal de baristas.
            t = cambiar(
                t, 'function Qe({admin:e=!1}){let[t,n]',
                'function Qe(){return(0,W.jsxs)(`section`,{className:`ops-card`,children:['
                '(0,W.jsx)(`div`,{className:`eyebrow`,children:`CIERRE DE TURNOS`}),'
                '(0,W.jsx)(`h1`,{children:`Boletas y pagos.`}),'
                '(0,W.jsx)(`p`,{children:`Las boletas de honorarios, los pagos y los reembolsos de camioneta se gestionan en el portal de baristas de Sepia Coffee.`}),'
                '(0,W.jsx)(`a`,{className:`primary-btn`,href:window.SEPIA_EQUIPO.portal||`/pages/baristas`,children:`Ir al portal de baristas`})]})}'
                'function Qe_original({admin:e=!1}){let[t,n]', 1, nombre)

        if nombre == 'BrandStory-CKBrxk2p.js':
            # Los datos de la demostración de Jorge (un ID y una clave de ejemplo) no se usan acá: no se publican.
            t = cambiar(t, 'de=`SEPIA-001`,fe=`Sepia2026!`', 'de=``,fe=``', 1, nombre)
            t = cambiar(t, '`/images/espresso-martini.png`', 'window.SEPIA_EQUIPO.file(`espresso-martini.jpg`)', 1, nombre)
            t = cambiar(t, '`/images/colombia.png`', 'window.SEPIA_EQUIPO.file(`colombia.jpg`)', 1, nombre)
            t = cambiar(t, '`/images/bolivia.jpg`', 'window.SEPIA_EQUIPO.file(`bolivia.jpg`)', 1, nombre)

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
<meta name="theme-color" content="#33271f">
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
            shutil.copyfile(os.path.join(FUENTE, nombre), os.path.join(carpeta_assets, PREFIJO + nombre))
        for origen, destino in IMAGENES.items():
            shutil.copyfile(os.path.join(FUENTE, 'imagenes', origen), os.path.join(carpeta_assets, PREFIJO + destino))
        escribir(os.path.join(carpeta_assets, PREFIJO + 'manifest.json.liquid'), MANIFIESTO)
        escribir(os.path.join(carpeta_plantillas, 'page.equipo.liquid'), plantilla())
        escribir(os.path.join(raiz, 'snippets', 'sepia-equipo-conexion.liquid'), conexion(url, clave))
    print('Listo: %d archivos de interfaz + plantilla + conexión.' % (len(js) + len(CSS) + len(IMAGENES) + 1))


if __name__ == '__main__':
    main()
