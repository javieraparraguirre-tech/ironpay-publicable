create unique index if not exists charges_one_monthly_per_period
on charges (member_id, period)
where kind = 'monthly';

create or replace function ensure_current_monthly_charges()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row app_settings%rowtype;
  due_date_value date;
  period_value text;
  created_count int := 0;
begin
  select * into settings_row from app_settings where id = 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Configuracion no encontrada');
  end if;

  due_date_value := make_date(
    extract(year from current_date)::int,
    extract(month from current_date)::int,
    greatest(1, least(28, settings_row.monthly_due_day))
  );
  period_value := to_char(due_date_value, 'YYYY-MM');

  insert into charges (member_id, kind, description, amount, due_date, period)
  select
    m.id,
    'monthly',
    'Mensualidad ' || p.name,
    p.amount,
    due_date_value,
    period_value
  from members m
  join plans p on p.id = m.plan_id
  where m.status = 'active'
    and p.active = true
  on conflict do nothing;

  get diagnostics created_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'created', created_count,
    'period', period_value,
    'due_date', due_date_value
  );
end;
$$;
