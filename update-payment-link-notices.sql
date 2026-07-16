alter table app_settings
add column if not exists notification_whatsapp text not null default '';

alter table app_settings
add column if not exists notification_email text not null default 'ironboxspa@gmail.com';

update app_settings
set notification_email = coalesce(nullif(notification_email, ''), 'ironboxspa@gmail.com')
where id = 1;
