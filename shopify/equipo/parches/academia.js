
/* Sepia: Academia (Jorge, 24 oct). Aprender los tragos que servimos (medidas y paso a paso), las botellas (origen y qué
   tienen) y videos de YouTube. La ve todo el equipo; solo la administración crea, edita y borra (la base lo exige:
   eq_academia, eq_academia_guardar, eq_academia_borrar en equipo.sql). Las fotos van al almacenamiento «academia».
   Este código se agrega tal cual al archivo de la interfaz (construir.py); usa D (React), W y sepiaE (parches/ingreso.js). */

var SEPIA_ACA_TIPOS = { trago: { plural: `Tragos`, uno: `Trago`, icono: `🍸` }, botella: { plural: `Botellas`, uno: `Botella`, icono: `🍾` }, video: { plural: `Videos`, uno: `Video`, icono: `▶` } };
function sepiaYoutube(url) { var m = String(url || ``).match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/); return m ? m[1] : null; }
function sepiaLineas(t) { return String(t || ``).split(`\n`).map((x) => x.trim()).filter(Boolean); }
function sepiaUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => { var r = Math.random() * 16 | 0; return (c === `x` ? r : (r & 3 | 8)).toString(16); });
}
/* La foto se achica antes de subirla (máximo 1600 px, JPG): pesa menos y carga rápido en el celular. */
async function sepiaFotoAcademia(archivo) {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type || ``)) throw new Error(`Usa fotos JPG, PNG o WebP.`);
  var url = URL.createObjectURL(archivo);
  try {
    var img = await new Promise((ok, mal) => { var i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error(`No pudimos leer la foto.`)); i.src = url; });
    var f = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement(`canvas`); c.width = Math.max(1, Math.round(img.naturalWidth * f)); c.height = Math.max(1, Math.round(img.naturalHeight * f));
    c.getContext(`2d`).drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok, mal) => c.toBlob((b) => b ? ok(b) : mal(new Error(`No pudimos preparar la foto.`)), `image/jpeg`, 0.85));
  } finally { URL.revokeObjectURL(url); }
}
/* El texto largo: párrafos separados por una línea en blanco. Si un párrafo empieza con una línea corta (sin punto
   final), esa línea es su subtítulo («Origen», «Qué tiene y cómo es»). */
function SepiaTexto({ texto }) {
  var bloques = String(texto || ``).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return sepiaE(`div`, { className: `sepia-aca-texto` }, ...bloques.map((b, i) => {
    var lineas = b.split(`\n`);
    var titulo = lineas.length > 1 && lineas[0].length <= 40 && !/[.:!?]$/.test(lineas[0]) ? lineas.shift() : null;
    return sepiaE(`div`, { key: i }, titulo && sepiaE(`h3`, null, titulo), sepiaE(`p`, null, lineas.join(` `)));
  }));
}
function SepiaPortada({ post, grande }) {
  var yt = sepiaYoutube(post.video);
  var foto = (post.photoUrls || []).find(Boolean) || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null);
  var tipo = SEPIA_ACA_TIPOS[post.type] || SEPIA_ACA_TIPOS.trago;
  return sepiaE(`div`, { className: `sepia-aca-portada` + (grande ? ` es-grande` : ``) + (foto ? `` : ` sin-foto`) },
    foto ? sepiaE(`img`, { src: foto, alt: ``, loading: `lazy` }) : sepiaE(`span`, { className: `sepia-aca-icono`, "aria-hidden": `true` }, tipo.icono),
    post.type === `video` && sepiaE(`span`, { className: `sepia-aca-play`, "aria-hidden": `true` }, `▶`));
}

function SepiaAcademiaEditor({ inicial, onCancel, onSaved }) {
  var [p, setP] = D.useState(() => ({
    id: inicial.id || sepiaUuid(), nuevo: !inicial.id, type: inicial.type || `trago`, title: inicial.title || ``, summary: inicial.summary || ``,
    body: inicial.body || ``, ingredients: (inicial.ingredients || []).join(`\n`), steps: (inicial.steps || []).join(`\n`), video: inicial.video || ``,
    order: inicial.order == null ? 100 : inicial.order, published: inicial.published !== false,
    fotos: (inicial.photos || []).map((path, i) => ({ path, url: (inicial.photoUrls || [])[i] || null })) }));
  var [ocupado, setOcupado] = D.useState(false);
  var [error, setError] = D.useState(``);
  var originales = inicial.photos || [];
  var campo = (k) => (e) => { var v = e.target.type === `checkbox` ? e.target.checked : e.target.value; setP((x) => ({ ...x, [k]: v })); };
  async function subirFotos(e) {
    var lista = Array.from(e.target.files || []); e.target.value = ``;
    if (!lista.length) return;
    setOcupado(true); setError(``);
    try {
      for (var a of lista) {
        var blob = await sepiaFotoAcademia(a);
        var r = await fetch(`/api/academia/photo?postId=` + encodeURIComponent(p.id), { method: `POST`, headers: { "Content-Type": `image/jpeg` }, body: blob });
        var j = await r.json(); if (!r.ok) throw new Error(j.error || `No pudimos subir la foto.`);
        setP((x) => ({ ...x, fotos: [...x.fotos, { path: j.path, url: j.url }] }));
      }
    } catch (err) { setError(err.message); } finally { setOcupado(false); }
  }
  async function guardar(e) {
    e.preventDefault(); setOcupado(true); setError(``);
    try {
      var cuerpo = { post: { id: p.id, type: p.type, title: p.title, summary: p.summary, body: p.body, ingredients: sepiaLineas(p.ingredients),
                             steps: sepiaLineas(p.steps), video: p.video.trim(), photos: p.fotos.map((f) => f.path), order: Number(p.order) || 100, published: !!p.published },
                     removed: originales.filter((f) => !p.fotos.some((x) => x.path === f)) };
      var r = await fetch(`/api/academia`, { method: `POST`, headers: { "Content-Type": `application/json` }, body: JSON.stringify(cuerpo) });
      var j = await r.json(); if (!r.ok) throw new Error(j.error || `No pudimos guardar.`);
      onSaved(p.id);
    } catch (err) { setError(err.message); setOcupado(false); }
  }
  var etiqueta = (texto, control, ayuda) => sepiaE(`label`, { className: `sepia-aca-campo` }, sepiaE(`span`, null, texto), control, ayuda && sepiaE(`small`, null, ayuda));
  return sepiaE(`form`, { className: `ops-card sepia-aca-editor`, onSubmit: guardar },
    sepiaE(`h2`, null, p.nuevo ? `Nuevo contenido` : `Editar contenido`),
    sepiaE(`div`, { className: `sepia-aca-tipos`, role: `radiogroup`, "aria-label": `Tipo de contenido` },
      ...Object.entries(SEPIA_ACA_TIPOS).map(([k, t]) => sepiaE(`button`, { key: k, type: `button`, role: `radio`, "aria-checked": p.type === k ? `true` : `false`,
        className: p.type === k ? `active` : ``, onClick: () => setP((x) => ({ ...x, type: k })) }, `${t.icono} ${t.uno}`))),
    etiqueta(`Título`, sepiaE(`input`, { required: true, maxLength: 120, value: p.title, onChange: campo(`title`) })),
    etiqueta(`Resumen`, sepiaE(`input`, { maxLength: 300, value: p.summary, onChange: campo(`summary`) }), `Una frase que se ve en la tarjeta.`),
    p.type === `trago` && etiqueta(`Medidas`, sepiaE(`textarea`, { rows: 4, value: p.ingredients, onChange: campo(`ingredients`), placeholder: `1 jigger de Kahlúa\n1 jigger de vodka\n1 jigger de café espresso` }), `Una por línea.`),
    p.type === `trago` && etiqueta(`Paso a paso`, sepiaE(`textarea`, { rows: 5, value: p.steps, onChange: campo(`steps`) }), `Un paso por línea.`),
    etiqueta(p.type === `video` ? `Enlace de YouTube` : `Video de YouTube (opcional)`, sepiaE(`input`, { type: `url`, inputMode: `url`, value: p.video, onChange: campo(`video`), placeholder: `https://www.youtube.com/watch?v=…`, required: p.type === `video` })),
    etiqueta(`Texto`, sepiaE(`textarea`, { rows: 7, value: p.body, onChange: campo(`body`) }), `Párrafos separados por una línea en blanco. Una línea corta arriba del párrafo queda como subtítulo (por ejemplo, «Origen»).`),
    sepiaE(`div`, { className: `sepia-aca-campo` }, sepiaE(`span`, null, `Fotos`),
      sepiaE(`div`, { className: `sepia-aca-fotos-edit` },
        ...p.fotos.map((f, i) => sepiaE(`div`, { key: f.path, className: `sepia-aca-miniatura` },
          f.url ? sepiaE(`img`, { src: f.url, alt: `` }) : sepiaE(`span`, null, `📷`),
          sepiaE(`button`, { type: `button`, "aria-label": `Quitar foto ${i + 1}`, onClick: () => setP((x) => ({ ...x, fotos: x.fotos.filter((y) => y.path !== f.path) })) }, `✕`))),
        sepiaE(`label`, { className: `sepia-aca-agregar-foto` }, sepiaE(`input`, { type: `file`, accept: `image/jpeg,image/png,image/webp`, multiple: true, onChange: subirFotos, disabled: ocupado }), `+ Agregar fotos`)),
      sepiaE(`small`, null, `La primera foto es la portada. Usa fotos reales de nuestros tragos y botellas.`)),
    sepiaE(`div`, { className: `sepia-aca-fila` },
      etiqueta(`Orden`, sepiaE(`input`, { type: `number`, min: 0, max: 9999, value: p.order, onChange: campo(`order`) }), `Los números bajos van primero.`),
      sepiaE(`label`, { className: `sepia-aca-check` }, sepiaE(`input`, { type: `checkbox`, checked: p.published, onChange: campo(`published`) }), `Visible para el equipo`)),
    error && sepiaE(`p`, { className: `form-alert`, role: `alert` }, error),
    sepiaE(`div`, { className: `sepia-aca-botones` },
      sepiaE(`button`, { type: `button`, className: `secondary-btn`, onClick: onCancel, disabled: ocupado }, `Cancelar`),
      sepiaE(`button`, { type: `submit`, className: `primary-btn`, disabled: ocupado }, ocupado ? `Guardando…` : `Guardar`)));
}

function SepiaAcademia() {
  var [estado, setEstado] = D.useState({ cargando: true, error: ``, posts: [], canEdit: false });
  var [filtro, setFiltro] = D.useState(`todo`);
  var [abierto, setAbierto] = D.useState(null);
  var [editando, setEditando] = D.useState(null);
  var [aviso, setAviso] = D.useState(``);
  async function cargar() {
    try {
      var r = await fetch(`/api/academia`, { cache: `no-store` }); var j = await r.json();
      if (!r.ok) throw new Error(j.error || `No pudimos cargar la Academia.`);
      setEstado({ cargando: false, error: ``, posts: j.posts || [], canEdit: !!j.canEdit });
    } catch (e) { setEstado((s) => ({ ...s, cargando: false, error: e.message })); }
  }
  D.useEffect(() => { cargar(); }, []);
  D.useEffect(() => { try { window.scrollTo({ top: 0, behavior: `smooth` }); } catch (e) { } }, [abierto, editando]);
  async function borrar(post) {
    if (!confirm(`¿Borrar «${post.title}» de la Academia? No se puede deshacer.`)) return;
    var r = await fetch(`/api/academia?id=` + encodeURIComponent(post.id), { method: `DELETE` }); var j = await r.json();
    if (!r.ok) { setAviso(j.error || `No pudimos borrar.`); return; }
    setAbierto(null); setAviso(`Contenido borrado.`); cargar();
  }
  var posts = estado.posts;
  var cuenta = (t) => posts.filter((x) => x.type === t).length;

  if (editando) return sepiaE(`section`, { className: `sepia-academia` },
    sepiaE(SepiaAcademiaEditor, { inicial: editando, onCancel: () => setEditando(null),
      onSaved: (id) => { setEditando(null); setAbierto(id); setAviso(`Guardado.`); cargar(); } }));

  var actual = abierto && posts.find((x) => x.id === abierto);
  if (actual) {
    var tipo = SEPIA_ACA_TIPOS[actual.type] || SEPIA_ACA_TIPOS.trago;
    var yt = sepiaYoutube(actual.video);
    var fotos = (actual.photoUrls || []).filter(Boolean);
    return sepiaE(`section`, { className: `sepia-academia` },
      sepiaE(`button`, { type: `button`, className: `secondary-btn sepia-aca-volver`, onClick: () => setAbierto(null) }, `← Volver a la Academia`),
      aviso && sepiaE(`p`, { className: `sepia-aca-aviso`, role: `status` }, aviso),
      sepiaE(`article`, { className: `ops-card sepia-aca-detalle` },
        sepiaE(`div`, { className: `sepia-aca-cabeza` },
          sepiaE(`span`, { className: `sepia-aca-etiqueta` }, `${tipo.icono} ${tipo.uno}`, actual.published === false ? ` · Oculto` : ``),
          sepiaE(`h1`, null, actual.title),
          actual.summary && sepiaE(`p`, { className: `sepia-aca-resumen` }, actual.summary)),
        fotos.length > 0 && sepiaE(`div`, { className: `sepia-aca-galeria` + (fotos.length === 1 ? ` es-una` : ``) },
          ...fotos.map((u, i) => sepiaE(`img`, { key: i, src: u, alt: `${actual.title}, foto ${i + 1}`, loading: `lazy` }))),
        (actual.ingredients || []).length > 0 && sepiaE(`div`, { className: `sepia-aca-medidas` },
          sepiaE(`h2`, null, `Medidas`),
          sepiaE(`ul`, null, ...actual.ingredients.map((x, i) => sepiaE(`li`, { key: i }, x)))),
        (actual.steps || []).length > 0 && sepiaE(`div`, { className: `sepia-aca-pasos` },
          sepiaE(`h2`, null, `Paso a paso`),
          sepiaE(`ol`, null, ...actual.steps.map((x, i) => sepiaE(`li`, { key: i }, x)))),
        yt && sepiaE(`div`, { className: `sepia-aca-video` },
          actual.type !== `video` && sepiaE(`h2`, null, `Video`),
          sepiaE(`div`, { className: `sepia-aca-marco-video` },
            sepiaE(`iframe`, { src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`, title: actual.title, loading: `lazy`, allowFullScreen: true,
              allow: `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture` })),
          sepiaE(`a`, { className: `sepia-aca-enlace`, href: actual.video, target: `_blank`, rel: `noopener` }, `Ver en YouTube ↗`)),
        actual.body && sepiaE(SepiaTexto, { texto: actual.body }),
        estado.canEdit && sepiaE(`div`, { className: `sepia-aca-botones` },
          sepiaE(`button`, { type: `button`, className: `secondary-btn`, onClick: () => borrar(actual) }, `Borrar`),
          sepiaE(`button`, { type: `button`, className: `primary-btn`, onClick: () => { setAviso(``); setEditando(actual); } }, `Editar`))));
  }

  var visibles = filtro === `todo` ? posts : posts.filter((x) => x.type === filtro);
  return sepiaE(`section`, { className: `sepia-academia` },
    sepiaE(`div`, { className: `page-intro` },
      sepiaE(`div`, null,
        sepiaE(`div`, { className: `eyebrow` }, `ACADEMIA SEPIA`),
        sepiaE(`h1`, null, `Aprende el oficio`, sepiaE(`span`, { className: `greeting-dot` }, `.`)),
        sepiaE(`p`, null, `Los tragos que servimos con sus medidas, las botellas que usamos y videos para practicar.`)),
      estado.canEdit && sepiaE(`button`, { type: `button`, className: `secondary-btn`, onClick: () => { setAviso(``); setEditando({}); } }, `+ Nuevo contenido`)),
    aviso && sepiaE(`p`, { className: `sepia-aca-aviso`, role: `status` }, aviso),
    sepiaE(`div`, { className: `shift-tabs sepia-aca-filtros`, role: `tablist` },
      ...[[`todo`, `Todo`, posts.length], [`trago`, `Tragos`, cuenta(`trago`)], [`botella`, `Botellas`, cuenta(`botella`)], [`video`, `Videos`, cuenta(`video`)]].map(([k, t, n]) =>
        sepiaE(`button`, { key: k, type: `button`, role: `tab`, "aria-selected": filtro === k ? `true` : `false`, className: filtro === k ? `active` : ``, onClick: () => setFiltro(k) }, t, sepiaE(`span`, null, String(n))))),
    estado.cargando ? sepiaE(`p`, { className: `sepia-aca-vacio` }, `Cargando la Academia…`)
      : estado.error ? sepiaE(`p`, { className: `form-alert`, role: `alert` }, estado.error)
      : visibles.length === 0 ? sepiaE(`p`, { className: `sepia-aca-vacio` }, `Todavía no hay contenido acá.`)
      : sepiaE(`div`, { className: `sepia-aca-grilla` }, ...visibles.map((x) => {
          var t = SEPIA_ACA_TIPOS[x.type] || SEPIA_ACA_TIPOS.trago;
          return sepiaE(`button`, { key: x.id, type: `button`, className: `sepia-aca-tarjeta`, onClick: () => { setAviso(``); setAbierto(x.id); } },
            sepiaE(SepiaPortada, { post: x }),
            sepiaE(`span`, { className: `sepia-aca-cuerpo` },
              sepiaE(`span`, { className: `sepia-aca-etiqueta` }, `${t.icono} ${t.uno}`, x.published === false ? ` · Oculto` : ``),
              sepiaE(`strong`, null, x.title),
              x.summary && sepiaE(`span`, { className: `sepia-aca-resumen` }, x.summary)));
        })));
}
