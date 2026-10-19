-- SEPIA COFFEE · portal de baristas · migración 001: tope diario de pago
--
-- Para quien ya corrió esquema.sql antes de que existiera el tope. Pegar entero
-- en Supabase → SQL Editor → Run. Se puede correr más de una vez.
--
-- Agrega config.tope_dia (por defecto $70.000 líquidos por barista y por día) y
-- hace que el pago calculado de cada evento nunca lo pase. Un pago fijo puesto a
-- mano en un evento (pago_manual) no se recorta.
-- Para cambiar el tope más adelante:
--   update public.config set tope_dia = 80000;

alter table public.config add column if not exists tope_dia int not null default 70000 check (tope_dia >= 0);

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
