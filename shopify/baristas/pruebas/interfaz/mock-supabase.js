// Simulación mínima de supabase-js para probar la interfaz sin red. Las reglas de
// seguridad reales se prueban aparte, en Postgres (pruebas/rls.sql).
(function () {
  var S = window.__ESC || {};
  var hoy = new Date(); var iso = function (d) { var x = new Date(hoy.getTime() + d * 864e5); return x.toISOString().slice(0, 10); };
  var cfg = { id: 1, tarifa_hora: 10000, corto_max_horas: 2, corto_monto: 25000, medio_max_horas: 4, medio_monto: 40000, retencion: 0.1525, tope_dia: 70000, dias_alerta_baristas: 7, dias_alerta_reconfirmar: 4, dias_alerta_cierre: 7,
    checklist_items: [{clave:'grupo_whatsapp',texto:'Grupo de WhatsApp creado'},{clave:'direccion_hora',texto:'Dirección y hora enviadas a los baristas'},{clave:'equipo',texto:'Equipo y materiales listos'},{clave:'transporte',texto:'Transporte y recolección coordinados'},{clave:'cliente_confirmo',texto:'Cliente confirmó hora y lugar'}],
    texto_boleta: 'Declaro que puedo emitir boleta de honorarios electrónica por los servicios que preste en los eventos de Sepia Coffee.',
    texto_privacidad: 'Sepia Coffee usa mis datos solo para coordinar los eventos y pagarme. Los ve únicamente Sepia Coffee, y puedo pedir que los borre en cualquier momento.' };
  var db = window.__DB = {
    config: [cfg], baristas: [], postulaciones: [], evento_privado: [], evento_direcciones: [], evento_seguimiento: [],
    automatizacion: [{ id: 1, ultima_sync_en: S.sinSync ? null : new Date(Date.now() - (S.syncViejo ? 80 : 3) * 36e5).toISOString(),
      ultima_sync_resumen: S.sinSync ? null : { recibidos: 20, creados: ['a', 'b'], cambiados: ['c'], cancelados: [], por_revisar: [], errores: [], advertencia: S.syncAdvertencia || null } }],
    eventos: [
      { id: 'e1', nombre: 'Matrimonio en Pirque', fecha: iso(10), hora_inicio: '18:00:00', hora_fin: '23:00:00', comuna: 'Pirque', lugar: 'Viña', descripcion: 'Tenida negra', baristas_necesarios: 2, pago_manual: null, estado: 'abierto' },
      { id: 'e2', nombre: 'Coffee break empresa', fecha: iso(12), hora_inicio: '09:00:00', hora_fin: '11:00:00', comuna: 'Las Condes', lugar: null, descripcion: null, baristas_necesarios: 1, pago_manual: null, estado: 'abierto' },
      { id: 'e3', nombre: 'Cumpleaños', fecha: iso(15), hora_inicio: '16:00:00', hora_fin: '19:00:00', comuna: 'Ñuñoa', lugar: null, descripcion: null, baristas_necesarios: 1, pago_manual: null, estado: 'abierto' },
      { id: 'e4', nombre: 'Borrador secreto', fecha: iso(20), hora_inicio: '16:00:00', hora_fin: '19:00:00', comuna: 'Santiago', lugar: null, descripcion: null, baristas_necesarios: 1, pago_manual: null, estado: 'borrador' },
      { id: 'e5', nombre: 'Evento pasado', fecha: iso(-3), hora_inicio: '16:00:00', hora_fin: '19:00:00', comuna: 'Santiago', lugar: null, descripcion: null, baristas_necesarios: 1, pago_manual: null, estado: 'abierto' }
    ]
  };
  db.evento_direcciones.push({ evento_id: 'e1', direccion: 'Camino Falso 123', indicaciones: 'Portón verde' });
  db.evento_privado.push({ evento_id: 'e1', cliente: 'Familia Secreta', contacto: 'x', notas: 'n' });
  if (S.otraBarista) {
    db.baristas.push({ id: 'u-otra', nombre: '<img src=x onerror="window.__xss=1"> Otra', rut: '11.111.111-1', correo: 'otra@ejemplo.cl', telefono: '+56911111111', comuna: 'Vitacura', experiencia: 'Barra 2 años', banco: 'Banco Estado', tipo_cuenta: 'Cuenta RUT', numero_cuenta: '11111111', cuenta_propia: true, acepta_boleta: true, acepta_boleta_texto: cfg.texto_boleta, acepta_privacidad: true, aceptado_en: new Date().toISOString() });
    db.postulaciones.push({ id: 'p-otra', evento_id: 'e1', barista_id: 'u-otra', estado: 'postulada', creado_en: new Date().toISOString() });
  }
  if (S.seguimiento) {
    var ev0 = { lugar: null, descripcion: null, pago_manual: null, estado: 'abierto', comuna: 'Santiago', hora_inicio: '18:00:00', hora_fin: '22:00:00' };
    [['e11','Seg A 3 días sin baristas',3,2],['e12','Seg B 10 días sin reconfirmar',10,1],['e13','Seg C 2 días listo',2,1],['e14','Seg D pasado 3 días',-3,1],['e15','Seg E pasado 10 días',-10,1],['e16','Seg F ya cerrado',-4,1]].forEach(function (x) {
      db.eventos.push(Object.assign({}, ev0, { id: x[0], nombre: x[1], fecha: iso(x[2]), baristas_necesarios: x[3] }));
    });
    var base = { acepta_boleta: true, acepta_boleta_texto: cfg.texto_boleta, acepta_privacidad: true, cuenta_propia: true, aceptado_en: new Date().toISOString(), experiencia: null };
    db.baristas.push(Object.assign({ id: 'u-bea', nombre: 'Bea Prueba', rut: '12.345.678-5', correo: 'bea@ejemplo.cl', telefono: '+56922223333', comuna: 'Ñuñoa', banco: 'BCI', tipo_cuenta: 'Cuenta vista', numero_cuenta: '22223333' }, base));
    db.baristas.push(Object.assign({ id: 'u-caro', nombre: 'Caro Prueba', rut: '10.000.013-K', correo: 'caro@ejemplo.cl', telefono: '+56944445555', comuna: 'Providencia', banco: 'Banco Estado', tipo_cuenta: 'Cuenta RUT', numero_cuenta: '44445555' }, base));
    var P = function (id, ev, bar, extra) { db.postulaciones.push(Object.assign({ id: id, evento_id: ev, barista_id: bar, estado: 'confirmada', creado_en: new Date().toISOString(), asistencia_confirmada_en: null, boleta_honorarios_recibida_en: null, boleta_honorarios_folio: null, honorarios_pagados_en: null }, extra || {})); };
    P('s1', 'e12', 'u-bea'); P('s2', 'e13', 'u-caro', { asistencia_confirmada_en: new Date().toISOString() });
    P('s3', 'e14', 'u-bea', { asistencia_confirmada_en: new Date().toISOString() }); P('s4', 'e15', 'u-caro', { asistencia_confirmada_en: new Date().toISOString() });
    P('s5', 'e16', 'u-bea', { asistencia_confirmada_en: new Date().toISOString(), boleta_honorarios_recibida_en: iso(-2), boleta_honorarios_folio: 'B-9', honorarios_pagados_en: iso(-1) });
    db.evento_seguimiento.push({ evento_id: 'e16', checklist: {}, documento_cliente_emitido_en: iso(-3), documento_cliente_folio: 'F-1' });
  }
  if (S.despues) {      // la barista de la sesión (u-ana) trabajó en tres eventos pasados
    var ev1 = { lugar: null, descripcion: null, pago_manual: null, estado: 'abierto', comuna: 'Santiago', hora_inicio: '18:00:00', hora_fin: '22:00:00', baristas_necesarios: 1 };
    [['e21', 'Pasado sin boleta', -2], ['e22', 'Pasado boleta enviada', -5], ['e23', 'Pasado pagado', -8], ['e24', 'Futuro asignado', 6]].forEach(function (x) {
      db.eventos.push(Object.assign({}, ev1, { id: x[0], nombre: x[1], fecha: iso(x[2]) }));
    });
    var T = function (id, ev, extra) { db.postulaciones.push(Object.assign({ id: id, evento_id: ev, barista_id: 'u-ana', estado: 'confirmada', creado_en: new Date().toISOString(), asistencia_confirmada_en: new Date().toISOString(),
      boleta_honorarios_recibida_en: null, boleta_honorarios_folio: null, honorarios_pagados_en: null, boleta_declarada_en: null, boleta_declarada_folio: null }, extra || {})); };
    T('t1', 'e21'); T('t2', 'e22', { boleta_declarada_en: new Date(Date.now() - 864e5).toISOString(), boleta_declarada_folio: 'B-5' });
    T('t3', 'e23', { boleta_declarada_en: new Date(Date.now() - 5 * 864e5).toISOString(), boleta_honorarios_recibida_en: iso(-6), honorarios_pagados_en: iso(-4) });
    T('t4', 'e24', { asistencia_confirmada_en: null });
  }
  if (S.cierre) {       // admin: un evento pasado con una boleta declarada y otra sin declarar; y eventos del calendario por revisar
    db.eventos.push({ id: 'e31', nombre: 'Cierre con boleta declarada', fecha: iso(-2), hora_inicio: '18:00:00', hora_fin: '22:00:00', comuna: 'Santiago', lugar: null, descripcion: null, baristas_necesarios: 2, pago_manual: null, estado: 'abierto' });
    var base2 = { acepta_boleta: true, acepta_boleta_texto: cfg.texto_boleta, acepta_privacidad: true, cuenta_propia: true, aceptado_en: new Date().toISOString(), experiencia: null };
    db.baristas.push(Object.assign({ id: 'u-bea', nombre: 'Bea Prueba', rut: '12.345.678-5', correo: 'bea@ejemplo.cl', telefono: '+56922223333', comuna: 'Ñuñoa', banco: 'BCI', tipo_cuenta: 'Cuenta vista', numero_cuenta: '22223333' }, base2));
    db.baristas.push(Object.assign({ id: 'u-caro', nombre: 'Caro Prueba', rut: '10.000.013-K', correo: 'caro@ejemplo.cl', telefono: '+56944445555', comuna: 'Providencia', banco: 'Banco Estado', tipo_cuenta: 'Cuenta RUT', numero_cuenta: '44445555' }, base2));
    var Q = function (id, bar, extra) { db.postulaciones.push(Object.assign({ id: id, evento_id: 'e31', barista_id: bar, estado: 'confirmada', creado_en: new Date().toISOString(), asistencia_confirmada_en: new Date().toISOString(),
      boleta_honorarios_recibida_en: null, boleta_honorarios_folio: null, honorarios_pagados_en: null, boleta_declarada_en: null, boleta_declarada_folio: null }, extra || {})); };
    Q('q1', 'u-bea', { boleta_declarada_en: new Date(Date.now() - 36e5).toISOString(), boleta_declarada_folio: 'B-77' }); Q('q2', 'u-caro');
    db.eventos.push({ id: 'e32', nombre: 'Servicio de barra · Por confirmar', fecha: iso(30), hora_inicio: '18:00:00', hora_fin: '23:30:00', comuna: 'Por confirmar', lugar: null, descripcion: null, baristas_necesarios: 2, pago_manual: null, estado: 'abierto' });
    db.evento_seguimiento.push({ evento_id: 'e32', checklist: {}, origen: 'calendario', revisar: true, revisar_motivo: 'Falta el lugar en el calendario. No se reconoció la comuna', gcal_id: 'g32' });
  }
  var sesion = S.sesion ? { user: { id: S.sesion.id, email: S.sesion.email } } : null;
  if (S.perfilPropio) db.baristas.push(Object.assign({ id: S.sesion.id, correo: S.sesion.email, acepta_boleta: true, acepta_boleta_texto: cfg.texto_boleta, acepta_privacidad: true, cuenta_propia: true, aceptado_en: new Date().toISOString() }, S.perfilPropio));
  var uid = function () { return sesion && sesion.user.id; };
  var esAdmin = function () { return !!(S.admin && sesion); };
  var tienePost = function (ev) { return db.postulaciones.some(function (p) { return p.evento_id === ev && p.barista_id === uid(); }); };
  var calc = function (e) {
    var a = e.hora_inicio.split(':'), b = e.hora_fin.split(':'); var m = (b[0] * 60 + +b[1]) - (a[0] * 60 + +a[1]); if (m <= 0) m += 1440; var horas = m / 60;
    var regla = horas <= cfg.corto_max_horas ? cfg.corto_monto : horas <= cfg.medio_max_horas ? cfg.medio_monto : Math.round(horas * cfg.tarifa_hora); var liq = e.pago_manual !== null ? e.pago_manual : Math.min(regla, cfg.tope_dia);
    return Object.assign({}, e, { horas: horas, pago_liquido: liq, monto_boleta: Math.round(liq / (1 - cfg.retencion)), retencion: cfg.retencion, pago_sin_tope: e.pago_manual !== null ? e.pago_manual : regla });
  };
  var seguimientoFila = function (e) {
    var dias = Math.round((new Date(e.fecha + 'T12:00:00') - new Date(iso(0) + 'T12:00:00')) / 864e5);
    var ps = db.postulaciones.filter(function (p) { return p.evento_id === e.id; });
    var asig = ps.filter(function (p) { return p.estado === 'confirmada'; });
    var reconf = asig.filter(function (p) { return p.asistencia_confirmada_en; }).length;
    var s = db.evento_seguimiento.filter(function (x) { return x.evento_id === e.id; })[0] || {};
    var faltan = Math.max(e.baristas_necesarios - asig.length, 0);
    var bolP = asig.filter(function (p) { return !p.boleta_honorarios_recibida_en && !p.boleta_declarada_en; }).length, pagP = asig.filter(function (p) { return !p.honorarios_pagados_en; }).length;
    var docP = !s.documento_cliente_emitido_en, realizado = dias < 0;
    var sem = null;
    if (!(e.estado === 'borrador' || e.estado === 'cancelado' || realizado)) {
      sem = (faltan > 0 && dias <= cfg.dias_alerta_baristas) || (asig.length > reconf && dias <= cfg.dias_alerta_reconfirmar) ? 'alerta' : (faltan > 0 || asig.length > reconf ? 'pendiente' : 'ok');
    }
    var porCerrar = realizado && e.estado !== 'cancelado' && asig.length > 0 && (bolP > 0 || pagP > 0 || docP);
    return { evento_id: e.id, nombre: e.nombre, fecha: e.fecha, hora_inicio: e.hora_inicio, hora_fin: e.hora_fin, estado: e.estado, baristas_necesarios: e.baristas_necesarios,
      dias_restantes: dias, asignados: asig.length, reconfirmados: reconf, postulantes: ps.filter(function (p) { return p.estado === 'postulada'; }).length, faltan: faltan, semaforo: sem,
      realizado: realizado, dias_desde_evento: realizado ? -dias : null, boletas_pendientes: bolP, pagos_pendientes: pagP, documento_cliente_pendiente: docP,
      documento_cliente_emitido_en: s.documento_cliente_emitido_en || null, documento_cliente_folio: s.documento_cliente_folio || null, por_cerrar: porCerrar,
      cierre_atrasado: porCerrar && -dias > cfg.dias_alerta_cierre, checklist_hechos: Object.keys(s.checklist || {}).length, checklist_total: cfg.checklist_items.length };
  };
  window.__log = [];
  function visible(t, r) {
    if (esAdmin()) return true;
    if (t === 'baristas') return r.id === uid();
    if (t === 'eventos' || t === 'eventos_vista') { var perfil = db.baristas.some(function (b) { return b.id === uid(); }); return perfil && r.estado !== 'borrador' && (r.estado === 'abierto' || tienePost(r.id)); }
    if (t === 'postulaciones') return r.barista_id === uid();
    if (t === 'evento_direcciones') return db.postulaciones.some(function (p) { return p.evento_id === r.evento_id && p.barista_id === uid() && p.estado === 'confirmada'; });
    if (t === 'evento_privado' || t === 'evento_seguimiento' || t === 'seguimiento_vista' || t === 'automatizacion') return false;
    return true;
  }
  function from(t) {
    var q = { t: t, op: 'select', filters: [], orders: [], body: null, single: null };
    var api = {
      select: function () { return api; }, insert: function (b) { q.op = 'insert'; q.body = b; return api; }, update: function (b) { q.op = 'update'; q.body = b; return api; },
      upsert: function (b) { q.op = 'upsert'; q.body = b; return api; }, delete: function () { q.op = 'delete'; return api; },
      eq: function (c, v) { q.filters.push(function (r) { return r[c] === v; }); return api; },
      order: function (c, o) { q.orders.push([c, !o || o.ascending !== false]); return api; },
      single: function () { q.single = 'single'; return api; }, maybeSingle: function () { q.single = 'maybe'; return api; },
      then: function (res, rej) { return new Promise(function (ok) { setTimeout(function () { ok(run()); }, 5); }).then(res, rej); }
    };
    function run() {
      var base = (t === 'eventos_vista' || t === 'seguimiento_vista') ? 'eventos' : t; var tabla = db[base];
      window.__log.push(q.op + ' ' + t);
      var filas = tabla.filter(function (r) { return q.filters.every(function (f) { return f(r); }); });
      if (q.op === 'select') {
        filas = filas.filter(function (r) { return visible(t, r); });
        if (t === 'eventos_vista') filas = filas.map(calc);
        if (t === 'seguimiento_vista') filas = esAdmin() ? filas.map(seguimientoFila) : [];
        q.orders.slice().reverse().forEach(function (o) { filas.sort(function (a, b) { return (a[o[0]] > b[o[0]] ? 1 : a[o[0]] < b[o[0]] ? -1 : 0) * (o[1] ? 1 : -1); }); });
        return done(filas);
      }
      if (q.op === 'insert') {
        var b = Object.assign({}, q.body);
        if (t === 'baristas') { if (b.id !== uid()) return err('rls'); if (db.baristas.some(function (x) { return x.rut === b.rut; })) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "baristas_rut_key"' } }; b.acepta_boleta_texto = cfg.texto_boleta; b.aceptado_en = new Date().toISOString(); }
        if (t === 'postulaciones') { if (!esAdmin() && b.barista_id !== uid()) return err('rls'); b.id = 'p' + (db.postulaciones.length + 1); b.estado = 'postulada'; b.creado_en = new Date().toISOString(); }
        if (t === 'eventos') { if (!esAdmin()) return err('rls'); b.id = 'e' + (db.eventos.length + 1); }
        tabla.push(b); return done([b]);
      }
      if (q.op === 'upsert') {
        var k = t === 'evento_privado' || t === 'evento_direcciones' || t === 'evento_seguimiento' ? 'evento_id' : 'id'; var ex = tabla.filter(function (r) { return r[k] === q.body[k]; })[0];
        if (!esAdmin()) return err('rls'); if (ex) Object.assign(ex, q.body); else tabla.push(Object.assign({}, q.body)); return done([q.body]);
      }
      if (q.op === 'update') {
        filas = filas.filter(function (r) { return esAdmin() || visible(t, r); });
        if (!esAdmin() && t !== 'postulaciones' && t !== 'baristas') return err('rls');
        if (t === 'postulaciones' && q.body.boleta_declarada_en && filas.some(function (r) {      // como el trigger de la base
          var evp = db.eventos.filter(function (e) { return e.id === r.evento_id; })[0];
          return r.estado !== 'confirmada' || evp.fecha > iso(0);
        })) return err('La boleta se declara desde el día del evento, estando asignado');
        filas.forEach(function (r) {
          var b = Object.assign({}, q.body);
          if (t === 'postulaciones') {
            if (!esAdmin()) { delete b.boleta_honorarios_recibida_en; delete b.boleta_honorarios_folio; delete b.honorarios_pagados_en; }
            if (b.asistencia_confirmada_en) b.asistencia_confirmada_en = new Date().toISOString();
            if (b.boleta_declarada_en) b.boleta_declarada_en = new Date().toISOString();
            var nuevoEstado = b.estado || r.estado;
            if (nuevoEstado !== 'confirmada') b.asistencia_confirmada_en = null;
          }
          Object.assign(r, b);
        });
        return done(filas);
      }
      if (q.op === 'delete') {
        filas = filas.filter(function (r) { return esAdmin() || visible(t, r); });
        filas.forEach(function (r) { tabla.splice(tabla.indexOf(r), 1); });
        if (t === 'baristas') db.postulaciones = db.postulaciones.filter(function (p) { return db.baristas.some(function (b) { return b.id === p.barista_id; }); });
        if (t === 'eventos') db.postulaciones = db.postulaciones.filter(function (p) { return db.eventos.some(function (e) { return e.id === p.evento_id; }); });
        return done(filas);
      }
    }
    function err(m) { return { data: null, error: { message: 'row-level security: ' + m } }; }
    function done(filas) {
      if (q.single === 'single') return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: 'no rows' } };
      if (q.single === 'maybe') return { data: filas[0] || null, error: null };
      return { data: filas, error: null };
    }
    return api;
  }
  window.supabase = { createClient: function () {
    return {
      from: from,
      rpc: function (n) { return Promise.resolve({ data: n === 'es_admin' ? esAdmin() : null, error: null }); },
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: sesion }, error: null }); },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        signInWithOtp: function (a) { window.__otp = a; return Promise.resolve({ error: /limite/.test(a.email) ? { message: 'email rate limit exceeded' } : null }); },
        verifyOtp: function (a) {
          if (a.token !== '123456') return Promise.resolve({ data: {}, error: { message: 'Token has expired or is invalid' } });
          sesion = { user: { id: S.nuevoId || 'u-nuevo', email: a.email } }; return Promise.resolve({ data: { session: sesion }, error: null });
        },
        signOut: function () { sesion = null; return Promise.resolve({ error: null }); }
      }
    };
  } };
})();
