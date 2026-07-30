-- Agrega link de regreso a la plataforma de agendamiento desde el portal de socio.
alter table app_settings
add column if not exists booking_link_url text not null default '';

-- Refresca la funcion del portal socio para asegurar que entregue el nuevo link.
create or replace function get_member_portal(token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row members%rowtype;
  settings_row app_settings%rowtype;
begin
  select * into member_row
  from members
  where access_token = token
    and status = 'active';

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  select * into settings_row from app_settings where id = 1;

  return jsonb_build_object(
    'ok', true,
    'member', to_jsonb(member_row),
    'plan', (
      select to_jsonb(p)
      from plans p
      where p.id = member_row.plan_id
    ),
    'charges', coalesce((
      select jsonb_agg(to_jsonb(cb) order by cb.due_date)
      from charge_balances cb
      where cb.member_id = member_row.id
        and cb.balance > 0
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.paid_at desc)
      from payments p
      where p.member_id = member_row.id
    ), '[]'::jsonb),
    'settings', to_jsonb(settings_row)
  );
end;
$$;
