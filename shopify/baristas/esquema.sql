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
--   automatizacion .. clave de la automatización y última sincronización del
--                     calendario. La clave nunca sale de la base de datos.
--   notificaciones .. registro de los correos automáticos ya enviados (para no
--                     repetirlos). Nadie la lee desde la web.
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
  dias_vacante_cupos int not null default 5 check (dias_vacante_cupos >= 0),
  dias_publicacion int not null default 14 check (dias_publicacion >= 1),
  avisar_eventos_nuevos boolean not null default true,
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
alter table public.config add column if not exists dias_vacante_cupos int not null default 5 check (dias_vacante_cupos >= 0);
-- Los baristas ven y pueden postular a un evento desde 14 días antes de su fecha. Quienes aceptaron
-- avisos reciben un correo cuando se abre (avisar_eventos_nuevos).
alter table public.config add column if not exists dias_publicacion int not null default 14 check (dias_publicacion >= 1);
alter table public.config add column if not exists avisar_eventos_nuevos boolean not null default true;
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
  gcal_id text,
  origen text not null default 'portal' check (origen in ('portal', 'calendario')),
  revisar boolean not null default false,
  revisar_motivo text check (revisar_motivo is null or char_length(revisar_motivo) <= 200),
  actualizado_en timestamptz not null default now()
);
-- gcal_id: id del evento en Google Calendar (si vino de la sincronización).
-- revisar: el evento entró con datos incompletos o cambió en el calendario.
alter table public.evento_seguimiento add column if not exists gcal_id text;
alter table public.evento_seguimiento add column if not exists origen text not null default 'portal' check (origen in ('portal', 'calendario'));
alter table public.evento_seguimiento add column if not exists revisar boolean not null default false;
alter table public.evento_seguimiento add column if not exists revisar_motivo text check (revisar_motivo is null or char_length(revisar_motivo) <= 200);
create unique index if not exists evento_seguimiento_gcal_idx on public.evento_seguimiento (gcal_id) where gcal_id is not null;

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
  boleta_declarada_en timestamptz,
  boleta_declarada_folio text check (boleta_declarada_folio is null or char_length(boleta_declarada_folio) <= 40),
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
-- boleta_declarada_*: el barista avisa que ya emitió su boleta de honorarios (desde el
--   día del evento). La fecha la pone el servidor. La administración la revisa en el SII.
alter table public.postulaciones add column if not exists boleta_declarada_en timestamptz;
alter table public.postulaciones add column if not exists boleta_declarada_folio text check (boleta_declarada_folio is null or char_length(boleta_declarada_folio) <= 40);
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
      new.boleta_declarada_en := null;
      new.boleta_declarada_folio := null;
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
    -- El barista puede avisar que emitió su boleta, solo asignado y desde el día del evento.
    if new.boleta_declarada_en is distinct from old.boleta_declarada_en
       or new.boleta_declarada_folio is distinct from old.boleta_declarada_folio then
      if new.estado <> 'confirmada'
         or (select e.fecha from public.eventos e where e.id = new.evento_id) > (now() at time zone 'America/Santiago')::date then
        raise exception 'La boleta se declara desde el día del evento, estando asignado';
      end if;
      if new.boleta_declarada_en is null then raise exception 'No se puede deshacer la declaración de la boleta'; end if;
      if new.boleta_declarada_en is distinct from old.boleta_declarada_en then new.boleta_declarada_en := now(); end if;
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
-- ¿La fecha ya está dentro de la ventana en que los baristas ven los eventos?
-- (hasta config.dias_publicacion días hacia adelante; 14 por defecto)
create or replace function public.dentro_de_publicacion(f date) returns boolean
language sql stable security definer set search_path = '' as $$
  select f <= (now() at time zone 'America/Santiago')::date + (select c.dias_publicacion from public.config c where c.id = 1);
$$;
create or replace function public.evento_abierto(ev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.eventos e
                 where e.id = ev and e.estado = 'abierto'
                   and e.fecha >= (now() at time zone 'America/Santiago')::date
                   and public.dentro_de_publicacion(e.fecha));
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
    or (public.es_barista() and estado <> 'borrador'
        and (public.tiene_postulacion(id) or (estado = 'abierto' and public.dentro_de_publicacion(fecha))))
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
--   días así. boletas_declaradas: boletas que el barista dice haber emitido y aún
--   no están pagadas.
-- La lógica vive en una función que recibe «ahora», para poder simular el paso
-- de los días en las pruebas. La web solo ve la vista, y solo la administración.

-- La forma de una fila de seguimiento. Se vuelve a crear en cada corrida (junto con las
-- funciones y la vista que la usan), así que cambiarla acá es seguro.
drop view if exists public.seguimiento_vista;
drop function if exists public.seguimiento_admin();
drop function if exists public.seguimiento_en(timestamptz);
drop type if exists public.seguimiento_tipo;
create type public.seguimiento_tipo as (
  evento_id uuid, nombre text, fecha date, hora_inicio time, hora_fin time, estado text,
  baristas_necesarios int, dias_restantes int, asignados bigint, reconfirmados bigint,
  postulantes bigint, faltan int, semaforo text, realizado boolean, dias_desde_evento int,
  boletas_pendientes bigint, boletas_declaradas bigint, pagos_pendientes bigint,
  documento_cliente_pendiente boolean, documento_cliente_emitido_en date,
  documento_cliente_folio text, por_cerrar boolean, cierre_atrasado boolean,
  checklist_hechos bigint, checklist_total int, grupo_wsp boolean,
  revisar boolean, revisar_motivo text, origen text
);

create or replace function public.seguimiento_en(ahora timestamptz default now())
returns setof public.seguimiento_tipo
language sql stable security definer set search_path = '' as $$
  with hoy as (
    select (ahora at time zone 'America/Santiago')::date as d
  ), cuenta as (
    select e.id,
      count(*) filter (where p.estado = 'confirmada') as asignados,
      count(*) filter (where p.estado = 'confirmada' and p.asistencia_confirmada_en is not null) as reconfirmados,
      count(*) filter (where p.estado = 'postulada') as postulantes,
      count(*) filter (where p.estado = 'confirmada' and p.boleta_declarada_en is null
                         and p.boleta_honorarios_recibida_en is null) as boletas_pendientes,
      count(*) filter (where p.estado = 'confirmada' and p.boleta_declarada_en is not null
                         and p.honorarios_pagados_en is null) as boletas_declaradas,
      count(*) filter (where p.estado = 'confirmada' and p.honorarios_pagados_en is null) as pagos_pendientes
    from public.eventos e
    left join public.postulaciones p on p.evento_id = e.id
    group by e.id
  )
  select
    e.id, e.nombre, e.fecha, e.hora_inicio, e.hora_fin, e.estado, e.baristas_necesarios,
    (e.fecha - hoy.d),
    c.asignados, c.reconfirmados, c.postulantes,
    greatest(e.baristas_necesarios - c.asignados, 0)::int,
    case
      when e.estado in ('borrador', 'cancelado') or e.fecha < hoy.d then null
      when (greatest(e.baristas_necesarios - c.asignados, 0) > 0 and (e.fecha - hoy.d) <= cfg.dias_alerta_baristas)
        or (c.asignados > c.reconfirmados and (e.fecha - hoy.d) <= cfg.dias_alerta_reconfirmar) then 'alerta'
      when greatest(e.baristas_necesarios - c.asignados, 0) > 0 or c.asignados > c.reconfirmados then 'pendiente'
      else 'ok'
    end,
    (e.fecha < hoy.d),
    case when e.fecha < hoy.d then (hoy.d - e.fecha) end,
    c.boletas_pendientes, c.boletas_declaradas, c.pagos_pendientes,
    (s.documento_cliente_emitido_en is null),
    s.documento_cliente_emitido_en, s.documento_cliente_folio,
    (e.fecha < hoy.d and e.estado <> 'cancelado' and c.asignados > 0
       and (c.boletas_pendientes > 0 or c.pagos_pendientes > 0 or s.documento_cliente_emitido_en is null)),
    (e.fecha < hoy.d and e.estado <> 'cancelado' and c.asignados > 0
       and (c.boletas_pendientes > 0 or c.pagos_pendientes > 0 or s.documento_cliente_emitido_en is null)
       and (hoy.d - e.fecha) > cfg.dias_alerta_cierre),
    (select count(*) from jsonb_array_elements(cfg.checklist_items) it
      where coalesce(s.checklist, '{}'::jsonb) ? (it ->> 'clave')),
    jsonb_array_length(cfg.checklist_items),
    (coalesce(s.checklist, '{}'::jsonb) ? 'grupo_whatsapp'),
    coalesce(s.revisar, false), s.revisar_motivo, coalesce(s.origen, 'portal')
  from public.eventos e
  join cuenta c on c.id = e.id
  left join public.evento_seguimiento s on s.evento_id = e.id
  cross join hoy
  cross join public.config cfg;
$$;
revoke all on function public.seguimiento_en(timestamptz) from public, anon, authenticated;

-- Una vista no ejecuta sus funciones con los permisos de su dueño sino con los de quien
-- consulta, así que la web pasa por esta función, que corre con permisos propios y solo
-- entrega filas a la administración.
create or replace function public.seguimiento_admin()
returns setof public.seguimiento_tipo
language sql stable security definer set search_path = '' as $$
  select * from public.seguimiento_en(now()) where public.es_admin();
$$;
revoke all on function public.seguimiento_admin() from public, anon;
grant execute on function public.seguimiento_admin() to authenticated;

create view public.seguimiento_vista as select * from public.seguimiento_admin();
revoke all on public.seguimiento_vista from anon;
grant select on public.seguimiento_vista to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Automatización: sincronizar el calendario y mandar los correos
-- ---------------------------------------------------------------------------
-- Un script de Google Apps Script (en la cuenta de la administración) llama estas
-- funciones con una clave secreta: sincroniza el calendario, pide la lista de
-- correos que toca mandar, los envía y los marca como enviados. Todo lo que decide
-- quién recibe qué y cuándo vive acá, en calcular_notificaciones().
--
-- Para activar la clave (una vez; inventa una larga y guárdala también en el script):
--   update public.automatizacion
--     set secreto_hash = encode(sha256(convert_to('LA-CLAVE-LARGA-Y-SECRETA', 'UTF8')), 'hex');

create table if not exists public.automatizacion (
  id int primary key default 1 check (id = 1),
  secreto_hash text,
  ultima_sync_en timestamptz,
  ultima_sync_resumen jsonb
);
insert into public.automatizacion (id) values (1) on conflict (id) do nothing;
alter table public.automatizacion enable row level security;
revoke all on public.automatizacion from anon, authenticated;
-- La administración ve cuándo fue la última sincronización, nunca la clave.
grant select (id, ultima_sync_en, ultima_sync_resumen) on public.automatizacion to authenticated;
drop policy if exists automatizacion_ver on public.automatizacion;
create policy automatizacion_ver on public.automatizacion for select to authenticated
  using (public.es_admin());

create table if not exists public.notificaciones (
  clave text primary key,
  tipo text not null,
  evento_id uuid references public.eventos (id) on delete cascade,
  postulacion_id uuid references public.postulaciones (id) on delete cascade,
  enviado_en timestamptz not null default now()
);
create index if not exists notificaciones_evento_idx on public.notificaciones (evento_id, tipo);
create index if not exists notificaciones_post_idx on public.notificaciones (postulacion_id, tipo);
alter table public.notificaciones enable row level security;     -- sin políticas: no se lee desde la web
revoke all on public.notificaciones from anon, authenticated;

create or replace function public.exigir_secreto(secreto text) returns void
language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  select a.secreto_hash into h from public.automatizacion a where a.id = 1;
  if h is null then
    raise exception 'La automatización no está configurada' using errcode = '28000';
  end if;
  if secreto is null or encode(sha256(convert_to(secreto, 'UTF8')), 'hex') <> h then
    perform pg_sleep(0.5);                      -- frena los intentos de adivinar
    raise exception 'No autorizado' using errcode = '28000';
  end if;
end $$;

-- Un evento con todo lo que necesitan los correos.
create or replace function public.json_evento(ev uuid, ahora timestamptz default now()) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nombre', e.nombre, 'fecha', e.fecha,
    'hora_inicio', to_char(e.hora_inicio, 'HH24:MI'), 'hora_fin', to_char(e.hora_fin, 'HH24:MI'),
    'lugar', e.lugar, 'comuna', e.comuna, 'dias', s.dias_restantes, 'semaforo', s.semaforo,
    'necesarios', s.baristas_necesarios, 'asignados', s.asignados, 'reconfirmados', s.reconfirmados,
    'faltan', s.faltan, 'postulantes', s.postulantes, 'grupo_wsp', s.grupo_wsp,
    'pago_liquido', v.pago_liquido, 'monto_boleta', v.monto_boleta,
    'asistentes', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', b.nombre, 'telefono', b.telefono,
                                          'reconfirmo', p.asistencia_confirmada_en is not null) order by b.nombre)
      from public.postulaciones p join public.baristas b on b.id = p.barista_id
      where p.evento_id = e.id and p.estado = 'confirmada'), '[]'::jsonb))
  from public.eventos e
  join public.seguimiento_en(ahora) s on s.evento_id = e.id
  join public.eventos_vista v on v.id = e.id
  where e.id = ev;
$$;

-- Qué correos tocan «ahora». No sabe nada de si ya se enviaron: eso lo filtra la clave
-- (cada correo tiene una clave única; los ya enviados están en notificaciones).
--   recordatorio_reconfirmar  al barista asignado que no confirmó: a 7, 6 y 5 días (9:00 a
--                             20:00, uno por día).
--   vacante                   a los baristas que aceptaron avisos, 12 horas después del tercer
--                             recordatorio sin respuesta (hacia los 4 días y medio).
--   evento_nuevo              a los baristas que aceptaron avisos y no están asignados: el evento
--                             se acaba de abrir a la inscripción (a config.dias_publicacion días,
--                             14 por defecto) y tiene cupos. No sale si quedan config.dias_vacante_cupos
--                             días o menos: ahí corresponde el aviso de vacante.
--   vacante_cupos            (tipo vacante) lo mismo cuando los cupos nunca se llenaron: a
--                             config.dias_vacante_cupos días del evento (5; 0 lo apaga).
--   vacante_admin             lo mismo, para la administración.
--   estado_semana             a la administración, el día en que un evento queda a 7 días:
--                             estado de todos los eventos de los próximos 7 días.
--   evento_ok                 a la administración, cuando un evento (a 7 días o menos) queda
--                             con todos reconfirmados. Trae a quién agregar al grupo de WhatsApp.
--   grupo_wsp                 recordatorio (hasta 2) si falta crear el grupo.
--   alerta4                   a la administración: a 4 días o menos y el evento no está OK.
--   boleta                    al barista, después del evento (al día siguiente, y a los 4 y 8
--                             días) mientras no avise que emitió su boleta de honorarios.
--   pago                      al barista, cuando se registra su pago.
--   resumen_cierre            a la administración, cada día que haya boletas por revisar o
--                             cierres atrasados.
create or replace function public.calcular_notificaciones(ahora timestamptz default now())
returns table (clave text, tipo text, para jsonb, datos jsonb, evento_id uuid, postulacion_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  local_ahora timestamp := ahora at time zone 'America/Santiago';
  hoy date := local_ahora::date;
  ventana boolean := extract(hour from local_ahora) between 9 and 20;
  admins_para jsonb := (select coalesce(jsonb_agg(jsonb_build_object('email', a.email, 'nombre', 'Sepia Coffee')), '[]'::jsonb)
                        from public.admins a);
begin
  -- 1. Recordatorios para reconfirmar
  return query
  select ('recordatorio:' || p.id || ':' || (r.enviados + 1))::text, 'recordatorio_reconfirmar'::text,
         jsonb_build_array(jsonb_build_object('email', b.correo, 'nombre', b.nombre)),
         jsonb_build_object('paso', r.enviados + 1, 'barista', b.nombre, 'evento', e.nombre, 'fecha', e.fecha,
           'hora_inicio', to_char(e.hora_inicio, 'HH24:MI'), 'hora_fin', to_char(e.hora_fin, 'HH24:MI'),
           'lugar', e.lugar, 'comuna', e.comuna, 'dias', (e.fecha - hoy),
           'pago_liquido', v.pago_liquido, 'monto_boleta', v.monto_boleta),
         e.id, p.id
  from public.postulaciones p
  join public.eventos e on e.id = p.evento_id
  join public.eventos_vista v on v.id = e.id
  join public.baristas b on b.id = p.barista_id
  cross join lateral (
    select count(*) as enviados, max(n.enviado_en) as ultimo
    from public.notificaciones n
    where n.postulacion_id = p.id and n.tipo = 'recordatorio_reconfirmar'
  ) r
  where ventana and p.estado = 'confirmada' and p.asistencia_confirmada_en is null
    and e.estado in ('abierto', 'cerrado') and e.fecha >= hoy
    and r.enviados < 3 and (e.fecha - hoy) <= 7 - r.enviados
    and (r.ultimo is null or (r.ultimo at time zone 'America/Santiago')::date < hoy);

  -- 2. Vacante: 12 horas después del tercer recordatorio sin respuesta
  return query
  with sin_respuesta as (
    select distinct e.id as ev
    from public.postulaciones p
    join public.eventos e on e.id = p.evento_id
    join public.notificaciones n on n.postulacion_id = p.id and n.clave = 'recordatorio:' || p.id || ':3'
    where p.estado = 'confirmada' and p.asistencia_confirmada_en is null
      and e.estado in ('abierto', 'cerrado') and e.fecha >= hoy
      and n.enviado_en <= ahora - interval '12 hours'
  ), base as (
    select e.id, e.estado, public.json_evento(e.id, ahora) || jsonb_build_object(
             'vacantes', e.baristas_necesarios - (select count(*) from public.postulaciones p
                where p.evento_id = e.id and p.estado = 'confirmada' and p.asistencia_confirmada_en is not null),
             'sin_reconfirmar', coalesce((select jsonb_agg(b.nombre order by b.nombre)
                from public.postulaciones p join public.baristas b on b.id = p.barista_id
                where p.evento_id = e.id and p.estado = 'confirmada' and p.asistencia_confirmada_en is null), '[]'::jsonb)) as datos,
           d.lista
    from sin_respuesta s
    join public.eventos e on e.id = s.ev
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object('email', b.correo, 'nombre', b.nombre)), '[]'::jsonb) as lista
      from public.baristas b
      where b.acepta_avisos and not exists (
        select 1 from public.postulaciones p2
        where p2.evento_id = e.id and p2.barista_id = b.id and p2.estado = 'confirmada')
    ) d
  )
  select ('vacante:' || x.id)::text, 'vacante'::text, x.lista, x.datos, x.id, null::uuid
  from base x where x.estado = 'abierto' and jsonb_array_length(x.lista) > 0
  union all
  select ('vacante_admin:' || x.id)::text, 'vacante_admin'::text, admins_para,
         x.datos || jsonb_build_object('destinatarios', jsonb_array_length(x.lista), 'abierto', x.estado = 'abierto'),
         x.id, null::uuid
  from base x;

  -- 2a. El evento se abre a la inscripción (entra en la ventana de publicación)
  return query
  select ('evento_nuevo:' || s.evento_id)::text, 'evento_nuevo'::text, d.lista,
         public.json_evento(s.evento_id, ahora) || jsonb_build_object('vacantes', s.faltan, 'dias_publicacion', cfg.dias_publicacion),
         s.evento_id, null::uuid
  from public.seguimiento_en(ahora) s
  cross join public.config cfg
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('email', b.correo, 'nombre', b.nombre)), '[]'::jsonb) as lista
    from public.baristas b
    where b.acepta_avisos and not exists (
      select 1 from public.postulaciones p2
      where p2.evento_id = s.evento_id and p2.barista_id = b.id and p2.estado = 'confirmada')
  ) d
  where ventana and cfg.avisar_eventos_nuevos and s.estado = 'abierto' and s.semaforo is not null and s.faltan > 0
    and s.dias_restantes between 1 and cfg.dias_publicacion and s.dias_restantes > cfg.dias_vacante_cupos
    and jsonb_array_length(d.lista) > 0;

  -- 2b. Cupos que nunca se llenaron: a config.dias_vacante_cupos días del evento (por defecto 5)
  return query
  select ('vacante_cupos:' || s.evento_id)::text, 'vacante'::text, d.lista,
         public.json_evento(s.evento_id, ahora) || jsonb_build_object(
           'vacantes', s.faltan, 'sin_reconfirmar', '[]'::jsonb, 'motivo', 'cupos'),
         s.evento_id, null::uuid
  from public.seguimiento_en(ahora) s
  cross join public.config cfg
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('email', b.correo, 'nombre', b.nombre)), '[]'::jsonb) as lista
    from public.baristas b
    where b.acepta_avisos and not exists (
      select 1 from public.postulaciones p2
      where p2.evento_id = s.evento_id and p2.barista_id = b.id and p2.estado = 'confirmada')
  ) d
  where ventana and s.estado = 'abierto' and s.semaforo is not null and s.faltan > 0
    and cfg.dias_vacante_cupos > 0 and s.dias_restantes between 1 and cfg.dias_vacante_cupos
    and jsonb_array_length(d.lista) > 0;

  -- 3. Estado de la semana: el día en que algún evento queda a 7 días
  return query
  select ('estado_semana:' || hoy)::text, 'estado_semana'::text, admins_para,
         jsonb_build_object('hoy', hoy, 'eventos', (
           select jsonb_agg(public.json_evento(s.evento_id, ahora) order by s.fecha, s.hora_inicio)
           from public.seguimiento_en(ahora) s
           where s.semaforo is not null and s.dias_restantes between 0 and 7)),
         null::uuid, null::uuid
  where ventana and exists (
    select 1 from public.seguimiento_en(ahora) s where s.semaforo is not null and s.dias_restantes = 7);

  -- 4. Evento OK (a 7 días o menos, cupos completos y todos reconfirmados)
  return query
  select ('evento_ok:' || s.evento_id)::text, 'evento_ok'::text, admins_para, public.json_evento(s.evento_id, ahora),
         s.evento_id, null::uuid
  from public.seguimiento_en(ahora) s
  where ventana and s.semaforo = 'ok' and s.dias_restantes between 0 and 7;

  -- 5. Recordatorio para crear el grupo de WhatsApp (hasta 2, uno por día)
  return query
  select ('grupo_wsp:' || s.evento_id || ':' || (g.n + 1))::text, 'grupo_wsp'::text, admins_para,
         public.json_evento(s.evento_id, ahora), s.evento_id, null::uuid
  from public.seguimiento_en(ahora) s
  cross join lateral (
    select count(*) filter (where n.tipo = 'grupo_wsp') as n, max(n.enviado_en) as ultimo,
           coalesce(bool_or(n.tipo = 'evento_ok'), false) as hay_ok
    from public.notificaciones n where n.evento_id = s.evento_id and n.tipo in ('evento_ok', 'grupo_wsp')
  ) g
  where ventana and s.semaforo = 'ok' and not s.grupo_wsp and s.dias_restantes between 1 and 7
    and g.hay_ok and g.n < 2 and (g.ultimo at time zone 'America/Santiago')::date < hoy;

  -- 6. A 4 días o menos y el evento no está OK
  return query
  select ('alerta4:' || s.evento_id)::text, 'alerta4'::text, admins_para, public.json_evento(s.evento_id, ahora),
         s.evento_id, null::uuid
  from public.seguimiento_en(ahora) s
  where ventana and s.semaforo is not null and s.semaforo <> 'ok' and s.dias_restantes between 0 and 4;

  -- 7. Después del evento: pedir la boleta de honorarios (día 1, 4 y 8)
  return query
  select ('boleta:' || p.id || ':' || (r.enviados + 1))::text, 'boleta'::text,
         jsonb_build_array(jsonb_build_object('email', b.correo, 'nombre', b.nombre)),
         jsonb_build_object('paso', r.enviados + 1, 'barista', b.nombre, 'evento', e.nombre, 'fecha', e.fecha,
           'pago_liquido', v.pago_liquido, 'monto_boleta', v.monto_boleta, 'retencion', cfg.retencion),
         e.id, p.id
  from public.postulaciones p
  join public.eventos e on e.id = p.evento_id
  join public.eventos_vista v on v.id = e.id
  join public.baristas b on b.id = p.barista_id
  cross join public.config cfg
  cross join lateral (
    select count(*) as enviados, max(n.enviado_en) as ultimo
    from public.notificaciones n where n.postulacion_id = p.id and n.tipo = 'boleta'
  ) r
  where ventana and p.estado = 'confirmada' and e.estado <> 'cancelado' and e.fecha < hoy
    and p.boleta_declarada_en is null and p.boleta_honorarios_recibida_en is null and p.honorarios_pagados_en is null
    and r.enviados < 3 and (hoy - e.fecha) >= 1 + 3 * r.enviados
    and (r.ultimo is null or (r.ultimo at time zone 'America/Santiago')::date < hoy);

  -- 8. Aviso de pago al barista (solo pagos registrados en los últimos 3 días)
  return query
  select ('pago:' || p.id)::text, 'pago'::text,
         jsonb_build_array(jsonb_build_object('email', b.correo, 'nombre', b.nombre)),
         jsonb_build_object('barista', b.nombre, 'evento', e.nombre, 'fecha', e.fecha,
           'pago_liquido', v.pago_liquido, 'pagado_en', p.honorarios_pagados_en),
         e.id, p.id
  from public.postulaciones p
  join public.eventos e on e.id = p.evento_id
  join public.eventos_vista v on v.id = e.id
  join public.baristas b on b.id = p.barista_id
  where p.estado = 'confirmada' and p.honorarios_pagados_en is not null
    and p.honorarios_pagados_en >= hoy - 3;

  -- 9. Resumen de cierre para la administración
  return query
  select ('resumen_cierre:' || hoy)::text, 'resumen_cierre'::text, admins_para,
         jsonb_build_object('hoy', hoy,
           'boletas', coalesce((
             select jsonb_agg(jsonb_build_object('evento', e.nombre, 'fecha', e.fecha, 'barista', b.nombre, 'rut', b.rut,
                'folio', p.boleta_declarada_folio, 'declarada_en', p.boleta_declarada_en,
                'monto_boleta', v.monto_boleta, 'pago_liquido', v.pago_liquido) order by e.fecha, b.nombre)
             from public.postulaciones p
             join public.eventos e on e.id = p.evento_id
             join public.eventos_vista v on v.id = e.id
             join public.baristas b on b.id = p.barista_id
             where p.estado = 'confirmada' and p.boleta_declarada_en is not null and p.honorarios_pagados_en is null), '[]'::jsonb),
           'atrasados', coalesce((
             select jsonb_agg(jsonb_build_object('evento', s.nombre, 'fecha', s.fecha, 'dias', s.dias_desde_evento,
                'boletas_pendientes', s.boletas_pendientes, 'pagos_pendientes', s.pagos_pendientes,
                'documento_cliente_pendiente', s.documento_cliente_pendiente) order by s.fecha)
             from public.seguimiento_en(ahora) s where s.cierre_atrasado), '[]'::jsonb)),
         null::uuid, null::uuid
  where ventana and (
    exists (select 1 from public.postulaciones p where p.estado = 'confirmada'
            and p.boleta_declarada_en is not null and p.honorarios_pagados_en is null)
    or exists (select 1 from public.seguimiento_en(ahora) s where s.cierre_atrasado));
end $$;

-- Interfaz para el script. Todas piden la clave y se pueden llamar sin sesión.
create or replace function public.api_pendientes(secreto text, ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_secreto(secreto);
  return coalesce((
    select jsonb_agg(jsonb_build_object('clave', c.clave, 'tipo', c.tipo, 'para', c.para, 'datos', c.datos) order by c.clave)
    from public.calcular_notificaciones(ahora) c
    where not exists (select 1 from public.notificaciones n where n.clave = c.clave)), '[]'::jsonb);
end $$;

create or replace function public.api_marcar(secreto text, claves jsonb, ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.exigir_secreto(secreto);
  with ins as (
    insert into public.notificaciones (clave, tipo, evento_id, postulacion_id, enviado_en)
    select c.clave, c.tipo, c.evento_id, c.postulacion_id, ahora
    from public.calcular_notificaciones(ahora) c
    where c.clave in (select jsonb_array_elements_text(claves))
    on conflict (clave) do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- Sincroniza los eventos del calendario. Cada elemento de «eventos» trae: gcal_id, nombre,
-- fecha, hora_inicio, hora_fin, lugar, comuna, descripcion, baristas, pago_manual, cliente,
-- revisar, revisar_motivo. Crea los nuevos (abiertos, para que se inscriban), actualiza fecha
-- y horario de los que ya existen y cancela los que se borraron del calendario dentro de
-- [desde, hasta]. Nunca pisa lo que se editó a mano (nombre, pago, cupos, dirección).
create or replace function public.api_importar(secreto text, eventos jsonb, desde date, hasta date,
                                               ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x jsonb; r record; ev uuid; gid text; f date; hi time; hf time; com text; lug text;
  creados text[] := '{}'; cambiados text[] := '{}'; cancelados text[] := '{}'; por_revisar text[] := '{}';
  errores jsonb := '[]'::jsonb; advertencia text; resumen jsonb;
  hoy date := (ahora at time zone 'America/Santiago')::date;
  lista jsonb := coalesce(eventos, '[]'::jsonb);
  vigentes int; a_cancelar int;
begin
  perform public.exigir_secreto(secreto);
  for x in select * from jsonb_array_elements(lista) loop
    begin
      gid := x ->> 'gcal_id';
      f := (x ->> 'fecha')::date; hi := (x ->> 'hora_inicio')::time; hf := (x ->> 'hora_fin')::time;
      com := coalesce(nullif(btrim(x ->> 'comuna'), ''), 'Por confirmar');
      lug := left(nullif(btrim(x ->> 'lugar'), ''), 120);
      ev := (select s.evento_id from public.evento_seguimiento s where s.gcal_id = gid);
      if ev is null then      -- adopta un evento cargado a mano con el mismo día y horario
        ev := (select e.id from public.eventos e
               left join public.evento_seguimiento s on s.evento_id = e.id
               where s.gcal_id is null and e.fecha = f and e.hora_inicio = hi and e.hora_fin = hf
               order by e.creado_en limit 1);
        if ev is not null then
          insert into public.evento_seguimiento (evento_id, gcal_id, origen) values (ev, gid, 'calendario')
          on conflict (evento_id) do update set gcal_id = excluded.gcal_id, origen = 'calendario';
        end if;
      end if;

      if ev is null then
        insert into public.eventos (nombre, fecha, hora_inicio, hora_fin, comuna, lugar, descripcion,
                                    baristas_necesarios, pago_manual, estado)
        values (left(x ->> 'nombre', 120), f, hi, hf, com, lug, left(nullif(x ->> 'descripcion', ''), 800),
                greatest(coalesce((x ->> 'baristas')::int, 2), 1), nullif(x ->> 'pago_manual', '')::int, 'abierto')
        returning id into ev;
        insert into public.evento_seguimiento (evento_id, gcal_id, origen, revisar, revisar_motivo)
        values (ev, gid, 'calendario', coalesce((x ->> 'revisar')::boolean, false), left(x ->> 'revisar_motivo', 200));
        if nullif(x ->> 'cliente', '') is not null then
          insert into public.evento_privado (evento_id, cliente) values (ev, left(x ->> 'cliente', 120))
          on conflict (evento_id) do nothing;
        end if;
        insert into public.evento_direcciones (evento_id, direccion, indicaciones)
        values (ev, left(coalesce(lug, 'Por confirmar') || ', ' || com, 200), 'Dirección exacta por confirmar')
        on conflict (evento_id) do nothing;
        creados := creados || (x ->> 'nombre');
        if coalesce((x ->> 'revisar')::boolean, false) then por_revisar := por_revisar || (x ->> 'nombre'); end if;
      else
        select * into r from public.eventos e where e.id = ev;
        if r.fecha <> f or r.hora_inicio <> hi or r.hora_fin <> hf then
          update public.eventos set fecha = f, hora_inicio = hi, hora_fin = hf where id = ev;
          insert into public.evento_seguimiento (evento_id, gcal_id, origen, revisar, revisar_motivo)
          values (ev, gid, 'calendario', true, 'Cambió la fecha o el horario en el calendario')
          on conflict (evento_id) do update set revisar = true, revisar_motivo = excluded.revisar_motivo;
          cambiados := cambiados || r.nombre;
        end if;
        if r.comuna = 'Por confirmar' and com <> 'Por confirmar' then
          update public.eventos set comuna = com where id = ev;
        end if;
        if r.estado = 'cancelado' then      -- volvió a aparecer en el calendario
          update public.eventos set estado = 'abierto' where id = ev;
          update public.evento_seguimiento set revisar = true, revisar_motivo = 'Volvió a aparecer en el calendario' where evento_id = ev;
          cambiados := cambiados || r.nombre;
        end if;
        if nullif(x ->> 'cliente', '') is not null then
          insert into public.evento_privado (evento_id, cliente) values (ev, left(x ->> 'cliente', 120))
          on conflict (evento_id) do update set cliente = coalesce(public.evento_privado.cliente, excluded.cliente);
        end if;
      end if;
    exception when others then
      errores := errores || jsonb_build_object('gcal_id', gid, 'error', sqlerrm);
    end;
  end loop;

  -- Cancelar lo que se borró del calendario (con dos resguardos contra un calendario leído a medias)
  select count(*) into vigentes from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id
   where s.origen = 'calendario' and s.gcal_id is not null and e.estado <> 'cancelado'
     and e.fecha >= greatest(hoy, desde) and e.fecha <= hasta;
  select count(*) into a_cancelar from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id
   where s.origen = 'calendario' and s.gcal_id is not null and e.estado <> 'cancelado'
     and e.fecha >= greatest(hoy, desde) and e.fecha <= hasta
     and not exists (select 1 from jsonb_array_elements(lista) y where y ->> 'gcal_id' = s.gcal_id);
  if jsonb_array_length(lista) = 0 and vigentes > 0 then
    advertencia := 'El calendario llegó vacío: no se canceló nada.';
  elsif a_cancelar > 3 and a_cancelar * 2 > vigentes then
    advertencia := 'Se iban a cancelar ' || a_cancelar || ' de ' || vigentes || ' eventos: no se canceló nada. Revisa el calendario.';
  else
    for r in select e.id, e.nombre from public.eventos e join public.evento_seguimiento s on s.evento_id = e.id
             where s.origen = 'calendario' and s.gcal_id is not null and e.estado <> 'cancelado'
               and e.fecha >= greatest(hoy, desde) and e.fecha <= hasta
               and not exists (select 1 from jsonb_array_elements(lista) y where y ->> 'gcal_id' = s.gcal_id)
    loop
      update public.eventos set estado = 'cancelado' where id = r.id;
      update public.evento_seguimiento set revisar = true, revisar_motivo = 'Se borró del calendario' where evento_id = r.id;
      cancelados := cancelados || r.nombre;
    end loop;
  end if;

  resumen := jsonb_build_object('recibidos', jsonb_array_length(lista), 'creados', to_jsonb(creados),
    'cambiados', to_jsonb(cambiados), 'cancelados', to_jsonb(cancelados), 'por_revisar', to_jsonb(por_revisar),
    'errores', errores, 'advertencia', advertencia);
  update public.automatizacion set ultima_sync_en = ahora, ultima_sync_resumen = resumen where id = 1;
  return resumen;
end $$;

-- Solo el script (con la clave) puede llamarlas; nadie más ejecuta estas funciones.
revoke all on function public.exigir_secreto(text) from public, anon, authenticated;
revoke all on function public.json_evento(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.calcular_notificaciones(timestamptz) from public, anon, authenticated;
revoke all on function public.api_pendientes(text, timestamptz) from public;
revoke all on function public.api_marcar(text, jsonb, timestamptz) from public;
revoke all on function public.api_importar(text, jsonb, date, date, timestamptz) from public;
grant execute on function public.api_pendientes(text, timestamptz) to anon, authenticated;
grant execute on function public.api_marcar(text, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.api_importar(text, jsonb, date, date, timestamptz) to anon, authenticated;

-- Las funciones de las políticas solo las ejecuta quien inició sesión.
revoke all on function public.es_admin() from public, anon;
revoke all on function public.es_barista() from public, anon;
revoke all on function public.tiene_postulacion(uuid) from public, anon;
revoke all on function public.esta_confirmado(uuid) from public, anon;
revoke all on function public.evento_abierto(uuid) from public, anon;
revoke all on function public.dentro_de_publicacion(date) from public, anon;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_barista() to authenticated;
grant execute on function public.tiene_postulacion(uuid) to authenticated;
grant execute on function public.esta_confirmado(uuid) to authenticated;
grant execute on function public.evento_abierto(uuid) to authenticated;
grant execute on function public.dentro_de_publicacion(date) to authenticated;
