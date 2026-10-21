-- SEPIA COFFEE · portal de baristas · esquema para Supabase
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO esto → Run.
-- Se puede volver a correr sin romper nada ni borrar datos.
--
-- Qué guarda y quién lo ve:
--   accesos ......... el ID y la clave de cada barista (los crea la administración).
--                     Cada barista ve solo el suyo.
--   baristas ........ datos personales y bancarios, talla de camisa, camioneta y
--                     foto. Cada barista ve SOLO los suyos. Los ve también la
--                     persona administradora. El equipo ve de los demás solo
--                     nombre y foto (ranking y equipo de cada evento).
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
-- Traslado con camioneta (reembolso aparte, no son honorarios): bencina = km ÷ rendimiento × precio.
alter table public.config add column if not exists rendimiento_km_l numeric not null default 10 check (rendimiento_km_l > 0);
alter table public.config add column if not exists precio_litro int not null default 1400 check (precio_litro >= 0);
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
-- 2b. Accesos: ID y clave de cada barista
-- ---------------------------------------------------------------------------
-- Los baristas entran con un ID (por ejemplo camila.perez) y una clave. La administración los
-- crea (crear_acceso, más abajo) y entrega una clave temporal que la persona cambia al entrar.
-- Por dentro el ID es un «correo» inventado (id@equipo.sepiacoffee.cl) que no recibe mensajes.
-- Sin una fila activa acá nadie es barista: aunque alguien se cree una cuenta por su lado, no ve nada.
create table if not exists public.accesos (
  id uuid primary key references auth.users (id) on delete cascade,
  usuario text not null unique check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  nombre text not null check (char_length(btrim(nombre)) between 3 and 100),
  activo boolean not null default true,
  debe_cambiar_clave boolean not null default true,
  creado_en timestamptz not null default now(),
  clave_cambiada_en timestamptz
);
alter table public.accesos enable row level security;
revoke all on public.accesos from anon, authenticated;
grant select on public.accesos to authenticated;
drop policy if exists accesos_ver on public.accesos;
create policy accesos_ver on public.accesos for select to authenticated
  using (id = auth.uid() or public.es_admin());

create or replace function public.tiene_acceso_activo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.accesos a where a.id = auth.uid() and a.activo);
$$;

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
-- Perfil del equipo: talla de camisa, si tiene camioneta para llevar el carrito, foto (opcional,
-- en el almacenamiento «perfiles», siempre dentro de su propia carpeta) y los turnos que ya tenía
-- antes del portal (los pone la administración: cuentan en el ranking acumulado).
alter table public.baristas add column if not exists talla_camisa text check (talla_camisa is null or talla_camisa in ('XS', 'S', 'M', 'L', 'XL', 'XXL'));
alter table public.baristas add column if not exists tiene_camioneta boolean not null default false;
alter table public.baristas add column if not exists foto_path text;
alter table public.baristas add column if not exists turnos_previos int not null default 0 check (turnos_previos between 0 and 5000);
alter table public.baristas drop constraint if exists baristas_foto_path_check;
alter table public.baristas add constraint baristas_foto_path_check
  check (foto_path is null or foto_path ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,80}$'));

-- El texto que aceptó y la fecha los pone el servidor, no el navegador.
create or replace function public.t_baristas_antes() returns trigger
language plpgsql set search_path = '' as $$
declare
  admin_o_servicio boolean := (auth.uid() is null) or public.es_admin();   -- editor SQL o administración
begin
  new.correo := lower(new.correo);
  new.rut := public.rut_formato(new.rut);
  if tg_op = 'INSERT' then
    new.acepta_boleta_texto := (select c.texto_boleta from public.config c where c.id = 1);
    new.aceptado_en := now();
    new.creado_en := now();
    new.actualizado_en := now();
    if not admin_o_servicio then new.turnos_previos := 0; end if;
  else
    if new.id <> old.id then raise exception 'No se puede cambiar el id'; end if;
    if not admin_o_servicio then new.turnos_previos := old.turnos_previos; end if;
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

-- Es barista quien tiene su perfil Y su acceso está activo (si se desactiva, deja de ver todo).
create or replace function public.es_barista() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.baristas b join public.accesos a on a.id = b.id
                 where b.id = auth.uid() and a.activo);
$$;

alter table public.baristas enable row level security;
revoke all on public.baristas from anon;
grant select, insert, update, delete on public.baristas to authenticated;

drop policy if exists baristas_ver on public.baristas;
create policy baristas_ver on public.baristas for select to authenticated
  using ((id = auth.uid() and public.tiene_acceso_activo()) or public.es_admin());
drop policy if exists baristas_crear on public.baristas;
create policy baristas_crear on public.baristas for insert to authenticated
  with check (id = auth.uid() and public.tiene_acceso_activo());
drop policy if exists baristas_editar on public.baristas;
create policy baristas_editar on public.baristas for update to authenticated
  using (id = auth.uid() and public.tiene_acceso_activo())
  with check (id = auth.uid());
-- La administración corrige datos del equipo (por ejemplo, los turnos previos al portal).
drop policy if exists baristas_admin_editar on public.baristas;
create policy baristas_admin_editar on public.baristas for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
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

-- ¿El evento necesita a alguien que lleve el carrito en camioneta? (lo ven todos los baristas)
alter table public.eventos add column if not exists requiere_camioneta boolean not null default false;

-- Solo la administración: cliente, contacto y notas internas.
create table if not exists public.evento_privado (
  evento_id uuid primary key references public.eventos (id) on delete cascade,
  cliente text check (cliente is null or char_length(cliente) <= 120),
  contacto text check (contacto is null or char_length(contacto) <= 200),
  notas text check (notas is null or char_length(notas) <= 1000)
);

-- Solo la administración: kilómetros del recorrido (ida y vuelta) y TAG/peajes estimados, para calcular
-- el reembolso de la camioneta. El conductor ve únicamente su monto (función traslados()).
create table if not exists public.evento_traslado (
  evento_id uuid primary key references public.eventos (id) on delete cascade,
  km numeric check (km is null or (km >= 0 and km <= 3000)),
  tag int check (tag is null or (tag >= 0 and tag <= 1000000))
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
-- Registro de la administración después del evento: si la persona asistió (cuenta en el ranking),
-- y si fue la conductora de la camioneta (solo una por evento y con camioneta declarada), con el
-- estacionamiento que se agrega al reembolso y la fecha en que se le pagó.
alter table public.postulaciones add column if not exists asistio boolean;
alter table public.postulaciones add column if not exists conductor boolean not null default false;
alter table public.postulaciones add column if not exists traslado_estacionamiento int check (traslado_estacionamiento is null or (traslado_estacionamiento >= 0 and traslado_estacionamiento <= 1000000));
alter table public.postulaciones add column if not exists traslado_pagado_en date;
create index if not exists postulaciones_barista_idx on public.postulaciones (barista_id);
create unique index if not exists postulaciones_conductor_idx on public.postulaciones (evento_id) where conductor;

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
      new.asistio := null;
      new.conductor := false;
      new.traslado_estacionamiento := null;
      new.traslado_pagado_en := null;
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
    if new.asistio is distinct from old.asistio or new.conductor is distinct from old.conductor
       or new.traslado_estacionamiento is distinct from old.traslado_estacionamiento
       or new.traslado_pagado_en is distinct from old.traslado_pagado_en then
      raise exception 'La asistencia y el traslado los registra Sepia Coffee';
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

  -- Conductor: solo alguien asignado que declaró camioneta.
  if new.estado <> 'confirmada' then
    new.conductor := false;
    new.asistio := null;
  elsif new.conductor and not coalesce((select b.tiene_camioneta from public.baristas b where b.id = new.barista_id), false) then
    raise exception 'Esa persona no declaró tener camioneta';
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
  using ((barista_id = auth.uid() and public.es_barista()) or public.es_admin());
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

-- Se vuelve a crear en cada corrida: así toma las columnas nuevas de eventos.
drop view if exists public.eventos_vista;
create view public.eventos_vista with (security_invoker = true) as
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
      where b.acepta_avisos and exists (select 1 from public.accesos ac where ac.id = b.id and ac.activo) and not exists (
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
    where b.acepta_avisos and exists (select 1 from public.accesos ac where ac.id = b.id and ac.activo) and not exists (
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
    where b.acepta_avisos and exists (select 1 from public.accesos ac where ac.id = b.id and ac.activo) and not exists (
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

-- ---------------------------------------------------------------------------
-- 10. Accesos con ID y clave, equipo, ranking y traslados
-- ---------------------------------------------------------------------------
-- Las funciones de acceso las puede ejecutar solo la administración (o el editor SQL de Supabase).
-- El ID se convierte en el «correo» id@equipo.sepiacoffee.cl; ese dominio está también en
-- assets/sepia-baristas.js (DOMINIO_ACCESO): si lo cambias, cámbialo en los dos lados.
-- La clave se guarda con bcrypt, igual que lo hace Supabase Auth.

create or replace function public.clave_temporal() returns text
language plpgsql security definer set search_path = '' as $$
declare
  alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';   -- sin letras que se confunden
  b bytea := extensions.gen_random_bytes(12);
  s text := '';
  i int;
begin
  for i in 0..11 loop
    s := s || substr(alfabeto, 1 + (get_byte(b, i) % 31), 1);
    if i in (3, 7) then s := s || '-'; end if;
  end loop;
  return s;
end $$;

create or replace function public.crear_acceso(p_usuario text, p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u text := lower(btrim(coalesce(p_usuario, '')));
  n text := btrim(coalesce(p_nombre, ''));
  uid uuid := gen_random_uuid();
  clave text := public.clave_temporal();
  correo text;
  cols text := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at';
  vals text;
  c text;
begin
  if not (auth.uid() is null or public.es_admin()) then
    raise exception 'Solo la administración crea accesos' using errcode = '42501';
  end if;
  if u !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'El ID debe tener de 3 a 30 caracteres: letras sin tilde, números, punto, guion o guion bajo.';
  end if;
  if char_length(n) < 3 or char_length(n) > 100 then
    raise exception 'Escribe el nombre de la persona.';
  end if;
  correo := u || '@equipo.sepiacoffee.cl';
  if exists (select 1 from public.accesos a where a.usuario = u) or exists (select 1 from auth.users x where x.email = correo) then
    raise exception 'Ese ID ya existe. Prueba con otro.';
  end if;
  vals := format('%L, %L, %L, %L, %L, %L, now(), %L::jsonb, %L::jsonb, now(), now()',
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', correo,
    extensions.crypt(clave, extensions.gen_salt('bf')),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('usuario', u, 'nombre', n)::text);
  -- Columnas de tokens: Supabase Auth necesita texto vacío (no NULL) para poder entrar.
  foreach c in array array['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                           'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = c) then
      cols := cols || ', ' || c;
      vals := vals || ', ''''';
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s)', cols, vals);
  insert into auth.identities (user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (uid, jsonb_build_object('sub', uid::text, 'email', correo, 'email_verified', true, 'phone_verified', false),
          'email', uid::text, now(), now(), now());
  insert into public.accesos (id, usuario, nombre) values (uid, u, n);
  perform public.vincular_historial_automatico();               -- si su nombre está en el historial, queda unido
  return jsonb_build_object('id', uid, 'usuario', u, 'clave', clave);
end $$;

create or replace function public.restablecer_clave(p_acceso uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare clave text := public.clave_temporal();
begin
  if not (auth.uid() is null or public.es_admin()) then
    raise exception 'Solo la administración restablece claves' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accesos a where a.id = p_acceso) then raise exception 'No existe ese acceso'; end if;
  update auth.users set encrypted_password = extensions.crypt(clave, extensions.gen_salt('bf')), updated_at = now() where id = p_acceso;
  update public.accesos set debe_cambiar_clave = true where id = p_acceso;
  delete from auth.sessions where user_id = p_acceso;          -- cierra sus sesiones abiertas
  return clave;
end $$;

create or replace function public.cambiar_estado_acceso(p_acceso uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (auth.uid() is null or public.es_admin()) then
    raise exception 'Solo la administración cambia accesos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accesos a where a.id = p_acceso) then raise exception 'No existe ese acceso'; end if;
  update public.accesos set activo = p_activo where id = p_acceso;
  update auth.users set banned_until = case when p_activo then null else now() + interval '100 years' end where id = p_acceso;
  if not p_activo then delete from auth.sessions where user_id = p_acceso; end if;
end $$;

-- Borra a la persona y todos sus datos (acceso, perfil y postulaciones).
create or replace function public.eliminar_acceso(p_acceso uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (auth.uid() is null or public.es_admin()) then
    raise exception 'Solo la administración elimina accesos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accesos a where a.id = p_acceso) then raise exception 'No existe ese acceso'; end if;
  delete from auth.users where id = p_acceso;                  -- borra en cascada acceso, perfil y postulaciones
end $$;

-- La persona avisa que ya cambió su clave temporal (el cambio en sí lo hace Supabase Auth).
create or replace function public.acceso_clave_cambiada() returns void
language sql security definer set search_path = '' as $$
  update public.accesos set debe_cambiar_clave = false, clave_cambiada_en = now() where id = auth.uid();
$$;

-- Equipo de un evento: nombre y foto de los asignados. Lo ven la administración y los asignados al mismo evento.
create or replace function public.equipo_evento(p_evento uuid)
returns table (barista_id uuid, nombre text, foto_path text, conductor boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.nombre, b.foto_path, p.conductor
  from public.postulaciones p
  join public.baristas b on b.id = p.barista_id
  where p.evento_id = p_evento and p.estado = 'confirmada'
    and (public.es_admin() or (public.es_barista() and exists (
          select 1 from public.postulaciones m
          where m.evento_id = p_evento and m.barista_id = auth.uid() and m.estado = 'confirmada')))
  order by b.nombre;
$$;

-- Historial de turnos anteriores al portal (por ejemplo, el año hasta la fecha). Lo carga la administración
-- con una consulta SQL y cuenta en el ranking. Cada fila es un turno de una persona en un evento. Los datos
-- reales NO van en este archivo (el repositorio es público): se cargan aparte, ver LEEME.md.
-- Una fila se «vincula» a un acceso cuando su nombre coincide con el del acceso (sin tildes, sin importar
-- mayúsculas; ver vincular_historial_automatico) o cuando la administración la une a mano.
create or replace function public.nombre_clave(t text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(coalesce(t, '')), 'áéíóúüñàèìòùâêîôû', 'aeiouunaeiouaeiou'), '\s+', ' ', 'g'));
$$;

create table if not exists public.historial_turnos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 100),
  fecha date not null,
  evento text check (evento is null or char_length(evento) <= 150),
  horas numeric(5, 2) check (horas is null or (horas >= 0 and horas <= 24)),
  acceso_id uuid references public.accesos (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists historial_turnos_acceso on public.historial_turnos (acceso_id);
-- Sin duplicados: cargar dos veces el mismo historial no repite turnos.
create unique index if not exists historial_turnos_unico
  on public.historial_turnos (public.nombre_clave(nombre), fecha, public.nombre_clave(coalesce(evento, '')));

alter table public.historial_turnos enable row level security;
revoke all on public.historial_turnos from anon;
grant select, insert, update, delete on public.historial_turnos to authenticated;
drop policy if exists historial_admin on public.historial_turnos;
create policy historial_admin on public.historial_turnos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Une el historial con el acceso cuyo nombre coincide. Primero busca el mismo nombre (sin tildes ni mayúsculas);
-- si no hay, busca un acceso cuyo nombre empiece igual (la hoja dice «Elio Aravena» y el acceso «Elio Aravena
-- Soto»; solo para nombres de al menos dos palabras). Si hay más de un candidato, no adivina: se une a mano.
create or replace function public.vincular_historial_automatico() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not (auth.uid() is null or public.es_admin()) then
    raise exception 'Solo la administración vincula el historial' using errcode = '42501';
  end if;
  with libres as (
    select distinct public.nombre_clave(nombre) as hc from public.historial_turnos where acceso_id is null
  ), candidatos as (
    select l.hc, a.id, (public.nombre_clave(a.nombre) = l.hc) as exacto
    from libres l
    join public.accesos a
      on public.nombre_clave(a.nombre) = l.hc
      or (position(' ' in l.hc) > 0 and left(public.nombre_clave(a.nombre), char_length(l.hc) + 1) = l.hc || ' ')
  ), elegidos as (
    select hc, (array_agg(id))[1] as acceso
    from (select hc, id, exacto, bool_or(exacto) over (partition by hc) as hay_exacto from candidatos) c
    where exacto or not hay_exacto
    group by hc having count(*) = 1
  ), cambios as (
    update public.historial_turnos h set acceso_id = e.acceso
    from elegidos e
    where h.acceso_id is null and public.nombre_clave(h.nombre) = e.hc
    returning 1
  )
  select count(*)::int into n from cambios;
  return n;
end $$;

-- Une (o suelta, con NULL) todo el historial de un nombre a mano. Devuelve cuántos turnos cambió.
create or replace function public.vincular_historial(p_nombre text, p_acceso uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not (auth.uid() is null or public.es_admin()) then
    raise exception 'Solo la administración vincula el historial' using errcode = '42501';
  end if;
  if p_acceso is not null and not exists (select 1 from public.accesos a where a.id = p_acceso) then
    raise exception 'No existe ese acceso';
  end if;
  update public.historial_turnos set acceso_id = p_acceso where public.nombre_clave(nombre) = public.nombre_clave(p_nombre);
  get diagnostics n = row_count;
  return n;
end $$;

-- Turnos del historial por persona. La administración ve a todos (también los sin vincular);
-- cada barista, solo los suyos.
create or replace function public.historial_resumen()
returns table (nombre text, acceso_id uuid, turnos int, desde date, hasta date)
language sql stable security definer set search_path = '' as $$
  select min(h.nombre), h.acceso_id, count(*)::int, min(h.fecha), max(h.fecha)
  from public.historial_turnos h
  where public.es_admin() or (h.acceso_id = auth.uid() and public.es_barista())
  group by public.nombre_clave(h.nombre), h.acceso_id
  order by 1;
$$;

-- Ranking de turnos: el historial, más las asistencias que registra la administración en el portal (y los
-- turnos «previos» sueltos, solo en el acumulado). Los empates comparten puesto. Lo ven los baristas
-- activos y la administración. Aparece cada acceso activo que ya completó su perfil o ya tiene turnos
-- (así, quien viene del historial figura aunque todavía no haya entrado).
create or replace function public.ranking_equipo(p_desde date default null, p_hasta date default null)
returns table (puesto int, barista_id uuid, nombre text, foto_path text, turnos int)
language sql stable security definer set search_path = '' as $$
  with cuenta as (
    select a.id, coalesce(b.nombre, a.nombre) as nombre, b.foto_path, (b.id is not null) as con_perfil,
           (case when p_desde is null and p_hasta is null then coalesce(b.turnos_previos, 0) else 0 end)
           + (select count(*) from public.historial_turnos h
               where h.acceso_id = a.id
                 and (p_desde is null or h.fecha >= p_desde) and (p_hasta is null or h.fecha <= p_hasta))::int
           + (select count(*) from public.postulaciones p
               join public.eventos e on e.id = p.evento_id
               where p.barista_id = a.id and p.estado = 'confirmada' and p.asistio is true and e.estado <> 'cancelado'
                 and (p_desde is null or e.fecha >= p_desde) and (p_hasta is null or e.fecha <= p_hasta))::int as turnos
    from public.accesos a
    left join public.baristas b on b.id = a.id
    where a.activo
  )
  select (rank() over (order by c.turnos desc))::int, c.id, c.nombre, c.foto_path, c.turnos
  from cuenta c
  where (c.con_perfil or c.turnos > 0) and (public.es_barista() or public.es_admin())
  order by 1, c.nombre;
$$;

-- Reembolso de la camioneta del conductor: bencina = km ÷ rendimiento × precio del litro, más TAG y
-- estacionamiento. Es un pago aparte de los honorarios. La administración ve todos; cada conductor, el suyo.
create or replace function public.traslados()
returns table (postulacion_id uuid, evento_id uuid, barista_id uuid, km numeric, tag int, bencina int,
               estacionamiento int, total int, pagado_en date, completo boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.evento_id, p.barista_id, t.km, t.tag,
         case when t.km is null then null else round(t.km / c.rendimiento_km_l * c.precio_litro)::int end,
         coalesce(p.traslado_estacionamiento, 0),
         case when t.km is null or t.tag is null then null
              else round(t.km / c.rendimiento_km_l * c.precio_litro)::int + t.tag + coalesce(p.traslado_estacionamiento, 0) end,
         p.traslado_pagado_en,
         (t.km is not null and t.tag is not null)
  from public.postulaciones p
  left join public.evento_traslado t on t.evento_id = p.evento_id
  cross join public.config c
  where p.conductor and p.estado = 'confirmada'
    and (public.es_admin() or (p.barista_id = auth.uid() and public.es_barista()));
$$;

alter table public.evento_traslado enable row level security;
revoke all on public.evento_traslado from anon;
grant select, insert, update, delete on public.evento_traslado to authenticated;
drop policy if exists traslado_admin on public.evento_traslado;
create policy traslado_admin on public.evento_traslado for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

revoke all on function public.clave_temporal() from public, anon, authenticated;
revoke all on function public.crear_acceso(text, text) from public, anon;
revoke all on function public.restablecer_clave(uuid) from public, anon;
revoke all on function public.cambiar_estado_acceso(uuid, boolean) from public, anon;
revoke all on function public.eliminar_acceso(uuid) from public, anon;
revoke all on function public.acceso_clave_cambiada() from public, anon;
revoke all on function public.equipo_evento(uuid) from public, anon;
revoke all on function public.ranking_equipo(date, date) from public, anon;
revoke all on function public.vincular_historial_automatico() from public, anon, authenticated;
revoke all on function public.vincular_historial(text, uuid) from public, anon;
revoke all on function public.historial_resumen() from public, anon;
revoke all on function public.traslados() from public, anon;
revoke all on function public.tiene_acceso_activo() from public, anon;
grant execute on function public.crear_acceso(text, text) to authenticated;
grant execute on function public.restablecer_clave(uuid) to authenticated;
grant execute on function public.cambiar_estado_acceso(uuid, boolean) to authenticated;
grant execute on function public.eliminar_acceso(uuid) to authenticated;
grant execute on function public.acceso_clave_cambiada() to authenticated;
grant execute on function public.equipo_evento(uuid) to authenticated;
grant execute on function public.ranking_equipo(date, date) to authenticated;
grant execute on function public.vincular_historial(text, uuid) to authenticated;
grant execute on function public.historial_resumen() to authenticated;
grant execute on function public.traslados() to authenticated;
grant execute on function public.tiene_acceso_activo() to authenticated;

-- Fotos de perfil: almacenamiento privado «perfiles», una carpeta por persona (su id).
-- Las ven los baristas activos y la administración; cada uno sube, cambia y borra solo la suya.
do $storage$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('perfiles', 'perfiles', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

    drop policy if exists perfiles_ver on storage.objects;
    create policy perfiles_ver on storage.objects for select to authenticated
      using (bucket_id = 'perfiles' and (public.es_barista() or public.es_admin()));
    drop policy if exists perfiles_subir on storage.objects;
    create policy perfiles_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'perfiles' and (storage.foldername(name))[1] = auth.uid()::text and public.es_barista());
    drop policy if exists perfiles_cambiar on storage.objects;
    create policy perfiles_cambiar on storage.objects for update to authenticated
      using (bucket_id = 'perfiles' and (storage.foldername(name))[1] = auth.uid()::text and public.es_barista())
      with check (bucket_id = 'perfiles' and (storage.foldername(name))[1] = auth.uid()::text);
    drop policy if exists perfiles_borrar on storage.objects;
    create policy perfiles_borrar on storage.objects for delete to authenticated
      using (bucket_id = 'perfiles' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
  end if;
end $storage$;
