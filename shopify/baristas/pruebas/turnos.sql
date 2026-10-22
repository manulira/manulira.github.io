-- Pruebas de los eventos con turnos (p. ej. Cenco Costanera: 3 horas sin camioneta y 4 horas con camioneta). Correr
-- DESPUÉS de shim-supabase.sql, esquema.sql y equipo.sql, en una base vacía de pruebas.

begin;
\ir arnes.sql

update public.config set eventos_para_confirmar = 0 where id = 1;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000a1', 'ana.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000c1', 'carla.prueba@equipo.sepiacoffee.cl');
insert into public.accesos(id, usuario, nombre, debe_cambiar_clave, admin) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba', 'Admin Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000a1', 'ana.prueba', 'Ana Prueba', false, false),
  ('00000000-0000-0000-0000-0000000000b1', 'beto.prueba', 'Beto Prueba', false, false),
  ('00000000-0000-0000-0000-0000000000c1', 'carla.prueba', 'Carla Prueba', false, false);
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos, tiene_camioneta) values
  ('00000000-0000-0000-0000-0000000000ad', 'Admin Prueba', '11.111.111-1', 'admin@ejemplo.test', '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true, false),
  ('00000000-0000-0000-0000-0000000000a1', 'Ana Prueba', '22.222.222-2', 'ana@ejemplo.test', '+56911110002', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true, true),
  ('00000000-0000-0000-0000-0000000000b1', 'Beto Prueba', '33.333.333-3', 'beto@ejemplo.test', '+56911110003', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110003', true, true, 'x', true, true, false),
  ('00000000-0000-0000-0000-0000000000c1', 'Carla Prueba', '44.444.444-4', 'carla@ejemplo.test', '+56911110004', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110004', true, true, 'x', true, true, false);
-- Dos turnos del mismo evento (como los arma el script) y un evento normal
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, lugar, baristas_necesarios, pago_manual, estado) values
  ('e1000000-0000-0000-0000-000000000003', 'Cenco Costanera · turno de 3 horas', t.hoy() + 5, '17:45', '20:45', 'Providencia', 'Cenco Costanera', 1, 25000, 'abierto'),
  ('e1000000-0000-0000-0000-000000000004', 'Cenco Costanera · turno de 4 horas', t.hoy() + 5, '17:45', '21:45', 'Providencia', 'Cenco Costanera', 1, 40000, 'abierto'),
  ('e1000000-0000-0000-0000-000000000009', 'Matrimonio Normal', t.hoy() + 6, '18:00', '23:00', 'Pirque', null, 2, 50000, 'abierto');
insert into public.evento_seguimiento (evento_id, gcal_id) values
  ('e1000000-0000-0000-0000-000000000003', 'abc@google.com|2026-10-22T17:45#3h'),
  ('e1000000-0000-0000-0000-000000000004', 'abc@google.com|2026-10-22T17:45#4h'),
  ('e1000000-0000-0000-0000-000000000009', 'xyz@google.com')
on conflict (evento_id) do update set gcal_id = excluded.gcal_id;
insert into public.evento_direcciones (evento_id, direccion) values ('e1000000-0000-0000-0000-000000000003', 'Av. Andrés Bello 2425');

create function t.yo(u text) returns void language sql as $$
  select t.como((case split_part(u, '.', 1) when 'admin' then '00000000-0000-0000-0000-0000000000ad' when 'ana' then '00000000-0000-0000-0000-0000000000a1'
                   when 'beto' then '00000000-0000-0000-0000-0000000000b1' else '00000000-0000-0000-0000-0000000000c1' end)::uuid,
                u || '@equipo.sepiacoffee.cl', 'password') $$;
create function t.post(u text) returns text language sql security definer as $$
  select coalesce(string_agg(e.nombre || ' ' || p.estado || ' ' || p.conductor, ', '), 'ninguna')
  from public.postulaciones p join public.eventos e on e.id = p.evento_id join public.accesos a on a.id = p.barista_id
  where a.usuario = u and p.estado in ('postulada', 'confirmada') $$;

-- ---------------------------------------------------------------------------
-- El equipo ve una sola tarjeta con las dos opciones
-- ---------------------------------------------------------------------------
select t.yo('beto.prueba');
select t.valor('el equipo ve una sola tarjeta para los dos turnos (y el evento normal aparte)',
  $q$select string_agg(e->>'title', ' | ' order by e->>'date') from jsonb_array_elements(public.eq_estado()->'events') e$q$, 'Cenco Costanera | Matrimonio Normal');
select t.valor('con el horario completo y los cupos de las dos opciones',
  $q$select (e->>'start') || '-' || (e->>'end') || ' ' || (e->>'slots') from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Cenco Costanera'$q$, '17:45-21:45 2');
select t.valor('cada opción dice su turno, su hora y su pago',
  $q$select (e->'turns'->>'none') || ' / ' || (e->'turns'->>'pickup') from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Cenco Costanera'$q$,
  '3 horas · sin camioneta · 17:45 a 20:45 · $25.000 / 4 horas · con camioneta · 17:45 a 21:45 · $40.000');
select t.valor('la tarjeta es la del turno sin camioneta',
  $q$select e->>'id' from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Cenco Costanera'$q$, 'e1000000-0000-0000-0000-000000000003');
select t.yo('admin.prueba');
select t.valor('la administración ve los dos turnos por separado',
  $q$select count(*)::text from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' like 'Cenco Costanera%'$q$, '2');

-- ---------------------------------------------------------------------------
-- Postular: la opción elige el turno; una sola por persona
-- ---------------------------------------------------------------------------
select t.yo('beto.prueba');
select t.debe_funcionar('Beto (sin camioneta) postula «sin camioneta»', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"none"}')$q$);
select t.valor('queda en el turno de 3 horas', $q$select t.post('beto.prueba')$q$, 'Cenco Costanera · turno de 3 horas confirmada false');
select t.valor('y lo ve en la tarjeta del grupo', $q$select (a->>'event_id') || ' ' || (a->>'vehicle_mode') from jsonb_array_elements(public.eq_estado()->'applications') a$q$, 'e1000000-0000-0000-0000-000000000003 none');
select t.valor('la tarjeta muestra el cupo sin camioneta tomado', $q$select (e->>'other_assigned') || ' ' || (e->>'pickup_assigned') from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Cenco Costanera'$q$, '1 0');
select t.valor('y ve la dirección (está confirmado)', $q$select e->>'address' from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Cenco Costanera'$q$, 'Av. Andrés Bello 2425');
select t.debe_fallar('no puede tomar también el otro turno', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"pickup"}')$q$);
select t.debe_fallar('ni postulando directo al turno de 4 horas', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000004","vehicleMode":"pickup"}')$q$);
select t.yo('carla.prueba');
select t.debe_fallar('Carla (sin camioneta) no puede tomar el turno con camioneta', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"pickup"}')$q$);
select t.debe_fallar('ni el de 4 horas sin camioneta', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000004","vehicleMode":"none"}')$q$);
select t.debe_fallar('el turno sin camioneta ya está tomado', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"none"}')$q$);
select t.yo('ana.prueba');
select t.debe_funcionar('Ana (con camioneta) postula «con camioneta»', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"pickup"}')$q$);
select t.valor('queda en el turno de 4 horas, como conductora', $q$select t.post('ana.prueba')$q$, 'Cenco Costanera · turno de 4 horas confirmada true');
select t.valor('el equipo del evento muestra a los dos', $q$select string_agg((x->>'name') || ':' || (x->>'vehicle_mode'), ', ' order by x->>'name') from jsonb_array_elements(public.eq_equipo_evento('e1000000-0000-0000-0000-000000000003')->'team') x$q$, 'Ana Prueba:pickup, Beto Prueba:none');
select t.valor('la tarjeta queda completa', $q$select (e->>'assigned') || '/' || (e->>'slots') from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Cenco Costanera'$q$, '2/2');
select t.debe_funcionar('Ana cancela desde la tarjeta del grupo', $q$select public.eq_accion('cancelApplication', '{"eventId":"e1000000-0000-0000-0000-000000000003"}')$q$);
select t.valor('y se libera su turno de 4 horas', $q$select t.post('ana.prueba')$q$, 'ninguna');

-- ---------------------------------------------------------------------------
-- Qué turno exige camioneta se puede fijar a mano; un evento normal no cambia
-- ---------------------------------------------------------------------------
select t.root();
update public.eventos set exige_camioneta = false where id = 'e1000000-0000-0000-0000-000000000004';
update public.eventos set exige_camioneta = true where id = 'e1000000-0000-0000-0000-000000000003';
select t.valor('con exige_camioneta puesto a mano, manda eso', $q$select string_agg(opcion, ',' order by opcion) || ' ' || public.eq_turno_de('e1000000-0000-0000-0000-000000000004', 'pickup') from public.eq_turnos('e1000000-0000-0000-0000-000000000004')$q$, 'none,pickup e1000000-0000-0000-0000-000000000003');
update public.eventos set exige_camioneta = null where id in ('e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000004');
select t.valor('un evento normal no tiene grupo', $q$select coalesce(public.eq_grupo('e1000000-0000-0000-0000-000000000009'), 'sin grupo')$q$, 'sin grupo');
select t.yo('carla.prueba');
select t.debe_funcionar('en un evento normal se postula como siempre', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000009","vehicleMode":"none"}')$q$);
select t.valor('y queda en ese evento', $q$select t.post('carla.prueba')$q$, 'Matrimonio Normal confirmada false');

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
