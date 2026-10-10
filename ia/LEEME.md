# Generador de datos estructurados

`datos.py` es la única fuente de verdad de los productos. De ahí salen:

- el JSON-LD que va dentro del `<head>` de `index.html`
- el archivo `catalogo.json` de la raíz

Si cambiás un precio, cambialo en `datos.py` y volvé a generar, así no se
desincronizan (precios distintos entre la página y el JSON-LD penalizan en
Google y confunden a los asistentes).

```sh
cd ia
python3 genld.py      # escribe ld-tienda.json y catalogo.json
python3 genfaq.py     # escribe ld-faq.json a partir de la sección #preguntas
```

Después hay que pegar `ld-tienda.json` y `ld-faq.json` dentro de los dos
bloques `<script type="application/ld+json">` del `<head>` de `index.html`,
y copiar `catalogo.json` a la raíz.

Para comprobar que quedó bien: https://search.google.com/test/rich-results
