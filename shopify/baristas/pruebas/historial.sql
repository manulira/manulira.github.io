-- Pruebas del historial de turnos anteriores al portal y de su efecto en el ranking. Correr DESPUÉS de
-- shim-supabase.sql y esquema.sql, en una base vacía de pruebas. Los nombres y fechas son inventados.
-- Termina imprimiendo cuántas pasaron y cuáles fallaron.

begin;
\ir arnes.sql

create function t.crear(p_usuario text, p_nombre text) returns void language plpgsql as $$
begin perform public.crear_acceso(p_usuario, p_nombre); end $$;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000bb', 'beto@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000cc', 'carla@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000dd', 'dani@ejemplo.test');
insert into public.admins(email) values ('admin@ejemplo.test');
insert into public.accesos(id, usuario, nombre) values
  ('00000000-0000-0000-0000-0000000000aa', 'ana.prueba',  'Ana Prueba'),
  ('00000000-0000-0000-0000-0000000000bb', 'beto.prueba', 'Beto Peña'),
  ('00000000-0000-0000-0000-0000000000cc', 'carla.prueba', 'Carla Prueba'),
  ('00000000-0000-0000-0000-0000000000dd', 'dani.prueba', 'Dani Prueba');
-- Ana y Beto completaron su perfil; Carla y Dani todavía no.
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos) values
  ('00000000-0000-0000-0000-0000000000aa', 'Ana Prueba', '11.111.111-1', 'ana@ejemplo.test',  '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true),
  ('00000000-0000-0000-0000-0000000000bb', 'Beto Peña',  '12.345.678-5', 'beto@ejemplo.test', '+56911110002', 'Macul', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true);

-- ---------------------------------------------------------------------------
-- Cómo se comparan los nombres
-- ---------------------------------------------------------------------------
select t.valor('sin tildes, sin mayúsculas, sin espacios de más y la ñ como n', $q$select public.nombre_clave('  Tomás   PEÑA ')$q$, 'tomas pena');
select t.valor('un nombre vacío da vacío', $q$select public.nombre_clave(null)$q$, '');

-- ---------------------------------------------------------------------------
-- Carga (como lo hace quien corre el SQL en el editor de Supabase)
-- ---------------------------------------------------------------------------
select t.root();
select t.debe_funcionar('se carga el historial', $q$
  insert into public.historial_turnos (nombre, fecha, evento, horas) values
    ('Ana Prueba',    '2026-01-17', 'Evento Uno',  11),
    ('Ana Prueba',    '2026-03-07', 'Evento Dos',  6),
    ('Ana Prueba',    '2026-03-21', 'Evento Tres', 8.5),
    ('Beto Pena',     '2026-03-07', 'Evento Dos',  6),
    ('Beto Pena',     '2026-05-02', 'Evento Cuatro', 5.5),
    ('Tomás Herrera', '2026-03-21', 'Evento Tres', 8.5),
    ('Tomás Herrera', '2026-04-02', 'Evento Cinco', 3.83),
    ('Tomás Herrera', '2026-09-10', 'Evento Seis', 3),
    ('Jorge Hidalgo', '2026-09-10', 'Evento Seis', 4),
    ('Carla Prueba',  '2026-06-13', 'Evento Siete', 7),
    ('Dani Prueba',   '2026-06-13', 'Evento Siete', 7),
    ('Elio Aravena', '2026-08-06', 'Evento Ocho', 3),
    ('Elio Aravena', '2026-08-13', 'Evento Ocho', 3)$q$);
select t.valor('quedan 13 turnos', $q$select count(*)::text from public.historial_turnos$q$, '13');
select t.valor('ninguno vinculado todavía', $q$select count(*)::text from public.historial_turnos where acceso_id is not null$q$, '0');

select t.debe_fallar('el mismo turno no se repite', $q$insert into public.historial_turnos (nombre, fecha, evento) values ('Ana Prueba', '2026-01-17', 'Evento Uno')$q$);
select t.debe_fallar('ni con otras mayúsculas, tildes o espacios', $q$insert into public.historial_turnos (nombre, fecha, evento) values ('  ANA  prúeba', '2026-01-17', 'evento  uno')$q$);
select t.debe_funcionar('con «on conflict do nothing» cargar de nuevo no repite nada', $q$
  insert into public.historial_turnos (nombre, fecha, evento, horas) values ('Ana Prueba', '2026-01-17', 'Evento Uno', 11) on conflict do nothing$q$);
select t.valor('y sigue habiendo 13', $q$select count(*)::text from public.historial_turnos$q$, '13');
select t.debe_funcionar('la misma persona puede tener otro evento el mismo día', $q$
  insert into public.historial_turnos (nombre, fecha, evento, horas) values ('Ana Prueba', '2026-01-17', 'Otro evento', 2)$q$);
select t.debe_funcionar('y lo borro para seguir con las cuentas', $q$delete from public.historial_turnos where evento = 'Otro evento'$q$);
select t.debe_fallar('más de 24 horas no sirve', $q$insert into public.historial_turnos (nombre, fecha, evento, horas) values ('Ana Prueba', '2026-02-01', 'X', 25)$q$);
select t.debe_fallar('horas negativas tampoco', $q$insert into public.historial_turnos (nombre, fecha, evento, horas) values ('Ana Prueba', '2026-02-01', 'Y', -1)$q$);
select t.debe_fallar('ni un nombre de una letra', $q$insert into public.historial_turnos (nombre, fecha) values ('A', '2026-02-01')$q$);
select t.debe_fallar('ni sin fecha', $q$insert into public.historial_turnos (nombre) values ('Ana Prueba')$q$);

-- ---------------------------------------------------------------------------
-- Vinculación automática por nombre
-- ---------------------------------------------------------------------------
select t.valor('une por nombre: Ana (3), Carla (1) y Dani (1); Beto Peña calza con «Beto Pena»', $q$select public.vincular_historial_automatico()::text$q$, '7');
select t.valor('Ana queda con sus 3 turnos', $q$select count(*)::text from public.historial_turnos where acceso_id = '00000000-0000-0000-0000-0000000000aa'$q$, '3');
select t.valor('Beto, con 2, aunque el acceso diga «Peña» y el historial «Pena»', $q$select count(*)::text from public.historial_turnos where acceso_id = '00000000-0000-0000-0000-0000000000bb'$q$, '2');
select t.valor('Tomás, Jorge y Elio siguen sin vincular (no hay acceso con su nombre)', $q$select count(*)::text from public.historial_turnos where acceso_id is null$q$, '6');
select t.valor('si se repite, no cambia nada', $q$select public.vincular_historial_automatico()::text$q$, '0');

-- Dos accesos con el mismo nombre: no se adivina
select t.root();
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000e1', 'e1@ejemplo.test'), ('00000000-0000-0000-0000-0000000000e2', 'e2@ejemplo.test');
insert into public.accesos(id, usuario, nombre) values
  ('00000000-0000-0000-0000-0000000000e1', 'elio.uno', 'Elio Aravena'),
  ('00000000-0000-0000-0000-0000000000e2', 'elio.dos', 'ELIO ARAVENA');
select t.valor('con dos accesos iguales no se une a ninguno', $q$select public.vincular_historial_automatico()::text$q$, '0');
select t.valor('Elio sigue sin vincular', $q$select count(*)::text from public.historial_turnos where nombre = 'Elio Aravena' and acceso_id is null$q$, '2');
select t.debe_funcionar('se borra uno de los dos accesos', $q$delete from auth.users where id = '00000000-0000-0000-0000-0000000000e2'$q$);
select t.valor('y ahora sí se une al que queda', $q$select public.vincular_historial_automatico()::text$q$, '2');

-- Nombre completo en el acceso, nombre y primer apellido en el historial
select t.root();
insert into public.historial_turnos (nombre, fecha, evento, horas) values
  ('Pedro Gomez', '2026-02-03', 'Evento Nueve', 4), ('Pedro Gomez', '2026-02-10', 'Evento Diez', 4),
  ('Luis Rojas',  '2026-02-03', 'Evento Nueve', 4),
  ('Sol',         '2026-02-03', 'Evento Nueve', 4),
  ('Mia Cruz',    '2026-02-03', 'Evento Nueve', 4);
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@ejemplo.test'), ('00000000-0000-0000-0000-0000000000f2', 'f2@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@ejemplo.test'), ('00000000-0000-0000-0000-0000000000f4', 'f4@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'f5@ejemplo.test');
insert into public.accesos(id, usuario, nombre) values
  ('00000000-0000-0000-0000-0000000000f1', 'pedro.g',  'Pedro Gómez Araya'),
  ('00000000-0000-0000-0000-0000000000f2', 'luis.uno', 'Luis Rojas Uno'),
  ('00000000-0000-0000-0000-0000000000f3', 'luis.dos', 'Luis Rojas Dos'),
  ('00000000-0000-0000-0000-0000000000f4', 'sol.p',    'Sol Pérez'),
  ('00000000-0000-0000-0000-0000000000f5', 'mia.c',    'Mia Cruz');
select t.valor('une solo lo que tiene un candidato claro: Pedro (2, apellido de más) y Mia (1, nombre exacto)', $q$select public.vincular_historial_automatico()::text$q$, '3');
select t.valor('«Pedro Gomez» queda con el acceso «Pedro Gómez Araya»', $q$select count(*)::text from public.historial_turnos where nombre = 'Pedro Gomez' and acceso_id = '00000000-0000-0000-0000-0000000000f1'$q$, '2');
select t.valor('«Luis Rojas» queda sin unir: hay dos Luis Rojas y no se adivina', $q$select count(*)::text from public.historial_turnos where nombre = 'Luis Rojas' and acceso_id is null$q$, '1');
select t.valor('una sola palabra («Sol») no se une por el principio del nombre', $q$select count(*)::text from public.historial_turnos where nombre = 'Sol' and acceso_id is null$q$, '1');
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000f7', 'f7@ejemplo.test');
insert into public.accesos(id, usuario, nombre) values ('00000000-0000-0000-0000-0000000000f7', 'mia.cl', 'Mia Cruz Lagos');
insert into public.historial_turnos (nombre, fecha, evento, horas) values ('Mia Cruz', '2026-02-10', 'Evento Diez', 4);
select t.valor('si hay un acceso con el nombre exacto y otro más largo, gana el exacto', $q$select public.vincular_historial_automatico()::text$q$, '1');
select t.valor('y fue al exacto', $q$select count(*)::text from public.historial_turnos where nombre = 'Mia Cruz' and acceso_id = '00000000-0000-0000-0000-0000000000f5'$q$, '2');
-- se deja todo como estaba para las cuentas siguientes
delete from public.historial_turnos where evento in ('Evento Nueve', 'Evento Diez');
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000000f%';

-- ---------------------------------------------------------------------------
-- Quién puede qué
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.filas('Ana no ve la tabla del historial', 'select * from public.historial_turnos', 0);
select t.debe_fallar('Ana no carga turnos', $q$insert into public.historial_turnos (nombre, fecha, evento) values ('Ana Prueba', '2026-02-02', 'Falso')$q$);
select t.afecta('ni cambia los suyos', $q$update public.historial_turnos set nombre = 'Ana Prueba' where acceso_id = auth.uid()$q$, 0);
select t.afecta('ni los borra', $q$delete from public.historial_turnos where acceso_id = auth.uid()$q$, 0);
select t.debe_fallar('Ana no vincula historial', $q$select public.vincular_historial('Tomás Herrera', auth.uid())$q$);
select t.debe_fallar('ni lo vincula en automático', $q$select public.vincular_historial_automatico()$q$);
select t.valor('Ana, por su resumen, ve solo lo suyo: 3 turnos', $q$select string_agg(nombre || ' ' || turnos, ' | ') from public.historial_resumen()$q$, 'Ana Prueba 3');
select t.valor('con las fechas del primero y el último', $q$select desde::text || ' ' || hasta::text from public.historial_resumen()$q$, '2026-01-17 2026-03-21');
select t.como('00000000-0000-0000-0000-0000000000cc', 'carla@ejemplo.test');
select t.filas('Carla, sin perfil, no ve ni su resumen', 'select * from public.historial_resumen()', 0);
select t.anonimo();
select t.debe_fallar('sin sesión no se ve el resumen', $q$select * from public.historial_resumen()$q$);
select t.debe_fallar('ni se vincula', $q$select public.vincular_historial('Ana Prueba', null)$q$);
select t.debe_fallar('ni se ve la tabla', $q$select * from public.historial_turnos$q$);

select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.filas('la administración ve todos los turnos', 'select * from public.historial_turnos', 13);
select t.valor('y el resumen incluye a los sin vincular', $q$select string_agg(nombre || ' ' || turnos || ' ' || (acceso_id is null)::text, ' | ' order by nombre) from public.historial_resumen()$q$,
  'Ana Prueba 3 false | Beto Pena 2 false | Carla Prueba 1 false | Dani Prueba 1 false | Elio Aravena 2 false | Jorge Hidalgo 1 true | Tomás Herrera 3 true');

-- ---------------------------------------------------------------------------
-- Vinculación a mano
-- ---------------------------------------------------------------------------
select t.valor('la administración une a Tomás (con otra escritura del nombre) al acceso de Dani', $q$select public.vincular_historial('tomas HERRERA', '00000000-0000-0000-0000-0000000000dd')::text$q$, '3');
select t.valor('Dani queda con 1 + 3', $q$select count(*)::text from public.historial_turnos where acceso_id = '00000000-0000-0000-0000-0000000000dd'$q$, '4');
select t.valor('la administración suelta ese nombre', $q$select public.vincular_historial('Tomás Herrera', null)::text$q$, '3');
select t.valor('y vuelve a ser de nadie', $q$select count(*)::text from public.historial_turnos where nombre = 'Tomás Herrera' and acceso_id is null$q$, '3');
select t.debe_fallar('no se une a un acceso que no existe', $q$select public.vincular_historial('Tomás Herrera', '00000000-0000-0000-0000-0000000000ff')$q$);
select t.debe_funcionar('la administración corrige un turno', $q$update public.historial_turnos set horas = 4 where nombre = 'Tomás Herrera' and fecha = '2026-04-02'$q$);

-- ---------------------------------------------------------------------------
-- El ranking suma el historial
-- ---------------------------------------------------------------------------
select t.root();
update public.baristas set turnos_previos = 2 where id = '00000000-0000-0000-0000-0000000000bb';
insert into public.eventos (id, nombre, fecha, hora_inicio, hora_fin, comuna, baristas_necesarios, estado) values
  ('e1000000-0000-0000-0000-0000000000a1', 'Del portal 1', t.hoy() - 10, '18:00', '22:00', 'Santiago', 2, 'abierto'),
  ('e1000000-0000-0000-0000-0000000000a2', 'Del portal 2', t.hoy() - 5,  '18:00', '22:00', 'Santiago', 2, 'abierto');
insert into public.postulaciones(evento_id, barista_id, estado, asistio) values
  ('e1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000aa', 'confirmada', true),
  ('e1000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000bb', 'confirmada', null);
select t.como('00000000-0000-0000-0000-0000000000bb', 'beto@ejemplo.test');
select t.valor('acumulado: Ana 3 del historial + 2 del portal; Beto 2 del historial + 2 previos (el «sin marcar» no suma); quien viene del historial figura aunque no haya completado su perfil',
  $q$select string_agg(puesto || ' ' || nombre || ' ' || turnos, ' | ' order by puesto, nombre) from public.ranking_equipo()$q$,
  '1 Ana Prueba 5 | 2 Beto Peña 4 | 3 Elio Aravena 2 | 4 Carla Prueba 1 | 4 Dani Prueba 1');
select t.valor('los empates comparten puesto', $q$select count(distinct puesto)::text from public.ranking_equipo()$q$, '4');
select t.valor('marzo: solo cuentan los turnos de marzo (sin los previos), y quien no tiene nada ese mes no aparece sin perfil',
  $q$select string_agg(nombre || ' ' || turnos, ' | ' order by nombre) from public.ranking_equipo('2026-03-01', '2026-03-31')$q$, 'Ana Prueba 2 | Beto Peña 1');
select t.valor('junio: Carla y Dani; Ana y Beto salen con 0 porque sí tienen perfil',
  $q$select string_agg(nombre || ' ' || turnos, ' | ' order by nombre) from public.ranking_equipo('2026-06-01', '2026-06-30')$q$, 'Ana Prueba 0 | Beto Peña 0 | Carla Prueba 1 | Dani Prueba 1');
select t.valor('un período solo con fecha de inicio llega hasta hoy', $q$select turnos::text from public.ranking_equipo('2026-05-01', null) where nombre = 'Beto Peña'$q$, '1');
select t.valor('el historial sin vincular (Tomás, Jorge) no aparece', $q$select count(*)::text from public.ranking_equipo() where nombre in ('Tomás Herrera', 'Jorge Hidalgo')$q$, '0');
select t.valor('Beto ve en su resumen solo lo suyo', $q$select string_agg(nombre || ' ' || turnos, ' | ') from public.historial_resumen()$q$, 'Beto Pena 2');

-- ---------------------------------------------------------------------------
-- Crear un acceso con el nombre del historial lo une solo
-- ---------------------------------------------------------------------------
select t.como('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.test');
select t.debe_funcionar('la administración crea el acceso de «Tomás Herrera» tal como está en el historial', $q$select t.crear('tomas.herrera', 'Tomás Herrera')$q$);
select t.valor('sus 3 turnos quedan unidos solos', $q$select count(*)::text from public.historial_turnos h join public.accesos a on a.id = h.acceso_id where a.usuario = 'tomas.herrera'$q$, '3');
select t.valor('y ya figura en el ranking, antes de entrar', $q$select turnos::text from public.ranking_equipo() where nombre = 'Tomás Herrera'$q$, '3');
select t.valor('Jorge, con otro nombre, sigue sin acceso', $q$select count(*)::text from public.historial_turnos where nombre = 'Jorge Hidalgo' and acceso_id is null$q$, '1');
select t.debe_funcionar('se crea un acceso sin historial ni perfil', $q$select t.crear('zoe.nueva', 'Zoe Nueva')$q$);
select t.valor('ese no figura en el ranking (0 turnos y sin perfil)', $q$select count(*)::text from public.ranking_equipo() where nombre = 'Zoe Nueva'$q$, '0');

-- Desactivar, y eliminar
select t.debe_funcionar('se desactiva a Elio', $q$select public.cambiar_estado_acceso((select id from public.accesos where usuario = 'elio.uno'), false)$q$);
select t.valor('un acceso desactivado sale del ranking aunque tenga historial', $q$select count(*)::text from public.ranking_equipo() where nombre = 'Elio Aravena'$q$, '0');
select t.valor('pero su historial se conserva', $q$select count(*)::text from public.historial_turnos where nombre = 'Elio Aravena'$q$, '2');
select t.debe_funcionar('se elimina el acceso de Tomás', $q$select public.eliminar_acceso((select id from public.accesos where usuario = 'tomas.herrera'))$q$);
select t.valor('su historial no se borra: queda sin vincular', $q$select count(*)::text from public.historial_turnos where nombre = 'Tomás Herrera' and acceso_id is null$q$, '3');
select t.valor('y ya no figura en el ranking', $q$select count(*)::text from public.ranking_equipo() where nombre = 'Tomás Herrera'$q$, '0');
select t.valor('en total siguen los 13 turnos', $q$select count(*)::text from public.historial_turnos$q$, '13');

-- Una persona desactivada no ve su resumen
select t.root();
update public.accesos set activo = false where id = '00000000-0000-0000-0000-0000000000aa';
select t.como('00000000-0000-0000-0000-0000000000aa', 'ana@ejemplo.test');
select t.filas('Ana desactivada no ve su resumen', 'select * from public.historial_resumen()', 0);
select t.filas('ni el ranking', 'select * from public.ranking_equipo()', 0);

select t.root();
select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
