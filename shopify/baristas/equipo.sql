-- ============================================================================
-- SEPIA EQUIPO · la interfaz «Sepia Equipo» (la app de Jorge) conectada a esta base
-- ============================================================================
-- Correr DESPUÉS de esquema.sql. Se puede repetir sin riesgo.
--
-- La interfaz (assets/sepia-equipo/*) le pide todo a un «servidor». Acá ese servidor son funciones de
-- la base (eq_*): reciben a la persona que inició sesión (auth.uid()) y devuelven los datos ya en la forma
-- que la interfaz espera. Todas las reglas (quién ve qué, cupos, camioneta, plazos) se aplican acá,
-- no en el navegador: el navegador solo es una pantalla.
--
--   eq_estado()            el «paquete» con el perfil, los eventos y las postulaciones de quien consulta
--   eq_accion(accion, ..)  las acciones: perfil, postular, cancelar, guardar evento, asignar, etc.
--   eq_ranking()           ranking del equipo (historial + turnos con asistencia)
--   eq_equipo_evento(..)   quiénes van a un evento
--   eq_avisos(), eq_avisos_leer(..)   avisos dentro de la app (recordatorio del día anterior, 18:00)
--
-- Reglas del equipo (las de la app de Jorge):
--   · Se postula con confirmación inmediata, por orden de llegada, eligiendo «con camioneta» o «sin camioneta».
--   · Cada evento reserva a lo más un cupo con camioneta (y solo lo toma quien declaró tenerla).
--   · Se puede cancelar hasta 24 horas antes del inicio.
--   · La administración asigna a mano, confirma y saca gente de un evento.
--   · Los baristas ven un evento desde config.dias_publicacion días antes (14 por defecto).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------------
-- El perfil de la app no pide comuna.
alter table public.baristas alter column comuna drop not null;
alter table public.baristas add column if not exists acepta_whatsapp boolean not null default false;

alter table public.eventos add column if not exists servicio text check (servicio is null or char_length(servicio) <= 120);
alter table public.eventos add column if not exists uniforme text check (uniforme is null or char_length(uniforme) <= 200);
alter table public.eventos add column if not exists tiene_maquina boolean;          -- null: por confirmar
-- Cómo se calcula el pago: monto fijo (pago_manual) u horas «de oficina a oficina» (salida/regreso).
alter table public.eventos add column if not exists modo_pago text not null default 'fijo' check (modo_pago in ('fijo', 'horas'));
alter table public.eventos add column if not exists salida_oficina timestamptz;
alter table public.eventos add column if not exists regreso_oficina timestamptz;

alter table public.evento_traslado add column if not exists nota text check (nota is null or char_length(nota) <= 300);
alter table public.evento_traslado add column if not exists ida_vuelta boolean not null default true;

-- Avisos dentro de la app. «clave» evita repetir el mismo aviso (por ejemplo recordatorio:<evento>).
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  barista_id uuid not null references public.baristas (id) on delete cascade,
  evento_id uuid references public.eventos (id) on delete cascade,
  clave text not null,
  titulo text not null,
  cuerpo text not null,
  creado_en timestamptz not null default now(),
  leido_en timestamptz,
  unique (barista_id, clave)
);
alter table public.avisos enable row level security;
revoke all on public.avisos from anon, authenticated;     -- solo por las funciones eq_*

-- ---------------------------------------------------------------------------
-- 2. Ayudas
-- ---------------------------------------------------------------------------
create or replace function public.eq_hhmm(t time) returns text
language sql immutable set search_path = '' as $$ select to_char(t, 'HH24:MI') $$;

-- 12.345.678-5 (con puntos y guion, dígito verificador en mayúscula)
create or replace function public.eq_formato_rut(r text) returns text
language plpgsql immutable set search_path = '' as $$
declare limpio text := upper(regexp_replace(coalesce(r, ''), '[^0-9kK]', '', 'g'));
        cuerpo text; dv text; con_puntos text := '';
begin
  if char_length(limpio) < 2 then return r; end if;
  cuerpo := left(limpio, -1); dv := right(limpio, 1);
  while char_length(cuerpo) > 3 loop
    con_puntos := '.' || right(cuerpo, 3) || con_puntos; cuerpo := left(cuerpo, -3);
  end loop;
  return cuerpo || con_puntos || '-' || dv;
end $$;

-- Hora de Chile en que empieza un evento.
create or replace function public.eq_inicio(f date, h time) returns timestamptz
language sql immutable set search_path = '' as $$ select ((f + h)::timestamp at time zone 'America/Santiago') $$;

-- Estado de una postulación en el lenguaje de la interfaz.
create or replace function public.eq_estado_post(est text, asistio boolean) returns text
language sql immutable set search_path = '' as $$
  select case est
    when 'postulada' then 'pending'
    when 'confirmada' then case when asistio is true then 'completed' when asistio is false then 'absent' else 'approved' end
    when 'rechazada' then 'rejected'
    else 'cancelled' end
$$;

-- Cupos de un evento: capacidad, asignados, con camioneta y sin camioneta.
create or replace function public.eq_cupos(p_evento uuid)
returns table (capacidad int, asignados int, pickup int, otros int)
language sql stable security definer set search_path = '' as $$
  select e.baristas_necesarios,
         count(p.id)::int,
         (count(p.id) filter (where p.conductor))::int,
         (count(p.id) filter (where not p.conductor))::int
  from public.eventos e
  left join public.postulaciones p on p.evento_id = e.id and p.estado = 'confirmada'
  where e.id = p_evento
  group by e.baristas_necesarios
$$;

-- ---------------------------------------------------------------------------
-- 3. Perfil
-- ---------------------------------------------------------------------------
create or replace function public.eq_perfil_json(b public.baristas) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'fullName', b.nombre, 'email', b.correo, 'phone', b.telefono, 'rut', b.rut,
    'shirt', coalesce(b.talla_camisa, ''), 'bank', b.banco,
    'accountType', case b.tipo_cuenta when 'Cuenta RUT' then 'CuentaRUT' else b.tipo_cuenta end,
    'accountNumber', b.numero_cuenta, 'whatsapp', b.acepta_whatsapp, 'driver', false,
    'hasPickup', b.tiene_camioneta, 'vehicleType', case when b.tiene_camioneta then 'pickup' else 'none' end,
    'vehicleDeclared', true)
$$;

-- ---------------------------------------------------------------------------
-- 4. Un evento en el formato de la interfaz
-- ---------------------------------------------------------------------------
-- p_adm: ve todo (cliente, traslado, revisión del calendario). Los baristas ven la dirección solo si están
-- confirmados en ese evento; el cliente y los montos del traslado, nunca.
create or replace function public.eq_evento_json(p_evento uuid, p_adm boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.eventos;
  pago int;
  pr public.evento_privado;
  d public.evento_direcciones;
  t public.evento_traslado;
  sg public.evento_seguimiento;
  cfg public.config;
  cu record;
  confirmado boolean;
  ver_dir boolean;
  notas text;
  comp jsonb;
  transp jsonb;
  fuel int;
  minutos numeric;
  conductor uuid;
begin
  select * into v from public.eventos where id = p_evento;
  if v.id is null then return null; end if;
  select w.pago_liquido into pago from public.eventos_vista w where w.id = p_evento;     -- monto según las reglas (o el fijo)
  select * into pr from public.evento_privado where evento_id = p_evento;
  select * into d from public.evento_direcciones where evento_id = p_evento;
  select * into t from public.evento_traslado where evento_id = p_evento;
  select * into sg from public.evento_seguimiento where evento_id = p_evento;
  select * into cfg from public.config where id = 1;
  select * into cu from public.eq_cupos(p_evento);
  confirmado := exists (select 1 from public.postulaciones p
                        where p.evento_id = p_evento and p.barista_id = auth.uid() and p.estado = 'confirmada');
  ver_dir := p_adm or confirmado;
  notas := coalesce(v.descripcion, '');
  -- Las indicaciones se le agregan al equipo; la administración ve y edita solo la descripción (si no, al guardar se duplicarían).
  if ver_dir and not p_adm and d.indicaciones is not null and btrim(d.indicaciones) <> '' then
    notas := btrim(notas || E'\n' || 'Indicaciones: ' || d.indicaciones);
  end if;

  minutos := case when v.modo_pago = 'horas' and v.salida_oficina is not null and v.regreso_oficina is not null
                  then round(extract(epoch from (v.regreso_oficina - v.salida_oficina)) / 60) end;
  comp := case when v.modo_pago = 'horas'
    then jsonb_build_object('mode', 'hourly', 'start', v.salida_oficina, 'end', v.regreso_oficina, 'minutes', minutos,
                            'rate', cfg.tarifa_hora, 'pay', pago, 'basis', 'net')
    else jsonb_build_object('mode', 'fixed', 'pay', pago, 'basis', 'net') end;

  fuel := case when t.km is null then null else round(t.km / cfg.rendimiento_km_l * cfg.precio_litro)::int end;
  select p.barista_id into conductor from public.postulaciones p
   where p.evento_id = p_evento and p.conductor and p.estado = 'confirmada';
  transp := case when p_adm then jsonb_build_object(
      'enabled', true, 'routeMode', 'manual', 'roundTrip', coalesce(t.ida_vuelta, true),
      'km', t.km, 'manualKm', t.km, 'toll', t.tag, 'manualToll', t.tag, 'manualNote', coalesce(t.nota, ''),
      'fuel', fuel, 'price', cfg.precio_litro, 'efficiency', cfg.rendimiento_km_l, 'driverMemberId', conductor)
    else jsonb_build_object('enabled', true) end;

  return jsonb_build_object(
    'id', v.id, 'title', v.nombre, 'date', v.fecha,
    'start', public.eq_hhmm(v.hora_inicio), 'end', public.eq_hhmm(v.hora_fin),
    'next_day', (v.hora_fin <= v.hora_inicio)::int, 'nextDay', (v.hora_fin <= v.hora_inicio),
    'client', case when p_adm then coalesce(pr.cliente, '') else '' end,
    'location', concat_ws(', ', nullif(btrim(coalesce(v.lugar, '')), ''), v.comuna),
    'address', case when ver_dir then coalesce(d.direccion, '') else '' end,
    'service', coalesce(nullif(btrim(coalesce(v.servicio, '')), ''), 'Servicio de barra'),
    'slots', v.baristas_necesarios, 'capacity', v.baristas_necesarios,
    'assigned', cu.asignados, 'pickup_assigned', cu.pickup, 'other_assigned', cu.otros,
    'pay', pago, 'estimated_net_pay', pago, 'pay_basis', 'net', 'payBasis', 'net',
    'notes', notas, 'uniform', coalesce(v.uniforme, ''),
    'status', case v.estado when 'borrador' then 'draft' when 'abierto' then 'published' when 'cerrado' then 'closed' else 'cancelled' end,
    'has_machine', case v.tiene_maquina when true then 1 when false then 0 else null end,
    'compensation', comp, 'transport', transp,
    'calendarImport', case when p_adm and sg.origen = 'calendario'
      then jsonb_build_object('review',
             case when sg.revisar then to_jsonb(regexp_split_to_array(coalesce(sg.revisar_motivo, 'Revisar los datos del calendario'), '\.\s*'))
                  else '[]'::jsonb end,
             'sourceUrl', '')
      else null end
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. El «paquete» de datos de quien consulta
-- ---------------------------------------------------------------------------
create or replace function public.eq_estado(p_vista text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  adm boolean;
  ver_adm boolean;
  acc public.accesos;
  bar public.baristas;
  correo text := lower(coalesce(auth.jwt() ->> 'email', ''));
  nombre text;
  base jsonb;
  perfil_requerido boolean;
  permitido boolean;
  cambiar boolean;
  eventos jsonb;
  posts jsonb;
  miembros jsonb;
begin
  if uid is null then return jsonb_build_object('signedIn', false); end if;
  adm := public.es_admin();
  ver_adm := adm and coalesce(p_vista, '') <> 'barista';
  select * into acc from public.accesos where id = uid;
  select * into bar from public.baristas where id = uid;
  nombre := coalesce(bar.nombre, acc.nombre, initcap(replace(split_part(correo, '@', 1), '.', ' ')));
  permitido := adm or (acc.id is not null and acc.activo);
  cambiar := (not adm) and acc.id is not null and acc.debe_cambiar_clave;
  perfil_requerido := (not adm) and bar.id is null;

  base := jsonb_build_object(
    'signedIn', true, 'passwordRequired', cambiar, 'allowed', permitido, 'profileRequired', perfil_requerido,
    'admin', ver_adm, 'canAdmin', adm,
    'memberId', case when bar.id is not null then bar.id else null end,
    'user', jsonb_build_object('name', nombre,
              'email', case when adm then correo else coalesce(acc.usuario, 'cuenta') || '@sepia.invalid' end),
    'profile', case when bar.id is not null then public.eq_perfil_json(bar) else null end);
  if not permitido or cambiar then return base || jsonb_build_object('members', '[]'::jsonb, 'events', '[]'::jsonb, 'applications', '[]'::jsonb); end if;
  if perfil_requerido then return base || jsonb_build_object('members', '[]'::jsonb, 'events', '[]'::jsonb, 'applications', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(public.eq_evento_json(e.id, ver_adm) order by e.fecha, e.hora_inicio), '[]'::jsonb) into eventos
  from public.eventos e
  where (ver_adm)
     or (e.estado <> 'borrador'
         and (adm
              or exists (select 1 from public.postulaciones p where p.evento_id = e.id and p.barista_id = uid)
              or (e.estado = 'abierto' and public.dentro_de_publicacion(e.fecha))));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'event_id', p.evento_id, 'member_id', p.barista_id,
           'status', public.eq_estado_post(p.estado, p.asistio),
           'vehicle_mode', case when p.conductor then 'pickup' else 'none' end,
           'created_at', p.creado_en,
           'name', case when ver_adm then b.nombre else null end) order by p.creado_en), '[]'::jsonb) into posts
  from public.postulaciones p
  join public.baristas b on b.id = p.barista_id
  where (ver_adm or p.barista_id = uid);

  if ver_adm then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'name', coalesce(b.nombre, a.nombre),
             'status', case when not a.activo then 'disabled' when a.debe_cambiar_clave then 'invited' else 'active' end,
             'profile', case when b.id is not null then public.eq_perfil_json(b) else '{}'::jsonb end,
             'username', a.usuario) order by coalesce(b.nombre, a.nombre)), '[]'::jsonb) into miembros
    from public.accesos a left join public.baristas b on b.id = a.id;
  else
    miembros := '[]'::jsonb;
  end if;

  return base || jsonb_build_object('members', miembros, 'events', eventos, 'applications', posts);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Ranking, equipo de un evento y avisos
-- ---------------------------------------------------------------------------
create or replace function public.eq_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.es_barista() or public.es_admin()) then
    raise exception 'Inicia sesión para ver el ranking.';
  end if;
  return (
    with turnos as (
      select h.acceso_id as id, h.fecha from public.historial_turnos h where h.acceso_id is not null
      union all
      select p.barista_id, e.fecha
      from public.postulaciones p join public.eventos e on e.id = p.evento_id
      where p.estado = 'confirmada' and p.asistio is true and e.estado <> 'cancelado'
    ), por_mes as (
      select t.id, to_char(t.fecha, 'YYYY-MM') as mes, count(*) as n from turnos t group by 1, 2
    ), gente as (
      select a.id, coalesce(b.nombre, a.nombre) as nombre,
             coalesce(b.turnos_previos, 0) + (select count(*) from turnos t where t.id = a.id) as total,
             (b.id is not null) as con_perfil
      from public.accesos a left join public.baristas b on b.id = a.id
      where a.activo
    )
    select jsonb_build_object(
      'members', coalesce(jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.nombre, 'total', g.total,
          'byMonth', coalesce((select jsonb_object_agg(m.mes, m.n) from por_mes m where m.id = g.id), '{}'::jsonb)
        ) order by g.total desc, g.nombre), '[]'::jsonb),
      'definition', 'Cuenta los turnos con asistencia confirmada por administración, más el historial de turnos anteriores a la app.',
      'updatedAt', to_char(now() at time zone 'America/Santiago', 'DD-MM-YYYY'))
    from gente g where g.con_perfil or g.total > 0
  );
end $$;

-- Quiénes van a un evento. La administración ve también a quienes postularon sin confirmar.
create or replace function public.eq_equipo_evento(p_evento uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare adm boolean := public.es_admin();
begin
  if auth.uid() is null or not (adm or public.es_barista()) then raise exception 'Acceso no autorizado.'; end if;
  if not adm and not exists (select 1 from public.eventos e where e.id = p_evento and e.estado <> 'borrador') then
    raise exception 'No encontramos ese evento.';
  end if;
  return jsonb_build_object('team', coalesce((
    select jsonb_agg(jsonb_build_object(
             'member_id', p.barista_id, 'name', b.nombre,
             'status', public.eq_estado_post(p.estado, p.asistio),
             'vehicle_mode', case when p.conductor then 'pickup' else 'none' end) order by p.conductor desc, p.creado_en)
    from public.postulaciones p join public.baristas b on b.id = p.barista_id
    where p.evento_id = p_evento
      and (p.estado = 'confirmada' or (adm and p.estado in ('postulada', 'rechazada', 'retirada')))
  ), '[]'::jsonb));
end $$;

drop function if exists public.eq_avisos();
-- Avisos sin leer. El recordatorio de un turno se crea desde las 18:00 (hora de Chile) del día anterior.
create or replace function public.eq_avisos(p_ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ahora timestamp := p_ahora at time zone 'America/Santiago';
begin
  if uid is null or not public.es_barista() then raise exception 'Acceso no autorizado.'; end if;
  insert into public.avisos (barista_id, evento_id, clave, titulo, cuerpo)
  select p.barista_id, e.id, 'recordatorio:' || e.id,
         'Mañana tienes turno: ' || e.nombre,
         'Horario ' || public.eq_hhmm(e.hora_inicio) || ' – ' || public.eq_hhmm(e.hora_fin)
           || case when e.hora_fin <= e.hora_inicio then ' (+1 día)' else '' end || '. '
           || coalesce('Dirección: ' || d.direccion || '. ', '')
           || 'Uniforme: ' || coalesce(nullif(btrim(coalesce(e.uniforme, '')), ''), 'por confirmar con administración') || '.'
  from public.postulaciones p
  join public.eventos e on e.id = p.evento_id and e.estado in ('abierto', 'cerrado')
  left join public.evento_direcciones d on d.evento_id = e.id
  where p.barista_id = uid and p.estado = 'confirmada'
    and e.fecha = ahora::date + 1 and ahora::time >= time '18:00'
  on conflict (barista_id, clave) do nothing;
  return jsonb_build_object('notifications', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'event_id', a.evento_id, 'title', a.titulo, 'body', a.cuerpo,
                                         'created_at', a.creado_en) order by a.creado_en desc)
    from public.avisos a where a.barista_id = uid and a.leido_en is null), '[]'::jsonb));
end $$;

create or replace function public.eq_avisos_leer(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.avisos set leido_en = now() where id = p_id and barista_id = auth.uid() and leido_en is null;
$$;

-- ---------------------------------------------------------------------------
-- 7. Acciones
-- ---------------------------------------------------------------------------
-- Cada acción valida todo acá (la interfaz solo las pide). Devuelven {"ok": true, ...} o fallan con un
-- mensaje en español que la interfaz muestra tal cual.

-- Perfil de la persona que inició sesión (lo crea o lo actualiza).
create or replace function public.eq_perfil_guardar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  acc public.accesos;
  cfg public.config;
  nombre text := regexp_replace(btrim(coalesce(p ->> 'fullName', '')), '\s+', ' ', 'g');
  correo text := lower(btrim(coalesce(p ->> 'email', '')));
  tel text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  rut text := public.eq_formato_rut(p ->> 'rut');
  talla text := btrim(coalesce(p ->> 'shirt', ''));
  banco text := btrim(coalesce(p ->> 'bank', ''));
  tipo text := case btrim(coalesce(p ->> 'accountType', '')) when 'CuentaRUT' then 'Cuenta RUT' else btrim(coalesce(p ->> 'accountType', '')) end;
  numero text := regexp_replace(coalesce(p ->> 'accountNumber', ''), '[.\s-]', '', 'g');
  vehiculo text := coalesce(p ->> 'vehicleType', '');
  wsp boolean := coalesce(p ->> 'whatsapp', 'false') in ('true', 't', '1');
begin
  select * into acc from public.accesos where id = uid;
  if acc.id is null or not acc.activo then raise exception 'Tu cuenta no tiene acceso.'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Revisa los datos del formulario.'; end if;
  if char_length(nombre) < 5 or char_length(nombre) > 100 or nombre !~ '\s' then raise exception 'Ingresa tu nombre y apellido.'; end if;
  if correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(correo) > 254 then raise exception 'Ingresa un correo válido.'; end if;
  if tel !~ '^(56)?9[0-9]{8}$' then raise exception 'Usa un celular chileno: +56 9 1234 5678.'; end if;
  if not public.rut_valido(rut) then raise exception 'Revisa el RUT y su dígito verificador.'; end if;
  if talla not in ('XS', 'S', 'M', 'L', 'XL', 'XXL') then raise exception 'Elige tu talla.'; end if;
  if char_length(banco) < 2 or char_length(banco) > 60 then raise exception 'Selecciona tu banco.'; end if;
  if tipo not in ('Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro') then raise exception 'Selecciona el tipo de cuenta.'; end if;
  if numero !~ '^[0-9]{5,20}$' then raise exception 'Ingresa entre 5 y 20 dígitos, sin espacios.'; end if;
  if vehiculo not in ('pickup', 'none') then raise exception 'Indica si tienes camioneta.'; end if;
  select * into cfg from public.config where id = 1;
  -- Al guardar el perfil, la persona acepta (aviso en el formulario) usar sus datos para coordinar y pagar los
  -- turnos, declara que puede emitir boleta de honorarios y que la cuenta es suya.
  insert into public.baristas (id, nombre, rut, correo, telefono, banco, tipo_cuenta, numero_cuenta, talla_camisa,
                               tiene_camioneta, acepta_whatsapp, cuenta_propia, acepta_boleta, acepta_boleta_texto, acepta_privacidad)
  values (uid, nombre, rut, correo, case when left(tel, 2) = '56' then '+' || tel else '+56' || tel end, banco, tipo, numero, talla,
          vehiculo = 'pickup', wsp, true, true, cfg.texto_boleta, true)
  on conflict (id) do update set
    nombre = excluded.nombre, rut = excluded.rut, correo = excluded.correo, telefono = excluded.telefono,
    banco = excluded.banco, tipo_cuenta = excluded.tipo_cuenta, numero_cuenta = excluded.numero_cuenta,
    talla_camisa = excluded.talla_camisa, tiene_camioneta = excluded.tiene_camioneta,
    acepta_whatsapp = excluded.acepta_whatsapp, actualizado_en = now();
  return jsonb_build_object('ok', true);
exception when unique_violation then
  raise exception 'Ese RUT ya está registrado con otra cuenta. Escribe a administración.';
end $$;

-- Ocupa un cupo (postulación con confirmación inmediata, o asignación de la administración).
-- Reglas: cupos libres; a lo más un cupo con camioneta por evento y solo para quien la declaró; en un evento de
-- varios cupos, uno queda reservado para la camioneta mientras nadie lo tome.
create or replace function public.eq_ocupar_cupo(p_evento uuid, p_barista uuid, p_modo text, p_admin boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  ev public.eventos;
  bar public.baristas;
  acc public.accesos;
  cu record;
  post public.postulaciones;
  max_otros int;
  ocupados int;
begin
  if p_modo not in ('pickup', 'none') then raise exception 'Elige si vas con camioneta o sin camioneta.'; end if;
  select * into ev from public.eventos where id = p_evento for update;           -- evita que dos tomen el último cupo
  if ev.id is null then raise exception 'No encontramos ese evento.'; end if;
  select * into acc from public.accesos where id = p_barista;
  select * into bar from public.baristas where id = p_barista;
  if acc.id is null or not acc.activo then raise exception 'Esa persona no tiene acceso activo.'; end if;
  if bar.id is null then raise exception 'Esa persona todavía no completa su perfil.'; end if;
  if ev.estado = 'cancelado' then raise exception 'Este evento está cancelado.'; end if;
  if not p_admin then
    if ev.estado <> 'abierto' then raise exception 'Este evento no está abierto a postulaciones.'; end if;
    if public.eq_inicio(ev.fecha, ev.hora_inicio) <= now() then raise exception 'Este evento ya comenzó.'; end if;
    if not public.dentro_de_publicacion(ev.fecha) then raise exception 'Este evento todavía no está abierto a postulaciones.'; end if;
  end if;
  select * into post from public.postulaciones where evento_id = p_evento and barista_id = p_barista;
  if post.id is not null and post.estado in ('confirmada', 'postulada') and not (p_admin and post.estado = 'postulada') then
    raise exception 'Ya tienes un turno en este evento.';
  end if;
  select * into cu from public.eq_cupos(p_evento);
  ocupados := cu.asignados - (case when post.estado = 'confirmada' then 1 else 0 end);
  if ocupados >= cu.capacidad then raise exception 'Cupos cerrados: no quedan lugares.'; end if;
  if p_modo = 'pickup' then
    if not bar.tiene_camioneta then raise exception 'Para ir con camioneta, declara en tu perfil que tienes una.'; end if;
    if cu.pickup > 0 then raise exception 'Ya no queda cupo con camioneta en este evento.'; end if;
  else
    max_otros := case when cu.capacidad > 1 then cu.capacidad - 1 else cu.capacidad end;
    if cu.otros >= max_otros and cu.pickup = 0 then raise exception 'Ya no quedan cupos sin camioneta: el último está reservado para la camioneta.'; end if;
    if cu.otros >= cu.capacidad then raise exception 'Ya no quedan cupos sin camioneta.'; end if;
  end if;
  insert into public.postulaciones (evento_id, barista_id, estado, conductor)
  values (p_evento, p_barista, 'confirmada', p_modo = 'pickup')
  on conflict (evento_id, barista_id) do update
    set estado = 'confirmada', conductor = excluded.conductor, asistio = null, actualizado_en = now();
  -- La confirmación es inmediata: queda también como «confirmó que va» (así no se le piden reconfirmaciones por correo).
  update public.postulaciones set asistencia_confirmada_en = now()
   where evento_id = p_evento and barista_id = p_barista and estado = 'confirmada';
end $$;

-- Evento: crear o editar (administración).
create or replace function public.eq_evento_guardar(ev jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.config;
  actual public.eventos;
  id_ev uuid := nullif(ev ->> 'id', '')::uuid;
  titulo text := regexp_replace(btrim(coalesce(ev ->> 'title', '')), '\s+', ' ', 'g');
  f_ev date;
  ini time; fin time;
  cupos int;
  loc text := btrim(coalesce(ev ->> 'location', ''));
  l_ev text; c_ev text;
  est text;
  modo text := coalesce(ev #>> '{compensation,mode}', 'fixed');
  pago int; salida timestamptz; regreso timestamptz;
  maquina boolean;
  dir_ev text := btrim(coalesce(ev ->> 'address', ''));
  hoy date := (now() at time zone 'America/Santiago')::date;
  km numeric; tag int;
begin
  if not public.es_admin() then raise exception 'Solo la administración crea y edita eventos.'; end if;
  select * into cfg from public.config where id = 1;
  if char_length(titulo) < 3 or char_length(titulo) > 120 then raise exception 'Escribe el nombre del evento (3 a 120 letras).'; end if;
  begin f_ev := (ev ->> 'date')::date; exception when others then f_ev := null; end;
  if f_ev is null then raise exception 'Elige la fecha del evento.'; end if;
  begin ini := (ev ->> 'start')::time; fin := (ev ->> 'end')::time; exception when others then ini := null; end;
  if ini is null or fin is null then raise exception 'Indica la hora de inicio y de término.'; end if;
  if ini = fin then raise exception 'La hora de término tiene que ser distinta a la de inicio.'; end if;
  begin cupos := (ev ->> 'slots')::int; exception when others then cupos := null; end;
  if cupos is null or cupos < 1 or cupos > 50 then raise exception 'Los cupos van de 1 a 50.'; end if;
  est := case ev ->> 'status' when 'draft' then 'borrador' when 'published' then 'abierto' when 'closed' then 'cerrado'
                              when 'cancelled' then 'cancelado' else null end;
  if est is null then raise exception 'Elige el estado del evento.'; end if;
  if loc = '' then c_ev := 'Por confirmar';
  elsif position(',' in loc) > 0 then
    l_ev := nullif(btrim(regexp_replace(loc, ',[^,]*$', '')), ''); c_ev := btrim(substring(loc from '[^,]*$'));
  else c_ev := loc; end if;
  if char_length(coalesce(c_ev, '')) < 2 then c_ev := 'Por confirmar'; end if;
  l_ev := left(l_ev, 120); c_ev := left(c_ev, 60);
  maquina := case when ev -> 'has_machine' in ('true'::jsonb, '1'::jsonb) then true
                  when ev -> 'has_machine' in ('false'::jsonb, '0'::jsonb) then false else null end;
  if modo = 'hourly' then
    begin salida := (ev #>> '{compensation,start}')::timestamptz; regreso := (ev #>> '{compensation,end}')::timestamptz;
    exception when others then salida := null; end;
    if salida is null or regreso is null or regreso <= salida then raise exception 'Indica la salida y el regreso de la oficina (el regreso va después de la salida).'; end if;
    pago := round(extract(epoch from (regreso - salida)) / 3600.0 * cfg.tarifa_hora)::int;
  else
    begin pago := (coalesce(ev #>> '{compensation,pay}', ev ->> 'pay'))::numeric::int; exception when others then pago := null; end;
    if pago is null or pago < 0 then raise exception 'Indica el monto líquido por barista.'; end if;
  end if;
  begin km := nullif(ev #>> '{transport,manualKm}', '')::numeric; exception when others then km := null; end;
  begin tag := nullif(ev #>> '{transport,manualToll}', '')::numeric::int; exception when others then tag := null; end;
  if km is not null and (km < 0 or km > 3000) then raise exception 'Los kilómetros van de 0 a 3.000.'; end if;
  if tag is not null and (tag < 0 or tag > 1000000) then raise exception 'El TAG va de 0 a 1.000.000.'; end if;

  if id_ev is not null then
    select * into actual from public.eventos where id = id_ev for update;
    if actual.id is null then raise exception 'No encontramos ese evento.'; end if;
    if actual.estado = 'cancelado' and est <> 'cancelado' then raise exception 'Un evento cancelado no puede reabrirse.'; end if;
    if actual.estado <> 'borrador' and est = 'borrador' then raise exception 'Un evento publicado no vuelve a borrador.'; end if;
    update public.eventos set
      nombre = titulo, fecha = f_ev, hora_inicio = ini, hora_fin = fin, comuna = c_ev,
      lugar = l_ev, descripcion = nullif(left(btrim(coalesce(ev ->> 'notes', '')), 800), ''),
      baristas_necesarios = cupos, pago_manual = pago, estado = est,
      servicio = nullif(left(btrim(coalesce(ev ->> 'service', '')), 120), ''),
      uniforme = nullif(left(btrim(coalesce(ev ->> 'uniform', '')), 200), ''),
      tiene_maquina = maquina, modo_pago = case modo when 'hourly' then 'horas' else 'fijo' end,
      salida_oficina = salida, regreso_oficina = regreso, requiere_camioneta = true
    where id = id_ev;
  else
    insert into public.eventos (nombre, fecha, hora_inicio, hora_fin, comuna, lugar, descripcion, baristas_necesarios, pago_manual,
                                estado, servicio, uniforme, tiene_maquina, modo_pago, salida_oficina, regreso_oficina, requiere_camioneta)
    values (titulo, f_ev, ini, fin, c_ev, l_ev, nullif(left(btrim(coalesce(ev ->> 'notes', '')), 800), ''), cupos, pago, est,
            nullif(left(btrim(coalesce(ev ->> 'service', '')), 120), ''), nullif(left(btrim(coalesce(ev ->> 'uniform', '')), 200), ''),
            maquina, case modo when 'hourly' then 'horas' else 'fijo' end, salida, regreso, true)
    returning id into id_ev;
  end if;

  insert into public.evento_seguimiento (evento_id) values (id_ev) on conflict (evento_id) do nothing;
  insert into public.evento_privado (evento_id, cliente) values (id_ev, nullif(left(btrim(coalesce(ev ->> 'client', '')), 120), ''))
    on conflict (evento_id) do update set cliente = excluded.cliente;
  if char_length(dir_ev) >= 3 then
    insert into public.evento_direcciones (evento_id, direccion) values (id_ev, left(dir_ev, 200))
      on conflict (evento_id) do update set direccion = excluded.direccion;
  else
    delete from public.evento_direcciones where evento_id = id_ev;
  end if;
  insert into public.evento_traslado (evento_id, km, tag, nota, ida_vuelta)
  values (id_ev, km, tag, nullif(left(btrim(coalesce(ev #>> '{transport,manualNote}', '')), 300), ''),
          coalesce((ev #>> '{transport,roundTrip}')::boolean, true))
  on conflict (evento_id) do update set km = excluded.km, tag = excluded.tag, nota = excluded.nota, ida_vuelta = excluded.ida_vuelta;

  if est = 'cancelado' then
    update public.postulaciones set estado = 'retirada' where evento_id = id_ev and estado in ('postulada', 'confirmada');
  elsif est = 'cerrado' and (f_ev < hoy or (f_ev = hoy and public.eq_inicio(f_ev, fin) <= now() and fin > ini)) then
    -- Al cerrar un evento que ya pasó, quienes estaban confirmados quedan como «trabajado» (suman en el ranking).
    update public.postulaciones set asistio = true where evento_id = id_ev and estado = 'confirmada' and asistio is null;
  end if;
  return jsonb_build_object('ok', true, 'id', id_ev);
end $$;

-- Todas las acciones de la interfaz.
create or replace function public.eq_accion(p_accion text, p_datos jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  adm boolean := public.es_admin();
  d jsonb := coalesce(p_datos, '{}'::jsonb);
  post public.postulaciones;
  ev public.eventos;
begin
  if uid is null then raise exception 'Inicia sesión para continuar.'; end if;
  if p_accion = 'profile' then
    return public.eq_perfil_guardar(d -> 'profile');
  elsif p_accion = 'apply' then
    perform public.eq_ocupar_cupo((d ->> 'eventId')::uuid, uid, coalesce(d ->> 'vehicleMode', ''), false);
    return jsonb_build_object('ok', true);
  elsif p_accion = 'cancelApplication' then
    select * into post from public.postulaciones where evento_id = (d ->> 'eventId')::uuid and barista_id = uid and estado in ('postulada', 'confirmada');
    if post.id is null then raise exception 'No tienes un turno en este evento.'; end if;
    select * into ev from public.eventos where id = post.evento_id;
    if public.eq_inicio(ev.fecha, ev.hora_inicio) - now() < interval '24 hours' then
      raise exception 'El plazo de cancelación terminó. Contacta a administración si tienes un problema.';
    end if;
    update public.postulaciones set estado = 'retirada', actualizado_en = now() where id = post.id;
    return jsonb_build_object('ok', true);
  end if;

  if not adm then raise exception 'Esta acción es solo para la administración.'; end if;
  if p_accion = 'saveEvent' then
    return public.eq_evento_guardar(d -> 'event');
  elsif p_accion = 'assignBarista' then
    perform public.eq_ocupar_cupo((d ->> 'eventId')::uuid, (d ->> 'memberId')::uuid, coalesce(d ->> 'vehicleMode', ''), true);
    return jsonb_build_object('ok', true);
  elsif p_accion = 'applicationStatus' then
    if d ->> 'status' <> 'approved' then raise exception 'Estado no válido.'; end if;
    perform public.eq_ocupar_cupo((d ->> 'eventId')::uuid, (d ->> 'memberId')::uuid, 'none', true);
    return jsonb_build_object('ok', true);
  elsif p_accion = 'removeApplication' then
    update public.postulaciones set estado = 'retirada', actualizado_en = now()
     where evento_id = (d ->> 'eventId')::uuid and barista_id = (d ->> 'memberId')::uuid and estado in ('postulada', 'confirmada');
    return jsonb_build_object('ok', true);
  elsif p_accion = 'memberStatus' then
    perform public.cambiar_estado_acceso((d ->> 'id')::uuid, d ->> 'status' = 'active');
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Acción no reconocida.';
end $$;

-- Rutas de las fotos de perfil de varias personas (para mostrarlas junto al nombre). Las fotos las ven los
-- baristas activos y la administración (así lo dice también la política del almacenamiento).
create or replace function public.eq_fotos_perfil(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.es_admin() or public.es_barista()) then raise exception 'Acceso no autorizado.'; end if;
  return coalesce((
    select jsonb_object_agg(b.id::text, b.foto_path)
    from public.baristas b join public.accesos a on a.id = b.id and a.activo
    where b.id = any (p_ids) and b.foto_path is not null), '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Ganancias y conexiones
-- ---------------------------------------------------------------------------
-- «Mis turnos y ganancias»: cada barista ve lo suyo; la administración, el de todas las personas.
-- Turnos = historial anterior + turnos con asistencia confirmada. Los montos salen de los turnos registrados
-- en la app (monto líquido del evento) y de las fechas de pago que anota la administración.
create or replace function public.eq_ganancias(p_barista uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  adm boolean := public.es_admin();
  uid uuid := auth.uid();
  hasta date;
begin
  if uid is null or not (adm or public.es_barista()) then raise exception 'Acceso no autorizado.'; end if;
  select max(h.fecha) into hasta from public.historial_turnos h;
  return jsonb_build_object(
    'historyThrough', coalesce(to_char(hasta, 'DD-MM-YYYY'), '—'),
    'profiles', coalesce((
      select jsonb_agg(f.perfil order by f.nombre) from (
        select coalesce(b.nombre, a.nombre) as nombre, jsonb_build_object(
          'id', a.id, 'name', coalesce(b.nombre, a.nombre),
          'worked', hist.n + coalesce(b.turnos_previos, 0) + nuevos.n,
          'historicalWorked', hist.n + coalesce(b.turnos_previos, 0),
          'newWorked', nuevos.n,
          'earned', coalesce(nuevos.ganado, 0),
          'paid', coalesce(nuevos.pagado, 0),
          'pending', coalesce(nuevos.ganado, 0) - coalesce(nuevos.pagado, 0),
          'unconfirmed', nuevos.sin_monto,
          'reimbursementPaid', coalesce(tr.pagado, 0),
          'reimbursementPending', coalesce(tr.pendiente, 0),
          'items', coalesce(nuevos.items, '[]'::jsonb)) as perfil
        from public.accesos a
        left join public.baristas b on b.id = a.id
        cross join lateral (select count(*)::int as n from public.historial_turnos h where h.acceso_id = a.id) hist
        cross join lateral (
          select count(*)::int as n,
                 sum(v.pago_liquido) filter (where v.pago_liquido is not null) as ganado,
                 sum(v.pago_liquido) filter (where v.pago_liquido is not null and p.honorarios_pagados_en is not null) as pagado,
                 (count(*) filter (where v.pago_liquido is null))::int as sin_monto,
                 jsonb_agg(jsonb_build_object(
                   'eventId', e.id, 'title', e.nombre, 'date', e.fecha, 'net', v.pago_liquido,
                   'paymentStatus', case when v.pago_liquido is null then 'unconfirmed'
                                         when p.honorarios_pagados_en is not null then 'paid' else 'pending' end)
                   order by e.fecha desc) as items
          from public.postulaciones p
          join public.eventos e on e.id = p.evento_id and e.estado <> 'cancelado'
          join public.eventos_vista v on v.id = e.id
          where p.barista_id = a.id and p.estado = 'confirmada' and p.asistio is true) nuevos
        cross join lateral (
          select sum(t.total) filter (where t.pagado_en is not null and t.completo) as pagado,
                 sum(t.total) filter (where t.pagado_en is null and t.completo) as pendiente
          from public.traslados() t where t.barista_id = a.id) tr
        where a.activo and (adm or a.id = uid)
          and (p_barista is null or a.id = p_barista)
          and (not adm or b.id is not null or hist.n > 0)
      ) f), '[]'::jsonb));
end $$;

-- Conexiones de la pantalla de eventos: los traslados se calculan a mano (kilómetros y TAG que anota la
-- administración) con el diésel y el rendimiento de la configuración. No hay proveedores externos.
create or replace function public.eq_integraciones() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cfg public.config;
begin
  if not public.es_admin() then raise exception 'Esta acción es solo para la administración.'; end if;
  select * into cfg from public.config where id = 1;
  return jsonb_build_object('routes', jsonb_build_object('mode', 'manual', 'configured', false),
    'fuel', jsonb_build_object('configured', false),
    'quote', jsonb_build_object('price', cfg.precio_litro, 'efficiency', cfg.rendimiento_km_l, 'source', 'manual', 'name', 'Valor fijo de Sepia'));
end $$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public.eq_hhmm(time) from public, anon;
revoke all on function public.eq_formato_rut(text) from public, anon;
revoke all on function public.eq_inicio(date, time) from public, anon;
revoke all on function public.eq_estado_post(text, boolean) from public, anon;
revoke all on function public.eq_cupos(uuid) from public, anon;
revoke all on function public.eq_perfil_json(public.baristas) from public, anon;
revoke all on function public.eq_evento_json(uuid, boolean) from public, anon;
revoke all on function public.eq_estado(text) from public, anon;
revoke all on function public.eq_ranking() from public, anon;
revoke all on function public.eq_equipo_evento(uuid) from public, anon;
revoke all on function public.eq_avisos(timestamptz) from public, anon;
revoke all on function public.eq_avisos_leer(uuid) from public, anon;
grant execute on function public.eq_estado(text) to authenticated;
grant execute on function public.eq_ranking() to authenticated;
grant execute on function public.eq_equipo_evento(uuid) to authenticated;
grant execute on function public.eq_avisos(timestamptz) to authenticated;
grant execute on function public.eq_avisos_leer(uuid) to authenticated;
revoke all on function public.eq_perfil_guardar(jsonb) from public, anon, authenticated;
revoke all on function public.eq_ocupar_cupo(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.eq_evento_guardar(jsonb) from public, anon, authenticated;
revoke all on function public.eq_accion(text, jsonb) from public, anon;
grant execute on function public.eq_accion(text, jsonb) to authenticated;
revoke all on function public.eq_fotos_perfil(uuid[]) from public, anon;
grant execute on function public.eq_fotos_perfil(uuid[]) to authenticated;
revoke all on function public.eq_ganancias(uuid) from public, anon;
grant execute on function public.eq_ganancias(uuid) to authenticated;
revoke all on function public.eq_integraciones() from public, anon;
grant execute on function public.eq_integraciones() to authenticated;
