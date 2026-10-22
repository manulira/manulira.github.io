-- Pruebas de las solicitudes de ingreso («Trabaja con nosotros»), el correo con el ID y la clave temporal,
-- la confirmación de postulaciones (sola desde 2 eventos trabajados) y la tarjeta amarilla. Correr DESPUÉS de
-- shim-supabase.sql, esquema.sql y equipo.sql, en una base vacía de pruebas. Termina imprimiendo cuántas
-- pasaron y cuáles fallaron.

begin;
\ir arnes.sql

update public.automatizacion set secreto_hash = encode(sha256(convert_to('clave-de-prueba', 'UTF8')), 'hex');
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000b1', 'vieja.prueba@equipo.sepiacoffee.cl');
insert into public.accesos(id, usuario, nombre, debe_cambiar_clave, admin) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba', 'Admin Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba', 'Nueva Prueba', false, false),
  ('00000000-0000-0000-0000-0000000000b1', 'vieja.prueba', 'Vieja Prueba', false, false);
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos, tiene_camioneta) values
  ('00000000-0000-0000-0000-0000000000ad', 'Admin Prueba', '11.111.111-1', 'admin@ejemplo.test', '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true, false),
  ('00000000-0000-0000-0000-0000000000a1', 'Nueva Prueba', '22.222.222-2', 'nueva@ejemplo.test', '+56911110002', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true, true),
  ('00000000-0000-0000-0000-0000000000b1', 'Vieja Prueba', '33.333.333-3', 'vieja@ejemplo.test', '+56911110003', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110003', true, true, 'x', true, true, false);
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, pago_manual, estado) values
  ('e1000000-0000-0000-0000-000000000001', 'Pasado Uno', t.hoy() - 20, '18:00', '22:00', 'Pirque', 3, 40000, 'cerrado'),
  ('e1000000-0000-0000-0000-000000000002', 'Pasado Dos', t.hoy() - 10, '18:00', '22:00', 'Pirque', 3, 40000, 'cerrado'),
  ('e1000000-0000-0000-0000-000000000003', 'Abierto Uno', t.hoy() + 5, '18:00', '22:00', 'Pirque', 3, 40000, 'abierto'),
  ('e1000000-0000-0000-0000-000000000004', 'Abierto Dos', t.hoy() + 6, '18:00', '22:00', 'Pirque', 3, 40000, 'abierto');
-- Vieja ya trabajó dos eventos (con asistencia registrada)
insert into public.postulaciones (evento_id, barista_id, estado, asistio) values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'confirmada', true),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'confirmada', true);

create function t.yo_admin() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000ad', 'admin.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.yo_nueva() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.yo_vieja() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000b1', 'vieja.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.sol(c text) returns uuid language sql security definer as $$ select id from public.solicitudes where correo = c $$;
create function t.acc(u text) returns uuid language sql security definer as $$ select id from public.accesos where usuario = u $$;
create function t.estado_post(ev text, b text) returns text language sql security definer as $$
  select coalesce((select p.estado from public.postulaciones p where p.evento_id = ev::uuid and p.barista_id = b::uuid), 'ninguna') $$;

-- ---------------------------------------------------------------------------
-- Solicitudes: las manda cualquiera, las ve solo la administración
-- ---------------------------------------------------------------------------
select t.anonimo();
select t.debe_fallar('sin nombre no se manda', $q$select public.solicitar_ingreso('{"correo":"a@ejemplo.test","telefono":"+56912345678"}')$q$);
select t.debe_fallar('con un correo malo no se manda', $q$select public.solicitar_ingreso('{"nombre":"Camila Pérez","correo":"camila","telefono":"+56912345678"}')$q$);
select t.debe_fallar('sin teléfono no se manda', $q$select public.solicitar_ingreso('{"nombre":"Camila Pérez","correo":"camila@ejemplo.test"}')$q$);
select t.debe_fallar('menores de edad no', $q$select public.solicitar_ingreso('{"nombre":"Camila Pérez","correo":"camila@ejemplo.test","telefono":"+56912345678","edad":"16"}')$q$);
select t.valor('sin sesión, una persona manda su solicitud', $q$select public.solicitar_ingreso('{"nombre":"  Camila   Pérez Soto ","correo":"Camila@Ejemplo.test","telefono":"+56 9 1234 5678","edad":"24","experiencia":"1 a 3 años","mensaje":"Me encanta el café"}')->>'ok'$q$, 'true');
select t.debe_funcionar('si la manda de nuevo con el mismo correo', $q$select public.solicitar_ingreso('{"nombre":"Camila Pérez Soto","correo":"camila@ejemplo.test","telefono":"+56 9 1234 5678","mensaje":"Corrijo: me encanta el café de especialidad"}')$q$);
select t.debe_funcionar('otra persona también postula', $q$select public.solicitar_ingreso('{"nombre":"Pedro Ñúñez","correo":"pedro@ejemplo.test","telefono":"+56987654321"}')$q$);
select t.debe_fallar('sin sesión no se pueden leer las solicitudes', 'select * from public.solicitudes');
select t.root();
select t.valor('la segunda vez se actualizó, no se duplicó', $q$select count(*) || ' ' || max(mensaje) from public.solicitudes where correo = 'camila@ejemplo.test'$q$, '1 Corrijo: me encanta el café de especialidad');
select t.valor('el nombre queda sin espacios de más', $q$select nombre from public.solicitudes where correo = 'camila@ejemplo.test'$q$, 'Camila Pérez Soto');
select t.yo_nueva();
select t.debe_fallar('un barista no lee las solicitudes', 'select * from public.solicitudes');
select t.valor('ni le llegan en su paquete de datos', $q$select jsonb_array_length(public.eq_estado()->'requests')::text$q$, '0');
select t.debe_fallar('ni puede aprobarlas', $q$select public.eq_accion('requestStatus', jsonb_build_object('id', t.sol('camila@ejemplo.test'), 'status', 'approved'))$q$);
select t.yo_admin();
select t.valor('la administración ve las dos solicitudes pendientes en la consola', $q$select jsonb_array_length(public.eq_estado()->'requests')::text$q$, '2');
select t.valor('con sus datos y experiencia', $q$select r->>'name' || ' | ' || (r->>'age') || ' | ' || (r->>'experience') from jsonb_array_elements(public.eq_estado()->'requests') r where r->>'email' = 'camila@ejemplo.test'$q$, 'Camila Pérez Soto | 24 | 1 a 3 años');
select t.valor('en «Vista barista» no aparecen', $q$select jsonb_array_length(public.eq_estado('barista')->'requests')::text$q$, '0');

-- Llega el aviso a contacto@ (por el script)
select t.anonimo();
select t.valor('el script ve el aviso de solicitud nueva para contacto@', $q$select string_agg(x->'para'->0->>'email', ',') from jsonb_array_elements(public.api_pendientes('clave-de-prueba')) x where x->>'tipo' = 'solicitud_nueva'$q$, 'contacto@sepiacoffee.cl,contacto@sepiacoffee.cl');

-- ---------------------------------------------------------------------------
-- Aprobar: se crea el acceso y el correo con el ID y la clave queda para el script
-- ---------------------------------------------------------------------------
select t.yo_admin();
select t.valor('al aprobar se crea su ID', $q$select public.eq_accion('requestStatus', jsonb_build_object('id', t.sol('camila@ejemplo.test'), 'status', 'approved'))->>'usuario'$q$, 'camila.perez');
select t.debe_fallar('no se aprueba dos veces', $q$select public.eq_accion('requestStatus', jsonb_build_object('id', t.sol('camila@ejemplo.test'), 'status', 'approved'))$q$);
select t.valor('se rechaza la otra', $q$select public.eq_accion('requestStatus', jsonb_build_object('id', t.sol('pedro@ejemplo.test'), 'status', 'rejected'))->>'estado'$q$, 'rechazada');
select t.valor('ya no quedan pendientes', $q$select jsonb_array_length(public.eq_estado()->'requests')::text$q$, '0');
select t.root();
select t.valor('la cuenta queda creada y pidiendo cambiar la clave', $q$select usuario || ' ' || nombre || ' ' || debe_cambiar_clave from public.accesos where usuario = 'camila.perez'$q$, 'camila.perez Camila Pérez Soto true');
select t.valor('si otra persona se llama igual, recibe otro ID', $q$select public.usuario_desde_nombre('Camila Pérez')$q$, 'camila.perez2');
select t.anonimo();
select t.valor('el script recibe el correo para Camila con su ID y su clave', $q$select (x->'para'->0->>'email') || ' ' || (x->'datos'->>'usuario') || ' ' || (char_length(x->'datos'->>'clave') > 8) from jsonb_array_elements(public.api_pendientes('clave-de-prueba')) x where x->>'tipo' = 'acceso_nuevo'$q$, 'camila@ejemplo.test camila.perez true');
select t.debe_fallar('sin la clave de la automatización no se ve nada', $q$select public.api_pendientes('otra')$q$);
select t.debe_fallar('nadie lee la cola de correos desde la web', 'select * from public.accesos_por_enviar');
select t.valor('al marcarlo como enviado', $q$select public.api_marcar('clave-de-prueba', (select jsonb_agg(x->'clave') from jsonb_array_elements(public.api_pendientes('clave-de-prueba')) x where x->>'tipo' = 'acceso_nuevo'))::text$q$, '1');
select t.root();
select t.valor('la clave temporal se borra de la cola', $q$select (clave is null) || ' ' || (enviado_en is not null) from public.accesos_por_enviar$q$, 'true true');
select t.anonimo();
select t.valor('y no se vuelve a mandar', $q$select count(*)::text from jsonb_array_elements(public.api_pendientes('clave-de-prueba')) x where x->>'tipo' = 'acceso_nuevo'$q$, '0');
-- Si se restablece la clave antes de que salga el correo, ese correo ya no sale
select t.yo_admin();
select t.debe_funcionar('se aprueba otra solicitud', $q$select public.solicitar_ingreso('{"nombre":"Rosa Díaz","correo":"rosa@ejemplo.test","telefono":"+56911112222"}'); select public.eq_accion('requestStatus', jsonb_build_object('id', t.sol('rosa@ejemplo.test'), 'status', 'approved'))$q$);
select t.debe_funcionar('y se le restablece la clave antes del correo', $q$select public.restablecer_clave(t.acc('rosa.diaz'))$q$);
select t.anonimo();
select t.valor('su correo de bienvenida ya no sale (la clave cambió)', $q$select count(*)::text from jsonb_array_elements(public.api_pendientes('clave-de-prueba')) x where x->>'tipo' = 'acceso_nuevo'$q$, '0');

-- ---------------------------------------------------------------------------
-- Postular: con menos de 2 eventos espera confirmación; con 2 o más se confirma sola
-- ---------------------------------------------------------------------------
select t.yo_nueva();
select t.valor('Nueva (sin eventos trabajados) postula y queda pendiente', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"pickup"}')->>'pending'$q$, 'true');
select t.valor('en la base está «postulada» y pidió ir con camioneta', $q$select t.estado_post('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1') || ' ' || (select pide_camioneta from public.postulaciones where barista_id = '00000000-0000-0000-0000-0000000000a1')$q$, 'postulada true');
select t.valor('ella la ve como pendiente', $q$select a->>'status' from jsonb_array_elements(public.eq_estado()->'applications') a where a->>'event_id' = 'e1000000-0000-0000-0000-000000000003'$q$, 'pending');
select t.valor('y no ocupa cupo todavía', $q$select e->>'assigned' from jsonb_array_elements(public.eq_estado()->'events') e where e->>'id' = 'e1000000-0000-0000-0000-000000000003'$q$, '0');
select t.debe_fallar('no puede confirmarse sola', $q$select public.eq_accion('applicationStatus', '{"eventId":"e1000000-0000-0000-0000-000000000003","memberId":"00000000-0000-0000-0000-0000000000a1","status":"approved"}')$q$);
select t.yo_vieja();
select t.valor('Vieja (2 eventos trabajados) postula y queda confirmada al tiro', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"none"}')->>'pending'$q$, 'false');
select t.valor('en la base está «confirmada»', $q$select t.estado_post('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1')$q$, 'confirmada');
select t.yo_admin();
select t.valor('la administración ve la pendiente de Nueva, con cuántos eventos lleva', $q$select (a->>'status') || ' ' || (select m->>'eventsWorked' from jsonb_array_elements(public.eq_estado()->'members') m where m->>'id' = a->>'member_id') from jsonb_array_elements(public.eq_estado()->'applications') a where a->>'member_id' = '00000000-0000-0000-0000-0000000000a1'$q$, 'pending 0');
select t.debe_funcionar('y la confirma', $q$select public.eq_accion('applicationStatus', '{"eventId":"e1000000-0000-0000-0000-000000000003","memberId":"00000000-0000-0000-0000-0000000000a1","status":"approved"}')$q$);
select t.valor('queda confirmada y con la camioneta que pidió', $q$select estado || ' ' || conductor from public.postulaciones where evento_id = 'e1000000-0000-0000-0000-000000000003' and barista_id = '00000000-0000-0000-0000-0000000000a1'$q$, 'confirmada true');
select t.yo_nueva();
select t.debe_funcionar('Nueva postula a otro evento', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000004","vehicleMode":"none"}')$q$);
select t.yo_admin();
select t.debe_funcionar('la administración la rechaza', $q$select public.eq_accion('rejectApplication', '{"eventId":"e1000000-0000-0000-0000-000000000004","memberId":"00000000-0000-0000-0000-0000000000a1"}')$q$);
select t.valor('queda rechazada', $q$select t.estado_post('e1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1')$q$, 'rechazada');
select t.root();
select t.valor('la administración se confirma sola aunque no tenga eventos', $q$select public.confirma_solo('00000000-0000-0000-0000-0000000000ad')::text$q$, 'true');
select t.valor('los turnos del historial también cuentan', $q$insert into public.historial_turnos (nombre, fecha, acceso_id) values ('Nueva Prueba', t.hoy() - 300, '00000000-0000-0000-0000-0000000000a1'), ('Nueva Prueba', t.hoy() - 200, '00000000-0000-0000-0000-0000000000a1'); select public.eventos_trabajados('00000000-0000-0000-0000-0000000000a1')::text$q$, '2');
delete from public.historial_turnos;

-- ---------------------------------------------------------------------------
-- Tarjeta amarilla: solo la ve la administración; mientras la tenga, necesita confirmación
-- ---------------------------------------------------------------------------
select t.yo_vieja();
select t.debe_fallar('un barista no puede poner amarillas', $q$select public.eq_accion('yellowCard', '{"memberId":"00000000-0000-0000-0000-0000000000a1","on":true}')$q$);
select t.debe_fallar('ni con la función directa', $q$select public.poner_amarilla('00000000-0000-0000-0000-0000000000a1')$q$);
select t.yo_admin();
select t.debe_funcionar('la administración le pone amarilla a Vieja', $q$select public.eq_accion('yellowCard', '{"memberId":"00000000-0000-0000-0000-0000000000b1","on":true}')$q$);
select t.valor('y la ve en el equipo', $q$select m->>'yellow' from jsonb_array_elements(public.eq_estado()->'members') m where m->>'id' = '00000000-0000-0000-0000-0000000000b1'$q$, 'true');
select t.yo_vieja();
select t.debe_fallar('Vieja no puede leer las amarillas', 'select * from public.amarillas');
select t.valor('ni aparece en sus datos', $q$select (public.eq_estado()::text like '%yellow%')::text$q$, 'false');
select t.valor('ahora, aunque lleva 2 eventos, su postulación espera confirmación', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000004","vehicleMode":"none"}')->>'pending'$q$, 'true');
select t.yo_admin();
select t.valor('la administración ve que la pendiente tiene amarilla', $q$select a->>'yellow' from jsonb_array_elements(public.eq_estado()->'applications') a where a->>'member_id' = '00000000-0000-0000-0000-0000000000b1' and a->>'event_id' = 'e1000000-0000-0000-0000-000000000004'$q$, 'true');
select t.debe_funcionar('la confirma', $q$select public.eq_accion('applicationStatus', '{"eventId":"e1000000-0000-0000-0000-000000000004","memberId":"00000000-0000-0000-0000-0000000000b1","status":"approved"}')$q$);
-- Un evento anterior a la amarilla no la quita
select t.root();
update public.postulaciones set asistio = null where evento_id = 'e1000000-0000-0000-0000-000000000002' and barista_id = '00000000-0000-0000-0000-0000000000b1';
update public.postulaciones set asistio = true where evento_id = 'e1000000-0000-0000-0000-000000000002' and barista_id = '00000000-0000-0000-0000-0000000000b1';
select t.valor('registrar un evento anterior a la amarilla no la quita', $q$select public.tiene_amarilla('00000000-0000-0000-0000-0000000000b1')::text$q$, 'true');
-- El evento posterior sale bien: se quita sola
update public.eventos set fecha = t.hoy() - 1 where id = 'e1000000-0000-0000-0000-000000000004';
update public.amarillas set puesta_en = now() - interval '3 days';
update public.postulaciones set asistio = true where evento_id = 'e1000000-0000-0000-0000-000000000004' and barista_id = '00000000-0000-0000-0000-0000000000b1';
select t.valor('cuando el evento siguiente sale bien (asistió), la amarilla se quita sola', $q$select public.tiene_amarilla('00000000-0000-0000-0000-0000000000b1')::text$q$, 'false');
select t.yo_admin();
select t.debe_funcionar('la administración también la puede quitar a mano', $q$select public.eq_accion('yellowCard', '{"memberId":"00000000-0000-0000-0000-0000000000a1","on":true}'); select public.eq_accion('yellowCard', '{"memberId":"00000000-0000-0000-0000-0000000000a1","on":false}')$q$);
select t.valor('y queda sin amarilla', $q$select m->>'yellow' from jsonb_array_elements(public.eq_estado()->'members') m where m->>'id' = '00000000-0000-0000-0000-0000000000a1'$q$, 'false');

select t.debe_funcionar('también se le puede poner a alguien que todavía no entra ni completa su perfil', $q$select public.eq_accion('yellowCard', jsonb_build_object('memberId', t.acc('camila.perez'), 'on', true))$q$);
select t.valor('y queda con amarilla', $q$select m->>'yellow' from jsonb_array_elements(public.eq_estado()->'members') m where m->>'username' = 'camila.perez'$q$, 'true');
select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
