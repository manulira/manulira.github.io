# Escribe parches/cargando.svg, la animación de carga de Sepia Equipo (Jorge, 24 oct): python3 cargando-generar.py
# Las gotas y burbujas salen al azar con semilla fija (siempre iguales). Después de cambiarla, correr construir.py.
import os, random
random.seed(7)
DUR = 2.4
def f(x): return 1 - (1 - x) ** 2.4
VACIO, ESPERA, HIELO_FONDO = 215, 18, 140
liq, ice = [], []
for k in range(0, 21):
    x = k / 20; t = VACIO - (VACIO - ESPERA) * f(x)
    liq.append('%d%%{transform:translateY(%.1fpx)}' % (k * 5, t))
    ice.append('%d%%{transform:translateY(%.1fpx)}' % (k * 5, min(t, HIELO_FONDO)))

def izq(y): return 42 + (y - 100) * 24 / 212
def der(y): return 198 - (y - 100) * 24 / 212
gotas = []
for _ in range(55):
    y = random.uniform(108, 312); x = random.uniform(izq(y) + 4, der(y) - 4)
    r = random.choice([0.7, 0.9, 1.1, 1.3, 1.6, 2.0, 2.4, 2.8])
    o = random.uniform(.35, .75)
    gotas.append('<circle cx="%.1f" cy="%.1f" r="%.1f" opacity="%.2f"/>' % (x, y, r, o))
    if r >= 1.6:
        gotas.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#fff" opacity=".9"/>' % (x - r * .35, y - r * .35, r * .3))

# ola: periodo 40, amplitud 2.6
ola = 'M-80,110 ' + ' '.join('q10,-2.6 20,0 t20,0' for _ in range(10)) + ' V340 H-80 Z'
espuma = 'M-80,111.5 ' + ' '.join('q10,-2.6 20,0 t20,0' for _ in range(10))
burbujas = ''.join('<circle cx="%.1f" cy="%.1f" r="%.1f"/>' % (random.uniform(50, 190), random.uniform(113, 121), random.uniform(.6, 1.6)) for _ in range(16))

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 340" width="240" height="340" role="img" aria-label="Vaso de café helado llenándose">
<!-- Sepia Coffee · animación de carga (Jorge, 24 oct): un vaso transparente de café helado con bombilla celeste que se
     llena de abajo hacia arriba, con café y leche marmoleados y hielos que flotan. El fondo celeste lo pone la página.
     Lo escribe parches/cargando-generar.py; construir.py hace además la versión quieta (clase sc-quieto: movimiento
     reducido y error). La clase sc-pausa la detiene donde va. Solo usa transform (liviano en el celular). En la página, la variable «sc-t» adelanta la animación (empalme). -->
<style>
#sc-nivel{transform:translateY(%(espera)dpx);animation:sc-llenar %(dur)ss linear both;animation-delay:var(--sc-t,0s)}
#sc-hielos{transform:translateY(%(espera)dpx);animation:sc-flotar %(dur)ss linear both;animation-delay:var(--sc-t,0s)}
#sc-forma{transform-origin:120px 330px;animation:sc-formar %(dur)ss cubic-bezier(.25,.6,.35,1) both;animation-delay:var(--sc-t,0s)}
.sc-mece{animation:sc-mecer 3.4s ease-in-out infinite alternate;animation-delay:var(--sc-t,0s)}
.sc-ola{animation:sc-ola 2.6s linear infinite;animation-delay:var(--sc-t,0s)}
.sc-ola2{animation:sc-ola 3.8s linear infinite reverse;animation-delay:var(--sc-t,0s)}
.sc-gira1{transform-origin:120px 225px;animation:sc-gira1 7s ease-in-out infinite alternate;animation-delay:var(--sc-t,0s)}
.sc-gira2{transform-origin:110px 250px;animation:sc-gira2 9s ease-in-out infinite alternate;animation-delay:var(--sc-t,0s)}
.sc-h1{transform-origin:72px 112px;animation:sc-h1 2.9s ease-in-out infinite alternate;animation-delay:var(--sc-t,0s)}
.sc-h2{transform-origin:140px 110px;animation:sc-h2 3.3s ease-in-out infinite alternate;animation-delay:var(--sc-t,0s)}
.sc-h3{transform-origin:167px 114px;animation:sc-h3 3.7s ease-in-out infinite alternate;animation-delay:var(--sc-t,0s)}
@keyframes sc-llenar{%(liq)s}
@keyframes sc-flotar{%(ice)s}
@keyframes sc-formar{from{transform:scale(1.15,.3);opacity:.2}to{transform:none;opacity:1}}
@keyframes sc-mecer{from{transform:translateY(-1.6px)}to{transform:translateY(1.6px)}}
@keyframes sc-ola{from{transform:translateX(0)}to{transform:translateX(40px)}}
@keyframes sc-gira1{from{transform:translate(-5px,3px) rotate(-7deg)}to{transform:translate(5px,-3px) rotate(7deg)}}
@keyframes sc-gira2{from{transform:translate(6px,-2px) rotate(9deg) scale(1.04)}to{transform:translate(-6px,4px) rotate(-8deg) scale(.97)}}
@keyframes sc-h1{from{transform:translateY(-1.5px) rotate(-6deg)}to{transform:translateY(2px) rotate(4deg)}}
@keyframes sc-h2{from{transform:translateY(2px) rotate(5deg)}to{transform:translateY(-2px) rotate(-5deg)}}
@keyframes sc-h3{from{transform:translateY(-2px) rotate(-3deg)}to{transform:translateY(1.5px) rotate(7deg)}}
.sc-pausa *{animation-play-state:paused!important}
.sc-quieto *{animation:none!important}
@media (prefers-reduced-motion:reduce){.a,.sc-mece,.sc-ola,.sc-ola2,.sc-gira1,.sc-gira2,.sc-h1,.sc-h2,.sc-h3{animation:none!important}}
</style>
<defs>
<clipPath id="sc-dentro"><path d="M43.5,101 L66.5,311 Q68.5,318.5 76,318.5 L164,318.5 Q171.5,318.5 173.5,311 L196.5,101 Z"/></clipPath>
<clipPath id="sc-bajo"><rect x="-100" y="118" width="440" height="260"/></clipPath>
<linearGradient id="sc-latte" gradientUnits="userSpaceOnUse" x1="0" y1="110" x2="0" y2="330">
<stop offset="0" stop-color="#d9b690"/><stop offset=".5" stop-color="#d2aa80"/><stop offset="1" stop-color="#e6cdae"/></linearGradient>
<linearGradient id="sc-hielo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient>
<linearGradient id="sc-paredes" x1="42" x2="198" y1="0" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#5a3016" stop-opacity=".30"/><stop offset=".18" stop-color="#5a3016" stop-opacity="0"/>
<stop offset=".8" stop-color="#5a3016" stop-opacity="0"/><stop offset="1" stop-color="#5a3016" stop-opacity=".34"/></linearGradient>
<linearGradient id="sc-brillo" x1="0" x2="1" y1="0" y2="0">
<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="sc-sombra"><stop offset="0" stop-color="#020526" stop-opacity=".22"/><stop offset="1" stop-color="#020526" stop-opacity="0"/></radialGradient>
<filter id="sc-nube" x="-40%%" y="-40%%" width="180%%" height="180%%"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="sc-suave" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="sc-suave2" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="1.4"/></filter>
</defs>
<ellipse cx="122" cy="324" rx="70" ry="9" fill="url(#sc-sombra)"/>
<path d="M42,100 L66,312 Q68,320 76,320 L164,320 Q172,320 174,312 L198,100 Z" fill="#fff" fill-opacity=".14"/>
<g id="sc-bombilla">
<line x1="139" y1="308" x2="91" y2="6" stroke="#9fb6dd" stroke-width="17"/>
<line x1="134.6" y1="308.7" x2="86.6" y2="6.7" stroke="#d6e0f3" stroke-width="4" opacity=".9"/>
<line x1="145.2" y1="307" x2="97.2" y2="5" stroke="#7f98c8" stroke-width="3.2" opacity=".85"/>
</g>
<g clip-path="url(#sc-dentro)">
<g id="sc-nivel" class="a"><g class="sc-mece">
<path class="sc-ola" fill="url(#sc-latte)" d="%(ola)s"/>
<g clip-path="url(#sc-bajo)"><g id="sc-forma" class="a">
<g filter="url(#sc-nube)" class="sc-gira1">
<ellipse cx="98" cy="168" rx="30" ry="17" fill="#f4e9da" opacity=".75"/>
<ellipse cx="150" cy="222" rx="22" ry="32" fill="#f7efe4" opacity=".8"/>
<ellipse cx="96" cy="262" rx="32" ry="16" fill="#efe1cd" opacity=".7"/>
<ellipse cx="146" cy="300" rx="28" ry="13" fill="#f2e6d6" opacity=".7"/>
<ellipse cx="70" cy="215" rx="12" ry="22" fill="#c08a5a" opacity=".55"/>
</g>
<g filter="url(#sc-suave)" class="sc-gira2">
<path d="M78,140 C112,128 150,150 142,182 S96,214 112,246 S166,270 150,312" fill="none" stroke="#fbf4ea" stroke-width="9" stroke-linecap="round" opacity=".7"/>
<path d="M156,150 C176,172 142,190 152,212" fill="none" stroke="#fbf4ea" stroke-width="6" stroke-linecap="round" opacity=".6"/>
<path d="M66,240 C80,250 90,262 84,284 S92,304 104,314" fill="none" stroke="#5b2f15" stroke-width="4" stroke-linecap="round" opacity=".42"/>
<path d="M58,288 C76,282 96,292 124,286" fill="none" stroke="#6e3a1a" stroke-width="6" stroke-linecap="round" opacity=".35"/>
<path d="M164,190 C150,204 172,220 160,240" fill="none" stroke="#6b3a1c" stroke-width="4.5" stroke-linecap="round" opacity=".5"/>
<path d="M128,206 C138,216 126,232 140,240" fill="none" stroke="#7a4524" stroke-width="3.5" stroke-linecap="round" opacity=".45"/>
<ellipse cx="62" cy="168" rx="2.6" ry="5" fill="#4a250f" opacity=".55"/>
<ellipse cx="88" cy="300" rx="3" ry="2.2" fill="#4a250f" opacity=".5"/>
<ellipse cx="170" cy="262" rx="2.4" ry="4" fill="#4a250f" opacity=".45"/>
</g>
</g></g>
<path class="sc-ola2" d="%(espuma)s" fill="none" stroke="#f0e1cc" stroke-width="3.4" opacity=".85" filter="url(#sc-suave2)"/>
<g fill="#fff" opacity=".55">%(burbujas)s</g>
<rect x="30" y="113" width="180" height="240" fill="url(#sc-paredes)"/>
</g></g>
<g id="sc-hielos" class="a">
<g class="sc-h1"><rect x="56" y="97" width="32" height="29" rx="6" fill="url(#sc-hielo)" stroke="#fff" stroke-opacity=".9" stroke-width="1.4"/><path d="M61,103 L80,101" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"/><rect x="62" y="106" width="18" height="13" rx="4" fill="#fff" fill-opacity=".18"/></g>
<g class="sc-h2"><rect x="123" y="94" width="34" height="31" rx="6" fill="url(#sc-hielo)" stroke="#fff" stroke-opacity=".9" stroke-width="1.4"/><path d="M128,100 L150,98" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"/><rect x="129" y="104" width="20" height="14" rx="4" fill="#fff" fill-opacity=".18"/></g>
<g class="sc-h3"><rect x="153" y="100" width="28" height="27" rx="6" fill="url(#sc-hielo)" stroke="#fff" stroke-opacity=".85" stroke-width="1.3"/><path d="M158,106 L174,104" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/></g>
</g>
<g fill="#fff">%(gotas)s</g>
</g>
<path d="M42,100 L66,312 Q68,320 76,320 L164,320 Q172,320 174,312 L198,100" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.6"/>
<path d="M63.5,292 Q120,298 176.5,292" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.3"/>
<path d="M58,110 L76,300 L84,300 L68,110 Z" fill="url(#sc-brillo)" opacity=".75"/>
<path d="M176,112 L162,298 L166,298 L182,112 Z" fill="url(#sc-brillo)" opacity=".45"/>
<g id="sc-tapa">
<path d="M36,84 Q38,70 50,69 L190,69 Q202,70 204,84 Z" fill="#fff" fill-opacity=".16" stroke="#fff" stroke-opacity=".75" stroke-width="1.3"/>
<rect x="28" y="83" width="184" height="18" rx="8" fill="#fff" fill-opacity=".28" stroke="#fff" stroke-opacity=".9" stroke-width="1.4"/>
<path d="%(estrias)s" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>
<path d="M40,88 L200,88" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>
</g>
</svg>
''' % {'espera': ESPERA, 'dur': DUR, 'liq': ''.join(liq), 'ice': ''.join(ice), 'ola': ola, 'espuma': espuma,
       'burbujas': burbujas, 'gotas': ''.join(gotas),
       'estrias': ' '.join('M%d,92 L%d,99' % (x, x) for x in range(38, 204, 8))}
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cargando.svg'), 'w', encoding='utf-8').write(svg)
print(len(svg))
