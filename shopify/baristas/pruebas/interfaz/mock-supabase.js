// Simulación mínima de supabase-js para probar la interfaz sin red. Las reglas de
// seguridad reales se prueban aparte, en Postgres (pruebas/rls.sql).
(function () {
  var S = window.__ESC || {};
  // Las fechas se cuentan desde «hoy» en Santiago, como hace la base y el portal (de noche difiere de la de UTC).
  var iso = function (d) {
    var base = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    var x = new Date(base + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10);
  };
  var cfg = { id: 1, tarifa_hora: 10000, corto_max_horas: 2, corto_monto: 25000, medio_max_horas: 4, medio_monto: 40000, retencion: 0.1525, tope_dia: 70000, dias_alerta_baristas: 7, dias_alerta_reconfirmar: 4, dias_alerta_cierre: 7, dias_publicacion: 14, rendimiento_km_l: 10, precio_litro: 1400,
    checklist_items: [{clave:'grupo_whatsapp',texto:'Grupo de WhatsApp creado'},{clave:'direccion_hora',texto:'Dirección y hora enviadas a los baristas'},{clave:'equipo',texto:'Equipo y materiales listos'},{clave:'transporte',texto:'Transporte y recolección coordinados'},{clave:'cliente_confirmo',texto:'Cliente confirmó hora y lugar'}],
    texto_boleta: 'Declaro que puedo emitir boleta de honorarios electrónica por los servicios que preste en los eventos de Sepia Coffee.',
    texto_privacidad: 'Sepia Coffee usa mis datos solo para coordinar los eventos y pagarme. Los ve únicamente Sepia Coffee, y puedo pedir que los borre en cualquier momento.' };
  var db = window.__DB = {
    config: [cfg], baristas: [], postulaciones: [], evento_privado: [], evento_direcciones: [], evento_seguimiento: [], accesos: [], evento_traslado: [],
    automatizacion: [{ id: 1, ultima_sync_en: S.sinSync ? null : new Date(Date.now() - (S.syncViejo ? 80 : 3) * 36e5).toISOString(),
      ultima_sync_resumen: S.sinSync ? null : { recibidos: 20, creados: ['a', 'b'], cambiados: ['c'], cancelados: [], por_revisar: [], errores: [], advertencia: S.syncAdvertencia || null } }],
    eventos: [
      { id: 'e1', nombre: 'Matrimonio en Pirque', fecha: iso(10), hora_inicio: '18:00:00', hora_fin: '23:00:00', comuna: 'Pirque', lugar: 'Viña', descripcion: 'Tenida negra', baristas_necesarios: 2, pago_manual: null, estado: 'abierto' },
      { id: 'e2', nombre: 'Coffee break empresa', fecha: iso(12), hora_inicio: '09:00:00', hora_fin: '11:00:00', comuna: 'Las Condes', lugar: null, descripcion: null, baristas_necesarios: 1, pago_manual: null, estado: 'abierto' },
      { id: 'e3', nombre: 'Cumpleaños', fecha: iso(14), hora_inicio: '16:00:00', hora_fin: '19:00:00', comuna: 'Ñuñoa', lugar: null, descripcion: null, baristas_necesarios: 1, pago_manual: null, estado: 'abierto' },
      { id: 'e4', nombre: 'Borrador secreto', fecha: iso(20), hora_inicio: '16:00:00', hora_fin: '19:00:00', comuna: 'Santiago', lugar: null, descripcion: null, baristas_necesarios: 1, pago_manual: null, estado: 'borrador' },
      { id: 'e6', nombre: 'Evento lejano', fecha: iso(40), hora_inicio: '16:00:00', hora_fin: '19:00:00', comuna: 'Colina', lugar: null, descripcion: null, baristas_necesarios: 2, pago_manual: null, estado: 'abierto' },
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
  var baseB = { acepta_boleta: true, acepta_boleta_texto: cfg.texto_boleta, acepta_privacidad: true, cuenta_propia: true, aceptado_en: new Date().toISOString(), experiencia: null, talla_camisa: 'M', tiene_camioneta: false, foto_path: null, turnos_previos: 0 };
  var PX = function (id, ev, bar, extra) { db.postulaciones.push(Object.assign({ id: id, evento_id: ev, barista_id: bar, estado: 'confirmada', creado_en: new Date().toISOString(), asistencia_confirmada_en: new Date().toISOString(), boleta_honorarios_recibida_en: null, boleta_honorarios_folio: null, honorarios_pagados_en: null, boleta_declarada_en: null, boleta_declarada_folio: null, asistio: null, conductor: false, traslado_estacionamiento: null, traslado_pagado_en: null }, extra || {})); };
  if (S.equipo) {       // la barista de la sesión (u-ana): equipo en un evento, conductora en otro, ranking con otras dos personas
    var evq = { lugar: 'Salón', descripcion: null, pago_manual: null, estado: 'abierto', comuna: 'Santiago', hora_inicio: '18:00:00', hora_fin: '22:00:00', baristas_necesarios: 3 };
    [['e41', 'Evento con equipo', 5, false], ['e42', 'Evento con camioneta', 7, true], ['e43', 'Pasado uno', -10, false], ['e44', 'Pasado dos', -20, false], ['e45', 'Pasado tres', -40, false]].forEach(function (x) {
      db.eventos.push(Object.assign({}, evq, { id: x[0], nombre: x[1], fecha: iso(x[2]), requiere_camioneta: x[3] }));
    });
    if (!S.perfilPropio) db.baristas.push(Object.assign({}, baseB, { id: 'u-ana', nombre: 'Ana Prueba', rut: '11.111.111-1', correo: 'ana@ejemplo.cl', telefono: '+56911110001', comuna: 'Vitacura', banco: 'BCI', tipo_cuenta: 'Cuenta vista', numero_cuenta: '11110001', tiene_camioneta: true }));
    db.baristas.push(Object.assign({}, baseB, { id: 'u-bea', nombre: 'Bea Prueba', rut: '12.345.678-5', correo: 'bea@ejemplo.cl', telefono: '+56922223333', comuna: 'Ñuñoa', banco: 'BCI', tipo_cuenta: 'Cuenta vista', numero_cuenta: '22223333', foto_path: 'u-bea/foto.jpg', tiene_camioneta: true, turnos_previos: 0 }));
    db.baristas.push(Object.assign({}, baseB, { id: 'u-caro', nombre: 'Caro Prueba', rut: '10.000.013-K', correo: 'caro@ejemplo.cl', telefono: '+56944445555', comuna: 'Providencia', banco: 'Banco Estado', tipo_cuenta: 'Cuenta RUT', numero_cuenta: '44445555', turnos_previos: 12 }));
    PX('x1', 'e41', 'u-ana'); PX('x2', 'e41', 'u-bea'); PX('x3', 'e41', 'u-caro');
    PX('x4', 'e42', 'u-ana', { conductor: true, traslado_estacionamiento: 2000 }); PX('x5', 'e42', 'u-bea');
    PX('x6', 'e43', 'u-ana', { asistio: true }); PX('x7', 'e43', 'u-bea', { asistio: true }); PX('x8', 'e43', 'u-caro', { asistio: true });
    PX('x9', 'e44', 'u-ana', { asistio: true }); PX('x10', 'e44', 'u-bea', { asistio: true });
    PX('x11', 'e45', 'u-ana', { asistio: true }); PX('x12', 'e45', 'u-bea', { asistio: false });
    db.evento_traslado.push({ evento_id: 'e42', km: 40, tag: 3500 });
  }
  if (S.accesosAdmin) { // administración: accesos en distintos estados
    db.accesos.push({ id: 'u-camila', usuario: 'camila.perez', nombre: 'Camila Pérez González', activo: true, debe_cambiar_clave: true });
    db.accesos.push({ id: 'u-bea', usuario: 'bea.prueba', nombre: 'Bea Prueba', activo: true, debe_cambiar_clave: false });
    db.baristas.push(Object.assign({}, baseB, { id: 'u-bea', nombre: 'Bea Prueba', rut: '12.345.678-5', correo: 'bea@ejemplo.cl', telefono: '+56922223333', comuna: 'Ñuñoa', banco: 'BCI', tipo_cuenta: 'Cuenta vista', numero_cuenta: '22223333', tiene_camioneta: true, turnos_previos: 4 }));
    db.accesos.push({ id: 'u-caro', usuario: 'caro.prueba', nombre: 'Caro Prueba', activo: false, debe_cambiar_clave: false });
    db.accesos.push({ id: 'u-dani', usuario: 'dani.prueba', nombre: 'Dani Prueba', activo: true, debe_cambiar_clave: false });
  }
  var sesion = S.sesion ? { user: { id: S.sesion.id, email: S.sesion.email } } : null;
  // Cuenta de administración con clave: claveAdmin = 'sin' (no tiene clave), 'inactiva' (tiene clave pero no la activó) o 'activa'.
  var AC = S.claveAdmin ? { email: 'admin@ejemplo.cl', id: 'u-admin', clave: S.claveAdmin === 'sin' ? null : 'clave-admin-larga', activa: S.claveAdmin === 'activa' } : null;
  window.__AC = AC;
  if (S.perfilPropio) db.baristas.push(Object.assign({ id: S.sesion.id, correo: S.sesion.email, acepta_boleta: true, acepta_boleta_texto: cfg.texto_boleta, acepta_privacidad: true, cuenta_propia: true, aceptado_en: new Date().toISOString() }, S.perfilPropio));
  // Todo barista tiene un acceso activo (salvo que el escenario ya lo definió). Y los usuarios de ID y clave de la prueba.
  var slug = function (n) { return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.'); };
  db.baristas.forEach(function (b) {
    if (!db.accesos.some(function (a) { return a.id === b.id; })) db.accesos.push({ id: b.id, usuario: slug(b.nombre) || b.id, nombre: b.nombre, activo: true, debe_cambiar_clave: false });
  });
  // Historial anterior al portal: filas {nombre, fecha, evento}; un nombre que calza con un solo acceso queda unido.
  var claveNombre = function (t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  db.historial_turnos = (S.historial || []).map(function (x) { return { nombre: x.nombre, fecha: x.fecha, evento: x.evento || null, acceso_id: null }; });
  var vincularAuto = function () {
    var n = 0;
    db.historial_turnos.forEach(function (hx) {
      if (hx.acceso_id) return;
      var hc = claveNombre(hx.nombre);
      var exactos = db.accesos.filter(function (a) { return claveNombre(a.nombre) === hc; });
      var cand = exactos.length ? exactos : (hc.indexOf(' ') > 0 ? db.accesos.filter(function (a) { return claveNombre(a.nombre).indexOf(hc + ' ') === 0; }) : []);
      if (cand.length === 1) { hx.acceso_id = cand[0].id; n++; }
    });
    return n;
  };
  vincularAuto();
  var usuarios = window.__USUARIOS = [];
  (S.usuarios || []).forEach(function (u) {
    var id = u.id || 'u-' + u.usuario;
    usuarios.push({ usuario: u.usuario, clave: u.clave, id: id });
    if (!db.accesos.some(function (a) { return a.id === id; })) db.accesos.push({ id: id, usuario: u.usuario, nombre: u.nombre, activo: u.activo !== false, debe_cambiar_clave: u.debeCambiar !== false });
  });
  var uid = function () { return sesion && sesion.user.id; };
  var esAdmin = function () {
    if (!(S.admin && sesion)) return false;
    if (!AC) return true;
    return sesion.user.email === AC.email && (sesion.metodo !== 'password' || AC.activa);
  };
  var accesoActivo = function () { return db.accesos.some(function (a) { return a.id === uid() && a.activo; }); };
  var esBarista = function () { return accesoActivo() && db.baristas.some(function (b) { return b.id === uid(); }); };
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
    if (t === 'baristas') return r.id === uid() && accesoActivo();
    if (t === 'accesos') return r.id === uid();
    if (t === 'eventos' || t === 'eventos_vista') { var perfil = esBarista(); return perfil && r.estado !== 'borrador' && (tienePost(r.id) || (r.estado === 'abierto' && r.fecha <= iso(cfg.dias_publicacion))); }
    if (t === 'postulaciones') return r.barista_id === uid() && esBarista();
    if (t === 'evento_direcciones') return db.postulaciones.some(function (p) { return p.evento_id === r.evento_id && p.barista_id === uid() && p.estado === 'confirmada'; });
    if (t === 'evento_privado' || t === 'evento_seguimiento' || t === 'seguimiento_vista' || t === 'automatizacion' || t === 'evento_traslado') return false;
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
      then: function (res, rej) { window.__peticiones = (window.__peticiones || 0) + 1; return new Promise(function (ok) { setTimeout(function () { ok(run()); }, S.latencia || 5); }).then(res, rej); }
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
        if (t === 'baristas') { if (b.id !== uid() || !accesoActivo()) return err('rls'); b.turnos_previos = 0; b.foto_path = null; if (db.baristas.some(function (x) { return x.rut === b.rut; })) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "baristas_rut_key"' } }; b.acepta_boleta_texto = cfg.texto_boleta; b.aceptado_en = new Date().toISOString(); }
        if (t === 'postulaciones') { if (!esAdmin() && b.barista_id !== uid()) return err('rls');
          var evx = db.eventos.filter(function (e) { return e.id === b.evento_id; })[0];
          if (!esAdmin() && !(evx && evx.estado === 'abierto' && evx.fecha >= iso(0) && evx.fecha <= iso(cfg.dias_publicacion))) return err('rls: el evento no está abierto'); b.id = 'p' + (db.postulaciones.length + 1); b.estado = 'postulada'; b.creado_en = new Date().toISOString(); }
        if (t === 'eventos') { if (!esAdmin()) return err('rls'); b.id = 'e' + (db.eventos.length + 1); }
        tabla.push(b); return done([b]);
      }
      if (q.op === 'upsert') {
        var k = t === 'evento_privado' || t === 'evento_direcciones' || t === 'evento_seguimiento' || t === 'evento_traslado' ? 'evento_id' : 'id'; var ex = tabla.filter(function (r) { return r[k] === q.body[k]; })[0];
        if (!esAdmin()) return err('rls'); if (ex) Object.assign(ex, q.body); else tabla.push(Object.assign({}, q.body)); return done([q.body]);
      }
      if (q.op === 'update') {
        filas = filas.filter(function (r) { return esAdmin() || visible(t, r); });
        if (!esAdmin() && t !== 'postulaciones' && t !== 'baristas') return err('rls');
        if (t === 'postulaciones' && q.body.boleta_declarada_en && filas.some(function (r) {      // como el trigger de la base
          var evp = db.eventos.filter(function (e) { return e.id === r.evento_id; })[0];
          return r.estado !== 'confirmada' || evp.fecha > iso(0);
        })) return err('La boleta se declara desde el día del evento, estando asignado');
        if (t === 'baristas' && !esAdmin() && q.body.foto_path && String(q.body.foto_path).indexOf(uid() + '/') !== 0) return err('la foto tiene que estar en tu carpeta');
        if (t === 'postulaciones' && esAdmin() && q.body.conductor === true) {      // como el trigger y el índice único
          var malo = filas.filter(function (r) { var bb = db.baristas.filter(function (x) { return x.id === r.barista_id; })[0]; return !bb || !bb.tiene_camioneta; })[0];
          if (malo) return err('Esa persona no declaró tener camioneta');
          if (filas.some(function (r) { return db.postulaciones.some(function (o) { return o.evento_id === r.evento_id && o.conductor && o.id !== r.id; }); })) return err('duplicate key: ya hay conductor en el evento');
        }
        filas.forEach(function (r) {
          var b = Object.assign({}, q.body);
          if (t === 'baristas' && !esAdmin()) delete b.turnos_previos;
          if (t === 'postulaciones') {
            if (!esAdmin()) { delete b.boleta_honorarios_recibida_en; delete b.boleta_honorarios_folio; delete b.honorarios_pagados_en; delete b.asistio; delete b.conductor; delete b.traslado_estacionamiento; delete b.traslado_pagado_en; }
            if (b.estado && b.estado !== 'confirmada') { b.conductor = false; b.asistio = null; }
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
  // ---- funciones de la base (las mismas reglas que esquema.sql, en pequeño) ----
  var fallo = function (m) { return { data: null, error: { message: m } }; };
  var evPorId = function (id) { return db.eventos.filter(function (e) { return e.id === id; })[0]; };
  window.__rpc = [];
  var RPC = {
    es_admin: function () { return esAdmin(); },
    admin_clave_activa: function () {
      if (S.sinFuncionClave) return fallo('Could not find the function public.admin_clave_activa without parameters in the schema cache');
      if (!AC) return true;
      return esAdmin() ? AC.activa : false;
    },
    admin_activar_clave: function (a) {
      if (!AC) return null;
      if (!sesion || sesion.user.email !== AC.email) return fallo('Solo la administración cambia su entrada con clave');
      if (a.p_activa && sesion.metodo === 'password') return fallo('Para activar la clave hay que entrar con un código por correo');
      AC.activa = !!a.p_activa; return null;
    },
    acceso_clave_cambiada: function () { var a = db.accesos.filter(function (x) { return x.id === uid(); })[0]; if (a) a.debe_cambiar_clave = false; return null; },
    crear_acceso: function (a) {
      if (!esAdmin()) return fallo('Solo la administración crea accesos');
      var u = String(a.p_usuario || '').toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) return fallo('El ID debe tener de 3 a 30 caracteres: letras sin tilde, números, punto, guion o guion bajo.');
      if (db.accesos.some(function (x) { return x.usuario === u; })) return fallo('Ese ID ya existe. Prueba con otro.');
      var id = 'u-' + u;
      db.accesos.push({ id: id, usuario: u, nombre: a.p_nombre, activo: true, debe_cambiar_clave: true });
      usuarios.push({ usuario: u, clave: 'abcd-efgh-jkmn', id: id });
      vincularAuto();
      return { id: id, usuario: u, clave: 'abcd-efgh-jkmn' };
    },
    restablecer_clave: function (a) {
      if (!esAdmin()) return fallo('Solo la administración restablece claves');
      var ac = db.accesos.filter(function (x) { return x.id === a.p_acceso; })[0]; if (!ac) return fallo('No existe ese acceso');
      ac.debe_cambiar_clave = true;
      usuarios.forEach(function (u) { if (u.id === ac.id) u.clave = 'wxyz-2345-mnpq'; });
      if (!usuarios.some(function (u) { return u.id === ac.id; })) usuarios.push({ usuario: ac.usuario, clave: 'wxyz-2345-mnpq', id: ac.id });
      return 'wxyz-2345-mnpq';
    },
    cambiar_estado_acceso: function (a) {
      if (!esAdmin()) return fallo('Solo la administración cambia accesos');
      var ac = db.accesos.filter(function (x) { return x.id === a.p_acceso; })[0]; if (!ac) return fallo('No existe ese acceso');
      ac.activo = !!a.p_activo; return null;
    },
    eliminar_acceso: function (a) {
      if (!esAdmin()) return fallo('Solo la administración elimina accesos');
      db.accesos = db.accesos.filter(function (x) { return x.id !== a.p_acceso; });
      db.baristas = db.baristas.filter(function (x) { return x.id !== a.p_acceso; });
      db.postulaciones = db.postulaciones.filter(function (x) { return x.barista_id !== a.p_acceso; });
      db.historial_turnos.forEach(function (hx) { if (hx.acceso_id === a.p_acceso) hx.acceso_id = null; });
      return null;
    },
    historial_resumen: function () {
      var g = {};
      db.historial_turnos.forEach(function (hx) {
        if (!(esAdmin() || (hx.acceso_id && hx.acceso_id === uid() && esBarista()))) return;
        var k = claveNombre(hx.nombre) + '|' + (hx.acceso_id || '');
        var x = g[k] || (g[k] = { nombre: hx.nombre, acceso_id: hx.acceso_id, turnos: 0, desde: hx.fecha, hasta: hx.fecha });
        x.turnos++; if (hx.fecha < x.desde) x.desde = hx.fecha; if (hx.fecha > x.hasta) x.hasta = hx.fecha;
      });
      return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
    },
    vincular_historial: function (a) {
      if (!esAdmin()) return fallo('Solo la administración vincula el historial');
      if (a.p_acceso && !db.accesos.some(function (x) { return x.id === a.p_acceso; })) return fallo('No existe ese acceso');
      var n = 0;
      db.historial_turnos.forEach(function (hx) { if (claveNombre(hx.nombre) === claveNombre(a.p_nombre)) { hx.acceso_id = a.p_acceso || null; n++; } });
      return n;
    },
    equipo_evento: function (a) {
      var yoAsignado = db.postulaciones.some(function (p) { return p.evento_id === a.p_evento && p.barista_id === uid() && p.estado === 'confirmada'; });
      if (!(esAdmin() || (esBarista() && yoAsignado))) return [];
      return db.postulaciones.filter(function (p) { return p.evento_id === a.p_evento && p.estado === 'confirmada'; }).map(function (p) {
        var b = db.baristas.filter(function (x) { return x.id === p.barista_id; })[0] || {};
        return { barista_id: p.barista_id, nombre: b.nombre, foto_path: b.foto_path || null, conductor: !!p.conductor };
      }).sort(function (x, y) { return String(x.nombre).localeCompare(String(y.nombre), 'es'); });
    },
    ranking_equipo: function (a) {
      if (!(esBarista() || esAdmin())) return [];
      var desde = a.p_desde || null, hasta = a.p_hasta || null;
      var dentro = function (f) { return !((desde && f < desde) || (hasta && f > hasta)); };
      var filas = db.accesos.filter(function (x) { return x.activo; }).map(function (x) {
        var b = db.baristas.filter(function (y) { return y.id === x.id; })[0] || null;
        var n = (b && !desde && !hasta) ? (b.turnos_previos || 0) : 0;
        db.historial_turnos.forEach(function (hx) { if (hx.acceso_id === x.id && dentro(hx.fecha)) n++; });
        db.postulaciones.forEach(function (p) {
          if (p.barista_id !== x.id || p.estado !== 'confirmada' || p.asistio !== true) return;
          var e = evPorId(p.evento_id); if (!e || e.estado === 'cancelado' || !dentro(e.fecha)) return;
          n++;
        });
        return { barista_id: x.id, nombre: b ? b.nombre : x.nombre, foto_path: (b && b.foto_path) || null, turnos: n, conPerfil: !!b };
      }).filter(function (f) { return f.conPerfil || f.turnos > 0; });
      filas.forEach(function (f) { f.puesto = 1 + filas.filter(function (o) { return o.turnos > f.turnos; }).length; delete f.conPerfil; });
      return filas.sort(function (x, y) { return x.puesto - y.puesto || String(x.nombre).localeCompare(String(y.nombre), 'es'); });
    },
    traslados: function () {
      return db.postulaciones.filter(function (p) { return p.conductor && p.estado === 'confirmada' && (esAdmin() || (p.barista_id === uid() && esBarista())); }).map(function (p) {
        var t = db.evento_traslado.filter(function (x) { return x.evento_id === p.evento_id; })[0] || {};
        var benc = t.km == null ? null : Math.round(t.km / cfg.rendimiento_km_l * cfg.precio_litro);
        return { postulacion_id: p.id, evento_id: p.evento_id, barista_id: p.barista_id, km: t.km == null ? null : t.km, tag: t.tag == null ? null : t.tag, bencina: benc,
          estacionamiento: p.traslado_estacionamiento || 0, total: (benc == null || t.tag == null) ? null : benc + t.tag + (p.traslado_estacionamiento || 0),
          pagado_en: p.traslado_pagado_en || null, completo: t.km != null && t.tag != null };
      });
    }
  };
  var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  window.__STORAGE = {};
  window.supabase = { createClient: function () {
    return {
      from: from,
      rpc: function (n, args) {
        window.__peticiones = (window.__peticiones || 0) + 1;
        return new Promise(function (ok) { setTimeout(ok, S.latencia || 0); }).then(function () {
          window.__rpc.push(n);
          var f = RPC[n]; var r = f ? f(args || {}) : null;
          return r && r.error ? r : { data: r, error: null };
        });
      },
      storage: { from: function (bucket) {
        return {
          upload: function (ruta, blob, opciones) {
            return Promise.resolve().then(function () {
              if (!esBarista() || ruta.indexOf(uid() + '/') !== 0) return { data: null, error: { message: 'new row violates row-level security policy' } };
              if (blob.size > 2 * 1024 * 1024) return { data: null, error: { message: 'The object exceeded the maximum allowed size' } };
              window.__STORAGE[ruta] = { size: blob.size, type: (opciones && opciones.contentType) || blob.type };
              return { data: { path: ruta }, error: null };
            });
          },
          createSignedUrls: function (rutas) {
            window.__peticiones = (window.__peticiones || 0) + 1;
            return new Promise(function (ok) { setTimeout(ok, S.latencia || 0); }).then(function () { return { data: rutas.map(function (r) { return { path: r, signedUrl: PNG, error: null }; }), error: null }; });
          },
          remove: function (rutas) {
            rutas.forEach(function (r) { delete window.__STORAGE[r]; });
            return Promise.resolve({ data: rutas.map(function (r) { return { name: r }; }), error: null });
          }
        };
      } },
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: sesion }, error: null }); },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        signInWithPassword: function (a) {
          window.__signIn = (window.__signIn || []).concat([a]);
          if (AC && a.email === AC.email) {
            if (!AC.clave || AC.clave !== a.password) return Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } });
            sesion = { user: { id: AC.id, email: AC.email }, metodo: 'password' };
            return Promise.resolve({ data: { session: sesion }, error: null });
          }
          var usuario = String(a.email || '').split('@')[0], dominio = String(a.email || '').split('@')[1];
          var u = dominio === 'equipo.sepiacoffee.cl' ? usuarios.filter(function (x) { return x.usuario === usuario; })[0] : (sesion && sesion.user.email === a.email ? usuarios.filter(function (x) { return x.id === sesion.user.id; })[0] : null);
          if (!u || u.clave !== a.password) return Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } });
          var ac = db.accesos.filter(function (x) { return x.id === u.id; })[0];
          if (ac && !ac.activo) return Promise.resolve({ data: {}, error: { message: 'User is banned' } });
          sesion = { user: { id: u.id, email: u.usuario + '@equipo.sepiacoffee.cl' } };
          return Promise.resolve({ data: { session: sesion }, error: null });
        },
        updateUser: function (a) {
          if (!sesion) return Promise.resolve({ data: {}, error: { message: 'Auth session missing!' } });
          var u = usuarios.filter(function (x) { return x.id === sesion.user.id; })[0];
          if (a.password && a.password.length < 6) return Promise.resolve({ data: {}, error: { message: 'Password should be at least 6 characters.' } });
          if (AC && sesion.user.email === AC.email) {
            if (a.password === AC.clave) return Promise.resolve({ data: {}, error: { message: 'New password should be different from the old password.' } });
            AC.clave = a.password; window.__claveCambiada = a.password;
            return Promise.resolve({ data: { user: sesion.user }, error: null });
          }
          if (u && a.password === u.clave) return Promise.resolve({ data: {}, error: { message: 'New password should be different from the old password.' } });
          if (u) u.clave = a.password;
          window.__claveCambiada = a.password;
          return Promise.resolve({ data: { user: sesion.user }, error: null });
        },
        signInWithOtp: function (a) { window.__otp = a; return Promise.resolve({ error: /limite/.test(a.email) ? { message: 'email rate limit exceeded' } : (/sinacceso/.test(a.email) ? { message: 'Signups not allowed for otp' } : null) }); },
        verifyOtp: function (a) {
          if (a.token !== '123456') return Promise.resolve({ data: {}, error: { message: 'Token has expired or is invalid' } });
          if (AC && a.email === AC.email) { sesion = { user: { id: AC.id, email: AC.email }, metodo: 'otp' }; return Promise.resolve({ data: { session: sesion }, error: null }); }
          sesion = { user: { id: S.nuevoId || 'u-nuevo', email: a.email } }; return Promise.resolve({ data: { session: sesion }, error: null });
        },
        signOut: function (o) { window.__signOut = o || { scope: 'global' }; if (!o || o.scope !== 'others') sesion = null; return Promise.resolve({ error: null }); }
      }
    };
  } };
})();
