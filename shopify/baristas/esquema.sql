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
--   postulaciones ... quién postuló a qué. El barista ve las suyas; confirmar
--                     o rechazar lo hace solo la administración.
--   config .......... tarifas, retención de honorarios y textos legales.
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
  texto_boleta text not null default 'Declaro que puedo emitir boleta de honorarios electrónica por los servicios que preste en los eventos de Sepia Coffee.',
  texto_privacidad text not null default 'Sepia Coffee usa mis datos solo para coordinar los eventos y pagarme. Los ve únicamente Sepia Coffee, y puedo pedir que los borre en cualquier momento.',
  check (medio_max_horas >= corto_max_horas)
);
-- Para bases que ya tenían la tabla sin el tope diario (ver migraciones/).
alter table public.config add column if not exists tope_dia int not null default 70000 check (tope_dia >= 0);
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
  aceptado_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

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

-- ---------------------------------------------------------------------------
-- 5. Postulaciones
-- ---------------------------------------------------------------------------

create table if not exists public.postulaciones (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  barista_id uuid not null references public.baristas (id) on delete cascade,
  estado text not null default 'postulada' check (estado in ('postulada', 'confirmada', 'rechazada', 'retirada')),
  mensaje text check (mensaje is null or char_length(mensaje) <= 400),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (evento_id, barista_id)
);
create index if not exists postulaciones_barista_idx on public.postulaciones (barista_id);

create or replace function public.t_postulaciones_antes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.evento_id <> old.evento_id or new.barista_id <> old.barista_id then
      raise exception 'No se puede cambiar el evento ni el barista';
    end if;
    new.creado_en := old.creado_en;
    new.actualizado_en := now();
    -- Un barista solo puede postular de nuevo o retirarse. Confirmar y
    -- rechazar lo hace la administración (o el editor SQL, sin sesión).
    if auth.uid() is not null and not public.es_admin() then
      if not (
        old.estado = new.estado
        or (old.estado in ('postulada', 'retirada') and new.estado in ('postulada', 'retirada'))
        or (old.estado = 'confirmada' and new.estado = 'retirada')
      ) then
        raise exception 'Ese cambio de estado lo hace Sepia Coffee';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists postulaciones_antes on public.postulaciones;
create trigger postulaciones_antes before update on public.postulaciones
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
    and (estado = 'retirada' or (estado = 'postulada' and public.evento_abierto(evento_id)))
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
