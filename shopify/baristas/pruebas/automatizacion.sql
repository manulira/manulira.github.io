-- Pruebas de la automatización: correos y sincronización del calendario. Correr DESPUÉS de
-- shim-supabase.sql y esquema.sql, en una base vacía de pruebas.
-- El tiempo se simula: cada llamada recibe «ahora». Santiago está en UTC-3 en noviembre, así
-- que las 12:00 UTC son las 09:00 de allá.

begin;
\ir arnes.sql

create function t.pend(ahora timestamptz) returns jsonb language sql as $$
  select public.api_pendientes('clave-de-prueba', ahora) $$;
create function t.tiene(nombre text, ahora timestamptz, patron text, esperado boolean) returns void language plpgsql as $$
declare n int;
begin
  select count(*) into n from jsonb_array_elements(t.pend(ahora)) x where x ->> 'clave' like patron;
  insert into t.resultados(nombre, ok, detalle) values (nombre, (n > 0) = esperado, 'coinciden=' || n || ' patrón=' || patron);
end $$;
create function t.marca(ahora timestamptz, patron text) returns integer language sql as $$
  select public.api_marcar('clave-de-prueba',
    coalesce((select jsonb_agg(x ->> 'clave') from jsonb_array_elements(t.pend(ahora)) x where x ->> 'clave' like patron), '[]'::jsonb), ahora) $$;
create function t.para(ahora timestamptz, patron text) returns text language sql as $$
  select coalesce(string_agg(p ->> 'email', ',' order by p ->> 'email'), '(nadie)')
  from jsonb_array_elements(t.pend(ahora)) x, jsonb_array_elements(x -> 'para') p where x ->> 'clave' like patron $$;
create function t.dato(ahora timestamptz, patron text, ruta text) returns text language sql as $$
  select (x -> 'datos') #>> string_to_array(ruta, '.') from jsonb_array_elements(t.pend(ahora)) x where x ->> 'clave' like patron limit 1 $$;
-- Una consulta no ve lo que escribe una función que ella misma llama: la sincronización se
-- ejecuta en una sentencia (t.imp), guarda lo que respondió en t.ultimo y se revisa en otra.
create table t.ultimo (r jsonb);
create function t.imp(payload jsonb, desde date, hasta date) returns void language plpgsql as $$
begin
  delete from t.ultimo;
  insert into t.ultimo select public.api_importar('clave-de-prueba', payload, desde, hasta, '2026-11-10 12:00:00+00');
end $$;

-- ---------------------------------------------------------------------------
-- Personas y evento de prueba
-- ---------------------------------------------------------------------------
select t.root();
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'dani@ejemplo.test'), ('00000000-0000-0000-0000-0000000000e1', 'eli@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'fer@ejemplo.test'),  ('00000000-0000-0000-0000-0000000000a1', 'gus@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'hilda@ejemplo.test');
insert into public.admins(email) values ('admin@ejemplo.test');
insert into public.accesos(id, usuario, nombre) values
  ('00000000-0000-0000-0000-0000000000d1', 'dani.prueba', 'Dani Prueba'), ('00000000-0000-0000-0000-0000000000e1', 'eli.prueba', 'Eli Prueba'),
  ('00000000-0000-0000-0000-0000000000f1', 'fer.prueba', 'Fer Prueba'), ('00000000-0000-0000-0000-0000000000a1', 'gus.prueba', 'Gus Prueba'),
  ('00000000-0000-0000-0000-0000000000b1', 'hilda.prueba', 'Hilda Prueba');
update public.automatizacion set secreto_hash = encode(sha256(convert_to('clave-de-prueba', 'UTF8')), 'hex');
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos) values
  ('00000000-0000-0000-0000-0000000000d1', 'Dani Prueba',  '11.111.111-1', 'dani@ejemplo.test',  '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true),
  ('00000000-0000-0000-0000-0000000000e1', 'Eli Prueba',   '12.345.678-5', 'eli@ejemplo.test',   '+56911110002', 'Providencia', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true),
  ('00000000-0000-0000-0000-0000000000f1', 'Fer Prueba',   '10.000.013-K', 'fer@ejemplo.test',   '+56911110003', 'Macul', 'BCI', 'Cuenta vista', '11110003', true, true, 'x', true, true),
  ('00000000-0000-0000-0000-0000000000a1', 'Gus Prueba',   '77.971.241-9', 'gus@ejemplo.test',   '+56911110004', 'Pirque', 'BCI', 'Cuenta vista', '11110004', true, true, 'x', true, false),
  ('00000000-0000-0000-0000-0000000000b1', 'Hilda Prueba', '22.222.222-2', 'hilda@ejemplo.test', '+56911110005', 'Vitacura', 'BCI', 'Cuenta vista', '11110005', true, true, 'x', true, true);

insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, lugar, baristas_necesarios, estado) values
  ('c0000000-0000-0000-0000-00000000000a', 'Auto A', '2026-11-17', '18:00', '22:00', 'Santiago', 'Casona Uno', 2, 'abierto');
insert into public.postulaciones(id, evento_id, barista_id, estado) values
  ('d0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', 'confirmada'),
  ('d0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'confirmada');
update public.postulaciones set asistencia_confirmada_en = now() where id = 'd0000000-0000-0000-0000-0000000000b1';   -- Hilda ya reconfirmó

-- ---------------------------------------------------------------------------
-- La clave
-- ---------------------------------------------------------------------------
select t.debe_fallar('una clave equivocada no sirve', $q$select public.api_pendientes('otra-clave', '2026-11-10 12:00:00+00')$q$);
select t.debe_fallar('sin clave no sirve', $q$select public.api_pendientes(null, '2026-11-10 12:00:00+00')$q$);
select t.anonimo();
select t.debe_funcionar('sin sesión, con la clave, el script puede pedir lo pendiente', $q$select public.api_pendientes('clave-de-prueba')$q$);
select t.debe_fallar('sin sesión no se ve el cálculo interno', $q$select * from public.calcular_notificaciones()$q$);
select t.debe_fallar('sin sesión no se ve el registro de correos', $q$select * from public.notificaciones$q$);
select t.como('00000000-0000-0000-0000-0000000000d1', 'dani@ejemplo.test');
select t.debe_fallar('una barista no lee la clave guardada', $q$select secreto_hash from public.automatizacion$q$);
select t.debe_fallar('una barista no lee el registro de correos', $q$select * from public.notificaciones$q$);
select t.debe_fallar('una barista no ejecuta el cálculo interno', $q$select * from public.calcular_notificaciones()$q$);
select t.debe_fallar('una barista no ejecuta el seguimiento interno', $q$select * from public.seguimiento_en()$q$);
select t.filas('y la función de seguimiento de la web no le entrega nada', 'select * from public.seguimiento_admin()', 0);
select t.filas('una barista no ve la última sincronización', 'select ultima_sync_en, ultima_sync_resumen from public.automatizacion', 0);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.filas('la administración ve la última sincronización', 'select ultima_sync_en, ultima_sync_resumen from public.automatizacion', 1);
select t.debe_fallar('pero nunca la clave guardada', $q$select secreto_hash from public.automatizacion$q$);
select t.debe_fallar('ni puede cambiarla desde la web', $q$update public.automatizacion set secreto_hash = 'x'$q$);
select t.debe_fallar('ni borrar el registro de correos', $q$delete from public.notificaciones$q$);
select t.root();

-- ---------------------------------------------------------------------------
-- Línea de tiempo del evento (17 nov): recordatorios, vacante, OK, grupo, boleta y pago
-- ---------------------------------------------------------------------------
-- fuera de horario no sale nada
select t.tiene('08:00 (antes de las 9) no se manda recordatorio', '2026-11-10 11:00:00+00', 'recordatorio:%', false);
select t.tiene('23:00 (de noche) no se manda recordatorio',      '2026-11-11 02:00:00+00', 'recordatorio:%', false);

-- 7 días antes, 09:00
select t.tiene('a 8 días todavía no se recuerda', '2026-11-09 12:00:00+00', 'recordatorio:%', false);
select t.tiene('a 7 días: recordatorio 1 a quien no ha confirmado', '2026-11-10 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000d1:1', true);
select t.tiene('a 7 días: Hilda (ya reconfirmó) no recibe recordatorio', '2026-11-10 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000b1:%', false);
select t.para('2026-11-10 12:00:00+00', 'recordatorio:%') as x \gset
select t.valor('el recordatorio va al correo del barista', $q$select t.para('2026-11-10 12:00:00+00', 'recordatorio:%')$q$, 'dani@ejemplo.test');
select t.tiene('a 7 días: estado de la semana para la administración', '2026-11-10 12:00:00+00', 'estado_semana:2026-11-10', true);
select t.valor('el estado de la semana va a la administración', $q$select t.para('2026-11-10 12:00:00+00', 'estado_semana:%')$q$, 'admin@ejemplo.test');
select t.valor('y trae el evento con 1 de 2 reconfirmados', $q$select t.dato('2026-11-10 12:00:00+00', 'estado_semana:%', 'eventos.0.reconfirmados') || ' de ' || t.dato('2026-11-10 12:00:00+00', 'estado_semana:%', 'eventos.0.necesarios')$q$, '1 de 2');
select t.tiene('todavía no hay vacante', '2026-11-10 12:00:00+00', 'vacante%', false);
select t.valor('se marcan como enviados', $q$select t.marca('2026-11-10 12:00:00+00', 'recordatorio:%') + t.marca('2026-11-10 12:00:00+00', 'estado_semana:%')$q$, '2');
select t.tiene('el mismo día, más tarde, no se repite', '2026-11-10 18:00:00+00', 'recordatorio:%', false);
select t.tiene('ni el estado de la semana', '2026-11-10 18:00:00+00', 'estado_semana:%', false);

-- 6 y 5 días antes
select t.tiene('a 6 días: recordatorio 2', '2026-11-11 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000d1:2', true);
select t.tiene('a 6 días: aún no el 3', '2026-11-11 12:00:00+00', 'recordatorio:%:3', false);
select t.marca('2026-11-11 12:00:00+00', 'recordatorio:%');
select t.tiene('a 5 días todavía no hay alerta de evento sin cerrar', '2026-11-12 12:00:00+00', 'alerta4:%', false);
select t.tiene('a 5 días: recordatorio 3', '2026-11-12 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000d1:3', true);
select t.marca('2026-11-12 12:00:00+00', 'recordatorio:%');
select t.tiene('después del tercero no hay un cuarto', '2026-11-13 12:00:00+00', 'recordatorio:%', false);

-- 12 horas después del tercero: vacante
select t.tiene('11 h 59 min después del tercero: todavía no hay vacante', '2026-11-12 23:59:00+00', 'vacante%', false);
select t.tiene('12 horas después (4 días y medio antes): vacante para los baristas', '2026-11-13 00:00:00+00', 'vacante:%', true);
select t.valor('la vacante llega a quienes aceptaron avisos y no están asignados', $q$select t.para('2026-11-13 00:00:00+00', 'vacante:%')$q$, 'eli@ejemplo.test,fer@ejemplo.test');
select t.valor('quedan 1 vacante', $q$select t.dato('2026-11-13 00:00:00+00', 'vacante:%', 'vacantes')$q$, '1');
select t.valor('y la administración recibe su copia, con quién no confirmó', $q$select t.para('2026-11-13 00:00:00+00', 'vacante_admin:%') || ' / ' || t.dato('2026-11-13 00:00:00+00', 'vacante_admin:%', 'sin_reconfirmar.0')$q$, 'admin@ejemplo.test / Dani Prueba');
select t.marca('2026-11-13 00:00:00+00', 'vacante%');
select t.tiene('la vacante no se repite', '2026-11-13 12:00:00+00', 'vacante%', false);

-- 4 días antes y el evento sigue sin estar OK
select t.tiene('a 4 días y sin estar OK: alerta a la administración', '2026-11-13 12:00:00+00', 'alerta4:%', true);
select t.tiene('y todavía no hay aviso de evento OK', '2026-11-13 12:00:00+00', 'evento_ok:%', false);
select t.marca('2026-11-13 12:00:00+00', 'alerta4:%');

-- Dani reconfirma: el evento queda OK
update public.postulaciones set asistencia_confirmada_en = now() where id = 'd0000000-0000-0000-0000-0000000000d1';
select t.tiene('con todos reconfirmados: aviso de evento OK a la administración', '2026-11-14 12:00:00+00', 'evento_ok:%', true);
select t.valor('trae a quién agregar al grupo de WhatsApp, con su teléfono', $q$select t.dato('2026-11-14 12:00:00+00', 'evento_ok:%', 'asistentes.0.nombre') || ' ' || t.dato('2026-11-14 12:00:00+00', 'evento_ok:%', 'asistentes.0.telefono')$q$, 'Dani Prueba +56911110001');
select t.valor('son los 2 asistentes', $q$select jsonb_array_length((select x -> 'datos' -> 'asistentes' from jsonb_array_elements(t.pend('2026-11-14 12:00:00+00')) x where x ->> 'clave' like 'evento_ok:%'))::text$q$, '2');
select t.tiene('a 8 días, aunque esté OK, todavía no se avisa', '2026-11-09 12:00:00+00', 'evento_ok:%', false);
select t.tiene('a 7 días, estando OK, sí', '2026-11-10 12:00:00+00', 'evento_ok:%', true);
select t.marca('2026-11-14 12:00:00+00', 'evento_ok:%');
select t.tiene('ya no hay recordatorios de reconfirmación', '2026-11-14 12:00:00+00', 'recordatorio:%', false);
select t.tiene('el mismo día del OK no se recuerda el grupo todavía', '2026-11-14 18:00:00+00', 'grupo_wsp:%', false);
select t.tiene('al día siguiente, sin crear el grupo: recordatorio 1', '2026-11-15 12:00:00+00', 'grupo_wsp:%:1', true);
select t.marca('2026-11-15 12:00:00+00', 'grupo_wsp:%');
select t.tiene('al otro día: recordatorio 2', '2026-11-16 12:00:00+00', 'grupo_wsp:%:2', true);
-- se crea el grupo y se marca el checklist
select t.debe_funcionar('la administración marca «grupo creado» en el checklist', $q$insert into public.evento_seguimiento(evento_id, checklist) values ('c0000000-0000-0000-0000-00000000000a', '{"grupo_whatsapp":"2026-11-15T20:00:00Z"}') on conflict (evento_id) do update set checklist = excluded.checklist$q$);
select t.tiene('con el grupo creado ya no se recuerda', '2026-11-16 12:00:00+00', 'grupo_wsp:%', false);

-- Después del evento
select t.tiene('al día siguiente: se pide la boleta a los dos', '2026-11-18 12:00:00+00', 'boleta:%:1', true);
select t.valor('a los dos baristas', $q$select t.para('2026-11-18 12:00:00+00', 'boleta:%')$q$, 'dani@ejemplo.test,hilda@ejemplo.test');
select t.valor('con el monto de la boleta de honorarios', $q$select t.dato('2026-11-18 12:00:00+00', 'boleta:%', 'monto_boleta')$q$, '47198');
select t.marca('2026-11-18 12:00:00+00', 'boleta:%');
select t.tiene('2 días después no se insiste', '2026-11-19 12:00:00+00', 'boleta:%', false);
select t.tiene('a los 3 días tampoco se insiste', '2026-11-20 12:00:00+00', 'boleta:%', false);
select t.tiene('a los 4 días, segundo aviso', '2026-11-21 12:00:00+00', 'boleta:%:2', true);
-- Hilda declara su boleta
update public.postulaciones set boleta_declarada_en = '2026-11-18 15:00:00+00', boleta_declarada_folio = 'B-1' where id = 'd0000000-0000-0000-0000-0000000000b1';
select t.valor('quien ya declaró su boleta no recibe más avisos', $q$select t.para('2026-11-21 12:00:00+00', 'boleta:%')$q$, 'dani@ejemplo.test');
select t.marca('2026-11-21 12:00:00+00', 'boleta:%');
select t.tiene('a los 8 días, tercer aviso a quien no ha declarado', '2026-11-26 12:00:00+00', 'boleta:%:3', true);
select t.marca('2026-11-26 12:00:00+00', 'boleta:%');
select t.tiene('y no hay cuarto', '2026-12-06 12:00:00+00', 'boleta:%:4', false);

-- Resumen de cierre y pago
select t.tiene('con una boleta declarada por revisar, la administración recibe un resumen', '2026-11-18 12:00:00+00', 'resumen_cierre:%', true);
select t.valor('el resumen nombra a Hilda con su folio', $q$select t.dato('2026-11-18 12:00:00+00', 'resumen_cierre:%', 'boletas.0.barista') || ' ' || t.dato('2026-11-18 12:00:00+00', 'resumen_cierre:%', 'boletas.0.folio')$q$, 'Hilda Prueba B-1');
select t.marca('2026-11-18 12:00:00+00', 'resumen_cierre:%');
select t.tiene('y no se repite el mismo día', '2026-11-18 18:00:00+00', 'resumen_cierre:%', false);
select t.tiene('al día siguiente sí se vuelve a mandar', '2026-11-19 12:00:00+00', 'resumen_cierre:%', true);
select t.tiene('antes de pagar no hay aviso de pago', '2026-11-18 12:00:00+00', 'pago:%', false);
update public.postulaciones set honorarios_pagados_en = '2026-11-18', boleta_honorarios_recibida_en = '2026-11-18' where id = 'd0000000-0000-0000-0000-0000000000b1';
select t.tiene('al registrar el pago, aviso al barista', '2026-11-18 12:00:00+00', 'pago:%', true);
select t.valor('con lo que se le pagó', $q$select t.para('2026-11-18 12:00:00+00', 'pago:%') || ' ' || t.dato('2026-11-18 12:00:00+00', 'pago:%', 'pago_liquido')$q$, 'hilda@ejemplo.test 40000');
select t.marca('2026-11-18 12:00:00+00', 'pago:%');
select t.tiene('el aviso de pago no se repite', '2026-11-18 18:00:00+00', 'pago:%', false);
select t.debe_funcionar('se registra un pago antiguo que nunca se avisó', $q$update public.postulaciones set honorarios_pagados_en = '2026-11-01', boleta_honorarios_recibida_en = '2026-11-01' where id = 'd0000000-0000-0000-0000-0000000000d1'$q$);
select t.tiene('un pago registrado hace mucho no genera aviso', '2026-12-30 12:00:00+00', 'pago:%', false);
select t.tiene('en cambio, recién registrado sí avisa', '2026-11-03 12:00:00+00', 'pago:d0000000-0000-0000-0000-0000000000d1', true);
select t.tiene('con el pago hecho y sin otra boleta por revisar, no hay resumen', '2026-11-19 12:00:00+00', 'resumen_cierre:%', false);

-- Eventos cancelados no generan nada
select t.debe_funcionar('se cancela otro evento con gente sin reconfirmar', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values ('c0000000-0000-0000-0000-00000000000b', 'Auto B cancelado', '2026-11-17', '10:00', '12:00', 'Santiago', 1, 'cancelado');
  insert into public.postulaciones(id, evento_id, barista_id, estado) values ('d0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000e1', 'confirmada')$q$);
select t.tiene('un evento cancelado no genera recordatorios', '2026-11-10 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000e1:%', false);

-- Si el script no corrió unos días, los recordatorios no se amontonan en un mismo día
select t.debe_funcionar('evento con una barista sin reconfirmar y el script sin correr los días 7 y 6', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
    ('c0000000-0000-0000-0000-0000000000e1', 'Auto Retraso', '2027-03-20', '18:00', '22:00', 'Santiago', 1, 'abierto');
  insert into public.postulaciones(id, evento_id, barista_id, estado) values
    ('d0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'confirmada')$q$);
select t.tiene('a 5 días y sin recordatorios previos: parte por el 1', '2027-03-15 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000f1:1', true);
select t.marca('2027-03-15 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000f1:%');
select t.tiene('ese mismo día no sale el 2', '2027-03-15 18:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000f1:%', false);
select t.tiene('al día siguiente sí', '2027-03-16 12:00:00+00', 'recordatorio:d0000000-0000-0000-0000-0000000000f1:2', true);

-- El recordatorio del grupo de WhatsApp es de dos como máximo
select t.debe_funcionar('evento que queda OK a 7 días', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
    ('c0000000-0000-0000-0000-0000000000e2', 'Auto Grupo', '2027-03-27', '18:00', '22:00', 'Santiago', 1, 'abierto');
  insert into public.postulaciones(id, evento_id, barista_id, estado) values
    ('d0000000-0000-0000-0000-0000000000f2', 'c0000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'confirmada');
  update public.postulaciones set asistencia_confirmada_en = now() where id = 'd0000000-0000-0000-0000-0000000000f2'$q$);
select t.marca('2027-03-20 12:00:00+00', 'evento_ok:c0000000-0000-0000-0000-0000000000e2');
select t.tiene('al día siguiente: recordatorio 1 del grupo', '2027-03-21 12:00:00+00', 'grupo_wsp:c0000000-0000-0000-0000-0000000000e2:1', true);
select t.marca('2027-03-21 12:00:00+00', 'grupo_wsp:c0000000-0000-0000-0000-0000000000e2:%');
select t.marca('2027-03-22 12:00:00+00', 'grupo_wsp:c0000000-0000-0000-0000-0000000000e2:%');
select t.tiene('después de dos recordatorios no hay un tercero', '2027-03-23 12:00:00+00', 'grupo_wsp:c0000000-0000-0000-0000-0000000000e2:%', false);

-- Cupos que nunca se llenaron
select t.debe_funcionar('eventos de febrero: uno con un cupo libre, uno lleno y un borrador', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
    ('c0000000-0000-0000-0000-0000000000d1', 'Auto Cupos',    '2027-02-10', '18:00', '22:00', 'Santiago', 2, 'abierto'),
    ('c0000000-0000-0000-0000-0000000000d2', 'Auto Lleno',    '2027-02-10', '10:00', '12:00', 'Santiago', 1, 'abierto'),
    ('c0000000-0000-0000-0000-0000000000d3', 'Auto Borrador', '2027-02-10', '13:00', '15:00', 'Santiago', 2, 'borrador');
  insert into public.postulaciones(id, evento_id, barista_id, estado) values
    ('d0000000-0000-0000-0000-0000000000c1', 'c0000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', 'confirmada'),
    ('d0000000-0000-0000-0000-0000000000c2', 'c0000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e1', 'confirmada')$q$);
select t.tiene('a 6 días con un cupo libre todavía no hay aviso de vacante', '2027-02-04 12:00:00+00', 'vacante_cupos:c0000000-0000-0000-0000-0000000000d1', false);
select t.tiene('antes de las 9 no se manda', '2027-02-05 11:00:00+00', 'vacante_cupos:c0000000-0000-0000-0000-0000000000d1', false);
select t.tiene('a 5 días con un cupo libre: aviso de vacante', '2027-02-05 12:00:00+00', 'vacante_cupos:c0000000-0000-0000-0000-0000000000d1', true);
select t.valor('llega a quienes aceptaron avisos y no están asignados', $q$select t.para('2027-02-05 12:00:00+00', 'vacante_cupos:%d1')$q$, 'dani@ejemplo.test,fer@ejemplo.test,hilda@ejemplo.test');
select t.valor('trae cuántos cupos faltan', $q$select t.dato('2027-02-05 12:00:00+00', 'vacante_cupos:%d1', 'vacantes')$q$, '1');
select t.tiene('con los cupos llenos no hay aviso', '2027-02-05 12:00:00+00', 'vacante_cupos:c0000000-0000-0000-0000-0000000000d2', false);
select t.tiene('un borrador no avisa', '2027-02-05 12:00:00+00', 'vacante_cupos:c0000000-0000-0000-0000-0000000000d3', false);
select t.valor('es del tipo vacante, el mismo correo de siempre', $q$select x ->> 'tipo' from jsonb_array_elements(t.pend('2027-02-05 12:00:00+00')) x where x ->> 'clave' = 'vacante_cupos:c0000000-0000-0000-0000-0000000000d1'$q$, 'vacante');
select t.marca('2027-02-05 12:00:00+00', 'vacante_cupos:%');
select t.tiene('no se repite', '2027-02-06 12:00:00+00', 'vacante_cupos:c0000000-0000-0000-0000-0000000000d1', false);
select t.debe_funcionar('se apaga con dias_vacante_cupos = 0', $q$update public.config set dias_vacante_cupos = 0$q$);
select t.tiene('apagado, no avisa', '2027-02-08 12:00:00+00', 'vacante_cupos:c0000000-0000-0000-0000-0000000000d1', false);
select t.debe_funcionar('se vuelve a encender', $q$update public.config set dias_vacante_cupos = 5$q$);

-- El evento se abre a la inscripción (14 días antes)
select t.tiene('a 15 días no se avisa: todavía no se abre', '2027-01-26 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d1', false);
select t.tiene('a 14 días se abre: aviso a los baristas', '2027-01-27 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d1', true);
select t.valor('llega a quienes aceptaron avisos y no están asignados', $q$select t.para('2027-01-27 12:00:00+00', 'evento_nuevo:%d1')$q$, 'dani@ejemplo.test,fer@ejemplo.test,hilda@ejemplo.test');
select t.valor('trae cuántos cupos quedan', $q$select t.dato('2027-01-27 12:00:00+00', 'evento_nuevo:%d1', 'vacantes')$q$, '1');
select t.tiene('un evento lleno no avisa', '2027-01-27 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d2', false);
select t.tiene('un borrador no avisa', '2027-01-27 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d3', false);
select t.tiene('antes de las 9 no se manda', '2027-01-27 11:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d1', false);
select t.tiene('a 6 días todavía corresponde «se abrió»', '2027-02-04 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d1', true);
select t.tiene('a 5 días ya no: toca el aviso de vacante', '2027-02-05 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d1', false);
select t.marca('2027-01-27 12:00:00+00', 'evento_nuevo:%');
select t.tiene('no se repite', '2027-01-28 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000d1', false);
select t.debe_funcionar('un evento nuevo sin nadie inscrito, para probar el interruptor', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
    ('c0000000-0000-0000-0000-0000000000e3', 'Auto Interruptor', '2027-04-20', '18:00', '22:00', 'Santiago', 2, 'abierto')$q$);
select t.tiene('encendido: avisa', '2027-04-10 14:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000e3', true);
select t.debe_funcionar('se puede apagar el aviso', $q$update public.config set avisar_eventos_nuevos = false$q$);
select t.tiene('apagado: no avisa', '2027-04-10 14:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000e3', false);
select t.debe_funcionar('se vuelve a encender', $q$update public.config set avisar_eventos_nuevos = true$q$);
select t.tiene('un evento creado a 4 días no manda «se abrió» y la vacante sí', '2027-03-16 12:00:00+00', 'evento_nuevo:c0000000-0000-0000-0000-0000000000e1', false);

-- ---------------------------------------------------------------------------
-- Sincronización del calendario
-- ---------------------------------------------------------------------------
select t.debe_funcionar('evento cargado a mano que luego aparece en el calendario', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, lugar, baristas_necesarios, pago_manual, estado)
  values ('c0000000-0000-0000-0000-0000000000c3', 'Evento manual', '2026-12-12', '15:00', '23:00', 'Pirque', 'Parque X', 4, 55000, 'abierto')$q$);

select t.imp($j$[
    {"gcal_id":"g1","nombre":"Servicio de barra · Casona Uno","fecha":"2026-12-05","hora_inicio":"12:30","hora_fin":"22:30","lugar":"Casona Uno, Horcón","comuna":"Puchuncaví","descripcion":"Servicio de martinis.","baristas":3,"pago_manual":null,"cliente":"Cliente Uno","revisar":false},
    {"gcal_id":"g2","nombre":"Servicio de barra · Sin comuna","fecha":"2026-12-06","hora_inicio":"18:00","hora_fin":"23:30","lugar":"Casona Dos","comuna":null,"descripcion":null,"baristas":2,"cliente":"Cliente Dos","revisar":true,"revisar_motivo":"Falta la comuna"},
    {"gcal_id":"g3","nombre":"Nombre del calendario que no debe pisar","fecha":"2026-12-12","hora_inicio":"15:00","hora_fin":"23:00","lugar":"Parque X","comuna":"Pirque","baristas":2,"cliente":"Cliente Tres","revisar":false}
  ]$j$::jsonb, '2026-11-01', '2027-03-31');
select t.valor('primera sincronización: crea 2, adopta 1 y no hay errores', $q$
  select jsonb_array_length(r -> 'creados') || '/' || jsonb_array_length(r -> 'cambiados') || '/' || jsonb_array_length(r -> 'errores') from t.ultimo$q$, '2/0/0');
select t.valor('el evento nuevo queda abierto, para que los baristas se inscriban', $q$select estado from public.eventos where nombre = 'Servicio de barra · Casona Uno'$q$, 'abierto');
select t.valor('con sus cupos y la comuna', $q$select baristas_necesarios || ' ' || comuna from public.eventos where nombre = 'Servicio de barra · Casona Uno'$q$, '3 Puchuncaví');
select t.valor('el cliente va en la tabla privada', $q$select p.cliente from public.evento_privado p join public.eventos e on e.id = p.evento_id where e.nombre = 'Servicio de barra · Casona Uno'$q$, 'Cliente Uno');
select t.valor('la dirección queda por confirmar', $q$select d.direccion || ' | ' || d.indicaciones from public.evento_direcciones d join public.eventos e on e.id = d.evento_id where e.nombre = 'Servicio de barra · Casona Uno'$q$, 'Casona Uno, Horcón, Puchuncaví | Dirección exacta por confirmar');
select t.valor('se guarda de dónde vino', $q$select s.origen || ' ' || s.gcal_id || ' ' || s.revisar from public.evento_seguimiento s join public.eventos e on e.id = s.evento_id where e.nombre = 'Servicio de barra · Casona Uno'$q$, 'calendario g1 false');
select t.valor('sin comuna entra como «Por confirmar» y marcado para revisar', $q$select e.comuna || ' | ' || s.revisar || ' | ' || s.revisar_motivo from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id where e.nombre = 'Servicio de barra · Sin comuna'$q$, 'Por confirmar | true | Falta la comuna');
select t.valor('el evento cargado a mano se adopta sin pisarle el nombre ni el pago', $q$select e.nombre || ' | ' || e.pago_manual || ' | ' || e.baristas_necesarios || ' | ' || s.gcal_id from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id where e.id = 'c0000000-0000-0000-0000-0000000000c3'$q$, 'Evento manual | 55000 | 4 | g3');
select t.valor('y no se duplicó', $q$select count(*)::text from public.eventos where fecha = '2026-12-12'$q$, '1');
select t.valor('la última sincronización queda registrada', $q$select (ultima_sync_en is not null)::text || ' ' || (ultima_sync_resumen -> 'recibidos') from public.automatizacion$q$, 'true 3');

select t.imp($j$[
    {"gcal_id":"g1","nombre":"x","fecha":"2026-12-05","hora_inicio":"12:30","hora_fin":"22:30","lugar":"Casona Uno, Horcón","comuna":"Puchuncaví","baristas":3,"cliente":"Cliente Uno"},
    {"gcal_id":"g2","nombre":"x","fecha":"2026-12-06","hora_inicio":"18:00","hora_fin":"23:30","lugar":"Casona Dos","comuna":null,"baristas":2},
    {"gcal_id":"g3","nombre":"x","fecha":"2026-12-12","hora_inicio":"15:00","hora_fin":"23:00","lugar":"Parque X","comuna":"Pirque","baristas":2}
  ]$j$::jsonb, '2026-11-01', '2027-03-31');
select t.valor('repetir la misma sincronización no cambia nada', $q$
  select jsonb_array_length(r -> 'creados') || '/' || jsonb_array_length(r -> 'cambiados') || '/' || jsonb_array_length(r -> 'cancelados') from t.ultimo$q$, '0/0/0');

-- Lo que se edita a mano no se pisa; lo que cambia en el calendario sí se actualiza
select t.debe_funcionar('la administración renombra el evento y cambia sus cupos', $q$update public.eventos set nombre = 'Renombrado a mano', baristas_necesarios = 5 where nombre = 'Servicio de barra · Casona Uno'$q$);
select t.imp($j$[
    {"gcal_id":"g1","nombre":"x","fecha":"2026-12-08","hora_inicio":"12:30","hora_fin":"22:30","lugar":"Casona Uno, Horcón","comuna":"Puchuncaví","baristas":3},
    {"gcal_id":"g2","nombre":"x","fecha":"2026-12-06","hora_inicio":"18:00","hora_fin":"23:30","lugar":"Casona Dos","comuna":"Santiago","baristas":2},
    {"gcal_id":"g3","nombre":"x","fecha":"2026-12-12","hora_inicio":"15:00","hora_fin":"23:00","lugar":"Parque X","comuna":"Pirque","baristas":2}
  ]$j$::jsonb, '2026-11-01', '2027-03-31');
select t.valor('el calendario cambia la fecha: se informa el cambio', $q$select jsonb_array_length(r -> 'cambiados')::text from t.ultimo$q$, '1');
select t.valor('la fecha se actualiza y el evento queda marcado para revisar', $q$
  select e.fecha::text || ' ' || s.revisar::text || ' ' || coalesce(s.revisar_motivo, '(sin motivo)')
  from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id where s.gcal_id = 'g1'$q$,
  '2026-12-08 true Cambió la fecha o el horario en el calendario');
select t.valor('pero no le pisa el nombre ni los cupos que se editaron a mano', $q$
  select e.nombre || ' ' || e.baristas_necesarios from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id where s.gcal_id = 'g1'$q$,
  'Renombrado a mano 5');
select t.valor('si la comuna llega después, se completa', $q$select comuna from public.eventos where nombre = 'Servicio de barra · Sin comuna'$q$, 'Santiago');

-- Se borra del calendario
select t.imp($j$[
    {"gcal_id":"g1","nombre":"x","fecha":"2026-12-08","hora_inicio":"12:30","hora_fin":"22:30","lugar":"Casona Uno, Horcón","comuna":"Puchuncaví","baristas":3},
    {"gcal_id":"g3","nombre":"x","fecha":"2026-12-12","hora_inicio":"15:00","hora_fin":"23:00","lugar":"Parque X","comuna":"Pirque","baristas":2}
  ]$j$::jsonb, '2026-11-01', '2027-03-31');
select t.valor('un evento que se borró del calendario se informa como cancelado', $q$select r -> 'cancelados' ->> 0 from t.ultimo$q$, 'Servicio de barra · Sin comuna');
select t.valor('y queda cancelado y marcado para revisar', $q$
  select e.estado || ' | ' || s.revisar::text || ' | ' || s.revisar_motivo from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id where s.gcal_id = 'g2'$q$,
  'cancelado | true | Se borró del calendario');
select t.imp($j$[
    {"gcal_id":"g1","nombre":"x","fecha":"2026-12-08","hora_inicio":"12:30","hora_fin":"22:30","lugar":"Casona Uno, Horcón","comuna":"Puchuncaví","baristas":3},
    {"gcal_id":"g2","nombre":"x","fecha":"2026-12-06","hora_inicio":"18:00","hora_fin":"23:30","lugar":"Casona Dos","comuna":"Santiago","baristas":2},
    {"gcal_id":"g3","nombre":"x","fecha":"2026-12-12","hora_inicio":"15:00","hora_fin":"23:00","lugar":"Parque X","comuna":"Pirque","baristas":2}
  ]$j$::jsonb, '2026-11-01', '2027-03-31');
select t.valor('si vuelve a aparecer, se informa', $q$select r -> 'cambiados' ->> 0 from t.ultimo$q$, 'Servicio de barra · Sin comuna');
select t.valor('y se reabre marcado para revisar', $q$
  select e.estado || ' | ' || s.revisar_motivo from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id where s.gcal_id = 'g2'$q$,
  'abierto | Volvió a aparecer en el calendario');

-- Resguardos
select t.imp('[]'::jsonb, '2026-11-01', '2027-03-31');
select t.valor('un calendario que llega vacío avisa', $q$select r ->> 'advertencia' from t.ultimo$q$, 'El calendario llegó vacío: no se canceló nada.');
select t.valor('y no cancela nada', $q$select count(*)::text from public.eventos where estado = 'cancelado' and nombre like 'Servicio%'$q$, '0');
select t.imp($j$[
    {"gcal_id":"e1","nombre":"Mal horario","fecha":"2026-12-20","hora_inicio":"10:00","hora_fin":"10:00","lugar":"X","baristas":2},
    {"gcal_id":"g4","nombre":"Servicio de barra · Bueno","fecha":"2026-12-21","hora_inicio":"10:00","hora_fin":"14:00","lugar":"Y","comuna":"Colina","baristas":2},
    {"gcal_id":"g1","nombre":"x","fecha":"2026-12-08","hora_inicio":"12:30","hora_fin":"22:30","lugar":"Casona Uno, Horcón","comuna":"Puchuncaví","baristas":3},
    {"gcal_id":"g2","nombre":"x","fecha":"2026-12-06","hora_inicio":"18:00","hora_fin":"23:30","lugar":"Casona Dos","comuna":"Santiago","baristas":2},
    {"gcal_id":"g3","nombre":"x","fecha":"2026-12-12","hora_inicio":"15:00","hora_fin":"23:00","lugar":"Parque X","comuna":"Pirque","baristas":2}
  ]$j$::jsonb, '2026-11-01', '2027-03-31');
select t.valor('un elemento con error no frena a los demás', $q$
  select jsonb_array_length(r -> 'errores')::text || ' ' || jsonb_array_length(r -> 'creados') from t.ultimo$q$, '1 1');
select t.imp(('[' || (select string_agg(format('{"gcal_id":"m%s","nombre":"Masivo %s","fecha":"2027-01-%s","hora_inicio":"10:00","hora_fin":"14:00","lugar":"L","comuna":"Colina","baristas":2}', i, i, lpad((i + 1)::text, 2, '0')), ',') from generate_series(1, 6) i) || ',
    {"gcal_id":"g1","nombre":"x","fecha":"2026-12-08","hora_inicio":"12:30","hora_fin":"22:30","lugar":"Casona Uno, Horcón","comuna":"Puchuncaví","baristas":3},
    {"gcal_id":"g2","nombre":"x","fecha":"2026-12-06","hora_inicio":"18:00","hora_fin":"23:30","lugar":"Casona Dos","comuna":"Santiago","baristas":2},
    {"gcal_id":"g3","nombre":"x","fecha":"2026-12-12","hora_inicio":"15:00","hora_fin":"23:00","lugar":"Parque X","comuna":"Pirque","baristas":2},
    {"gcal_id":"g4","nombre":"x","fecha":"2026-12-21","hora_inicio":"10:00","hora_fin":"14:00","lugar":"Y","comuna":"Colina","baristas":2}]')::jsonb, '2026-11-01', '2027-03-31');
select t.valor('se sumaron los eventos para probar el resguardo', $q$select count(*)::text from public.eventos where nombre like 'Masivo%'$q$, '6');
select t.imp($j$[{"gcal_id":"m1","nombre":"x","fecha":"2027-01-02","hora_inicio":"10:00","hora_fin":"14:00","lugar":"L","comuna":"Colina","baristas":2}]$j$::jsonb, '2026-11-01', '2027-03-31');
select t.valor('si fueran a cancelarse casi todos, avisa', $q$select ((r ->> 'advertencia') like 'Se iban a cancelar%')::text from t.ultimo$q$, 'true');
select t.valor('y no se cancela ninguno', $q$select count(*)::text from public.eventos where nombre like 'Masivo%' and estado = 'cancelado'$q$, '0');
select t.valor('las sincronizaciones no tocan eventos que no vinieron del calendario', $q$select estado from public.eventos where id = 'c0000000-0000-0000-0000-00000000000a'$q$, 'abierto');

-- Adopción de eventos cargados a mano: mismo día y mismo horario, exactos
select t.debe_funcionar('dos eventos manuales en junio', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
    ('c0000000-0000-0000-0000-0000000000f1', 'Manual 1', '2027-06-10', '15:00', '22:00', 'Santiago', 2, 'abierto'),
    ('c0000000-0000-0000-0000-0000000000f2', 'Manual 2', '2027-06-11', '15:00', '22:00', 'Santiago', 2, 'abierto')$q$);
select t.imp($j$[
    {"gcal_id":"j9","nombre":"Servicio de barra · Distinto fin","fecha":"2027-06-10","hora_inicio":"15:00","hora_fin":"23:00","lugar":"A","comuna":"Colina","baristas":2},
    {"gcal_id":"j10","nombre":"Servicio de barra · Igual","fecha":"2027-06-11","hora_inicio":"15:00","hora_fin":"22:00","lugar":"B","comuna":"Colina","baristas":2}
  ]$j$::jsonb, '2027-06-01', '2027-06-30');
select t.valor('mismo día y mismo inicio pero otro fin: no se adopta, se crea uno nuevo', $q$select count(*)::text from public.eventos where fecha = '2027-06-10'$q$, '2');
select t.valor('mismo día y horario: se adopta', $q$select e.nombre || ' ' || s.gcal_id from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id where e.id = 'c0000000-0000-0000-0000-0000000000f2'$q$, 'Manual 2 j10');
select t.valor('y se crea solo uno', $q$select jsonb_array_length(r -> 'creados')::text from t.ultimo$q$, '1');

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;
rollback;
