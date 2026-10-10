# -*- coding: utf-8 -*-
"""Saca el FAQPage del JSON-LD directamente del HTML de la seccion,
asi la pregunta que se ve y la que leen los asistentes son la misma."""
import io, json, re, html, os
from datos import SITIO

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
pagina = io.open(os.path.join(RAIZ, "index.html"), encoding="utf-8").read()
src = re.search(r'<section class="modulo" id="preguntas">.*?</section>',
                pagina, re.S).group(0)
bloques = re.findall(r"<details>\s*<summary>(.*?)</summary>\s*"
                     r'<div class="resp">(.*?)</div>', src, re.S)
assert bloques, "no encontre preguntas"

def limpiar(t):
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()

faq = {
    "@type": "FAQPage",
    "@id": SITIO + "/#preguntas",
    "inLanguage": "es-CL",
    "about": {"@id": SITIO + "/#tienda"},
    "mainEntity": [],
}
for preg, resp in bloques:
    faq["mainEntity"].append({
        "@type": "Question",
        "name": limpiar(preg),
        "acceptedAnswer": {"@type": "Answer", "text": limpiar(resp)},
    })

io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ld-faq.json"), "w", encoding="utf-8").write(
    json.dumps(faq, ensure_ascii=False, indent=2))
print("%d preguntas" % len(faq["mainEntity"]))
for q in faq["mainEntity"]:
    print("  -", q["name"])
