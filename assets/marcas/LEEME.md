# Logos de marcas

Los que se ven en «Marcas que han confiado en nosotros», en la página
Nosotros de la tienda.

Vienen de Wikimedia Commons, con la licencia que indica cada archivo ahí:

| Archivo | Marca | Origen | Licencia |
|---|---|---|---|
| `gap.png` | Gap | [GAP Logo.svg](https://commons.wikimedia.org/wiki/File:GAP_Logo.svg) | CC BY-SA 4.0 |
| `ugg.png` | UGG | [UGG logo.svg](https://commons.wikimedia.org/wiki/File:UGG_logo.svg) | Dominio público |
| `mac.png` | M·A·C Cosmetics | [MAC Cosmetics logo.png](https://commons.wikimedia.org/wiki/File:MAC_Cosmetics_logo.png) | Dominio público |

Están recortados al contenido y con fondo transparente. **No hace falta que
sean negros:** el CSS de la página los pinta con `filter: brightness(0)`, que
lleva los tres canales de color a cero y respeta el alfa. Por eso cualquier
logo transparente, del color que sea, sale uniforme con el resto.

La fuente preferible siempre es el kit de marca del propio cliente. Estos
salieron de Commons porque no los teníamos a mano; si el cliente manda el
suyo, reemplázalo.

## banana-republic.png
- Origen: Wikimedia Commons, `Banana Republic Logo.svg`
- Licencia: CC BY-SA 4.0
- Convertido a PNG transparente con Chromium (el SVG usa un bloque `<style>`
  con clases CSS, que los rasterizadores simples no interpretan: pintan de
  negro el `<rect class="cls-2">` de fondo, que en realidad es `fill:none`).

## skoda.png
- Origen: sitio oficial `skoda.cl` (`/assets/logos/skoda-logo.svg`)
- Es el wordmark vigente de la identidad 2022: el háček va integrado en la
  propia S, no como acento suelto encima.

## cencomalls.png
- Origen: sitio oficial `cencomalls.com` (`/files/2024-08/cencomalls_white.svg`)
- Ojo: el otro archivo del sitio, `logo-icon.svg`, trae un recuadro blanco de
  fondo y no sirve acá, porque el filtro `brightness(0)` lo pintaría negro.

## seguros-sura.png
- Origen: sitio oficial `sura.cl` (`/Style Library/KitSura/img/logo_sura.png`)
- Es el único chico del muro: 142 × 50 px, que es el tamaño al que lo publica
  SURA. Se ve bien a tamaño normal, pero en pantalla retina queda algo blando.
  Si el cliente manda el vectorial, conviene reemplazarlo.

---

Los logos son marcas registradas de sus dueños y se usan acá solo para
identificar a clientes con los que se trabajó. La versión más segura y
vigente siempre es la que entrega el propio cliente en su kit de marca.

## watts-co.png
- Origen: logo que mandó el cliente (captura del perfil de Watts Co.).
- Es un sello calado: disco negro con el texto en blanco. Acá el blanco va
  como transparente, no como blanco, así el fondo de la tarjeta se ve a
  través de las letras. Si fuera blanco opaco, brightness(0) lo pintaría
  negro también y quedaría un círculo negro macizo.

## saga-gravel-race.png
- Origen: logo que mandó el cliente (texto blanco sobre fondo azul).
- Acá al revés: la tinta es lo claro, así que el alfa sale del brillo y el
  fondo azul queda transparente.

Los dos se armaron con ia/marcas/a_tinta.py, que está en el repo.
