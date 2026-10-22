-- Pruebas de la administración con cuenta de barista: una misma persona entra con su ID y su clave, trabaja
-- como barista y además es administración (accesos.admin, que se marca con hacer_admin). Correr DESPUÉS de
-- shim-supabase.sql, esquema.sql y equipo.sql, en una base vacía de pruebas. Termina imprimiendo cuántas
-- pasaron y cuáles fallaron.

begin;
\ir arnes.sql

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'mara.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000c1', 'nico.prueba@equipo.sepiacoffee.cl');
insert into public.admins(email) values ('admin@ejemplo.test');
insert into public.accesos(id, usuario, nombre, debe_cambiar_clave) values
  ('00000000-0000-0000-0000-0000000000a1', 'mara.prueba', 'Mara Prueba', false),
  ('00000000-0000-0000-0000-0000000000b1', 'beto.prueba', 'Beto Prueba', false),
  ('00000000-0000-0000-0000-0000000000c1', 'nico.prueba', 'Nico Prueba', true);
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos) values
  ('00000000-0000-0000-0000-0000000000a1', 'Mara Prueba', '11.111.111-1', 'mara@ejemplo.test', '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true),
  ('00000000-0000-0000-0000-0000000000b1', 'Beto Prueba', '22.222.222-2', 'beto@ejemplo.test', '+56911110002', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true);
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, pago_manual, estado) values
  ('e1000000-0000-0000-0000-000000000001', 'Evento Abierto', t.hoy() + 5, '18:00', '22:00', 'Pirque', 2, 40000, 'abierto'),
  ('e1000000-0000-0000-0000-000000000002', 'Borrador Oculto', t.hoy() + 6, '18:00', '22:00', 'Pirque', 2, 40000, 'borrador'),
  ('e1000000-0000-0000-0000-000000000005', 'Evento Lejano', t.hoy() + 40, '18:00', '22:00', 'Pirque', 2, 40000, 'abierto');

-- ---------------------------------------------------------------------------
-- Antes de marcarla: Mara es una barista más
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000a1', 'mara.prueba@equipo.sepiacoffee.cl', 'password');
select t.valor('sin marcar, la cuenta de barista no es administración', 'select public.es_admin()::text', 'false');
select t.valor('y no tiene el cambio de vista', $q$select (public.eq_estado()->>'canAdmin')$q$, 'false');
select t.debe_fallar('una barista no se puede marcar como administración', $q$select public.hacer_admin('mara.prueba')$q$);
select t.debe_fallar('ni marcar a otra persona', $q$select public.hacer_admin('beto.prueba')$q$);
select t.root();
select t.valor('y en la base sigue sin marcar', $q$select admin::text from public.accesos where usuario = 'mara.prueba'$q$, 'false');

-- ---------------------------------------------------------------------------
-- Marcada desde el SQL Editor
-- ---------------------------------------------------------------------------
select t.valor('hacer_admin devuelve la cuenta marcada', $q$select public.hacer_admin('Mara.Prueba ')->>'admin'$q$, 'true');
select t.debe_fallar('con un ID que no existe avisa', $q$select public.hacer_admin('nadie.prueba')$q$);
select t.como('00000000-0000-0000-0000-0000000000a1', 'mara.prueba@equipo.sepiacoffee.cl', 'password');
select t.valor('con su ID y su clave, Mara es administración', 'select public.es_admin()::text', 'true');
select t.valor('entra directo: la vista de administración por defecto', $q$select (public.eq_estado()->>'admin') || ' ' || (public.eq_estado()->>'canAdmin')$q$, 'true true');
select t.valor('ve los borradores en la administración', $q$select count(*)::text from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Borrador Oculto'$q$, '1');
select t.filas('y ve a todos los baristas', 'select * from public.baristas', 2);
select t.valor('en «Vista barista» deja de ver como administración', $q$select (public.eq_estado('barista')->>'admin') || ' ' || (public.eq_estado('barista')->>'canAdmin')$q$, 'false true');
select t.valor('y sigue siendo ella: su propia ficha de barista', $q$select (public.eq_estado('barista')->>'memberId') || ' ' || (public.eq_estado('barista')->'user'->>'name')$q$, '00000000-0000-0000-0000-0000000000a1 Mara Prueba');
select t.valor('en «Vista barista» ve lo mismo que un barista: nada a más de 14 días', $q$select count(*)::text from jsonb_array_elements(public.eq_estado('barista')->'events') e where e->>'title' = 'Evento Lejano'$q$, '0');
select t.valor('en la administración sí lo ve', $q$select count(*)::text from jsonb_array_elements(public.eq_estado()->'events') e where e->>'title' = 'Evento Lejano'$q$, '1');
select t.valor('en «Vista barista» no ve los borradores', $q$select count(*)::text from jsonb_array_elements(public.eq_estado('barista')->'events') e where e->>'title' = 'Borrador Oculto'$q$, '0');
select t.valor('ni la clave de administración por correo le pide nada', $q$select public.eq_estado()->>'adminClavePendiente'$q$, 'false');
select t.valor('puede marcar a otra persona', $q$select public.hacer_admin('beto.prueba')->>'admin'$q$, 'true');
select t.valor('y desmarcarla', $q$select public.hacer_admin('beto.prueba', false)->>'admin'$q$, 'false');

-- ---------------------------------------------------------------------------
-- Las reglas de barista siguen valiendo para la administración con cuenta de barista
-- ---------------------------------------------------------------------------
select t.root();
select public.hacer_admin('nico.prueba');
select t.como('00000000-0000-0000-0000-0000000000c1', 'nico.prueba@equipo.sepiacoffee.cl', 'password');
select t.valor('si debe cambiar su clave temporal, primero eso (aunque sea administración)', $q$select (public.eq_estado()->>'passwordRequired') || ' ' || jsonb_array_length(public.eq_estado()->'events')$q$, 'true 0');
select t.root();
update public.accesos set debe_cambiar_clave = false where usuario = 'nico.prueba';
select t.como('00000000-0000-0000-0000-0000000000c1', 'nico.prueba@equipo.sepiacoffee.cl', 'password');
select t.valor('y después completa su perfil como cualquiera del equipo', $q$select (public.eq_estado()->>'profileRequired') || ' ' || jsonb_array_length(public.eq_estado()->'events')$q$, 'true 0');

-- ---------------------------------------------------------------------------
-- Un acceso desactivado deja de ser administración
-- ---------------------------------------------------------------------------
select t.root();
update public.accesos set activo = false where usuario = 'mara.prueba';
select t.como('00000000-0000-0000-0000-0000000000a1', 'mara.prueba@equipo.sepiacoffee.cl', 'password');
select t.valor('con el acceso desactivado ya no es administración', 'select public.es_admin()::text', 'false');
select t.filas('ni ve a los baristas (con el acceso apagado, ni su propia ficha)', 'select * from public.baristas', 0);

-- ---------------------------------------------------------------------------
-- Un barista común no ve nada de esto, y la administración por correo sigue igual
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000b1', 'beto.prueba@equipo.sepiacoffee.cl', 'password');
select t.valor('un barista no es administración', 'select public.es_admin()::text', 'false');
select t.valor('ni tiene el cambio de vista', $q$select (public.eq_estado()->>'canAdmin') || ' ' || (public.eq_estado('admin')->>'admin')$q$, 'false false');
select t.filas('ni ve la columna de otros accesos', 'select * from public.accesos', 1);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.valor('la administración por correo sigue entrando con código', 'select public.es_admin()::text', 'true');
select t.valor('y sin pedirle clave ni perfil de barista', $q$select (public.eq_estado()->>'passwordRequired') || ' ' || (public.eq_estado()->>'profileRequired')$q$, 'false false');

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
