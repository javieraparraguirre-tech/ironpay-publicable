-- Agrega link de regreso a la plataforma de agendamiento desde el portal de socio.
alter table app_settings
add column if not exists booking_link_url text not null default '';
