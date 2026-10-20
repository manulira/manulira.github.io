-- Pruebas de los accesos con ID y clave, el equipo de cada evento, el ranking, el traslado con
-- camioneta y las fotos de perfil. Correr DESPUÉS de shim-supabase.sql y esquema.sql, en una base
-- vacía de pruebas. Termina imprimiendo cuántas pasaron y cuáles fallaron.

begin;
\ir arnes.sql

create table t.claves (usuario text primary key, clave text);
grant all on t.claves to public;
-- Crea un acceso con el rol actual y guarda la clave temporal para poder probarla.
create function t.crear(p_usuario text, p_nombre text) returns void language plpgsql as $$
declare r jsonb;
begin
  r := public.crear_acceso(p_usuario, p_nombre);
  insert into t.claves values (r ->> 'usuario', r ->> 'clave') on conflict (usuario) do update set clave = excluded.clave;
end $$;
create function t.restablecer(p_usuario text) returns void language plpgsql as $$
begin
  update t.claves set clave = public.restablecer_clave((select id from public.accesos where usuario = p_usuario)) where usuario = p_usuario;
end $$;
-- ¿Esta clave abre este acceso? (compara con el hash guardado, como hace Supabase Auth)
create function t.abre(p_usuario text, p_clave text) returns text language sql as $$
  select (encrypted_password = extensions.crypt(p_clave, encrypted_password))::text from auth.users where email = p_usuario || '@equipo.sepiacoffee.cl' $$;
create function t.clave_de(p_usuario text) returns text language sql as $$ select clave from t.claves where usuario = p_usuario $$;

-- Personas
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000bb', 'beto@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000cc', 'carla@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000dd', 'dani@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000ee', 'zoe@ejemplo.test');
insert into public.admins(email) values ('admin@ejemplo.test');

-- ---------------------------------------------------------------------------
-- Crear accesos
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración crea un acceso', $q$select t.crear('camila.perez', 'Camila Pérez')$q$);
select t.valor('la clave temporal tiene el formato xxxx-xxxx-xxxx sin letras que se confunden', $q$select (t.clave_de('camila.perez') ~ '^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$')::text$q$, 'true');
select t.root();
select t.valor('la clave temporal abre el acceso', $q$select t.abre('camila.perez', t.clave_de('camila.perez'))$q$, 'true');
select t.valor('otra clave no lo abre', $q$select t.abre('camila.perez', 'otra-clave-xxxx')$q$, 'false');
select t.valor('la clave no se guarda en claro', $q$select (encrypted_password like '$2%')::text from auth.users where email = 'camila.perez@equipo.sepiacoffee.cl'$q$, 'true');
select t.valor('la cuenta queda confirmada, lista para entrar', $q$select (email_confirmed_at is not null and aud = 'authenticated' and role = 'authenticated' and banned_until is null)::text from auth.users where email = 'camila.perez@equipo.sepiacoffee.cl'$q$, 'true');
select t.valor('con las columnas de tokens vacías (no NULL)', $q$select (confirmation_token = '' and recovery_token = '' and email_change = '' and email_change_token_new = '')::text from auth.users where email = 'camila.perez@equipo.sepiacoffee.cl'$q$, 'true');
select t.valor('y su identidad de correo', $q$select provider || ' ' || (identity_data ->> 'email') from auth.identities i join auth.users u on u.id = i.user_id where u.email = 'camila.perez@equipo.sepiacoffee.cl'$q$, 'email camila.perez@equipo.sepiacoffee.cl');
select t.valor('el acceso parte activo y con la clave por cambiar', $q$select activo::text || ' ' || debe_cambiar_clave::text || ' ' || nombre from public.accesos where usuario = 'camila.perez'$q$, 'true true Camila Pérez');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_fallar('el ID no se repite', $q$select public.crear_acceso('camila.perez', 'Otra Camila')$q$);
select t.debe_fallar('ni con mayúsculas', $q$select public.crear_acceso('Camila.Perez', 'Otra Camila')$q$);
select t.debe_fallar('un ID muy corto no sirve', $q$select public.crear_acceso('ab', 'Ana Beta')$q$);
select t.debe_fallar('ni con tildes o ñ', $q$select public.crear_acceso('ñandú', 'Ana Beta')$q$);
select t.debe_fallar('ni con espacios', $q$select public.crear_acceso('ana beta', 'Ana Beta')$q$);
select t.debe_fallar('ni con arroba (no es un correo)', $q$select public.crear_acceso('ana@beta', 'Ana Beta')$q$);
select t.debe_fallar('ni uno larguísimo', $q$select public.crear_acceso(repeat('a', 31), 'Ana Beta')$q$);
select t.debe_fallar('sin nombre no se crea', $q$select public.crear_acceso('ana.beta', '  ')$q$);
select t.debe_funcionar('con punto, guion y guion bajo sí', $q$select public.crear_acceso('ana-beta_2.x', 'Ana Beta')$q$);

-- Quién puede y quién no
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.debe_fallar('una persona que no es administración no crea accesos', $q$select public.crear_acceso('intruso', 'Intruso Prueba')$q$);
select t.debe_fallar('ni restablece claves', $q$select public.restablecer_clave('00000000-0000-0000-0000-0000000000aa')$q$);
select t.debe_fallar('ni desactiva accesos', $q$select public.cambiar_estado_acceso('00000000-0000-0000-0000-0000000000aa', false)$q$);
select t.debe_fallar('ni elimina accesos', $q$select public.eliminar_acceso('00000000-0000-0000-0000-0000000000aa')$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test', 'password');
select t.debe_fallar('un administrador que entró con contraseña (no con el código) tampoco', $q$select public.crear_acceso('intruso', 'Intruso Prueba')$q$);
select t.anonimo();
select t.debe_fallar('sin sesión no se ejecuta', $q$select public.crear_acceso('intruso', 'Intruso Prueba')$q$);
select t.debe_fallar('sin sesión no hay accesos', 'select * from public.accesos');
select t.root();
select t.debe_funcionar('desde el editor SQL de Supabase sí se puede crear un acceso', $q$select t.crear('beto.soto', 'Beto Soto')$q$);
select t.valor('nadie se creó por los intentos fallidos', $q$select count(*)::text from public.accesos$q$, '3');

-- Qué ve cada uno de la tabla de accesos
insert into public.accesos(id, usuario, nombre) values
  ('00000000-0000-0000-0000-0000000000aa', 'ana.prueba', 'Ana Prueba'),
  ('00000000-0000-0000-0000-0000000000bb', 'beto.prueba', 'Beto Prueba'),
  ('00000000-0000-0000-0000-0000000000cc', 'carla.prueba', 'Carla Prueba'),
  ('00000000-0000-0000-0000-0000000000dd', 'dani.prueba', 'Dani Prueba');
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.filas('Ana ve solo su acceso', 'select * from public.accesos', 1);
select t.afecta('Ana no cambia su acceso a mano', $q$update public.accesos set activo = true, debe_cambiar_clave = false$q$, 0);
select t.afecta('ni borra accesos', $q$delete from public.accesos$q$, 0);
select t.debe_fallar('ni crea uno', $q$insert into public.accesos(id, usuario, nombre) values (gen_random_uuid(), 'x.yz', 'Xyz')$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.filas('la administración ve todos', 'select * from public.accesos', 7);
select t.debe_fallar('el admin tampoco toca la tabla a mano (solo por las funciones)', $q$update public.accesos set activo = false$q$);

-- Cambiar la clave temporal
select t.root();
update public.accesos set debe_cambiar_clave = true where usuario = 'ana.prueba';
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.debe_funcionar('Ana avisa que cambió su clave', $q$select public.acceso_clave_cambiada()$q$);
select t.valor('queda anotado', $q$select (not debe_cambiar_clave and clave_cambiada_en is not null)::text from public.accesos where usuario = 'ana.prueba'$q$, 'true');
select t.root();
select t.valor('y no toca el acceso de otra persona', $q$select debe_cambiar_clave::text from public.accesos where usuario = 'camila.perez'$q$, 'true');

-- Restablecer la clave
insert into auth.sessions(user_id) select id from auth.users where email = 'camila.perez@equipo.sepiacoffee.cl';
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.root();
select t.valor('hay una sesión abierta de Camila', $q$select count(*)::text from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'camila.perez@equipo.sepiacoffee.cl'$q$, '1');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.root();
update public.accesos set debe_cambiar_clave = false where usuario = 'camila.perez';
create temp table t_vieja as select t.clave_de('camila.perez') as clave;
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración restablece la clave', $q$select t.restablecer('camila.perez')$q$);
select t.root();
select t.valor('la clave nueva abre', $q$select t.abre('camila.perez', t.clave_de('camila.perez'))$q$, 'true');
select t.valor('la vieja ya no', $q$select t.abre('camila.perez', (select clave from t_vieja))$q$, 'false');
select t.valor('vuelve a quedar «por cambiar»', $q$select debe_cambiar_clave::text from public.accesos where usuario = 'camila.perez'$q$, 'true');
select t.valor('se cerraron sus sesiones', $q$select count(*)::text from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'camila.perez@equipo.sepiacoffee.cl'$q$, '0');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_fallar('restablecer uno que no existe falla', $q$select public.restablecer_clave(gen_random_uuid())$q$);

-- Desactivar y reactivar
select t.root();
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos, talla_camisa, tiene_camioneta) values
  ('00000000-0000-0000-0000-0000000000aa', 'Ana Prueba',  '11.111.111-1', 'ana@ejemplo.test',  '+56911110001', 'Ñuñoa',  'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true,  'M', true),
  ('00000000-0000-0000-0000-0000000000bb', 'Beto Prueba', '12.345.678-5', 'beto@ejemplo.test', '+56911110002', 'Macul',  'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, false, 'L', false),
  ('00000000-0000-0000-0000-0000000000cc', 'Carla Prueba','10.000.013-K', 'carla@ejemplo.test','+56911110003', 'Pirque', 'BCI', 'Cuenta vista', '11110003', true, true, 'x', true, false, 'S', false),
  ('00000000-0000-0000-0000-0000000000dd', 'Dani Prueba', '77.971.241-9', 'dani@ejemplo.test', '+56911110004', 'Colina', 'BCI', 'Cuenta vista', '11110004', true, true, 'x', true, false, 'XL', false);
select t.root();
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
  ('e1000000-0000-0000-0000-000000000001', 'Evento cercano', t.hoy() + 3, '18:00', '22:00', 'Santiago', 2, 'abierto');
select t.como('00000000-0000-0000-0000-0000000000dd', 'dani@ejemplo.test');
select t.valor('Dani, activo, es barista', $q$select public.es_barista()::text$q$, 'true');
select t.filas('y ve el evento', 'select * from public.eventos_vista', 1);
select t.root();
insert into auth.sessions(user_id) values ('00000000-0000-0000-0000-0000000000dd');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración desactiva a Dani', $q$select public.cambiar_estado_acceso('00000000-0000-0000-0000-0000000000dd', false)$q$);
select t.root();
select t.valor('queda desactivado en el acceso y bloqueado en Auth por décadas', $q$select (a.activo = false and u.banned_until > now() + interval '50 years')::text from public.accesos a join auth.users u on u.id = a.id where a.usuario = 'dani.prueba'$q$, 'true');
select t.como('00000000-0000-0000-0000-0000000000dd', 'dani@ejemplo.test');
select t.valor('Dani desactivado deja de ser barista', $q$select public.es_barista()::text$q$, 'false');
select t.filas('no ve eventos', 'select * from public.eventos_vista', 0);
select t.filas('ni su perfil', 'select * from public.baristas', 0);
select t.debe_fallar('ni puede postular', $q$insert into public.postulaciones(evento_id, barista_id) values ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd')$q$);
select t.afecta('ni editar su perfil', $q$update public.baristas set comuna = 'Otra' where id = '00000000-0000-0000-0000-0000000000dd'$q$, 0);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración lo reactiva', $q$select public.cambiar_estado_acceso('00000000-0000-0000-0000-0000000000dd', true)$q$);
select t.root();
select t.valor('Auth lo desbloquea', $q$select (u.banned_until is null and a.activo)::text from public.accesos a join auth.users u on u.id = a.id where a.usuario = 'dani.prueba'$q$, 'true');
select t.valor('y se cerraron sus sesiones al desactivarlo', $q$select count(*)::text from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000dd'$q$, '0');
select t.como('00000000-0000-0000-0000-0000000000dd', 'dani@ejemplo.test');
select t.valor('Dani vuelve a ser barista', $q$select public.es_barista()::text$q$, 'true');

-- Sin acceso no se es barista aunque se tenga cuenta
select t.como('00000000-0000-0000-0000-0000000000ee', 'zoe@ejemplo.test');
select t.valor('Zoe tiene cuenta pero no acceso: no es barista', $q$select public.es_barista()::text$q$, 'false');
select t.valor('y no tiene acceso activo', $q$select public.tiene_acceso_activo()::text$q$, 'false');
select t.debe_fallar('no puede crear un perfil', $q$insert into public.baristas(id,nombre,rut,correo,telefono,comuna,banco,tipo_cuenta,numero_cuenta,cuenta_propia,acepta_boleta,acepta_boleta_texto,acepta_privacidad)
  values ('00000000-0000-0000-0000-0000000000ee','Zoe Prueba','22.222.222-2','zoe@ejemplo.test','+56912345678','Vitacura','BCI','Cuenta vista','12345678',true,true,'x',true)$q$);
select t.filas('no ve eventos', 'select * from public.eventos_vista', 0);
select t.filas('ni el ranking', 'select * from public.ranking_equipo()', 0);

-- Eliminar a una persona borra todo lo suyo
select t.root();
insert into public.postulaciones(evento_id, barista_id) values ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000cc');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración elimina a Carla', $q$select public.eliminar_acceso('00000000-0000-0000-0000-0000000000cc')$q$);
select t.root();
select t.valor('ya no queda nada de Carla', $q$select ((select count(*) from auth.users where email = 'carla@ejemplo.test') + (select count(*) from public.accesos where usuario = 'carla.prueba')
  + (select count(*) from public.baristas where nombre = 'Carla Prueba') + (select count(*) from public.postulaciones where barista_id = '00000000-0000-0000-0000-0000000000cc'))::text$q$, '0');

-- ---------------------------------------------------------------------------
-- Perfil: talla, camioneta, foto y turnos previos
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.debe_funcionar('Ana cambia su talla y su camioneta', $q$update public.baristas set talla_camisa = 'L', tiene_camioneta = false where id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.debe_funcionar('y la vuelve a declarar', $q$update public.baristas set tiene_camioneta = true where id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.debe_fallar('una talla inventada se rechaza', $q$update public.baristas set talla_camisa = 'XXXL' where id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.debe_funcionar('Ana pone su foto (dentro de su carpeta)', $q$update public.baristas set foto_path = '00000000-0000-0000-0000-0000000000aa/foto.jpg' where id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.debe_fallar('no puede apuntar a la carpeta de otra persona', $q$update public.baristas set foto_path = '00000000-0000-0000-0000-0000000000bb/foto.jpg' where id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.debe_fallar('ni usar una ruta rara', $q$update public.baristas set foto_path = '00000000-0000-0000-0000-0000000000aa/../x.jpg' where id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.debe_funcionar('Ana intenta ponerse turnos previos (se ignora)', $q$update public.baristas set turnos_previos = 99 where id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.root();
select t.valor('siguen en 0', $q$select turnos_previos::text from public.baristas where nombre = 'Ana Prueba'$q$, '0');
update public.baristas set turnos_previos = 12 where nombre = 'Beto Prueba';
select t.valor('la administración (o el editor SQL) sí los pone', $q$select turnos_previos::text from public.baristas where nombre = 'Beto Prueba'$q$, '12');

select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración corrige los turnos previos de Beto', $q$update public.baristas set turnos_previos = 15 where nombre = 'Beto Prueba'$q$);
select t.valor('queda guardado', $q$select turnos_previos::text from public.baristas where nombre = 'Beto Prueba'$q$, '15');
select t.debe_funcionar('y los deja en 12', $q$update public.baristas set turnos_previos = 12 where nombre = 'Beto Prueba'$q$);
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.afecta('Ana no edita el perfil de Beto', $q$update public.baristas set comuna = 'Otra' where nombre = 'Beto Prueba'$q$, 0);

-- ---------------------------------------------------------------------------
-- Equipo de un evento
-- ---------------------------------------------------------------------------
select t.root();
update public.baristas set foto_path = '00000000-0000-0000-0000-0000000000bb/foto.jpg' where nombre = 'Beto Prueba';
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
  ('e1000000-0000-0000-0000-000000000002', 'Evento con equipo', t.hoy() + 5, '18:00', '22:00', 'Santiago', 3, 'abierto'),
  ('e1000000-0000-0000-0000-000000000003', 'Evento de Dani', t.hoy() + 6, '18:00', '22:00', 'Santiago', 1, 'abierto');
insert into public.postulaciones(evento_id, barista_id, estado) values
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa', 'confirmada'),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000bb', 'confirmada'),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', 'postulada'),
  ('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000dd', 'confirmada');
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.valor('Ana ve a su equipo: ella y Beto', $q$select string_agg(nombre, ', ' order by nombre) from public.equipo_evento('e1000000-0000-0000-0000-000000000002')$q$, 'Ana Prueba, Beto Prueba');
select t.valor('con la foto de Beto', $q$select foto_path from public.equipo_evento('e1000000-0000-0000-0000-000000000002') where nombre = 'Beto Prueba'$q$, '00000000-0000-0000-0000-0000000000bb/foto.jpg');
select t.valor('la postulante que no está asignada no sale', $q$select count(*)::text from public.equipo_evento('e1000000-0000-0000-0000-000000000002') where nombre = 'Dani Prueba'$q$, '0');
select t.filas('de un evento donde no está asignada no ve a nadie', $q$select * from public.equipo_evento('e1000000-0000-0000-0000-000000000003')$q$, 0);
select t.filas('de un evento que no existe, tampoco', $q$select * from public.equipo_evento(gen_random_uuid())$q$, 0);
select t.como('00000000-0000-0000-0000-0000000000dd', 'dani@ejemplo.test');
select t.filas('Dani, postulante pero no asignado, no ve al equipo', $q$select * from public.equipo_evento('e1000000-0000-0000-0000-000000000002')$q$, 0);
select t.como('00000000-0000-0000-0000-0000000000ee', 'zoe@ejemplo.test');
select t.filas('Zoe, sin acceso, tampoco', $q$select * from public.equipo_evento('e1000000-0000-0000-0000-000000000002')$q$, 0);
select t.anonimo();
select t.debe_fallar('sin sesión no se ejecuta', $q$select * from public.equipo_evento('e1000000-0000-0000-0000-000000000002')$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.filas('la administración ve a los dos asignados', $q$select * from public.equipo_evento('e1000000-0000-0000-0000-000000000002')$q$, 2);

-- ---------------------------------------------------------------------------
-- Ranking
-- ---------------------------------------------------------------------------
select t.root();
-- Beto: 12 previos. Eventos pasados con asistencia: Ana 3, Beto 1, Dani 3 (uno cancelado y uno sin marcar no cuentan)
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
  ('e1000000-0000-0000-0000-0000000000a1', 'Pasado 1', t.hoy() - 40, '18:00', '22:00', 'Santiago', 3, 'abierto'),
  ('e1000000-0000-0000-0000-0000000000a2', 'Pasado 2', t.hoy() - 20, '18:00', '22:00', 'Santiago', 3, 'abierto'),
  ('e1000000-0000-0000-0000-0000000000a3', 'Pasado 3', t.hoy() - 5,  '18:00', '22:00', 'Santiago', 3, 'abierto'),
  ('e1000000-0000-0000-0000-0000000000a4', 'Pasado cancelado', t.hoy() - 3, '18:00', '22:00', 'Santiago', 3, 'cancelado');
insert into public.postulaciones(evento_id, barista_id, estado, asistio) values
  ('e1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000aa', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000aa', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000dd', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000dd', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000dd', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000dd', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000bb', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000bb', 'confirmada', false),
  ('e1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000bb', 'confirmada', null);
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.valor('acumulado: Beto 13 (12 previos + 1), luego Ana y Dani empatadas en 3', $q$select string_agg(puesto || ' ' || nombre || ' ' || turnos, ' | ' order by puesto, nombre) from public.ranking_equipo()$q$,
  '1 Beto Prueba 13 | 2 Ana Prueba 3 | 2 Dani Prueba 3');
select t.valor('el empate comparte puesto', $q$select count(distinct puesto)::text from public.ranking_equipo()$q$, '2');
select t.valor('un mes: no cuenta los turnos previos, solo lo de ese período', $q$select string_agg(nombre || ' ' || turnos, ' | ' order by nombre) from public.ranking_equipo(t.hoy() - 25, t.hoy() - 1)$q$,
  'Ana Prueba 2 | Beto Prueba 1 | Dani Prueba 2');
select t.valor('«cancelado», «no asistió» y «sin marcar» no suman', $q$select turnos::text from public.ranking_equipo(t.hoy() - 60, t.hoy()) where nombre = 'Dani Prueba'$q$, '3');
select t.valor('el ranking trae la foto para mostrarla', $q$select foto_path from public.ranking_equipo() where nombre = 'Beto Prueba'$q$, '00000000-0000-0000-0000-0000000000bb/foto.jpg');
select t.valor('Ana ve a todo el equipo (nombre y turnos, nada más)', $q$select count(*)::text from public.ranking_equipo()$q$, '3');
select t.debe_fallar('y no puede pedir otras columnas', $q$select rut from public.ranking_equipo()$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.valor('la administración también lo ve', $q$select count(*)::text from public.ranking_equipo()$q$, '3');
select t.debe_funcionar('la administración desactiva a Dani', $q$select public.cambiar_estado_acceso('00000000-0000-0000-0000-0000000000dd', false)$q$);
select t.valor('un acceso desactivado sale del ranking', $q$select count(*)::text from public.ranking_equipo() where nombre = 'Dani Prueba'$q$, '0');
select t.debe_funcionar('y se reactiva', $q$select public.cambiar_estado_acceso('00000000-0000-0000-0000-0000000000dd', true)$q$);
select t.anonimo();
select t.debe_fallar('sin sesión no se ve el ranking', $q$select * from public.ranking_equipo()$q$);

-- Solo la administración marca la asistencia
select t.como('00000000-0000-0000-0000-0000000000bb', 'beto@ejemplo.test');
select t.debe_fallar('Beto no se marca la asistencia', $q$update public.postulaciones set asistio = true where evento_id = 'e1000000-0000-0000-0000-0000000000a1' and barista_id = '00000000-0000-0000-0000-0000000000bb'$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración marca que Beto asistió', $q$update public.postulaciones set asistio = true where evento_id = 'e1000000-0000-0000-0000-0000000000a1' and barista_id = '00000000-0000-0000-0000-0000000000bb'$q$);
select t.como('00000000-0000-0000-0000-0000000000bb', 'beto@ejemplo.test');
select t.valor('y el ranking de Beto sube', $q$select turnos::text from public.ranking_equipo() where nombre = 'Beto Prueba'$q$, '14');

-- ---------------------------------------------------------------------------
-- Traslado con camioneta
-- ---------------------------------------------------------------------------
select t.root();
select t.valor('por defecto rinde 10 km/l y el litro cuesta $1.400', $q$select rendimiento_km_l::text || ' ' || precio_litro::text from public.config$q$, '10 1400');
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado, requiere_camioneta) values
  ('e1000000-0000-0000-0000-0000000000c1', 'Con camioneta', t.hoy() + 4, '18:00', '22:00', 'Santiago', 3, 'abierto', true);
insert into public.postulaciones(evento_id, barista_id, estado) values
  ('e1000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000aa', 'confirmada'),
  ('e1000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000bb', 'confirmada');
select t.valor('el evento dice que necesita camioneta', $q$select requiere_camioneta::text from public.eventos_vista where nombre = 'Con camioneta'$q$, 'true');
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_fallar('no se puede asignar de conductor a quien no declaró camioneta', $q$update public.postulaciones set conductor = true where evento_id = 'e1000000-0000-0000-0000-0000000000c1' and barista_id = '00000000-0000-0000-0000-0000000000bb'$q$);
select t.debe_funcionar('Ana, que sí declaró, es la conductora', $q$update public.postulaciones set conductor = true where evento_id = 'e1000000-0000-0000-0000-0000000000c1' and barista_id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.root();
update public.baristas set tiene_camioneta = true where nombre = 'Beto Prueba';
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_fallar('solo una conductora por evento', $q$update public.postulaciones set conductor = true where evento_id = 'e1000000-0000-0000-0000-0000000000c1' and barista_id = '00000000-0000-0000-0000-0000000000bb'$q$);
select t.valor('sin kilómetros ni TAG el reembolso está pendiente de calcular', $q$select coalesce(total::text, 'pendiente') || ' ' || completo::text from public.traslados() where evento_id = 'e1000000-0000-0000-0000-0000000000c1'$q$, 'pendiente false');
select t.debe_funcionar('la administración anota 40 km y $3.500 de TAG', $q$insert into public.evento_traslado(evento_id, km, tag) values ('e1000000-0000-0000-0000-0000000000c1', 40, 3500)$q$);
select t.valor('bencina = 40 ÷ 10 × 1.400 = $5.600 y total $9.100', $q$select bencina::text || ' ' || total::text || ' ' || completo::text from public.traslados() where evento_id = 'e1000000-0000-0000-0000-0000000000c1'$q$, '5600 9100 true');
select t.debe_funcionar('se agrega el estacionamiento al cierre', $q$update public.postulaciones set traslado_estacionamiento = 2000 where conductor and evento_id = 'e1000000-0000-0000-0000-0000000000c1'$q$);
select t.valor('total $11.100', $q$select total::text from public.traslados() where evento_id = 'e1000000-0000-0000-0000-0000000000c1'$q$, '11100');
select t.debe_funcionar('cambia el rendimiento a 12 km/l', $q$update public.config set rendimiento_km_l = 12$q$);
select t.valor('bencina = 40 ÷ 12 × 1.400 = $4.667', $q$select bencina::text from public.traslados() where evento_id = 'e1000000-0000-0000-0000-0000000000c1'$q$, '4667');
select t.debe_fallar('el rendimiento no puede ser 0', $q$update public.config set rendimiento_km_l = 0$q$);
select t.debe_funcionar('vuelve a 10 km/l', $q$update public.config set rendimiento_km_l = 10$q$);
select t.debe_fallar('kilómetros negativos se rechazan', $q$update public.evento_traslado set km = -5$q$);
select t.valor('la administración ve el reembolso de todos los conductores', $q$select count(*)::text from public.traslados()$q$, '1');
select t.debe_funcionar('registra el pago del reembolso', $q$update public.postulaciones set traslado_pagado_en = t.hoy() where conductor and evento_id = 'e1000000-0000-0000-0000-0000000000c1'$q$);

select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.valor('Ana, la conductora, ve su reembolso y que ya se pagó', $q$select total::text || ' ' || (pagado_en is not null)::text from public.traslados()$q$, '11100 true');
select t.filas('y los kilómetros y el TAG del evento no se leen directamente', 'select * from public.evento_traslado', 0);
select t.debe_fallar('ni los puede escribir', $q$insert into public.evento_traslado(evento_id, km, tag) values ('e1000000-0000-0000-0000-000000000001', 1, 1)$q$);
select t.debe_fallar('Ana no se marca conductora en otro evento', $q$update public.postulaciones set conductor = true where evento_id = 'e1000000-0000-0000-0000-000000000002' and barista_id = '00000000-0000-0000-0000-0000000000aa'$q$);
select t.debe_fallar('ni se anota estacionamiento', $q$update public.postulaciones set traslado_estacionamiento = 99999 where conductor$q$);
select t.debe_fallar('ni marca su reembolso como pagado', $q$update public.postulaciones set traslado_pagado_en = null where conductor$q$);
select t.como('00000000-0000-0000-0000-0000000000bb', 'beto@ejemplo.test');
select t.filas('Beto, que no es conductor, no ve reembolsos', 'select * from public.traslados()', 0);
select t.como('00000000-0000-0000-0000-0000000000ee', 'zoe@ejemplo.test');
select t.filas('Zoe, sin acceso, tampoco', 'select * from public.traslados()', 0);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('si Ana se retira, deja de ser conductora', $q$update public.postulaciones set estado = 'retirada' where conductor and evento_id = 'e1000000-0000-0000-0000-0000000000c1'$q$);
select t.valor('ya no hay conductor en el evento', $q$select count(*)::text from public.postulaciones where conductor$q$, '0');
select t.valor('y el reembolso desaparece de la lista', $q$select count(*)::text from public.traslados()$q$, '0');

-- ---------------------------------------------------------------------------
-- Fotos de perfil (almacenamiento)
-- ---------------------------------------------------------------------------
select t.root();
select t.valor('el almacenamiento «perfiles» es privado, de 2 MB y solo imágenes', $q$select public::text || ' ' || file_size_limit::text || ' ' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'perfiles'$q$, 'false 2097152 image/jpeg,image/png,image/webp');
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.debe_funcionar('Ana sube su foto a su carpeta', $q$insert into storage.objects(bucket_id, name, owner) values ('perfiles', '00000000-0000-0000-0000-0000000000aa/foto.jpg', auth.uid())$q$);
select t.debe_fallar('no puede subir a la carpeta de otra persona', $q$insert into storage.objects(bucket_id, name, owner) values ('perfiles', '00000000-0000-0000-0000-0000000000bb/foto2.jpg', auth.uid())$q$);
select t.debe_fallar('ni a la raíz', $q$insert into storage.objects(bucket_id, name, owner) values ('perfiles', 'foto.jpg', auth.uid())$q$);
select t.debe_fallar('ni a otro almacenamiento', $q$insert into storage.objects(bucket_id, name, owner) values ('otro', '00000000-0000-0000-0000-0000000000aa/foto.jpg', auth.uid())$q$);
select t.root();
insert into storage.objects(bucket_id, name) values ('perfiles', '00000000-0000-0000-0000-0000000000bb/foto.jpg');
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.filas('Ana ve las fotos del equipo (la suya y la de Beto)', $q$select * from storage.objects where bucket_id = 'perfiles'$q$, 2);
select t.afecta('Ana no borra la foto de Beto', $q$delete from storage.objects where name like '%bb/%'$q$, 0);
select t.afecta('ni la cambia', $q$update storage.objects set name = '00000000-0000-0000-0000-0000000000aa/robada.jpg' where name like '%bb/%'$q$, 0);
select t.afecta('sí cambia la suya', $q$update storage.objects set name = '00000000-0000-0000-0000-0000000000aa/nueva.jpg' where name like '%aa/foto.jpg'$q$, 1);
select t.afecta('y la borra', $q$delete from storage.objects where name like '%aa/nueva.jpg'$q$, 1);
select t.como('00000000-0000-0000-0000-0000000000ee', 'zoe@ejemplo.test');
select t.filas('Zoe, sin acceso, no ve ninguna foto', $q$select * from storage.objects where bucket_id = 'perfiles'$q$, 0);
select t.debe_fallar('ni sube', $q$insert into storage.objects(bucket_id, name, owner) values ('perfiles', '00000000-0000-0000-0000-0000000000ee/foto.jpg', auth.uid())$q$);
select t.anonimo();
select t.debe_fallar('sin sesión no se ve nada', $q$select * from storage.objects$q$);
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.filas('la administración ve las fotos', $q$select * from storage.objects where bucket_id = 'perfiles'$q$, 1);
select t.afecta('y puede borrar una', $q$delete from storage.objects where name like '%bb/%'$q$, 1);

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
