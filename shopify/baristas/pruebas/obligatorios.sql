-- Pruebas de la foto de perfil y los avisos obligatorios (Jorge, 23 oct). Correr DESPUÉS de shim-supabase.sql,
-- esquema.sql y equipo.sql, en una base vacía de pruebas.

begin;
\ir arnes.sql

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000a2', 'con.foto@equipo.sepiacoffee.cl');
insert into public.accesos(id, usuario, nombre, debe_cambiar_clave) values
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba', 'Nueva Prueba', false),
  ('00000000-0000-0000-0000-0000000000a2', 'con.foto', 'Con Foto', false);
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, pago_manual, estado) values
  ('e1000000-0000-0000-0000-000000000003', 'Abierto Uno', t.hoy() + 5, '18:00', '22:00', 'Pirque', 3, 40000, 'abierto');
insert into public.evento_seguimiento (evento_id) values ('e1000000-0000-0000-0000-000000000003') on conflict do nothing;
update public.config set eventos_para_confirmar = 0, foto_obligatoria = true where id = 1;
create function t.yo_nueva() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.yo_foto() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000a2', 'con.foto@equipo.sepiacoffee.cl', 'password') $$;
create function t.perfil(rut text, correo text) returns jsonb language sql as $$
  select jsonb_build_object('profile', jsonb_build_object('fullName', 'Nueva Prueba', 'email', correo, 'phone', '+56 9 1111 2222', 'rut', rut,
    'shirt', 'M', 'bank', 'BCI', 'accountType', 'Cuenta vista', 'accountNumber', '123456', 'vehicleType', 'none', 'whatsapp', false)) $$;

-- Avisos por correo: quedan activados al guardar el perfil, aunque la persona no marque nada
select t.yo_nueva();
select t.debe_funcionar('una persona nueva guarda su perfil sin marcar avisos', $q$select public.eq_accion('profile', t.perfil('22.222.222-2', 'nueva@ejemplo.test'))$q$);
select t.root();
select t.valor('igual queda con los avisos por correo activados', $q$select acepta_avisos::text from public.baristas where id = '00000000-0000-0000-0000-0000000000a1'$q$, 'true');
select t.yo_nueva();
select t.debe_funcionar('vuelve a guardar su perfil', $q$select public.eq_accion('profile', t.perfil('22.222.222-2', 'nueva@ejemplo.test'))$q$);
select t.root();
update public.baristas set acepta_avisos = false where id = '00000000-0000-0000-0000-0000000000a1';
select t.yo_nueva();
select t.debe_funcionar('y si se hubieran apagado, al guardar se vuelven a activar', $q$select public.eq_accion('profile', t.perfil('22.222.222-2', 'nueva@ejemplo.test'))$q$);
select t.root();
select t.valor('quedan activados', $q$select acepta_avisos::text from public.baristas where id = '00000000-0000-0000-0000-0000000000a1'$q$, 'true');

-- Foto obligatoria
select t.yo_nueva();
select t.valor('sin foto, la consola pide la foto', $q$select (public.eq_estado()->>'photoRequired')$q$, 'true');
select t.debe_fallar('sin foto no puede postular', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"none"}')$q$);
select t.root();
select t.valor('y no quedó postulada', $q$select count(*)::text from public.postulaciones where barista_id = '00000000-0000-0000-0000-0000000000a1'$q$, '0');
update public.baristas set foto_path = '00000000-0000-0000-0000-0000000000a1/foto-1.jpg' where id = '00000000-0000-0000-0000-0000000000a1';
select t.yo_nueva();
select t.valor('con foto, la consola ya no la pide', $q$select (public.eq_estado()->>'photoRequired')$q$, 'false');
select t.debe_funcionar('con foto sí puede postular', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"none"}')$q$);
select t.root();
update public.config set foto_obligatoria = false where id = 1;
select t.yo_foto();
select t.debe_funcionar('con la foto obligatoria apagada, otra persona guarda su perfil', $q$select public.eq_accion('profile', t.perfil('11.111.111-1', 'foto@ejemplo.test'))$q$);
select t.valor('y la consola no le pide foto', $q$select (public.eq_estado()->>'photoRequired')$q$, 'false');
select t.debe_funcionar('y puede postular sin foto', $q$select public.eq_accion('apply', '{"eventId":"e1000000-0000-0000-0000-000000000003","vehicleMode":"none"}')$q$);
select t.root();

select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
