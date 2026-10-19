-- Pruebas de las políticas del esquema. Correr DESPUÉS de shim-supabase.sql y
-- esquema.sql, en una base vacía de pruebas (nunca en la de verdad).
-- Termina imprimiendo cuántas pasaron y cuáles fallaron.

begin;

create schema if not exists t;
create table t.resultados (n serial, nombre text, ok boolean, detalle text);
grant usage on schema t to public;
grant all on t.resultados to public;
grant usage on sequence t.resultados_n_seq to public;

create function t.como(sub uuid, email text, amr text default 'otp') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', sub, 'email', email, 'role', 'authenticated',
                      'amr', json_build_array(json_build_object('method', amr)))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function t.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create function t.root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Ejecuta una sentencia y anota si funcionó o dio error.
create function t.debe_funcionar(nombre text, sentencia text) returns void language plpgsql as $$
begin
  begin execute sentencia; insert into t.resultados(nombre, ok) values (nombre, true);
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, false, sqlerrm); end;
end $$;
create function t.debe_fallar(nombre text, sentencia text) returns void language plpgsql as $$
begin
  begin execute sentencia; insert into t.resultados(nombre, ok, detalle) values (nombre, false, 'se ejecutó y no debía');
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, true, sqlerrm); end;
end $$;
-- Cuenta filas visibles y compara con lo esperado.
create function t.filas(nombre text, consulta text, esperado bigint) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute 'select count(*) from (' || consulta || ') q' into n;
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, false, sqlerrm); return; end;
  insert into t.resultados(nombre, ok, detalle) values (nombre, n = esperado, 'filas=' || n || ' esperadas=' || esperado);
end $$;
-- Cuenta cuántas filas toca un UPDATE o DELETE (la política puede dejar pasar 0 sin error).
create function t.afecta(nombre text, dml text, esperado bigint) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute 'with x as (' || dml || ' returning 1) select count(*) from x' into n;
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, esperado = 0, 'error: ' || sqlerrm); return; end;
  insert into t.resultados(nombre, ok, detalle) values (nombre, n = esperado, 'filas tocadas=' || n || ' esperadas=' || esperado);
end $$;

create function t.valor(nombre text, consulta text, esperado text) returns void language plpgsql as $$
declare v text;
begin
  begin execute consulta into v;
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, false, sqlerrm); return; end;
  insert into t.resultados(nombre, ok, detalle) values (nombre, v is not distinct from esperado, 'valor=' || coalesce(v, 'null') || ' esperado=' || esperado);
end $$;

-- Personas de prueba
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.test'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.test'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
insert into public.admins(email) values ('admin@ejemplo.test');

-- Eventos de prueba (como administración)
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('admin crea eventos', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
   ('e0000000-0000-0000-0000-000000000001', 'Corto 2h',        current_date + 30, '18:00', '20:00', 'Vitacura', 2, 'abierto'),
   ('e0000000-0000-0000-0000-000000000002', 'Medio 3h',        current_date + 31, '18:00', '21:00', 'Las Condes', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000003', 'Medio 4h',        current_date + 32, '18:00', '22:00', 'Providencia', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000004', 'Largo 5h',        current_date + 33, '18:00', '23:00', 'Ñuñoa', 3, 'abierto'),
   ('e0000000-0000-0000-0000-000000000005', 'Borrador',        current_date + 34, '18:00', '20:00', 'Santiago', 1, 'borrador'),
   ('e0000000-0000-0000-0000-000000000006', 'Cerrado',         current_date + 35, '18:00', '20:00', 'Santiago', 1, 'cerrado'),
   ('e0000000-0000-0000-0000-000000000007', 'Pasado',          current_date - 5,  '18:00', '20:00', 'Santiago', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000008', 'Nocturno 22 a 02', current_date + 36, '22:00', '02:00', 'Santiago', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000009', 'Con pago fijo',   current_date + 37, '18:00', '23:00', 'Santiago', 1, 'abierto')
$q$);
update public.eventos set pago_manual = 55000 where id = 'e0000000-0000-0000-0000-000000000009';
select t.debe_funcionar('admin crea datos privados', $q$
  insert into public.evento_privado(evento_id, cliente, contacto, notas) select id, 'Cliente secreto', 'contacto', 'nota' from public.eventos
$q$);
select t.debe_funcionar('admin crea direcciones', $q$
  insert into public.evento_direcciones(evento_id, direccion, indicaciones) select id, 'Calle Falsa 123', 'timbre 2' from public.eventos
$q$);

-- Pago y boleta calculados
select t.valor('2 h → 25.000',     $q$select pago_liquido::text from public.eventos_vista where nombre = 'Corto 2h'$q$, '25000');
select t.valor('2 h → boleta 29.499', $q$select monto_boleta::text from public.eventos_vista where nombre = 'Corto 2h'$q$, '29499');
select t.valor('3 h → 40.000',     $q$select pago_liquido::text from public.eventos_vista where nombre = 'Medio 3h'$q$, '40000');
select t.valor('4 h → 40.000',     $q$select pago_liquido::text from public.eventos_vista where nombre = 'Medio 4h'$q$, '40000');
select t.valor('4 h → boleta 47.198', $q$select monto_boleta::text from public.eventos_vista where nombre = 'Medio 4h'$q$, '47198');
select t.valor('5 h → 50.000 (10.000 por hora)', $q$select pago_liquido::text from public.eventos_vista where nombre = 'Largo 5h'$q$, '50000');
select t.valor('5 h → boleta 58.997', $q$select monto_boleta::text from public.eventos_vista where nombre = 'Largo 5h'$q$, '58997');
select t.valor('22:00 a 02:00 son 4 h → 40.000', $q$select pago_liquido::text from public.eventos_vista where nombre = 'Nocturno 22 a 02'$q$, '40000');
select t.valor('pago fijo manda sobre la tarifa', $q$select pago_liquido::text from public.eventos_vista where nombre = 'Con pago fijo'$q$, '55000');

-- RUT
select t.root();
select t.valor('RUT 11.111.111-1 vale', $q$select public.rut_valido('11.111.111-1')::text$q$, 'true');
select t.valor('RUT 11111111-2 no vale', $q$select public.rut_valido('11111111-2')::text$q$, 'false');
select t.valor('RUT 12345678-5 vale', $q$select public.rut_valido('12.345.678-5')::text$q$, 'true');
select t.valor('RUT con K vale (10.000.013-K)', $q$select public.rut_valido('10.000.013-K')::text$q$, 'true');
select t.valor('formato del RUT', $q$select public.rut_formato('123456785')$q$, '12.345.678-5');

-- Anónimo: nada
select t.anonimo();
select t.debe_fallar('anónimo no lee baristas', 'select * from public.baristas');
select t.debe_fallar('anónimo no lee eventos', 'select * from public.eventos');
select t.debe_fallar('anónimo no lee la vista', 'select * from public.eventos_vista');
select t.debe_fallar('anónimo no lee config', 'select * from public.config');
select t.debe_fallar('anónimo no lee postulaciones', 'select * from public.postulaciones');
select t.debe_fallar('anónimo no lee admins', 'select * from public.admins');
select t.debe_fallar('anónimo no ejecuta es_admin()', 'select public.es_admin()');

-- Carla: autenticada, sin registro
select t.como('00000000-0000-0000-0000-00000000000c', 'carla@ejemplo.test');
select t.filas('sin registro no ve eventos', 'select * from public.eventos_vista', 0);
select t.filas('sin registro lee la config (los textos legales)', 'select * from public.config', 1);
select t.debe_fallar('no lee admins', 'select * from public.admins');
select t.debe_fallar('RUT inválido se rechaza', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000c','Carla Prueba','11.111.111-2','carla@ejemplo.test','+56912345678','Vitacura','Banco de Chile','Cuenta vista','12345678',true,true,'x',true)$q$);
select t.debe_fallar('no puede registrar a otra persona', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000a','Carla Prueba','11.111.111-1','carla@ejemplo.test','+56912345678','Vitacura','Banco de Chile','Cuenta vista','12345678',true,true,'x',true)$q$);
select t.debe_fallar('no puede usar el correo de otra persona', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000c','Carla Prueba','11.111.111-1','ana@ejemplo.test','+56912345678','Vitacura','Banco de Chile','Cuenta vista','12345678',true,true,'x',true)$q$);
select t.debe_fallar('sin declarar la boleta no se registra', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000c','Carla Prueba','11.111.111-1','carla@ejemplo.test','+56912345678','Vitacura','Banco de Chile','Cuenta vista','12345678',true,false,'x',true)$q$);
select t.debe_fallar('sin aceptar la privacidad no se registra', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000c','Carla Prueba','11.111.111-1','carla@ejemplo.test','+56912345678','Vitacura','Banco de Chile','Cuenta vista','12345678',true,true,'x',false)$q$);
select t.debe_fallar('cuenta que no es suya no se registra', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000c','Carla Prueba','11.111.111-1','carla@ejemplo.test','+56912345678','Vitacura','Banco de Chile','Cuenta vista','12345678',false,true,'x',true)$q$);
select t.debe_fallar('número de cuenta con letras se rechaza', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000c','Carla Prueba','11.111.111-1','carla@ejemplo.test','+56912345678','Vitacura','Banco de Chile','Cuenta vista','12AB5678',true,true,'x',true)$q$);

-- Ana y Beto se registran bien
select t.como('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.test');
select t.debe_funcionar('Ana se registra', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000a','Ana Prueba','111111111','Ana@Ejemplo.test','+56 9 1234 5678','Vitacura','Banco de Chile','Cuenta vista','12345678',true,true,'texto falso que el servidor debe pisar',true)$q$);
select t.como('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.test');
select t.debe_funcionar('Beto se registra', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000b','Beto Prueba','12.345.678-5','beto@ejemplo.test','+56987654321','Ñuñoa','Banco Estado','Cuenta RUT','98765432',true,true,'x',true)$q$);
select t.debe_fallar('el mismo RUT no se usa dos veces', $q$update public.baristas set rut = '11.111.111-1' where id = '00000000-0000-0000-0000-00000000000b'$q$);

select t.root();
select t.valor('el servidor pone el texto de la declaración', $q$select (acepta_boleta_texto = (select texto_boleta from public.config))::text from public.baristas where nombre = 'Ana Prueba'$q$, 'true');
select t.valor('el correo se guarda en minúsculas', $q$select correo from public.baristas where nombre = 'Ana Prueba'$q$, 'ana@ejemplo.test');
select t.valor('el RUT se guarda con formato', $q$select rut from public.baristas where nombre = 'Ana Prueba'$q$, '11.111.111-1');

-- Ana
select t.como('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.test');
select t.filas('Ana ve solo su propio registro', 'select * from public.baristas', 1);
select t.filas('Ana ve los 7 eventos abiertos (incluye el que ya pasó, que sigue abierto)', 'select * from public.eventos_vista', 7);
select t.filas('Ana no ve el borrador ni el cerrado', $q$select * from public.eventos_vista where estado in ('borrador','cerrado')$q$, 0);
select t.filas('Ana no ve datos privados del cliente', 'select * from public.evento_privado', 0);
select t.filas('Ana no ve direcciones sin estar confirmada', 'select * from public.evento_direcciones', 0);
select t.debe_fallar('Ana no crea eventos', $q$insert into public.eventos(nombre,fecha,hora_inicio,hora_fin,comuna) values ('Falso', current_date+1,'10:00','12:00','X')$q$);
select t.afecta('Ana no puede editar eventos', $q$update public.eventos set nombre = 'Hackeado'$q$, 0);
select t.afecta('Ana no puede borrar eventos', $q$delete from public.eventos$q$, 0);
select t.afecta('Ana no puede cambiar la config', $q$update public.config set tarifa_hora = 1$q$, 0);
select t.debe_funcionar('Ana postula al evento 1', $q$insert into public.postulaciones(evento_id, barista_id, mensaje) values ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Tengo experiencia')$q$);
select t.debe_fallar('Ana no postula dos veces al mismo', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a')$q$);
select t.debe_fallar('Ana no postula a un borrador', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-00000000000a')$q$);
select t.debe_fallar('Ana no postula a un evento cerrado', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-00000000000a')$q$);
select t.debe_fallar('Ana no postula a un evento que ya pasó', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-00000000000a')$q$);
select t.debe_fallar('Ana no postula a nombre de Beto', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000b')$q$);
select t.debe_fallar('Ana no se confirma sola al crear', $q$insert into public.postulaciones(evento_id, barista_id, estado) values ('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','confirmada')$q$);
select t.debe_fallar('Ana no se confirma sola al editar', $q$update public.postulaciones set estado = 'confirmada' where barista_id = '00000000-0000-0000-0000-00000000000a'$q$);
select t.debe_fallar('Ana no cambia el evento de su postulación', $q$update public.postulaciones set evento_id = 'e0000000-0000-0000-0000-000000000002' where barista_id = '00000000-0000-0000-0000-00000000000a'$q$);
select t.debe_fallar('Ana no cambia su correo al de otra persona', $q$update public.baristas set correo = 'otra@ejemplo.test' where id = '00000000-0000-0000-0000-00000000000a'$q$);
select t.debe_funcionar('Ana actualiza su cuenta bancaria', $q$update public.baristas set numero_cuenta = '55556666' where id = '00000000-0000-0000-0000-00000000000a'$q$);
select t.afecta('Ana no puede editar el registro de Beto', $q$update public.baristas set nombre = 'Hackeado' where id = '00000000-0000-0000-0000-00000000000b'$q$, 0);
select t.debe_funcionar('Ana intenta pisar el texto aceptado (se ignora)', $q$update public.baristas set acepta_boleta_texto = 'otro', aceptado_en = '2000-01-01' where id = '00000000-0000-0000-0000-00000000000a'$q$);

-- Beto
select t.como('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.test');
select t.filas('Beto no ve las postulaciones de Ana', 'select * from public.postulaciones', 0);
select t.filas('Beto ve solo su registro', 'select * from public.baristas', 1);
select t.debe_funcionar('Beto postula al evento 1', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b')$q$);
select t.debe_funcionar('Beto postula al evento 2', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000b')$q$);

-- Administración
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.filas('admin ve a todos los baristas', 'select * from public.baristas', 2);
select t.filas('admin ve todas las postulaciones', 'select * from public.postulaciones', 3);
select t.filas('admin ve borradores y cerrados', 'select * from public.eventos_vista', 9);
select t.filas('admin ve los datos privados', 'select * from public.evento_privado', 9);
select t.debe_funcionar('admin confirma a Ana en el evento 1', $q$update public.postulaciones set estado = 'confirmada' where barista_id = '00000000-0000-0000-0000-00000000000a' and evento_id = 'e0000000-0000-0000-0000-000000000001'$q$);
select t.debe_funcionar('admin rechaza a Beto en el evento 2', $q$update public.postulaciones set estado = 'rechazada' where barista_id = '00000000-0000-0000-0000-00000000000b' and evento_id = 'e0000000-0000-0000-0000-000000000002'$q$);
select t.debe_funcionar('admin cambia la retención', $q$update public.config set retencion = 0.16$q$);
select t.valor('la boleta sigue la retención nueva (25.000 / 0,84)', $q$select monto_boleta::text from public.eventos_vista where nombre = 'Corto 2h'$q$, '29762');
select t.debe_funcionar('admin vuelve la retención a 15,25 %', $q$update public.config set retencion = 0.1525$q$);

-- Después de confirmar
select t.como('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.test');
select t.filas('Ana confirmada ve la dirección de SU evento y de ninguno más', 'select * from public.evento_direcciones', 1);
select t.valor('y es la del evento 1', $q$select evento_id::text from public.evento_direcciones$q$, 'e0000000-0000-0000-0000-000000000001');
select t.como('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.test');
select t.filas('Beto sin confirmar no ve ninguna dirección', 'select * from public.evento_direcciones', 0);
select t.afecta('Beto rechazado no puede tocar esa postulación', $q$update public.postulaciones set estado = 'postulada' where evento_id = 'e0000000-0000-0000-0000-000000000002'$q$, 0);
select t.debe_funcionar('Beto se retira del evento 1', $q$update public.postulaciones set estado = 'retirada' where evento_id = 'e0000000-0000-0000-0000-000000000001'$q$);
select t.debe_funcionar('Beto vuelve a postular al evento 1', $q$update public.postulaciones set estado = 'postulada' where evento_id = 'e0000000-0000-0000-0000-000000000001'$q$);

-- Evento cerrado: Ana (con postulación) lo sigue viendo, Beto no
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('admin cierra el evento 1', $q$update public.eventos set estado = 'cerrado' where id = 'e0000000-0000-0000-0000-000000000001'$q$);
select t.como('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.test');
select t.filas('Ana sigue viendo el evento cerrado donde está confirmada', $q$select * from public.eventos_vista where id = 'e0000000-0000-0000-0000-000000000001'$q$, 1);
select t.debe_funcionar('Ana confirmada puede retirarse', $q$update public.postulaciones set estado = 'retirada' where evento_id = 'e0000000-0000-0000-0000-000000000001'$q$);
select t.debe_fallar('Ana no vuelve a postular a un evento cerrado', $q$update public.postulaciones set estado = 'postulada' where evento_id = 'e0000000-0000-0000-0000-000000000001'$q$);
select t.filas('Ana, ya retirada, aún ve la dirección? no (dejó de estar confirmada)', 'select * from public.evento_direcciones', 0);

-- Sesión con contraseña con el correo de la administración: NO es administración
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'password');
select t.valor('sesión de contraseña no es admin', 'select public.es_admin()::text', 'false');
select t.filas('y por eso no ve a los baristas', 'select * from public.baristas', 0);
select t.filas('ni los datos privados', 'select * from public.evento_privado', 0);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'otp');
select t.valor('sesión de código sí es admin', 'select public.es_admin()::text', 'true');
select t.como('00000000-0000-0000-0000-00000000000c', 'carla@ejemplo.test');
select t.valor('otra persona no es admin', 'select public.es_admin()::text', 'false');

-- Borrado de datos
select t.como('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.test');
select t.afecta('Beto no borra a Ana', $q$delete from public.baristas where id = '00000000-0000-0000-0000-00000000000a'$q$, 0);
select t.debe_funcionar('Beto borra sus propios datos', $q$delete from public.baristas where id = '00000000-0000-0000-0000-00000000000b'$q$);
select t.root();
select t.valor('y sus postulaciones se van con él', $q$select count(*)::text from public.postulaciones where barista_id = '00000000-0000-0000-0000-00000000000b'$q$, '0');

-- Tope diario de $70.000 (se prueba al final, para no mover los conteos de arriba)
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('admin crea eventos largos', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
   ('e0000000-0000-0000-0000-000000000010', 'Tope 7h',  current_date + 40, '12:00', '19:00', 'Santiago', 2, 'abierto'),
   ('e0000000-0000-0000-0000-000000000011', 'Tope 10h', current_date + 41, '12:00', '22:00', 'Santiago', 2, 'abierto'),
   ('e0000000-0000-0000-0000-000000000012', 'Justo en el tope 7h30', current_date + 42, '12:00', '19:30', 'Santiago', 2, 'abierto')
$q$);
select t.debe_funcionar('admin crea un pago fijo sobre el tope', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, pago_manual, estado) values
   ('e0000000-0000-0000-0000-000000000013', 'Fijo sobre el tope', current_date + 43, '12:00', '22:00', 'Santiago', 2, 90000, 'abierto')
$q$);
select t.valor('5 h sigue en $50.000 (bajo el tope)',  $q$select pago_liquido::text from public.eventos_vista where nombre = 'Largo 5h'$q$, '50000');
select t.valor('7 h = $70.000, justo en el tope',       $q$select pago_liquido::text from public.eventos_vista where nombre = 'Tope 7h'$q$, '70000');
select t.valor('7 h 30 min se recorta a $70.000',       $q$select pago_liquido::text from public.eventos_vista where nombre = 'Justo en el tope 7h30'$q$, '70000');
select t.valor('y dice que sin tope eran $75.000',      $q$select pago_sin_tope::text from public.eventos_vista where nombre = 'Justo en el tope 7h30'$q$, '75000');
select t.valor('10 h se recorta a $70.000',             $q$select pago_liquido::text from public.eventos_vista where nombre = 'Tope 10h'$q$, '70000');
select t.valor('la boleta se calcula sobre el pago ya recortado', $q$select monto_boleta::text from public.eventos_vista where nombre = 'Tope 10h'$q$, '82596');
select t.valor('un pago fijo puesto a mano no se recorta', $q$select pago_liquido::text from public.eventos_vista where nombre = 'Fijo sobre el tope'$q$, '90000');
select t.debe_funcionar('admin sube el tope', $q$update public.config set tope_dia = 80000$q$);
select t.valor('con tope de $80.000, 10 h sale $80.000', $q$select pago_liquido::text from public.eventos_vista where nombre = 'Tope 10h'$q$, '80000');
select t.debe_funcionar('admin vuelve el tope a $70.000', $q$update public.config set tope_dia = 70000$q$);
select t.como('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.test');
select t.afecta('una barista no puede cambiar el tope', $q$update public.config set tope_dia = 999999$q$, 0);

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
