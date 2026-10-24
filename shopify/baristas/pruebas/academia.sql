-- Pruebas de la Academia (Jorge, 24 oct). Correr DESPUÉS de shim-supabase.sql, esquema.sql, equipo.sql y academia-contenido.sql.

begin;
\ir arnes.sql

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl'),
  ('00000000-0000-0000-0000-0000000000c1', 'sin.perfil@equipo.sepiacoffee.cl');
insert into public.accesos(id, usuario, nombre, debe_cambiar_clave, admin) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin.prueba', 'Admin Prueba', false, true),
  ('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba', 'Nueva Prueba', false, false),
  ('00000000-0000-0000-0000-0000000000c1', 'sin.perfil', 'Sin Perfil', false, false);
insert into public.baristas(id, nombre, rut, correo, telefono, comuna, banco, tipo_cuenta, numero_cuenta, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad, acepta_avisos, tiene_camioneta) values
  ('00000000-0000-0000-0000-0000000000ad', 'Admin Prueba', '11.111.111-1', 'admin@ejemplo.test', '+56911110001', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110001', true, true, 'x', true, true, false),
  ('00000000-0000-0000-0000-0000000000a1', 'Nueva Prueba', '22.222.222-2', 'nueva@ejemplo.test', '+56911110002', 'Ñuñoa', 'BCI', 'Cuenta vista', '11110002', true, true, 'x', true, true, false);
create function t.yo_admin() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000ad', 'admin.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.yo_nueva() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000a1', 'nueva.prueba@equipo.sepiacoffee.cl', 'password') $$;
create function t.yo_sin_perfil() returns void language sql as $$ select t.como('00000000-0000-0000-0000-0000000000c1', 'sin.perfil@equipo.sepiacoffee.cl', 'password') $$;

-- Contenido inicial
select t.valor('trae 2 tragos, 4 botellas y 3 videos', $q$select string_agg(tipo || ':' || n, ' ' order by tipo) from (select tipo, count(*) n from public.academia group by tipo) x$q$, 'botella:4 trago:2 video:3');
select t.valor('Espresso Martini con las medidas de Sepia', $q$select ingredientes::text from public.academia where titulo = 'Espresso Martini'$q$, '["1 jigger de Kahlúa", "1 jigger de vodka", "1 jigger de café espresso recién hecho"]');
select t.valor('Carajillo con las medidas de Sepia', $q$select ingredientes::text from public.academia where titulo = 'Carajillo'$q$, '["1 jigger de Licor 43", "1 jigger de café espresso recién hecho"]');
\ir ../academia-contenido.sql
select t.valor('correr el contenido de nuevo no lo duplica', $q$select count(*)::text from public.academia$q$, '9');

-- Quién la ve
select t.yo_nueva();
select t.valor('un barista activo ve la Academia', $q$select jsonb_array_length(public.eq_academia()->'posts')::text$q$, '9');
select t.valor('pero no la puede editar', $q$select (public.eq_academia()->>'canEdit')$q$, 'false');
select t.debe_fallar('no puede leer la tabla directo', 'select * from public.academia');
select t.debe_fallar('ni crear contenido', $q$select public.eq_academia_guardar('{"type":"trago","title":"Mi trago"}')$q$);
select t.debe_fallar('ni borrar', $q$select public.eq_academia_borrar((select id from public.academia limit 1))$q$);
select t.root();
select t.valor('los intentos del barista no cambiaron nada', $q$select count(*)::text from public.academia$q$, '9');
select t.yo_sin_perfil();
select t.debe_fallar('quien no completa su perfil no la ve', $q$select public.eq_academia()$q$);
select t.anonimo();
select t.debe_fallar('sin sesión, tampoco', $q$select public.eq_academia()$q$);

-- La administración edita
select t.yo_admin();
select t.valor('la administración puede editar', $q$select (public.eq_academia()->>'canEdit')$q$, 'true');
select t.debe_funcionar('crea un trago nuevo', $q$select public.eq_academia_guardar('{"id":"aaaaaaaa-0000-0000-0000-000000000001","type":"trago","title":"  Café helado  ","summary":"Fresco","ingredients":["1 jigger de café","", "hielo"],"steps":["Llena el vaso con hielo"],"photos":["aaaaaaaa-0000-0000-0000-000000000001/foto-1.jpg"],"order":5}')$q$);
select t.root();
select t.valor('queda limpio (sin espacios ni líneas vacías)', $q$select titulo || '|' || ingredientes::text || '|' || fotos::text from public.academia where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 'Café helado|["1 jigger de café", "hielo"]|["aaaaaaaa-0000-0000-0000-000000000001/foto-1.jpg"]');
select t.yo_admin();
select t.debe_funcionar('lo edita', $q$select public.eq_academia_guardar('{"id":"aaaaaaaa-0000-0000-0000-000000000001","type":"trago","title":"Café helado Sepia","published":false,"photos":["aaaaaaaa-0000-0000-0000-000000000001/foto-1.jpg"]}')$q$);
select t.root();
select t.valor('queda cambiado y oculto', $q$select titulo || ' ' || publicado from public.academia where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 'Café helado Sepia false');
select t.yo_admin();
select t.debe_fallar('un video sin enlace no se guarda', $q$select public.eq_academia_guardar('{"type":"video","title":"Video"}')$q$);
select t.debe_fallar('ni con un enlace que no es de YouTube', $q$select public.eq_academia_guardar('{"type":"video","title":"Video","video":"https://ejemplo.test/x"}')$q$);
select t.debe_funcionar('con un enlace de YouTube sí', $q$select public.eq_academia_guardar('{"type":"video","title":"Video","video":"https://youtu.be/abcdefgh"}')$q$);
select t.debe_fallar('una foto de otra carpeta no se acepta', $q$select public.eq_academia_guardar('{"id":"aaaaaaaa-0000-0000-0000-000000000001","type":"trago","title":"X","photos":["otra/foto.jpg"]}')$q$);
select t.debe_fallar('ni un tipo que no existe', $q$select public.eq_academia_guardar('{"type":"receta","title":"X"}')$q$);
select t.yo_nueva();
select t.valor('el barista no ve lo oculto', $q$select count(*)::text from jsonb_array_elements(public.eq_academia()->'posts') p where p->>'title' = 'Café helado Sepia'$q$, '0');
select t.yo_admin();
select t.valor('la administración sí', $q$select count(*)::text from jsonb_array_elements(public.eq_academia()->'posts') p where p->>'title' = 'Café helado Sepia'$q$, '1');
select t.valor('al borrar devuelve las fotos para limpiarlas', $q$select (public.eq_academia_borrar('aaaaaaaa-0000-0000-0000-000000000001')->'photos')::text$q$, '["aaaaaaaa-0000-0000-0000-000000000001/foto-1.jpg"]');
select t.root();
select t.valor('y ya no está', $q$select count(*)::text from public.academia where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, '0');

-- Fotos en el almacenamiento: solo la administración sube
select t.yo_nueva();
select t.debe_fallar('un barista no sube fotos a la Academia', $q$insert into storage.objects (bucket_id, name) values ('academia', 'x/foto.jpg')$q$);
select t.yo_admin();
select t.debe_funcionar('la administración sí', $q$insert into storage.objects (bucket_id, name) values ('academia', 'x/foto.jpg')$q$);
select t.yo_nueva();
select t.valor('y el equipo la puede ver', $q$select count(*)::text from storage.objects where bucket_id = 'academia'$q$, '1');
select t.root();

select 'PASARON ' || count(*) filter (where ok) || ' de ' || count(*) as resumen from t.resultados;
select n, nombre, detalle from t.resultados where not ok order by n;

rollback;
