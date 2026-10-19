/* SEPIA COFFEE · portal de baristas
 *
 * Una sola página: entrar con el correo (código, sin contraseña), registrarse
 * con datos personales y bancarios, ver los eventos y postular. Quien está en
 * la tabla `admins` ve además las pestañas de administración.
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
    pestana: 'eventos', cargando: true, correoLogin: ''
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
    }
    estado.misPosts = {};
    estado.posts.forEach(function (p) { if (p.barista_id === uid) estado.misPosts[p.evento_id] = p; });
  }

  async function recargar() {
    await cargarEventos();
    pintar();
  }

  function limpiarEstado() {
    estado.sesion = null; estado.perfil = null; estado.admin = false; estado.config = null;
    estado.eventos = []; estado.posts = []; estado.dirs = {}; estado.privado = {}; estado.baristas = {}; estado.misPosts = {}; estado.seg = {}; estado.segDatos = {}; estado.sync = null;
    estado.pestana = 'eventos';
  }

  /* ------------------------------------------------------------------ */
  /* Entrar con el correo                                                */
  /* ------------------------------------------------------------------ */

  function vistaLogin() {
    var caja = h('div', { class: 'sb-caja' });
    var pasoCorreo = function () {
      caja.textContent = '';
      var correo = entrada('email', 'correo', estado.correoLogin, { autocomplete: 'email', required: true, placeholder: 'tucorreo@ejemplo.cl', inputmode: 'email' });
      var msg = h('div');
      var enviar = boton('Enviarme el código', function () {
        var v = correo.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { ponerAviso(msg, 'Escribe un correo válido.'); correo.focus(); return; }
        ponerAviso(msg, '');
        conTarea(enviar, async function () {
          var r = await sb.auth.signInWithOtp({ email: v, options: { shouldCreateUser: true } });
          if (r.error) throw r.error;
          estado.correoLogin = v;
          pasoCodigo();
        }).catch(function (e) { ponerAviso(msg, mensajeError(e, 'No pudimos enviar el código. Revisa el correo e inténtalo de nuevo en un minuto.')); });
      });
      caja.appendChild(h('h2', { class: 'sb-h2', text: 'Entra con tu correo' }));
      caja.appendChild(h('p', { class: 'sb-texto', text: 'Te enviamos un código de un solo uso. No hay contraseña que recordar.' }));
      caja.appendChild(campo('Correo electrónico', correo));
      caja.appendChild(enviar);
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
        }).then(async function () {
          estado.cargando = true; pintar();
          try { await cargarTodo(); } catch (e) { /* se muestra lo que haya */ }
          estado.cargando = false;
          pintar();
        }, function (e) { ponerAviso(msg, mensajeError(e, 'El código no es válido o ya venció. Pide uno nuevo.')); });
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
    pasoCorreo();
    return caja;
  }

  /* ------------------------------------------------------------------ */
  /* Registro y «Mis datos»                                              */
  /* ------------------------------------------------------------------ */

  function vistaFormularioPerfil(modo) {
    var p = estado.perfil || {};
    var editando = modo === 'editar';
    var cfg = estado.config || {};
    var correoSesion = (estado.sesion.user.email || '').toLowerCase();
    var f = h('form', { class: 'sb-caja', novalidate: true });
    var msg = h('div');

    var banco = entrada('text', 'banco', p.banco || '', { list: 'sb-bancos', autocomplete: 'off', required: true, maxlength: '60', placeholder: 'Elige o escribe tu banco' });
    var lista = h('datalist', { id: 'sb-bancos' }, BANCOS.map(function (b) { return h('option', { value: b }); }));
    var tipo = h('select', { name: 'tipo_cuenta', class: 'sb-entrada', required: true },
      h('option', { value: '', text: 'Elige el tipo' }), TIPOS_CUENTA.map(function (t) { return h('option', { value: t, text: t }); }));
    tipo.value = p.tipo_cuenta || '';
    var exp = h('textarea', { name: 'experiencia', class: 'sb-entrada', rows: '3', maxlength: '600', placeholder: 'Por ejemplo: dos años de barra, latte art, eventos…' });
    exp.value = p.experiencia || '';

    f.appendChild(h('h2', { class: 'sb-h2', text: editando ? 'Mis datos' : 'Regístrate como barista' }));
    if (!editando) f.appendChild(h('p', { class: 'sb-texto', text: 'Completa esto una sola vez. Con tu registro puedes ver los eventos y postular.' }));
    f.appendChild(h('h3', { class: 'sb-h3', text: 'Tus datos' }));
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Nombre completo', entrada('text', 'nombre', p.nombre || '', { autocomplete: 'name', required: true, maxlength: '100' })),
      campo('RUT', entrada('text', 'rut', p.rut || '', { autocomplete: 'off', required: true, maxlength: '12', placeholder: '12.345.678-5', autocapitalize: 'characters' })),
      campo('Teléfono (WhatsApp)', entrada('tel', 'telefono', p.telefono || '', { autocomplete: 'tel', required: true, maxlength: '16', placeholder: '9 1234 5678' })),
      campo('Comuna donde vives', entrada('text', 'comuna', p.comuna || '', { autocomplete: 'address-level2', required: true, maxlength: '60' })),
      campo('Correo', entrada('email', 'correo', correoSesion, { readonly: true }), 'Es el correo con el que entraste.')));
    f.appendChild(campo('Experiencia (opcional)', exp));

    f.appendChild(h('h3', { class: 'sb-h3', text: 'Datos para transferirte' }));
    f.appendChild(h('div', { class: 'sb-grilla' },
      campo('Banco', banco), lista,
      campo('Tipo de cuenta', tipo),
      campo('Número de cuenta', entrada('text', 'numero_cuenta', p.numero_cuenta || '', { inputmode: 'numeric', autocomplete: 'off', required: true, maxlength: '20', placeholder: 'Solo números' }))));
    f.appendChild(casilla('cuenta_propia', 'La cuenta está a mi nombre y con mi RUT.', !!p.cuenta_propia));

    f.appendChild(h('h3', { class: 'sb-h3', text: 'Boleta y privacidad' }));
    var textoBoleta = (editando && p.acepta_boleta_texto) || cfg.texto_boleta || 'Declaro que puedo emitir boleta de honorarios electrónica por los servicios que preste en los eventos de Sepia Coffee.';
    f.appendChild(casilla('acepta_boleta', textoBoleta, !!p.acepta_boleta));
    f.appendChild(casilla('acepta_privacidad', cfg.texto_privacidad || 'Sepia Coffee usa mis datos solo para coordinar los eventos y pagarme.', !!p.acepta_privacidad));
    f.appendChild(casilla('acepta_avisos', 'Quiero recibir por correo avisos cuando haya cupos disponibles en eventos (opcional).', !!p.acepta_avisos));

    var guardar = h('button', { type: 'submit', class: 'sb-btn', text: editando ? 'Guardar cambios' : 'Completar registro' });
    f.appendChild(h('div', { class: 'sb-fila' }, guardar));
    f.appendChild(msg);

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var d = new FormData(f);
      var v = function (k) { return String(d.get(k) || '').trim(); };
      var fila = {
        nombre: v('nombre'), rut: formatoRut(v('rut')), correo: correoSesion, telefono: normalizarTelefono(v('telefono')),
        comuna: v('comuna'), experiencia: v('experiencia') || null, banco: v('banco'), tipo_cuenta: v('tipo_cuenta'),
        numero_cuenta: v('numero_cuenta').replace(/[^\d]/g, ''), cuenta_propia: !!d.get('cuenta_propia'),
        acepta_boleta: !!d.get('acepta_boleta'), acepta_privacidad: !!d.get('acepta_privacidad'), acepta_avisos: !!d.get('acepta_avisos')
      };
      var error = null, enfoque = null;
      if (fila.nombre.length < 3) { error = 'Escribe tu nombre completo.'; enfoque = 'nombre'; }
      else if (!rutValido(fila.rut)) { error = 'Revisa el RUT: está incompleto o el dígito verificador no calza.'; enfoque = 'rut'; }
      else if (!fila.telefono) { error = 'Escribe un teléfono válido, por ejemplo 9 1234 5678.'; enfoque = 'telefono'; }
      else if (fila.comuna.length < 2) { error = 'Escribe tu comuna.'; enfoque = 'comuna'; }
      else if (fila.banco.length < 2) { error = 'Escribe tu banco.'; enfoque = 'banco'; }
      else if (!fila.tipo_cuenta) { error = 'Elige el tipo de cuenta.'; enfoque = 'tipo_cuenta'; }
      else if (!/^\d{4,20}$/.test(fila.numero_cuenta)) { error = 'El número de cuenta debe tener solo números (entre 4 y 20).'; enfoque = 'numero_cuenta'; }
      else if (!fila.cuenta_propia) { error = 'Para transferirte, la cuenta tiene que estar a tu nombre y con tu RUT.'; enfoque = 'cuenta_propia'; }
      else if (!fila.acepta_boleta) { error = 'Para registrarte tienes que poder emitir boleta de honorarios. Marca la declaración.'; enfoque = 'acepta_boleta'; }
      else if (!fila.acepta_privacidad) { error = 'Marca que aceptas el uso de tus datos para poder registrarte.'; enfoque = 'acepta_privacidad'; }
      if (error) { ponerAviso(msg, error); var el = f.elements[enfoque]; if (el) el.focus(); return; }
      ponerAviso(msg, '');
      conTarea(guardar, async function () {
        var r;
        if (editando) {
          var cambios = Object.assign({}, fila); delete cambios.correo; delete cambios.acepta_boleta; delete cambios.acepta_privacidad; delete cambios.cuenta_propia;
          r = await sb.from('baristas').update(cambios).eq('id', estado.sesion.user.id).select('*').single();
        } else {
          fila.id = estado.sesion.user.id;
          fila.acepta_boleta_texto = textoBoleta;
          r = await sb.from('baristas').insert(fila).select('*').single();
        }
        if (r.error) throw r.error;
        estado.perfil = r.data;
        if (!editando) { await cargarEventos(); estado.pestana = 'eventos'; pintar(); }
        else ponerAviso(msg, 'Listo, guardamos tus datos.', 'ok');
      }).catch(function (e) { ponerAviso(msg, mensajeError(e, 'No pudimos guardar. Revisa los datos e inténtalo de nuevo.')); });
    });

    if (editando) {
      f.appendChild(h('hr', { class: 'sb-sep' }));
      f.appendChild(h('p', { class: 'sb-texto', text: 'Aceptaste la declaración de boleta y el uso de tus datos el ' + new Date(p.aceptado_en).toLocaleDateString('es-CL') + '.' }));
      var borrar = boton('Borrar mis datos', function () {
        if (!window.confirm('Vamos a borrar tu registro y tus postulaciones. ¿Seguro?')) return;
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
        h('p', { class: 'sb-linea', text: 'Necesitas ' + ev.baristas_necesarios + ' · confirmados ' + confirmados + ' · postulados ' + postulados }),
        h('p', { class: 'sb-linea', text: 'Pago ' + clp(ev.pago_liquido) + ' líquidos · boleta ' + clp(ev.monto_boleta)
          + (Number(ev.pago_sin_tope) > Number(ev.pago_liquido) ? ' · tope diario aplicado (sin tope: ' + clp(ev.pago_sin_tope) + ')' : '') }),
        h('div', { class: 'sb-fila' },
          boton('Editar', function () { abrirFormulario(ev); }, 'sb-btn--sec'),
          boton('Postulantes', function () { estado.pestana = 'postulantes'; estado.filtroEvento = ev.id; pintar(); }, 'sb-btn--sec'))));
    });
    if (!estado.eventos.length) lista.appendChild(h('p', { class: 'sb-texto', text: 'Aún no hay eventos. Crea el primero con «Nuevo evento».' }));
    caja.appendChild(lista);
    return caja;
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
        pago_manual: v('pago_manual') === '' ? null : parseInt(v('pago_manual'), 10), estado: v('estado')
      };
      var error = null;
      if (fila.nombre.length < 3) error = 'Escribe el nombre del evento.';
      else if (!fila.fecha) error = 'Elige la fecha.';
      else if (!fila.hora_inicio || !fila.hora_fin) error = 'Pon la hora de inicio y la de término.';
      else if (fila.hora_inicio === fila.hora_fin) error = 'La hora de inicio y la de término no pueden ser iguales.';
      else if (fila.comuna.length < 2) error = 'Escribe la comuna.';
      else if (!(fila.baristas_necesarios >= 1)) error = 'Indica cuántos baristas necesitas.';
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
        await recargar();
      }).catch(function (err) { ponerAviso(msg, mensajeError(err, 'No pudimos guardar el evento. Revisa los datos.')); });
    });
    return f;
  }

  /* ------------------------------------------------------------------ */
  /* Administración: postulantes                                         */
  /* ------------------------------------------------------------------ */

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
        det.appendChild(h('div', { class: 'sb-postulante' },
          h('div', { class: 'sb-tarjeta__cab' }, h('h3', { class: 'sb-h3', text: b.nombre || 'Barista' }),
            chipPostulacion(p)),
          h('p', { class: 'sb-linea', text: [b.telefono, b.comuna, b.correo].filter(Boolean).join(' · ') }),
          b.experiencia ? h('p', { class: 'sb-linea', text: 'Experiencia: ' + b.experiencia }) : null,
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
            boleta_honorarios_folio: fFol.value.trim() || null
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
  /* Armado de la página                                                 */
  /* ------------------------------------------------------------------ */

  function pestanas() {
    var lista = [];
    if (estado.perfil) lista.push(['eventos', 'Eventos'], ['mis', 'Mis postulaciones'], ['datos', 'Mis datos']);
    if (estado.admin) {
      var n = alertasSeg().length;
      lista.push(['seguimiento', 'Admin: seguimiento' + (n ? ' (' + n + ')' : '')], ['admin', 'Admin: eventos'],
        ['postulantes', 'Admin: postulantes'], ['resumen', 'Admin: pagos']);
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
    var vista = { eventos: vistaEventos, mis: vistaMisPostulaciones, datos: function () { return vistaFormularioPerfil('editar'); },
      seguimiento: vistaSeguimiento, admin: vistaAdminEventos, postulantes: vistaPostulantes, resumen: vistaResumen }[estado.pestana];
    return h('div', null, nav, h('div', { class: 'sb-panel', role: 'tabpanel' }, vista()));
  }

  function barraSuperior() {
    return h('div', { class: 'sb-barra' },
      h('p', { class: 'sb-barra__t', text: 'Sesión: ' + (estado.sesion.user.email || '') }),
      boton('Salir', async function () { await sb.auth.signOut(); limpiarEstado(); pintar(); }, 'sb-btn--sec'));
  }

  function pintar() {
    raiz.textContent = '';
    raiz.appendChild(h('header', { class: 'sb-cab' },
      h('h1', { class: 'sb-h1', text: 'Baristas Sepia' }),
      h('p', { class: 'sb-texto', text: 'Trabaja con nosotros en eventos: regístrate, mira las fechas y postula.' })));
    if (estado.cargando) { raiz.appendChild(h('p', { class: 'sb-texto', role: 'status', text: 'Cargando…' })); return; }
    if (!estado.sesion) { raiz.appendChild(vistaLogin()); raiz.appendChild(pie()); return; }
    raiz.appendChild(barraSuperior());
    if (!estado.perfil && !estado.admin) raiz.appendChild(vistaFormularioPerfil('crear'));
    else raiz.appendChild(vistaApp());
    raiz.appendChild(pie());
  }

  function pie() {
    return h('p', { class: 'sb-pie' }, '¿Problemas para entrar o registrarte? ', h('a', { href: WHATSAPP, target: '_blank', rel: 'noopener noreferrer', text: 'Escríbenos por WhatsApp' }), '.');
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
