# -*- coding: utf-8 -*-
"""Genera el HTML de la sección de recetas y su JSON-LD."""
import io, json, html, os

AQUI = os.path.dirname(os.path.abspath(__file__))
from recetas import RECETAS, SITIO

def esc(t):
    return html.escape(t, quote=False)

# ---------------------------------------------------------------- HTML
partes = ["""<!-- ===================== 08 · RECETAS =====================
     Punto 5 del plan de IA: contenido útil. Cada receta va también como
     schema.org/Recipe en el JSON-LD de abajo: es de los formatos que más
     citan los asistentes cuando alguien pregunta cómo preparar algo, y
     de paso enlaza con el producto que usa. -->
<section class="modulo" id="recetas">
  <div class="wrap">
    <div class="mod-cab rev">
      <div>
        <h2 class="t-3xl">Cómo se prepara</h2>
        <p class="copy">Seis recetas con las medidas exactas. Las mismas que usamos nosotros.</p>
      </div>
      <a href="#preguntas" class="enlace-sub">Más dudas</a>
    </div>
    <div class="recetas rev">"""]

for (rid, titulo, bajada, mins, rinde, (prod, pid), arte,
     ingr, pasos, tip) in RECETAS:
    partes.append("""      <article class="receta" id="receta-%s">
        <div class="receta-cab">
          <svg class="receta-arte" viewBox="0 0 200 272" aria-hidden="true"><use href="#%s"/></svg>
          <div>
            <h3>%s</h3>
            <p class="receta-meta"><span>%d min</span><span>%s</span></p>
          </div>
        </div>
        <p class="receta-bajada">%s</p>
        <div class="receta-cuerpo">
          <div class="receta-ingr">
            <h4>Necesitas</h4>
            <ul>%s</ul>
            <p class="receta-prod">Con <a href="#producto-%s">%s</a></p>
          </div>
          <div class="receta-pasos">
            <h4>Paso a paso</h4>
            <ol>%s</ol>
          </div>
        </div>
        <p class="receta-tip"><b>Dato:</b> %s</p>
      </article>""" % (
        rid, arte, esc(titulo), mins, esc(rinde), esc(bajada),
        "".join("<li>%s</li>" % esc(i) for i in ingr),
        pid, esc(prod),
        "".join("<li>%s</li>" % esc(p) for p in pasos),
        esc(tip)))

partes.append("""    </div>
  </div>
</section>""")
io.open(os.path.join(AQUI, "parte_recetas.html"), "w", encoding="utf-8").write("\n".join(partes) + "\n")

# ---------------------------------------------------------------- JSON-LD
def iso(m):
    return "PT%dM" % m

nodos = []
for (rid, titulo, bajada, mins, rinde, (prod, pid), arte,
     ingr, pasos, tip) in RECETAS:
    nodos.append({
        "@type": "Recipe",
        "@id": SITIO + "/#receta-" + rid,
        "name": titulo,
        "description": bajada,
        "inLanguage": "es-CL",
        "author": {"@id": SITIO + "/#tienda"},
        "publisher": {"@id": SITIO + "/#tienda"},
        "totalTime": iso(mins),
        "recipeYield": rinde,
        "recipeCategory": "Bebida",
        "recipeCuisine": "Café de especialidad",
        "recipeIngredient": ingr,
        "recipeInstructions": [
            {"@type": "HowToStep", "position": i + 1, "text": p}
            for i, p in enumerate(pasos)
        ],
        "tool": {"@type": "HowToTool", "name": prod},
        "isBasedOn": {"@id": SITIO + "/#producto-" + pid},
    })

grafo = {"@context": "https://schema.org", "@graph": nodos}
io.open(os.path.join(AQUI, "ld-recetas.json"), "w", encoding="utf-8").write(
    json.dumps(grafo, ensure_ascii=False, indent=2))

print("parte_recetas.html %d bytes · ld-recetas.json %d recetas"
      % (len(io.open(os.path.join(AQUI, "parte_recetas.html"), encoding="utf-8").read()), len(nodos)))
