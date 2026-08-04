-- Recupera el flujo anterior:
-- - Informar transferencia muestra aviso y evita duplicados.
-- - Ya pague por link/Webpay crea aviso pendiente para administracion.

alter table app_settings
  add column if not exists notice_whatsapp text not null default '',
  add column if not exists notice_email text not null default '';

create unique index if not exists payment_notices_one_pending_per_charge
  on payment_notices (charge_id)
  where status = 'pending';

create or replace function create_payment_notice(token text, charge uuid, amount int, reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row members%rowtype;
  charge_row charge_balances%rowtype;
  notice_id uuid;
begin
  select * into member_row
  from members
  where access_token = token
    and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Socio no encontrado');
  end if;

  select * into charge_row
  from charge_balances
  where id = charge
    and member_id = member_row.id
    and balance > 0;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Cargo no encontrado');
  end if;

  select id into notice_id
  from payment_notices
  where charge_id = charge
    and status = 'pending'
  order by created_at desc
  limit 1;

  if notice_id is not null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Este pago ya fue informado. Administracion debe confirmarlo.'
    );
  end if;

  insert into payment_notices (charge_id, member_id, amount, reference)
  values (charge, member_row.id, least(amount, charge_row.balance), reference)
  returning id into notice_id;

  return jsonb_build_object('ok', true, 'notice_id', notice_id);
end;
$$;

grant execute on function public.create_payment_notice(text, uuid, int, text) to anon, authenticated;
notify pgrst, 'reload schema';
