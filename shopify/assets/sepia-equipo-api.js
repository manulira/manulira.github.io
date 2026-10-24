/* SEPIA COFFEE · Sepia Equipo — el «servidor» de la interfaz del equipo.
 *
 * La interfaz (assets/sepia-equipo/*) fue hecha para hablar con un servidor propio: le pide todo a /api/*.
 * Acá ese servidor es Supabase. Este archivo se pone ANTES de la interfaz e intercepta esas llamadas:
 *   · /api/auth/*   → inicio y cierre de sesión, cambio de clave (Supabase Auth). Todos entran con ID y clave;
 *                     la administración es una cuenta de barista marcada (hacer_admin, esquema.sql)
 *   · /api/crew     → funciones eq_estado y eq_accion (equipo.sql): eventos, postulaciones, perfil, administración
 *   · /api/ranking, /api/events/…/team, /api/notifications, /api/earnings, /api/integrations → funciones eq_*
 *   · /api/profile/photo → almacenamiento privado de las fotos de perfil
 *   · /api/academia (+ /photo) → la Academia: eq_academia, eq_academia_guardar/borrar y el almacenamiento «academia»
 *   · /api/admin/accounts → crear_acceso y restablecer_clave (esquema.sql)
 * Además muestra la animación de carga (el vaso de café) cuando una llamada se demora.
 *
 * Las reglas (quién ve qué, cupos, camioneta, plazos) las aplica la base de datos; acá solo se traducen
 * las llamadas y los mensajes. La sesión es la misma del portal de baristas (misma llave en el navegador).
 *
 * Configuración: window.SEPIA_EQUIPO = { url, key } (lo escribe la plantilla de la página).
 */
(function () {
  'use strict';

  /* Instalar la app: el navegador avisa que se puede instalar apenas carga la página, antes de que la interfaz
     escuche. Se guarda acá y la interfaz lo usa para instalar con un toque (construir.py). */
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.sepiaInstalar = e; });
  window.addEventListener('appinstalled', function () { window.sepiaInstalar = null; });

  var CFG = window.SEPIA_EQUIPO || {};
  var DOMINIO_ACCESO = 'equipo.sepiacoffee.cl';          // el mismo de crear_acceso() en esquema.sql
  var realFetch = window.fetch.bind(window);
  var sb = null;
  var BUCKET_PERFIL = 'perfiles';
  var BUCKET_ACADEMIA = 'academia';

  /* ------------------------------------------------------------------ */
  /* Ayudas para la interfaz (se usan en los archivos de assets/sepia-equipo-*)  */
  /* ------------------------------------------------------------------ */

  /* Dirección de un archivo de la interfaz (precargas, imágenes): están en la carpeta de assets del tema. */
  CFG.file = function (ruta) {
    var nombre = String(ruta).split('/').pop();
    return (CFG.files && CFG.files[nombre]) || '/' + ruta;
  };

  /* El mes en curso en Chile, para el ranking mensual: { key: '2026-10', name: 'Octubre' }. */
  CFG.mes = function () {
    var ahora = new Date();
    var partes = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).formatToParts(ahora);
    var anio = partes.filter(function (p) { return p.type === 'year'; })[0].value;
    var mes = partes.filter(function (p) { return p.type === 'month'; })[0].value;
    var nombre = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', month: 'long' }).format(ahora);
    return { key: anio + '-' + mes, name: nombre.charAt(0).toUpperCase() + nombre.slice(1) };
  };
  window.SEPIA_EQUIPO = CFG;

  /* ------------------------------------------------------------------ */
  /* Respuestas y errores                                                */
  /* ------------------------------------------------------------------ */

  function ok(json, status) { return { status: status || 200, json: json }; }
  function falla(status, mensaje) { return { status: status, json: { error: mensaje } }; }

  /* Traduce un error de Supabase (Auth, base de datos o red) a un mensaje para la persona. */
  function mensajeError(e, porDefecto) {
    var txt = (e && (e.message || e.msg || '')) + '';
    if (e && e.code === 'sin-sesion') return 'Tu sesión terminó. Vuelve a iniciar sesión.';
    if (/invalid login credentials|invalid_credentials/i.test(txt)) return 'ID o clave incorrectos. Revisa que no lleven espacios de más.';
    if (/banned/i.test(txt)) return 'Tu acceso está desactivado. Escríbele a Manuel.';
    if (/same password|different from the old/i.test(txt)) return 'La clave nueva tiene que ser distinta de la que ya tenías.';
    if (/password/i.test(txt) && /(short|least|weak|characters)/i.test(txt)) return 'Esa clave es muy corta o muy fácil de adivinar. Usa al menos 8 caracteres.';
    if (/signups? not allowed|user not found/i.test(txt)) return 'Ese correo no tiene acceso de administración.';
    if (/expired|invalid/i.test(txt) && /token|otp|code/i.test(txt)) return 'El código no es válido o ya venció. Pide uno nuevo.';
    if (/rate limit|too many/i.test(txt)) return 'Hubo muchos intentos seguidos. Espera un minuto e inténtalo de nuevo.';
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(txt)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
    if (e && e.code === '42501') return txt && !/permission denied|row-level security/i.test(txt) ? txt : 'No tienes permiso para hacer esto.';
    if (e && e.code === 'P0001' && txt) return txt;            // «raise exception» de la base: ya viene en español
    return porDefecto || 'No pudimos completar la acción. Inténtalo de nuevo en un momento.';
  }

  function aFalla(e, porDefecto) {
    var estado = e && e.code === 'sin-sesion' ? 401 : (e && e.code === '42501') ? 403 : /invalid login|invalid_credentials/i.test((e && e.message) || '') ? 401 : 400;
    return falla(estado, mensajeError(e, porDefecto));
  }

  /* ------------------------------------------------------------------ */
  /* Sesión y llamadas a la base                                         */
  /* ------------------------------------------------------------------ */

  async function sesion() {
    var r = await sb.auth.getSession();
    return (r && r.data && r.data.session) || null;
  }

  async function exigirSesion() {
    var s = await sesion();
    if (!s) { var e = new Error('sin sesión'); e.code = 'sin-sesion'; throw e; }
    return s;
  }

  async function rpc(nombre, args) {
    var r = await sb.rpc(nombre, args || {});
    if (r.error) throw r.error;
    return r.data;
  }

  /* ------------------------------------------------------------------ */
  /* Fotos de perfil (las firmadas se piden de a muchas)                  */
  /* ------------------------------------------------------------------ */

  var cacheFotos = {};            // id de persona → { url (o null si no tiene foto), hasta (ms) }
  var colaFotos = null;           // { ids: {id: [resolvedores]}, timer }

  function limpiarFotos() { cacheFotos = {}; }

  function pedirFotoPerfil(id) {
    var c = cacheFotos[id];
    if (c && c.hasta > Date.now()) return Promise.resolve(c.url);
    return new Promise(function (resolver) {
      if (!colaFotos) {
        colaFotos = { ids: {}, timer: setTimeout(vaciarColaFotos, 25) };
      }
      (colaFotos.ids[id] = colaFotos.ids[id] || []).push(resolver);
    });
  }

  async function vaciarColaFotos() {
    var cola = colaFotos; colaFotos = null;
    var ids = Object.keys(cola.ids);
    var urls = {};
    try {
      var rutas = await rpc('eq_fotos_perfil', { p_ids: ids });
      var lista = Object.keys(rutas || {}).map(function (k) { return rutas[k]; }).filter(Boolean);
      var firmadas = {};
      if (lista.length) {
        var f = await sb.storage.from(BUCKET_PERFIL).createSignedUrls(lista, 3600);
        if (f.error) throw f.error;
        (f.data || []).forEach(function (x) { if (x && x.signedUrl && x.path) firmadas[x.path] = x.signedUrl; });
      }
      ids.forEach(function (id) { urls[id] = rutas && rutas[id] ? (firmadas[rutas[id]] || null) : null; });
    } catch (e) {
      ids.forEach(function (id) { urls[id] = null; });
      ids = [];                  // sin respuesta confiable: no se guarda en la memoria, se reintenta después
    }
    ids.forEach(function (id) { cacheFotos[id] = { url: urls[id], hasta: Date.now() + 50 * 60 * 1000 }; });
    Object.keys(cola.ids).forEach(function (id) { cola.ids[id].forEach(function (r) { r(urls[id] || null); }); });
  }

  /* Las fotos de perfil se piden con <img src="/api/profile/photo?memberId=…">: cambia el src por una dirección
     firmada del almacenamiento privado. Sin foto, deja que la imagen falle y la interfaz muestra las iniciales. */
  function interceptarImagenes() {
    var original = Element.prototype.setAttribute;
    var descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    function esFoto(v) { return typeof v === 'string' && v.indexOf('/api/profile/photo') === 0; }
    function resolver(img, valor, poner) {
      img.__sepiaFoto = valor;
      var u = new URL(valor, location.href);
      var quien = u.searchParams.get('memberId');
      var listo = quien ? Promise.resolve(quien) : sesion().then(function (s) { return s ? s.user.id : null; });
      listo.then(function (id) { return id ? pedirFotoPerfil(id) : null; }).then(function (url) {
        if (img.__sepiaFoto !== valor) return;             // la interfaz ya pidió otra
        poner(img, url || 'data:,');
      }, function () { if (img.__sepiaFoto === valor) poner(img, 'data:,'); });
    }
    Element.prototype.setAttribute = function (nombre, valor) {
      if (this instanceof HTMLImageElement && String(nombre).toLowerCase() === 'src' && esFoto(valor)) {
        resolver(this, valor, function (img, url) { original.call(img, 'src', url); });
        return;
      }
      return original.apply(this, arguments);
    };
    if (descriptor && descriptor.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true, enumerable: descriptor.enumerable, get: descriptor.get,
        set: function (v) {
          if (esFoto(v)) { resolver(this, v, function (img, url) { descriptor.set.call(img, url); }); return; }
          descriptor.set.call(this, v);
        }
      });
    }
  }

  async function fotoPropia(meta) {
    var s = await exigirSesion();
    var r = await sb.from('baristas').select('foto_path').eq('id', s.user.id).maybeSingle();
    if (r.error) throw r.error;
    return { hasPhoto: !!(r.data && r.data.foto_path), path: r.data && r.data.foto_path, uid: s.user.id, meta: meta };
  }

  async function subirFotoPerfil(blob) {
    var s = await exigirSesion();
    if (!blob || !blob.size) return falla(400, 'No recibimos la foto.');
    if (blob.size > 2 * 1024 * 1024) return falla(400, 'La foto supera los 2 MB. Elige una más liviana.');
    var anterior = (await fotoPropia()).path;
    var ruta = s.user.id + '/foto-' + Date.now() + '.jpg';
    var up = await sb.storage.from(BUCKET_PERFIL).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    var u = await sb.from('baristas').update({ foto_path: ruta }).eq('id', s.user.id).select('id');
    if (u.error || !u.data || !u.data.length) {
      await sb.storage.from(BUCKET_PERFIL).remove([ruta]);
      if (u.error) throw u.error;
      return falla(400, 'Completa tu perfil antes de subir tu foto.');
    }
    limpiarFotos();
    if (anterior) { try { await sb.storage.from(BUCKET_PERFIL).remove([anterior]); } catch (e) { /* queda huérfana */ } }
    return ok({ ok: true });
  }

  async function quitarFotoPerfil() {
    var s = await exigirSesion();
    var anterior = (await fotoPropia()).path;
    var u = await sb.from('baristas').update({ foto_path: null }).eq('id', s.user.id).select('id');
    if (u.error) throw u.error;
    limpiarFotos();
    if (anterior) { try { await sb.storage.from(BUCKET_PERFIL).remove([anterior]); } catch (e) { /* queda huérfana */ } }
    return ok({ ok: true });
  }

  /* ------------------------------------------------------------------ */
  /* Rutas                                                               */
  /* ------------------------------------------------------------------ */

  async function manejar(metodo, u, init) {
    var ruta = u.pathname.replace(/\/+$/, '');
    var m;

    /* ----- Sesión ----- */
    if (ruta === '/api/auth/login' && metodo === 'POST') {
      var d = JSON.parse(init.body || '{}');
      var id = String(d.id || '').trim().toLowerCase();
      var clave = String(d.password || '');
      if (!id || !clave) return falla(400, 'Escribe tu ID y tu clave.');
      if (id.indexOf('@') >= 0) return falla(400, 'Eso es un correo. Entra con tu ID (por ejemplo, camila.perez) y tu clave.');
      var correo = id + '@' + DOMINIO_ACCESO;
      var r = await sb.auth.signInWithPassword({ email: correo, password: clave });
      if (r.error) throw r.error;
      limpiarFotos();
      return ok({ ok: true });
    }
    if (ruta === '/api/auth/logout' && metodo === 'POST') {
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* ya no había sesión */ }
      limpiarFotos();
      return ok({ ok: true });
    }
    if (ruta === '/api/auth/password' && metodo === 'POST') {
      var s = await exigirSesion();
      var p = JSON.parse(init.body || '{}');
      var actual = String(p.current || ''), nueva = String(p.password || ''), repetida = String(p.confirm || '');
      var yo = String((s.user.email || '').split('@')[0] || '').toLowerCase();
      if (!actual) return falla(400, 'Escribe tu clave actual.');
      var esEquipo = (s.user.email || '').indexOf('@' + DOMINIO_ACCESO) > 0;
      var minimo = esEquipo ? 8 : 10;                                   // la administración, 10 (como en el portal)
      if (nueva.length < minimo) return falla(400, 'La clave nueva tiene que tener al menos ' + minimo + ' caracteres.');
      if (nueva !== repetida) return falla(400, 'Las dos claves nuevas no son iguales.');
      if (nueva === actual) return falla(400, 'La clave nueva tiene que ser distinta de la que ya tenías.');
      if (yo.length >= 3 && esEquipo && nueva.toLowerCase().indexOf(yo) >= 0) return falla(400, 'La clave no puede llevar tu ID.');
      if (!esEquipo && yo.length >= 4 && nueva.toLowerCase().indexOf(yo) >= 0) return falla(400, 'La clave no puede llevar tu correo.');
      var v = await sb.auth.signInWithPassword({ email: s.user.email, password: actual });
      if (v.error) return falla(400, 'La clave actual no es correcta.');
      var a = await sb.auth.updateUser({ password: nueva });
      if (a.error) throw a.error;
      await rpc('acceso_clave_cambiada');                           // deja de pedirle el cambio
      await sb.auth.signOut({ scope: 'others' });                  // cierra las sesiones de otros aparatos
      return ok({ ok: true });
    }

    /* ----- Datos del equipo ----- */
    if (ruta === '/api/crew' && metodo === 'GET') {
      if (!(await sesion())) return ok({ signedIn: false });
      var estado = await rpc('eq_estado', { p_vista: u.searchParams.get('view') || null });
      if (estado && estado.photoRequired) pedirFoto();               // la foto es obligatoria (Jorge, 23 oct)
      return ok(estado);
    }
    if (ruta === '/api/crew' && metodo === 'POST') {
      await exigirSesion();
      var c = JSON.parse(init.body || '{}');
      var accion = c.action; delete c.action;
      var res = await rpc('eq_accion', { p_accion: String(accion || ''), p_datos: c });
      return ok(res || { ok: true });
    }
    if (ruta === '/api/ranking' && metodo === 'GET') {
      await exigirSesion();
      return ok(await rpc('eq_ranking'));
    }
    if ((m = /^\/api\/events\/([0-9a-f-]{36})\/team$/.exec(ruta)) && metodo === 'GET') {
      await exigirSesion();
      return ok(await rpc('eq_equipo_evento', { p_evento: m[1] }));
    }
    if (ruta === '/api/notifications' && metodo === 'GET') {
      await exigirSesion();
      return ok(await rpc('eq_avisos'));
    }
    if (ruta === '/api/notifications' && metodo === 'POST') {
      await exigirSesion();
      var n = JSON.parse(init.body || '{}');
      await rpc('eq_avisos_leer', { p_id: n.id });
      return ok({ ok: true });
    }
    if (ruta === '/api/earnings' && metodo === 'GET') {
      await exigirSesion();
      return ok(await rpc('eq_ganancias', { p_barista: u.searchParams.get('memberId') || null }));
    }
    if (ruta === '/api/integrations' && (metodo === 'GET' || metodo === 'POST')) {
      await exigirSesion();
      return ok(await rpc('eq_integraciones'));
    }
    if (ruta.indexOf('/api/billing') === 0) {
      return falla(501, 'Las boletas y los pagos se gestionan en el portal de baristas de Sepia Coffee.');
    }

    /* ----- Administración de cuentas ----- */
    if (ruta === '/api/admin/accounts' && metodo === 'POST') {
      await exigirSesion();
      var q = JSON.parse(init.body || '{}');
      if (q.action === 'create') {
        var nuevo = await rpc('crear_acceso', { p_usuario: String(q.id || '').trim(), p_nombre: String(q.name || '').trim() });
        return ok({ id: nuevo.usuario, password: nuevo.clave });
      }
      if (q.action === 'reset') {
        var cuenta = await sb.from('accesos').select('usuario').eq('id', q.memberId).maybeSingle();
        if (cuenta.error) throw cuenta.error;
        if (!cuenta.data) return falla(404, 'No encontramos esa cuenta.');
        var temporal = await rpc('restablecer_clave', { p_acceso: q.memberId });
        return ok({ id: cuenta.data.usuario, password: temporal });
      }
      return falla(400, 'Acción no reconocida.');
    }

    /* ----- Academia (Jorge, 24 oct): tragos, botellas y videos. Lo edita solo la administración. ----- */
    if (ruta === '/api/academia' && metodo === 'GET') {
      await exigirSesion();
      var aca = await rpc('eq_academia');
      var todas = [];
      (aca.posts || []).forEach(function (x) { (x.photos || []).forEach(function (f) { todas.push(f); }); });
      var firmadas = {};
      if (todas.length) {
        var fs = await sb.storage.from(BUCKET_ACADEMIA).createSignedUrls(todas, 3600);
        if (!fs.error) (fs.data || []).forEach(function (f) { if (f && f.signedUrl) firmadas[f.path] = f.signedUrl; });
      }
      (aca.posts || []).forEach(function (x) { x.photoUrls = (x.photos || []).map(function (f) { return firmadas[f] || null; }); });
      return ok(aca);
    }
    if (ruta === '/api/academia/photo' && metodo === 'POST') {
      await exigirSesion();
      var idPost = String(u.searchParams.get('postId') || '');
      if (!/^[0-9a-f-]{36}$/.test(idPost)) return falla(400, 'Contenido no válido.');
      var foto = init.body;
      if (!foto || !foto.size) return falla(400, 'No recibimos la foto.');
      if (foto.size > 3 * 1024 * 1024) return falla(400, 'La foto supera los 3 MB.');
      var rutaFoto = idPost + '/foto-' + Date.now() + '-' + Math.floor(Math.random() * 1e4) + '.jpg';
      var subida = await sb.storage.from(BUCKET_ACADEMIA).upload(rutaFoto, foto, { contentType: 'image/jpeg', upsert: false });
      if (subida.error) return falla(403, 'Solo la administración puede subir fotos a la Academia.');
      var url1 = await sb.storage.from(BUCKET_ACADEMIA).createSignedUrls([rutaFoto], 3600);
      return ok({ path: rutaFoto, url: url1.data && url1.data[0] && url1.data[0].signedUrl });
    }
    if (ruta === '/api/academia' && metodo === 'POST') {
      await exigirSesion();
      var q2 = JSON.parse(init.body || '{}');
      var guardado = await rpc('eq_academia_guardar', { p: q2.post || {} });
      var quitadas = (q2.removed || []).filter(function (f) { return typeof f === 'string' && f; });
      if (quitadas.length) { try { await sb.storage.from(BUCKET_ACADEMIA).remove(quitadas); } catch (e) { /* quedan sin uso */ } }
      return ok(guardado);
    }
    if (ruta === '/api/academia' && metodo === 'DELETE') {
      await exigirSesion();
      var borrado = await rpc('eq_academia_borrar', { p_id: u.searchParams.get('id') });
      if (borrado && borrado.photos && borrado.photos.length) { try { await sb.storage.from(BUCKET_ACADEMIA).remove(borrado.photos); } catch (e) { /* quedan sin uso */ } }
      return ok({ ok: true });
    }

    /* ----- Foto de perfil ----- */
    if (ruta === '/api/profile/photo') {
      if (metodo === 'GET' && u.searchParams.get('meta')) { var fp = await fotoPropia(); return ok({ hasPhoto: fp.hasPhoto }); }
      if (metodo === 'POST') return subirFotoPerfil(init.body);
      if (metodo === 'DELETE') return quitarFotoPerfil();
    }

    return falla(404, 'Esta función no está disponible en la web de Sepia.');
  }

  /* ------------------------------------------------------------------ */
  /* Ajustar la foto al círculo (Jorge, 23 oct)                          */
  /* ------------------------------------------------------------------ */
  /* Al elegir una foto se abre una ventana para moverla y acercarla dentro del círculo de la app. Devuelve la
     foto recortada (cuadrada, JPG) o falla con «No se cambió la foto.» si la persona cancela. La interfaz la usa al
     subir la foto (construir.py) y también la ventana de la foto obligatoria (abajo). */
  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (hijos || []).forEach(function (h) { n.appendChild(h); });
    return n;
  }
  CFG.recortar = function (archivo) {
    if (!archivo || !/^image\//.test(archivo.type || '')) return Promise.resolve(archivo);   // la interfaz avisa el formato
    return new Promise(function (resolver, rechazar) {
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); rechazar(new Error('No pudimos leer la foto. Prueba con otra.')); };
      img.onload = function () {
        var S = Math.max(200, Math.min(300, window.innerWidth - 72));
        var base = Math.max(S / img.naturalWidth, S / img.naturalHeight), z = 1, x = 0, y = 0;
        var lienzo = el('canvas', { width: S * 2, height: S * 2, class: 'sepia-recorte-lienzo', 'aria-label': 'Vista previa de tu foto' });
        lienzo.style.width = lienzo.style.height = S + 'px';
        var zoom = el('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Acercar o alejar' });
        var cancelar = el('button', { type: 'button', class: 'secondary-btn', text: 'Cancelar' });
        var usar = el('button', { type: 'button', class: 'primary-btn', text: 'Usar esta foto' });
        var marco = el('div', { class: 'sepia-recorte-marco' }, [lienzo, el('div', { class: 'sepia-recorte-circulo', 'aria-hidden': 'true' })]);
        marco.style.width = marco.style.height = S + 'px';
        var caja = el('div', { class: 'sepia-recorte', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ajusta tu foto' }, [
          el('div', { class: 'sepia-recorte-caja' }, [
            el('h2', { text: 'Ajusta tu foto' }),
            el('p', { text: 'Arrastra para moverla y usa la barra para acercarla. Lo que quede dentro del círculo es lo que verá el equipo.' }),
            marco,
            el('label', { class: 'sepia-recorte-zoom' }, [el('span', { text: '−' }), zoom, el('span', { text: '+' })]),
            el('div', { class: 'sepia-recorte-botones' }, [cancelar, usar])])]);
        function limitar() {
          var w = img.naturalWidth * base * z, h = img.naturalHeight * base * z;
          var mx = Math.max(0, (w - S) / 2), my = Math.max(0, (h - S) / 2);
          x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
        }
        function dibujar(c, lado) {
          var f = lado / S, w = img.naturalWidth * base * z * f, h = img.naturalHeight * base * z * f;
          var g = c.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, lado, lado);
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, (lado - w) / 2 + x * f, (lado - h) / 2 + y * f, w, h);
        }
        function pintar() { limitar(); dibujar(lienzo, S * 2); }
        var arrastre = null;
        lienzo.addEventListener('pointerdown', function (e) { arrastre = { px: e.clientX, py: e.clientY, x: x, y: y }; lienzo.setPointerCapture(e.pointerId); e.preventDefault(); });
        lienzo.addEventListener('pointermove', function (e) { if (!arrastre) return; x = arrastre.x + e.clientX - arrastre.px; y = arrastre.y + e.clientY - arrastre.py; pintar(); });
        lienzo.addEventListener('pointerup', function () { arrastre = null; });
        lienzo.addEventListener('pointercancel', function () { arrastre = null; });
        zoom.addEventListener('input', function () { z = parseFloat(zoom.value) || 1; pintar(); });
        function cerrar() { caja.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', tecla); }
        function tecla(e) { if (e.key === 'Escape') { cerrar(); rechazar(new Error('No se cambió la foto.')); } }
        document.addEventListener('keydown', tecla);
        cancelar.addEventListener('click', function () { cerrar(); rechazar(new Error('No se cambió la foto.')); });
        usar.addEventListener('click', function () {
          var salida = document.createElement('canvas'); salida.width = salida.height = 640;
          dibujar(salida, 640);
          salida.toBlob(function (b) {
            cerrar();
            if (!b) { rechazar(new Error('No pudimos preparar la foto.')); return; }
            resolver(new File([b], 'foto-perfil.jpg', { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.9);
        });
        document.body.appendChild(caja);
        pintar();
        usar.focus();
      };
      img.src = url;
    });
  };

  /* ------------------------------------------------------------------ */
  /* Foto obligatoria (Jorge, 23 oct)                                   */
  /* ------------------------------------------------------------------ */
  /* Si la base dice que falta la foto (eq_estado → photoRequired), se pide antes de seguir. Sin foto la base tampoco
     deja postular. */
  var pidiendoFoto = false;
  function pedirFoto() {
    if (pidiendoFoto || document.querySelector('.sepia-foto-obligatoria')) return;
    pidiendoFoto = true;
    var entrada = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sepia-foto-archivo' });
    var elegir = el('button', { type: 'button', class: 'primary-btn', text: 'Elegir mi foto' });
    var aviso = el('p', { class: 'sepia-foto-aviso', role: 'status' });
    var salir = el('button', { type: 'button', class: 'text-btn', text: 'Cerrar sesión' });
    var capa = el('div', { class: 'sepia-foto-obligatoria', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sube tu foto de perfil' }, [
      el('div', { class: 'sepia-foto-caja' }, [
        el('div', { class: 'sepia-foto-icono', 'aria-hidden': 'true', text: '📷' }),
        el('h2', { text: 'Falta tu foto de perfil' }),
        el('p', { text: 'Para entrar al equipo necesitamos una foto tuya, de frente y con buena luz. La verán el equipo y la administración junto a tu nombre en los eventos.' }),
        entrada, elegir, aviso, salir])]);
    elegir.addEventListener('click', function () { entrada.click(); });
    salir.addEventListener('click', function () { (sb ? sb.auth.signOut() : Promise.resolve()).finally(function () { location.reload(); }); });
    entrada.addEventListener('change', async function () {
      var f = entrada.files && entrada.files[0];
      entrada.value = '';
      if (!f) return;
      aviso.textContent = '';
      try {
        if (!/^image\/(jpeg|png|webp)$/.test(f.type || '')) throw new Error('Usa una foto JPG, PNG o WebP.');
        var lista = await CFG.recortar(f);
        elegir.disabled = true; aviso.textContent = 'Guardando tu foto…';
        var r = await subirFotoPerfil(lista);
        if (r.status >= 400) throw new Error((r.json && r.json.error) || 'No pudimos guardar la foto.');
        aviso.textContent = '¡Listo! Entrando…';
        setTimeout(function () { location.reload(); }, 600);
      } catch (e) {
        elegir.disabled = false;
        aviso.textContent = e && e.message ? e.message : 'No pudimos guardar la foto.';
      }
    });
    document.body.appendChild(capa);
    elegir.focus();
  }

  /* ------------------------------------------------------------------ */
  /* Animación de carga (Jorge, 24 oct)                                  */
  /* ------------------------------------------------------------------ */
  /* El vaso de café helado que se llena (equipo/parches/cargando.svg). Al abrir la app lo muestra la pantalla de carga
     (solo con estilo, en la plantilla); cuando la app termina de arrancar, acá se pone el mismo vaso encima, en el mismo
     punto, se termina de llenar y se va suave. Dentro de la app aparece solo si una llamada demora más de RETRASO
     (no por cada toque ni por los avisos que se revisan solos), sigue moviéndose mientras haya cargas, y al terminar se
     llena y desaparece. Si algo falla, se detiene y lo dice. Con «reducir movimiento» queda quieto. */
  var cargando = (function () {
    var RETRASO = 700, MINIMO = 650, LARGO = 15000;
    var capa = null, vaso = null, texto = null, pendientes = 0, temporizador = null, largo = null, desde = 0, conError = false;
    var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var ahora = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

    function quitar() {
      clearTimeout(largo); largo = null;
      if (capa && capa.parentNode) capa.parentNode.removeChild(capa);
      capa = vaso = texto = null;
    }

    /* adelanto: cuántos ms lleva ya la animación (para empalmar con la pantalla de carga) */
    function crear(adelanto, alTiro) {
      if (!CFG.cargando || !document.body) return false;
      quitar();
      capa = document.createElement('div');
      capa.className = 'sepia-cargando' + (alTiro ? ' al-tiro' : '');
      capa.setAttribute('role', 'status');
      capa.setAttribute('aria-live', 'polite');
      var caja = document.createElement('div');
      caja.className = 'sepia-cargando-vaso';
      caja.innerHTML = CFG.cargando;
      vaso = caja.querySelector('svg');
      if (vaso) {
        vaso.setAttribute('aria-hidden', 'true');   // el texto «Cargando…» ya lo dice
        vaso.style.setProperty('--sc-t', (-Math.max(0, adelanto || 0) / 1000).toFixed(3) + 's');
        if (reducido) vaso.classList.add('sc-quieto');
      }
      texto = document.createElement('p');
      texto.className = 'sepia-cargando-texto';
      texto.textContent = 'Cargando…';
      capa.appendChild(caja); capa.appendChild(texto);
      document.body.appendChild(capa);
      desde = ahora();
      if (alTiro) capa.classList.add('es-visible');
      else { void capa.offsetWidth; capa.classList.add('es-visible'); }
      /* Si de verdad se demora, se puede volver a la app (la carga sigue igual) */
      largo = setTimeout(function () {
        if (!capa) return;
        texto.textContent = 'Está tardando más de lo normal…';
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'sepia-cargando-cerrar'; b.textContent = 'Volver a la app';
        b.addEventListener('click', function () { ocultar(); });
        capa.appendChild(b);
      }, LARGO);
      return true;
    }

    function ocultar() {
      var c = capa;
      if (!c) return;
      c.classList.remove('es-visible');
      setTimeout(function () { if (capa === c) quitar(); }, reducido ? 140 : 320);
    }

    /* Termina de llenar el vaso desde donde va y lo deja ir */
    function rematar() {
      var c = capa;
      if (!c || !vaso) return ocultar();
      if (reducido || !vaso.querySelector('#sc-nivel').animate) return ocultar();
      ['#sc-nivel', '#sc-hielos'].forEach(function (sel) {
        var el = vaso.querySelector(sel);
        var actual = getComputedStyle(el).transform;
        el.style.animation = 'none';
        el.style.transform = actual;
        el.animate([{ transform: actual }, { transform: 'translateY(0px)' }], { duration: 480, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
      });
      setTimeout(function () { if (capa === c) ocultar(); }, 420);
    }

    function terminar(fallo) {
      if (!capa) return;
      var c = capa, falta = Math.max(0, MINIMO - (ahora() - desde));
      setTimeout(function () {
        if (capa !== c) return;
        if (fallo) {
          if (vaso) vaso.classList.add('sc-pausa');
          texto.textContent = 'No se pudo completar. Inténtalo de nuevo.';
          setTimeout(function () { if (capa === c) ocultar(); }, 1400);
        } else rematar();
      }, falta);
    }

    /* Las llamadas que se hacen solas (avisos de la campana) o que son instantáneas no muestran el vaso */
    function cuenta(metodo, direccion) {
      if (direccion.pathname === '/api/notifications') return false;
      if (direccion.pathname === '/api/profile/photo' && metodo === 'GET') return false;
      return true;
    }

    function empezar() {
      pendientes++;
      if (pendientes > 1 || temporizador) return;
      temporizador = setTimeout(function () {
        temporizador = null;
        /* mientras se ve la pantalla de carga, el vaso ya está ahí */
        if (pendientes > 0 && !document.querySelector('.boot-screen')) crear(0, false);
      }, RETRASO);
    }

    function acabar(bien) {
      pendientes = Math.max(0, pendientes - 1);
      if (!bien) conError = true;
      if (pendientes > 0) return;
      clearTimeout(temporizador); temporizador = null;
      var f = conError; conError = false;
      terminar(f);
    }

    /* Empalme con la pantalla de carga: cuando la app termina de arrancar, el vaso se termina de llenar encima */
    function vigilarArranque() {
      if (!window.MutationObserver) return;
      var habia = !!document.querySelector('.boot-screen'), conFalla = false;
      new MutationObserver(function () {
        var boot = document.querySelector('.boot-screen');
        if (boot) { habia = true; conFalla = !!boot.querySelector('.primary-btn'); return; }
        if (!habia) return;
        habia = false;
        if (conFalla) { conFalla = false; return; }
        var adelanto = ahora();
        try {
          var e = performance.getEntriesByType('resource').filter(function (r) { return /cargando\.svg/.test(r.name) && !/quieto/.test(r.name); })[0];
          if (e && e.responseEnd) adelanto = ahora() - e.responseEnd;
        } catch (x) { /* sin tiempos: se usa desde que abrió la página */ }
        if (crear(adelanto, true)) { desde = -Infinity; rematar(); }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }

    return { cuenta: cuenta, empezar: empezar, acabar: acabar, vigilarArranque: vigilarArranque };
  })();

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */

  function iniciar() {
    if (!window.supabase || !window.supabase.createClient || !CFG.url || !CFG.key) { return false; }
    sb = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'sepia-baristas-auth' },
      global: { fetch: realFetch }
    });
    window.fetch = function (entrada, init) {
      var direccion;
      try { direccion = new URL(typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada), location.href); }
      catch (e) { return realFetch(entrada, init); }
      if (direccion.origin !== location.origin || direccion.pathname.indexOf('/api/') !== 0) return realFetch(entrada, init);
      var metodo = String((init && init.method) || (entrada && entrada.method) || 'GET').toUpperCase();
      var conVaso = cargando.cuenta(metodo, direccion);
      if (conVaso) cargando.empezar();
      return manejar(metodo, direccion, init || {}).catch(function (e) { return aFalla(e); }).then(function (r) {
        if (conVaso) cargando.acabar(r.status < 400);
        return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } });
      });
    };
    interceptarImagenes();
    cargando.vigilarArranque();
    return true;
  }

  if (!iniciar()) {
    /* Sin la librería o sin configuración, la interfaz mostraría «no pudimos conectar»; dejamos el motivo a la vista. */
    window.fetch = function (entrada, init) {
      var direccion = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
      if (/^\/api\//.test(direccion) || /\/api\//.test(direccion.replace(location.origin, ''))) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'No pudimos conectar con Sepia. Recarga la página.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
      }
      return realFetch(entrada, init);
    };
  }
})();
