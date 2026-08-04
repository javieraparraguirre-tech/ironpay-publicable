-- FIX REGLAS DE AGENDAMIENTO POR PLAN - 2026-08-01
-- Ejecutar en Supabase SQL Editor.
-- Corrige los cupos semanales sin borrar socios, pagos, cargos ni reservas.

begin;

create extension if not exists pgcrypto;

create table if not exists agenda_plan_rules (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  plan_name_match text,
  weekly_class_limit int check (weekly_class_limit is null or weekly_class_limit >= 0),
  uses_paid_class_credits boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (plan_id is not null or plan_name_match is not null)
);

create unique index if not exists agenda_plan_rules_plan_id_unique
  on agenda_plan_rules (plan_id)
  where plan_id is not null;

-- Primero dejamos inactivas reglas genericas que puedan estar dando "ilimitado".
update agenda_plan_rules
set active = false
where plan_id is null;

-- Actualiza el texto visible del plan.
update plans
set discipline = case
  when upper(name) like '%IRON ELITE%' then 'Ilimitado'
  when upper(name) like '%IRON PLUS%' then '5 clases por semana'
  when upper(name) like '%IRON FLEX%' then '3 clases por semana'
  when upper(name) like '%IRON START%' then '2 clases por semana'
  when upper(name) like '%PAGO POR CLASE%' then '1 clase'
  else discipline
end
where upper(name) like '%IRON ELITE%'
   or upper(name) like '%IRON PLUS%'
   or upper(name) like '%IRON FLEX%'
   or upper(name) like '%IRON START%'
   or upper(name) like '%PAGO POR CLASE%';

-- Reglas reales de cupo:
-- IRON ELITE: ilimitado.
insert into agenda_plan_rules (plan_id, plan_name_match, weekly_class_limit, uses_paid_class_credits, active)
select p.id, null, null, false, true
from plans p
where upper(p.name) like '%IRON ELITE%'
on conflict (plan_id) where plan_id is not null do update
set weekly_class_limit = null,
    uses_paid_class_credits = false,
    active = true;

-- IRON PLUS: 5 clases por semana.
insert into agenda_plan_rules (plan_id, plan_name_match, weekly_class_limit, uses_paid_class_credits, active)
select p.id, null, 5, false, true
from plans p
where upper(p.name) like '%IRON PLUS%'
on conflict (plan_id) where plan_id is not null do update
set weekly_class_limit = 5,
    uses_paid_class_credits = false,
    active = true;

-- IRON FLEX: 3 clases por semana.
insert into agenda_plan_rules (plan_id, plan_name_match, weekly_class_limit, uses_paid_class_credits, active)
select p.id, null, 3, false, true
from plans p
where upper(p.name) like '%IRON FLEX%'
on conflict (plan_id) where plan_id is not null do update
set weekly_class_limit = 3,
    uses_paid_class_credits = false,
    active = true;

-- IRON START: 2 clases por semana.
insert into agenda_plan_rules (plan_id, plan_name_match, weekly_class_limit, uses_paid_class_credits, active)
select p.id, null, 2, false, true
from plans p
where upper(p.name) like '%IRON START%'
on conflict (plan_id) where plan_id is not null do update
set weekly_class_limit = 2,
    uses_paid_class_credits = false,
    active = true;

-- PAGO POR CLASE: 1 clase y consume creditos pagados.
insert into agenda_plan_rules (plan_id, plan_name_match, weekly_class_limit, uses_paid_class_credits, active)
select p.id, null, 1, true, true
from plans p
where upper(p.name) like '%PAGO POR CLASE%'
   or upper(p.name) like '%CLASE SUELTA%'
on conflict (plan_id) where plan_id is not null do update
set weekly_class_limit = 1,
    uses_paid_class_credits = true,
    active = true;

notify pgrst, 'reload schema';

commit;

-- VERIFICACION:
-- Debe mostrar:
-- IRON ELITE = limite vacio/null, creditos false
-- IRON PLUS = 5, creditos false
-- IRON FLEX = 3, creditos false
-- IRON START = 2, creditos false
-- PAGO POR CLASE = 1, creditos true
select
  p.name as plan,
  p.amount as monto,
  p.discipline as texto_visible,
  r.weekly_class_limit as limite_semanal,
  r.uses_paid_class_credits as usa_creditos_pagados,
  r.active as regla_activa
from plans p
left join agenda_plan_rules r on r.plan_id = p.id
where upper(p.name) like '%IRON ELITE%'
   or upper(p.name) like '%IRON PLUS%'
   or upper(p.name) like '%IRON FLEX%'
   or upper(p.name) like '%IRON START%'
   or upper(p.name) like '%PAGO POR CLASE%'
order by p.name, p.amount;
