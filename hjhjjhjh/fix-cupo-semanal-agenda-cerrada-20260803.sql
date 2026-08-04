-- FIX CUPO SEMANAL CON AGENDA CERRADA - 2026-08-03
-- Ejecutar completo en Supabase SQL Editor.
-- Corrige que una clase ya reservada siga contando como cupo semanal,
-- aunque el dia de esa clase ya no este visible para nuevas reservas.

create or replace function get_agenda_portal(identifier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  portal jsonb;
  member_id_value uuid;
  agenda_rule jsonb;
  weekly_limit int;
  uses_credits boolean;
  weekly_used int;
  paid_credits int;
  used_credits int;
  available_credits int;
  chile_now timestamp;
  chile_today date;
  chile_isodow int;
  visible_start date;
  visible_end date;
  bookings_start date;
  quota_week_start date;
  quota_week_end date;
begin
  portal := get_member_portal_by_identifier(identifier);

  if not (portal->>'ok')::boolean then
    return jsonb_build_object('ok', false);
  end if;

  member_id_value := (portal->'member'->>'id')::uuid;
  agenda_rule := get_agenda_rule_for_member(member_id_value);
  weekly_limit := nullif(agenda_rule->>'weekly_class_limit', '')::int;
  uses_credits := coalesce((agenda_rule->>'uses_paid_class_credits')::boolean, false);

  chile_now := now() at time zone 'America/Santiago';
  chile_today := chile_now::date;
  chile_isodow := extract(isodow from chile_today)::int;

  if chile_isodow = 7 then
    visible_start := chile_today + 1;
  elsif chile_now::time >= time '15:00' then
    if chile_isodow = 6 then
      visible_start := chile_today + 2;
    else
      visible_start := chile_today + 1;
    end if;
  else
    visible_start := chile_today;
  end if;

  visible_end := visible_start + (6 - extract(isodow from visible_start)::int);
  bookings_start := chile_today;

  -- El cupo semanal se cuenta por semana calendario completa.
  quota_week_start := chile_today - (chile_isodow - 1);
  quota_week_end := quota_week_start + 6;

  select count(*)::int into weekly_used
  from class_bookings cb
  where cb.member_id = member_id_value
    and cb.class_date between quota_week_start and quota_week_end
    and cb.status in ('booked', 'waitlist');

  select count(*)::int into paid_credits
  from charge_balances cb
  where cb.member_id = member_id_value
    and cb.kind = 'single_class'
    and cb.balance = 0;

  select count(*)::int into used_credits
  from class_bookings cb
  where cb.member_id = member_id_value
    and cb.status in ('booked', 'waitlist');

  available_credits := greatest(paid_credits - used_credits, 0);

  return portal || jsonb_build_object(
    'agenda_quota', jsonb_build_object(
      'weekly_class_limit', weekly_limit,
      'weekly_used', weekly_used,
      'weekly_remaining', case when weekly_limit is null then null else greatest(weekly_limit - weekly_used, 0) end,
      'uses_paid_class_credits', uses_credits,
      'paid_class_credits', paid_credits,
      'used_class_credits', used_credits,
      'available_class_credits', available_credits
    ),
    'templates', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.day_of_week, t.start_time)
      from class_templates t
      where t.active = true
        and (visible_start + ((t.day_of_week - extract(isodow from visible_start)::int) || ' days')::interval)::date
          between visible_start and visible_end
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'template_id', b.template_id,
          'member_id', b.member_id,
          'class_date', b.class_date,
          'status', b.status,
          'created_at', b.created_at,
          'class_name', t.class_name,
          'day_name', t.day_name,
          'start_time', t.start_time
        )
        order by b.class_date, t.start_time
      )
      from class_bookings b
      join class_templates t on t.id = b.template_id
      where b.member_id = member_id_value
        and b.class_date between bookings_start and visible_end
        and b.status in ('booked', 'waitlist')
    ), '[]'::jsonb),
    'occupancy', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'template_id', row_data.template_id,
          'class_date', row_data.class_date,
          'booked', row_data.booked,
          'waitlist', row_data.waitlist
        )
        order by row_data.day_of_week, row_data.start_time
      )
      from (
        select
          t.id as template_id,
          t.day_of_week,
          t.start_time,
          (visible_start + ((t.day_of_week - extract(isodow from visible_start)::int) || ' days')::interval)::date as class_date,
          count(b.id) filter (where b.status = 'booked')::int as booked,
          count(b.id) filter (where b.status = 'waitlist')::int as waitlist
        from class_templates t
        left join class_bookings b
          on b.template_id = t.id
         and b.class_date = (visible_start + ((t.day_of_week - extract(isodow from visible_start)::int) || ' days')::interval)::date
         and b.status in ('booked', 'waitlist')
        where t.active = true
          and (visible_start + ((t.day_of_week - extract(isodow from visible_start)::int) || ' days')::interval)::date
            between visible_start and visible_end
        group by t.id, t.day_of_week, t.start_time
      ) row_data
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_agenda_portal(text) to anon, authenticated;

create or replace function book_agenda_class(token text, template uuid, class_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row members%rowtype;
  template_row class_templates%rowtype;
  agenda_rule jsonb;
  weekly_limit int;
  uses_credits boolean;
  weekly_used int;
  paid_credits int;
  used_credits int;
  available_credits int;
  overdue_debt int;
  booked_count int;
  booking_status text;
  chile_now timestamp;
  chile_today date;
  chile_isodow int;
  visible_start date;
  visible_end date;
  requested_class_date date;
  requested_isodow int;
  quota_week_start date;
  quota_week_end date;
begin
  requested_class_date := book_agenda_class.class_date;

  select * into member_row
  from members m
  where m.access_token = token
    and m.status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Socio no encontrado');
  end if;

  chile_now := now() at time zone 'America/Santiago';
  chile_today := chile_now::date;
  chile_isodow := extract(isodow from chile_today)::int;

  select coalesce(sum(cb.balance), 0)::int into overdue_debt
  from charge_balances cb
  where cb.member_id = member_row.id
    and cb.kind <> 'single_class'
    and cb.balance > 0
    and cb.due_date < chile_today;

  if overdue_debt > 0 then
    return jsonb_build_object('ok', false, 'message', 'Socio con deuda vencida en IronPay');
  end if;

  agenda_rule := get_agenda_rule_for_member(member_row.id);
  weekly_limit := nullif(agenda_rule->>'weekly_class_limit', '')::int;
  uses_credits := coalesce((agenda_rule->>'uses_paid_class_credits')::boolean, false);

  select * into template_row
  from class_templates ct
  where ct.id = template
    and ct.active = true;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Clase no encontrada');
  end if;

  if chile_isodow = 7 then
    visible_start := chile_today + 1;
  elsif chile_now::time >= time '15:00' then
    if chile_isodow = 6 then
      visible_start := chile_today + 2;
    else
      visible_start := chile_today + 1;
    end if;
  else
    visible_start := chile_today;
  end if;

  visible_end := visible_start + (6 - extract(isodow from visible_start)::int);

  if requested_class_date < visible_start or requested_class_date > visible_end then
    return jsonb_build_object('ok', false, 'message', 'Esta fecha ya no esta disponible para agendar');
  end if;

  if extract(isodow from requested_class_date)::int <> template_row.day_of_week then
    return jsonb_build_object('ok', false, 'message', 'La fecha no coincide con el dia de la clase');
  end if;

  -- Cuenta los cupos de la semana real de la clase solicitada.
  requested_isodow := extract(isodow from requested_class_date)::int;
  quota_week_start := requested_class_date - (requested_isodow - 1);
  quota_week_end := quota_week_start + 6;

  select count(*)::int into weekly_used
  from class_bookings cb
  where cb.member_id = member_row.id
    and cb.class_date between quota_week_start and quota_week_end
    and cb.status in ('booked', 'waitlist');

  if weekly_limit is not null and weekly_used >= weekly_limit then
    return jsonb_build_object(
      'ok', false,
      'message', 'Tu plan permite ' || weekly_limit || ' clases por semana. Ya usaste tus cupos.'
    );
  end if;

  if uses_credits then
    select count(*)::int into paid_credits
    from charge_balances cb
    where cb.member_id = member_row.id
      and cb.kind = 'single_class'
      and cb.balance = 0;

    select count(*)::int into used_credits
    from class_bookings cb
    where cb.member_id = member_row.id
      and cb.status in ('booked', 'waitlist');

    available_credits := greatest(paid_credits - used_credits, 0);

    if available_credits <= 0 then
      return jsonb_build_object(
        'ok', false,
        'message', 'No tienes clases pagadas disponibles. Realiza el pago para agendar una nueva clase.'
      );
    end if;
  end if;

  select count(*)::int into booked_count
  from class_bookings cb
  where cb.template_id = template
    and cb.class_date = requested_class_date
    and cb.status = 'booked';

  booking_status := case when booked_count >= template_row.capacity then 'waitlist' else 'booked' end;

  insert into class_bookings as cb (template_id, member_id, class_date, status, cancelled_at)
  values (template, member_row.id, requested_class_date, booking_status, null)
  on conflict on constraint class_bookings_template_id_member_id_class_date_key
  do update set
    status = excluded.status,
    cancelled_at = null;

  return jsonb_build_object('ok', true, 'status', booking_status);
end;
$$;

grant execute on function public.book_agenda_class(text, uuid, date) to anon, authenticated;
notify pgrst, 'reload schema';

-- Verificacion sugerida:
-- 1. Ejecuta este archivo completo.
-- 2. Entra al portal socio y presiona "Ingresar".
-- 3. Si el socio tiene Lunes 19:00 y Miercoles 19:00 con plan IRON START,
--    debe mostrar Agendamiento semanal: 2/2 clases.
