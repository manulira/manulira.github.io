# Generador de datos estructurados

`datos.py` es la única fuente de verdad de los productos. De ahí salen:

- el JSON-LD que va dentro del `<head>` de `index.html`
- el archivo `catalogo.json` de la raíz

Si cambias un precio, cambialo en `datos.py` y vuelve a generar, así no se
desincronizan (precios distintos entre la página y el JSON-LD penalizan en
Google y confunden a los asistentes).

```sh
cd ia
python3 gencatalogo.py  # escribe ld-tienda.json, catalogo.json y las tarjetas
python3 genpreg.py      # escribe parte_preguntas.html y ld-faq.json
python3 genrecetas.py   # escribe parte_recetas.html y ld-recetas.json
python3 inyecta.py      # pega los tres JSON-LD en el <head> de index.html
```

`inyecta.py` es el paso que antes se hacía a mano. Hazlo siempre: un precio
cambiado en `datos.py` que nunca llegó al `<head>` deja la página diciendo
una cosa y el JSON-LD otra.

`preguntas.py` y `recetas.py` hacen lo mismo con las preguntas frecuentes y
las recetas:

```sh
python3 genpreg.py      # escribe parte_preguntas.html y ld-faq.json
```

El criterio de `preguntas.py`: son las preguntas que la gente le hace a
ChatGPT, no las que una marca querría que le hicieran. Las que dan pie a una
compra cierran con una oferta; donde la respuesta honesta no favorece la
venta, va la respuesta honesta igual.



```sh
python3 genrecetas.py   # escribe parte_recetas.html y ld-recetas.json
```

Para comprobar que quedó bien: https://search.google.com/test/rich-results
