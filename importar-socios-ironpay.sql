-- Importacion de socios IronPay desde SOCIOS IRONPAY.xlsx
-- Generado: 2026-07-26 12:53
-- Socios detectados: 53
-- Planes detectados: 9
-- Socios sin telefono: 0
-- Socios sin email: 0
--
-- Como usar:
-- 1. Abre Supabase > SQL Editor.
-- 2. Pega este archivo completo.
-- 3. Presiona Run / Correr.
-- 4. Si ya instalaste update-monthly-auto.sql, al final se generaran las mensualidades del mes.

create extension if not exists pgcrypto;

create temp table ironpay_import_members (
  name text not null,
  email text,
  phone text not null,
  plan_name text not null,
  plan_amount int not null,
  member_status text not null
) on commit drop;

insert into ironpay_import_members (name, email, phone, plan_name, plan_amount, member_status)
values
    ('Nataly Aurora Araneda Vira', 'nataly.aranedavira@gmail.com', '56931718782', 'IRON ELITE', 70000, 'active'),
    ('Maryory Sepulveda Bustos', 'm.sepulveda.94@gmail.com', '56976652528', 'IRON PLUS', 60000, 'active'),
    ('María Eliana Navarro Muñoz', 'marynavarro1116@gmail.com', '56994141650', 'IRON ELITE', 70000, 'active'),
    ('Ximena Rodríguez', 'elizabeth.3068.guajardo@gmail.com', '56954153377', 'IRON ELITE', 70000, 'active'),
    ('Noel Antonio Bravo Chandia', 'noel_bravo81@hotmail.com', '56951232459', 'IRON PLUS', 60000, 'active'),
    ('Anji risabet bautista delgado', 'anjibautista772@gmail.com', '56930887852', 'IRON ELITE', 70000, 'active'),
    ('Marcela Verónica Raquelich Zamora', 'mraquelichz@gmail.com', '56952437487', 'IRON PLUS', 60000, 'active'),
    ('Carlos rodriguez', 'rodríguezmontt.carlos@gmail.com', '56948555856', 'IRON ELITE', 70000, 'active'),
    ('Joaana Vaquero', 'joaana.vaquero83@gmail.com', '56965187955', 'IRON ELITE', 70000, 'active'),
    ('Cristóbal acuña', 'cristobal.ac@hotmail.com', '56996933748', 'IRON PLUS', 60000, 'active'),
    ('Cindy González Ramírez', 'cindy.irenegonzalez@gmail.com', '56987321812', 'IRON FLEX', 50000, 'active'),
    ('Andrés Carvajal', 'and.carvajal92@gmail.com', '56942613840', 'IRON FLEX', 50000, 'active'),
    ('Pablo Hermosilla', 'pablo.hermosillah@gmail.com', '56996112731', 'IRON PLUS', 60000, 'active'),
    ('Alejandra Carolin Araya Henríquez', 'alejandra.araya.henriquez@gmail.com', '56992507069', 'IRON FLEX', 50000, 'active'),
    ('Vania Gálvez Gálaz', 'vaniagalvezgalaz@gmail.com', '56964959448', 'IRON PLUS', 60000, 'active'),
    ('Cecilia Hernández Fuentes', 'cecilia.her.19@gmail.com', '56987440463', 'IRON START', 35000, 'active'),
    ('Nicole Elisa Tobar Urrutia', 'nicole15.tobar@gmail.com', '56934079559', 'IRON START', 35000, 'active'),
    ('Ignacio santiago bastías gonzalez', 'bastiasignacio96@gmail.com', '56976985954', 'IRON ELITE', 55000, 'active'),
    ('Felipe Hernández', 'felipe.hernandez1258@gmail.com', '56940989553', 'IRON PLUS', 60000, 'active'),
    ('Mariela Uribe', 'mariela.uribe12@gmail.com', '56940591070', 'IRON ELITE', 70000, 'active'),
    ('Manuel salvador Padilla Navarrete', 'manuel.s.padilla.n@gmail.com', '56957365491', 'IRON FLEX', 50000, 'active'),
    ('Jose Luis Bravo Aranguiz', 'josebravo44@gmail.com', '56934679047', 'IRON FLEX', 50000, 'active'),
    ('Valentina Escarlet Flores Inostroza', 'valentina.flores1@mail.udp.cl', '56962876524', 'IRON FLEX', 50000, 'active'),
    ('Cynthia Orellana espinoza', 'corellanaesp@gmail.com', '56992178670', 'PAGO POR CLASE', 6000, 'active'),
    ('Diego bastias', 'bastiasdiegoariel@gmail.com', '56976470098', 'IRON ELITE', 55000, 'active'),
    ('Claudia Mondaca Rodríguez', 'claudiamondaca@gmail.com', '56987445449', 'IRON FLEX', 50000, 'active'),
    ('Jessica del Carmen Urrutia Cortez', 'jessica.freepack@gmail.com', '56956315012', 'IRON START', 35000, 'active'),
    ('Carmen gloria jorquera valdebenito', 'nony715@hotmail.com', '56977080264', 'IRON PLUS', 60000, 'active'),
    ('Ibar Franco Villalobos Fuenzalida', 'ibar.vf@gmail.com', '56956128626', 'IRON ELITE', 70000, 'active'),
    ('Aldo Bastías', 'bastias.aldo@gmail.com', '56959116161', 'IRON ELITE', 55000, 'active'),
    ('Maite Isidora Llantén Alarcón', 'maitellanten.arq@gmail.com', '56942099758', 'IRON PLUS', 60000, 'active'),
    ('Elena Avila Orellana', 'elena.avilao@gmail.com', '56950074225', 'IRON FLEX', 50000, 'active'),
    ('Pablo Andres Quiroz Gaete', 'paquirozg@gmail.com', '56994181165', 'IRON FLEX', 50000, 'active'),
    ('Nicolas Francisco Caro Luna', 'nicolas.caroo.l@gmail.com', '56979817164', 'IRON START', 35000, 'active'),
    ('Ignacio Martinez Rojas', 'imartinezrojas10@gmail.com', '56952137333', 'IRON FLEX', 50000, 'active'),
    ('valentina araya', 'valentinaa.arayac@gmail.com', '56989448605', 'IRON ELITE', 0, 'active'),
    ('Claudia Esther Varela Cisternas', 'claudiaa.3492@gmail.com', '56987421676', 'IRON FLEX', 0, 'active'),
    ('Rodrigo Candia Sandoval', 'rodrigo.a.candia@gmail.com', '56992998690', 'IRON START', 35000, 'active'),
    ('Vannessa Andrea Gálvez Encina', 'vannessagalvez@gmail.com', '56988357632', 'IRON FLEX', 45000, 'active'),
    ('Ivan alejandro flores González', 'ivanabel59@gmail.com', '56987606334', 'IRON FLEX', 50000, 'active'),
    ('Gonzalo Villena', 'gonzalovillena4@gmail.com', '5699291627', 'IRON FLEX', 50000, 'active'),
    ('Rodolfo Carrasco', 'rcarrascomolina@gmail.com', '56983472922', 'IRON ELITE', 70000, 'active'),
    ('Felipe Guevara', 'felipe.guevara23@gmail.com', '56971072915', 'IRON FLEX', 45000, 'active'),
    ('Constanza Aracena', 'aracena.gca@gmail.com', '56975614992', 'IRON FLEX', 50000, 'active'),
    ('Francis johanna Rojas', 'francisrojas363@gmail.com', '56955384744', 'IRON PLUS', 60000, 'active'),
    ('Ximena Rodríguez', 'elizabeth.3068.guajardo@gmail.com', '56954153377', 'IRON PLUS', 60000, 'active'),
    ('Sebastián Pavez', 'adamx2034@gmail.com', '56978456383', 'IRON START', 35000, 'active'),
    ('Felipe armijo', 'armijo.felipe@gmail.com', '56982325060', 'IRON ELITE', 70000, 'active'),
    ('Caro', 'no', '56956314995', 'IRON START', 35000, 'active'),
    ('mama caro', 'no', '56956315012', 'IRON START', 35000, 'active'),
    ('Mauricio Allendes de LA BARRA', 'mauro2262@hotmail.com', '56986597303', 'IRON PLUS', 60000, 'active'),
    ('Tomas flores', 'no', '56933223955', 'IRON PLUS', 60000, 'active'),
    ('Freddy Orellana', 'ferito@gmail.com', '56983229437', 'IRON FLEX', 50000, 'active');

-- Crea planes que aun no existan, comparando por nombre y monto.
insert into plans (name, discipline, amount, active)
select distinct i.plan_name, 'General', i.plan_amount, true
from ironpay_import_members i
where not exists (
  select 1
  from plans p
  where lower(trim(p.name)) = lower(trim(i.plan_name))
    and p.amount = i.plan_amount
);

-- Crea socios que aun no existan por email o telefono.
insert into members (name, phone, email, plan_id, status)
select
  i.name,
  i.phone,
  nullif(i.email, ''),
  p.id,
  i.member_status
from ironpay_import_members i
join plans p
  on lower(trim(p.name)) = lower(trim(i.plan_name))
 and p.amount = i.plan_amount
where not exists (
  select 1
  from members m
  where (i.email <> '' and lower(coalesce(m.email, '')) = lower(i.email))
     or (i.phone <> '' and regexp_replace(m.phone, '\D', '', 'g') = regexp_replace(i.phone, '\D', '', 'g'))
);

-- Actualiza el plan y datos principales si el socio ya existia.
update members m
set
  name = i.name,
  phone = i.phone,
  email = nullif(i.email, ''),
  plan_id = p.id,
  status = i.member_status
from ironpay_import_members i
join plans p
  on lower(trim(p.name)) = lower(trim(i.plan_name))
 and p.amount = i.plan_amount
where (i.email <> '' and lower(coalesce(m.email, '')) = lower(i.email))
   or (i.phone <> '' and regexp_replace(m.phone, '\D', '', 'g') = regexp_replace(i.phone, '\D', '', 'g'));

-- Genera las mensualidades pendientes del mes actual para socios activos con plan.
-- Si la funcion aun no existe, primero ejecuta update-monthly-auto.sql.
select ensure_current_monthly_charges();

-- Verificacion rapida despues de correr:
select
  (select count(*) from ironpay_import_members) as socios_en_planilla,
  (select count(*) from members where status = 'active') as socios_activos_en_ironpay,
  (select count(*) from plans where active = true) as planes_activos_en_ironpay;
