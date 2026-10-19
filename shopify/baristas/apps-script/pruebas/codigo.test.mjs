// Pruebas de Codigo.gs. Se corren con:  node --test shopify/baristas/apps-script/pruebas/
// Todos los datos son inventados: nada de clientes ni baristas reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargar, eventoGoogle } from './arnes.mjs';

const { ctx } = cargar();
const HOY = '2026-10-19';
const plano = (x) => JSON.parse(JSON.stringify(x));   // lo que sale del script vive en otro «realm» de Node

// Un evento del calendario ya convertido (lo que entrega leerEventos_).
function ev(o) {
  const ini = o.ini || '2026-12-05T18:00', fin = o.fin || '2026-12-05T23:30';
  return {
    id: o.id || 'abc@google.com', titulo: o.titulo, descripcion: o.descripcion || '', lugar: o.lugar || '',
    inicio: { fecha: ini.slice(0, 10), hora: ini.slice(11) }, fin: { fecha: fin.slice(0, 10), hora: fin.slice(11) },
    todoElDia: !!o.todoElDia, recurrente: !!o.recurrente, rechazado: !!o.rechazado,
  };
}
const leer = (crudos, aj = {}) => ctx.interpretar_(crudos, aj, HOY);

test('servicio con la ficha completa: lugar, comuna, baristas, cliente y servicios', () => {
  const r = leer([ev({
    titulo: 'Servicio Sepia Coffee - Cliente Ficticio - NO PAGADO', lugar: 'Viña de Prueba',
    ini: '2026-11-21T16:30', fin: '2026-11-22T02:30',
    descripcion: '✅ Mensaje 2 (Registro)\n\n👉🏻 Nombre completo: Cliente Ficticio\n🔢 Rut: 11.111.111-1\n📩 Mail: cliente@ejemplo.test\n\n🗓️ Día del evento: 21/11/2026\n📍 Lugar exacto: Viña de Prueba\n🍸☕️ Servicios: Martini, carajillo y tragos (sin café)\n🕒 Hora: 19:00–19:30 (por confirmar)\n⏳ Duración: 5 horas\n📍 Lugar: Santiago\n👥 Baristas: 3\n\n💳 Datos de transferencia\nCuenta Corriente Nº 1234567890',
  })]);
  assert.equal(r.eventos.length, 1);
  const e = r.eventos[0];
  assert.equal(e.nombre, 'Servicio de barra · Viña de Prueba');
  assert.equal(e.fecha, '2026-11-21');
  assert.equal(e.hora_inicio, '16:30');
  assert.equal(e.hora_fin, '02:30');     // de madrugada: el fin es menor que el inicio y la base lo entiende
  assert.equal(e.comuna, 'Santiago');
  assert.equal(e.baristas, 3);
  assert.equal(e.cliente, 'Cliente Ficticio');
  assert.match(e.descripcion, /^Servicio de martini, carajillo y tragos \(sin café\)\./);
  assert.equal(e.pago_manual, null);
  assert.equal(e.revisar, true);
  assert.match(e.revisar_motivo, /horario está por confirmar/i);
});

test('nada privado del cliente llega a los campos que ven los baristas', () => {
  const r = leer([ev({
    titulo: 'Servicio Sepia Coffee - Cliente Ficticio - PAGADO 50%', lugar: 'Casona de Prueba, Pirque',
    descripcion: 'Nombre: Cliente Ficticio\nRUT: 11.111.111-1\nCorreo: cliente@ejemplo.test\nTotal: $650.000\nServicio: Espresso Martini\nBaristas: 2\nDatos de transferencia\nCuenta Corriente Nº 1234567890\nbanco@ejemplo.test',
  })]);
  const e = r.eventos[0];
  for (const campo of ['nombre', 'lugar', 'comuna', 'descripcion', 'revisar_motivo']) {
    const v = String(e[campo] || '');
    assert.doesNotMatch(v, /@|\$|\d{1,2}\.\d{3}\.\d{3}-[\dkK]|1234567890|Cliente Ficticio/, campo + ' = ' + v);
  }
  assert.equal(e.cliente, 'Cliente Ficticio');      // el nombre del cliente va solo en su campo privado
});

test('formato compacto de una línea con barras', () => {
  const r = leer([ev({
    titulo: 'Servicio Corner Coffee - Persona Prueba -350.000 pagado', lugar: 'Club de Prueba, Horcon, Puchuncavi',
    ini: '2026-12-05T17:30', fin: '2026-12-05T20:30',
    descripcion: 'Espresso Martini y Carajillo | 3 horas | Hora por confirmar | 2 baristas | Total $930.000 | RUT 11.111.111-1 | Mail x@ejemplo.test\n\n*horario por confirmar*',
  })]);
  const e = r.eventos[0];
  assert.equal(e.cliente, 'Persona Prueba');
  assert.equal(e.baristas, 2);
  assert.equal(e.comuna, 'Puchuncaví');
  assert.match(e.descripcion, /^Servicio de espresso Martini y Carajillo\./);
  assert.match(e.revisar_motivo, /por confirmar/i);
});

test('un evento con 🍸 y sin lugar entra, pero marcado para revisar', () => {
  const r = leer([ev({ titulo: '🍸 Persona Prueba (pagado 50%)', descripcion: '👉🏻 Nombre: Persona Prueba\nPara dos horas en una casona, sería lo siguiente' })]);
  const e = r.eventos[0];
  assert.equal(e.nombre, 'Servicio de barra · Por confirmar');
  assert.equal(e.lugar, null);
  assert.equal(e.comuna, null);
  assert.equal(e.revisar, true);
  assert.match(e.revisar_motivo, /Falta el lugar/);
  assert.match(e.revisar_motivo, /comuna/);
});

test('cuántos baristas: lo que dice el calendario, y si no, 3 con café y martini, 2 en otro caso', () => {
  const base = { titulo: 'Servicio Sepia Coffee - X', lugar: 'Sitio, Pirque' };
  const n = (descripcion) => leer([ev({ ...base, descripcion })]).eventos[0].baristas;
  assert.equal(n('Baristas: 4'), 4);
  assert.equal(n('Son 3 baristas en total'), 3);
  assert.equal(n('Servicio: Café, Espresso Martini y Carajillo'), 3);
  assert.equal(n('Servicio: Espresso Martini y Carajillo'), 2);
  assert.equal(n('Servicio: Martini y tragos (sin café)'), 2);
  assert.equal(n(''), 2);
  assert.equal(n('Baristas: 1'), 2);             // mínimo 2
  assert.equal(n('Baristas: 40'), 12);           // un error de tipeo no abre 40 cupos
  assert.equal(n('Servicio: Espresso martini y carajillo (2h) + café (1,5h)\nBaristas: 2'), 3);   // café y martini: mínimo 3
  assert.equal(n('Servicio: Café y martini\nBaristas: 4'), 4);
  const uno = leer([ev({ ...base, descripcion: 'Baristas: 1' })]).eventos[0];
  assert.match(uno.revisar_motivo, /mínimo de 2/);
  const cafe = leer([ev({ ...base, descripcion: 'Servicio: Café y martini\nBaristas: 2' })]).eventos[0];
  assert.match(cafe.revisar_motivo, /Decía 2 baristas: se puso el mínimo de 3/);
});

test('qué eventos del calendario son servicios', () => {
  const r = leer([
    ev({ id: '1', titulo: 'Reunión Sepia Coffee' }),
    ev({ id: '2', titulo: 'Pagar F29 - Sepia' }),
    ev({ id: '3', titulo: 'Servicio Sepia Coffee - A - ANULADO', lugar: 'Sitio, Pirque' }),
    ev({ id: '4', titulo: 'Servicio Sepia Coffee - B', lugar: 'Sitio, Pirque', descripcion: '#sinbaristas' }),
    ev({ id: '5', titulo: 'Servicio Sepia Coffee - C', lugar: 'Sitio, Pirque', todoElDia: true }),
    ev({ id: '6', titulo: 'Servicio Sepia Coffee - D', lugar: 'Sitio, Pirque', rechazado: true }),
    ev({ id: '7', titulo: 'Matrimonio de Pedro #barista', lugar: 'Sitio, Pirque' }),
    ev({ id: '8', titulo: 'Servicio Sepia Coffee - E', lugar: 'Sitio, Pirque' }),
    ev({ id: '9', titulo: 'Cumpleaños de la abuela', lugar: 'Su casa' }),
    ev({ id: '10', titulo: 'Almuerzo', ini: '2026-12-05T13:00', fin: '2026-12-05T13:30' }),
    ev({ id: '11', titulo: 'Servicio Sepia Coffee - F', lugar: 'Sitio, Pirque', ini: '2026-10-01T18:00', fin: '2026-10-01T22:00' }),
  ]);
  assert.deepEqual(plano(r.eventos.map((e) => e.gcal_id)), ['7', '8']);
  assert.deepEqual(plano(r.ignorados.map((x) => x.titulo)), ['Cumpleaños de la abuela']);   // con lugar o de 2 h o más: se avisa; un almuerzo corto no
});

test('turnos fijos: un bloque se parte en turnos con su pago', () => {
  const fijos = [{ patron: 'torneo', nombre: 'Torneo de Prueba', lugar: 'Gimnasio de Prueba', comuna: 'Providencia', cliente: 'Torneo de Prueba', turnos: [{ horas: 3, pago: 25000 }, { horas: 4, pago: 40000 }] }];
  const r = leer([ev({ id: 'serie@google.com', recurrente: true, titulo: 'Evento Torneo Quinto', ini: '2026-10-22T17:45', fin: '2026-10-22T22:15', lugar: 'Gimnasio' })], { turnosFijos: fijos });
  assert.equal(r.eventos.length, 2);
  assert.deepEqual(plano(r.eventos.map((e) => [e.gcal_id, e.hora_inicio, e.hora_fin, e.baristas, e.pago_manual])), [
    ['serie@google.com|2026-10-22T17:45#3h', '17:45', '20:45', 1, 25000],
    ['serie@google.com|2026-10-22T17:45#4h', '17:45', '21:45', 1, 40000],
  ]);
  assert.equal(r.eventos[0].nombre, 'Torneo de Prueba · turno de 3 horas');
  assert.equal(r.eventos[0].comuna, 'Providencia');
});

test('un evento que se repite tiene un id distinto por fecha', () => {
  const r = leer([
    ev({ id: 'serie@google.com', recurrente: true, titulo: 'Servicio X', lugar: 'Sitio, Pirque', ini: '2026-11-05T18:00', fin: '2026-11-05T22:00' }),
    ev({ id: 'serie@google.com', recurrente: true, titulo: 'Servicio X', lugar: 'Sitio, Pirque', ini: '2026-11-12T18:00', fin: '2026-11-12T22:00' }),
  ]);
  assert.equal(new Set(r.eventos.map((e) => e.gcal_id)).size, 2);
});

test('horarios raros se avisan y no se publican', () => {
  const r = leer([
    ev({ id: 'a', titulo: 'Servicio X', lugar: 'Sitio, Pirque', ini: '2026-12-05T18:00', fin: '2026-12-05T18:00' }),
    ev({ id: 'b', titulo: 'Servicio Y', lugar: 'Sitio, Pirque', ini: '2026-12-05T18:00', fin: '2026-12-07T18:00' }),
    ev({ id: 'c', titulo: 'Servicio Z', lugar: 'Sitio, Pirque', ini: '2026-12-05T08:00', fin: '2026-12-05T21:00' }),
  ]);
  assert.deepEqual(plano(r.eventos.map((e) => e.gcal_id)), ['c']);
  assert.equal(r.problemas.length, 2);
  assert.match(r.eventos[0].revisar_motivo, /12 horas/);
});

test('comuna: gana la que está más a la derecha, y las localidades apuntan a su comuna', () => {
  const c = (lugar, alias) => leer([ev({ titulo: 'Servicio X', lugar })], { alias }).eventos[0].comuna;
  assert.equal(c('Casona Macul, Santiago'), 'Santiago');
  assert.equal(c('Parque Lo Arcaya, Pirque'), 'Pirque');
  assert.equal(c('Casona Alquería, Isla de Maipo'), 'Isla de Maipo');
  assert.equal(c('Arboleda de Chicureo – Centro de Eventos'), 'Colina');
  assert.equal(c('Playa, Horcon'), 'Puchuncaví');
  assert.equal(c('Hacienda Rara', { 'hacienda rara': 'Talagante' }), 'Talagante');
  assert.equal(c('Restaurante Pavarotti, Limache'), 'Limache');
  assert.equal(c('Sitio sin comuna'), null);
  assert.equal(c('Ñuñoa'), 'Ñuñoa');
});

test('la descripción de Google con HTML se entiende igual', () => {
  const r = leer([ev({ titulo: 'Servicio X', lugar: 'Sitio, Pirque', descripcion: 'Nombre completo: Cliente&nbsp;Ficticio<br>Baristas: 3<br><b>Servicio:</b> Café y martini' })]);
  assert.equal(r.eventos[0].baristas, 3);
  assert.equal(r.eventos[0].cliente, 'Cliente Ficticio');
});

// ---------------------------------------------------------------------------
// Correos
// ---------------------------------------------------------------------------

const EV = {
  nombre: 'Servicio de barra · Casona <b>Prueba</b>', fecha: '2027-03-13', hora_inicio: '15:00', hora_fin: '23:00', lugar: 'Casona Prueba', comuna: 'Pirque', dias: 7,
  semaforo: 'pendiente', necesarios: 2, asignados: 2, reconfirmados: 1, faltan: 0, postulantes: 1, grupo_wsp: false, pago_liquido: 70000, monto_boleta: 82596,
  asistentes: [{ nombre: 'Ana Prueba', telefono: '+56911110001', reconfirmo: true }, { nombre: 'Beto <script>', telefono: '911110002', reconfirmo: false }],
};
const CASOS = [
  { clave: 'recordatorio:p:1', tipo: 'recordatorio_reconfirmar', datos: { ...EV, paso: 1, evento: EV.nombre } },
  { clave: 'recordatorio:p:2', tipo: 'recordatorio_reconfirmar', datos: { ...EV, paso: 2, evento: EV.nombre, dias: 6 } },
  { clave: 'recordatorio:p:3', tipo: 'recordatorio_reconfirmar', datos: { ...EV, paso: 3, evento: EV.nombre, dias: 5 } },
  { clave: 'vacante:e', tipo: 'vacante', datos: { ...EV, vacantes: 1, sin_reconfirmar: ['Beto'] } },
  { clave: 'vacante_cupos:e', tipo: 'vacante', datos: { ...EV, vacantes: 2, sin_reconfirmar: [], motivo: 'cupos' } },
  { clave: 'vacante_admin:e', tipo: 'vacante_admin', datos: { ...EV, sin_reconfirmar: ['Beto'], destinatarios: 6, abierto: true } },
  { clave: 'vacante_admin:e', tipo: 'vacante_admin', datos: { ...EV, sin_reconfirmar: [], destinatarios: 0, abierto: false } },
  { clave: 'estado_semana:2027-03-06', tipo: 'estado_semana', datos: { hoy: '2027-03-06', eventos: [EV, { ...EV, semaforo: 'ok', reconfirmados: 2 }] } },
  { clave: 'evento_ok:e', tipo: 'evento_ok', datos: { ...EV, semaforo: 'ok', reconfirmados: 2 } },
  { clave: 'grupo_wsp:e:2', tipo: 'grupo_wsp', datos: EV },
  { clave: 'alerta4:e', tipo: 'alerta4', datos: { ...EV, dias: 4, faltan: 1, postulantes: 2 } },
  { clave: 'boleta:p:1', tipo: 'boleta', datos: { paso: 1, evento: EV.nombre, fecha: EV.fecha, pago_liquido: 70000, monto_boleta: 82596, retencion: 0.1525 } },
  { clave: 'boleta:p:3', tipo: 'boleta', datos: { paso: 3, evento: EV.nombre, fecha: EV.fecha, pago_liquido: 70000, monto_boleta: 82596, retencion: 0.1525 } },
  { clave: 'pago:p', tipo: 'pago', datos: { evento: EV.nombre, fecha: EV.fecha, pago_liquido: 70000, pagado_en: '2027-03-18' } },
  { clave: 'resumen_cierre:2027-03-18', tipo: 'resumen_cierre', datos: { boletas: [{ barista: 'Ana Prueba', rut: '11.111.111-1', evento: EV.nombre, fecha: EV.fecha, folio: '123', monto_boleta: 82596, pago_liquido: 70000 }],
    atrasados: [{ evento: 'Otro', fecha: '2027-03-01', dias: 12, boletas_pendientes: 1, pagos_pendientes: 2, documento_cliente_pendiente: true }] } },
  { clave: 'resumen_cierre:2027-03-19', tipo: 'resumen_cierre', datos: { boletas: [], atrasados: [{ evento: 'Otro', fecha: '2027-03-01', dias: 12, boletas_pendientes: 0, pagos_pendientes: 0, documento_cliente_pendiente: true }] } },
];

test('cada tipo de correo sale completo, sin undefined ni NaN, y con el enlace del portal', () => {
  for (const item of CASOS) {
    const c = ctx.armarCorreo_(item, { email: 'a@ejemplo.test', nombre: 'Ana Prueba García' }, 'https://sepiacoffee.cl/pages/baristas');
    const html = ctx.bloquesAHtml_(c.bloques, c.titulo), texto = ctx.bloquesATexto_(c.bloques);
    for (const [nombre, s] of [['asunto', c.asunto], ['html', html], ['texto', texto]]) {
      assert.doesNotMatch(s, /undefined|NaN|\[object|null/, `${item.tipo} (${item.clave}) ${nombre}`);
    }
    assert.ok(c.asunto.length > 8 && c.asunto.length < 140, c.asunto);
    if (item.tipo !== 'pago') assert.ok(html.includes('https://sepiacoffee.cl/pages/baristas'), item.tipo + ' sin enlace');
  }
});

test('los textos de los eventos y de las personas no pueden meter HTML en el correo', () => {
  for (const item of CASOS) {
    const c = ctx.armarCorreo_(item, { email: 'a@ejemplo.test', nombre: '<img src=x>' }, 'https://sepiacoffee.cl/pages/baristas');
    const html = ctx.bloquesAHtml_(c.bloques, c.titulo);
    assert.doesNotMatch(html, /<script|<b>Prueba|<img src=x>/, item.tipo);
  }
});

test('los avisos a baristas no llevan la dirección exacta ni datos bancarios', () => {
  for (const item of CASOS.filter((c) => ['recordatorio_reconfirmar', 'vacante', 'boleta', 'pago'].includes(c.tipo))) {
    const c = ctx.armarCorreo_(item, { email: 'a@ejemplo.test', nombre: 'Ana' }, 'https://x.test');
    const t = ctx.bloquesATexto_(c.bloques);
    assert.doesNotMatch(t, /cuenta (corriente|vista|rut)|Nº|RUT|Direcci[oó]n:|Lugar exacto/i, item.tipo);
  }
});

test('asuntos y contenido clave', () => {
  const c = (i) => ctx.armarCorreo_(CASOS[i], { email: 'a@ejemplo.test', nombre: 'Ana Prueba García' }, 'https://x.test');
  assert.match(c(0).asunto, /^Confirma que vas · /);
  assert.match(c(1).asunto, /^Recordatorio: confirma tu asistencia/);
  assert.match(c(2).asunto, /^Último aviso/);
  assert.match(ctx.bloquesATexto_(c(0).bloques), /^Hola Ana,/);
  assert.match(c(0).asunto, /sáb 13\/3|sab 13\/3/i);
  assert.match(ctx.bloquesATexto_(c(0).bloques), /\$70\.000 líquidos · boleta de honorarios por \$82\.596/);
  assert.match(c(3).asunto, /^Hay un cupo: /);
  assert.match(c(4).asunto, /^Hay 2 cupos: /);
  assert.match(ctx.bloquesATexto_(c(7).bloques), /1 OK y 1 por resolver/);
  assert.match(ctx.bloquesATexto_(c(8).bloques), /Ana Prueba — \+56911110001 \(wa\.me\/56911110001\)/);
  assert.match(ctx.bloquesATexto_(c(8).bloques), /Beto .* — 911110002 \(wa\.me\/56911110002\)/);
  assert.match(c(9).asunto, /^Recordatorio 2: crear el grupo de WhatsApp/);
  assert.match(ctx.bloquesATexto_(c(11).bloques), /Retención: 15,25 %/);
  assert.match(ctx.bloquesATexto_(c(13).bloques), /Monto: \$70\.000 líquidos/);
  assert.match(c(14).asunto, /^Cierres pendientes: 1 boletas por revisar, 1 atrasados/);
});

// ---------------------------------------------------------------------------
// El flujo con Google simulado
// ---------------------------------------------------------------------------

const PROPS = { SUPABASE_URL: 'https://proyecto.supabase.co/', SUPABASE_KEY: 'sb_publishable_x', SECRETO: 'clave-larga', MODO_PRUEBA: 'no', PORTAL_URL: 'https://sepiacoffee.cl/pages/baristas' };

test('faltan ajustes: el error dice cuáles', () => {
  const { ctx: c } = cargar({ propiedades: {} });
  assert.throws(() => c.ajustes_(), /SUPABASE_URL, SUPABASE_KEY, SECRETO/);
  const { ctx: d } = cargar({ propiedades: { ...PROPS, MODO_PRUEBA: 'si' } });
  assert.throws(() => d.ajustes_(), /EMAIL_PRUEBA/);
});

test('el modo de prueba es el que rige si no se dice nada', () => {
  const { ctx: c } = cargar({ propiedades: { ...PROPS, MODO_PRUEBA: '', EMAIL_PRUEBA: 'yo@ejemplo.test' } });
  assert.equal(c.ajustes_().modoPrueba, true);
});

test('enviarNotificaciones: manda a cada destinatario por separado y marca lo enviado', () => {
  const pendientes = [
    { clave: 'vacante:e', tipo: 'vacante', para: [{ email: 'eli@ejemplo.test', nombre: 'Eli' }, { email: 'fer@ejemplo.test', nombre: 'Fer' }], datos: { ...EV, vacantes: 1 } },
    { clave: 'evento_ok:e', tipo: 'evento_ok', para: [{ email: 'admin@ejemplo.test', nombre: 'Sepia Coffee' }], datos: EV },
  ];
  const { ctx: c, registro } = cargar({ propiedades: PROPS, fetch: (url) => ({ codigo: 200, cuerpo: url.endsWith('api_pendientes') ? JSON.stringify(pendientes) : '2' }) });
  const r = c.enviarNotificaciones();
  assert.equal(r.enviados, 3);
  assert.deepEqual(plano(registro.correos.map((m) => m.to)), ['eli@ejemplo.test', 'fer@ejemplo.test', 'admin@ejemplo.test']);
  assert.ok(registro.correos.every((m) => m.name === 'Sepia Coffee' && m.htmlBody && m.body));
  assert.ok(registro.correos.every((m) => !m.subject.startsWith('[PRUEBA')));
  const marcar = registro.fetch.find((f) => f.url.endsWith('api_marcar'));
  assert.deepEqual(plano(marcar.payload), { secreto: 'clave-larga', claves: ['vacante:e', 'evento_ok:e'] });
  assert.equal(registro.fetch[0].url, 'https://proyecto.supabase.co/rest/v1/rpc/api_pendientes');   // sin doble barra
  assert.equal(registro.fetch[0].headers.apikey, 'sb_publishable_x');
});

test('modo de prueba: todo va a EMAIL_PRUEBA, no se marca nada y no se repite', () => {
  const pendientes = [{ clave: 'vacante:e', tipo: 'vacante', para: [{ email: 'eli@ejemplo.test', nombre: 'Eli' }], datos: { ...EV, vacantes: 1 } }];
  const { ctx: c, registro, props } = cargar({ propiedades: { ...PROPS, MODO_PRUEBA: 'si', EMAIL_PRUEBA: 'yo@ejemplo.test' }, fetch: () => ({ codigo: 200, cuerpo: JSON.stringify(pendientes) }) });
  c.enviarNotificaciones();
  assert.equal(registro.correos.length, 1);
  assert.equal(registro.correos[0].to, 'yo@ejemplo.test');
  assert.match(registro.correos[0].subject, /^\[PRUEBA · iría a eli@ejemplo\.test\] Hay un cupo/);
  assert.ok(!registro.fetch.some((f) => f.url.endsWith('api_marcar')));
  c.enviarNotificaciones();
  assert.equal(registro.correos.length, 1, 'la segunda corrida no repite el mismo aviso');
  c.reiniciarPrueba();
  c.enviarNotificaciones();
  assert.equal(registro.correos.length, 2, 'después de reiniciar sí');
  assert.ok(props.PRUEBA_VISTOS);
});

test('si un correo falla, no se marca; si falla solo uno de varios, sí y se avisa', () => {
  const pendientes = [
    { clave: 'a:1', tipo: 'pago', para: [{ email: 'malo@ejemplo.test', nombre: 'M' }], datos: { evento: 'ZZZ-falla', fecha: '2027-03-13', pago_liquido: 1000 } },
    { clave: 'b:1', tipo: 'vacante', para: [{ email: 'bueno@ejemplo.test', nombre: 'B' }, { email: 'no-es-correo', nombre: 'C' }], datos: { ...EV, vacantes: 1 } },
  ];
  const { ctx: c, registro } = cargar({ propiedades: PROPS, fallaCorreoA: 'ZZZ-falla', fetch: () => ({ codigo: 200, cuerpo: JSON.stringify(pendientes) }) });
  const r = c.enviarNotificaciones();
  const marcar = registro.fetch.find((f) => f.url.endsWith('api_marcar'));
  assert.deepEqual(plano(marcar.payload.claves), ['b:1']);
  assert.equal(r.fallos.length, 2);
  assert.ok(registro.correos.some((m) => m.to === 'dueno@ejemplo.test' && /no salieron/.test(m.subject)));
});

test('sin cuota de correo no se manda ni se marca', () => {
  const pendientes = [{ clave: 'a:1', tipo: 'pago', para: [{ email: 'x@ejemplo.test', nombre: 'X' }], datos: { evento: 'E', fecha: '2027-03-13', pago_liquido: 1000 } }];
  const { ctx: c, registro } = cargar({ propiedades: PROPS, cuotaCorreo: 0, fetch: () => ({ codigo: 200, cuerpo: JSON.stringify(pendientes) }) });
  c.enviarNotificaciones();
  assert.ok(!registro.correos.some((m) => m.to === 'x@ejemplo.test'));
  assert.ok(!registro.fetch.some((f) => f.url.endsWith('api_marcar')));
});

test('si la base responde con error, se avisa a la administración una vez y se relanza', () => {
  const { ctx: c, registro } = cargar({ propiedades: PROPS, fetch: () => ({ codigo: 400, cuerpo: '{"message":"No autorizado"}' }) });
  assert.throws(() => c.enviarNotificaciones(), /api_pendientes respondió 400/);
  assert.throws(() => c.enviarNotificaciones(), /api_pendientes respondió 400/);
  assert.equal(registro.correos.filter((m) => /falló la automatización/.test(m.subject)).length, 1);
  assert.equal(registro.correos[0].to, 'dueno@ejemplo.test');
});

test('sincronizarCalendario: manda a la base solo los servicios futuros, con la ventana de fechas', () => {
  const eventos = [
    eventoGoogle({ id: 'a@google.com', titulo: 'Servicio Sepia Coffee - Cliente Uno', lugar: 'Casona Uno, Pirque', ini: '2026-12-05T18:00', fin: '2026-12-05T23:30', descripcion: 'Baristas: 3' }),
    eventoGoogle({ id: 'b@google.com', titulo: 'Reunión Sepia Coffee', ini: '2026-12-07T18:30', fin: '2026-12-07T19:30' }),
    eventoGoogle({ id: 'c@google.com', titulo: 'Servicio Sepia Coffee - Cliente Dos', lugar: 'Casona Dos, Colina', ini: '2025-01-05T18:00', fin: '2025-01-05T23:30' }),
  ];
  const respuesta = { creados: ['Servicio de barra · Casona Uno'], cambiados: [], cancelados: [], por_revisar: [], errores: [], advertencia: null };
  const { ctx: c, registro } = cargar({ propiedades: PROPS, eventos, fetch: () => ({ codigo: 200, cuerpo: JSON.stringify(respuesta) }) });
  c.sincronizarCalendario();
  const llamada = registro.fetch.find((f) => f.url.endsWith('api_importar'));
  assert.equal(llamada.payload.secreto, 'clave-larga');
  assert.deepEqual(plano(llamada.payload.eventos.map((e) => [e.gcal_id, e.baristas, e.comuna])), [['a@google.com', 3, 'Pirque']]);
  assert.match(llamada.payload.desde, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(llamada.payload.hasta > llamada.payload.desde);
  assert.equal(registro.correos.length, 1, 'hay un evento nuevo: llega el resumen');
  assert.equal(registro.correos[0].to, 'dueno@ejemplo.test');
  assert.match(registro.correos[0].subject, /1 nuevos, 0 con cambios, 0 cancelados/);
});

test('sincronizarCalendario: sin novedades no manda correo', () => {
  const respuesta = { creados: [], cambiados: [], cancelados: [], por_revisar: [], errores: [], advertencia: null };
  const { ctx: c, registro } = cargar({ propiedades: PROPS, eventos: [], fetch: () => ({ codigo: 200, cuerpo: JSON.stringify(respuesta) }) });
  c.sincronizarCalendario();
  assert.equal(registro.correos.length, 0);
});

test('sincronizarCalendario: una advertencia de la base (calendario vacío) sí se avisa', () => {
  const respuesta = { creados: [], cambiados: [], cancelados: [], por_revisar: [], errores: [], advertencia: 'El calendario llegó vacío: no se canceló nada.' };
  const { ctx: c, registro } = cargar({ propiedades: PROPS, eventos: [], fetch: () => ({ codigo: 200, cuerpo: JSON.stringify(respuesta) }) });
  c.sincronizarCalendario();
  assert.equal(registro.correos.length, 1);
  assert.match(ctx.bloquesATexto_([{ p: 'ATENCIÓN: ' + respuesta.advertencia }]), /llegó vacío/);
  assert.match(registro.correos[0].body, /ATENCIÓN: El calendario llegó vacío/);
});

test('los eventos ignorados se avisan una sola vez', () => {
  const eventos = [eventoGoogle({ id: 'z@google.com', titulo: 'Cumpleaños de la abuela', lugar: 'Su casa', ini: '2026-12-05T18:00', fin: '2026-12-05T23:30' })];
  const respuesta = { creados: [], cambiados: [], cancelados: [], por_revisar: [], errores: [], advertencia: null };
  const { ctx: c, registro } = cargar({ propiedades: PROPS, eventos, fetch: () => ({ codigo: 200, cuerpo: JSON.stringify(respuesta) }) });
  c.sincronizarCalendario();
  c.sincronizarCalendario();
  assert.equal(registro.correos.length, 1);
  assert.match(registro.correos[0].body, /Cumpleaños de la abuela/);
  assert.match(registro.correos[0].body, /#barista/);
});

test('un CALENDARIO_ID que no existe da un error claro', () => {
  const { ctx: c } = cargar({ propiedades: { ...PROPS, CALENDARIO_ID: 'no-existe' }, eventos: [], fetch: () => ({ codigo: 200, cuerpo: '{}' }) });
  assert.throws(() => c.sincronizarCalendario(), /No encuentro el calendario/);
});

test('los disparadores: calendario cada día a las 6 y correos cada hora; reinstalar no duplica', () => {
  const { ctx: c, registro } = cargar({ propiedades: PROPS });
  c.instalarDisparadores();
  c.instalarDisparadores();
  assert.deepEqual(plano(registro.triggers.map((t) => [t.getHandlerFunction(), t.cuando.join('+')])), [
    ['sincronizarCalendario', 'dias1+hora6'], ['enviarNotificaciones', 'cada1h'],
  ]);
  c.quitarDisparadores();
  assert.equal(registro.triggers.length, 0);
});

test('enviarMuestras manda un ejemplo de cada correo, siempre a EMAIL_PRUEBA', () => {
  const { ctx: c, registro } = cargar({ propiedades: { ...PROPS, MODO_PRUEBA: 'no', EMAIL_PRUEBA: 'yo@ejemplo.test' } });
  c.enviarMuestras();
  assert.equal(registro.correos.length, 11);
  assert.ok(registro.correos.every((m) => m.to === 'yo@ejemplo.test'));
});
