with duplicated_pending_notices as (
  select
    id,
    row_number() over (
      partition by charge_id, member_id
      order by created_at desc
    ) as duplicate_order
  from payment_notices
  where status = 'pending'
)
delete from payment_notices
where id in (
  select id
  from duplicated_pending_notices
  where duplicate_order > 1
);

create unique index if not exists payment_notices_one_pending_per_charge
on payment_notices (charge_id, member_id)
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
  existing_notice_id uuid;
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

  select id into existing_notice_id
  from payment_notices
  where charge_id = charge
    and member_id = member_row.id
    and status = 'pending'
  order by created_at desc
  limit 1;

  if existing_notice_id is not null then
    return jsonb_build_object(
      'ok', true,
      'notice_id', existing_notice_id,
      'status', 'already_pending',
      'message', 'Esta transferencia ya fue informada y esta pendiente de revision.'
    );
  end if;

  begin
    insert into payment_notices (charge_id, member_id, amount, reference)
    values (charge, member_row.id, least(amount, charge_row.balance), reference)
    returning id into notice_id;
  exception when unique_violation then
    select id into notice_id
    from payment_notices
    where charge_id = charge
      and member_id = member_row.id
      and status = 'pending'
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'notice_id', notice_id,
      'status', 'already_pending',
      'message', 'Esta transferencia ya fue informada y esta pendiente de revision.'
    );
  end;

  return jsonb_build_object('ok', true, 'notice_id', notice_id, 'status', 'created');
end;
$$;
