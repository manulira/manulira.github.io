-- Pruebas de las funciones de «Sepia Equipo» (equipo.sql): el paquete de datos, el perfil, postular con
-- cupos y camioneta, cancelar, administración de eventos, ranking, equipo, ayuda y avisos.
-- Correr DESPUÉS de shim-supabase.sql, esquema.sql y equipo.sql, en una base vacía de pruebas.

begin;
\ir arnes.sql

-- RUT válido a partir de un número (calcula el dígito verificador)
create function t.rut(n int) returns text language plpgsql security definer as $$
declare s text := n::text; suma int := 0; f int := 2; i int; r int;
begin
  for i in reverse char_length(s)..1 loop suma := suma + substr(s, i, 1)::int * f; f := case when f = 7 then 2 else f + 1 end; end loop;
  r := 11 - (suma % 11);
  return public.eq_formato_rut(s || case r when 11 then '0' when 10 then 'K' else r::text end);
end $$;
create function t.id_foto(et text) returns uuid language sql security definer as $$ select id from public.evento_fotos where etapa = et limit 1 $$;
create function t.cupos(ev uuid) returns int language sql security definer as $$ select asignados from public.eq_cupos(ev) $$;
create function t.n_avisos(u uuid, solo_leidos boolean) returns int language sql security definer as $$ select count(*)::int from public.avisos where barista_id = u and (not solo_leidos or leido_en is not null) $$;
create function t.id_aviso(u uuid) returns uuid language sql security definer as $$ select id from public.avisos where barista_id = u limit 1 $$;
create function t.datos_perfil(n text, rutn int, camioneta text default 'none') returns jsonb language sql as $$
  select jsonb_build_object('profile', jsonb_build_object(
    'fullName', n, 'email', lower(split_part(n, ' ', 1)) || '@ejemplo.test', 'phone', '+56 9 1234 56' || lpad((rutn % 100)::text, 2, '0'),
    'rut', t.rut(rutn), 'shirt', 'M', 'bank', 'BCI', 'accountType', 'CuentaRUT', 'accountNumber', '1234' || rutn,
    'vehicleType', camioneta, 'hasPickup', camioneta = 'pickup', 'vehicleDeclared', true, 'whatsapp', true)) $$;

-- Personas: admin, y baristas con acceso
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'ana@equipo.sepiacoffee.cl'),   -- con camioneta
  ('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000c1', 'carla@equipo.sepiacoffee.cl'), -- sin perfil
  ('00000000-0000-0000-0000-0000000000d1', 'dani@equipo.sepiacoffee.cl'),  -- desactivada
  ('00000000-0000-0000-0000-0000000000e1', 'eli@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000f1', 'fer@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000a3', 'hilda@equipo.sepiacoffee.cl'), -- debe cambiar la clave
  ('00000000-0000-0000-0000-0000000000a4', 'zoe@ejemplo.test');            -- cuenta sin acceso
insert into public.admins(email) values ('admin@ejemplo.test');
insert into public.accesos(id, usuario, nombre, debe_cambiar_clave, activo) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana.prueba', 'Ana Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000b1', 'beto.prueba', 'Beto Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000c1', 'carla.prueba', 'Carla Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000d1', 'dani.prueba', 'Dani Prueba', false, false),
  ('00000000-0000-0000-0000-0000000000e1', 'eli.prueba', 'Eli Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000f1', 'fer.prueba', 'Fer Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000a2', 'gus.prueba', 'Gus Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000a3', 'hilda.prueba', 'Hilda Prueba', true, true);

-- Eventos (fechas desde hoy, en hora de Santiago)
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, lugar, descripcion, baristas_necesarios, pago_manual, estado, servicio, uniforme, tiene_maquina) values
  ('e1000000-0000-0000-0000-000000000001', 'Matrimonio Tres Cupos', t.hoy() + 6, '18:00', '23:00', 'Pirque', 'Viña', 'Tenida negra', 3, 50000, 'abierto', 'Carrito Espresso Martini', 'Camisa negra', true),
  ('e1000000-0000-0000-0000-000000000002', 'Coffee Break Un Cupo', t.hoy() + 7, '09:00', '11:00', 'Las Condes', null, null, 1, 25000, 'abierto', null, null, null),
  ('e1000000-0000-0000-0000-000000000003', 'Borrador Secreto', t.hoy() + 8, '16:00', '19:00', 'Santiago', null, null, 2, 40000, 'borrador', null, null, null),
  ('e1000000-0000-0000-0000-000000000004', 'Evento Lejano', t.hoy() + 40, '16:00', '19:00', 'Colina', null, null, 2, 40000, 'abierto', null, null, null),
  ('e1000000-0000-0000-0000-000000000005', 'Evento Cancelado', t.hoy() + 9, '16:00', '19:00', 'Colina', null, null, 2, 40000, 'cancelado', null, null, null),
  ('e1000000-0000-0000-0000-000000000006', 'Evento Pasado', t.hoy() - 5, '16:00', '20:00', 'Santiago', null, null, 2, 40000, 'abierto', null, null, null),
  ('e1000000-0000-0000-0000-000000000007', 'Evento Mañana Temprano', t.hoy() + 1, '00:30', '03:00', 'Santiago', null, null, 2, 40000, 'abierto', null, null, null);
insert into public.evento_privado (evento_id, cliente) values ('e1000000-0000-0000-0000-000000000001', 'Familia Reservada');
insert into public.evento_direcciones (evento_id, direccion, indicaciones) values ('e1000000-0000-0000-0000-000000000001', 'Camino Falso 123', 'Portón verde');
insert into public.evento_seguimiento (evento_id) select id from public.eventos on conflict do nothing;

-- ---------------------------------------------------------------------------
-- El paquete de datos según quién consulta
-- ---------------------------------------------------------------------------
select t.anonimo();
select t.debe_fallar('sin sesión no se pregunta nada', 'select public.eq_estado()');
select t.como('00000000-0000-0000-0000-0000000000a4', 'zoe@ejemplo.test');
select t.valor('una cuenta sin acceso ve «no permitido» y ningún evento', $q$select (public.eq_estado()->>'allowed') || ' ' || jsonb_array_length(public.eq_estado()->'events')$q$, 'false 0');
select t.como('00000000-0000-0000-0000-0000000000a3', 'hilda@equipo.sepiacoffee.cl');
select t.valor('quien debe cambiar la clave solo recibe esa orden', $q$select (public.eq_estado()->>'passwordRequired') || ' ' || jsonb_array_length(public.eq_estado()->'events')$q$, 'true 0');
select t.como('00000000-0000-0000-0000-0000000000d1', 'dani@equipo.sepiacoffee.cl');
select t.valor('un acceso desactivado no entra', $q$select (public.eq_estado()->>'allowed')$q$, 'false');
select t.como('00000000-0000-0000-0000-0000000000c1', 'carla@equipo.sepiacoffee.cl');
select t.valor('sin perfil: se le pide completarlo y no ve eventos', $q$select (public.eq_estado()->>'profileRequired') || ' ' || jsonb_array_length(public.eq_estado()->'events') || ' ' || (public.eq_estado()->>'memberId' is null)$q$, 'true 0 true');
select t.valor('su correo no es el inventado: la interfaz lo deja vacío (.invalid)', $q$select public.eq_estado()->'user'->>'email'$q$, 'carla.prueba@sepia.invalid');

-- ---------------------------------------------------------------------------
-- Perfil
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000c1', 'carla@equipo.sepiacoffee.cl');
select t.debe_fallar('un nombre sin apellido no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla', 20000011), '{profile,fullName}', '"Carla"'))$q$);
select t.debe_fallar('un correo inválido no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,email}', '"no es correo"'))$q$);
select t.debe_fallar('un teléfono que no es celular chileno no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,phone}', '"12345"'))$q$);
select t.debe_fallar('un RUT con dígito verificador malo no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,rut}', '"11.111.111-2"'))$q$);
select t.debe_fallar('sin talla no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,shirt}', '""'))$q$);
select t.debe_fallar('sin tipo de cuenta no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,accountType}', '""'))$q$);
select t.debe_fallar('un número de cuenta con letras no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,accountNumber}', '"abc12"'))$q$);
select t.debe_fallar('sin decir si tiene camioneta no sirve', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,vehicleType}', '""'))$q$);
select t.filas('mientras tanto no se creó ningún perfil', $q$select * from public.baristas where id = '00000000-0000-0000-0000-0000000000c1'$q$, 0);
select t.debe_funcionar('un perfil bueno se guarda', $q$select public.eq_accion('profile', t.datos_perfil('Carla Soto', 20000011))$q$);
select t.valor('queda con el teléfono normalizado, el RUT con puntos y el tipo de cuenta de la base', $q$select telefono || ' ' || (rut = t.rut(20000011))::text || ' ' || tipo_cuenta from public.baristas where id = auth.uid()$q$, '+56912345611 true Cuenta RUT');
select t.debe_funcionar('y se puede corregir después', $q$select public.eq_accion('profile', jsonb_set(t.datos_perfil('Carla Soto', 20000011), '{profile,shirt}', '"L"'))$q$);
select t.valor('la talla cambió y el perfil sigue siendo uno solo', $q$select talla_camisa || ' ' || (select count(*) from public.baristas where id = auth.uid()) from public.baristas where id = auth.uid()$q$, 'L 1');
select t.valor('el perfil guarda el aviso aceptado (boleta y privacidad) para cumplir con la ley', $q$select (acepta_boleta and acepta_privacidad and cuenta_propia)::text from public.baristas where id = auth.uid()$q$, 'true');

select t.como('00000000-0000-0000-0000-0000000000a1', 'ana@equipo.sepiacoffee.cl');
select t.debe_funcionar('Ana crea su perfil, con camioneta', $q$select public.eq_accion('profile', t.datos_perfil('Ana Prueba', 20000012, 'pickup'))$q$);
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.debe_fallar('Beto no puede usar el RUT de Carla', $q$select public.eq_accion('profile', t.datos_perfil('Beto Prueba', 20000011))$q$);
select t.debe_funcionar('Beto crea su perfil, sin camioneta', $q$select public.eq_accion('profile', t.datos_perfil('Beto Prueba', 20000013, 'none'))$q$);
select t.como('00000000-0000-0000-0000-0000000000e1', 'eli@equipo.sepiacoffee.cl');
select t.debe_funcionar('Eli crea su perfil', $q$select public.eq_accion('profile', t.datos_perfil('Eli Prueba', 20000014, 'none'))$q$);
select t.como('00000000-0000-0000-0000-0000000000f1', 'fer@equipo.sepiacoffee.cl');
select t.debe_funcionar('Fer crea su perfil', $q$select public.eq_accion('profile', t.datos_perfil('Fer Prueba', 20000015, 'none'))$q$);
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.debe_funcionar('Gus crea su perfil, con camioneta', $q$select public.eq_accion('profile', t.datos_perfil('Gus Prueba', 20000016, 'pickup'))$q$);
select t.como('00000000-0000-0000-0000-0000000000d1', 'dani@equipo.sepiacoffee.cl');
select t.debe_fallar('una cuenta desactivada no crea perfil', $q$select public.eq_accion('profile', t.datos_perfil('Dani Prueba', 20000017))$q$);

-- ---------------------------------------------------------------------------
-- Qué ve cada uno de los eventos
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('Beto ve los eventos abiertos dentro de 14 días (no el borrador, ni el lejano, ni el cancelado, ni el pasado sin postular a él)',
  $q$select string_agg(e ->> 'title', ' | ' order by e ->> 'date') from jsonb_array_elements(public.eq_estado()->'events') e$q$,
  'Evento Pasado | Evento Mañana Temprano | Matrimonio Tres Cupos | Coffee Break Un Cupo');
select t.valor('sin confirmar, Beto no ve la dirección ni el cliente', $q$select (e ->> 'address') || '|' || (e ->> 'client') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, '|');
select t.valor('ni el traslado: solo sabe que hay camioneta', $q$select (e -> 'transport')::text from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, '{"enabled": true}');
select t.valor('el evento trae sus cupos, el pago y la hora en el formato de la interfaz', $q$select (e ->> 'slots') || ' ' || (e ->> 'pay') || ' ' || (e ->> 'start') || '-' || (e ->> 'end') || ' ' || (e ->> 'status') || ' ' || (e ->> 'location') || ' ' || (e ->> 'next_day') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, '3 50000 18:00-23:00 published Viña, Pirque 0');
select t.valor('un evento que cruza la medianoche trae next_day = 1 (lo comprobamos con el de la administración, más abajo)', $q$select '1'$q$, '1');

-- ---------------------------------------------------------------------------
-- Postular: cupos, camioneta, orden de llegada
-- ---------------------------------------------------------------------------
-- E1 tiene 3 cupos: 1 con camioneta y 2 sin camioneta
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.debe_fallar('quien no declaró camioneta no puede ir «con camioneta»', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"pickup"}')$q$);
select t.debe_fallar('hay que elegir un modo', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001"}')$q$);
select t.debe_funcionar('Beto postula sin camioneta y queda confirmado al tiro', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"none"}')$q$);
select t.valor('su postulación queda confirmada, sin conductor y con la reconfirmación puesta', $q$select estado || ' ' || conductor || ' ' || (asistencia_confirmada_en is not null) from public.postulaciones where barista_id = auth.uid() and evento_id = 'e1000000-0000-0000-0000-000000000001'$q$, 'confirmada false true');
select t.debe_fallar('no puede postular dos veces', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"none"}')$q$);
select t.valor('ahora Beto ve la dirección del evento (ya está confirmado) y la indicación', $q$select (e ->> 'address') || ' | ' || (e ->> 'notes') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, E'Camino Falso 123 | Tenida negra\nIndicaciones: Portón verde');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('la administración ve la descripción tal cual (sin las indicaciones agregadas, que son para el equipo)', $q$select e ->> 'notes' from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, 'Tenida negra');
select t.debe_funcionar('y guardar un evento tal como lo recibió no cambia nada', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', (select e from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos')))$q$);
select t.debe_funcionar('y guardarlo otra vez tampoco', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', (select e from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos')))$q$);
select t.valor('la descripción sigue igual: las indicaciones no se duplican', $q$select descripcion from public.eventos where nombre = 'Matrimonio Tres Cupos'$q$, 'Tenida negra');
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.como('00000000-0000-0000-0000-0000000000e1', 'eli@equipo.sepiacoffee.cl');
select t.debe_funcionar('Eli postula sin camioneta (segundo cupo sin camioneta)', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"none"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000f1', 'fer@equipo.sepiacoffee.cl');
select t.debe_fallar('Fer no entra sin camioneta: el último cupo está reservado para la camioneta', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"none"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000a1', 'ana@equipo.sepiacoffee.cl');
select t.debe_funcionar('Ana, que tiene camioneta, toma el cupo con camioneta', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"pickup"}')$q$);
select t.valor('y queda como conductora', $q$select conductor::text from public.postulaciones where barista_id = auth.uid() and evento_id = 'e1000000-0000-0000-0000-000000000001'$q$, 'true');
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.debe_fallar('con los 3 cupos tomados, Gus ya no puede', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"pickup"}')$q$);
select t.valor('el evento muestra 3 asignados: 1 con camioneta y 2 sin', $q$select (e ->> 'assigned') || ' ' || (e ->> 'pickup_assigned') || ' ' || (e ->> 'other_assigned') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, '3 1 2');

-- E2 tiene un solo cupo
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.debe_funcionar('en un evento de 1 cupo, el primero se lo lleva (aunque sea sin camioneta)', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000002","vehicleMode":"none"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000a1', 'ana@equipo.sepiacoffee.cl');
select t.debe_fallar('y la camioneta ya no tiene dónde', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000002","vehicleMode":"pickup"}')$q$);

-- Eventos donde no se puede postular
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.debe_fallar('un borrador no se postula', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"none"}')$q$);
select t.debe_fallar('uno que todavía no está en la ventana de 14 días, tampoco', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000004","vehicleMode":"none"}')$q$);
select t.debe_fallar('uno cancelado, tampoco', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000005","vehicleMode":"none"}')$q$);
select t.debe_fallar('uno que ya pasó, tampoco', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000006","vehicleMode":"none"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000c1', 'carla@equipo.sepiacoffee.cl');
select t.debe_funcionar('Carla tiene perfil (lo completó arriba): puede postular a un evento libre', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000007","vehicleMode":"none"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000d1', 'dani@equipo.sepiacoffee.cl');
select t.debe_fallar('una cuenta desactivada no postula', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000007","vehicleMode":"none"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000a4', 'zoe@ejemplo.test');
select t.debe_fallar('quien no es barista ni administración tampoco', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000007","vehicleMode":"none"}')$q$);

-- ---------------------------------------------------------------------------
-- Cancelar: hasta 24 horas antes
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000e1', 'eli@equipo.sepiacoffee.cl');
select t.debe_funcionar('Eli cancela su turno del Matrimonio (faltan 6 días)', $q$select public.eq_accion('cancelApplication', '{"eventId":"e1000000-0000-0000-0000-000000000001"}')$q$);
select t.valor('su turno queda cancelado y el cupo libre', $q$select (select estado from public.postulaciones where barista_id = auth.uid() and evento_id = 'e1000000-0000-0000-0000-000000000001') || ' ' || t.cupos('e1000000-0000-0000-0000-000000000001')$q$, 'retirada 2');
select t.debe_fallar('no se cancela dos veces', $q$select public.eq_accion('cancelApplication', '{"eventId":"e1000000-0000-0000-0000-000000000001"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000f1', 'fer@equipo.sepiacoffee.cl');
select t.debe_funcionar('Fer toma el cupo que quedó libre', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"none"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000c1', 'carla@equipo.sepiacoffee.cl');
select t.debe_fallar('Carla no puede cancelar un turno que empieza en menos de 24 horas', $q$select public.eq_accion('cancelApplication', '{"eventId":"e1000000-0000-0000-0000-000000000007"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000e1', 'eli@equipo.sepiacoffee.cl');
select t.debe_fallar('Fer ocupó el cupo: Eli ya no puede volver al Matrimonio (cupos cerrados)', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000001","vehicleMode":"none"}')$q$);

-- ---------------------------------------------------------------------------
-- Administración
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('la administración (en vista de administración) es admin y puede cambiar de vista', $q$select (public.eq_estado()->>'admin') || ' ' || (public.eq_estado()->>'canAdmin')$q$, 'true true');
select t.valor('ve todos los eventos, también borrador, lejano, cancelado y pasado', $q$select jsonb_array_length(public.eq_estado()->'events')::text$q$, '7');
select t.valor('y el cliente y la dirección', $q$select (e ->> 'client') || ' | ' || (e ->> 'address') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, 'Familia Reservada | Camino Falso 123');
select t.valor('con el traslado completo', $q$select (e -> 'transport' ->> 'enabled') || ' ' || (e -> 'transport' ->> 'routeMode') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, 'true manual');
select t.valor('el conductor del evento es Ana', $q$select (e -> 'transport' ->> 'driverMemberId') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Matrimonio Tres Cupos'$q$, '00000000-0000-0000-0000-0000000000a1');
select t.valor('ve todas las postulaciones, con nombre', $q$select count(*) || ' ' || bool_and(a ->> 'name' is not null) from jsonb_array_elements(public.eq_estado()->'applications') a$q$, '6 true');
select t.valor('y las canceladas salen como «cancelled»', $q$select count(*)::text from jsonb_array_elements(public.eq_estado()->'applications') a where a ->> 'status' = 'cancelled'$q$, '1');
select t.valor('el equipo: 8 personas (todas las cuentas de barista, activas o no)', $q$select jsonb_array_length(public.eq_estado()->'members')::text$q$, '8');
select t.valor('con su estado: Dani desactivada, Hilda invitada, el resto activa', $q$select string_agg((m ->> 'name') || ':' || (m ->> 'status'), ', ' order by m ->> 'name') from jsonb_array_elements(public.eq_estado()->'members') m where m ->> 'name' in ('Dani Prueba', 'Hilda Prueba', 'Ana Prueba')$q$, 'Ana Prueba:active, Dani Prueba:disabled, Hilda Prueba:invited');
select t.valor('y los datos de cada perfil (Ana: camioneta)', $q$select (m -> 'profile' ->> 'vehicleType') || ' ' || (m -> 'profile' ->> 'shirt') from jsonb_array_elements(public.eq_estado()->'members') m where m ->> 'name' = 'Ana Prueba'$q$, 'pickup M');
select t.valor('en la vista de barista, la administración ve como barista (admin = false, puede volver)', $q$select (public.eq_estado('barista')->>'admin') || ' ' || (public.eq_estado('barista')->>'canAdmin')$q$, 'false true');
select t.valor('y los borradores no aparecen en esa vista', $q$select count(*)::text from jsonb_array_elements(public.eq_estado('barista')->'events') e where e ->> 'status' = 'draft'$q$, '0');

-- Guardar eventos
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_fallar('sin nombre no se guarda', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object('title', '', 'date', t.hoy() + 3, 'start', '10:00', 'end', '12:00', 'slots', 2, 'status', 'draft', 'compensation', '{"mode":"fixed","pay":30000}'::jsonb)))$q$);
select t.debe_fallar('con inicio y término iguales no sirve', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object('title', 'Prueba', 'date', t.hoy() + 3, 'start', '10:00', 'end', '10:00', 'slots', 2, 'status', 'draft', 'compensation', '{"mode":"fixed","pay":30000}'::jsonb)))$q$);
select t.debe_fallar('con 0 cupos no sirve', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object('title', 'Prueba', 'date', t.hoy() + 3, 'start', '10:00', 'end', '12:00', 'slots', 0, 'status', 'draft', 'compensation', '{"mode":"fixed","pay":30000}'::jsonb)))$q$);
select t.debe_fallar('sin monto no sirve', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object('title', 'Prueba', 'date', t.hoy() + 3, 'start', '10:00', 'end', '12:00', 'slots', 2, 'status', 'draft', 'compensation', '{"mode":"fixed"}'::jsonb)))$q$);
select t.debe_funcionar('crea un evento nuevo (borrador) con todos sus datos', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'title', 'Lanzamiento Nocturno', 'date', t.hoy() + 3, 'start', '23:00', 'end', '02:00', 'nextDay', true, 'slots', 4, 'status', 'draft',
  'client', 'Empresa Secreta', 'location', 'Huechuraba, Santiago', 'address', 'Av. El Salto 5000', 'service', 'Activación Mall',
  'uniform', 'Camisa negra', 'notes', 'Sin alcohol', 'has_machine', true,
  'compensation', '{"mode":"fixed","pay":42000}'::jsonb,
  'transport', '{"enabled":true,"roundTrip":true,"manualKm":40,"manualToll":3500,"manualNote":"Ruta Waze"}'::jsonb)))$q$);
select t.valor('quedó en la base con lugar y comuna separados', $q$select lugar || ' | ' || comuna || ' | ' || estado || ' | ' || pago_manual || ' | ' || servicio || ' | ' || uniforme || ' | ' || tiene_maquina from public.eventos where nombre = 'Lanzamiento Nocturno'$q$, 'Huechuraba | Santiago | borrador | 42000 | Activación Mall | Camisa negra | true');
select t.valor('con cliente, dirección y traslado en sus tablas privadas', $q$select (select cliente from public.evento_privado where evento_id = e.id) || ' | ' || (select direccion from public.evento_direcciones where evento_id = e.id) || ' | ' || (select km || '/' || tag || '/' || nota from public.evento_traslado where evento_id = e.id) from public.eventos e where nombre = 'Lanzamiento Nocturno'$q$, 'Empresa Secreta | Av. El Salto 5000 | 40/3500/Ruta Waze');
select t.valor('la interfaz lo ve como evento nocturno (+1 día), con la bencina calculada (40 km ÷ 10 × 1.400 = 5.600)', $q$select (e ->> 'next_day') || ' ' || (e -> 'transport' ->> 'fuel') || ' ' || (e ->> 'has_machine') || ' ' || (e ->> 'location') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Lanzamiento Nocturno'$q$, '1 5600 1 Huechuraba, Santiago');
select t.debe_funcionar('lo edita y lo publica', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'id', (select id from public.eventos where nombre = 'Lanzamiento Nocturno'), 'title', 'Lanzamiento Nocturno', 'date', t.hoy() + 3, 'start', '23:00', 'end', '02:00', 'slots', 4, 'status', 'published',
  'client', 'Empresa Secreta', 'location', 'Huechuraba, Santiago', 'address', 'Av. El Salto 5000', 'compensation', '{"mode":"fixed","pay":45000}'::jsonb)))$q$);
select t.valor('quedó abierto con el monto nuevo', $q$select estado || ' ' || pago_manual from public.eventos where nombre = 'Lanzamiento Nocturno'$q$, 'abierto 45000');
select t.debe_fallar('un evento publicado no vuelve a borrador', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'id', (select id from public.eventos where nombre = 'Lanzamiento Nocturno'), 'title', 'Lanzamiento Nocturno', 'date', t.hoy() + 3, 'start', '23:00', 'end', '02:00', 'slots', 4, 'status', 'draft', 'compensation', '{"mode":"fixed","pay":45000}'::jsonb)))$q$);
select t.debe_funcionar('pago por horas: de 20:00 a 02:30 = 6,5 h × $10.000 = $65.000', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'title', 'Servicio por Horas', 'date', t.hoy() + 4, 'start', '21:00', 'end', '01:00', 'slots', 2, 'status', 'draft',
  'compensation', jsonb_build_object('mode', 'hourly', 'start', ((t.hoy() + 4)::text || ' 20:00-04')::timestamptz, 'end', ((t.hoy() + 5)::text || ' 02:30-04')::timestamptz))))$q$);
select t.valor('el monto queda calculado', $q$select modo_pago || ' ' || pago_manual from public.eventos where nombre = 'Servicio por Horas'$q$, 'horas 65000');
select t.valor('y la interfaz lo ve como «hourly» con 390 minutos', $q$select (e -> 'compensation' ->> 'mode') || ' ' || (e -> 'compensation' ->> 'minutes') from jsonb_array_elements(public.eq_estado()->'events') e where e ->> 'title' = 'Servicio por Horas'$q$, 'hourly 390');
select t.debe_fallar('el regreso tiene que ser después de la salida', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'title', 'Mal Horario', 'date', t.hoy() + 4, 'start', '21:00', 'end', '01:00', 'slots', 2, 'status', 'draft',
  'compensation', jsonb_build_object('mode', 'hourly', 'start', ((t.hoy() + 5)::text || ' 02:30-04')::timestamptz, 'end', ((t.hoy() + 4)::text || ' 20:00-04')::timestamptz))))$q$);
select t.como('00000000-0000-0000-0000-0000000000a1', 'ana@equipo.sepiacoffee.cl');
select t.debe_fallar('una barista no guarda eventos', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object('title', 'Intruso', 'date', t.hoy() + 3, 'start', '10:00', 'end', '12:00', 'slots', 2, 'status', 'published', 'compensation', '{"mode":"fixed","pay":30000}'::jsonb)))$q$);
select t.debe_fallar('ni asigna', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000002","memberId":"00000000-0000-0000-0000-0000000000a1","vehicleMode":"none"}')$q$);
select t.debe_fallar('ni cambia el acceso de nadie', $q$select public.eq_accion('memberStatus', '{"id":"00000000-0000-0000-0000-0000000000b1","status":"disabled"}')$q$);

-- Asignar, confirmar y sacar gente
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_fallar('no se asigna a quien aún no tiene perfil (Hilda debe cambiar su clave y no tiene perfil)', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000002","memberId":"00000000-0000-0000-0000-0000000000a3","vehicleMode":"none"}')$q$);
select t.debe_fallar('ni a una cuenta desactivada', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000007","memberId":"00000000-0000-0000-0000-0000000000d1","vehicleMode":"none"}')$q$);
select t.debe_fallar('ni «con camioneta» a quien no la declaró', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000007","memberId":"00000000-0000-0000-0000-0000000000b1","vehicleMode":"pickup"}')$q$);
select t.debe_funcionar('asigna a Gus (con camioneta) al evento de mañana temprano', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000007","memberId":"00000000-0000-0000-0000-0000000000a2","vehicleMode":"pickup"}')$q$);
select t.debe_fallar('el evento de mañana ya tiene 2 asignados (Carla y Gus): no cabe otro', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000007","memberId":"00000000-0000-0000-0000-0000000000f1","vehicleMode":"none"}')$q$);
select t.debe_fallar('a Gus no se le asigna dos veces', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000007","memberId":"00000000-0000-0000-0000-0000000000a2","vehicleMode":"pickup"}')$q$);
select t.debe_funcionar('la administración puede asignar a un evento que no se publicó', $q$select public.eq_accion('assignBarista', '{"eventId":"e1000000-0000-0000-0000-000000000003","memberId":"00000000-0000-0000-0000-0000000000e1","vehicleMode":"none"}')$q$);
select t.debe_funcionar('y sacar a alguien', $q$select public.eq_accion('removeApplication', '{"eventId":"e1000000-0000-0000-0000-000000000003","memberId":"00000000-0000-0000-0000-0000000000e1"}')$q$);
select t.valor('quien fue sacado queda como cancelado', $q$select estado from public.postulaciones where evento_id = 'e1000000-0000-0000-0000-000000000003' and barista_id = '00000000-0000-0000-0000-0000000000e1'$q$, 'retirada');
-- una postulación pendiente (del portal anterior) se confirma
select t.root();
insert into public.postulaciones (evento_id, barista_id, estado) values ('e1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e1', 'postulada');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('la postulación pendiente sale como «pending»', $q$select a ->> 'status' from jsonb_array_elements(public.eq_estado()->'applications') a where a ->> 'event_id' = 'e1000000-0000-0000-0000-000000000004'$q$, 'pending');
select t.debe_funcionar('la administración la confirma', $q$select public.eq_accion('applicationStatus', '{"eventId":"e1000000-0000-0000-0000-000000000004","memberId":"00000000-0000-0000-0000-0000000000e1","status":"approved"}')$q$);
select t.valor('y queda confirmada', $q$select estado from public.postulaciones where evento_id = 'e1000000-0000-0000-0000-000000000004' and barista_id = '00000000-0000-0000-0000-0000000000e1'$q$, 'confirmada');
select t.debe_fallar('«approved» es el único cambio de estado válido', $q$select public.eq_accion('applicationStatus', '{"eventId":"e1000000-0000-0000-0000-000000000004","memberId":"00000000-0000-0000-0000-0000000000e1","status":"rejected"}')$q$);
select t.debe_fallar('una acción desconocida falla', $q$select public.eq_accion('borrarTodo', '{}')$q$);

-- Activar y desactivar accesos
select t.debe_funcionar('desactiva el acceso de Fer', $q$select public.eq_accion('memberStatus', '{"id":"00000000-0000-0000-0000-0000000000f1","status":"disabled"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000f1', 'fer@equipo.sepiacoffee.cl');
select t.valor('Fer ya no entra', $q$select (public.eq_estado()->>'allowed')$q$, 'false');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('y se lo restaura', $q$select public.eq_accion('memberStatus', '{"id":"00000000-0000-0000-0000-0000000000f1","status":"active"}')$q$);
select t.como('00000000-0000-0000-0000-0000000000f1', 'fer@equipo.sepiacoffee.cl');
select t.valor('Fer vuelve a entrar', $q$select (public.eq_estado()->>'allowed')$q$, 'true');

-- Cancelar y cerrar un evento
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('cierra el evento pasado: los confirmados quedan como «trabajado»', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'id', 'e1000000-0000-0000-0000-000000000006', 'title', 'Evento Pasado', 'date', t.hoy() - 5, 'start', '16:00', 'end', '20:00', 'slots', 2, 'status', 'closed', 'location', 'Santiago', 'compensation', '{"mode":"fixed","pay":40000}'::jsonb)))$q$);
select t.root();
insert into public.postulaciones (evento_id, barista_id, estado) values ('e1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000b1', 'confirmada');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('lo vuelve a guardar cerrado', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'id', 'e1000000-0000-0000-0000-000000000006', 'title', 'Evento Pasado', 'date', t.hoy() - 5, 'start', '16:00', 'end', '20:00', 'slots', 2, 'status', 'closed', 'location', 'Santiago', 'compensation', '{"mode":"fixed","pay":40000}'::jsonb)))$q$);
select t.valor('Beto queda como «trabajado»', $q$select asistio::text from public.postulaciones where evento_id = 'e1000000-0000-0000-0000-000000000006' and barista_id = '00000000-0000-0000-0000-0000000000b1'$q$, 'true');
select t.debe_funcionar('cancela el Matrimonio: se cancelan las postulaciones', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'id', 'e1000000-0000-0000-0000-000000000001', 'title', 'Matrimonio Tres Cupos', 'date', t.hoy() + 6, 'start', '18:00', 'end', '23:00', 'slots', 3, 'status', 'cancelled', 'location', 'Viña, Pirque', 'compensation', '{"mode":"fixed","pay":50000}'::jsonb)))$q$);
select t.valor('ya no queda nadie confirmado', $q$select count(*)::text from public.postulaciones where evento_id = 'e1000000-0000-0000-0000-000000000001' and estado in ('confirmada', 'postulada')$q$, '0');
select t.debe_fallar('un evento cancelado no se reabre', $q$select public.eq_accion('saveEvent', jsonb_build_object('event', jsonb_build_object(
  'id', 'e1000000-0000-0000-0000-000000000001', 'title', 'Matrimonio Tres Cupos', 'date', t.hoy() + 6, 'start', '18:00', 'end', '23:00', 'slots', 3, 'status', 'published', 'location', 'Viña, Pirque', 'compensation', '{"mode":"fixed","pay":50000}'::jsonb)))$q$);

-- ---------------------------------------------------------------------------
-- Ranking, equipo, ayuda y avisos
-- ---------------------------------------------------------------------------
select t.root();
insert into public.historial_turnos (nombre, fecha, evento, horas, acceso_id) values
  ('Ana Prueba', t.hoy() - 90, 'Antiguo 1', 4, '00000000-0000-0000-0000-0000000000a1'),
  ('Ana Prueba', t.hoy() - 80, 'Antiguo 2', 4, '00000000-0000-0000-0000-0000000000a1'),
  ('Gus Prueba', t.hoy() - 70, 'Antiguo 3', 4, '00000000-0000-0000-0000-0000000000a2');
update public.baristas set turnos_previos = 3 where id = '00000000-0000-0000-0000-0000000000e1';
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('el ranking trae a cada uno con su total: Ana 2 (historial), Beto 1 (trabajado), Eli 3 (previos), Gus 1', $q$select string_agg((m ->> 'name') || ':' || (m ->> 'total'), ', ' order by m ->> 'name') from jsonb_array_elements(public.eq_ranking()->'members') m where (m ->> 'total')::int > 0$q$, 'Ana Prueba:2, Beto Prueba:1, Eli Prueba:3, Gus Prueba:1');
select t.valor('con el detalle por mes (Beto: 1 el mes del evento pasado)', $q$select (m -> 'byMonth')::text from jsonb_array_elements(public.eq_ranking()->'members') m where m ->> 'name' = 'Beto Prueba'$q$, '{"' || to_char(current_date - 5, 'YYYY-MM') || '": 1}');
select t.valor('el ranking no trae datos privados', $q$select (public.eq_ranking()->'members'->0) ?| array['rut', 'phone', 'email', 'bank']$q$, 'false');
select t.como('00000000-0000-0000-0000-0000000000a4', 'zoe@ejemplo.test');
select t.debe_fallar('quien no es del equipo no ve el ranking', 'select public.eq_ranking()');
select t.anonimo();
select t.debe_fallar('sin sesión tampoco', 'select public.eq_ranking()');

select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('«Ver equipo» de un evento: solo los confirmados (Gus y Carla en el de mañana temprano, la conductora primero)', $q$select string_agg((m ->> 'name') || ':' || (m ->> 'vehicle_mode'), ', ') from jsonb_array_elements(public.eq_equipo_evento('e1000000-0000-0000-0000-000000000007')->'team') m$q$, 'Gus Prueba:pickup, Carla Soto:none');
select t.debe_fallar('de un borrador, no', $q$select public.eq_equipo_evento('e1000000-0000-0000-0000-000000000003')$q$);
select t.valor('la ayuda trae el teléfono de contacto', $q$select (public.eq_ayuda('e1000000-0000-0000-0000-000000000007')->'contacts'->0->>'phone')$q$, '56979284400');
select t.como('00000000-0000-0000-0000-0000000000a4', 'zoe@ejemplo.test');
select t.debe_fallar('y solo para quien es del equipo', $q$select public.eq_ayuda()$q$);

-- Avisos: el recordatorio del turno de mañana, desde las 18:00 de hoy (hora de Chile)
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.valor('antes de las 18:00 no hay aviso', $q$select jsonb_array_length(public.eq_avisos(((t.hoy())::text || ' 17:59:00')::timestamp at time zone 'America/Santiago')->'notifications')::text$q$, '0');
select t.valor('a las 18:00 aparece el recordatorio con la hora y el uniforme', $q$select jsonb_array_length(public.eq_avisos(((t.hoy())::text || ' 18:00:00')::timestamp at time zone 'America/Santiago')->'notifications') || ' ' || (public.eq_avisos(((t.hoy())::text || ' 18:00:00')::timestamp at time zone 'America/Santiago')->'notifications'->0->>'title')$q$, '1 Mañana tienes turno: Evento Mañana Temprano');
select t.valor('no se repite al volver a pedirlo', $q$select t.n_avisos(auth.uid(), false)::text$q$, '1');
select t.debe_funcionar('lo marca leído', $q$select public.eq_avisos_leer(t.id_aviso(auth.uid()))$q$);
select t.valor('y ya no sale', $q$select jsonb_array_length(public.eq_avisos(((t.hoy())::text || ' 19:00:00')::timestamp at time zone 'America/Santiago')->'notifications')::text$q$, '0');
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('a Beto, que no va a ese evento, no le llega', $q$select jsonb_array_length(public.eq_avisos(((t.hoy())::text || ' 19:00:00')::timestamp at time zone 'America/Santiago')->'notifications')::text$q$, '0');
select t.como('00000000-0000-0000-0000-0000000000a1', 'ana@equipo.sepiacoffee.cl');
select t.debe_funcionar('Ana intenta marcar como leído el aviso de Gus', $q$select public.eq_avisos_leer(t.id_aviso('00000000-0000-0000-0000-0000000000a2'))$q$);
select t.valor('y no lo logra: el aviso de Gus ya estaba leído por él, pero el de otra persona nunca se toca desde otra cuenta', $q$select t.n_avisos('00000000-0000-0000-0000-0000000000a2', true)::text$q$, '1');

-- ---------------------------------------------------------------------------
-- Ganancias, conexiones, fotos de perfil y fotos de eventos
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('«Mis turnos y ganancias»: Beto ve solo lo suyo (un turno trabajado de $40.000 pendiente de pago)', $q$select (public.eq_ganancias()->'profiles') -> 0 ->> 'name' || ' ' || jsonb_array_length(public.eq_ganancias()->'profiles') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 ->> 'worked') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 ->> 'earned') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 ->> 'pending') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 ->> 'paid')$q$, 'Beto Prueba 1 1 40000 40000 0');
select t.valor('con el detalle del turno', $q$select ((public.eq_ganancias()->'profiles') -> 0 -> 'items' -> 0 ->> 'title') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 -> 'items' -> 0 ->> 'paymentStatus')$q$, 'Evento Pasado pending');
select t.valor('y no puede pedir el de otra persona', $q$select jsonb_array_length(public.eq_ganancias('00000000-0000-0000-0000-0000000000a1')->'profiles')::text$q$, '0');
select t.como('00000000-0000-0000-0000-0000000000a1', 'ana@equipo.sepiacoffee.cl');
select t.valor('Ana: dos turnos del historial anterior a la app, sin montos', $q$select ((public.eq_ganancias()->'profiles') -> 0 ->> 'worked') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 ->> 'historicalWorked') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 ->> 'earned')$q$, '2 2 0');
select t.valor('la fecha hasta donde llega el historial', $q$select public.eq_ganancias()->>'historyThrough'$q$, to_char(t.hoy() - 70, 'DD-MM-YYYY'));
select t.como('00000000-0000-0000-0000-0000000000a4', 'zoe@ejemplo.test');
select t.debe_fallar('quien no es del equipo no ve ganancias', 'select public.eq_ganancias()');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('la administración ve a todas las personas con perfil o historial', $q$select jsonb_array_length(public.eq_ganancias()->'profiles')::text$q$, '6');
select t.valor('y puede pedir una sola', $q$select jsonb_array_length(public.eq_ganancias('00000000-0000-0000-0000-0000000000b1')->'profiles')::text$q$, '1');
select t.root();
update public.postulaciones set honorarios_pagados_en = t.hoy() where barista_id = '00000000-0000-0000-0000-0000000000b1' and evento_id = 'e1000000-0000-0000-0000-000000000006';
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('al registrarse el pago, pasa a «pagado»', $q$select ((public.eq_ganancias()->'profiles') -> 0 ->> 'paid') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 ->> 'pending') || ' ' || ((public.eq_ganancias()->'profiles') -> 0 -> 'items' -> 0 ->> 'paymentStatus')$q$, '40000 0 paid');

select t.debe_fallar('Beto no ve las conexiones', 'select public.eq_integraciones()');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('la administración ve el modo manual y el precio del diésel', $q$select (public.eq_integraciones()->'routes'->>'mode') || ' ' || ((public.eq_integraciones()->'quote'->>'price')::int > 0)$q$, 'manual true');

-- Fotos de perfil (solo las rutas, a quienes son del equipo)
select t.root();
update public.baristas set foto_path = id::text || '/perfil.jpg' where id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1');
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('un barista ve las rutas de las fotos que existen', $q$select (select count(*) from jsonb_object_keys(public.eq_fotos_perfil(array['00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1']::uuid[])))::text$q$, '2');
select t.como('00000000-0000-0000-0000-0000000000a4', 'zoe@ejemplo.test');
select t.debe_fallar('y quien no es del equipo no ve ninguna', $q$select public.eq_fotos_perfil(array['00000000-0000-0000-0000-0000000000a2']::uuid[])$q$);

-- Registro fotográfico del evento de mañana (confirmados: Gus y Carla)
select t.root();
insert into storage.objects (bucket_id, name, owner) values
  ('eventos-fotos', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/uno.jpg', '00000000-0000-0000-0000-0000000000a2'),
  ('eventos-fotos', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/dos.jpg', '00000000-0000-0000-0000-0000000000a2'),
  ('eventos-fotos', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000c1/otra.jpg', '00000000-0000-0000-0000-0000000000c1');
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.valor('Gus registra su foto de «auto cargado» y queda con su nombre, para borrarla', $q$select (public.eq_foto_registrar('e1000000-0000-0000-0000-000000000007', 'loaded', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/uno.jpg')->'photo'->>'author') || ' ' || (public.eq_foto_registrar('e1000000-0000-0000-0000-000000000007', 'mounted', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/dos.jpg')->'photo'->>'canDelete')$q$, 'Gus Prueba true');
select t.debe_fallar('no se anota una foto que no existe', $q$select public.eq_foto_registrar('e1000000-0000-0000-0000-000000000007', 'loaded', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/fantasma.jpg')$q$);
select t.debe_fallar('ni una con la ruta de otra persona', $q$select public.eq_foto_registrar('e1000000-0000-0000-0000-000000000007', 'loaded', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000c1/otra.jpg')$q$);
select t.debe_fallar('ni con una etapa inventada', $q$select public.eq_foto_registrar('e1000000-0000-0000-0000-000000000007', 'cualquiera', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/uno.jpg')$q$);
select t.valor('ve las fotos del evento (las suyas, borrables)', $q$select jsonb_array_length(public.eq_fotos_evento('e1000000-0000-0000-0000-000000000007')->'photos') || ' ' || (public.eq_fotos_evento('e1000000-0000-0000-0000-000000000007')->'photos'->0->>'canDelete')$q$, '2 true');
select t.como('00000000-0000-0000-0000-0000000000c1', 'carla@equipo.sepiacoffee.cl');
select t.valor('Carla, confirmada en el mismo evento, ve las fotos de Gus pero no puede borrarlas', $q$select jsonb_array_length(public.eq_fotos_evento('e1000000-0000-0000-0000-000000000007')->'photos') || ' ' || (public.eq_fotos_evento('e1000000-0000-0000-0000-000000000007')->'photos'->0->>'canDelete')$q$, '2 false');
select t.debe_fallar('Carla no borra la foto de Gus', $q$select public.eq_foto_borrar(t.id_foto('loaded'))$q$);
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.debe_fallar('Beto, que no va a ese evento, no ve las fotos', $q$select public.eq_fotos_evento('e1000000-0000-0000-0000-000000000007')$q$);
select t.debe_fallar('ni sube fotos', $q$select public.eq_foto_registrar('e1000000-0000-0000-0000-000000000007', 'loaded', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000b1/x.jpg')$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('la administración ve las fotos de cualquier evento', $q$select jsonb_array_length(public.eq_fotos_evento('e1000000-0000-0000-0000-000000000007')->'photos')::text$q$, '2');

-- Almacenamiento: las mismas reglas, aplicadas por la base a los archivos
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.valor('Gus ve los archivos de su evento', $q$select count(*)::text from storage.objects where bucket_id = 'eventos-fotos'$q$, '3');
select t.debe_funcionar('y sube uno nuevo en su carpeta', $q$insert into storage.objects (bucket_id, name, owner) values ('eventos-fotos', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/tres.jpg', '00000000-0000-0000-0000-0000000000a2')$q$);
select t.debe_fallar('pero no en la carpeta de otra persona', $q$insert into storage.objects (bucket_id, name, owner) values ('eventos-fotos', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000c1/falsa.jpg', '00000000-0000-0000-0000-0000000000a2')$q$);
select t.debe_fallar('ni en un evento al que no va', $q$insert into storage.objects (bucket_id, name, owner) values ('eventos-fotos', 'e1000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-0000000000a2/x.jpg', '00000000-0000-0000-0000-0000000000a2')$q$);
select t.afecta('borra su propio archivo', $q$delete from storage.objects where bucket_id = 'eventos-fotos' and name = 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/tres.jpg'$q$, 1);
select t.afecta('pero no el de Carla', $q$delete from storage.objects where bucket_id = 'eventos-fotos' and name = 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000c1/otra.jpg'$q$, 0);
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto@equipo.sepiacoffee.cl');
select t.valor('Beto no ve ningún archivo de eventos', $q$select count(*)::text from storage.objects where bucket_id = 'eventos-fotos'$q$, '0');
select t.debe_fallar('y no sube', $q$insert into storage.objects (bucket_id, name, owner) values ('eventos-fotos', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000b1/x.jpg', '00000000-0000-0000-0000-0000000000b1')$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.afecta('la administración borra cualquiera', $q$delete from storage.objects where bucket_id = 'eventos-fotos' and name = 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000c1/otra.jpg'$q$, 1);

-- Borrar el registro
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.valor('Gus borra su foto y recibe la ruta del archivo para quitarlo', $q$select public.eq_foto_borrar(t.id_foto('loaded'))$q$, 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/uno.jpg');
select t.valor('queda una', $q$select jsonb_array_length(public.eq_fotos_evento('e1000000-0000-0000-0000-000000000007')->'photos')::text$q$, '1');
select t.root();
update public.eventos set estado = 'cancelado' where id = 'e1000000-0000-0000-0000-000000000007';
select t.como('00000000-0000-0000-0000-0000000000a2', 'gus@equipo.sepiacoffee.cl');
select t.debe_fallar('si el evento se cancela, ya no se suben fotos', $q$select public.eq_foto_registrar('e1000000-0000-0000-0000-000000000007', 'returned', 'e1000000-0000-0000-0000-000000000007/00000000-0000-0000-0000-0000000000a2/dos.jpg')$q$);

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
