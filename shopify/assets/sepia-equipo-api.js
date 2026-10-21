/* SEPIA COFFEE · Sepia Equipo — el «servidor» de la interfaz del equipo.
 *
 * La interfaz (assets/sepia-equipo/*) fue hecha para hablar con un servidor propio: le pide todo a /api/*.
 * Acá ese servidor es Supabase. Este archivo se pone ANTES de la interfaz e intercepta esas llamadas:
 *   · /api/auth/*   → inicio y cierre de sesión, cambio de clave (Supabase Auth); la administración entra aparte
 *                     (/api/auth/admin/*: código por correo, o correo y clave; la clave se crea la primera vez)
 *   · /api/crew     → funciones eq_estado y eq_accion (equipo.sql): eventos, postulaciones, perfil, administración
 *   · /api/ranking, /api/events/…/team, /api/notifications, /api/earnings, /api/integrations → funciones eq_*
 *   · /api/profile/photo → almacenamiento privado de las fotos de perfil
 *   · /api/admin/accounts → crear_acceso y restablecer_clave (esquema.sql)
 *
 * Las reglas (quién ve qué, cupos, camioneta, plazos) las aplica la base de datos; acá solo se traducen
 * las llamadas y los mensajes. La sesión es la misma del portal de baristas (misma llave en el navegador).
 *
 * Configuración: window.SEPIA_EQUIPO = { url, key } (lo escribe la plantilla de la página).
 */
(function () {
  'use strict';

  var CFG = window.SEPIA_EQUIPO || {};
  var DOMINIO_ACCESO = 'equipo.sepiacoffee.cl';          // el mismo de crear_acceso() en esquema.sql
  var realFetch = window.fetch.bind(window);
  var sb = null;
  var BUCKET_PERFIL = 'perfiles';

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
      if (id.indexOf('@') >= 0) return falla(400, 'Eso es un correo. Si eres de administración, entra por la pestaña «Administración».');
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

    /* ----- Administración: código por correo, o correo y clave ----- */
    if (ruta === '/api/auth/admin/codigo' && metodo === 'POST') {
      var ac = JSON.parse(init.body || '{}');
      var correoA = String(ac.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoA)) return falla(400, 'Escribe un correo válido.');
      var otp = await sb.auth.signInWithOtp({ email: correoA, options: { shouldCreateUser: false } });
      if (otp.error) throw otp.error;
      return ok({ ok: true });
    }
    if (ruta === '/api/auth/admin/verificar' && metodo === 'POST') {
      var av = JSON.parse(init.body || '{}');
      var codigo = String(av.code || '').replace(/\s/g, '');
      if (!/^\d{6,10}$/.test(codigo)) return falla(400, 'El código son solo números, tal como llegó al correo.');
      var vo = await sb.auth.verifyOtp({ email: String(av.email || '').trim().toLowerCase(), token: codigo, type: 'email' });
      if (vo.error) throw vo.error;
      if ((await rpc('es_admin')) !== true) {                           // la base decide quién es administración
        await sb.auth.signOut({ scope: 'local' });
        return falla(403, 'Ese correo no tiene acceso de administración.');
      }
      limpiarFotos();
      return ok({ ok: true });
    }
    if (ruta === '/api/auth/admin/clave' && metodo === 'POST') {
      var ak = JSON.parse(init.body || '{}');
      var pw = String(ak.password || '');
      var correoK = String(ak.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoK)) return falla(400, 'Escribe tu correo de administración.');
      if (!pw) return falla(400, 'Escribe tu clave.');
      var si = await sb.auth.signInWithPassword({ email: correoK, password: pw });
      if (si.error) return falla(401, 'El correo o la clave no son correctos.');
      if ((await rpc('es_admin')) !== true) {                           // una clave sirve solo si esa persona la activó con un código
        await sb.auth.signOut({ scope: 'local' });
        return falla(403, 'Esta cuenta todavía no tiene activada la entrada con clave. Entra con un código por correo: ahí podrás crear tu clave.');
      }
      limpiarFotos();
      return ok({ ok: true });
    }
    if (ruta === '/api/auth/admin/crear-clave' && metodo === 'POST') {
      var sc = await exigirSesion();
      var cc = JSON.parse(init.body || '{}');
      var c1 = String(cc.password || ''), c2 = String(cc.confirm || '');
      var local = String((sc.user.email || '').split('@')[0] || '').toLowerCase();
      if (c1.length < 10) return falla(400, 'La clave tiene que tener al menos 10 caracteres.');
      if (c1 !== c2) return falla(400, 'Las dos claves no son iguales.');
      if (local.length >= 4 && c1.toLowerCase().indexOf(local) >= 0) return falla(400, 'La clave no puede llevar tu correo.');
      if ((await rpc('es_admin')) !== true) return falla(403, 'Solo la administración crea esta clave.');
      var up = await sb.auth.updateUser({ password: c1 });
      if (up.error) throw up.error;
      await rpc('admin_activar_clave', { p_activa: true });             // desde ahora puede elegir: código o clave
      await sb.auth.signOut({ scope: 'others' });
      return ok({ ok: true });
    }

    /* ----- Datos del equipo ----- */
    if (ruta === '/api/crew' && metodo === 'GET') {
      if (!(await sesion())) return ok({ signedIn: false });
      return ok(await rpc('eq_estado', { p_vista: u.searchParams.get('view') || null }));
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

    /* ----- Foto de perfil ----- */
    if (ruta === '/api/profile/photo') {
      if (metodo === 'GET' && u.searchParams.get('meta')) { var fp = await fotoPropia(); return ok({ hasPhoto: fp.hasPhoto }); }
      if (metodo === 'POST') return subirFotoPerfil(init.body);
      if (metodo === 'DELETE') return quitarFotoPerfil();
    }

    return falla(404, 'Esta función no está disponible en la web de Sepia.');
  }

  /* ------------------------------------------------------------------ */
  /* La barra del sitio: para que la página siga siendo parte de Sepia Coffee */
  /* ------------------------------------------------------------------ */

  /* Una franja con el menú de la tienda (Inicio, Productos, Eventos, Portal Baristas…) arriba de la interfaz. El logo
     «Sepia Coffee» de la interfaz lleva al inicio del sitio. Se agrega cuando la interfaz ya está dibujada (la interfaz
     arma el documento completo: no se le agregan cosas antes). Solo colores de la paleta. */
  var CSS_SITIO = '.se-sitio{display:block;background:#ffffff;border-bottom:1px solid #b9c5d3;font-family:inherit}' +
    '.se-sitio nav{display:flex;gap:4px;align-items:center;max-width:1100px;margin:0 auto;padding:0 16px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}' +
    '.se-sitio a{display:inline-block;padding:12px 10px;color:#020526;font-size:.875rem;font-weight:500;text-decoration:none;border-bottom:2px solid transparent}' +
    '.se-sitio a:hover{color:#526ea0}' +
    '.se-sitio a[aria-current="page"]{color:#526ea0;font-weight:700;border-bottom-color:#526ea0}' +
    '.se-sitio a:focus-visible{outline:2px solid #526ea0;outline-offset:-2px}';

  function montarSitio() {
    var sitio = window.SEPIA_EQUIPO_SITIO;
    if (!sitio || !sitio.menu || !sitio.menu.length) return;
    function poner() {
      if (document.querySelector('.se-sitio')) return true;
      if (!document.querySelector('.required-profile, .app-shell')) return false;
      var cab = document.createElement('header'), nav = document.createElement('nav');
      cab.className = 'se-sitio';
      nav.setAttribute('aria-label', 'Menú del sitio');
      sitio.menu.forEach(function (l) {
        var a = document.createElement('a');
        a.href = l.u; a.textContent = l.t;
        if (/\/pages\/equipo(\/|\?|#|$)/.test(l.u)) a.setAttribute('aria-current', 'page');
        nav.appendChild(a);
      });
      cab.appendChild(nav);
      document.body.insertBefore(cab, document.body.firstChild);
      return true;
    }
    var estilo = document.createElement('style');
    estilo.textContent = CSS_SITIO;
    document.head.appendChild(estilo);
    if (!poner()) {
      var obs = new MutationObserver(function () { if (poner()) obs.disconnect(); });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

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
      return manejar(metodo, direccion, init || {}).catch(function (e) { return aFalla(e); }).then(function (r) {
        return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } });
      });
    };
    interceptarImagenes();
    montarSitio();
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
