-- FlowGuard schema for Supabase. Apply in the SQL editor before enabling the frontend.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  contact_number text,
  role text not null default 'staff' check (role in ('admin','staff')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','disabled')),
  created_at timestamptz not null default now()
);

create table if not exists public.drains (
  id uuid primary key default gen_random_uuid(),
  drain_code text not null unique,
  location text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  water_level numeric(6,2), -- normalized percentage, 0–100
  flow_rate numeric(6,2), -- normalized percentage, 0–100; lower means reduced flow
  debris_status text not null default 'unknown' check (debris_status in ('clear','detected','unknown')),
  status text not null default 'normal' check (status in ('normal','warning','high_risk','critical','offline')),
  last_reading timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  drain_id uuid not null references public.drains(id) on delete cascade,
  water_level numeric(6,2), flow_rate numeric(6,2),
  debris_status text check (debris_status in ('clear','detected','unknown')),
  recorded_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  drain_id uuid references public.drains(id) on delete set null,
  alert_type text not null,
  message text not null,
  status text not null default 'active' check (status in ('active','acknowledged','resolved')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz
);

create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  drain_id uuid not null references public.drains(id) on delete cascade,
  staff_id uuid not null references public.profiles(id),
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_name text not null unique,
  setting_value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists sensor_readings_drain_time_idx on public.sensor_readings(drain_id, recorded_at desc);
create index if not exists alerts_status_created_idx on public.alerts(status, created_at desc);
create index if not exists maintenance_drain_time_idx on public.maintenance(drain_id, created_at desc);

-- A signup cannot supply a role or an approved status. New auth users become pending staff.
create or replace function public.handle_new_flowguard_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, contact_number, role, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'contact_number', 'staff', 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_flowguard_auth_user_created on auth.users;
create trigger on_flowguard_auth_user_created after insert on auth.users
for each row execute function public.handle_new_flowguard_user();

create or replace function public.flowguard_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'approved');
$$;
create or replace function public.flowguard_is_approved_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role in ('staff','admin'));
$$;
revoke all on function public.flowguard_is_admin() from public;
revoke all on function public.flowguard_is_approved_staff() from public;
grant execute on function public.flowguard_is_admin() to authenticated;
grant execute on function public.flowguard_is_approved_staff() to authenticated;

alter table public.profiles enable row level security;
alter table public.drains enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.alerts enable row level security;
alter table public.maintenance enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.flowguard_is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update to authenticated
using (public.flowguard_is_admin()) with check (public.flowguard_is_admin());

drop policy if exists "approved staff read drains" on public.drains;
create policy "approved staff read drains" on public.drains for select to authenticated using (public.flowguard_is_approved_staff());
drop policy if exists "admin manage drains" on public.drains;
create policy "admin manage drains" on public.drains for all to authenticated using (public.flowguard_is_admin()) with check (public.flowguard_is_admin());
drop policy if exists "approved staff read sensor history" on public.sensor_readings;
create policy "approved staff read sensor history" on public.sensor_readings for select to authenticated using (public.flowguard_is_approved_staff());
drop policy if exists "admin manage sensor history" on public.sensor_readings;
create policy "admin manage sensor history" on public.sensor_readings for all to authenticated using (public.flowguard_is_admin()) with check (public.flowguard_is_admin());
drop policy if exists "approved staff read alerts" on public.alerts;
create policy "approved staff read alerts" on public.alerts for select to authenticated using (public.flowguard_is_approved_staff());
drop policy if exists "approved staff update alerts" on public.alerts;
create policy "approved staff update alerts" on public.alerts for update to authenticated using (public.flowguard_is_approved_staff()) with check (public.flowguard_is_approved_staff());
drop policy if exists "admin manage alerts" on public.alerts;
create policy "admin manage alerts" on public.alerts for all to authenticated using (public.flowguard_is_admin()) with check (public.flowguard_is_admin());
drop policy if exists "public read active public alerts" on public.alerts;
create policy "public read active public alerts" on public.alerts for select to anon, authenticated using (is_public and status in ('active','acknowledged'));
drop policy if exists "approved staff read maintenance" on public.maintenance;
create policy "approved staff read maintenance" on public.maintenance for select to authenticated using (public.flowguard_is_approved_staff());
drop policy if exists "staff create maintenance" on public.maintenance;
create policy "staff create maintenance" on public.maintenance for insert to authenticated with check (staff_id = (select auth.uid()) and public.flowguard_is_approved_staff());
drop policy if exists "admin manage maintenance" on public.maintenance;
create policy "admin manage maintenance" on public.maintenance for all to authenticated using (public.flowguard_is_admin()) with check (public.flowguard_is_admin());
drop policy if exists "approved staff read settings" on public.system_settings;
create policy "approved staff read settings" on public.system_settings for select to authenticated using (public.flowguard_is_approved_staff());
drop policy if exists "admin manage settings" on public.system_settings;
create policy "admin manage settings" on public.system_settings for all to authenticated using (public.flowguard_is_admin()) with check (public.flowguard_is_admin());
drop policy if exists "public read thresholds" on public.system_settings;
drop policy if exists "public read thresholds and contacts" on public.system_settings;
create policy "public read thresholds and contacts" on public.system_settings for select to anon, authenticated using (setting_name in ('water_warning_threshold','water_critical_threshold','flow_warning_threshold','flow_critical_threshold','offline_minutes','weather_heavy_rain_threshold_mm','emergency_police','emergency_medical','emergency_fire','emergency_barangay'));

-- This view intentionally excludes sensor history, private notes, staff and admin fields.
create or replace view public.public_drain_status as
  select id, drain_code, location, latitude, longitude, water_level, flow_rate, debris_status, last_reading
  from public.drains;
grant select on public.public_drain_status to anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.alerts, public.system_settings to anon;
grant select, insert, delete on public.profiles, public.drains, public.sensor_readings, public.alerts, public.maintenance, public.system_settings to authenticated;
grant update on public.profiles, public.drains, public.sensor_readings, public.maintenance, public.system_settings to authenticated;
-- Staff alert actions are limited to acknowledgement/resolution fields at the SQL privilege layer.
grant update (status, acknowledged_by, acknowledged_at, resolved_by, resolved_at) on public.alerts to authenticated;

insert into public.system_settings(setting_name,setting_value) values
 ('water_warning_threshold','60'),('water_critical_threshold','80'),('flow_warning_threshold','50'),('flow_critical_threshold','25'),('offline_minutes','30'),('weather_heavy_rain_threshold_mm','5'),
 ('affected_area_radius_m','500'),('emergency_police','911'),('emergency_medical','911'),('emergency_fire','911'),('emergency_barangay','')
on conflict(setting_name) do nothing;

-- Optional clearly marked demo records. Delete rows with drain_code like 'DEMO-%' before production.
insert into public.drains(drain_code,location,latitude,longitude,water_level,flow_rate,debris_status,status,last_reading)
values
 ('DEMO-001','Riverside Road',14.5995,120.9842,32,76,'clear','normal',now()-interval '2 minutes'),
 ('DEMO-002','Market Street',14.6030,120.9900,67,54,'clear','warning',now()-interval '3 minutes'),
 ('DEMO-003','School Lane',14.5957,120.9780,28,81,'clear','normal',now()-interval '4 minutes'),
 ('DEMO-004','Main Street',14.6060,120.9775,88,18,'detected','critical',now()-interval '1 minute'),
 ('DEMO-005','Creekside Path',14.5925,120.9870,45,62,'clear','offline',now()-interval '65 minutes')
on conflict(drain_code) do nothing;

-- Bootstrap the first administrator only after creating and confirming its auth user:
-- update public.profiles set role='admin',status='approved' where id='YOUR_AUTH_USER_UUID';
