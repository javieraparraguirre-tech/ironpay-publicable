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
