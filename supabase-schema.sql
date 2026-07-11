create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default 'Administrador',
  role text not null default 'member' check (role in ('admin', 'staff', 'member')),
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  id int primary key default 1,
  payment_link_url text not null default '',
  monthly_due_day int not null default 3 check (monthly_due_day between 1 and 28),
  transfer_bank text not null default 'Banco Santander',
  transfer_holder text not null default 'Iron Gym Spa',
  transfer_rut text not null default '77.749.827-4',
  transfer_account_type text not null default 'Cuenta corriente',
  transfer_account_number text not null default '91046920',
  transfer_email text not null default 'ironboxspa@gmail.com',
  updated_at timestamptz not null default now()
);

insert into app_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discipline text not null,
  amount int not null check (amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  plan_id uuid references plans(id),
  access_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  kind text not null check (kind in ('monthly', 'single_class')),
  description text not null,
  amount int not null check (amount >= 0),
  due_date date not null,
  period text not null,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  amount int not null check (amount > 0),
  method text not null,
  paid_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists payment_notices (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  amount int not null check (amount > 0),
  reference text,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  noticed_at date not null default current_date,
  confirmed_at date,
  created_at timestamptz not null default now()
);

create or replace view charge_balances as
select
  c.*,
  coalesce(sum(p.amount), 0)::int as paid_amount,
  greatest(c.amount - coalesce(sum(p.amount), 0), 0)::int as balance,
  case
    when greatest(c.amount - coalesce(sum(p.amount), 0), 0) = 0 then 'paid'
    when c.due_date < current_date then 'overdue'
    else 'pending'
  end as status
from charges c
left join payments p on p.charge_id = c.id
group by c.id;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role in ('admin', 'staff')
  );
$$;

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

create or replace function get_member_portal_by_identifier(identifier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member_token text;
  normalized_identifier text;
begin
  normalized_identifier := regexp_replace(coalesce(identifier, ''), '\D', '', 'g');

  select access_token into member_token
  from members
  where status = 'active'
    and (
      lower(coalesce(email, '')) = lower(trim(identifier))
      or regexp_replace(coalesce(phone, ''), '\D', '', 'g') = normalized_identifier
    )
  order by created_at desc
  limit 1;

  if member_token is null then
    return jsonb_build_object('ok', false);
  end if;

  return get_member_portal(member_token);
end;
$$;

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

  insert into payment_notices (charge_id, member_id, amount, reference)
  values (charge, member_row.id, least(amount, charge_row.balance), reference)
  returning id into notice_id;

  return jsonb_build_object('ok', true, 'notice_id', notice_id, 'status', 'created');
end;
$$;

alter table profiles enable row level security;
alter table app_settings enable row level security;
alter table plans enable row level security;
alter table members enable row level security;
alter table charges enable row level security;
alter table payments enable row level security;
alter table payment_notices enable row level security;

create policy "profiles self read" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "profiles admin write" on profiles
  for all using (is_admin()) with check (is_admin());

create policy "settings read admin" on app_settings
  for select using (is_admin());

create policy "settings write admin" on app_settings
  for update using (is_admin()) with check (is_admin());

create policy "plans admin all" on plans
  for all using (is_admin()) with check (is_admin());

create policy "members admin all" on members
  for all using (is_admin()) with check (is_admin());

create policy "charges admin all" on charges
  for all using (is_admin()) with check (is_admin());

create policy "payments admin all" on payments
  for all using (is_admin()) with check (is_admin());

create policy "payment notices admin all" on payment_notices
  for all using (is_admin()) with check (is_admin());

create policy "charge balances admin read" on charges
  for select using (is_admin());

-- After creating your first auth user, promote it with:
-- insert into profiles (id, email, full_name, role)
-- select id, email, 'Administrador', 'admin'
-- from auth.users
-- where email = 'TU_EMAIL_ADMIN';
