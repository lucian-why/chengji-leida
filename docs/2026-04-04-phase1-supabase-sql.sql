-- 成绩雷达 Phase 1 V2 - Supabase SQL 初稿
-- 用途：Web 端最小 SaaS 闭环
-- 日期：2026-04-04
-- 说明：Phase 1 只创建核心 6 表；share_links、ai_usage_logs、ai_analyses、vip_codes、vip_code_redemptions 等后续阶段再建

begin;

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  openid text unique,
  phone varchar(20) unique,
  nickname varchar(100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name varchar(100) not null default '默认档案',
  xueji varchar(50),
  school_name varchar(200),
  class_name varchar(100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_user_id on public.profiles(user_id);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name varchar(200) not null,
  start_date date,
  end_date date,
  notes text,
  total_score numeric(10,2),
  manual_total_score numeric(10,2),
  class_rank integer,
  grade_rank integer,
  class_count integer,
  grade_count integer,
  is_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exams_profile_id on public.exams(profile_id);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  subject_name varchar(50) not null,
  score numeric(10,2),
  full_score numeric(10,2) default 100,
  class_rank integer,
  grade_rank integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subjects_exam_id on public.subjects(exam_id);
create unique index if not exists idx_subjects_exam_name on public.subjects(exam_id, subject_name);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  active_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.migration_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source varchar(20) not null default 'local',
  status varchar(20) not null,
  detail jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_migration_jobs_user_id on public.migration_jobs(user_id);
create or replace function public.handle_updated_at()
returns trigger as 
begin
  new.updated_at = now();
  return new;
end;
 language plpgsql;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.handle_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.handle_updated_at();

drop trigger if exists trg_exams_updated_at on public.exams;
create trigger trg_exams_updated_at
before update on public.exams
for each row execute function public.handle_updated_at();

drop trigger if exists trg_subjects_updated_at on public.subjects;
create trigger trg_subjects_updated_at
before update on public.subjects
for each row execute function public.handle_updated_at();

drop trigger if exists trg_user_preferences_updated_at on public.user_preferences;
create trigger trg_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.handle_updated_at();

drop trigger if exists trg_migration_jobs_updated_at on public.migration_jobs;
create trigger trg_migration_jobs_updated_at
before update on public.migration_jobs
for each row execute function public.handle_updated_at();

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.subjects enable row level security;
alter table public.user_preferences enable row level security;
alter table public.migration_jobs enable row level security;

drop policy if exists "users_select_own" on public.users;
drop policy if exists "users_update_own" on public.users;
drop policy if exists "users_insert_own" on public.users;
drop policy if exists "profiles_manage_own" on public.profiles;
drop policy if exists "exams_manage_own" on public.exams;
drop policy if exists "subjects_manage_own" on public.subjects;
drop policy if exists "preferences_manage_own" on public.user_preferences;
drop policy if exists "migration_jobs_manage_own" on public.migration_jobs;

create policy "users_select_own" on public.users
for select using (auth.uid() = id);

create policy "users_update_own" on public.users
for update using (auth.uid() = id);

create policy "users_insert_own" on public.users
for insert with check (auth.uid() = id);

create policy "profiles_manage_own" on public.profiles
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "exams_manage_own" on public.exams
for all using (
  exists (
    select 1
    from public.profiles
    where profiles.id = exams.profile_id
      and profiles.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = exams.profile_id
      and profiles.user_id = auth.uid()
  )
);

create policy "subjects_manage_own" on public.subjects
for all using (
  exists (
    select 1
    from public.exams
    join public.profiles on profiles.id = exams.profile_id
    where exams.id = subjects.exam_id
      and profiles.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.exams
    join public.profiles on profiles.id = exams.profile_id
    where exams.id = subjects.exam_id
      and profiles.user_id = auth.uid()
  )
);

create policy "preferences_manage_own" on public.user_preferences
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "migration_jobs_manage_own" on public.migration_jobs
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;

