-- Pruebas del nivel de experiencia (Jorge, 23 oct): dos medidores por barista (con máquina y sin máquina), de 0
-- (Ninguna) a 4 (Profesional). Solo la administración lo ve y lo cambia; el barista no puede saberlo. Correr
-- DESPUÉS de shim-supabase.sql, esquema.sql y equipo.sql, en una base vacía de pruebas.

begin;
\ir arnes.sql

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000c1', 'sin.perfil@equipo.sepiacoffee.cl');
insert into public.accesos(id, usuario, nombre, debe_cambiar_clave, admin) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba', 'Admin Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba', 'Nueva Prueba', false, false),
  ('00000000-0000-0000-0000-0000000000c1', 'sin.perfil', 'Sin Perfil', true, false);
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos, tiene_camioneta) values
  ('00000000-0000-0000-0000-0000000000ad', 'Admin Prueba', '11.111.111-1', 'admin@ejemplo.test', '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true, false),
  ('00000000-0000-0000-0000-0000000000a1', 'Nueva Prueba', '22.222.222-2', 'nueva@ejemplo.test', '+56911110002', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true, true);

create function t.yo_admin() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000ad', 'admin.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.yo_nueva() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.nivel(u text, k text) returns text language sql as $$
  select coalesce(m->'skill'->>k, 'null') from jsonb_array_elements(public.eq_estado()->'members') m where m->>'id' = u $$;

-- Sin evaluar al principio
select t.yo_admin();
select t.valor('al principio, con máquina está sin evaluar', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'machine')$q$, 'null');
select t.valor('y sin máquina también', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'noMachine')$q$, 'null');

-- La administración los pone
select t.debe_funcionar('la administración pone «Profesional» con máquina', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"machine","level":4}')$q$);
select t.valor('queda en 4 (Profesional)', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'machine')$q$, '4');
select t.valor('y sin máquina sigue sin evaluar', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'noMachine')$q$, 'null');
select t.debe_funcionar('pone «Baja» sin máquina', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"noMachine","level":1}')$q$);
select t.valor('sin máquina queda en 1', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'noMachine')$q$, '1');
select t.valor('y con máquina no cambió', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'machine')$q$, '4');
select t.debe_funcionar('«Ninguna» (0) también se guarda', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"machine","level":0}')$q$);
select t.valor('queda en 0, no sin evaluar', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'machine')$q$, '0');
select t.debe_funcionar('se puede volver a «sin evaluar»', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"machine","level":null}')$q$);
select t.valor('queda sin evaluar', $q$select t.nivel('00000000-0000-0000-0000-0000000000a1', 'machine')$q$, 'null');
select t.debe_funcionar('también a quien todavía no completa su perfil', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000c1","kind":"noMachine","level":2}')$q$);
select t.valor('y queda en su ficha', $q$select t.nivel('00000000-0000-0000-0000-0000000000c1', 'noMachine')$q$, '2');
select t.debe_fallar('un nivel 5 no existe', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"machine","level":5}')$q$);
select t.debe_fallar('ni un nivel negativo', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"machine","level":-1}')$q$);
select t.debe_fallar('ni otro medidor', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"cafe","level":2}')$q$);
select t.debe_fallar('ni a una persona que no existe', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-00000000ffff","kind":"machine","level":2}')$q$);

-- La administración en «Vista barista» no lo ve (ahí ve lo mismo que un barista)
select t.valor('en «Vista barista» la administración no recibe el equipo', $q$select jsonb_array_length(public.eq_estado('barista')->'members')::text$q$, '0');

-- El barista no puede saberlo ni cambiarlo
select t.yo_nueva();
select t.valor('a un barista no le llega la lista del equipo', $q$select jsonb_array_length(public.eq_estado()->'members')::text$q$, '0');
select t.valor('ni el nivel en ninguna parte de su paquete de datos', $q$select (public.eq_estado()::text like '%skill%' or public.eq_estado()::text like '%noMachine%')::text$q$, 'false');
select t.debe_fallar('no puede leer la tabla', 'select * from public.niveles');
select t.debe_fallar('ni escribir en ella', $q$insert into public.niveles (barista_id, con_maquina) values ('00000000-0000-0000-0000-0000000000a1', 4)$q$);
select t.debe_fallar('ni subirse el nivel por la consola', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"machine","level":4}')$q$);
select t.debe_fallar('ni con la función directa', $q$select public.poner_nivel('00000000-0000-0000-0000-0000000000a1', 'machine', 4)$q$);
select t.debe_fallar('ni leerlo con la función de ayuda', $q$select public.eq_nivel_json('00000000-0000-0000-0000-0000000000a1')$q$);
select t.anonimo();
select t.debe_fallar('sin sesión, tampoco', $q$select public.eq_accion('skillLevel', '{"memberId":"00000000-0000-0000-0000-0000000000a1","kind":"machine","level":4}')$q$);
select t.root();
select t.valor('el intento del barista no cambió nada', $q$select coalesce(con_maquina::text, 'null') || ' ' || sin_maquina from public.niveles where barista_id = '00000000-0000-0000-0000-0000000000a1'$q$, 'null 1');

-- Si se borra el acceso, su nivel se borra con él
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
select t.valor('al borrar la cuenta se borra su nivel', $q$select count(*)::text from public.niveles where barista_id = '00000000-0000-0000-0000-0000000000c1'$q$, '0');

select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
