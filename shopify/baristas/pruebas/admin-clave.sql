-- Pruebas de la entrada de la administración: con código por correo (siempre) o con correo y clave (si la
-- persona activó su clave). Correr DESPUÉS de shim-supabase.sql y esquema.sql, en una base vacía de
-- pruebas. Termina imprimiendo cuántas pasaron y cuáles fallaron.

begin;
\ir arnes.sql

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'otro@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000cc', 'carla@ejemplo.test');
insert into public.admins(email) values ('admin@ejemplo.test'), ('otro@ejemplo.test');
insert into public.accesos(id, usuario, nombre) values ('00000000-0000-0000-0000-0000000000aa', 'ana.prueba', 'Ana Prueba');
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos) values
  ('00000000-0000-0000-0000-0000000000aa', 'Ana Prueba', '11.111.111-1', 'ana@ejemplo.test', '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true);

-- Sesión con claims a mano (varios métodos, mayúsculas o sin «amr»)
create function t.como_claims(claims text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ---------------------------------------------------------------------------
-- Al comienzo: solo vale el código
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.valor('con código, la persona es administración', 'select public.es_admin()::text', 'true');
select t.valor('y todavía no tiene la clave activada', 'select public.admin_clave_activa()::text', 'false');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'password');
select t.valor('con clave y sin activar no es administración (aunque la clave exista)', 'select public.es_admin()::text', 'false');
select t.filas('y no ve a los baristas', 'select * from public.baristas', 0);
select t.valor('ni sabe si tiene la clave activada', 'select public.admin_clave_activa()::text', 'false');
select t.debe_fallar('y no puede activarla desde una sesión de clave', 'select public.admin_activar_clave(true)');
select t.como_claims('{"sub":"00000000-0000-0000-0000-0000000000ad","email":"admin@ejemplo.test","role":"authenticated","amr":[{"method":"otp"},{"method":"password"}]}');
select t.valor('si la sesión pasó también por una clave, tampoco vale', 'select public.es_admin()::text', 'false');
select t.debe_fallar('ni activa desde ahí', 'select public.admin_activar_clave(true)');

-- ---------------------------------------------------------------------------
-- Activar la clave (desde una sesión de código)
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.debe_funcionar('con código se puede activar la clave', 'select public.admin_activar_clave(true)');
select t.valor('queda activada', 'select public.admin_clave_activa()::text', 'true');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'password');
select t.valor('desde ese momento, la sesión de clave es administración', 'select public.es_admin()::text', 'true');
select t.filas('ve a los baristas', 'select * from public.baristas', 1);
select t.afecta('y puede cambiar la configuración', 'update public.config set tarifa_hora = tarifa_hora', 1);
select t.valor('y ve que su clave está activada', 'select public.admin_clave_activa()::text', 'true');
select t.como_claims('{"sub":"00000000-0000-0000-0000-0000000000ad","email":"ADMIN@EJEMPLO.TEST","role":"authenticated","amr":[{"method":"password"}]}');
select t.valor('el correo se compara sin importar mayúsculas', 'select public.es_admin()::text', 'true');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.valor('con código sigue siendo administración', 'select public.es_admin()::text', 'true');

-- ---------------------------------------------------------------------------
-- Es por persona, y solo para quien está en la lista
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000a2', 'otro@ejemplo.test', 'password');
select t.valor('otra persona de la administración que no activó su clave no entra con clave', 'select public.es_admin()::text', 'false');
select t.como('00000000-0000-0000-0000-0000000000a2', 'otro@ejemplo.test', 'otp');
select t.valor('pero con código sí', 'select public.es_admin()::text', 'true');
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test', 'password');
select t.valor('una barista con clave no es administración', 'select public.es_admin()::text', 'false');
select t.valor('no sabe si hay claves activadas', 'select public.admin_clave_activa()::text', 'false');
select t.debe_fallar('y no puede activar nada', 'select public.admin_activar_clave(true)');
select t.debe_fallar('ni «desactivar»', 'select public.admin_activar_clave(false)');
select t.como('00000000-0000-0000-0000-0000000000cc', 'carla@ejemplo.test', 'otp');
select t.debe_fallar('quien no es barista ni administración tampoco', 'select public.admin_activar_clave(true)');
select t.como('00000000-0000-0000-0000-0000000000cc', 'otro@ejemplo.test', 'password');
select t.valor('mientras otro@ no activó la clave, un intruso con clave no pasa', 'select public.es_admin()::text', 'false');

-- Nadie, por la web, toca la tabla de administradores
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.debe_fallar('ni la administración lee la lista desde la web', 'select * from public.admins');
select t.debe_fallar('ni se activa la clave por la tabla', 'update public.admins set clave_activa = true');
select t.como('00000000-0000-0000-0000-0000000000a2', 'otro@ejemplo.test', 'otp');
select t.debe_fallar('ni a otra persona se le activa por la tabla', $q$update public.admins set clave_activa = true where email = 'otro@ejemplo.test'$q$);
select t.anonimo();
select t.debe_fallar('sin sesión no se pregunta', 'select public.admin_clave_activa()');
select t.debe_fallar('ni se activa', 'select public.admin_activar_clave(true)');

-- ---------------------------------------------------------------------------
-- Desactivar, y quitar a alguien de la lista
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'password');
select t.debe_funcionar('desde una sesión de clave se puede desactivar la clave', 'select public.admin_activar_clave(false)');
select t.valor('y esa misma sesión deja de ser administración', 'select public.es_admin()::text', 'false');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.valor('con código sigue entrando', 'select public.es_admin()::text', 'true');
select t.valor('y la clave figura desactivada', 'select public.admin_clave_activa()::text', 'false');
select t.debe_funcionar('se activa de nuevo', 'select public.admin_activar_clave(true)');
select t.root();
delete from public.admins where email = 'admin@ejemplo.test';
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'password');
select t.valor('quien sale de la lista deja de ser administración, aunque tuviera la clave activada', 'select public.es_admin()::text', 'false');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.valor('con código tampoco', 'select public.es_admin()::text', 'false');
select t.debe_fallar('ni puede activar nada', 'select public.admin_activar_clave(true)');

select t.root();
select t.valor('si vuelve a la lista, la bandera de la clave empieza apagada', $q$insert into public.admins(email) values ('admin@ejemplo.test') returning clave_activa::text$q$, 'false');

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
