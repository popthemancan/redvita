create extension if not exists pgcrypto;

create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  need text not null default 'other'
    check (need in ('oxygen', 'breathing', 'dialysis', 'fridge', 'bed', 'other')),
  home_lat double precision,
  home_lng double precision,
  link_code text not null unique,
  secret_hash text not null,
  push_token text,
  power text not null default 'unknown' check (power in ('plugged', 'unplugged', 'unknown')),
  battery real,
  last_heartbeat_at timestamptz,
  outage_started_at timestamptz,
  next_checkin_at timestamptz,
  last_checkin_at timestamptz,
  prompted_at timestamptz,
  alerted_at timestamptz,
  signal_alerted_at timestamptz,
  version integer not null default 0,
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  name text not null,
  phone text,
  home_lat double precision,
  home_lng double precision,
  responding_at timestamptz,
  last_report_at timestamptz,
  secret_hash text not null,
  push_token text,
  created_at timestamptz not null default now()
);
create index contacts_patient_idx on contacts (patient_id);

create table events (
  id bigint generated always as identity primary key,
  patient_id uuid not null references patients (id) on delete cascade,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index events_patient_idx on events (patient_id, created_at desc);

create table code_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index code_attempts_ip_idx on code_attempts (ip, created_at desc);

alter table patients enable row level security;
alter table contacts enable row level security;
alter table events enable row level security;
alter table code_attempts enable row level security;

create index patients_home_idx on patients (home_lat, home_lng);

create index patients_active_idx on patients (next_checkin_at, outage_started_at)
  where next_checkin_at is not null or outage_started_at is not null;
