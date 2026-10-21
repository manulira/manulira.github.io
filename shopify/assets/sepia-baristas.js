/* SEPIA COFFEE · portal de baristas
 *
 * Una sola página. Los baristas entran con un ID y una clave que les entrega la
 * administración (la primera vez crean su clave personal y completan su perfil),
 * ven los eventos, postulan, miran el ranking del equipo y sus ganancias. Quien
 * está en la tabla `admins` entra con un código por correo y ve además las
 * pestañas de administración (accesos, eventos, postulantes, pagos).
 *
 * Todo lo que decide quién ve qué vive en la base de datos (shopify/baristas/
 * esquema.sql). Este archivo solo dibuja y manda las consultas: aunque alguien
 * lo modifique en su navegador, la base de datos no le entrega nada ajeno.
 *
 * Nada de lo que escribe una persona se inserta como HTML: siempre textContent.
 */
(function () {
  'use strict';

  var raiz = document.getElementById('sc-baristas');
  if (!raiz) return;

  var SB_URL = raiz.getAttribute('data-supabase-url') || '';
  var SB_KEY = raiz.getAttribute('data-supabase-key') || '';
  var WHATSAPP = 'https://wa.me/56979284400';
  /* Cada ID se convierte en id@DOMINIO_ACCESO (un «correo» inventado que no recibe nada).
     Es el mismo dominio de crear_acceso() en esquema.sql: si cambia, cambia en los dos. */
  var DOMINIO_ACCESO = 'equipo.sepiacoffee.cl';
  var TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  var BANCOS = ['Banco de Chile', 'Banco Estado', 'Banco Santander', 'BCI', 'Scotiabank', 'Banco Itaú',
    'Banco Falabella', 'Banco Security', 'Banco BICE', 'Banco Ripley', 'Banco Consorcio', 'Coopeuch',
    'Mercado Pago', 'Tenpo', 'Mach'];
  var TIPOS_CUENTA = ['Cuenta RUT', 'Cuenta vista', 'Cuenta corriente', 'Cuenta de ahorro'];
  var ESTADOS_EVENTO = [['borrador', 'Borrador (solo lo ves tú)'], ['abierto', 'Abierto (los baristas pueden postular)'],
    ['cerrado', 'Cerrado'], ['cancelado', 'Cancelado']];

  var sb = null;
  var estado = {
    sesion: null, perfil: null, admin: false, config: null,
    eventos: [], posts: [], dirs: {}, privado: {}, baristas: {}, misPosts: {}, seg: {}, segDatos: {}, sync: null,
    acceso: null, accesos: [], historial: [], fotos: {}, equipos: {}, traslados: [], trasladoEv: {}, fotoPendiente: null, ultimoAcceso: null,
    pestana: 'eventos', cargando: true, correoLogin: '', usuarioLogin: '', claveAdmin: null, claveAdminOmitida: false
  };

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) añadir(e, arguments[i]);
    return e;
  }
  function añadir(padre, hijo) {
    if (hijo === null || hijo === undefined || hijo === false) return;
    if (Array.isArray(hijo)) { hijo.forEach(function (x) { añadir(padre, x); }); return; }
    padre.appendChild(typeof hijo === 'string' || typeof hijo === 'number' ? document.createTextNode(String(hijo)) : hijo);
  }

  function clp(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL'); }
  function hhmm(t) { return String(t || '').slice(0, 5); }
  function horasTxt(x) {
    var n = Math.round(Number(x) * 100) / 100;
    return String(n).replace('.', ',') + ' h';
  }
  function fechaLarga(iso) {
    var d = new Date(iso + 'T12:00:00');
    var s = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function hoyISO() {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return p;
  }
  /* Los baristas ven un evento desde N días antes de su fecha (config.dias_publicacion, 14 por defecto). */
  function diasPublicacion() { return Number(estado.config && estado.config.dias_publicacion) || 14; }
  function fechaMas(iso, dias) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }
  function diasHasta(iso) {
    return Math.round((new Date(iso + 'T12:00:00Z') - new Date(hoyISO() + 'T12:00:00Z')) / 864e5);
  }
  /* Qué ven los baristas de un evento, para la administración: ya abierto, o cuándo se abre. */
  function lineaPublicacion(ev) {
    if (ev.estado !== 'abierto' || ev.fecha < hoyISO()) return null;
    var falta = diasHasta(ev.fecha) - diasPublicacion();
    if (falta > 0) {
      return h('p', { class: 'sb-linea sb-linea--fuerte', text: 'Todavía no lo ven los baristas: se abre el ' + fechaLarga(fechaMas(ev.fecha, -diasPublicacion())).toLowerCase() + ' (en ' + (falta === 1 ? '1 día' : falta + ' días') + ').' });
    }
    return h('p', { class: 'sb-linea', text: 'Abierto a los baristas desde el ' + fechaLarga(fechaMas(ev.fecha, -diasPublicacion())).toLowerCase() + '.' });
  }
  function pct(x) { return (Number(x) * 100).toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' %'; }
  /* Un timestamp del servidor → «12 nov» y «12 nov, 06:00» en hora de Santiago. */
  function diaCorto(ts) {
    return new Date(ts).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short' }).replace('.', '');
  }
  function diaHora(ts) {
    return new Date(ts).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', '');
  }

  /* RUT: dígito verificador (módulo 11) y formato 12.345.678-5 */
  function limpiarRut(s) { return String(s || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function rutValido(s) {
    var t = limpiarRut(s);
    if (!/^\d{7,8}[\dK]$/.test(t)) return false;
    var cuerpo = t.slice(0, -1), dv = t.slice(-1), suma = 0, m = 2;
    for (var i = cuerpo.length - 1; i >= 0; i--) { suma += parseInt(cuerpo.charAt(i), 10) * m; m = m === 7 ? 2 : m + 1; }
    var r = 11 - (suma % 11);
    return dv === (r === 11 ? '0' : (r === 10 ? 'K' : String(r)));
  }
  function formatoRut(s) {
    var t = limpiarRut(s);
    if (t.length < 2) return t;
    return t.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + t.slice(-1);
  }
  /* Teléfono chileno → +56912345678 */
  function normalizarTelefono(s) {
    var d = String(s || '').replace(/[^\d]/g, '');
    if (d.length === 9 && d.charAt(0) === '9') return '+56' + d;
    if (d.length === 11 && d.indexOf('56') === 0) return '+' + d;
    if (d.length >= 8 && d.length <= 15) return '+' + d;
    return '';
  }

  /* El mismo cálculo que hace la vista de la base de datos, solo para mostrar
     una vista previa mientras se escribe un evento. Los montos reales los
     entrega la base de datos. */
  function calcularPago(horas, manual, cfg, sinTope) {
    if (manual !== null && manual !== '' && !isNaN(Number(manual))) return Number(manual);
    var regla;
    if (horas <= Number(cfg.corto_max_horas)) regla = Number(cfg.corto_monto);
    else if (horas <= Number(cfg.medio_max_horas)) regla = Number(cfg.medio_monto);
    else regla = Math.round(horas * Number(cfg.tarifa_hora));
    var tope = Number(cfg.tope_dia);
    return sinTope || cfg.tope_dia === null || cfg.tope_dia === undefined || isNaN(tope) ? regla : Math.min(regla, tope);
  }
  function horasEntre(ini, fin) {
    var a = ini.split(':'), b = fin.split(':');
    var m = (parseInt(b[0], 10) * 60 + parseInt(b[1], 10)) - (parseInt(a[0], 10) * 60 + parseInt(a[1], 10));
    if (m <= 0) m += 24 * 60;
    return m / 60;
  }

  function mensajeError(e, porDefecto) {
    var txt = (e && (e.message || e.msg || '')) + '';
    if (e && e.code === '23505' && /rut/i.test(txt)) return 'Ese RUT ya está registrado con otro correo. Escríbenos por WhatsApp y lo resolvemos.';
    if (/invalid login credentials|invalid_credentials/i.test(txt)) return 'ID o clave incorrectos. Revisa que no lleven espacios de más.';
    if (/banned/i.test(txt)) return 'Tu acceso está desactivado. Escríbele a Manuel.';
    if (/signups? not allowed|user not found/i.test(txt)) return 'Ese correo no tiene acceso de administración.';
    if (/same password|different from the old/i.test(txt)) return 'La clave nueva tiene que ser distinta de la que ya tenías.';
    if (/password/i.test(txt) && /(short|least|weak|characters)/i.test(txt)) return 'Esa clave es muy corta o muy fácil de adivinar. Usa al menos 8 caracteres.';
    if (/rate limit|too many|over_email_send_rate_limit/i.test(txt)) return 'Pediste muchos códigos seguidos. Espera un minuto e inténtalo de nuevo.';
    if (/expired|invalid/i.test(txt) && /token|otp|code/i.test(txt)) return 'El código no es válido o ya venció. Pide uno nuevo.';
    return porDefecto;
  }

  /* ------------------------------------------------------------------ */
  /* Piezas de interfaz                                                  */
  /* ------------------------------------------------------------------ */

  function aviso(texto, tipo) {
    return h('p', { class: 'sb-aviso' + (tipo ? ' sb-aviso--' + tipo : ''), role: tipo === 'ok' ? 'status' : 'alert', text: texto });
  }
  function ponerAviso(contenedor, texto, tipo) {
    var viejo = contenedor.querySelector('.sb-aviso');
    if (viejo) viejo.remove();
    if (texto) contenedor.appendChild(aviso(texto, tipo));
  }
  function boton(texto, onclick, clase, extra) {
    var attrs = { type: 'button', class: 'sb-btn' + (clase ? ' ' + clase : ''), onclick: onclick, text: texto };
    if (extra) Object.keys(extra).forEach(function (k) { attrs[k] = extra[k]; });
    return h('button', attrs);
  }
  function campo(etiqueta, input, ayuda) {
    return h('label', { class: 'sb-campo' }, h('span', { class: 'sb-etiqueta', text: etiqueta }), input,
      ayuda ? h('span', { class: 'sb-ayuda', text: ayuda }) : null);
  }
  function entrada(tipo, nombre, valor, extra) {
    var attrs = { type: tipo, name: nombre, class: 'sb-entrada' };
    if (extra) Object.keys(extra).forEach(function (k) { attrs[k] = extra[k]; });
    var e = h('input', attrs);
    if (valor !== null && valor !== undefined) e.value = valor;
    return e;
  }
  function casilla(nombre, texto, marcada) {
    var c = h('input', { type: 'checkbox', name: nombre, class: 'sb-chk' });
    c.checked = !!marcada;
    return h('label', { class: 'sb-casilla' }, c, h('span', { text: texto }));
  }
  function conTarea(btn, tarea) {
    var textoOriginal = btn.textContent;
    btn.disabled = true;
    return Promise.resolve().then(tarea).then(function (r) { btn.disabled = false; btn.textContent = textoOriginal; return r; },
      function (e) { btn.disabled = false; btn.textContent = textoOriginal; throw e; });
  }

  /* ------------------------------------------------------------------ */
  /* Carga de datos                                                      */
  /* ------------------------------------------------------------------ */

  async function cargarTodo() {
    var uid = estado.sesion.user.id;
    var rc = await sb.from('config').select('*').eq('id', 1).maybeSingle();
    estado.config = rc.data;
    var rp = await sb.from('baristas').select('*').eq('id', uid).maybeSingle();
    estado.perfil = rp.data;
    var ra = await sb.rpc('es_admin');
    estado.admin = ra.data === true;
    // ¿Tiene activada su entrada con clave? (null: la base todavía no tiene esa función)
    estado.claveAdmin = null;
    if (estado.admin) {
      var rca = await sb.rpc('admin_clave_activa');
      estado.claveAdmin = rca.error ? null : rca.data === true;
    }
    var rac = await sb.from('accesos').select('*');
    var accesos = rac.data || [];
    estado.acceso = accesos.filter(function (a) { return a.id === uid; })[0] || null;
    estado.accesos = estado.admin ? accesos : [];
    if (estado.perfil || estado.admin) await cargarEventos();
  }

  async function cargarEventos() {
    var uid = estado.sesion.user.id;
    var re = await sb.from('eventos_vista').select('*').order('fecha', { ascending: true }).order('hora_inicio', { ascending: true });
    estado.eventos = re.data || [];
    var rp = await sb.from('postulaciones').select('*').order('creado_en', { ascending: true });
    estado.posts = rp.data || [];
    var rd = await sb.from('evento_direcciones').select('*');
    estado.dirs = {};
    (rd.data || []).forEach(function (d) { estado.dirs[d.evento_id] = d; });
    if (estado.admin) {
      var rb = await sb.from('baristas').select('*');
      estado.baristas = {};
      (rb.data || []).forEach(function (b) { estado.baristas[b.id] = b; });
      var rv = await sb.from('evento_privado').select('*');
      estado.privado = {};
      (rv.data || []).forEach(function (p) { estado.privado[p.evento_id] = p; });
      var rs = await sb.from('seguimiento_vista').select('*');
      estado.seg = {};
      (rs.data || []).forEach(function (s) { estado.seg[s.evento_id] = s; });
      var rq = await sb.from('evento_seguimiento').select('*');
      estado.segDatos = {};
      (rq.data || []).forEach(function (s) { estado.segDatos[s.evento_id] = s; });
      var ru = await sb.from('automatizacion').select('ultima_sync_en,ultima_sync_resumen').eq('id', 1).maybeSingle();
      estado.sync = ru.data || null;
      var rt = await sb.from('evento_traslado').select('*');
      estado.trasladoEv = {};
      (rt.data || []).forEach(function (t) { estado.trasladoEv[t.evento_id] = t; });
    }
    var rtr = await sb.rpc('traslados');
    estado.traslados = rtr.data || [];
    // Turnos del historial anterior al portal (la administración ve todos; cada barista, los suyos).
    var rhi = await sb.rpc('historial_resumen');
    estado.historial = rhi.data || [];
    estado.misPosts = {};
    estado.posts.forEach(function (p) { if (p.barista_id === uid) estado.misPosts[p.evento_id] = p; });
    // El equipo de cada evento donde estoy asignado (nombre y foto de quienes van conmigo).
    estado.equipos = {};
    var asignados = estado.posts.filter(function (p) { return p.barista_id === uid && p.estado === 'confirmada'; });
    await Promise.all(asignados.map(async function (p) {
      var re2 = await sb.rpc('equipo_evento', { p_evento: p.evento_id });
      estado.equipos[p.evento_id] = re2.data || [];
    }));
    var rutas = [];
    Object.keys(estado.equipos).forEach(function (k) { estado.equipos[k].forEach(function (m) { if (m.foto_path) rutas.push(m.foto_path); }); });
    if (estado.perfil && estado.perfil.foto_path) rutas.push(estado.perfil.foto_path);
    try { await firmarFotos(rutas); } catch (e) { /* sin fotos se ven las iniciales */ }
  }

  async function recargar() {
    await cargarEventos();
    pintar();
  }

  function limpiarEstado() {
    estado.sesion = null; estado.perfil = null; estado.admin = false; estado.config = null;
    estado.eventos = []; estado.posts = []; estado.dirs = {}; estado.privado = {}; estado.baristas = {}; estado.misPosts = {}; estado.seg = {}; estado.segDatos = {}; estado.sync = null;
    estado.acceso = null; estado.accesos = []; estado.historial = []; estado.fotos = {}; estado.equipos = {}; estado.traslados = []; estado.trasladoEv = {};
    estado.fotoPendiente = null; estado.ultimoAcceso = null; estado.claveAdmin = null; estado.claveAdminOmitida = false;
    estado.pestana = 'eventos';
  }

  /* ------------------------------------------------------------------ */
  /* Entrar: ID y clave (baristas) o código por correo (administración)  */
  /* ------------------------------------------------------------------ */

  async function entrarAlPortal() {
    estado.cargando = true; pintar();
    try { await cargarTodo(); } catch (e) { /* se muestra lo que haya */ }
    estado.cargando = false;
    pintar();
  }

  function campoClave(etiqueta, nombre, autocompletar, id) {
    var clave = entrada('password', nombre, '', { id: id, autocomplete: autocompletar, required: true, maxlength: '100', autocapitalize: 'none', spellcheck: 'false' });
    var ver = boton('Mostrar', function () {
      var mostrar = clave.type === 'password';
      clave.type = mostrar ? 'text' : 'password';
      ver.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    }, 'sb-btn--sec sb-btn--chico');
    ver.setAttribute('aria-label', 'Mostrar u ocultar ' + etiqueta.toLowerCase());
    var caja = h('div', { class: 'sb-campo' }, h('label', { class: 'sb-etiqueta', for: id, text: etiqueta }), h('div', { class: 'sb-clave' }, clave, ver));
    caja.entrada = clave;
    return caja;
  }

  function vistaLogin() {
    var caja = h('div', { class: 'sb-caja' });
    var pasoClave = function () {
      caja.textContent = '';
      var usuario = entrada('text', 'usuario', estado.usuarioLogin, { id: 'sb-usuario', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true, maxlength: '40' });
      var claveCampo = campoClave('Clave', 'clave', 'current-password', 'sb-clave');
      var msg = h('div');
      var entrar = boton('Iniciar sesión', function () {
        var u = usuario.value.trim().toLowerCase();
        estado.usuarioLogin = u;
        if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) { ponerAviso(msg, 'Revisa tu ID: va sin espacios ni @. Por ejemplo, camila.perez.'); usuario.focus(); return; }
        if (!claveCampo.entrada.value) { ponerAviso(msg, 'Escribe tu clave.'); claveCampo.entrada.focus(); return; }
        ponerAviso(msg, '');
        conTarea(entrar, async function () {
          var r = await sb.auth.signInWithPassword({ email: u + '@' + DOMINIO_ACCESO, password: claveCampo.entrada.value });
          if (r.error) throw r.error;
          estado.sesion = r.data.session;
        }).then(entrarAlPortal, function (e) { ponerAviso(msg, mensajeError(e, 'No pudimos entrar. Inténtalo de nuevo en un momento.')); });
      });
      caja.appendChild(h('h2', { class: 'sb-h2', text: 'Bienvenido al equipo' }));
      caja.appendChild(h('p', { class: 'sb-texto', text: 'Ingresa con el ID y la clave que te entregó Sepia.' }));
      caja.appendChild(campo('ID de usuario', usuario));
      caja.appendChild(claveCampo);
      caja.appendChild(h('div', { class: 'sb-fila' }, entrar));
      caja.appendChild(msg);
      caja.appendChild(h('p', { class: 'sb-ayuda', text: '¿Olvidaste tu clave? Escríbele a Manuel para que te dé una nueva.' }));
      caja.appendChild(h('hr', { class: 'sb-sep' }));
      caja.appendChild(boton('Soy administración', pasoAdmin, 'sb-btn--sec'));
      [usuario, claveCampo.entrada].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); entrar.click(); } }); });
    };
    /* Administración: elige entrar con correo y clave, o con un código por correo. */
    var pasoAdmin = function () {
      caja.textContent = '';
      caja.appendChild(h('h2', { class: 'sb-h2', text: 'Administración' }));
      caja.appendChild(h('p', { class: 'sb-texto', text: 'Elige cómo quieres entrar.' }));
      caja.appendChild(h('div', { class: 'sb-opciones' },
        boton('Entrar con correo y clave', pasoAdminClave),
        boton('Entrar con un código por correo', pasoCorreo, 'sb-btn--sec')));
      caja.appendChild(h('p', { class: 'sb-ayuda', text: 'La clave se crea la primera vez que entras con código. Si todavía no la tienes, entra con código.' }));
      caja.appendChild(h('div', { class: 'sb-fila' }, boton('Volver', pasoClave, 'sb-btn--sec')));
    };
    var pasoAdminClave = function () {
      caja.textContent = '';
      var correo = entrada('email', 'correo', estado.correoLogin, { autocomplete: 'username', required: true, placeholder: 'tucorreo@ejemplo.cl', inputmode: 'email', autocapitalize: 'none' });
      var claveCampo = campoClave('Clave', 'clave', 'current-password', 'sb-clave-admin');
      var msg = h('div');
      var entrar = boton('Iniciar sesión', function () {
        var v = correo.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { ponerAviso(msg, 'Escribe tu correo de administración.'); correo.focus(); return; }
        if (!claveCampo.entrada.value) { ponerAviso(msg, 'Escribe tu clave.'); claveCampo.entrada.focus(); return; }
        ponerAviso(msg, '');
        estado.correoLogin = v;
        conTarea(entrar, async function () {
          var r = await sb.auth.signInWithPassword({ email: v, password: claveCampo.entrada.value });
          if (r.error) throw r.error;
          // La base decide: una clave sirve solo si esa persona la activó desde una sesión de código.
          var ea = await sb.rpc('es_admin');
          if (ea.data !== true) { await sb.auth.signOut({ scope: 'local' }); throw new Error('sin clave activa'); }
          estado.sesion = r.data.session;
        }).then(entrarAlPortal, function (e) {
          ponerAviso(msg, /sin clave activa/.test((e && e.message) || '')
            ? 'Esta cuenta todavía no tiene activada la entrada con clave. Entra con un código por correo: ahí podrás crear tu clave.'
            : /invalid login credentials|invalid_credentials/i.test((e && e.message) || '') ? 'El correo o la clave no son correctos.'
            : mensajeError(e, 'No pudimos entrar. Inténtalo de nuevo en un momento.'));
        });
      });
      caja.appendChild(h('h2', { class: 'sb-h2', text: 'Administración' }));
      caja.appendChild(h('p', { class: 'sb-texto', text: 'Entra con tu correo y tu clave.' }));
      caja.appendChild(campo('Correo electrónico', correo));
      caja.appendChild(claveCampo);
      caja.appendChild(h('div', { class: 'sb-fila' }, entrar, boton('Volver', pasoAdmin, 'sb-btn--sec')));
      caja.appendChild(msg);
      caja.appendChild(h('p', { class: 'sb-ayuda', text: '¿No tienes clave o no la recuerdas? Entra con un código por correo.' }));
      caja.appendChild(boton('Entrar con un código por correo', pasoCorreo, 'sb-btn--sec'));
      [correo, claveCampo.entrada].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); entrar.click(); } }); });
    };
    var pasoCorreo = function () {
      caja.textContent = '';
      var correo = entrada('email', 'correo', estado.correoLogin, { autocomplete: 'email', required: true, placeholder: 'tucorreo@ejemplo.cl', inputmode: 'email' });
      var msg = h('div');
      var enviar = boton('Enviarme el código', function () {
        var v = correo.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { ponerAviso(msg, 'Escribe un correo válido.'); correo.focus(); return; }
        ponerAviso(msg, '');
        conTarea(enviar, async function () {
          var r = await sb.auth.signInWithOtp({ email: v, options: { shouldCreateUser: false } });
          if (r.error) throw r.error;
          estado.correoLogin = v;
          pasoCodigo();
        }).catch(function (e) { ponerAviso(msg, mensajeError(e, 'No pudimos enviar el código. Revisa el correo e inténtalo de nuevo en un minuto.')); });
      });
      caja.appendChild(h('h2', { class: 'sb-h2', text: 'Administración' }));
      caja.appendChild(h('p', { class: 'sb-texto', text: 'Te enviamos un código de un solo uso al correo de administración.' }));
      caja.appendChild(campo('Correo electrónico', correo));
      caja.appendChild(h('div', { class: 'sb-fila' }, enviar, boton('Volver', pasoAdmin, 'sb-btn--sec')));
      caja.appendChild(msg);
      correo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enviar.click(); } });
    };
    var pasoCodigo = function () {
      caja.textContent = '';
      var codigo = entrada('text', 'codigo', '', { autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: '10', required: true, placeholder: 'Código del correo' });
      var msg = h('div');
      var entrar = boton('Entrar', function () {
        var v = codigo.value.replace(/\s/g, '');
        if (!/^\d{6,10}$/.test(v)) { ponerAviso(msg, 'El código son solo números, tal como llegó al correo.'); codigo.focus(); return; }
        ponerAviso(msg, '');
        conTarea(entrar, async function () {
          var r = await sb.auth.verifyOtp({ email: estado.correoLogin, token: v, type: 'email' });
          if (r.error) throw r.error;
          estado.sesion = r.data.session;
        }).then(entrarAlPortal, function (e) { ponerAviso(msg, mensajeError(e, 'El código no es válido o ya venció. Pide uno nuevo.')); });
      });
      var reenviar = boton('Pedir otro código', function () { pasoCorreo(); }, 'sb-btn--sec');
      caja.appendChild(h('h2', { class: 'sb-h2', text: 'Revisa tu correo' }));
      caja.appendChild(h('p', { class: 'sb-texto', text: 'Te enviamos un código a ' + estado.correoLogin + '. Puede tardar un minuto; mira también en spam.' }));
      caja.appendChild(campo('Código', codigo));
      caja.appendChild(h('div', { class: 'sb-fila' }, entrar, reenviar));
      caja.appendChild(msg);
      codigo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); entrar.click(); } });
      codigo.focus();
    };
    pasoClave();
    return caja;
  }

  function vistaSinAcceso() {
    return h('div', { class: 'sb-caja' },
      h('h2', { class: 'sb-h2', text: 'Tu cuenta no tiene acceso' }),
      h('p', { class: 'sb-texto', text: estado.acceso && !estado.acceso.activo
        ? 'Tu acceso está desactivado. Escríbele a Manuel si crees que es un error.'
        : 'Esta cuenta no está autorizada como barista. Pídele a Manuel que te cree un acceso.' }));
  }

  /* Crear la clave personal: obligatorio la primera vez (cambia la temporal), y voluntario desde «Mis datos». */
  function vistaCambiarClave(obligatoria) {
    var f = h('form', { class: obligatoria ? 'sb-caja' : 'sb-sub', novalidate: true });
    var msg = h('div');
    var actual = obligatoria ? null : campoClave('Clave actual', 'actual', 'current-password', 'sb-clave-actual');
    var nueva = campoClave('Clave nueva', 'nueva', 'new-password', 'sb-clave-nueva');
    var repetir = campoClave('Repite la clave nueva', 'repetir', 'new-password', 'sb-clave-repetir');
    var guardar = h('button', { type: 'submit', class: 'sb-btn', text: 'Guardar clave' });
    f.appendChild(h(obligatoria ? 'h2' : 'h3', { class: obligatoria ? 'sb-h2' : 'sb-h3', text: obligatoria ? 'Crea tu clave personal' : 'Cambiar mi clave' }));
    f.appendChild(h('p', { class: 'sb-texto', text: obligatoria
      ? 'Antes de continuar, cambia la clave temporal que recibiste.'
      : 'Al cambiar tu clave se cierran las sesiones de otros dispositivos.' }));
    if (actual) f.appendChild(actual);
    f.appendChild(nueva); f.appendChild(repetir);
    f.appendChild(h('p', { class: 'sb-ayuda', text: 'Usa al menos 8 caracteres. Puede ser una frase fácil de recordar.' }));
    f.appendChild(h('div', { class: 'sb-fila' }, guardar));
    f.appendChild(msg);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n1 = nueva.entrada.value, n2 = repetir.entrada.value;
      var usuarioId = estado.acceso ? estado.acceso.usuario : '';
      var error = null;
      if (actual && !actual.entrada.value) error = 'Escribe tu clave actual.';
      else if (n1.length < 8) error = 'La clave nueva tiene que tener al menos 8 caracteres.';
      else if (n1 !== n2) error = 'Las dos claves nuevas no son iguales.';
      else if (usuarioId && n1.toLowerCase().indexOf(usuarioId) >= 0) error = 'La clave no puede llevar tu ID.';
      if (error) { ponerAviso(msg, error); return; }
      ponerAviso(msg, '');
      conTarea(guardar, async function () {
        if (actual) {
          var v = await sb.auth.signInWithPassword({ email: estado.sesion.user.email, password: actual.entrada.value });
          if (v.error) throw new Error('clave actual');
        }
        var r = await sb.auth.updateUser({ password: n1 });
        if (r.error) throw r.error;
        var r2 = await sb.rpc('acceso_clave_cambiada');
        if (r2.error) throw r2.error;
        await sb.auth.signOut({ scope: 'others' });
        if (estado.acceso) estado.acceso.debe_cambiar_clave = false;
        if (obligatoria) { await entrarAlPortal(); return; }
        [actual, nueva, repetir].forEach(function (c) { if (c) c.entrada.value = ''; });
        ponerAviso(msg, 'Listo, cambiamos tu clave. Las otras sesiones se cerraron.', 'ok');
      }).catch(function (e) {
        ponerAviso(msg, /clave actual/.test((e && e.message) || '') ? 'La clave actual no es correcta.' : mensajeError(e, 'No pudimos cambiar la clave. Inténtalo de nuevo.'));
      });
    });
    return f;
  }

  /* Clave de la administración: opcional, además del código por correo. Se pide la primera vez que
     entra con código y se puede crear, cambiar o desactivar desde la pestaña «Mi clave». */
  function vistaClaveAdmin(primera) {
    var activa = estado.claveAdmin === true;
    var correo = (estado.sesion && estado.sesion.user && estado.sesion.user.email) || '';
    var f = h('form', { class: primera ? 'sb-caja' : 'sb-sub', novalidate: true });
    var msg = h('div');
    var actual = activa ? campoClave('Clave actual', 'actual', 'current-password', 'sb-ca-actual') : null;
    var nueva = campoClave(activa ? 'Clave nueva' : 'Clave', 'nueva', 'new-password', 'sb-ca-nueva');
    var repetir = campoClave(activa ? 'Repite la clave nueva' : 'Repite la clave', 'repetir', 'new-password', 'sb-ca-repetir');
    var guardar = h('button', { type: 'submit', class: 'sb-btn', text: activa ? 'Cambiar mi clave' : 'Guardar mi clave' });
    f.appendChild(h(primera ? 'h2' : 'h3', { class: primera ? 'sb-h2' : 'sb-h3', text: primera ? 'Crea tu clave de administración' : 'Mi clave de administración' }));
    f.appendChild(h('p', { class: 'sb-texto', text: primera
      ? 'Entraste con un código por correo. Si creas una clave, la próxima vez podrás elegir: entrar con tu correo y clave, o con un código.'
      : activa ? 'La entrada con clave está activada: puedes entrar con tu correo y clave, o con un código por correo.'
      : 'Hoy solo entras con código por correo. Crea una clave para poder elegir entre las dos formas.' }));
    if (actual) f.appendChild(actual);
    f.appendChild(nueva); f.appendChild(repetir);
    f.appendChild(h('p', { class: 'sb-ayuda', text: 'Usa al menos 10 caracteres. Una frase larga y fácil de recordar sirve.' }));
    var fila = h('div', { class: 'sb-fila' }, guardar);
    if (primera) fila.appendChild(boton('Ahora no', function () { estado.claveAdminOmitida = true; pintar(); }, 'sb-btn--sec'));
    f.appendChild(fila);
    f.appendChild(msg);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n1 = nueva.entrada.value, n2 = repetir.entrada.value, local = correo.split('@')[0].toLowerCase();
      var error = null;
      if (actual && !actual.entrada.value) error = 'Escribe tu clave actual.';
      else if (n1.length < 10) error = 'La clave tiene que tener al menos 10 caracteres.';
      else if (n1 !== n2) error = 'Las dos claves no son iguales.';
      else if (local.length >= 4 && n1.toLowerCase().indexOf(local) >= 0) error = 'La clave no puede llevar tu correo.';
      if (error) { ponerAviso(msg, error); return; }
      ponerAviso(msg, '');
      conTarea(guardar, async function () {
        if (actual) {
          var v = await sb.auth.signInWithPassword({ email: correo, password: actual.entrada.value });
          if (v.error) throw new Error('clave actual');
        }
        var r = await sb.auth.updateUser({ password: n1 });
        if (r.error) throw r.error;
        if (!activa) {
          var r2 = await sb.rpc('admin_activar_clave', { p_activa: true });
          if (r2.error) throw r2.error;
          estado.claveAdmin = true;
        }
        await sb.auth.signOut({ scope: 'others' });
        if (primera) { pintar(); return; }
        [actual, nueva, repetir].forEach(function (c) { if (c) c.entrada.value = ''; });
        ponerAviso(msg, activa ? 'Listo, cambiamos tu clave. Las otras sesiones se cerraron.' : 'Listo, activamos tu clave. Desde ahora puedes entrar con tu correo y clave, o con un código.', 'ok');
        if (!activa) pintar();
      }).catch(function (e) {
        ponerAviso(msg, /clave actual/.test((e && e.message) || '') ? 'La clave actual no es correcta.' : mensajeError(e, 'No pudimos guardar la clave. Inténtalo de nuevo.'));
      });
    });
    return f;
  }

  function vistaMiClave() {
    var caja = h('div');
    var msg = h('div');
    caja.appendChild(h('h2', { class: 'sb-h2', text: 'Mi clave' }));
    caja.appendChild(vistaClaveAdmin(false));
    if (estado.claveAdmin === true) {
      var quitar = boton('Desactivar la entrada con clave', function () {
        if (!window.confirm('Después de esto solo podrás entrar con código por correo. ¿Seguro?')) return;
        conTarea(quitar, async function () {
          var r = await sb.rpc('admin_activar_clave', { p_activa: false });
          if (r.error) throw r.error;
          // Una sesión de clave deja de valer como administración: se vuelve a entrar con código.
          await sb.auth.signOut({ scope: 'local' });
          limpiarEstado();
          pintar();
        }).catch(function () { ponerAviso(msg, 'No pudimos desactivarla. Inténtalo de nuevo.'); });
      }, 'sb-btn--sec');
      caja.appendChild(h('div', { class: 'sb-caja sb-caja--aparte' }, h('p', { class: 'sb-texto', text: 'Si prefieres entrar solo con código por correo, puedes apagar la clave. No se borra: puedes activarla de nuevo cuando quieras.' }),
        h('div', { class: 'sb-fila' }, quitar), msg));
    }
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Fotos de perfil                                                     */
  /* ------------------------------------------------------------------ */

  function iniciales(nombre) {
    var p = String(nombre || '').trim().split(/\s+/);
    return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase() || '?';
  }

  /* Las fotos son privadas: se piden con un enlace firmado que dura una hora. */
  async function firmarFotos(paths) {
    var faltan = (paths || []).filter(function (x, i, a) { return x && !estado.fotos[x] && a.indexOf(x) === i; });
    if (!faltan.length) return;
    var r = await sb.storage.from('perfiles').createSignedUrls(faltan, 3600);
    (r.data || []).forEach(function (x) { if (x && x.signedUrl && !x.error) estado.fotos[x.path] = x.signedUrl; });
  }

  function avatar(nombre, ruta, clase) {
    var caja = h('span', { class: 'sb-avatar' + (clase ? ' ' + clase : ''), 'aria-hidden': 'true' });
    var poner = function (url) { caja.textContent = ''; caja.appendChild(h('img', { src: url, alt: '' })); };
    if (ruta && estado.fotos[ruta]) poner(estado.fotos[ruta]);
    else {
      caja.textContent = iniciales(nombre);
      if (ruta) firmarFotos([ruta]).then(function () { if (estado.fotos[ruta]) poner(estado.fotos[ruta]); }, function () { /* quedan las iniciales */ });
    }
    return caja;
  }

  /* Recorta al centro en un cuadrado de 512 px y la guarda como JPG liviano. */
  function prepararFoto(archivo) {
    return new Promise(function (ok, no) {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) { no(new Error('tipo')); return; }
      if (archivo.size > 20 * 1024 * 1024) { no(new Error('pesada')); return; }
      var url = window.URL.createObjectURL(archivo), img = new Image();
      img.onload = function () {
        window.URL.revokeObjectURL(url);
        var w = img.naturalWidth, hh = img.naturalHeight, lado = Math.min(w, hh);
        if (!lado || w * hh > 80e6) { no(new Error('imagen')); return; }
        var c = document.createElement('canvas'), tam = Math.min(512, lado);
        c.width = tam; c.height = tam;
        c.getContext('2d').drawImage(img, (w - lado) / 2, (hh - lado) / 2, lado, lado, 0, 0, tam, tam);
        c.toBlob(function (b) { if (b && b.size <= 2 * 1024 * 1024) ok(b); else no(new Error('pesada')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { window.URL.revokeObjectURL(url); no(new Error('imagen')); };
      img.src = url;
    });
  }

  async function subirFoto(blob) {
    var uid = estado.sesion.user.id, ruta = uid + '/foto-' + Date.now() + '.jpg';
    var anterior = estado.perfil && estado.perfil.foto_path;
    var r = await sb.storage.from('perfiles').upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
    if (r.error) throw r.error;
    var u = await sb.from('baristas').update({ foto_path: ruta }).eq('id', uid).select('*').single();
    if (u.error) { await sb.storage.from('perfiles').remove([ruta]); throw u.error; }
    estado.perfil = u.data;
    try { await firmarFotos([ruta]); } catch (e) { /* se verá en la próxima carga */ }
    if (anterior) { try { await sb.storage.from('perfiles').remove([anterior]); } catch (e) { /* queda huérfana, no pasa nada */ } }
  }

  async function quitarFoto() {
    var uid = estado.sesion.user.id, anterior = estado.perfil && estado.perfil.foto_path;
    var u = await sb.from('baristas').update({ foto_path: null }).eq('id', uid).select('*').single();
    if (u.error) throw u.error;
    estado.perfil = u.data;
    if (anterior) { try { await sb.storage.from('perfiles').remove([anterior]); } catch (e) { /* queda huérfana */ } }
  }

  /* Bloque de foto del formulario. Sin perfil todavía, la foto queda lista y se sube al completar el registro. */
  function bloqueFoto(editando) {
    var caja = h('div', { class: 'sb-foto' });
    var msg = h('div');
    var archivo = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sb-oculto', 'aria-label': 'Elegir foto de perfil' });
    var vista = h('div');
    var subir = boton('Subir foto de perfil', function () { archivo.click(); }, 'sb-btn--sec');
    var quitar = boton('Quitar foto', function () {
      if (!editando) { estado.fotoPendiente = null; pintarFoto(); return; }
      conTarea(quitar, quitarFoto).then(function () { pintarFoto(); ponerAviso(msg, 'Foto de perfil quitada.', 'ok'); }, function () { ponerAviso(msg, 'No pudimos quitar la foto. Inténtalo de nuevo.'); });
    }, 'sb-btn--sec');
    var pintarFoto = function () {
      vista.textContent = '';
      var nombre = (estado.perfil && estado.perfil.nombre) || (estado.acceso && estado.acceso.nombre) || '';
      var ruta = estado.perfil && estado.perfil.foto_path;
      var tiene = !!estado.fotoPendiente || !!ruta;
      var av = h('span', { class: 'sb-avatar sb-avatar--grande', 'aria-hidden': 'true' });
      if (estado.fotoPendiente) {
        if (estado.fotoPendienteUrl) window.URL.revokeObjectURL(estado.fotoPendienteUrl);
        estado.fotoPendienteUrl = window.URL.createObjectURL(estado.fotoPendiente);
        av.appendChild(h('img', { src: estado.fotoPendienteUrl, alt: '' }));
      } else av = avatar(nombre, ruta, 'sb-avatar--grande');
      vista.appendChild(h('div', { class: 'sb-foto__fila' }, av,
        h('div', null, h('div', { class: 'sb-fila sb-fila--chica' }, subir, tiene ? quitar : null),
          h('p', { class: 'sb-ayuda', text: 'JPG, PNG o WebP. Se muestra junto a tu nombre al equipo. Es opcional.' }))));
      subir.textContent = tiene ? 'Cambiar foto' : 'Subir foto de perfil';
    };
    archivo.addEventListener('change', function () {
      var f = archivo.files && archivo.files[0];
      archivo.value = '';
      if (!f) return;
      ponerAviso(msg, '');
      prepararFoto(f).then(function (blob) {
        if (!editando) { estado.fotoPendiente = blob; pintarFoto(); return; }
        return conTarea(subir, function () { return subirFoto(blob); }).then(function () { pintarFoto(); ponerAviso(msg, 'Listo, guardamos tu foto.', 'ok'); });
      }).catch(function (e) {
        var t = (e && e.message) || '';
        ponerAviso(msg, t === 'tipo' ? 'Usa una foto JPG, PNG o WebP. Si está en HEIC, expórtala como JPG.'
          : t === 'pesada' ? 'La foto pesa demasiado. Elige una más liviana.'
          : t === 'imagen' ? 'No pudimos abrir esa imagen. Prueba con otra foto.' : 'No pudimos guardar la foto. Inténtalo de nuevo.');
      });
    });
    pintarFoto();
    caja.appendChild(h('h3', { class: 'sb-h3', text: 'Foto de perfil' }));
    caja.appendChild(vista); caja.appendChild(archivo); caja.appendChild(msg);
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Completar el perfil y «Mis datos»                                   */
  /* ------------------------------------------------------------------ */

  function sinTildes(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  /* Historial anterior al portal: filas ya agrupadas por persona (historial_resumen). */
  function turnosHistorial(idAcceso) {
    return estado.historial.filter(function (x) { return x.acceso_id === idAcceso; }).reduce(function (n, x) { return n + Number(x.turnos); }, 0);
  }
  function historialSinVincular() {
    return estado.historial.filter(function (x) { return !x.acceso_id; }).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
  }

  var ALIAS_BANCOS = [
    [/banco\s*de\s*chile|banco\s*chile|\bbchile\b|edwards/, 'Banco de Chile'], [/banco\s*estado|bancoestado/, 'Banco Estado'],
    [/santander/, 'Banco Santander'], [/\bbci\b|banco\s*de\s*credito/, 'BCI'], [/scotia/, 'Scotiabank'], [/\bitau\b/, 'Banco Itaú'],
    [/falabella/, 'Banco Falabella'], [/security/, 'Banco Security'], [/\bbice\b/, 'Banco BICE'], [/ripley/, 'Banco Ripley'],
    [/consorcio/, 'Banco Consorcio'], [/coopeuch/, 'Coopeuch'], [/mercado\s*pago/, 'Mercado Pago'], [/tenpo/, 'Tenpo'], [/\bmach\b/, 'Mach']
  ];

  /* Lee los «datos para transferencias» que entrega un banco (pegados como texto) y devuelve lo que reconoce.
     Todo ocurre en el dispositivo: el texto no se envía a ninguna parte. */
  function leerDatosBanco(texto) {
    var t = String(texto || ''), plano = sinTildes(t), r = {};
    var rut = null;
    (t.match(/\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g) || []).forEach(function (x) { if (!rut && rutValido(x)) rut = x; });
    if (rut) r.rut = formatoRut(rut);
    var mail = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (mail) r.correo = mail[0].toLowerCase();
    var nom = t.match(/^\s*(?:nombre(?:\s+completo)?|titular|a\s+nombre\s+de)\s*[:\-]\s*(.+?)\s*$/im);
    if (nom && nom[1].length >= 3 && nom[1].length <= 100) r.nombre = nom[1];
    for (var i = 0; i < ALIAS_BANCOS.length; i++) { if (ALIAS_BANCOS[i][0].test(plano)) { r.banco = ALIAS_BANCOS[i][1]; break; } }
    if (/cuenta\s*rut|cuentarut|cta\.?\s*rut|chequera\s*electronica/.test(plano)) r.tipo_cuenta = 'Cuenta RUT';
    else if (/vista/.test(plano)) r.tipo_cuenta = 'Cuenta vista';
    else if (/corriente|cta\.?\s*cte|\bcc\b/.test(plano)) r.tipo_cuenta = 'Cuenta corriente';
    else if (/ahorro/.test(plano)) r.tipo_cuenta = 'Cuenta de ahorro';
    var num = t.match(/(?:n[°ºo.]?\s*(?:de\s*)?cuenta|n[uú]mero\s*(?:de\s*)?cuenta|nro\.?\s*(?:de\s*)?cuenta|cuenta\s*n[°º]?)\s*[:\-]?\s*([0-9][0-9\s.\-]{3,24})/i);
    var digitos = num ? num[1].replace(/[^\d]/g, '') : '';
    if (!/^\d{4,20}$/.test(digitos)) {
      var sinRut = t.replace(/\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g, ' ').replace(/\+?56\s?9[\s\d]{8,10}/g, ' ');
      digitos = (sinRut.match(/\d{6,20}/g) || []).sort(function (a, b) { return b.length - a.length; })[0] || '';
    }
    if (/^\d{4,20}$/.test(digitos)) r.numero_cuenta = digitos;
    else if (r.tipo_cuenta === 'Cuenta RUT' && r.rut) r.numero_cuenta = limpiarRut(r.rut).slice(0, -1);
    return r;
  }

  function bloquePegarBanco(f, msg) {
    var ta = h('textarea', { class: 'sb-entrada', rows: '4', maxlength: '800', 'aria-label': 'Datos de transferencia pegados', placeholder: 'Pega aquí los datos de tu banco' });
    var rellenar = boton('Rellenar datos', function () {
      var r = leerDatosBanco(ta.value);
      var pon = function (nombre, valor, siempre) {
        var el = f.elements[nombre];
        if (el && valor && (siempre || !el.value.trim())) el.value = valor;
      };
      var hay = Object.keys(r).length > 0;
      if (hay) {
        pon('banco', r.banco, true); pon('tipo_cuenta', r.tipo_cuenta, true); pon('numero_cuenta', r.numero_cuenta, true);
        pon('rut', r.rut); pon('nombre', r.nombre); pon('correo', r.correo);
      }
      ta.value = '';
      ponerAviso(msg, hay ? 'Listo. Revisa los datos antes de guardar.' : 'No reconocimos los datos. Completa los campos manualmente.', hay ? 'ok' : '');
    }, 'sb-btn--sec');
    return h('details', { class: 'sb-detalle sb-detalle--chico' },
      h('summary', { class: 'sb-resumen' }, h('span', { class: 'sb-resumen__t', text: 'Pegar datos desde mi banco' })),
      h('p', { class: 'sb-ayuda', text: 'Pega los datos para transferencias que te da tu banco. Se leen en tu dispositivo y no se envían a ninguna parte. No pegues claves ni códigos.' }),
      ta, h('div', { class: 'sb-fila' }, rellenar));
  }

  function vistaFormularioPerfil(modo) {
    var p = estado.perfil || {};
    var editando = modo === 'editar';
    var cfg = estado.config || {};
    var f = h('form', { class: 'sb-caja', novalidate: true });
    var msg = h('div');
    var msgBanco = h('div');

    var banco = entrada('text', 'banco', p.banco || '', { list: 'sb-bancos', autocomplete: 'off', required: true, maxlength: '60', placeholder: 'Elige o escribe tu banco' });
    var lista = h('datalist', { id: 'sb-bancos' }, BANCOS.map(function (b) { return h('option', { value: b }); }));
    var tipo = h('select', { name: 'tipo_cuenta', class: 'sb-entrada', required: true },
      h('option', { value: '', text: 'Elige el tipo' }), TIPOS_CUENTA.map(function (t) { return h('option', { value: t, text: t }); }));
    tipo.value = p.tipo_cuenta || '';
    var talla = h('select', { name: 'talla_camisa', class: 'sb-entrada', required: true },
      h('option', { value: '', text: 'Elige tu talla' }), TALLAS.map(function (t) { return h('option', { value: t, text: t }); }));
    talla.value = p.talla_camisa || '';
    var exp = h('textarea', { name: 'experiencia', class: 'sb-entrada', rows: '3', maxlength: '600', placeholder: 'Por ejemplo: dos años de barra, latte art, eventos…' });
    exp.value = p.experiencia || '';
    var opcion = function (valor, titulo, detalle, marcada) {
      var r = h('input', { type: 'radio', name: 'camioneta', value: valor, class: 'sb-chk' });
      r.checked = marcada;
      return h('label', { class: 'sb-opcion' }, r, h('span', null, h('strong', { text: titulo }), h('small', { text: detalle })));
    };
    var camioneta = h('fieldset', { class: 'sb-campo sb-fieldset' }, h('legend', { class: 'sb-etiqueta', text: '¿Tienes camioneta disponible para transportar el carrito?' }),
      h('div', { class: 'sb-opciones' },
        opcion('si', 'Tengo camioneta', 'Disponible para transportar el carrito', editando && p.tiene_camioneta === true),
        opcion('no', 'No tengo camioneta', 'Postulo como barista sin camioneta', editando && p.tiene_camioneta === false)));

    f.appendChild(h('h2', { class: 'sb-h2', text: editando ? 'Mis datos' : 'Completa tu perfil' }));
    if (!editando) f.appendChild(h('p', { class: 'sb-texto', text: 'Bienvenido al equipo. Completa esto una sola vez para ver los eventos y postular. Tus datos personales y bancarios solo los ven tú y la administración.' }));
    f.appendChild(h('h3', { class: 'sb-h3', text: 'Tus datos' }));
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Nombre completo', entrada('text', 'nombre', p.nombre || (estado.acceso && estado.acceso.nombre) || '', { autocomplete: 'name', required: true, maxlength: '100' })),
      campo('RUT', entrada('text', 'rut', p.rut || '', { autocomplete: 'off', required: true, maxlength: '12', placeholder: '12.345.678-5', autocapitalize: 'characters' })),
      campo('Teléfono (WhatsApp)', entrada('tel', 'telefono', p.telefono || '', { autocomplete: 'tel', required: true, maxlength: '16', placeholder: '9 1234 5678' })),
      campo('Correo de contacto', entrada('email', 'correo', p.correo || '', { autocomplete: 'email', required: true, maxlength: '120', placeholder: 'tucorreo@ejemplo.cl', inputmode: 'email' }), 'Aquí te llegan los avisos de Sepia. No es con lo que entras.'),
      campo('Comuna donde vives', entrada('text', 'comuna', p.comuna || '', { autocomplete: 'address-level2', required: true, maxlength: '60' })),
      campo('Talla de camisa', talla)));
    f.appendChild(camioneta);
    f.appendChild(campo('Experiencia (opcional)', exp));
    f.appendChild(bloqueFoto(editando));

    f.appendChild(h('h3', { class: 'sb-h3', text: 'Datos para transferirte' }));
    f.appendChild(bloquePegarBanco(f, msgBanco));
    f.appendChild(msgBanco);
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Banco', banco), lista,
      campo('Tipo de cuenta', tipo),
      campo('Número de cuenta', entrada('text', 'numero_cuenta', p.numero_cuenta || '', { inputmode: 'numeric', autocomplete: 'off', required: true, maxlength: '20', placeholder: 'Solo números' }))));
    f.appendChild(casilla('cuenta_propia', 'La cuenta está a mi nombre y con mi RUT.', !!p.cuenta_propia));

    f.appendChild(h('h3', { class: 'sb-h3', text: 'Boleta y privacidad' }));
    var textoBoleta = (editando && p.acepta_boleta_texto) || cfg.texto_boleta || 'Declaro que puedo emitir boleta de honorarios electrónica por los servicios que preste en los eventos de Sepia Coffee.';
    f.appendChild(casilla('acepta_boleta', textoBoleta, !!p.acepta_boleta));
    f.appendChild(casilla('acepta_privacidad', cfg.texto_privacidad || 'Sepia Coffee usa mis datos solo para coordinar los eventos y pagarme.', !!p.acepta_privacidad));
    f.appendChild(casilla('acepta_avisos', 'Quiero recibir por correo avisos cuando se abra un evento o haya cupos disponibles (opcional).', !!p.acepta_avisos));

    var guardar = h('button', { type: 'submit', class: 'sb-btn', text: editando ? 'Guardar cambios' : 'Completar perfil' });
    f.appendChild(h('div', { class: 'sb-fila' }, guardar));
    f.appendChild(msg);

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var d = new FormData(f);
      var v = function (k) { return String(d.get(k) || '').trim(); };
      var fila = {
        nombre: v('nombre'), rut: formatoRut(v('rut')), correo: v('correo').toLowerCase(), telefono: normalizarTelefono(v('telefono')),
        comuna: v('comuna'), talla_camisa: v('talla_camisa'), tiene_camioneta: v('camioneta') === 'si',
        experiencia: v('experiencia') || null, banco: v('banco'), tipo_cuenta: v('tipo_cuenta'),
        numero_cuenta: v('numero_cuenta').replace(/[^\d]/g, ''), cuenta_propia: !!d.get('cuenta_propia'),
        acepta_boleta: !!d.get('acepta_boleta'), acepta_privacidad: !!d.get('acepta_privacidad'), acepta_avisos: !!d.get('acepta_avisos')
      };
      var error = null, enfoque = null;
      if (fila.nombre.length < 3) { error = 'Escribe tu nombre completo.'; enfoque = 'nombre'; }
      else if (!rutValido(fila.rut)) { error = 'Revisa el RUT: está incompleto o el dígito verificador no calza.'; enfoque = 'rut'; }
      else if (!fila.telefono) { error = 'Escribe un teléfono válido, por ejemplo 9 1234 5678.'; enfoque = 'telefono'; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fila.correo)) { error = 'Escribe un correo de contacto válido.'; enfoque = 'correo'; }
      else if (fila.comuna.length < 2) { error = 'Escribe tu comuna.'; enfoque = 'comuna'; }
      else if (TALLAS.indexOf(fila.talla_camisa) < 0) { error = 'Elige tu talla de camisa.'; enfoque = 'talla_camisa'; }
      else if (v('camioneta') !== 'si' && v('camioneta') !== 'no') { error = 'Indica si tienes camioneta.'; enfoque = null; }
      else if (fila.banco.length < 2) { error = 'Escribe tu banco.'; enfoque = 'banco'; }
      else if (!fila.tipo_cuenta) { error = 'Elige el tipo de cuenta.'; enfoque = 'tipo_cuenta'; }
      else if (!/^\d{4,20}$/.test(fila.numero_cuenta)) { error = 'El número de cuenta debe tener solo números (entre 4 y 20).'; enfoque = 'numero_cuenta'; }
      else if (!fila.cuenta_propia) { error = 'Para transferirte, la cuenta tiene que estar a tu nombre y con tu RUT.'; enfoque = 'cuenta_propia'; }
      else if (!fila.acepta_boleta) { error = 'Para registrarte tienes que poder emitir boleta de honorarios. Marca la declaración.'; enfoque = 'acepta_boleta'; }
      else if (!fila.acepta_privacidad) { error = 'Marca que aceptas el uso de tus datos para poder registrarte.'; enfoque = 'acepta_privacidad'; }
      if (error) { ponerAviso(msg, error); var el = enfoque && f.elements[enfoque]; if (el) el.focus(); return; }
      ponerAviso(msg, '');
      conTarea(guardar, async function () {
        var r;
        if (editando) {
          var cambios = Object.assign({}, fila); delete cambios.acepta_boleta; delete cambios.acepta_privacidad; delete cambios.cuenta_propia;
          r = await sb.from('baristas').update(cambios).eq('id', estado.sesion.user.id).select('*').single();
        } else {
          fila.id = estado.sesion.user.id;
          fila.acepta_boleta_texto = textoBoleta;
          r = await sb.from('baristas').insert(fila).select('*').single();
        }
        if (r.error) throw r.error;
        estado.perfil = r.data;
        if (!editando) {
          if (estado.fotoPendiente) {      // la foto elegida antes de existir el perfil
            try { await subirFoto(estado.fotoPendiente); } catch (e) { /* se puede subir después desde «Mis datos» */ }
            estado.fotoPendiente = null;
          }
          await cargarEventos(); estado.pestana = 'eventos'; pintar();
        } else ponerAviso(msg, 'Listo, guardamos tus datos.', 'ok');
      }).catch(function (e) { ponerAviso(msg, mensajeError(e, 'No pudimos guardar. Revisa los datos e inténtalo de nuevo.')); });
    });

    if (editando) {
      f.appendChild(h('hr', { class: 'sb-sep' }));
      f.appendChild(h('p', { class: 'sb-texto', text: 'Aceptaste la declaración de boleta y el uso de tus datos el ' + new Date(p.aceptado_en).toLocaleDateString('es-CL') + '.' }));
      var borrar = boton('Borrar mis datos', function () {
        if (!window.confirm('Vamos a borrar tu perfil y tus postulaciones. Tu acceso sigue activo y tendrás que completar el perfil de nuevo. ¿Seguro?')) return;
        conTarea(borrar, async function () {
          var r = await sb.from('baristas').delete().eq('id', estado.sesion.user.id);
          if (r.error) throw r.error;
          estado.perfil = null; estado.posts = []; estado.misPosts = {};
          pintar();
        }).catch(function () { ponerAviso(msg, 'No pudimos borrar tus datos. Escríbenos por WhatsApp.'); });
      }, 'sb-btn--sec');
      f.appendChild(borrar);
    }
    return f;
  }

  /* ------------------------------------------------------------------ */
  /* Eventos para baristas                                               */
  /* ------------------------------------------------------------------ */

  function chip(texto, clase) { return h('span', { class: 'sb-chip' + (clase ? ' ' + clase : ''), text: texto }); }

  function bloquePago(ev) {
    return h('div', { class: 'sb-pago' },
      h('p', { class: 'sb-pago__monto', text: 'Pago: ' + clp(ev.pago_liquido) + ' líquidos' }),
      h('p', { class: 'sb-pago__nota', text: 'Tu boleta de honorarios debe ser por ' + clp(ev.monto_boleta) + ' (con la retención de ' + pct(ev.retencion) + ' te quedan ' + clp(ev.pago_liquido) + ').' }));
  }

  /* Después del evento: la persona avisa que emitió su boleta de honorarios y ve cuándo se le paga. */
  function bloqueBoleta(ev, post, mensajeEn) {
    if (!post || post.estado !== 'confirmada' || ev.fecha >= hoyISO()) return null;
    if (post.honorarios_pagados_en) {
      return h('div', { class: 'sb-pago' },
        h('p', { class: 'sb-pago__monto', text: 'Pago recibido' }),
        h('p', { class: 'sb-pago__nota', text: 'Te transferimos ' + clp(ev.pago_liquido) + ' líquidos el ' + fechaLarga(post.honorarios_pagados_en).toLowerCase() + '. ¡Gracias!' }));
    }
    if (post.boleta_declarada_en) {
      return h('div', { class: 'sb-pago' },
        h('p', { class: 'sb-pago__monto', text: 'Boleta enviada: la estamos revisando' }),
        h('p', { class: 'sb-pago__nota', text: 'Nos avisaste el ' + diaCorto(post.boleta_declarada_en) + (post.boleta_declarada_folio ? ' (folio ' + post.boleta_declarada_folio + ')' : '')
          + '. La revisamos en el SII y, cuando te transfiramos ' + clp(ev.pago_liquido) + ', te avisamos por correo.' }));
    }
    var folio = entrada('text', 'folio', '', { maxlength: '40', placeholder: 'Opcional' });
    var btn = boton('Ya emití mi boleta de honorarios', function () {
      if (!window.confirm('¿Ya emitiste la boleta de honorarios por ' + clp(ev.monto_boleta) + ' en el SII?')) return;
      conTarea(btn, async function () {
        var r = await sb.from('postulaciones').update({ boleta_declarada_en: new Date().toISOString(), boleta_declarada_folio: folio.value.trim() || null }).eq('id', post.id);
        if (r.error) throw r.error;
        await recargar();
      }).catch(function () { ponerAviso(mensajeEn, 'No pudimos guardar el aviso. Inténtalo de nuevo o escríbenos por WhatsApp.'); });
    });
    return h('div', { class: 'sb-pago' },
      h('p', { class: 'sb-pago__monto', text: 'Para que te paguemos: tu boleta de honorarios' }),
      h('p', { class: 'sb-pago__nota', text: 'Emítela en el SII por ' + clp(ev.monto_boleta) + ' (con la retención de ' + pct(ev.retencion) + ' te quedan ' + clp(ev.pago_liquido) + '). Cuando la tengas, avísanos aquí.' }),
      campo('Número de folio de la boleta', folio, 'Si lo tienes a mano. No es obligatorio.'),
      h('div', { class: 'sb-fila' }, btn));
  }

  /* Quiénes van al evento (nombre y foto), para quienes ya están asignados. */
  function bloqueEquipo(ev, post) {
    var miembros = estado.equipos[ev.id];
    if (!post || post.estado !== 'confirmada' || !miembros || !miembros.length) return null;
    var yo = estado.sesion.user.id;
    return h('div', { class: 'sb-equipo' },
      h('p', { class: 'sb-linea sb-linea--fuerte', text: 'Tu equipo en este evento' }),
      h('ul', { class: 'sb-equipo__lista' }, miembros.map(function (m) {
        return h('li', null, avatar(m.nombre, m.foto_path),
          h('span', { class: 'sb-equipo__nombre', text: m.nombre + (m.barista_id === yo ? ' (tú)' : '') }),
          m.conductor ? chip('Conductor con camioneta', 'sb-chip--ok') : null);
      })));
  }

  /* El reembolso de la camioneta, solo para quien fue asignado de conductor. */
  function filaTraslado(t) {
    var partes = [];
    if (t.km != null) partes.push(String(t.km).replace('.', ',') + ' km');
    partes.push('bencina ' + (t.bencina == null ? 'pendiente de calcular' : clp(t.bencina)));
    partes.push('TAG y peajes ' + (t.tag == null ? 'pendiente de calcular' : clp(t.tag)));
    if (Number(t.estacionamiento) > 0) partes.push('estacionamiento ' + clp(t.estacionamiento));
    return partes.join(' · ');
  }
  function bloqueTraslado(ev) {
    var yo = estado.sesion.user.id;
    var t = estado.traslados.filter(function (x) { return x.evento_id === ev.id && x.barista_id === yo; })[0];
    if (!t) return null;
    return h('div', { class: 'sb-pago' },
      h('p', { class: 'sb-pago__monto', text: 'Traslado con camioneta: ' + (t.total == null ? 'por calcular' : clp(t.total)) }),
      h('p', { class: 'sb-pago__nota', text: filaTraslado(t) }),
      h('p', { class: 'sb-pago__nota', text: t.pagado_en ? 'Reembolso pagado el ' + fechaLarga(t.pagado_en).toLowerCase() + '.'
        : 'Es un reembolso aparte de tus honorarios, no va en la boleta. El estacionamiento se agrega al cierre si corresponde. Estimación sujeta a ruta y horario.' }));
  }

  function tarjetaProximoTurno() {
    var hoy = hoyISO();
    var prox = estado.eventos.filter(function (e) {
      var p = estado.misPosts[e.id];
      return p && p.estado === 'confirmada' && e.estado !== 'cancelado' && e.fecha >= hoy;
    }).sort(porFecha)[0];
    var caja = h('section', { class: 'sb-proximo' }, h('p', { class: 'sb-eyebrow', text: 'MI PRÓXIMO TURNO' }));
    if (!prox) { caja.appendChild(h('p', { class: 'sb-linea', text: 'Aún no tienes un turno confirmado. Elige uno de los eventos de abajo.' })); return caja; }
    var p = estado.misPosts[prox.id];
    caja.appendChild(h('h3', { class: 'sb-h3', text: prox.nombre }));
    caja.appendChild(h('p', { class: 'sb-linea sb-linea--fuerte', text: fechaLarga(prox.fecha) + ' · ' + hhmm(prox.hora_inicio) + ' a ' + hhmm(prox.hora_fin) }));
    caja.appendChild(h('p', { class: 'sb-linea', text: [prox.lugar, prox.comuna].filter(Boolean).join(' · ') }));
    caja.appendChild(p.asistencia_confirmada_en ? chip('Asistencia confirmada', 'sb-chip--ok') : chip('Falta que confirmes'));
    return caja;
  }

  /* Lo que la persona todavía tiene que hacer (se muestra arriba en «Eventos»). */
  function pendientesBarista() {
    var hoy = hoyISO(), out = [];
    estado.eventos.forEach(function (ev) {
      var p = estado.misPosts[ev.id];
      if (!p || p.estado !== 'confirmada' || ev.estado === 'cancelado') return;
      if (ev.fecha >= hoy && !p.asistencia_confirmada_en) out.push('Confirma que vas a «' + ev.nombre + '» (' + fechaLarga(ev.fecha) + ').');
      if (ev.fecha < hoy && !p.boleta_declarada_en && !p.honorarios_pagados_en) out.push('Avísanos cuando emitas tu boleta de honorarios de «' + ev.nombre + '» (por ' + clp(ev.monto_boleta) + ').');
    });
    return out;
  }

  function tarjetaEvento(ev, mensajeEn) {
    var post = estado.misPosts[ev.id];
    var dir = estado.dirs[ev.id];
    var abierto = ev.estado === 'abierto' && ev.fecha >= hoyISO();
    var acciones = h('div', { class: 'sb-fila' });
    var estadoChip = null;

    var cambiar = function (btn, nuevo, textoError) {
      conTarea(btn, async function () {
        var r;
        if (post) r = await sb.from('postulaciones').update({ estado: nuevo }).eq('id', post.id);
        else r = await sb.from('postulaciones').insert({ evento_id: ev.id, barista_id: estado.sesion.user.id });
        if (r.error) throw r.error;
        await recargar();
      }).catch(function () { ponerAviso(mensajeEn, textoError); });
    };

    if (post && post.estado === 'confirmada') {
      var reconfirmada = !!post.asistencia_confirmada_en, pasado = ev.fecha < hoyISO();
      estadoChip = reconfirmada ? chip('Asistencia confirmada', 'sb-chip--ok') : (pasado ? chip('Asignado') : chip('Asignado: falta que confirmes'));
      if (!reconfirmada && !pasado) {
        var btnC = boton('Confirmo que voy', function () {
          conTarea(btnC, async function () {
            var r = await sb.from('postulaciones').update({ asistencia_confirmada_en: new Date().toISOString() }).eq('id', post.id);
            if (r.error) throw r.error;
            await recargar();
          }).catch(function () { ponerAviso(mensajeEn, 'No pudimos confirmar tu asistencia. Inténtalo de nuevo o escríbenos por WhatsApp.'); });
        });
        acciones.appendChild(btnC);
      }
      var btnR = boton('Retirarme', function () {
        if (!window.confirm('¿Seguro que quieres retirarte? Si es con poco tiempo, avísanos también por WhatsApp.')) return;
        cambiar(btnR, 'retirada', 'No pudimos retirarte. Escríbenos por WhatsApp.');
      }, 'sb-btn--sec');
      if (!pasado) acciones.appendChild(btnR);
    } else if (post && post.estado === 'postulada') {
      estadoChip = chip('Postulaste');
      var btnQ = boton('Retirar postulación', function () { cambiar(btnQ, 'retirada', 'No pudimos retirar tu postulación. Inténtalo de nuevo.'); }, 'sb-btn--sec');
      acciones.appendChild(btnQ);
    } else if (post && post.estado === 'rechazada') {
      estadoChip = chip('No seleccionado esta vez', 'sb-chip--no');
    } else if (abierto) {
      if (post && post.estado === 'retirada') estadoChip = chip('Retiraste tu postulación', 'sb-chip--no');
      var btnP = boton('Postular', function () { cambiar(btnP, 'postulada', 'No pudimos postular. Puede que el evento ya esté cerrado.'); });
      acciones.appendChild(btnP);
    } else {
      estadoChip = chip(ev.estado === 'cancelado' ? 'Cancelado' : 'Cerrado', 'sb-chip--no');
    }

    var cierre = bloqueBoleta(ev, post, mensajeEn);
    return h('article', { class: 'sb-tarjeta' },
      h('div', { class: 'sb-tarjeta__cab' }, h('h3', { class: 'sb-h3', text: ev.nombre }), estadoChip),
      ev.requiere_camioneta ? h('p', { class: 'sb-linea' }, chip('Necesita camioneta')) : null,
      h('p', { class: 'sb-linea sb-linea--fuerte', text: fechaLarga(ev.fecha) }),
      h('p', { class: 'sb-linea', text: hhmm(ev.hora_inicio) + ' a ' + hhmm(ev.hora_fin) + ' · ' + horasTxt(ev.horas) }),
      h('p', { class: 'sb-linea', text: [ev.lugar, ev.comuna].filter(Boolean).join(' · ') }),
      h('p', { class: 'sb-linea', text: 'Buscamos ' + ev.baristas_necesarios + (ev.baristas_necesarios === 1 ? ' barista' : ' baristas') }),
      ev.descripcion ? h('p', { class: 'sb-linea', text: ev.descripcion }) : null,
      cierre ? null : bloquePago(ev),
      post && post.estado === 'confirmada' && !post.asistencia_confirmada_en && ev.fecha >= hoyISO()
        ? h('p', { class: 'sb-aviso', text: 'Te asignamos a este evento. Confirma que vas para que podamos contar contigo.' }) : null,
      dir ? h('div', { class: 'sb-dir' }, h('p', { class: 'sb-linea sb-linea--fuerte', text: 'Dirección: ' + dir.direccion }),
        dir.indicaciones ? h('p', { class: 'sb-linea', text: dir.indicaciones }) : null) : null,
      bloqueEquipo(ev, post),
      bloqueTraslado(ev),
      cierre,
      acciones);
  }

  function vistaEventos() {
    var caja = h('div');
    var msg = h('div');
    var hoy = hoyISO();
    var proximos = estado.eventos.filter(function (e) { return e.estado === 'abierto' && e.fecha >= hoy; });
    caja.appendChild(h('div', { class: 'sb-fila sb-fila--entre' },
      h('h2', { class: 'sb-h2', text: 'Próximos eventos' }),
      boton('Actualizar', function () { recargar(); }, 'sb-btn--sec')));
    caja.appendChild(msg);
    caja.appendChild(tarjetaProximoTurno());
    caja.appendChild(h('p', { class: 'sb-texto', text: 'Cada evento se abre a la inscripción ' + diasPublicacion() + ' días antes de su fecha.' }));
    var pend = pendientesBarista();
    if (pend.length) {
      caja.appendChild(h('div', { class: 'sb-alertas', role: 'alert' },
        h('p', { class: 'sb-alertas__t', text: pend.length === 1 ? 'Tienes 1 cosa pendiente' : 'Tienes ' + pend.length + ' cosas pendientes' }),
        h('ul', null, pend.map(function (t) { return h('li', { text: t }); })),
        h('div', { class: 'sb-fila' }, boton('Ir a mis postulaciones', function () { estado.pestana = 'mis'; pintar(); }))));
    }
    if (!proximos.length) caja.appendChild(h('p', { class: 'sb-texto', text: 'Por ahora no hay eventos abiertos. Aquí aparecen cuando faltan ' + diasPublicacion() + ' días o menos para su fecha: vuelve pronto.' }));
    caja.appendChild(h('div', { class: 'sb-lista' }, proximos.map(function (e) { return tarjetaEvento(e, msg); })));
    return caja;
  }

  function vistaMisPostulaciones() {
    var caja = h('div');
    var msg = h('div');
    var mias = estado.eventos.filter(function (e) { return estado.misPosts[e.id]; });
    caja.appendChild(h('h2', { class: 'sb-h2', text: 'Mis postulaciones' }));
    caja.appendChild(msg);
    if (!mias.length) caja.appendChild(h('p', { class: 'sb-texto', text: 'Todavía no postulas a ningún evento.' }));
    caja.appendChild(h('div', { class: 'sb-lista' }, mias.map(function (e) { return tarjetaEvento(e, msg); })));
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Ranking del equipo y «Mis ganancias»                                */
  /* ------------------------------------------------------------------ */

  function periodosRanking() {
    var hoy = hoyISO(), a = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7)), out = [['acum', 'Acumulado']];
    for (var i = 0; i < 12; i++) {
      var d = new Date(Date.UTC(a, m - 1 - i, 1));
      var etiqueta = d.toLocaleDateString('es-CL', { timeZone: 'UTC', month: 'long', year: 'numeric' });
      var y = d.getUTCFullYear(), mm = ('0' + (d.getUTCMonth() + 1)).slice(-2), ultimo = new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate();
      out.push([y + '-' + mm + '|' + y + '-' + mm + '-' + ('0' + ultimo).slice(-2), etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)]);
    }
    return out;
  }

  function vistaRanking() {
    var caja = h('div');
    var msg = h('div');
    var yo = estado.sesion.user.id;
    var opciones = periodosRanking();
    var periodo = h('select', { name: 'periodo', class: 'sb-entrada', id: 'sb-periodo' }, opciones.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var buscar = entrada('search', 'buscar', '', { id: 'sb-buscar', placeholder: 'Buscar en el equipo…', autocomplete: 'off', maxlength: '60' });
    var cuerpo = h('div');
    var filas = [];
    caja.appendChild(h('p', { class: 'sb-eyebrow', text: 'CADA TURNO CUENTA' }));
    caja.appendChild(h('h2', { class: 'sb-h2', text: 'Ranking del equipo' }));
    caja.appendChild(h('p', { class: 'sb-texto', text: 'Reconocemos la experiencia que construimos evento a evento. Una participación suma un turno cuando Sepia registra tu asistencia.' }));
    caja.appendChild(h('div', { class: 'sb-grilla' },
      h('div', { class: 'sb-campo' }, h('label', { class: 'sb-etiqueta', for: 'sb-periodo', text: 'Período del ranking' }), periodo),
      h('div', { class: 'sb-campo' }, h('label', { class: 'sb-etiqueta', for: 'sb-buscar', text: 'Buscar barista' }), buscar)));
    caja.appendChild(msg); caja.appendChild(cuerpo);

    var dibujar = function () {
      cuerpo.textContent = '';
      var q = sinTildes(buscar.value.trim());
      var vistas = filas.filter(function (r) { return !q || sinTildes(r.nombre).indexOf(q) >= 0; });
      var total = filas.reduce(function (n, r) { return n + Number(r.turnos); }, 0);
      cuerpo.appendChild(h('p', { class: 'sb-texto', text: plural(filas.length, 'barista en el equipo', 'baristas en el equipo') + ' · ' + plural(total, 'participación registrada', 'participaciones registradas') }));
      if (!vistas.length) { cuerpo.appendChild(h('p', { class: 'sb-texto', text: filas.length ? 'No encontramos ese nombre. Prueba con otra búsqueda.' : 'Aún no hay baristas en el equipo.' })); return; }
      cuerpo.appendChild(h('ol', { class: 'sb-ranking' }, vistas.map(function (r) {
        var soy = r.barista_id === yo;
        return h('li', { class: 'sb-ranking__fila' + (soy ? ' sb-ranking__fila--yo' : '') },
          h('span', { class: 'sb-ranking__puesto', text: String(r.puesto) }),
          avatar(r.nombre, r.foto_path),
          h('span', { class: 'sb-ranking__nombre', text: r.nombre + (soy ? ' (tú)' : '') }),
          h('span', { class: 'sb-ranking__turnos' }, h('strong', { text: String(r.turnos) }), ' ' + (Number(r.turnos) === 1 ? 'turno' : 'turnos')));
      })));
      cuerpo.appendChild(h('p', { class: 'sb-ayuda', text: 'Los empates comparten puesto. Una postulación o una foto no suman. El acumulado suma todo el historial de Sepia, incluso lo de antes del portal; cada mes cuenta solo los turnos de ese mes.' }));
    };
    var cargar = function () {
      ponerAviso(msg, '');
      var partes = periodo.value === 'acum' ? null : periodo.value.split('|');
      var args = partes ? { p_desde: partes[0] + '-01', p_hasta: partes[1] } : {};
      cuerpo.textContent = ''; cuerpo.appendChild(h('p', { class: 'sb-texto', role: 'status', text: 'Cargando el ranking del equipo…' }));
      Promise.resolve(sb.rpc('ranking_equipo', args)).then(function (r) {
        if (r.error) throw r.error;
        filas = r.data || [];
        return firmarFotos(filas.map(function (x) { return x.foto_path; })).catch(function () { /* iniciales */ });
      }).then(dibujar, function () { cuerpo.textContent = ''; ponerAviso(msg, 'No pudimos consultar el ranking. Inténtalo de nuevo.'); });
    };
    periodo.addEventListener('change', cargar);
    buscar.addEventListener('input', dibujar);
    cargar();
    return caja;
  }

  function vistaGanancias() {
    var caja = h('div');
    var hoy = hoyISO(), yo = estado.sesion.user.id;
    var mios = estado.eventos.map(function (e) { return [e, estado.misPosts[e.id]]; }).filter(function (x) {
      return x[1] && x[1].estado === 'confirmada' && x[0].estado !== 'cancelado' && x[1].asistio !== false;
    });
    var pasados = mios.filter(function (x) { return x[0].fecha < hoy; }).sort(function (a, b) { return a[0].fecha < b[0].fecha ? 1 : -1; });
    var futuros = mios.filter(function (x) { return x[0].fecha >= hoy; });
    var hist = turnosHistorial(yo);
    var pagado = 0, pendiente = 0, turnos = Number((estado.perfil && estado.perfil.turnos_previos) || 0) + hist;
    pasados.forEach(function (x) {
      if (x[1].honorarios_pagados_en) pagado += Number(x[0].pago_liquido); else pendiente += Number(x[0].pago_liquido);
      if (x[1].asistio === true) turnos += 1;
    });
    var mt = estado.traslados.filter(function (t) { return t.barista_id === yo && t.total != null; });
    var rePagado = mt.filter(function (t) { return t.pagado_en; }).reduce(function (n, t) { return n + Number(t.total); }, 0);
    var rePend = mt.filter(function (t) { return !t.pagado_en; }).reduce(function (n, t) { return n + Number(t.total); }, 0);
    var dato = function (etiqueta, valor) { return h('div', { class: 'sb-dato' }, h('span', { class: 'sb-dato__e', text: etiqueta }), h('strong', { class: 'sb-dato__v', text: valor })); };

    caja.appendChild(h('p', { class: 'sb-eyebrow', text: 'RESUMEN PRIVADO' }));
    caja.appendChild(h('h2', { class: 'sb-h2', text: 'Mis turnos y ganancias' }));
    caja.appendChild(h('p', { class: 'sb-texto', text: 'Solo tú y la administración pueden ver estos montos.' }));
    caja.appendChild(h('div', { class: 'sb-datos' },
      dato('Turnos registrados', String(turnos)), dato('Próximos turnos', String(futuros.length)),
      dato('Pagado por Sepia', clp(pagado)), dato('Pendiente de pago', clp(pendiente))));
    if (hist) caja.appendChild(h('p', { class: 'sb-ayuda', text: 'Los turnos registrados incluyen ' + plural(hist, 'turno', 'turnos') + ' del historial de Sepia anterior al portal.' }));
    if (mt.length) {
      caja.appendChild(h('div', { class: 'sb-pago' },
        h('p', { class: 'sb-pago__monto', text: 'Reembolsos de camioneta: ' + clp(rePagado) + ' pagados · ' + clp(rePend) + ' pendientes' }),
        h('p', { class: 'sb-pago__nota', text: 'Bencina, TAG y estacionamiento se muestran aparte; no son honorarios ni van en tu boleta.' })));
    }
    caja.appendChild(h('h3', { class: 'sb-h3', text: 'Eventos trabajados' }));
    if (!pasados.length) { caja.appendChild(h('p', { class: 'sb-texto', text: 'Aún no hay turnos terminados. Cuando trabajes un evento aparecerá aquí.' })); return caja; }
    caja.appendChild(h('div', { class: 'sb-scroll' }, h('table', { class: 'sb-tabla sb-tabla--chica' },
      h('thead', null, h('tr', null, ['Evento', 'Líquido', 'Estado'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
      h('tbody', null, pasados.map(function (x) {
        var p = x[1];
        var est = p.honorarios_pagados_en ? 'Pagado el ' + fechaLarga(p.honorarios_pagados_en).toLowerCase()
          : p.boleta_declarada_en ? 'Boleta en revisión' : 'Falta tu boleta';
        return h('tr', null, h('td', null, x[0].nombre, h('br'), h('small', { text: fechaLarga(x[0].fecha) })),
          h('td', { text: clp(x[0].pago_liquido) }), h('td', { text: est }));
      })))));
    caja.appendChild(h('p', { class: 'sb-ayuda', text: 'Es lo que Sepia te transfiere. La boleta de honorarios va por un monto mayor, por la retención de ' + pct(estado.config.retencion) + '. La app no hace transferencias: registra lo que Sepia ya pagó.' }));
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Administración: eventos                                             */
  /* ------------------------------------------------------------------ */

  function vistaAdminEventos() {
    var caja = h('div');
    var formulario = h('div');
    var msg = h('div');
    caja.appendChild(h('div', { class: 'sb-fila sb-fila--entre' },
      h('h2', { class: 'sb-h2', text: 'Eventos' }),
      boton('Nuevo evento', function () { abrirFormulario(null); })));
    caja.appendChild(msg);
    caja.appendChild(formulario);

    function abrirFormulario(ev) {
      formulario.textContent = '';
      formulario.appendChild(formularioEvento(ev, function () { formulario.textContent = ''; }, msg));
      formulario.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    var lista = h('div', { class: 'sb-lista' });
    estado.eventos.forEach(function (ev) {
      var confirmados = estado.posts.filter(function (p) { return p.evento_id === ev.id && p.estado === 'confirmada'; }).length;
      var postulados = estado.posts.filter(function (p) { return p.evento_id === ev.id && p.estado === 'postulada'; }).length;
      var priv = estado.privado[ev.id] || {};
      lista.appendChild(h('article', { class: 'sb-tarjeta' },
        h('div', { class: 'sb-tarjeta__cab' }, h('h3', { class: 'sb-h3', text: ev.nombre }), chip(ev.estado, ev.estado === 'abierto' ? 'sb-chip--ok' : 'sb-chip--no')),
        h('p', { class: 'sb-linea sb-linea--fuerte', text: fechaLarga(ev.fecha) + ' · ' + hhmm(ev.hora_inicio) + ' a ' + hhmm(ev.hora_fin) + ' (' + horasTxt(ev.horas) + ')' }),
        h('p', { class: 'sb-linea', text: [ev.lugar, ev.comuna].filter(Boolean).join(' · ') }),
        priv.cliente ? h('p', { class: 'sb-linea', text: 'Cliente: ' + priv.cliente }) : null,
        bloqueRevisar(ev.id, msg),
        lineaPublicacion(ev),
        ev.requiere_camioneta ? h('p', { class: 'sb-linea' }, chip('Necesita camioneta'), estado.trasladoEv[ev.id] && estado.trasladoEv[ev.id].km != null ? ' ' + String(estado.trasladoEv[ev.id].km).replace('.', ',') + ' km' : '') : null,
        h('p', { class: 'sb-linea', text: 'Necesitas ' + ev.baristas_necesarios + ' · confirmados ' + confirmados + ' · postulados ' + postulados }),
        h('p', { class: 'sb-linea', text: 'Pago ' + clp(ev.pago_liquido) + ' líquidos · boleta ' + clp(ev.monto_boleta)
          + (Number(ev.pago_sin_tope) > Number(ev.pago_liquido) ? ' · tope diario aplicado (sin tope: ' + clp(ev.pago_sin_tope) + ')' : '') }),
        h('div', { class: 'sb-fila' },
          boton('Editar', function () { abrirFormulario(ev); }, 'sb-btn--sec'),
          boton('Postulantes', function () { estado.pestana = 'postulantes'; estado.filtroEvento = ev.id; pintar(); }, 'sb-btn--sec'))));
    });
    if (!estado.eventos.length) lista.appendChild(h('p', { class: 'sb-texto', text: 'Aún no hay eventos. Crea el primero con «Nuevo evento».' }));
    caja.appendChild(lista);
    caja.appendChild(bloqueAjustesTraslado(msg));
    return caja;
  }

  function bloqueAjustesTraslado(msg) {
    var cfg = estado.config || {};
    var rend = entrada('number', 'rendimiento_km_l', cfg.rendimiento_km_l != null ? cfg.rendimiento_km_l : 10, { min: '1', max: '50', step: '0.1', inputmode: 'decimal', id: 'sb-rend' });
    var precio = entrada('number', 'precio_litro', cfg.precio_litro != null ? cfg.precio_litro : 1400, { min: '0', max: '10000', step: '10', inputmode: 'numeric', id: 'sb-precio' });
    var guardar = boton('Guardar ajustes', function () {
      var r1 = parseFloat(rend.value), p1 = parseInt(precio.value, 10);
      if (!(r1 > 0)) { ponerAviso(msg, 'El rendimiento tiene que ser mayor que 0.'); return; }
      if (!(p1 >= 0)) { ponerAviso(msg, 'El precio del litro no puede ser negativo.'); return; }
      conTarea(guardar, async function () {
        var r = await sb.from('config').update({ rendimiento_km_l: r1, precio_litro: p1 }).eq('id', 1).select('*').single();
        if (r.error) throw r.error;
        estado.config = r.data;
        ponerAviso(msg, 'Listo, guardamos los ajustes. Los eventos nuevos usan estos valores.', 'ok');
      }).catch(function () { ponerAviso(msg, 'No pudimos guardar los ajustes.'); });
    });
    return h('details', { class: 'sb-detalle' },
      h('summary', { class: 'sb-resumen' }, h('span', { class: 'sb-resumen__t', text: 'Ajustes de traslado con camioneta' })),
      h('p', { class: 'sb-ayuda', text: 'La bencina se estima como kilómetros ÷ rendimiento × precio del litro. El TAG se anota a mano en cada evento. Todo el traslado es un reembolso aparte de los honorarios.' }),
      h('div', { class: 'sb-grilla' }, campo('Rendimiento de la camioneta (km por litro)', rend), campo('Precio del litro (CLP)', precio)),
      h('div', { class: 'sb-fila' }, guardar));
  }

  function formularioEvento(ev, cerrar, msgPagina) {
    var cfg = estado.config;
    var priv = (ev && estado.privado[ev.id]) || {};
    var dir = (ev && estado.dirs[ev.id]) || {};
    var f = h('form', { class: 'sb-caja', novalidate: true });
    var msg = h('div');
    var estadoSel = h('select', { name: 'estado', class: 'sb-entrada' }, ESTADOS_EVENTO.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    estadoSel.value = ev ? ev.estado : 'borrador';
    var desc = h('textarea', { name: 'descripcion', class: 'sb-entrada', rows: '3', maxlength: '800', placeholder: 'Tipo de evento, tenida, qué tienen que llevar…' });
    desc.value = ev && ev.descripcion || '';
    var notas = h('textarea', { name: 'notas', class: 'sb-entrada', rows: '2', maxlength: '1000' });
    notas.value = priv.notas || '';
    var vista = h('p', { class: 'sb-pago__nota' });
    var trasl = (ev && estado.trasladoEv[ev.id]) || {};
    var km = entrada('number', 'km', trasl.km != null ? trasl.km : '', { min: '0', max: '3000', step: '0.1', inputmode: 'decimal', id: 'sb-km' });
    var tag = entrada('number', 'tag', trasl.tag != null ? trasl.tag : '', { min: '0', max: '1000000', step: '100', inputmode: 'numeric', id: 'sb-tag' });
    var vistaTraslado = h('p', { class: 'sb-pago__nota' });
    var actualizarTraslado = function () {
      var k = parseFloat(km.value), t = parseInt(tag.value, 10);
      if (!(k >= 0)) { vistaTraslado.textContent = ''; return; }
      var rend = Number(cfg.rendimiento_km_l) || 10, precio = Number(cfg.precio_litro) || 0;
      var bencina = Math.round(k / rend * precio);
      vistaTraslado.textContent = 'Bencina = ' + String(k).replace('.', ',') + ' km ÷ ' + String(rend).replace('.', ',') + ' km/l × ' + clp(precio) + '/l = ' + clp(bencina)
        + (t >= 0 ? '. Reembolso estimado: ' + clp(bencina + t) + ' (el estacionamiento se agrega al cierre).' : '. Falta el TAG para el total.');
    };
    [km, tag].forEach(function (x) { x.addEventListener('input', actualizarTraslado); });
    actualizarTraslado();

    var ini = entrada('time', 'hora_inicio', ev ? hhmm(ev.hora_inicio) : '', { required: true });
    var fin = entrada('time', 'hora_fin', ev ? hhmm(ev.hora_fin) : '', { required: true });
    var manual = entrada('number', 'pago_manual', ev && ev.pago_manual !== null ? ev.pago_manual : '', { min: '0', step: '500', inputmode: 'numeric' });
    var actualizarVista = function () {
      if (!ini.value || !fin.value) { vista.textContent = ''; return; }
      var hs = horasEntre(ini.value, fin.value);
      var liq = calcularPago(hs, manual.value, cfg);
      var sin = calcularPago(hs, manual.value, cfg, true);
      vista.textContent = 'Dura ' + horasTxt(hs) + ' → paga ' + clp(liq) + ' líquidos a cada barista (boleta de ' + clp(liq / (1 - Number(cfg.retencion))) + ').'
        + (sin > liq ? ' Se aplicó el tope diario de ' + clp(cfg.tope_dia) + '; sin tope serían ' + clp(sin) + '.' : '');
    };
    [ini, fin, manual].forEach(function (x) { x.addEventListener('input', actualizarVista); });
    actualizarVista();

    f.appendChild(h('h2', { class: 'sb-h2', text: ev ? 'Editar evento' : 'Nuevo evento' }));
    f.appendChild(h('p', { class: 'sb-texto', text: 'Lo que ven los baristas registrados:' }));
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Nombre del evento', entrada('text', 'nombre', ev ? ev.nombre : '', { required: true, maxlength: '120', placeholder: 'Ej.: Matrimonio en Pirque' }), 'Ponlo sin el apellido del cliente.'),
      campo('Fecha', entrada('date', 'fecha', ev ? ev.fecha : '', { required: true })),
      campo('Hora de inicio', ini), campo('Hora de término', fin),
      campo('Comuna', entrada('text', 'comuna', ev ? ev.comuna : '', { required: true, maxlength: '60' })),
      campo('Lugar (opcional)', entrada('text', 'lugar', ev && ev.lugar || '', { maxlength: '120', placeholder: 'Ej.: Viña, salón de eventos' })),
      campo('Baristas necesarios', entrada('number', 'baristas_necesarios', ev ? ev.baristas_necesarios : 1, { min: '1', max: '50', required: true })),
      campo('Pago líquido fijo (opcional)', manual, 'Déjalo vacío para usar las tarifas.'),
      campo('Estado', estadoSel)));
    f.appendChild(casilla('requiere_camioneta', 'Este evento necesita a alguien que lleve el carrito en camioneta.', !!(ev && ev.requiere_camioneta)));
    f.appendChild(vista);
    f.appendChild(campo('Descripción', desc));
    f.appendChild(h('h3', { class: 'sb-h3', text: 'Dirección exacta (solo los baristas confirmados)' }));
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Dirección', entrada('text', 'direccion', dir.direccion || '', { maxlength: '200' })),
      campo('Indicaciones (opcional)', entrada('text', 'indicaciones', dir.indicaciones || '', { maxlength: '500', placeholder: 'Ej.: entrar por el portón lateral' }))));
    f.appendChild(h('h3', { class: 'sb-h3', text: 'Solo tú (los baristas no lo ven)' }));
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Cliente', entrada('text', 'cliente', priv.cliente || '', { maxlength: '120' })),
      campo('Contacto del cliente', entrada('text', 'contacto', priv.contacto || '', { maxlength: '200' }))));
    f.appendChild(campo('Notas internas', notas));
    f.appendChild(h('h3', { class: 'sb-h3', text: 'Traslado con camioneta (solo tú, opcional)' }));
    f.appendChild(h('p', { class: 'sb-ayuda', text: 'Kilómetros del recorrido completo, ida y vuelta, desde la oficina hasta el evento. El reembolso es solo para quien lleve la camioneta, se paga aparte de la boleta y no se multiplica por la cantidad de baristas.' }));
    f.appendChild(h('div', { class: 'sb-grilla' }, campo('Kilómetros totales', km), campo('TAG y peajes estimados (CLP)', tag, 'En tarifa baja.')));
    f.appendChild(vistaTraslado);

    var guardar = h('button', { type: 'submit', class: 'sb-btn', text: 'Guardar evento' });
    var acciones = h('div', { class: 'sb-fila' }, guardar, boton('Cancelar', cerrar, 'sb-btn--sec'));
    if (ev) {
      var borrar = boton('Borrar evento', function () {
        if (!window.confirm('Se borra el evento y sus postulaciones. ¿Seguro?')) return;
        conTarea(borrar, async function () {
          var r = await sb.from('eventos').delete().eq('id', ev.id);
          if (r.error) throw r.error;
          await recargar();
        }).catch(function () { ponerAviso(msg, 'No pudimos borrar el evento.'); });
      }, 'sb-btn--sec');
      acciones.appendChild(borrar);
    }
    f.appendChild(acciones);
    f.appendChild(msg);

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(f);
      var v = function (k) { return String(d.get(k) || '').trim(); };
      var fila = {
        nombre: v('nombre'), fecha: v('fecha'), hora_inicio: v('hora_inicio'), hora_fin: v('hora_fin'), comuna: v('comuna'),
        lugar: v('lugar') || null, descripcion: v('descripcion') || null, baristas_necesarios: parseInt(v('baristas_necesarios'), 10),
        pago_manual: v('pago_manual') === '' ? null : parseInt(v('pago_manual'), 10), estado: v('estado'),
        requiere_camioneta: !!d.get('requiere_camioneta')
      };
      var kmV = v('km') === '' ? null : parseFloat(v('km')), tagV = v('tag') === '' ? null : parseInt(v('tag'), 10);
      var error = null;
      if (fila.nombre.length < 3) error = 'Escribe el nombre del evento.';
      else if (!fila.fecha) error = 'Elige la fecha.';
      else if (!fila.hora_inicio || !fila.hora_fin) error = 'Pon la hora de inicio y la de término.';
      else if (fila.hora_inicio === fila.hora_fin) error = 'La hora de inicio y la de término no pueden ser iguales.';
      else if (fila.comuna.length < 2) error = 'Escribe la comuna.';
      else if (!(fila.baristas_necesarios >= 1)) error = 'Indica cuántos baristas necesitas.';
      else if (kmV !== null && !(kmV >= 0 && kmV <= 3000)) error = 'Los kilómetros van entre 0 y 3.000.';
      else if (tagV !== null && !(tagV >= 0)) error = 'El TAG no puede ser negativo.';
      if (error) { ponerAviso(msg, error); return; }
      ponerAviso(msg, '');
      conTarea(guardar, async function () {
        var r = ev ? await sb.from('eventos').update(fila).eq('id', ev.id).select('id').single()
                   : await sb.from('eventos').insert(fila).select('id').single();
        if (r.error) throw r.error;
        var id = r.data.id;
        var r2 = await sb.from('evento_privado').upsert({ evento_id: id, cliente: v('cliente') || null, contacto: v('contacto') || null, notas: v('notas') || null });
        if (r2.error) throw r2.error;
        var r3 = v('direccion')
          ? await sb.from('evento_direcciones').upsert({ evento_id: id, direccion: v('direccion'), indicaciones: v('indicaciones') || null })
          : await sb.from('evento_direcciones').delete().eq('evento_id', id);
        if (r3.error) throw r3.error;
        var r4 = (kmV !== null || tagV !== null)
          ? await sb.from('evento_traslado').upsert({ evento_id: id, km: kmV, tag: tagV })
          : await sb.from('evento_traslado').delete().eq('evento_id', id);
        if (r4.error) throw r4.error;
        await recargar();
      }).catch(function (err) { ponerAviso(msg, mensajeError(err, 'No pudimos guardar el evento. Revisa los datos.')); });
    });
    return f;
  }

  /* ------------------------------------------------------------------ */
  /* Administración: postulantes                                         */
  /* ------------------------------------------------------------------ */

  /* Después del evento: la administración registra si cada persona asistió (cuenta en el ranking). */
  function botonesAsistencia(p, ev, msg) {
    if (p.estado !== 'confirmada' || ev.fecha >= hoyISO()) return null;
    var fila = h('div', { class: 'sb-fila' });
    var estadoAsistencia = p.asistio === true ? chip('Asistió', 'sb-chip--ok') : (p.asistio === false ? chip('No asistió', 'sb-chip--no') : chip('Asistencia sin registrar'));
    var poner = function (btn, valor) {
      conTarea(btn, async function () {
        var r = await sb.from('postulaciones').update({ asistio: valor }).eq('id', p.id);
        if (r.error) throw r.error;
        estado.filtroEvento = ev.id;
        await recargar();
      }).catch(function () { ponerAviso(msg, 'No pudimos registrar la asistencia.'); });
    };
    if (p.asistio !== true) { var bs = boton('Asistió', function () { poner(bs, true); }, 'sb-btn--sec'); fila.appendChild(bs); }
    if (p.asistio !== false) { var bn = boton('No asistió', function () { poner(bn, false); }, 'sb-btn--sec'); fila.appendChild(bn); }
    return h('div', null, h('p', { class: 'sb-linea' }, estadoAsistencia), fila);
  }

  /* Un solo conductor por evento, y solo si declaró camioneta. */
  function botonConductor(p, ev, msg) {
    var b = estado.baristas[p.barista_id] || {};
    if (p.estado !== 'confirmada' || !b.tiene_camioneta) return null;
    var btn = boton(p.conductor ? 'Quitar de conductor' : 'Asignar como conductor', function () {
      conTarea(btn, async function () {
        if (!p.conductor) {
          var r0 = await sb.from('postulaciones').update({ conductor: false }).eq('evento_id', ev.id).eq('conductor', true);
          if (r0.error) throw r0.error;
        }
        var r = await sb.from('postulaciones').update({ conductor: !p.conductor }).eq('id', p.id);
        if (r.error) throw r.error;
        estado.filtroEvento = ev.id;
        await recargar();
      }).catch(function () { ponerAviso(msg, 'No pudimos cambiar el conductor.'); });
    }, 'sb-btn--sec');
    return btn;
  }

  function vistaPostulantes() {
    var caja = h('div');
    var msg = h('div');
    caja.appendChild(h('h2', { class: 'sb-h2', text: 'Postulantes' }));
    caja.appendChild(msg);
    var evs = estado.eventos.filter(function (e) { return e.estado !== 'borrador'; });
    if (!evs.length) caja.appendChild(h('p', { class: 'sb-texto', text: 'Todavía no hay eventos publicados.' }));
    evs.forEach(function (ev) {
      var posts = estado.posts.filter(function (p) { return p.evento_id === ev.id && p.estado !== 'retirada'; });
      var confirmados = posts.filter(function (p) { return p.estado === 'confirmada'; }).length;
      var det = h('details', { class: 'sb-detalle' });
      if (estado.filtroEvento === ev.id) det.open = true;
      det.appendChild(h('summary', { class: 'sb-resumen' },
        h('span', { class: 'sb-resumen__t', text: ev.nombre + ' · ' + fechaLarga(ev.fecha) }),
        chip(confirmados + ' de ' + ev.baristas_necesarios + ' confirmados', confirmados >= ev.baristas_necesarios ? 'sb-chip--ok' : '')));
      if (!posts.length) det.appendChild(h('p', { class: 'sb-texto', text: 'Nadie ha postulado todavía.' }));
      posts.forEach(function (p) {
        var b = estado.baristas[p.barista_id] || {};
        var poner = function (btn, nuevo) {
          conTarea(btn, async function () {
            var r = await sb.from('postulaciones').update({ estado: nuevo }).eq('id', p.id);
            if (r.error) throw r.error;
            estado.filtroEvento = ev.id;
            await recargar();
          }).catch(function () { ponerAviso(msg, 'No pudimos cambiar el estado.'); });
        };
        var acc = h('div', { class: 'sb-fila' });
        if (p.estado !== 'confirmada') { var bc = boton('Confirmar', function () { poner(bc, 'confirmada'); }); acc.appendChild(bc); }
        if (p.estado !== 'rechazada') { var br = boton('Rechazar', function () { poner(br, 'rechazada'); }, 'sb-btn--sec'); acc.appendChild(br); }
        if (p.estado === 'confirmada' && !p.asistencia_confirmada_en) {
          var bm = boton('Marcar reconfirmado', function () {
            conTarea(bm, async function () {
              var r = await sb.from('postulaciones').update({ asistencia_confirmada_en: new Date().toISOString() }).eq('id', p.id);
              if (r.error) throw r.error;
              estado.filtroEvento = ev.id;
              await recargar();
            }).catch(function () { ponerAviso(msg, 'No pudimos marcar la reconfirmación.'); });
          }, 'sb-btn--sec');
          acc.appendChild(bm);
        }
        if (p.estado === 'confirmada' || p.estado === 'rechazada') { var bp = boton('Dejar como postulada', function () { poner(bp, 'postulada'); }, 'sb-btn--sec'); acc.appendChild(bp); }
        añadir(acc, botonConductor(p, ev, msg));
        det.appendChild(h('div', { class: 'sb-postulante' },
          h('div', { class: 'sb-tarjeta__cab' }, h('div', { class: 'sb-persona' }, avatar(b.nombre, b.foto_path), h('h3', { class: 'sb-h3', text: b.nombre || 'Barista' })),
            h('span', null, chipPostulacion(p), p.conductor ? ' ' : null, p.conductor ? chip('Conductor', 'sb-chip--ok') : null)),
          h('p', { class: 'sb-linea', text: [b.telefono, b.comuna, b.correo].filter(Boolean).join(' · ') }),
          h('p', { class: 'sb-linea', text: [b.talla_camisa ? 'Talla ' + b.talla_camisa : null, b.tiene_camioneta ? 'Tiene camioneta' : 'Sin camioneta'].filter(Boolean).join(' · ') }),
          b.experiencia ? h('p', { class: 'sb-linea', text: 'Experiencia: ' + b.experiencia }) : null,
          botonesAsistencia(p, ev, msg),
          acc));
      });
      caja.appendChild(det);
    });
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Administración: resumen y transferencias                            */
  /* ------------------------------------------------------------------ */

  function csvCelda(x) {
    var s = x === null || x === undefined ? '' : String(x);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // que Excel no lo tome por fórmula
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function descargarCsv(nombre, filas) {
    var texto = '﻿' + filas.map(function (f) { return f.map(csvCelda).join(';'); }).join('\r\n');
    var url = window.URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    var a = h('a', { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);
  }

  function vistaResumen() {
    var caja = h('div');
    var desde = entrada('date', 'desde', estado.resumenDesde || '');
    var hasta = entrada('date', 'hasta', estado.resumenHasta || '');
    var cuerpo = h('div');
    caja.appendChild(h('h2', { class: 'sb-h2', text: 'Resumen y pagos' }));
    caja.appendChild(h('p', { class: 'sb-texto', text: 'Cuenta solo a los baristas confirmados. Los montos salen de las tarifas y la retención guardadas.' }));
    var soloPend = h('input', { type: 'checkbox', name: 'solo_pendientes', class: 'sb-chk' });
    soloPend.checked = !!estado.resumenSoloPendientes;
    caja.appendChild(h('div', { class: 'sb-grilla' }, campo('Desde', desde), campo('Hasta', hasta)));
    caja.appendChild(h('label', { class: 'sb-casilla' }, soloPend, h('span', { text: 'Mostrar solo lo que falta pagar (sin los honorarios ya pagados)' })));
    caja.appendChild(cuerpo);

    var dibujar = function () {
      estado.resumenDesde = desde.value; estado.resumenHasta = hasta.value; estado.resumenSoloPendientes = soloPend.checked;
      cuerpo.textContent = '';
      var evs = estado.eventos.filter(function (e) {
        if (e.estado === 'borrador' || e.estado === 'cancelado') return false;
        if (desde.value && e.fecha < desde.value) return false;
        if (hasta.value && e.fecha > hasta.value) return false;
        return true;
      });
      var filasEv = [], porBarista = {}, totLiq = 0, totBol = 0, detalle = [];
      evs.forEach(function (ev) {
        var conf = estado.posts.filter(function (p) {
          return p.evento_id === ev.id && p.estado === 'confirmada' && !(soloPend.checked && p.honorarios_pagados_en);
        });
        var liq = conf.length * Number(ev.pago_liquido), bol = conf.length * Number(ev.monto_boleta);
        totLiq += liq; totBol += bol;
        filasEv.push([ev, conf.length, liq, bol]);
        conf.forEach(function (p) {
          var b = estado.baristas[p.barista_id]; if (!b) return;
          var acc = porBarista[b.id] || (porBarista[b.id] = { b: b, liq: 0, bol: 0, n: 0 });
          acc.liq += Number(ev.pago_liquido); acc.bol += Number(ev.monto_boleta); acc.n += 1;
          detalle.push([ev.fecha, ev.nombre, hhmm(ev.hora_inicio) + ' a ' + hhmm(ev.hora_fin), b.nombre, b.rut, ev.pago_liquido, ev.monto_boleta]);
        });
      });

      var t1 = h('table', { class: 'sb-tabla' },
        h('thead', null, h('tr', null, ['Evento', 'Fecha', 'Horario', 'Necesarios', 'Confirmados', 'Líquido c/u', 'Total líquido', 'Total boletas'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
        h('tbody', null, filasEv.map(function (r) {
          var ev = r[0];
          return h('tr', null, h('td', { text: ev.nombre }), h('td', { text: ev.fecha }), h('td', { text: hhmm(ev.hora_inicio) + ' a ' + hhmm(ev.hora_fin) }),
            h('td', { text: ev.baristas_necesarios }), h('td', { text: r[1] + (r[1] < ev.baristas_necesarios ? ' (faltan ' + (ev.baristas_necesarios - r[1]) + ')' : '') }),
            h('td', { text: clp(ev.pago_liquido) }), h('td', { text: clp(r[2]) }), h('td', { text: clp(r[3]) }));
        })),
        h('tfoot', null, h('tr', null, h('th', { scope: 'row', colspan: '6', text: 'Total' }), h('th', { text: clp(totLiq) }), h('th', { text: clp(totBol) }))));
      cuerpo.appendChild(h('div', { class: 'sb-scroll' }, t1));
      if (!filasEv.length) cuerpo.appendChild(h('p', { class: 'sb-texto', text: 'No hay eventos en ese rango.' }));

      var lista = Object.keys(porBarista).map(function (k) { return porBarista[k]; }).sort(function (a, b) { return a.b.nombre.localeCompare(b.b.nombre, 'es'); });
      cuerpo.appendChild(h('h3', { class: 'sb-h3', text: 'A quién transferir' }));
      var t2 = h('table', { class: 'sb-tabla' },
        h('thead', null, h('tr', null, ['Barista', 'RUT', 'Banco', 'Cuenta', 'Eventos', 'Transferir (líquido)', 'Boleta por'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
        h('tbody', null, lista.map(function (a) {
          return h('tr', null, h('td', { text: a.b.nombre }), h('td', { text: a.b.rut }), h('td', { text: a.b.banco }),
            h('td', { text: a.b.tipo_cuenta + ' ' + a.b.numero_cuenta }), h('td', { text: a.n }), h('td', { text: clp(a.liq) }), h('td', { text: clp(a.bol) }));
        })));
      cuerpo.appendChild(h('div', { class: 'sb-scroll' }, t2));
      cuerpo.appendChild(h('div', { class: 'sb-fila' },
        boton('Descargar transferencias (CSV)', function () {
          descargarCsv('transferencias-sepia.csv', [['Nombre', 'RUT', 'Correo', 'Banco', 'Tipo de cuenta', 'Número de cuenta', 'Monto líquido a transferir', 'Monto de la boleta de honorarios']]
            .concat(lista.map(function (a) { return [a.b.nombre, a.b.rut, a.b.correo, a.b.banco, a.b.tipo_cuenta, a.b.numero_cuenta, Math.round(a.liq), Math.round(a.bol)]; })));
        }, '', { disabled: lista.length ? null : true }),
        boton('Descargar detalle por evento (CSV)', function () {
          descargarCsv('detalle-eventos-sepia.csv', [['Fecha', 'Evento', 'Horario', 'Barista', 'RUT', 'Líquido', 'Boleta']].concat(detalle));
        }, 'sb-btn--sec', { disabled: detalle.length ? null : true })));
    };
    desde.addEventListener('change', dibujar);
    hasta.addEventListener('change', dibujar);
    soloPend.addEventListener('change', dibujar);
    dibujar();
    caja.appendChild(bloqueReembolsos());
    return caja;
  }

  /* Reembolso de la camioneta: lo paga Manuel aparte de los honorarios. Acá solo se registra. */
  function bloqueReembolsos() {
    var caja = h('div');
    var msg = h('div');
    caja.appendChild(h('h3', { class: 'sb-h3 sb-h2--sec', text: 'Reembolsos de camioneta' }));
    caja.appendChild(h('p', { class: 'sb-texto', text: 'Bencina, TAG y estacionamiento del conductor. No son honorarios ni van en la boleta. Registrar el pago no transfiere dinero.' }));
    caja.appendChild(msg);
    var filas = estado.traslados.slice().sort(function (a, b) {
      var ea = estado.eventos.filter(function (e) { return e.id === a.evento_id; })[0] || {}, eb = estado.eventos.filter(function (e) { return e.id === b.evento_id; })[0] || {};
      return (a.pagado_en ? 1 : 0) - (b.pagado_en ? 1 : 0) || String(ea.fecha).localeCompare(String(eb.fecha));
    });
    if (!filas.length) { caja.appendChild(h('p', { class: 'sb-texto', text: 'Todavía no hay conductores asignados.' })); return caja; }
    filas.forEach(function (t) {
      var ev = estado.eventos.filter(function (e) { return e.id === t.evento_id; })[0] || {};
      var b = estado.baristas[t.barista_id] || {};
      var est = entrada('number', 'estacionamiento', t.estacionamiento || 0, { min: '0', max: '1000000', step: '100', inputmode: 'numeric', 'aria-label': 'Estacionamiento (CLP)' });
      var guardar = boton('Guardar estacionamiento', function () {
        var n = parseInt(est.value, 10);
        if (!(n >= 0)) { ponerAviso(msg, 'El estacionamiento no puede ser negativo.'); return; }
        conTarea(guardar, async function () {
          var r = await sb.from('postulaciones').update({ traslado_estacionamiento: n }).eq('id', t.postulacion_id);
          if (r.error) throw r.error;
          await recargar();
        }).catch(function () { ponerAviso(msg, 'No pudimos guardar el estacionamiento.'); });
      }, 'sb-btn--sec');
      var pagar = boton(t.pagado_en ? 'Deshacer pago' : 'Registrar reembolso pagado', function () {
        if (!t.pagado_en && !window.confirm('¿Ya le transferiste ' + clp(t.total) + ' a ' + (b.nombre || 'la persona') + '? Este botón no transfiere dinero.')) return;
        conTarea(pagar, async function () {
          var r = await sb.from('postulaciones').update({ traslado_pagado_en: t.pagado_en ? null : hoyISO() }).eq('id', t.postulacion_id);
          if (r.error) throw r.error;
          await recargar();
        }).catch(function () { ponerAviso(msg, 'No pudimos registrar el pago.'); });
      }, t.pagado_en ? 'sb-btn--sec' : '', t.total == null && !t.pagado_en ? { disabled: true } : null);
      caja.appendChild(h('article', { class: 'sb-tarjeta' },
        h('div', { class: 'sb-tarjeta__cab' }, h('h4', { class: 'sb-h4', text: (b.nombre || 'Conductor') + ' · ' + (ev.nombre || '') }),
          t.pagado_en ? chip('pagado', 'sb-chip--ok') : (t.total == null ? chip('por calcular') : chip('pendiente'))),
        h('p', { class: 'sb-linea', text: ev.fecha ? fechaLarga(ev.fecha) : '' }),
        h('p', { class: 'sb-linea', text: filaTraslado(t) }),
        h('p', { class: 'sb-linea sb-linea--fuerte', text: 'Total ' + (t.total == null ? 'pendiente: falta ' + (t.km == null ? 'los kilómetros' : 'el TAG') + ' en el evento' : clp(t.total)) }),
        h('div', { class: 'sb-fila' }, h('label', { class: 'sb-etiqueta', text: 'Estacionamiento' }), est, guardar),
        h('div', { class: 'sb-fila' }, pagar)));
    });
    return caja;
  }


  /* ------------------------------------------------------------------ */
  /* Administración: seguimiento                                         */
  /* ------------------------------------------------------------------ */

  /* Eventos que entraron o cambiaron desde el calendario y esperan que alguien mire sus datos. */
  function bloqueRevisar(evId, msg) {
    var d = estado.segDatos[evId];
    if (!d || !d.revisar) return null;
    var btn = boton('Ya lo revisé', function () {
      conTarea(btn, async function () {
        var r = await sb.from('evento_seguimiento').upsert({ evento_id: evId, revisar: false, revisar_motivo: null, actualizado_en: new Date().toISOString() });
        if (r.error) throw r.error;
        await recargar();
      }).catch(function () { ponerAviso(msg, 'No pudimos quitar la marca de revisión.'); });
    }, 'sb-btn--sec');
    return h('div', { class: 'sb-dir' },
      h('p', { class: 'sb-linea sb-linea--fuerte', text: 'Por revisar' + (d.origen === 'calendario' ? ' (viene del calendario)' : '') }),
      h('p', { class: 'sb-linea', text: d.revisar_motivo || 'Revisa los datos del evento.' }),
      h('div', { class: 'sb-fila' }, btn));
  }
  function cuantosPorRevisar() {
    return Object.keys(estado.segDatos).filter(function (k) { return estado.segDatos[k].revisar; }).length;
  }
  /* Cuándo se leyó el calendario por última vez, y un aviso si hace demasiado. */
  function lineaSync() {
    var s = estado.sync;
    if (!s || !s.ultima_sync_en) return h('p', { class: 'sb-texto', text: 'El calendario todavía no se ha leído. Cuando la automatización esté instalada, aquí verás la última lectura.' });
    var r = s.ultima_sync_resumen || {}, n = function (x) { return Array.isArray(x) ? x.length : 0; };
    var horas = (Date.now() - new Date(s.ultima_sync_en).getTime()) / 36e5;
    var txt = 'Calendario leído el ' + diaHora(s.ultima_sync_en) + ': ' + plural(r.recibidos || 0, 'evento', 'eventos') + ' de servicio'
      + (n(r.creados) || n(r.cambiados) || n(r.cancelados) ? ' (nuevos ' + n(r.creados) + ', con cambios ' + n(r.cambiados) + ', cancelados ' + n(r.cancelados) + ')' : '') + '.';
    if (r.advertencia) txt += ' Atención: ' + r.advertencia;
    return horas > 36
      ? h('p', { class: 'sb-aviso', role: 'alert', text: txt + ' Hace más de un día que no se lee: revisa las ejecuciones del script en Google Apps Script.' })
      : h('p', { class: 'sb-texto', text: txt });
  }

  function chipPostulacion(p) {
    if (p.estado === 'confirmada') {
      return p.asistencia_confirmada_en ? chip('asignado · reconfirmó', 'sb-chip--ok') : chip('asignado · falta reconfirmar');
    }
    return chip(p.estado, p.estado === 'rechazada' ? 'sb-chip--no' : '');
  }
  function segLista() { return Object.keys(estado.seg).map(function (k) { return estado.seg[k]; }); }
  function alertasSeg() { return segLista().filter(function (s) { return s.semaforo === 'alerta' || s.cierre_atrasado; }); }
  function porFecha(a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return a.hora_inicio < b.hora_inicio ? -1 : 1;
  }
  function chipSemaforo(s) {
    if (s === 'ok') return chip('OK', 'sb-chip--ok');
    if (s === 'alerta') return chip('ALERTA', 'sb-chip--alerta');
    if (s === 'pendiente') return chip('Pendiente');
    return null;
  }
  function plural(n, uno, varios) { return n + ' ' + (Number(n) === 1 ? uno : varios); }
  function cuando(d) { return d === 0 ? 'es hoy' : (d === 1 ? 'queda 1 día' : 'quedan ' + d + ' días'); }
  function motivoSeg(s) {
    var partes = [], sin = s.asignados - s.reconfirmados;
    if (s.faltan > 0) partes.push('Faltan ' + plural(s.faltan, 'barista', 'baristas') + ' por asignar');
    if (sin > 0) partes.push(plural(sin, 'asignado sin reconfirmar', 'asignados sin reconfirmar'));
    if (!partes.length) return 'Todo en orden: cupos completos y todos reconfirmaron.';
    return partes.join(' · ') + ' · ' + cuando(s.dias_restantes);
  }
  function motivoCierre(s) {
    var f = [];
    if (s.documento_cliente_pendiente) f.push('documento al cliente');
    if (s.boletas_pendientes > 0) f.push(plural(s.boletas_pendientes, 'boleta de honorarios', 'boletas de honorarios'));
    if (s.pagos_pendientes > 0) f.push(plural(s.pagos_pendientes, 'pago', 'pagos'));
    return 'Falta: ' + f.join(', ') + ' · fue hace ' + plural(s.dias_desde_evento, 'día', 'días');
  }
  function postsAsignados(evId) {
    return estado.posts.filter(function (p) { return p.evento_id === evId && p.estado === 'confirmada'; });
  }
  function enlaceWa(b, texto) {
    return 'https://wa.me/' + String(b.telefono || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(texto);
  }

  function bloqueChecklist(s) {
    var items = (estado.config && estado.config.checklist_items) || [];
    var datos = estado.segDatos[s.evento_id] || { evento_id: s.evento_id, checklist: {} };
    var marcado = Object.assign({}, datos.checklist || {});
    var contador = h('p', { class: 'sb-pago__nota' });
    var cuenta = function () {
      var n = items.filter(function (it) { return marcado[it.clave]; }).length;
      contador.textContent = 'Checklist: ' + n + ' de ' + items.length;
    };
    var lista = h('div');
    items.forEach(function (it) {
      var c = h('input', { type: 'checkbox', class: 'sb-chk' });
      c.checked = !!marcado[it.clave];
      c.addEventListener('change', function () {
        var antes = marcado[it.clave];
        if (c.checked) marcado[it.clave] = new Date().toISOString(); else delete marcado[it.clave];
        cuenta();
        Promise.resolve(sb.from('evento_seguimiento').upsert({ evento_id: s.evento_id, checklist: marcado, actualizado_en: new Date().toISOString() }))
          .then(function (r) {
            if (r.error) throw r.error;
            estado.segDatos[s.evento_id] = Object.assign({}, datos, { checklist: Object.assign({}, marcado) });
          })
          .catch(function () {
            if (antes) marcado[it.clave] = antes; else delete marcado[it.clave];
            c.checked = !!antes; cuenta();
          });
      });
      lista.appendChild(h('label', { class: 'sb-casilla' }, c, h('span', { text: it.texto })));
    });
    cuenta();
    return h('div', { class: 'sb-pago' }, h('p', { class: 'sb-pago__monto', text: 'Checklist del evento' }), contador, lista);
  }

  function copiarTelefonos(asignados, destino) {
    var texto = asignados.map(function (p) { var b = estado.baristas[p.barista_id] || {}; return (b.nombre || '') + ': ' + (b.telefono || ''); }).join('\n');
    var mostrar = function () {
      var ta = h('textarea', { class: 'sb-entrada', rows: String(Math.max(2, asignados.length + 1)), readonly: true });
      ta.value = texto;
      destino.textContent = '';
      destino.appendChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () {
        ponerAviso(destino, 'Teléfonos copiados. Pégalos para armar el grupo de WhatsApp.', 'ok');
      }, mostrar);
    } else mostrar();
  }

  function tarjetaSeg(s, msg) {
    var asignados = postsAsignados(s.evento_id);
    var caja = h('article', { class: 'sb-tarjeta' });
    var zonaCopia = h('div');
    caja.appendChild(h('div', { class: 'sb-tarjeta__cab' }, h('h3', { class: 'sb-h3', text: s.nombre }), chipSemaforo(s.semaforo)));
    caja.appendChild(h('p', { class: 'sb-linea sb-linea--fuerte', text: fechaLarga(s.fecha) + ' · ' + hhmm(s.hora_inicio) + ' a ' + hhmm(s.hora_fin) }));
    caja.appendChild(h('p', { class: 'sb-linea', text: 'Asignados ' + s.asignados + ' de ' + s.baristas_necesarios + ' · reconfirmados ' + s.reconfirmados + ' · postulantes sin asignar ' + s.postulantes }));
    caja.appendChild(h('p', { class: 'sb-linea' + (s.semaforo === 'alerta' ? ' sb-linea--fuerte' : ''), text: motivoSeg(s) }));
    var evSeg = estado.eventos.filter(function (e) { return e.id === s.evento_id; })[0];
    if (evSeg && evSeg.requiere_camioneta) {
      var cond = asignados.filter(function (p) { return p.conductor; })[0];
      var bc = cond && estado.baristas[cond.barista_id];
      caja.appendChild(h('p', { class: 'sb-linea' + (cond ? '' : ' sb-linea--fuerte'), text: cond ? 'Camioneta: ' + ((bc && bc.nombre) || 'conductor asignado') : 'Necesita camioneta: falta asignar al conductor (en Admin: postulantes).' }));
    }
    añadir(caja, bloqueRevisar(s.evento_id, msg));
    if (!s.realizado && diasHasta(s.fecha) > diasPublicacion()) añadir(caja, lineaPublicacion(s));

    asignados.forEach(function (p) {
      var b = estado.baristas[p.barista_id] || {};
      var acc = h('div', { class: 'sb-fila' });
      if (!p.asistencia_confirmada_en) {
        var bm = boton('Marcar reconfirmado', function () {
          conTarea(bm, async function () {
            var r = await sb.from('postulaciones').update({ asistencia_confirmada_en: new Date().toISOString() }).eq('id', p.id);
            if (r.error) throw r.error;
            await recargar();
          }).catch(function () { ponerAviso(msg, 'No pudimos marcar la reconfirmación.'); });
        }, 'sb-btn--sec');
        acc.appendChild(bm);
      }
      acc.appendChild(h('a', { class: 'sb-btn sb-btn--sec', target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp',
        href: enlaceWa(b, 'Hola ' + String(b.nombre || '').split(' ')[0] + ', te escribimos de Sepia Coffee: ¿confirmas que vas al evento del ' + fechaLarga(s.fecha) + '?') }));
      caja.appendChild(h('div', { class: 'sb-postulante' },
        h('div', { class: 'sb-tarjeta__cab' }, h('h4', { class: 'sb-h4', text: b.nombre || 'Barista' }),
          p.asistencia_confirmada_en ? chip('reconfirmó', 'sb-chip--ok') : chip('sin reconfirmar')),
        h('p', { class: 'sb-linea', text: [b.telefono, b.comuna].filter(Boolean).join(' · ') }), acc));
    });

    var acciones = h('div', { class: 'sb-fila' }, boton('Ver postulantes', function () {
      estado.pestana = 'postulantes'; estado.filtroEvento = s.evento_id; pintar();
    }, 'sb-btn--sec'));
    if (asignados.length) acciones.appendChild(boton('Copiar teléfonos para el grupo de WhatsApp', function () { copiarTelefonos(asignados, zonaCopia); }, 'sb-btn--sec'));
    caja.appendChild(acciones);
    caja.appendChild(zonaCopia);
    caja.appendChild(bloqueChecklist(s));
    return caja;
  }

  function tarjetaCierre(s, msg) {
    var datos = estado.segDatos[s.evento_id] || {};
    var ev = estado.eventos.filter(function (e) { return e.id === s.evento_id; })[0] || {};
    var caja = h('article', { class: 'sb-tarjeta' });
    caja.appendChild(h('div', { class: 'sb-tarjeta__cab' }, h('h3', { class: 'sb-h3', text: s.nombre }),
      s.cierre_atrasado ? chip('ALERTA', 'sb-chip--alerta') : chip('Por cerrar')));
    caja.appendChild(h('p', { class: 'sb-linea sb-linea--fuerte', text: fechaLarga(s.fecha) }));
    caja.appendChild(h('p', { class: 'sb-linea' + (s.cierre_atrasado ? ' sb-linea--fuerte' : ''), text: motivoCierre(s) + (s.cierre_atrasado ? ' · cierre atrasado' : '') }));

    var docFecha = entrada('date', 'doc_fecha', datos.documento_cliente_emitido_en || '');
    var docFolio = entrada('text', 'doc_folio', datos.documento_cliente_folio || '', { maxlength: '40', placeholder: 'Folio' });
    var docGuardar = boton('Guardar documento', function () {
      conTarea(docGuardar, async function () {
        var r = await sb.from('evento_seguimiento').upsert({ evento_id: s.evento_id, documento_cliente_emitido_en: docFecha.value || null,
          documento_cliente_folio: docFolio.value.trim() || null, actualizado_en: new Date().toISOString() });
        if (r.error) throw r.error;
        await recargar();
      }).catch(function () { ponerAviso(msg, 'No pudimos guardar el documento.'); });
    });
    caja.appendChild(h('div', { class: 'sb-pago' },
      h('p', { class: 'sb-pago__monto', text: 'Documento al cliente' }),
      h('p', { class: 'sb-pago__nota', text: datos.documento_cliente_emitido_en ? 'Emitido el ' + datos.documento_cliente_emitido_en : 'Falta emitirlo' }),
      h('div', { class: 'sb-grilla' }, campo('Fecha de emisión', docFecha), campo('Folio', docFolio)), docGuardar));

    postsAsignados(s.evento_id).forEach(function (p) {
      var b = estado.baristas[p.barista_id] || {};
      var fBol = entrada('date', 'bol_fecha', p.boleta_honorarios_recibida_en || '');
      var fFol = entrada('text', 'bol_folio', p.boleta_honorarios_folio || p.boleta_declarada_folio || '', { maxlength: '40', placeholder: 'Folio' });
      var fPag = entrada('date', 'pagado', p.honorarios_pagados_en || '');
      var guardar = boton('Guardar fechas', function () {
        conTarea(guardar, async function () {
          var r = await sb.from('postulaciones').update({ boleta_honorarios_recibida_en: fBol.value || null,
            boleta_honorarios_folio: fFol.value.trim() || null, honorarios_pagados_en: fPag.value || null }).eq('id', p.id);
          if (r.error) throw r.error;
          await recargar();
        }).catch(function () { ponerAviso(msg, 'No pudimos guardar los datos de ' + (b.nombre || 'la persona') + '.'); });
      }, 'sb-btn--sec');
      /* Un clic: revisaste la boleta en el SII y transferiste. Deja la boleta como recibida y le avisa al barista. */
      var pagar = boton('Marcar pagado', function () {
        if (!window.confirm('¿Ya revisaste la boleta en el SII y le transferiste ' + clp(ev.pago_liquido) + ' a ' + (b.nombre || 'esta persona') + '? Le llegará un aviso por correo.')) return;
        conTarea(pagar, async function () {
          var r = await sb.from('postulaciones').update({
            honorarios_pagados_en: fPag.value || hoyISO(),
            boleta_honorarios_recibida_en: fBol.value || hoyISO(),
            boleta_honorarios_folio: fFol.value.trim() || null,
            asistio: p.asistio === false ? false : true      // pagarle es reconocer que trabajó; si ya dijiste que no asistió, se respeta
          }).eq('id', p.id);
          if (r.error) throw r.error;
          await recargar();
        }).catch(function () { ponerAviso(msg, 'No pudimos marcar el pago de ' + (b.nombre || 'la persona') + '.'); });
      });
      var estadoCierre = p.honorarios_pagados_en ? chip('pagado', 'sb-chip--ok')
        : (p.boleta_declarada_en ? chip('boleta declarada: revisar en el SII', 'sb-chip--ok')
          : (p.boleta_honorarios_recibida_en ? chip('boleta recibida') : chip('falta la boleta')));
      caja.appendChild(h('div', { class: 'sb-postulante' },
        h('div', { class: 'sb-tarjeta__cab' }, h('h4', { class: 'sb-h4', text: b.nombre || 'Barista' }), estadoCierre),
        h('p', { class: 'sb-linea', text: [b.rut, b.banco, b.tipo_cuenta, b.numero_cuenta].filter(Boolean).join(' · ') }),
        ev.pago_liquido ? h('p', { class: 'sb-linea', text: 'Transferir ' + clp(ev.pago_liquido) + ' líquidos · boleta de honorarios por ' + clp(ev.monto_boleta) }) : null,
        p.boleta_declarada_en ? h('p', { class: 'sb-linea sb-linea--fuerte', text: 'Avisó que emitió su boleta el ' + diaCorto(p.boleta_declarada_en) + (p.boleta_declarada_folio ? ' (folio ' + p.boleta_declarada_folio + ')' : '') + '. Revísala en el SII.' }) : null,
        botonesAsistencia(p, ev, msg),
        h('div', { class: 'sb-grilla' }, campo('Boleta recibida el', fBol), campo('Folio de la boleta', fFol), campo('Honorarios pagados el', fPag)),
        h('div', { class: 'sb-fila' }, p.honorarios_pagados_en ? null : pagar, guardar)));
    });
    return caja;
  }

  function vistaSeguimiento() {
    var caja = h('div');
    var msg = h('div');
    var todos = segLista();
    var proximos = todos.filter(function (s) { return !s.realizado && s.semaforo; }).sort(porFecha);
    var porCerrar = todos.filter(function (s) { return s.por_cerrar; }).sort(porFecha);
    var cerrados = todos.filter(function (s) { return s.realizado && !s.por_cerrar && s.asignados > 0; }).length;
    var lineas = [];
    proximos.filter(function (s) { return s.semaforo === 'alerta'; }).forEach(function (s) {
      lineas.push(h('li', { text: s.nombre + ' (' + fechaLarga(s.fecha) + '): ' + motivoSeg(s) }));
    });
    porCerrar.filter(function (s) { return s.cierre_atrasado; }).forEach(function (s) {
      lineas.push(h('li', { text: s.nombre + ' (' + fechaLarga(s.fecha) + '): cierre atrasado. ' + motivoCierre(s) }));
    });

    caja.appendChild(h('div', { class: 'sb-fila sb-fila--entre' }, h('h2', { class: 'sb-h2', text: 'Seguimiento' }), boton('Actualizar', function () { recargar(); }, 'sb-btn--sec')));
    caja.appendChild(msg);
    caja.appendChild(lineaSync());
    if (lineas.length) caja.appendChild(h('div', { class: 'sb-alertas', role: 'alert' }, h('p', { class: 'sb-alertas__t', text: plural(lineas.length, 'alerta', 'alertas') }), h('ul', null, lineas)));
    else caja.appendChild(aviso('Sin alertas: todo en orden.', 'ok'));
    var porRev = cuantosPorRevisar();
    if (porRev) caja.appendChild(aviso(plural(porRev, 'evento espera', 'eventos esperan') + ' que revises sus datos (vienen del calendario o cambiaron). Lo ves marcado en su tarjeta.'));

    caja.appendChild(h('h2', { class: 'sb-h2 sb-h2--sec', text: 'Próximos eventos' }));
    if (!proximos.length) caja.appendChild(h('p', { class: 'sb-texto', text: 'No hay eventos próximos abiertos.' }));
    caja.appendChild(h('div', { class: 'sb-lista' }, proximos.map(function (s) { return tarjetaSeg(s, msg); })));

    caja.appendChild(h('h2', { class: 'sb-h2 sb-h2--sec', text: 'Por cerrar' }));
    if (!porCerrar.length) caja.appendChild(h('p', { class: 'sb-texto', text: 'No hay eventos pasados con cosas pendientes.' }));
    caja.appendChild(h('div', { class: 'sb-lista' }, porCerrar.map(function (s) { return tarjetaCierre(s, msg); })));
    if (cerrados) caja.appendChild(h('p', { class: 'sb-texto', text: plural(cerrados, 'evento ya cerrado', 'eventos ya cerrados') + ' (documento, boletas y pagos al día).' }));
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Administración: accesos del equipo                                  */
  /* ------------------------------------------------------------------ */

  function sugerirUsuario(nombre) {
    var partes = sinTildes(nombre).replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '';
    var base = partes.length === 1 ? partes[0] : partes[0] + '.' + (partes.length >= 3 ? partes[partes.length - 2] : partes[1]);
    base = base.slice(0, 26);
    var usados = estado.accesos.map(function (a) { return a.usuario; }), id = base, n = 2;
    while (usados.indexOf(id) >= 0) { id = base + n; n++; }
    return id;
  }

  function textoAcceso(a) {
    var url = window.location.origin + window.location.pathname;
    return 'Hola ' + String(a.nombre || '').trim().split(/\s+/)[0] + ', te di acceso al portal de baristas de Sepia: ' + url + '\n'
      + 'ID: ' + a.usuario + '\nClave temporal: ' + a.clave + '\nAl entrar te pedirá crear tu clave personal.';
  }

  async function recargarAccesos() {
    var rac = await sb.from('accesos').select('*');
    estado.accesos = rac.data || [];
    await cargarEventos();
    pintar();
  }

  /* Tarjeta con el ID y la clave temporal: se muestra una sola vez. */
  function tarjetaClaveTemporal() {
    var a = estado.ultimoAcceso;
    if (!a) return null;
    var msg = h('div');
    var texto = textoAcceso(a);
    var copiar = boton('Copiar mensaje', function () {
      var mostrar = function () {
        var ta = h('textarea', { class: 'sb-entrada', rows: '5', readonly: true }); ta.value = texto;
        msg.textContent = ''; msg.appendChild(ta); ta.focus(); ta.select();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(function () { ponerAviso(msg, 'Mensaje copiado. Pégalo en WhatsApp.', 'ok'); }, mostrar);
      } else mostrar();
    });
    return h('div', { class: 'sb-caja sb-caja--clave', role: 'status' },
      h('h3', { class: 'sb-h3', text: a.tipo === 'restablecida' ? 'Clave restablecida: ' + a.nombre : 'Acceso creado: ' + a.nombre }),
      h('p', { class: 'sb-texto', text: 'Entrega estos datos por privado. Se muestran una sola vez y la persona tendrá que cambiar la clave al entrar.' }),
      h('p', { class: 'sb-linea' }, 'ID: ', h('strong', { class: 'sb-mono', text: a.usuario })),
      h('p', { class: 'sb-linea' }, 'Clave temporal: ', h('strong', { class: 'sb-mono', text: a.clave })),
      h('div', { class: 'sb-fila' }, copiar,
        h('a', { class: 'sb-btn sb-btn--sec', target: '_blank', rel: 'noopener noreferrer', text: 'Abrir WhatsApp', href: 'https://wa.me/?text=' + encodeURIComponent(texto) }),
        boton('Ya guardé los datos', function () { estado.ultimoAcceso = null; pintar(); }, 'sb-btn--sec')),
      msg);
  }

  function formularioNuevoAcceso(msg) {
    var f = h('form', { class: 'sb-caja', novalidate: true });
    var sugeridos = historialSinVincular();
    var nombre = entrada('text', 'nombre', '', { id: 'sb-na-nombre', required: true, maxlength: '100', autocomplete: 'off', placeholder: 'Ej.: Camila Pérez González', list: sugeridos.length ? 'sb-na-lista' : null });
    var usuario = entrada('text', 'usuario', '', { id: 'sb-na-usuario', required: true, maxlength: '30', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'camila.perez' });
    var editado = false;
    nombre.addEventListener('input', function () { if (!editado) usuario.value = sugerirUsuario(nombre.value); });
    usuario.addEventListener('input', function () { editado = usuario.value !== ''; });
    var crear = h('button', { type: 'submit', class: 'sb-btn', text: 'Crear acceso' });
    f.appendChild(h('h3', { class: 'sb-h3', text: 'Crear acceso de barista' }));
    f.appendChild(h('p', { class: 'sb-texto', text: 'Entrégale su ID y la clave temporal por privado. No necesita correo para entrar.' }));
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Nombre completo', nombre, sugeridos.length ? 'Si la persona está en el historial, elígela de la lista: así sus turnos quedan unidos solos.' : null),
      campo('ID de usuario', usuario, 'Letras sin tilde, números, punto o guion. Se sugiere solo.')));
    if (sugeridos.length) f.appendChild(h('datalist', { id: 'sb-na-lista' }, sugeridos.map(function (x) { return h('option', { value: x.nombre }); })));
    f.appendChild(h('div', { class: 'sb-fila' }, crear));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = usuario.value.trim().toLowerCase(), n = nombre.value.trim();
      if (n.length < 3) { ponerAviso(msg, 'Escribe el nombre completo.'); nombre.focus(); return; }
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) { ponerAviso(msg, 'El ID debe tener de 3 a 30 caracteres: letras sin tilde, números, punto o guion.'); usuario.focus(); return; }
      ponerAviso(msg, '');
      conTarea(crear, async function () {
        var r = await sb.rpc('crear_acceso', { p_usuario: u, p_nombre: n });
        if (r.error) throw r.error;
        estado.ultimoAcceso = { usuario: r.data.usuario, clave: r.data.clave, nombre: n, tipo: 'creada' };
        await recargarAccesos();
      }).catch(function (err) { ponerAviso(msg, /ya existe/i.test((err && err.message) || '') ? 'Ese ID ya existe. Prueba con otro.' : mensajeError(err, 'No pudimos crear el acceso. Revisa los datos.')); });
    });
    return f;
  }

  function tarjetaAcceso(a, msg) {
    var b = estado.baristas[a.id];
    var chipEstado = !a.activo ? chip('Desactivado', 'sb-chip--no') : a.debe_cambiar_clave ? chip('Aún no entra') : !b ? chip('Falta completar el perfil') : chip('Perfil completo', 'sb-chip--ok');
    var acciones = h('div', { class: 'sb-fila' });
    var restablecer = boton('Restablecer clave', function () {
      if (!window.confirm('Se genera una clave temporal nueva para ' + a.nombre + ' y se cierran sus sesiones. ¿Seguro?')) return;
      conTarea(restablecer, async function () {
        var r = await sb.rpc('restablecer_clave', { p_acceso: a.id });
        if (r.error) throw r.error;
        estado.ultimoAcceso = { usuario: a.usuario, clave: r.data, nombre: a.nombre, tipo: 'restablecida' };
        await recargarAccesos();
      }).catch(function () { ponerAviso(msg, 'No pudimos restablecer la clave.'); });
    }, 'sb-btn--sec');
    var estadoBtn = boton(a.activo ? 'Desactivar acceso' : 'Restaurar acceso', function () {
      if (a.activo && !window.confirm(a.nombre + ' no podrá entrar ni ver nada hasta que restaures su acceso. ¿Seguro?')) return;
      conTarea(estadoBtn, async function () {
        var r = await sb.rpc('cambiar_estado_acceso', { p_acceso: a.id, p_activo: !a.activo });
        if (r.error) throw r.error;
        await recargarAccesos();
      }).catch(function () { ponerAviso(msg, 'No pudimos cambiar el acceso.'); });
    }, 'sb-btn--sec');
    var eliminar = boton('Eliminar', function () {
      if (!window.confirm('Se borra el acceso de ' + a.nombre + ', su perfil y todas sus postulaciones. No se puede deshacer. ¿Seguro?')) return;
      conTarea(eliminar, async function () {
        var r = await sb.rpc('eliminar_acceso', { p_acceso: a.id });
        if (r.error) throw r.error;
        await recargarAccesos();
      }).catch(function () { ponerAviso(msg, 'No pudimos eliminar el acceso.'); });
    }, 'sb-btn--sec');
    acciones.appendChild(restablecer); acciones.appendChild(estadoBtn); acciones.appendChild(eliminar);

    var caja = h('article', { class: 'sb-tarjeta' },
      h('div', { class: 'sb-tarjeta__cab' }, h('div', { class: 'sb-persona' }, avatar(a.nombre, b && b.foto_path), h('div', null, h('h3', { class: 'sb-h3', text: a.nombre }), h('p', { class: 'sb-linea sb-mono', text: a.usuario }))), chipEstado));
    if (b) {
      var previos = entrada('number', 'turnos_previos', b.turnos_previos || 0, { min: '0', max: '5000', step: '1', inputmode: 'numeric', 'aria-label': 'Turnos previos al portal' });
      var guardarPrevios = boton('Guardar', function () {
        var n = parseInt(previos.value, 10);
        if (!(n >= 0 && n <= 5000)) { ponerAviso(msg, 'Los turnos previos son un número entre 0 y 5000.'); return; }
        conTarea(guardarPrevios, async function () {
          var r = await sb.from('baristas').update({ turnos_previos: n }).eq('id', a.id);
          if (r.error) throw r.error;
          await recargarAccesos();
        }).catch(function () { ponerAviso(msg, 'No pudimos guardar los turnos previos.'); });
      }, 'sb-btn--sec');
      caja.appendChild(h('details', { class: 'sb-detalle sb-detalle--chico' },
        h('summary', { class: 'sb-resumen' }, h('span', { class: 'sb-resumen__t', text: 'Datos privados de contacto y pago' })),
        h('dl', { class: 'sb-dl' },
          [['Teléfono', b.telefono], ['Correo de contacto', b.correo], ['RUT', b.rut], ['Comuna', b.comuna], ['Talla de camisa', b.talla_camisa || 'Sin informar'],
            ['Camioneta', b.tiene_camioneta ? 'Sí' : 'No'], ['Banco', b.banco], ['Cuenta', b.tipo_cuenta + ' ' + b.numero_cuenta],
            ['Avisos por correo', b.acepta_avisos ? 'Sí' : 'No']].map(function (x) { return [h('dt', { text: x[0] }), h('dd', { text: x[1] })]; })),
        h('div', { class: 'sb-fila' }, h('label', { class: 'sb-etiqueta', text: 'Otros turnos previos (sin detalle)' }), previos, guardarPrevios)));
    } else if (a.activo) {
      caja.appendChild(h('p', { class: 'sb-linea', text: a.debe_cambiar_clave ? 'Todavía no entra al portal.' : 'Ya cambió su clave y falta que complete su perfil.' }));
    }
    añadir(caja, detalleHistorialAcceso(a, msg));
    caja.appendChild(acciones);
    return caja;
  }

  /* Historial anterior al portal de una persona: lo unido a su acceso y, si hace falta, unir otro nombre. */
  function detalleHistorialAcceso(a, msg) {
    var mios = estado.historial.filter(function (x) { return x.acceso_id === a.id; });
    var libres = historialSinVincular();
    if (!mios.length && !libres.length) return null;
    var cont = h('details', { class: 'sb-detalle sb-detalle--chico' },
      h('summary', { class: 'sb-resumen' }, h('span', { class: 'sb-resumen__t', text: 'Historial anterior al portal: ' + plural(turnosHistorial(a.id), 'turno', 'turnos') })));
    mios.forEach(function (x) {
      var quitar = boton('Desvincular', function () {
        if (!window.confirm('Los turnos de «' + x.nombre + '» dejan de contar para ' + a.nombre + '. ¿Seguro?')) return;
        conTarea(quitar, async function () {
          var r = await sb.rpc('vincular_historial', { p_nombre: x.nombre, p_acceso: null });
          if (r.error) throw r.error;
          await recargarAccesos();
        }).catch(function () { ponerAviso(msg, 'No pudimos desvincular el historial.'); });
      }, 'sb-btn--sec sb-btn--chico');
      cont.appendChild(h('div', { class: 'sb-fila' }, h('span', { class: 'sb-linea', text: x.nombre + ' · ' + plural(x.turnos, 'turno', 'turnos') }), quitar));
    });
    if (libres.length) {
      var sel = h('select', { class: 'sb-entrada', 'aria-label': 'Nombre del historial para ' + a.nombre },
        h('option', { value: '', text: 'Elegir un nombre del historial…' }),
        libres.map(function (x) { return h('option', { value: x.nombre, text: x.nombre + ' · ' + plural(x.turnos, 'turno', 'turnos') }); }));
      var unir = boton('Vincular historial', function () {
        if (!sel.value) { ponerAviso(msg, 'Elige primero el nombre del historial.'); sel.focus(); return; }
        conTarea(unir, async function () {
          var r = await sb.rpc('vincular_historial', { p_nombre: sel.value, p_acceso: a.id });
          if (r.error) throw r.error;
          await recargarAccesos();
        }).catch(function () { ponerAviso(msg, 'No pudimos vincular el historial.'); });
      }, 'sb-btn--sec sb-btn--chico');
      cont.appendChild(h('p', { class: 'sb-ayuda', text: 'Si el nombre del historial no calzó solo (por ejemplo, por un segundo apellido), únelo aquí.' }));
      cont.appendChild(h('div', { class: 'sb-fila' }, sel, unir));
    }
    return cont;
  }

  /* Resumen del historial en «Admin: accesos»: cuánto hay y quién todavía no tiene acceso. */
  function bloqueResumenHistorial() {
    if (!estado.historial.length) return null;
    var total = estado.historial.reduce(function (n, x) { return n + Number(x.turnos); }, 0);
    var libres = historialSinVincular();
    var sinAcceso = libres.reduce(function (n, x) { return n + Number(x.turnos); }, 0);
    var det = h('details', { class: 'sb-detalle' },
      h('summary', { class: 'sb-resumen' }, h('span', { class: 'sb-resumen__t', text: 'Historial anterior al portal: ' + plural(total, 'turno', 'turnos') })),
      h('p', { class: 'sb-texto', text: plural(total - sinAcceso, 'turno unido', 'turnos unidos') + ' a un acceso y ' + plural(sinAcceso, 'turno', 'turnos') + ' de personas sin acceso todavía. Cuentan en el ranking cuando el nombre calza con el de un acceso.' }));
    if (libres.length) {
      det.appendChild(h('p', { class: 'sb-linea', text: 'Sin acceso todavía:' }));
      det.appendChild(h('ul', { class: 'sb-historial-libres' }, libres.map(function (x) { return h('li', { text: x.nombre + ' · ' + plural(x.turnos, 'turno', 'turnos') }); })));
    } else {
      det.appendChild(h('p', { class: 'sb-texto', text: 'Todo el historial ya está unido a un acceso.' }));
    }
    return det;
  }

  function vistaAccesos() {
    var caja = h('div');
    var msg = h('div');
    caja.appendChild(h('h2', { class: 'sb-h2', text: 'Accesos del equipo' }));
    caja.appendChild(msg);
    añadir(caja, tarjetaClaveTemporal());
    caja.appendChild(formularioNuevoAcceso(msg));
    añadir(caja, bloqueResumenHistorial());
    caja.appendChild(h('h3', { class: 'sb-h3', text: plural(estado.accesos.length, 'persona en el equipo', 'personas en el equipo') }));
    if (!estado.accesos.length) caja.appendChild(h('p', { class: 'sb-texto', text: 'Aún no hay accesos. Crea el primero con el formulario de arriba.' }));
    var orden = estado.accesos.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    caja.appendChild(h('div', { class: 'sb-lista' }, orden.map(function (a) { return tarjetaAcceso(a, msg); })));
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Armado de la página                                                 */
  /* ------------------------------------------------------------------ */

  function pestanas() {
    var lista = [];
    if (estado.perfil) lista.push(['eventos', 'Eventos'], ['mis', 'Mis postulaciones'], ['ranking', 'Ranking'], ['ganancias', 'Mis ganancias'], ['datos', 'Mis datos']);
    if (estado.admin) {
      var n = alertasSeg().length;
      lista.push(['seguimiento', 'Admin: seguimiento' + (n ? ' (' + n + ')' : '')], ['admin', 'Admin: eventos'],
        ['postulantes', 'Admin: postulantes'], ['resumen', 'Admin: pagos'], ['accesos', 'Admin: accesos'], ['ranking', 'Ranking']);
      if (estado.claveAdmin !== null) lista.push(['miclave', 'Mi clave']);
    }
    return lista;
  }

  function vistaApp() {
    var tabs = pestanas();
    if (!tabs.some(function (t) { return t[0] === estado.pestana; })) estado.pestana = tabs[0][0];
    var nav = h('div', { class: 'sb-tabs', role: 'tablist' }, tabs.map(function (t) {
      return h('button', { type: 'button', role: 'tab', class: 'sb-tab' + (t[0] === estado.pestana ? ' sb-tab--on' : ''), 'aria-selected': t[0] === estado.pestana ? 'true' : 'false',
        onclick: function () { estado.pestana = t[0]; pintar(); }, text: t[1] });
    }));
    var vista = { eventos: vistaEventos, mis: vistaMisPostulaciones,
      datos: function () { return h('div', null, vistaFormularioPerfil('editar'), h('div', { class: 'sb-caja sb-caja--aparte' }, vistaCambiarClave(false))); },
      ranking: vistaRanking, ganancias: vistaGanancias,
      seguimiento: vistaSeguimiento, admin: vistaAdminEventos, postulantes: vistaPostulantes, resumen: vistaResumen, accesos: vistaAccesos, miclave: vistaMiClave }[estado.pestana];
    return h('div', null, nav, h('div', { class: 'sb-panel', role: 'tabpanel' }, vista()));
  }

  function barraSuperior() {
    return h('div', { class: 'sb-barra' },
      h('p', { class: 'sb-barra__t', text: 'Sesión: ' + (estado.acceso && !estado.admin ? estado.acceso.nombre + ' (' + estado.acceso.usuario + ')' : (estado.sesion.user.email || '')) }),
      boton('Salir', async function () { await sb.auth.signOut({ scope: 'local' }); limpiarEstado(); pintar(); }, 'sb-btn--sec'));
  }

  function pintar() {
    raiz.textContent = '';
    raiz.appendChild(h('header', { class: 'sb-cab' },
      h('h1', { class: 'sb-h1', text: 'Baristas Sepia' }),
      h('p', { class: 'sb-texto', text: 'Mira los eventos, postula y sigue tus turnos y ganancias.' })));
    if (estado.cargando) { raiz.appendChild(h('p', { class: 'sb-texto', role: 'status', text: 'Cargando…' })); return; }
    if (!estado.sesion) { raiz.appendChild(vistaLogin()); raiz.appendChild(pie()); return; }
    raiz.appendChild(barraSuperior());
    if (estado.admin) raiz.appendChild(estado.claveAdmin === false && !estado.claveAdminOmitida ? vistaClaveAdmin(true) : vistaApp());
    else if (!estado.acceso || !estado.acceso.activo) raiz.appendChild(vistaSinAcceso());
    else if (estado.acceso.debe_cambiar_clave) raiz.appendChild(vistaCambiarClave(true));
    else if (!estado.perfil) raiz.appendChild(vistaFormularioPerfil('crear'));
    else raiz.appendChild(vistaApp());
    raiz.appendChild(pie());
  }

  function pie() {
    return h('p', { class: 'sb-pie' }, '¿Problemas para entrar? ', h('a', { href: WHATSAPP, target: '_blank', rel: 'noopener noreferrer', text: 'Escríbenos por WhatsApp' }), '.');
  }

  /* ------------------------------------------------------------------ */
  /* Inicio                                                              */
  /* ------------------------------------------------------------------ */

  async function iniciar() {
    if (!SB_URL || !SB_KEY) { raiz.appendChild(aviso('Este portal todavía no está configurado.')); return; }
    if (!window.supabase || !window.supabase.createClient) { raiz.appendChild(aviso('No pudimos cargar el portal. Recarga la página.')); return; }
    sb = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'sepia-baristas-auth' }
    });
    sb.auth.onAuthStateChange(function (evento) {
      if (evento === 'SIGNED_OUT' && estado.sesion) { limpiarEstado(); pintar(); }
    });
    pintar();
    try {
      var r = await sb.auth.getSession();
      if (r.data && r.data.session) { estado.sesion = r.data.session; await cargarTodo(); }
    } catch (e) { limpiarEstado(); }
    estado.cargando = false;
    pintar();
  }

  iniciar();
})();
