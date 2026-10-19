# -*- coding: utf-8 -*-
"""Genera la sección de preguntas y su FAQPage."""
import io, json, re, html, os

AQUI = os.path.dirname(os.path.abspath(__file__))
from preguntas import PREGUNTAS, GRUPOS

SITIO = "https://sepiacoffee.cl"

def limpiar(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t))).strip()

# ------------------------------------------------------------------ HTML
out = ["""<!-- ===================== 09 · PREGUNTAS FRECUENTES =====================
     Puntos 5 y 6 del plan de IA.

     Criterio: estas son las preguntas que la gente le hace a ChatGPT sobre
     matcha y café, no las que una marca querría que le hicieran. Por eso
     están «¿sirve para bajar de peso?» y «¿por qué me sabe amargo?», que no
     son cómodas pero son las que se buscan.

     Las que dan pie a una compra cierran con una oferta. Donde la respuesta
     honesta no favorece la venta, va la respuesta honesta igual: un asistente
     no cita afirmaciones de salud sin respaldo, así que exagerar acá sería
     contraproducente además de deshonesto. -->
<section class="modulo" id="preguntas">
  <div class="wrap">
    <div class="mod-cab rev" style="justify-content:center;text-align:center">
      <div>
        <h2 class="t-3xl">Lo que más nos preguntan</h2>
        <p class="copy" style="margin-inline:auto">Las dudas reales, respondidas sin adornos.</p>
      </div>
    </div>"""]

for gid, titulo, bajada in GRUPOS:
    items = [p for p in PREGUNTAS if p[0] == gid]
    if not items:
        continue
    out.append("""    <div class="faq-grupo rev">
      <div class="faq-grupo-cab">
        <h3 class="t-xl">%s</h3>
        <p>%s</p>
      </div>
      <div class="faq">""" % (html.escape(titulo), html.escape(bajada)))
    for _, preg, parrafos, oferta in items:
        cuerpo = "".join("<p>%s</p>" % p for p in parrafos)
        if oferta:
            txt, ancla = oferta
            cuerpo += ('<p class="resp-cta"><a href="#%s">%s'
                       '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'
                       '<use href="#i-der"/></svg></a></p>' % (ancla, html.escape(txt)))
        out.append("""        <details>
          <summary>%s</summary>
          <div class="resp">%s</div>
        </details>""" % (html.escape(preg), cuerpo))
    out.append("""      </div>
    </div>""")

out.append("""  </div>
</section>""")
io.open(os.path.join(AQUI, "parte_preguntas.html"), "w", encoding="utf-8").write("\n".join(out) + "\n")

# --------------------------------------------------------------- JSON-LD
faq = {
    "@type": "FAQPage",
    "@id": SITIO + "/#preguntas",
    "inLanguage": "es-CL",
    "about": {"@id": SITIO + "/#tienda"},
    "mainEntity": [],
}
for _, preg, parrafos, oferta in PREGUNTAS:
    faq["mainEntity"].append({
        "@type": "Question",
        "name": preg,
        "acceptedAnswer": {
            "@type": "Answer",
            "text": limpiar(" ".join(parrafos)),
        },
    })
io.open(os.path.join(AQUI, "ld-faq.json"), "w", encoding="utf-8").write(
    json.dumps(faq, ensure_ascii=False, indent=2))

print("parte_preguntas.html %d bytes · FAQPage con %d preguntas"
      % (len(io.open(os.path.join(AQUI, "parte_preguntas.html"), encoding="utf-8").read()),
         len(faq["mainEntity"])))
