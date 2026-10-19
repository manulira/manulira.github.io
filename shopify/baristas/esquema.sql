-- SEPIA COFFEE · portal de baristas · esquema para Supabase
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO esto → Run.
-- Se puede volver a correr sin romper nada ni borrar datos.
--
-- Qué guarda y quién lo ve:
--   baristas ........ datos personales y bancarios. Cada barista ve SOLO los
--                     suyos. Los ve también la persona administradora.
--   eventos ......... nombre, fecha, horario, comuna, lugar y pago. Lo ven los
--                     baristas ya registrados (solo eventos abiertos o en los
--                     que postularon).
--   evento_privado .. cliente, contacto y notas. SOLO la administración.
--   evento_direcciones  dirección exacta. La administración y los baristas
--                     CONFIRMADOS en ese evento. Nadie más.
--   postulaciones ... quién postuló a qué. El barista ve las suyas; asignar o
--                     rechazar lo hace solo la administración. El barista
--                     asignado confirma después que va (reconfirmación).
--   evento_seguimiento  checklist del evento y documento al cliente. Solo la
--                     administración.
--   seguimiento_vista .. semáforo de cada evento (ok, pendiente o alerta) y lo
--                     que falta para cerrarlo. Solo la administración.
--   config .......... tarifas, retención, plazos de alerta, checklist y textos.
--   admins .......... correos de la administración. Nadie la lee desde la web.
--
-- Después de correr esto, UNA sola vez, agrega tu correo como administrador
-- (no lo dejes escrito en este archivo: el repositorio es público):
--
--   insert into public.admins (email) values ('tu-correo@ejemplo.cl');

-- ---------------------------------------------------------------------------
-- 1. Funciones de apoyo
-- ---------------------------------------------------------------------------

-- RUT chileno: largo, caracteres y dígito verificador (módulo 11).
create or replace function public.rut_valido(rut text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  t text; cuerpo text; dv text; suma int := 0; m int := 2; i int; r int; esperado text;
begin
  if rut is null then return false; end if;
  t := upper(regexp_replace(rut, '[^0-9kK]', '', 'g'));
  if t !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
  cuerpo := left(t, -1);
  dv := right(t, 1);
  for i in reverse char_length(cuerpo)..1 loop
    suma := suma + substr(cuerpo, i, 1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  r := 11 - (suma % 11);
  esperado := case r when 11 then '0' when 10 then 'K' else r::text end;
  return dv = esperado;
end $$;

-- 11111111-1 → 11.111.111-1
create or replace function public.rut_formato(rut text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text;
begin
  t := upper(regexp_replace(coalesce(rut, ''), '[^0-9kK]', '', 'g'));
  if char_length(t) < 2 then return t; end if;
  return regexp_replace(left(t, -1), '(?<=\d)(?=(\d{3})+$)', '.', 'g') || '-' || right(t, 1);
end $$;

create table if not exists public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;   -- sin políticas: no se lee desde la web
revoke all on public.admins from anon, authenticated;

-- ¿Quien consulta es administración? Su correo está en admins Y entró con el
-- código del correo. Si la sesión nació de una contraseña no vale: alguien
-- podría haber creado una cuenta con el correo de la administración antes que
-- ella, y quedarse con una contraseña puesta.
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
     and not exists (
       select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x
       where x ->> 'method' = 'password');
$$;

-- ---------------------------------------------------------------------------
-- 2. Configuración (tarifas, retención y textos que acepta el barista)
-- ---------------------------------------------------------------------------

create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  tarifa_hora int not null default 10000 check (tarifa_hora >= 0),
  corto_max_horas numeric not null default 2 check (corto_max_horas > 0),
  corto_monto int not null default 25000 check (corto_monto >= 0),
  medio_max_horas numeric not null default 4 check (medio_max_horas > 0),
  medio_monto int not null default 40000 check (medio_monto >= 0),
  retencion numeric not null default 0.1525 check (retencion >= 0 and retencion < 0.5),
  tope_dia int not null default 70000 check (tope_dia >= 0),
  dias_alerta_baristas int not null default 7 check (dias_alerta_baristas >= 0),
  dias_alerta_reconfirmar int not null default 4 check (dias_alerta_reconfirmar >= 0),
  dias_alerta_cierre int not null default 7 check (dias_alerta_cierre >= 0),
  checklist_items jsonb not null default '[{"clave":"grupo_whatsapp","texto":"Grupo de WhatsApp creado"},{"clave":"direccion_hora","texto":"Dirección y hora enviadas a los baristas"},{"clave":"equipo","texto":"Equipo y materiales listos"},{"clave":"transporte","texto":"Transporte y recolección coordinados"},{"clave":"cliente_confirmo","texto":"Cliente confirmó hora y lugar"}]'::jsonb check (jsonb_typeof(checklist_items) = 'array'),
  texto_boleta text not null default 'Declaro que puedo emitir boleta de honorarios electrónica por los servicios que preste en los eventos de Sepia Coffee.',
  texto_privacidad text not null default 'Sepia Coffee usa mis datos solo para coordinar los eventos y pagarme. Los ve únicamente Sepia Coffee, y puedo pedir que los borre en cualquier momento.',
  check (medio_max_horas >= corto_max_horas)
);
-- Para bases que ya tenían la tabla sin el tope diario (ver migraciones/).
alter table public.config add column if not exists tope_dia int not null default 70000 check (tope_dia >= 0);
-- Plazos de alerta del seguimiento (días) y lista del checklist de cada evento.
alter table public.config add column if not exists dias_alerta_baristas int not null default 7 check (dias_alerta_baristas >= 0);
alter table public.config add column if not exists dias_alerta_reconfirmar int not null default 4 check (dias_alerta_reconfirmar >= 0);
alter table public.config add column if not exists dias_alerta_cierre int not null default 7 check (dias_alerta_cierre >= 0);
alter table public.config add column if not exists checklist_items jsonb not null default '[{"clave":"grupo_whatsapp","texto":"Grupo de WhatsApp creado"},{"clave":"direccion_hora","texto":"Dirección y hora enviadas a los baristas"},{"clave":"equipo","texto":"Equipo y materiales listos"},{"clave":"transporte","texto":"Transporte y recolección coordinados"},{"clave":"cliente_confirmo","texto":"Cliente confirmó hora y lugar"}]'::jsonb check (jsonb_typeof(checklist_items) = 'array');
insert into public.config (id) values (1) on conflict (id) do nothing;
alter table public.config enable row level security;
revoke all on public.config from anon;
grant select, update on public.config to authenticated;
drop policy if exists config_ver on public.config;
create policy config_ver on public.config for select to authenticated using (true);
drop policy if exists config_editar on public.config;
create policy config_editar on public.config for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- 3. Baristas
-- ---------------------------------------------------------------------------

create table if not exists public.baristas (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 3 and 100),
  rut text not null unique check (public.rut_valido(rut)),
  correo text not null check (correo = lower(correo) and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telefono text not null check (telefono ~ '^\+?[0-9 ]{8,16}$'),
  comuna text not null check (char_length(btrim(comuna)) between 2 and 60),
  experiencia text check (experiencia is null or char_length(experiencia) <= 600),
  banco text not null check (char_length(btrim(banco)) between 2 and 60),
  tipo_cuenta text not null check (tipo_cuenta in ('Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro')),
  numero_cuenta text not null check (numero_cuenta ~ '^[0-9]{4,20}$'),
  cuenta_propia boolean not null check (cuenta_propia),
  acepta_boleta boolean not null check (acepta_boleta),
  acepta_boleta_texto text not null,
  acepta_privacidad boolean not null check (acepta_privacidad),
  acepta_avisos boolean not null default false,
  aceptado_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Permiso (opcional) para avisarle por correo cuando haya cupos disponibles.
alter table public.baristas add column if not exists acepta_avisos boolean not null default false;

-- El texto que aceptó y la fecha los pone el servidor, no el navegador.
create or replace function public.t_baristas_antes() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.correo := lower(new.correo);
  new.rut := public.rut_formato(new.rut);
  if tg_op = 'INSERT' then
    new.acepta_boleta_texto := (select c.texto_boleta from public.config c where c.id = 1);
    new.aceptado_en := now();
    new.creado_en := now();
    new.actualizado_en := now();
  else
    if new.id <> old.id then raise exception 'No se puede cambiar el id'; end if;
    new.acepta_boleta_texto := old.acepta_boleta_texto;
    new.aceptado_en := old.aceptado_en;
    new.creado_en := old.creado_en;
    new.actualizado_en := now();
  end if;
  return new;
end $$;
drop trigger if exists baristas_antes on public.baristas;
create trigger baristas_antes before insert or update on public.baristas
  for each row execute function public.t_baristas_antes();

create or replace function public.es_barista() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.baristas b where b.id = auth.uid());
$$;

alter table public.baristas enable row level security;
revoke all on public.baristas from anon;
grant select, insert, update, delete on public.baristas to authenticated;

drop policy if exists baristas_ver on public.baristas;
create policy baristas_ver on public.baristas for select to authenticated
  using (id = auth.uid() or public.es_admin());
drop policy if exists baristas_crear on public.baristas;
create policy baristas_crear on public.baristas for insert to authenticated
  with check (id = auth.uid() and correo = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists baristas_editar on public.baristas;
create policy baristas_editar on public.baristas for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and correo = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists baristas_borrar on public.baristas;
create policy baristas_borrar on public.baristas for delete to authenticated
  using (id = auth.uid() or public.es_admin());

-- ---------------------------------------------------------------------------
-- 4. Eventos
-- ---------------------------------------------------------------------------

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 3 and 120),
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null check (hora_fin <> hora_inicio),
  comuna text not null check (char_length(btrim(comuna)) between 2 and 60),
  lugar text check (lugar is null or char_length(lugar) <= 120),
  descripcion text check (descripcion is null or char_length(descripcion) <= 800),
  baristas_necesarios int not null default 1 check (baristas_necesarios between 1 and 50),
  pago_manual int check (pago_manual is null or pago_manual >= 0),
  estado text not null default 'borrador' check (estado in ('borrador', 'abierto', 'cerrado', 'cancelado')),
  creado_en timestamptz not null default now()
);

-- Solo la administración: cliente, contacto y notas internas.
create table if not exists public.evento_privado (
  evento_id uuid primary key references public.eventos (id) on delete cascade,
  cliente text check (cliente is null or char_length(cliente) <= 120),
  contacto text check (contacto is null or char_length(contacto) <= 200),
  notas text check (notas is null or char_length(notas) <= 1000)
);

-- Dirección exacta: administración y baristas confirmados en ese evento.
create table if not exists public.evento_direcciones (
  evento_id uuid primary key references public.eventos (id) on delete cascade,
  direccion text not null check (char_length(btrim(direccion)) between 3 and 200),
  indicaciones text check (indicaciones is null or char_length(indicaciones) <= 500)
);

-- Solo la administración: checklist del evento y documento emitido al cliente.
-- checklist guarda {clave: fecha-hora} de cada punto marcado (las claves están en
-- config.checklist_items).
create table if not exists public.evento_seguimiento (
  evento_id uuid primary key references public.eventos (id) on delete cascade,
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  documento_cliente_emitido_en date,
  documento_cliente_folio text check (documento_cliente_folio is null or char_length(documento_cliente_folio) <= 40),
  notas text check (notas is null or char_length(notas) <= 1000),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Postulaciones
-- ---------------------------------------------------------------------------

create table if not exists public.postulaciones (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  barista_id uuid not null references public.baristas (id) on delete cascade,
  estado text not null default 'postulada' check (estado in ('postulada', 'confirmada', 'rechazada', 'retirada')),
  mensaje text check (mensaje is null or char_length(mensaje) <= 400),
  asistencia_confirmada_en timestamptz,
  boleta_honorarios_recibida_en date,
  boleta_honorarios_folio text check (boleta_honorarios_folio is null or char_length(boleta_honorarios_folio) <= 40),
  honorarios_pagados_en date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (evento_id, barista_id)
);
-- asistencia_confirmada_en: el barista asignado confirma que va (la fecha la pone
--   el servidor). Se borra sola si deja de estar asignado.
-- boleta_honorarios_* y honorarios_pagados_en: los registra solo la administración.
alter table public.postulaciones add column if not exists asistencia_confirmada_en timestamptz;
alter table public.postulaciones add column if not exists boleta_honorarios_recibida_en date;
alter table public.postulaciones add column if not exists boleta_honorarios_folio text check (boleta_honorarios_folio is null or char_length(boleta_honorarios_folio) <= 40);
alter table public.postulaciones add column if not exists honorarios_pagados_en date;
create index if not exists postulaciones_barista_idx on public.postulaciones (barista_id);

create or replace function public.t_postulaciones_antes() returns trigger
language plpgsql set search_path = '' as $$
declare
  admin_o_servicio boolean := (auth.uid() is null) or public.es_admin();   -- editor SQL o administración
begin
  if tg_op = 'INSERT' then
    -- Una postulación nueva nace sin confirmación ni datos de cierre.
    new.asistencia_confirmada_en := null;
    if not admin_o_servicio then
      new.boleta_honorarios_recibida_en := null;
      new.boleta_honorarios_folio := null;
      new.honorarios_pagados_en := null;
    end if;
    return new;
  end if;

  if new.evento_id <> old.evento_id or new.barista_id <> old.barista_id then
    raise exception 'No se puede cambiar el evento ni el barista';
  end if;
  new.creado_en := old.creado_en;
  new.actualizado_en := now();

  if not admin_o_servicio then
    -- Un barista solo puede postular de nuevo, retirarse o confirmar su asistencia.
    -- Asignar y rechazar lo hace la administración.
    if not (
      old.estado = new.estado
      or (old.estado in ('postulada', 'retirada') and new.estado in ('postulada', 'retirada'))
      or (old.estado = 'confirmada' and new.estado = 'retirada')
    ) then
      raise exception 'Ese cambio de estado lo hace Sepia Coffee';
    end if;
    if new.boleta_honorarios_recibida_en is distinct from old.boleta_honorarios_recibida_en
       or new.boleta_honorarios_folio is distinct from old.boleta_honorarios_folio
       or new.honorarios_pagados_en is distinct from old.honorarios_pagados_en then
      raise exception 'La boleta y el pago los registra Sepia Coffee';
    end if;
  end if;

  -- La confirmación de asistencia solo existe mientras la persona está asignada.
  if new.estado <> 'confirmada' or old.estado <> 'confirmada' then
    new.asistencia_confirmada_en := null;
  elsif new.asistencia_confirmada_en is distinct from old.asistencia_confirmada_en then
    if new.asistencia_confirmada_en is null then
      if not admin_o_servicio then raise exception 'No se puede deshacer la confirmación'; end if;
    else
      new.asistencia_confirmada_en := now();      -- la fecha la pone el servidor
    end if;
  end if;
  return new;
end $$;
drop trigger if exists postulaciones_antes on public.postulaciones;
create trigger postulaciones_antes before insert or update on public.postulaciones
  for each row execute function public.t_postulaciones_antes();

-- Funciones que usan las políticas (definer, para no depender de otras políticas).
create or replace function public.tiene_postulacion(ev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.postulaciones p where p.evento_id = ev and p.barista_id = auth.uid());
$$;
create or replace function public.esta_confirmado(ev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.postulaciones p
                 where p.evento_id = ev and p.barista_id = auth.uid() and p.estado = 'confirmada');
$$;
create or replace function public.evento_abierto(ev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.eventos e
                 where e.id = ev and e.estado = 'abierto'
                   and e.fecha >= (now() at time zone 'America/Santiago')::date);
$$;

-- ---------------------------------------------------------------------------
-- 6. Políticas de eventos, direcciones y postulaciones
-- ---------------------------------------------------------------------------

alter table public.eventos enable row level security;
revoke all on public.eventos from anon;
grant select, insert, update, delete on public.eventos to authenticated;
drop policy if exists eventos_ver on public.eventos;
create policy eventos_ver on public.eventos for select to authenticated
  using (
    public.es_admin()
    or (public.es_barista() and estado <> 'borrador' and (estado = 'abierto' or public.tiene_postulacion(id)))
  );
drop policy if exists eventos_admin on public.eventos;
create policy eventos_admin on public.eventos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.evento_privado enable row level security;
revoke all on public.evento_privado from anon;
grant select, insert, update, delete on public.evento_privado to authenticated;
drop policy if exists evento_privado_admin on public.evento_privado;
create policy evento_privado_admin on public.evento_privado for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.evento_direcciones enable row level security;
revoke all on public.evento_direcciones from anon;
grant select, insert, update, delete on public.evento_direcciones to authenticated;
drop policy if exists direcciones_ver on public.evento_direcciones;
create policy direcciones_ver on public.evento_direcciones for select to authenticated
  using (public.es_admin() or public.esta_confirmado(evento_id));
drop policy if exists direcciones_admin on public.evento_direcciones;
create policy direcciones_admin on public.evento_direcciones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.evento_seguimiento enable row level security;
revoke all on public.evento_seguimiento from anon;
grant select, insert, update, delete on public.evento_seguimiento to authenticated;
drop policy if exists seguimiento_admin on public.evento_seguimiento;
create policy seguimiento_admin on public.evento_seguimiento for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.postulaciones enable row level security;
revoke all on public.postulaciones from anon;
grant select, insert, update, delete on public.postulaciones to authenticated;
drop policy if exists post_ver on public.postulaciones;
create policy post_ver on public.postulaciones for select to authenticated
  using (barista_id = auth.uid() or public.es_admin());
drop policy if exists post_crear on public.postulaciones;
create policy post_crear on public.postulaciones for insert to authenticated
  with check (
    barista_id = auth.uid() and estado = 'postulada'
    and public.es_barista() and public.evento_abierto(evento_id)
  );
drop policy if exists post_editar on public.postulaciones;
create policy post_editar on public.postulaciones for update to authenticated
  using (barista_id = auth.uid() and estado <> 'rechazada')
  with check (
    barista_id = auth.uid()
    and (estado in ('retirada', 'confirmada') or (estado = 'postulada' and public.evento_abierto(evento_id)))
  );
drop policy if exists post_admin on public.postulaciones;
create policy post_admin on public.postulaciones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- 7. Vista de eventos con horas, pago y monto de la boleta ya calculados
-- ---------------------------------------------------------------------------
-- pago_liquido: lo que Sepia transfiere a cada barista. Si el evento trae
--   pago_manual, manda ese (es una decisión puesta a mano, no se recorta).
--   Si no: hasta corto_max_horas → corto_monto; hasta medio_max_horas →
--   medio_monto; más largo → tarifa_hora × horas. El resultado nunca pasa de
--   tope_dia (por defecto $70.000 líquidos por barista y por día).
-- pago_sin_tope: lo que habría salido sin el tope, para ver cuándo se aplicó.
-- monto_boleta: lo que el barista debe poner en su boleta de honorarios para
--   que, descontada la retención, le queden pago_liquido (líquido ÷ (1 − tasa)).

create or replace view public.eventos_vista with (security_invoker = true) as
select
  e.*,
  h.horas,
  p.pago_liquido,
  round(p.pago_liquido / (1 - c.retencion))::int as monto_boleta,
  c.retencion,
  p.pago_sin_tope
from public.eventos e
cross join public.config c
cross join lateral (
  select (extract(epoch from (
           case when e.hora_fin > e.hora_inicio then e.hora_fin - e.hora_inicio
                else e.hora_fin - e.hora_inicio + interval '24 hours' end
         )) / 3600.0)::numeric as horas
) h
cross join lateral (
  select case when h.horas <= c.corto_max_horas then c.corto_monto
              when h.horas <= c.medio_max_horas then c.medio_monto
              else round(h.horas * c.tarifa_hora)::int end as regla
) r
cross join lateral (
  select coalesce(e.pago_manual, least(r.regla, c.tope_dia)) as pago_liquido,
         coalesce(e.pago_manual, r.regla) as pago_sin_tope
) p;
revoke all on public.eventos_vista from anon;
grant select on public.eventos_vista to authenticated;


-- ---------------------------------------------------------------------------
-- 8. Seguimiento de cada evento (solo administración)
-- ---------------------------------------------------------------------------
-- semaforo (solo eventos futuros, abiertos o cerrados a postulaciones):
--   alerta    faltan baristas y quedan config.dias_alerta_baristas días o menos
--             (por defecto 7), o hay asignados sin reconfirmar y quedan
--             config.dias_alerta_reconfirmar días o menos (por defecto 4).
--   pendiente faltan baristas o reconfirmaciones, pero aún hay tiempo.
--   ok        cupos completos y todos reconfirmaron.
-- por_cerrar: el evento ya pasó y falta el documento al cliente, alguna boleta de
--   honorarios o algún pago. cierre_atrasado: lleva más de config.dias_alerta_cierre
--   días así.

create or replace view public.seguimiento_vista with (security_invoker = true) as
with hoy as (
  select (now() at time zone 'America/Santiago')::date as d
), cuenta as (
  select e.id,
    count(*) filter (where p.estado = 'confirmada') as asignados,
    count(*) filter (where p.estado = 'confirmada' and p.asistencia_confirmada_en is not null) as reconfirmados,
    count(*) filter (where p.estado = 'postulada') as postulantes,
    count(*) filter (where p.estado = 'confirmada' and p.boleta_honorarios_recibida_en is null) as boletas_pendientes,
    count(*) filter (where p.estado = 'confirmada' and p.honorarios_pagados_en is null) as pagos_pendientes
  from public.eventos e
  left join public.postulaciones p on p.evento_id = e.id
  group by e.id
)
select
  e.id as evento_id,
  e.nombre, e.fecha, e.hora_inicio, e.hora_fin, e.estado, e.baristas_necesarios,
  (e.fecha - hoy.d) as dias_restantes,
  c.asignados, c.reconfirmados, c.postulantes,
  greatest(e.baristas_necesarios - c.asignados, 0) as faltan,
  case
    when e.estado in ('borrador', 'cancelado') or e.fecha < hoy.d then null
    when (greatest(e.baristas_necesarios - c.asignados, 0) > 0 and (e.fecha - hoy.d) <= cfg.dias_alerta_baristas)
      or (c.asignados > c.reconfirmados and (e.fecha - hoy.d) <= cfg.dias_alerta_reconfirmar) then 'alerta'
    when greatest(e.baristas_necesarios - c.asignados, 0) > 0 or c.asignados > c.reconfirmados then 'pendiente'
    else 'ok'
  end as semaforo,
  (e.fecha < hoy.d) as realizado,
  case when e.fecha < hoy.d then (hoy.d - e.fecha) end as dias_desde_evento,
  c.boletas_pendientes, c.pagos_pendientes,
  (s.documento_cliente_emitido_en is null) as documento_cliente_pendiente,
  s.documento_cliente_emitido_en, s.documento_cliente_folio,
  (e.fecha < hoy.d and e.estado <> 'cancelado' and c.asignados > 0
     and (c.boletas_pendientes > 0 or c.pagos_pendientes > 0 or s.documento_cliente_emitido_en is null)) as por_cerrar,
  (e.fecha < hoy.d and e.estado <> 'cancelado' and c.asignados > 0
     and (c.boletas_pendientes > 0 or c.pagos_pendientes > 0 or s.documento_cliente_emitido_en is null)
     and (hoy.d - e.fecha) > cfg.dias_alerta_cierre) as cierre_atrasado,
  (select count(*) from jsonb_array_elements(cfg.checklist_items) it
    where coalesce(s.checklist, '{}'::jsonb) ? (it ->> 'clave')) as checklist_hechos,
  jsonb_array_length(cfg.checklist_items) as checklist_total
from public.eventos e
join cuenta c on c.id = e.id
left join public.evento_seguimiento s on s.evento_id = e.id
cross join hoy
cross join public.config cfg
where public.es_admin();
revoke all on public.seguimiento_vista from anon;
grant select on public.seguimiento_vista to authenticated;

-- Las funciones de las políticas solo las ejecuta quien inició sesión.
revoke all on function public.es_admin() from public, anon;
revoke all on function public.es_barista() from public, anon;
revoke all on function public.tiene_postulacion(uuid) from public, anon;
revoke all on function public.esta_confirmado(uuid) from public, anon;
revoke all on function public.evento_abierto(uuid) from public, anon;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_barista() to authenticated;
grant execute on function public.tiene_postulacion(uuid) to authenticated;
grant execute on function public.esta_confirmado(uuid) to authenticated;
grant execute on function public.evento_abierto(uuid) to authenticated;
