-- Pruebas de las políticas del esquema. Correr DESPUÉS de shim-supabase.sql y
-- esquema.sql, en una base vacía de pruebas (nunca en la de verdad).
-- Termina imprimiendo cuántas pasaron y cuáles fallaron.

begin;

\ir arnes.sql

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

-- ---------------------------------------------------------------------------
-- Seguimiento: reconfirmación, semáforo, checklist y cierre
-- ---------------------------------------------------------------------------
select t.root();
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000d', 'dani@ejemplo.test'),
  ('00000000-0000-0000-0000-00000000000e', 'eli@ejemplo.test');

select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('admin crea eventos de seguimiento', $q$
  insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
   ('e0000000-0000-0000-0000-000000000020', 'Seg 3 días sin baristas', current_date + 3,  '18:00', '22:00', 'Santiago', 2, 'abierto'),
   ('e0000000-0000-0000-0000-000000000021', 'Seg 20 días sin baristas', current_date + 20, '18:00', '22:00', 'Santiago', 2, 'abierto'),
   ('e0000000-0000-0000-0000-000000000022', 'Seg 10 días completo',    current_date + 10, '18:00', '22:00', 'Santiago', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000023', 'Seg 3 días sin reconfirmar', current_date + 3, '18:00', '22:00', 'Santiago', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000024', 'Seg pasado reciente',     current_date - 3,  '18:00', '22:00', 'Santiago', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000025', 'Seg pasado viejo',        current_date - 10, '18:00', '22:00', 'Santiago', 1, 'abierto'),
   ('e0000000-0000-0000-0000-000000000026', 'Seg borrador',            current_date + 2,  '18:00', '22:00', 'Santiago', 1, 'borrador')
$q$);

select t.como('00000000-0000-0000-0000-00000000000d', 'dani@ejemplo.test');
select t.debe_funcionar('Dani se registra (con permiso de avisos)', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad,acepta_avisos)
  values ('00000000-0000-0000-0000-00000000000d','Dani Prueba','10.000.013-K','dani@ejemplo.test','+56911112222','Ñuñoa','BCI','Cuenta vista','11112222',true,true,'x',true,true)$q$);
select t.como('00000000-0000-0000-0000-00000000000e', 'eli@ejemplo.test');
select t.debe_funcionar('Eli se registra (sin permiso de avisos)', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-00000000000e','Eli Prueba','12.345.678-5','eli@ejemplo.test','+56933334444','Providencia','Banco Estado','Cuenta RUT','33334444',true,true,'x',true)$q$);
select t.root();
select t.valor('el permiso de avisos es opcional y parte en falso', $q$select acepta_avisos::text from public.baristas where nombre = 'Eli Prueba'$q$, 'false');

-- Postulan (los eventos pasados los asigna la administración directamente)
select t.como('00000000-0000-0000-0000-00000000000d', 'dani@ejemplo.test');
select t.debe_funcionar('Dani postula al de 10 días', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-00000000000d')$q$);
select t.debe_funcionar('Dani intenta postular con datos de cierre puestos (se anulan)', $q$insert into public.postulaciones(evento_id, barista_id, honorarios_pagados_en, boleta_honorarios_folio, asistencia_confirmada_en)
  values ('e0000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-00000000000d', current_date, '999', now())$q$);
select t.como('00000000-0000-0000-0000-00000000000e', 'eli@ejemplo.test');
select t.debe_funcionar('Eli postula al de 3 días', $q$insert into public.postulaciones(evento_id, barista_id) values ('e0000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-00000000000e')$q$);
select t.root();
select t.valor('los datos de cierre puestos al postular se anulan', $q$select (honorarios_pagados_en is null and boleta_honorarios_folio is null and asistencia_confirmada_en is null)::text from public.postulaciones where evento_id = 'e0000000-0000-0000-0000-000000000020' and barista_id = '00000000-0000-0000-0000-00000000000d'$q$, 'true');

-- Antes de asignar: Eli intenta confirmar asistencia estando solo postulada
select t.como('00000000-0000-0000-0000-00000000000e', 'eli@ejemplo.test');
select t.debe_funcionar('Eli intenta confirmar sin estar asignada (no hace nada)', $q$update public.postulaciones set asistencia_confirmada_en = now() where evento_id = 'e0000000-0000-0000-0000-000000000023'$q$);
select t.valor('y no queda confirmada', $q$select (asistencia_confirmada_en is null)::text from public.postulaciones where evento_id = 'e0000000-0000-0000-0000-000000000023'$q$, 'true');

-- La administración asigna
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('admin asigna a Dani (10 días)', $q$update public.postulaciones set estado = 'confirmada' where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$);
select t.debe_funcionar('admin asigna a Eli (3 días)', $q$update public.postulaciones set estado = 'confirmada' where evento_id = 'e0000000-0000-0000-0000-000000000023'$q$);
select t.debe_funcionar('admin asigna a Dani en los eventos ya pasados', $q$insert into public.postulaciones(evento_id, barista_id, estado) values
  ('e0000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-00000000000d','confirmada'),
  ('e0000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-00000000000d','confirmada')$q$);
select t.valor('recién asignada, la asistencia está sin confirmar', $q$select (asistencia_confirmada_en is null)::text from public.postulaciones where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$, 'true');

-- Semáforo antes de reconfirmar
select t.valor('3 días y faltan baristas → alerta',               $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 3 días sin baristas'$q$, 'alerta');
select t.valor('20 días y faltan baristas → pendiente (hay tiempo)', $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 20 días sin baristas'$q$, 'pendiente');
select t.valor('10 días, cupos completos, sin reconfirmar → pendiente', $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 10 días completo'$q$, 'pendiente');
select t.valor('3 días, asignada sin reconfirmar → alerta',       $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 3 días sin reconfirmar'$q$, 'alerta');
select t.valor('un borrador no tiene semáforo',                   $q$select coalesce(semaforo, 'sin') from public.seguimiento_vista where nombre = 'Seg borrador'$q$, 'sin');
select t.valor('un evento pasado no tiene semáforo',              $q$select coalesce(semaforo, 'sin') from public.seguimiento_vista where nombre = 'Seg pasado reciente'$q$, 'sin');
select t.valor('faltan 2 en el de 3 días (nadie asignado)',       $q$select faltan::text from public.seguimiento_vista where nombre = 'Seg 3 días sin baristas'$q$, '2');
select t.valor('y hay 1 postulante esperando (Dani, aún sin asignar)', $q$select postulantes::text from public.seguimiento_vista where nombre = 'Seg 3 días sin baristas'$q$, '1');
select t.valor('días restantes = 3',                              $q$select dias_restantes::text from public.seguimiento_vista where nombre = 'Seg 3 días sin baristas'$q$, '3');

-- Reconfirmación de Dani
select t.como('00000000-0000-0000-0000-00000000000d', 'dani@ejemplo.test');
select t.debe_funcionar('Dani confirma que va (manda una fecha falsa)', $q$update public.postulaciones set asistencia_confirmada_en = '2000-01-01' where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$);
select t.valor('la fecha de confirmación la pone el servidor', $q$select (asistencia_confirmada_en > now() - interval '1 minute')::text from public.postulaciones where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$, 'true');
select t.debe_fallar('Dani no puede deshacer su confirmación', $q$update public.postulaciones set asistencia_confirmada_en = null where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$);
select t.debe_fallar('Dani no puede marcarse el pago', $q$update public.postulaciones set honorarios_pagados_en = current_date where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$);
select t.debe_fallar('Dani no puede registrar su boleta', $q$update public.postulaciones set boleta_honorarios_recibida_en = current_date, boleta_honorarios_folio = '1' where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$);
select t.filas('Dani no ve el seguimiento', 'select * from public.seguimiento_vista', 0);
select t.filas('Dani no ve el checklist ni el cierre del cliente', 'select * from public.evento_seguimiento', 0);
select t.debe_fallar('Dani no escribe en el seguimiento', $q$insert into public.evento_seguimiento(evento_id) values ('e0000000-0000-0000-0000-000000000022')$q$);
select t.afecta('Dani no cambia los plazos de alerta', $q$update public.config set dias_alerta_baristas = 0$q$, 0);

select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('con Dani reconfirmado el de 10 días queda ok', $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 10 días completo'$q$, 'ok');
select t.valor('reconfirmados = 1', $q$select reconfirmados::text from public.seguimiento_vista where nombre = 'Seg 10 días completo'$q$, '1');
select t.debe_funcionar('admin marca reconfirmada a Eli (lo confirmó por WhatsApp)', $q$update public.postulaciones set asistencia_confirmada_en = now() where evento_id = 'e0000000-0000-0000-0000-000000000023'$q$);
select t.valor('el de 3 días con todos reconfirmados queda ok', $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 3 días sin reconfirmar'$q$, 'ok');
select t.debe_funcionar('admin desasigna a Eli (vuelve a postulada)', $q$update public.postulaciones set estado = 'postulada' where evento_id = 'e0000000-0000-0000-0000-000000000023'$q$);
select t.valor('al desasignar, la reconfirmación se borra', $q$select (asistencia_confirmada_en is null)::text from public.postulaciones where evento_id = 'e0000000-0000-0000-0000-000000000023'$q$, 'true');
select t.valor('y el evento vuelve a alerta (faltan baristas a 3 días)', $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 3 días sin reconfirmar'$q$, 'alerta');

-- Plazos de alerta configurables
select t.debe_funcionar('admin cambia la alerta de baristas a 2 días', $q$update public.config set dias_alerta_baristas = 2$q$);
select t.valor('con 2 días de plazo, el de 3 días sin baristas pasa a pendiente', $q$select semaforo from public.seguimiento_vista where nombre = 'Seg 3 días sin baristas'$q$, 'pendiente');
select t.debe_funcionar('admin vuelve la alerta a 7 días', $q$update public.config set dias_alerta_baristas = 7$q$);

-- Checklist
select t.valor('checklist: 5 puntos por defecto', $q$select checklist_total::text from public.seguimiento_vista where nombre = 'Seg 10 días completo'$q$, '5');
select t.valor('checklist: 0 hechos al comienzo', $q$select checklist_hechos::text from public.seguimiento_vista where nombre = 'Seg 10 días completo'$q$, '0');
select t.debe_funcionar('admin marca 2 puntos del checklist', $q$insert into public.evento_seguimiento(evento_id, checklist) values ('e0000000-0000-0000-0000-000000000022', '{"grupo_whatsapp":"2026-10-20T10:00:00Z","equipo":"2026-10-20T11:00:00Z"}')$q$);
select t.valor('checklist: 2 de 5', $q$select checklist_hechos || ' de ' || checklist_total from public.seguimiento_vista where nombre = 'Seg 10 días completo'$q$, '2 de 5');
select t.debe_fallar('el checklist debe ser un objeto', $q$update public.evento_seguimiento set checklist = '[1,2]' where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$);

-- Cierre
select t.valor('evento pasado reciente: por cerrar pero no atrasado', $q$select por_cerrar::text || '/' || cierre_atrasado::text from public.seguimiento_vista where nombre = 'Seg pasado reciente'$q$, 'true/false');
select t.valor('evento pasado hace 10 días: por cerrar y atrasado',   $q$select por_cerrar::text || '/' || cierre_atrasado::text from public.seguimiento_vista where nombre = 'Seg pasado viejo'$q$, 'true/true');
select t.valor('evento futuro nunca está por cerrar',                  $q$select por_cerrar::text from public.seguimiento_vista where nombre = 'Seg 10 días completo'$q$, 'false');
select t.valor('pendientes del evento reciente: 1 boleta, 1 pago, documento',  $q$select boletas_pendientes || '/' || pagos_pendientes || '/' || documento_cliente_pendiente from public.seguimiento_vista where nombre = 'Seg pasado reciente'$q$, '1/1/true');
select t.debe_funcionar('admin registra boleta y pago del barista', $q$update public.postulaciones set boleta_honorarios_recibida_en = current_date, boleta_honorarios_folio = 'B-123', honorarios_pagados_en = current_date where evento_id = 'e0000000-0000-0000-0000-000000000024'$q$);
select t.valor('falta solo el documento al cliente', $q$select por_cerrar::text || '/' || boletas_pendientes || '/' || pagos_pendientes from public.seguimiento_vista where nombre = 'Seg pasado reciente'$q$, 'true/0/0');
select t.debe_funcionar('admin registra el documento al cliente', $q$insert into public.evento_seguimiento(evento_id, documento_cliente_emitido_en, documento_cliente_folio) values ('e0000000-0000-0000-0000-000000000024', current_date, 'F-77')$q$);
select t.valor('con todo registrado el evento queda cerrado', $q$select por_cerrar::text || '/' || cierre_atrasado::text from public.seguimiento_vista where nombre = 'Seg pasado reciente'$q$, 'false/false');
select t.debe_fallar('el folio no puede ser larguísimo', $q$update public.postulaciones set boleta_honorarios_folio = repeat('x', 50) where evento_id = 'e0000000-0000-0000-0000-000000000024'$q$);

-- Retirarse borra la reconfirmación
select t.como('00000000-0000-0000-0000-00000000000d', 'dani@ejemplo.test');
select t.debe_funcionar('Dani se retira del de 10 días', $q$update public.postulaciones set estado = 'retirada' where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$);
select t.valor('al retirarse pierde la confirmación', $q$select (asistencia_confirmada_en is null)::text from public.postulaciones where evento_id = 'e0000000-0000-0000-0000-000000000022'$q$, 'true');

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
