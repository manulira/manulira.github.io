// Prueba de punta a punta: Codigo.gs + el esquema.sql real, con el paso de los días simulado.
// Necesita un Postgres de pruebas (variables PGHOST, PGPORT, PGUSER de psql); sin él se salta.
//   PGHOST=/ruta/al/socket PGPORT=54329 PGUSER=postgres node --test shopify/baristas/apps-script/pruebas/
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargar, eventoGoogle } from './arnes.mjs';
import { hayPostgres, crearBase } from './puente-sql.mjs';

const hay = hayPostgres();
const utc = (s) => Date.parse(s);
const para = (registro, desde) => registro.correos.slice(desde).map((m) => m.to);
const asuntos = (registro, desde) => registro.correos.slice(desde).map((m) => m.subject);

test('un evento de punta a punta: calendario → inscripción → recordatorios → vacante → OK → boleta → pago', { skip: !hay && 'sin Postgres de pruebas' }, () => {
  const base = crearBase();
  try {
    const reloj = { ahora: utc('2026-11-01T12:00:00Z') };
    const opciones = {
      reloj, eventos: [],
      propiedades: { SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_KEY: 'sb_publishable_x', SECRETO: 'clave-larga', MODO_PRUEBA: 'no' },
    };
    const { ctx, registro } = cargar(opciones);
    // cargar() ya armó el sandbox; la base se conecta después para poder usar el mismo reloj
    const fetchSql = base.fetch(reloj);
    ctx.UrlFetchApp.fetch = (url, o) => {
      registro.fetch.push({ url, payload: JSON.parse(o.payload) });
      const r = fetchSql(url, o);
      return { getResponseCode: () => r.codigo, getContentText: () => r.cuerpo };
    };

    base.sql(`
      insert into auth.users(id, email) values
        ('00000000-0000-0000-0000-0000000000a1', 'ana@ejemplo.test'), ('00000000-0000-0000-0000-0000000000b1', 'beto@ejemplo.test'),
        ('00000000-0000-0000-0000-0000000000c1', 'cleo@ejemplo.test'), ('00000000-0000-0000-0000-0000000000d1', 'dino@ejemplo.test');
      insert into public.admins(email) values ('admin@ejemplo.test');
      update public.automatizacion set secreto_hash = encode(sha256(convert_to('clave-larga', 'UTF8')), 'hex');
      insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos) values
        ('00000000-0000-0000-0000-0000000000a1', 'Ana Prueba', '11.111.111-1', 'ana@ejemplo.test', '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true),
        ('00000000-0000-0000-0000-0000000000b1', 'Beto Prueba', '12.345.678-5', 'beto@ejemplo.test', '+56911110002', 'Macul', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true),
        ('00000000-0000-0000-0000-0000000000c1', 'Cleo Prueba', '10.000.013-K', 'cleo@ejemplo.test', '+56911110003', 'Pirque', 'BCI', 'Cuenta vista', '11110003', true, true, 'x', true, true),
        ('00000000-0000-0000-0000-0000000000d1', 'Dino Prueba', '22.222.222-2', 'dino@ejemplo.test', '+56911110004', 'Colina', 'BCI', 'Cuenta vista', '11110004', true, true, 'x', true, false);`);

    const A = eventoGoogle({ id: 'a@google.com', titulo: 'Servicio Sepia Coffee - Cliente Uno - NO PAGADO', lugar: 'Casona Uno, Pirque', ini: '2026-11-10T18:00', fin: '2026-11-10T23:00', descripcion: 'Baristas: 2\nServicio: Espresso martini' });
    const B = eventoGoogle({ id: 'b@google.com', titulo: 'Servicio Sepia Coffee - Cliente Dos', lugar: 'Casona Dos, Colina', ini: '2026-11-25T14:00', fin: '2026-11-25T20:00', descripcion: 'Servicio: Café, espresso martini y carajillo' });
    const R = eventoGoogle({ id: 'r@google.com', titulo: 'Reunión Sepia Coffee', ini: '2026-11-02T18:30', fin: '2026-11-02T19:30' });

    // 1. Se lee el calendario: 2 eventos nuevos, abiertos, con los cupos que dicen las reglas
    opciones.eventos = [A, B, R];
    ctx.sincronizarCalendario();
    assert.equal(base.consulta('select count(*) from public.eventos'), '2');
    assert.equal(base.consulta("select string_agg(estado || ' ' || baristas_necesarios, ',' order by fecha) from public.eventos"), 'abierto 2,abierto 3');
    assert.equal(base.consulta("select p.cliente from public.evento_privado p join public.eventos e on e.id = p.evento_id where e.fecha = '2026-11-10'"), 'Cliente Uno');
    assert.equal(registro.correos.length, 1, 'llega el resumen de la sincronización');
    assert.match(registro.correos[0].subject, /2 nuevos/);

    // 2. Sin cambios, una segunda lectura no hace nada
    ctx.sincronizarCalendario();
    assert.equal(base.consulta('select count(*) from public.eventos'), '2');
    assert.equal(registro.correos.length, 1);

    // 3. El evento A queda con Ana y Beto asignados
    base.sql(`insert into public.postulaciones(id, evento_id, barista_id, estado)
      select gen_random_uuid(), e.id, b.id, 'confirmada' from public.eventos e, public.baristas b where e.fecha = '2026-11-10' and b.nombre in ('Ana Prueba', 'Beto Prueba')`);

    // 4. 7 días antes (3 de nov, 09:00): recordatorio a los dos y estado de la semana a la administración
    reloj.ahora = utc('2026-11-03T12:00:00Z');
    let n = registro.correos.length;
    ctx.enviarNotificaciones();
    assert.deepEqual(para(registro, n).sort(), ['admin@ejemplo.test', 'ana@ejemplo.test', 'beto@ejemplo.test']);
    assert.match(asuntos(registro, n).join('|'), /Confirma que vas · Servicio de barra · Casona Uno/);
    assert.match(asuntos(registro, n).join('|'), /Estado de la semana: 1 evento, 0 OK/);
    n = registro.correos.length;
    ctx.enviarNotificaciones();
    assert.equal(registro.correos.length, n, 'lo ya enviado no se repite');

    // 5. Ana reconfirma; a 6 días solo Beto recibe el segundo, a 5 el tercero
    base.sql(`update public.postulaciones set asistencia_confirmada_en = now() where barista_id = '00000000-0000-0000-0000-0000000000a1'`);
    reloj.ahora = utc('2026-11-04T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.deepEqual(para(registro, n), ['beto@ejemplo.test']);
    assert.match(asuntos(registro, n)[0], /^Recordatorio: confirma tu asistencia/);
    reloj.ahora = utc('2026-11-05T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.deepEqual(para(registro, n), ['beto@ejemplo.test']);
    assert.match(asuntos(registro, n)[0], /^Último aviso/);

    // 6. 12 horas después del tercero: vacante a quien aceptó avisos y no está asignado, y copia a la administración
    reloj.ahora = utc('2026-11-06T00:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.deepEqual(para(registro, n).sort(), ['admin@ejemplo.test', 'cleo@ejemplo.test']);
    assert.match(registro.correos.find((m) => m.to === 'cleo@ejemplo.test').subject, /^Hay un cupo: /);
    assert.match(registro.correos.find((m) => m.to === 'admin@ejemplo.test').body, /Beto Prueba/);

    // 7. Beto reconfirma: el evento queda OK y la administración recibe a quién agregar al grupo
    base.sql(`update public.postulaciones set asistencia_confirmada_en = now() where barista_id = '00000000-0000-0000-0000-0000000000b1'`);
    reloj.ahora = utc('2026-11-06T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.deepEqual(para(registro, n), ['admin@ejemplo.test']);
    const ok = registro.correos[n];
    assert.match(ok.subject, /^Evento OK · /);
    assert.match(ok.body, /Ana Prueba — \+56911110001 \(wa\.me\/56911110001\)/);
    assert.match(ok.body, /Beto Prueba — \+56911110002/);

    // 8. Si no se crea el grupo, recuerda; al marcarlo en el checklist, para
    reloj.ahora = utc('2026-11-07T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.match(asuntos(registro, n).join('|'), /^Recordatorio 1: crear el grupo de WhatsApp/);
    base.sql(`insert into public.evento_seguimiento(evento_id, checklist) select id, '{"grupo_whatsapp":"2026-11-07T20:00:00Z"}' from public.eventos where fecha = '2026-11-10'
      on conflict (evento_id) do update set checklist = excluded.checklist`);
    reloj.ahora = utc('2026-11-08T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.equal(registro.correos.length, n, 'con el grupo creado no se insiste');

    // 9. Pasó el evento: se pide la boleta a los dos, con el monto. Y justo se abre el evento B (a 14 días)
    reloj.ahora = utc('2026-11-10T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.ok(!asuntos(registro, n).some((x) => /Se abrió un evento/.test(x)), 'a 15 días el evento B todavía no se abre');
    reloj.ahora = utc('2026-11-11T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    const nuevos = registro.correos.slice(n);
    const boletas = nuevos.filter((m) => /Tu boleta de honorarios/.test(m.subject));
    assert.deepEqual(boletas.map((m) => m.to).sort(), ['ana@ejemplo.test', 'beto@ejemplo.test']);
    assert.match(boletas[0].body, /Monto de la boleta: \$/);
    assert.match(boletas[0].body, /Retención: 15,25 %/);
    const abierto = nuevos.filter((m) => /^Se abrió un evento: /.test(m.subject));
    assert.deepEqual(abierto.map((m) => m.to).sort(), ['ana@ejemplo.test', 'beto@ejemplo.test', 'cleo@ejemplo.test'], 'a quienes aceptaron avisos y no están asignados a B (Dino no aceptó)');
    assert.match(abierto[0].body, /Ya puedes postular a un evento que es en 14 días/);

    // 10. Ana declara su boleta: la administración recibe el resumen para revisarla en el SII
    base.sql(`update public.postulaciones set boleta_declarada_en = now(), boleta_declarada_folio = 'B-77' where barista_id = '00000000-0000-0000-0000-0000000000a1'`);
    reloj.ahora = utc('2026-11-12T12:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    const resumen = registro.correos.slice(n).find((m) => m.to === 'admin@ejemplo.test');
    assert.match(resumen.subject, /^Cierres pendientes: 1 boletas por revisar/);
    assert.match(resumen.body, /Ana Prueba · 11\.111\.111-1/);
    assert.match(resumen.body, /B-77/);

    // 11. La administración paga: Ana recibe el aviso de pago
    base.sql(`update public.postulaciones set honorarios_pagados_en = '2026-11-12', boleta_honorarios_recibida_en = '2026-11-12' where barista_id = '00000000-0000-0000-0000-0000000000a1'`);
    reloj.ahora = utc('2026-11-12T18:00:00Z'); n = registro.correos.length; ctx.enviarNotificaciones();
    assert.deepEqual(para(registro, n), ['ana@ejemplo.test']);
    assert.match(registro.correos[n].subject, /^Te pagamos · /);
    assert.match(registro.correos[n].body, /\$\d{2}\.\d{3} líquidos/);

    // Ningún correo salió con huecos
    for (const m of registro.correos) {
      assert.doesNotMatch(m.subject + m.body + m.htmlBody, /undefined|NaN|\[object|\bnull\b/, m.subject);
    }
  } finally { base.borrar(); }
});

test('cambios en el calendario: cambio de fecha, y evento que se borra', { skip: !hay && 'sin Postgres de pruebas' }, () => {
  const base = crearBase();
  try {
    const reloj = { ahora: utc('2026-11-01T12:00:00Z') };
    const opciones = { reloj, eventos: [], propiedades: { SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_KEY: 'k', SECRETO: 'clave-larga', MODO_PRUEBA: 'no' } };
    const { ctx, registro } = cargar(opciones);
    const fetchSql = base.fetch(reloj);
    ctx.UrlFetchApp.fetch = (url, o) => { const r = fetchSql(url, o); return { getResponseCode: () => r.codigo, getContentText: () => r.cuerpo }; };
    base.sql(`update public.automatizacion set secreto_hash = encode(sha256(convert_to('clave-larga', 'UTF8')), 'hex')`);

    const e = (id, ini, fin) => eventoGoogle({ id, titulo: 'Servicio Sepia Coffee - Cliente ' + id, lugar: 'Sitio ' + id + ', Pirque', ini, fin, descripcion: 'Baristas: 2' });
    opciones.eventos = [e('a', '2026-11-20T18:00', '2026-11-20T23:00'), e('b', '2026-11-25T18:00', '2026-11-25T23:00')];
    ctx.sincronizarCalendario();
    assert.equal(base.consulta('select count(*) from public.eventos'), '2');

    // b cambia de día
    opciones.eventos = [e('a', '2026-11-20T18:00', '2026-11-20T23:00'), e('b', '2026-11-26T18:00', '2026-11-26T23:00')];
    ctx.sincronizarCalendario();
    assert.equal(base.consulta("select count(*) from public.eventos where fecha = '2026-11-26' and estado = 'abierto'"), '1');
    assert.equal(base.consulta("select s.revisar::text || ' ' || s.revisar_motivo from public.evento_seguimiento s join public.eventos e on e.id = s.evento_id where e.fecha = '2026-11-26'"), 'true Cambió la fecha o el horario en el calendario');
    assert.match(registro.correos.at(-1).body, /cambiaron de fecha u horario/i);

    // a se borra del calendario
    opciones.eventos = [e('b', '2026-11-26T18:00', '2026-11-26T23:00')];
    ctx.sincronizarCalendario();
    assert.equal(base.consulta("select estado from public.eventos where fecha = '2026-11-20'"), 'cancelado');
    assert.match(registro.correos.at(-1).body, /cancelados/i);

    // un calendario que llega vacío no borra nada
    opciones.eventos = [];
    ctx.sincronizarCalendario();
    assert.equal(base.consulta("select count(*) from public.eventos where estado = 'abierto'"), '1');
    assert.match(registro.correos.at(-1).body, /llegó vacío/);
  } finally { base.borrar(); }
});

test('una clave equivocada no sirve y se avisa del error', { skip: !hay && 'sin Postgres de pruebas' }, () => {
  const base = crearBase();
  try {
    const reloj = { ahora: utc('2026-11-01T12:00:00Z') };
    const { ctx, registro } = cargar({ reloj, eventos: [], propiedades: { SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_KEY: 'k', SECRETO: 'otra-clave', MODO_PRUEBA: 'no' } });
    const fetchSql = base.fetch(reloj);
    ctx.UrlFetchApp.fetch = (url, o) => { const r = fetchSql(url, o); return { getResponseCode: () => r.codigo, getContentText: () => r.cuerpo }; };
    base.sql(`update public.automatizacion set secreto_hash = encode(sha256(convert_to('clave-larga', 'UTF8')), 'hex')`);
    assert.throws(() => ctx.enviarNotificaciones(), /No autorizado/);
    assert.equal(registro.correos.length, 1);
    assert.match(registro.correos[0].subject, /falló la automatización/);
  } finally { base.borrar(); }
});
