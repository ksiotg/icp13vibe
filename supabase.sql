-- ════════════════════════════════════════════════════════════════════
--  ROOMY · Supabase 설정 명령문
-- ════════════════════════════════════════════════════════════════════
--  사용법 (자세한 건 설정안내.md 3단계)
--   1단계. 이 파일 내용을 전부 복사해서 Supabase > SQL Editor 에 붙여넣고 Run.
--          고칠 곳은 없어요. 맨 아래에 "완료" 가 나오면 성공.
--   2단계. (처음 한 번만) '비밀문구.sql' 의 한 줄을 붙여넣고,
--          따옴표 안을 내 비밀 문구로 바꿔서 Run.
--
--  · 여러 번 실행해도 괜찮아요. 이미 넣은 물건 · 장소 · 카테고리 · 비밀 문구는 그대로 남아요.
--  · 앱이 업데이트되면 이 파일을 다시 실행하라고 안내할 수 있어요.
-- ════════════════════════════════════════════════════════════════════


-- 1) 비밀 문구 보관함 ───────────────────────────────────────────────
--    앱에서는 절대 볼 수 없는 곳(private)에, 문구 자체가 아니라
--    문구를 알아볼 수 없게 바꾼 값(해시)만 보관해요.
--    문구는 2단계(비밀문구.sql)에서 정해요.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.room_secret (
  id        integer primary key default 1 check (id = 1),
  key_hash  text not null
);
alter table private.room_secret enable row level security;
revoke all on table private.room_secret from public, anon, authenticated;

-- 비밀 문구를 정하는 함수: Supabase 화면(SQL Editor)에서만 쓸 수 있어요.
-- 앱이나 인터넷에서는 부를 수 없어요.
create or replace function private.set_room_key(phrase text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  p text := btrim(coalesce(phrase, ''));
begin
  if p = '' or md5(p) = 'b1bc07cc325b9e9349189440888e714f' then
    raise exception '따옴표 안을 내 비밀 문구로 바꾼 뒤 다시 Run 하세요.';
  end if;
  if char_length(p) < 4 then
    raise exception '비밀 문구가 너무 짧아요. 4자 이상(8자 이상 추천)으로 정해주세요.';
  end if;

  insert into private.room_secret (id, key_hash)
  values (1, encode(sha256(convert_to(normalize(p, NFC), 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;

  return '비밀 문구를 저장했어요! 이제 앱에서 이 문구로 열 수 있어요.';
end;
$$;

revoke all on function private.set_room_key(text) from public, anon, authenticated;


-- 2) 물건 표 ─────────────────────────────────────────────────────
--    물건 하나 = 한 줄.
--    위치는 '큰 장소 › 세부 위치' 글자로 적어요. (예: 책상 › 서랍 2칸)

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  location    text not null default '' check (char_length(location) <= 100),
  category    text not null default '기타',
  quantity    integer not null default 1 check (quantity between 1 and 99999),
  status      text not null default '가끔 씀'
              check (status in ('자주 씀', '가끔 씀', '안 씀', '처분 예정')),
  icon        text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'),
  memo        text not null default '' check (char_length(memo) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.items is 'ROOMY: 내 방 물건 목록 (물건 하나 = 한 줄)';

-- 카테고리를 직접 만들 수 있게: 예전의 '6개 중 하나' 규칙을 '1~30자'로 바꿔요
alter table public.items drop constraint if exists items_category_check;
alter table public.items drop constraint if exists items_category_len;
alter table public.items add constraint items_category_len
  check (char_length(btrim(category)) between 1 and 30);


-- 3) 카테고리 목록 ───────────────────────────────────────────────
--    이름 · 대표 아이콘 · 순서. 물건에는 카테고리 이름이 적혀요.

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  icon        text not null default 'package' check (icon ~ '^[a-z0-9-]{1,40}$'),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists categories_name_key on public.categories (lower(btrim(name)));

-- 처음 한 번만: 기본 카테고리 6개
insert into public.categories (name, icon, sort)
select v.name, v.icon, v.sort
from (values
  ('문구', 'pencil-simple', 1),
  ('전자기기', 'device-mobile', 2),
  ('옷', 't-shirt', 3),
  ('화장품', 'drop', 4),
  ('생활용품', 'house', 5),
  ('기타', 'package', 6)
) as v(name, icon, sort)
where not exists (select 1 from public.categories);

-- '기타'는 늘 있어야 해요 (지운 카테고리의 물건이 가는 곳)
insert into public.categories (name, icon, sort) values ('기타', 'package', 1000)
on conflict do nothing;

-- 물건에 적혀 있는데 목록에 없는 카테고리는 목록에 넣어요
insert into public.categories (name, icon, sort)
select distinct btrim(category), 'package', 500 from public.items
on conflict do nothing;


-- 4) 장소 목록 (큰 장소 › 세부 위치) ─────────────────────────────
--    parent_id 가 비어 있으면 큰 장소, 있으면 그 장소 안의 세부 위치.

create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.locations (id) on delete cascade,
  name        text not null
              check (char_length(btrim(name)) between 1 and 40 and position('›' in name) = 0),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists locations_name_key
  on public.locations (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index if not exists locations_parent_idx on public.locations (parent_id);

-- 2단계까지만: 세부 위치 안에 또 넣을 수는 없어요
create or replace function public.locations_check_levels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception '자기 안에는 넣을 수 없어요';
    end if;
    if exists (select 1 from public.locations where id = new.parent_id and parent_id is not null) then
      raise exception '세부 위치 안에는 또 넣을 수 없어요 (2단계까지)';
    end if;
    if exists (select 1 from public.locations where parent_id = new.id) then
      raise exception '세부 위치가 있는 장소는 다른 장소 안에 넣을 수 없어요';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists locations_check_levels on public.locations;
create trigger locations_check_levels
  before insert or update on public.locations
  for each row execute function public.locations_check_levels();

-- 물건에 적혀 있는 위치를 장소 목록에 넣어요 (예전 위치는 큰 장소가 돼요)
insert into public.locations (name)
select distinct left(replace(btrim(split_part(location, ' › ', 1)), '›', '>'), 40)
from public.items
where btrim(split_part(location, ' › ', 1)) <> ''
on conflict do nothing;

insert into public.locations (name, parent_id)
select distinct left(replace(btrim(split_part(i.location, ' › ', 2)), '›', '>'), 40), p.id
from public.items i
join public.locations p
  on p.parent_id is null and lower(btrim(p.name)) = lower(btrim(split_part(i.location, ' › ', 1)))
where position(' › ' in i.location) > 0
  and btrim(split_part(i.location, ' › ', 2)) <> ''
on conflict do nothing;


-- 5) 고칠 때마다 수정 날짜 자동 기록 ─────────────────────────────

create or replace function public.items_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.items_touch_updated_at();


-- 6) 비밀 문구 확인 ─────────────────────────────────────────────
--    앱이 요청마다 보내는 값(x-room-key)이 보관함의 값과 같은지 확인해요.

create or replace function public.room_key_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.room_secret s
    where s.key_hash = coalesce(
      nullif(current_setting('request.headers', true), '')::json ->> 'x-room-key',
      ''
    )
  );
$$;

revoke all on function public.room_key_ok() from public;
grant execute on function public.room_key_ok() to anon, authenticated;


-- 7) 이름 바꾸기 · 옮기기 · 지우기 ───────────────────────────────
--    장소나 카테고리 이름이 바뀌면 그 안 물건에 적힌 이름도 한 번에 같이 바꿔요.
--    (비밀 문구가 맞을 때만 동작해요 — 아래 잠금 규칙이 그대로 적용돼요)

create or replace function public.rename_location(loc uuid, new_name text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
  nm text := btrim(coalesce(new_name, ''));
  old_path text;
  new_path text;
begin
  select l.id, l.name, l.parent_id, p.name as parent_name into r
  from public.locations l
  left join public.locations p on p.id = l.parent_id
  where l.id = loc;
  if not found then
    raise exception using errcode = 'P0002', message = '위치를 찾지 못했어요';
  end if;
  if nm = '' then
    raise exception '이름을 적어주세요';
  end if;

  old_path := case when r.parent_id is null then r.name else r.parent_name || ' › ' || r.name end;
  new_path := case when r.parent_id is null then nm else r.parent_name || ' › ' || nm end;

  update public.locations set name = nm where id = loc;
  update public.items set location = new_path where location = old_path;
  if r.parent_id is null then
    update public.items
       set location = new_path || substr(location, char_length(old_path) + 1)
     where left(location, char_length(old_path) + 3) = old_path || ' › ';
  end if;
end;
$$;

-- new_parent 가 비어 있으면 큰 장소로 꺼내기
create or replace function public.move_location(loc uuid, new_parent uuid, new_name text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
  target_name text;
  nm text;
  old_path text;
  new_path text;
begin
  select l.id, l.name, l.parent_id, p.name as parent_name into r
  from public.locations l
  left join public.locations p on p.id = l.parent_id
  where l.id = loc;
  if not found then
    raise exception using errcode = 'P0002', message = '위치를 찾지 못했어요';
  end if;
  if new_parent is not null then
    select name into target_name from public.locations where id = new_parent and parent_id is null;
    if not found then
      raise exception using errcode = 'P0002', message = '옮길 장소를 찾지 못했어요';
    end if;
  end if;

  nm := coalesce(nullif(btrim(coalesce(new_name, '')), ''), r.name);
  old_path := case when r.parent_id is null then r.name else r.parent_name || ' › ' || r.name end;
  new_path := case when new_parent is null then nm else target_name || ' › ' || nm end;

  update public.locations set parent_id = new_parent, name = nm where id = loc;
  update public.items set location = new_path where location = old_path;
  if r.parent_id is null and new_parent is null then
    update public.items
       set location = new_path || substr(location, char_length(old_path) + 1)
     where left(location, char_length(old_path) + 3) = old_path || ' › ';
  end if;
end;
$$;

-- 큰 장소를 지우면 안의 물건은 '위치 미정', 세부 위치를 지우면 그 큰 장소에 바로 놓여요
create or replace function public.delete_location(loc uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  select l.id, l.name, l.parent_id, p.name as parent_name into r
  from public.locations l
  left join public.locations p on p.id = l.parent_id
  where l.id = loc;
  if not found then
    raise exception using errcode = 'P0002', message = '위치를 찾지 못했어요';
  end if;

  if r.parent_id is null then
    update public.items set location = ''
     where location = r.name or left(location, char_length(r.name) + 3) = r.name || ' › ';
  else
    update public.items set location = r.parent_name
     where location = r.parent_name || ' › ' || r.name;
  end if;
  delete from public.locations where id = loc;
end;
$$;

create or replace function public.rename_category(cat uuid, new_name text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  old_name text;
  nm text := btrim(coalesce(new_name, ''));
begin
  select name into old_name from public.categories where id = cat;
  if not found then
    raise exception using errcode = 'P0002', message = '카테고리를 찾지 못했어요';
  end if;
  if nm = '' then
    raise exception '이름을 적어주세요';
  end if;
  if old_name = '기타' then
    raise exception '‘기타’는 이름을 바꿀 수 없어요';
  end if;

  update public.categories set name = nm where id = cat;
  update public.items set category = nm where category = old_name;
end;
$$;

-- 카테고리를 지우면 그 물건들은 '기타'로 가요
create or replace function public.delete_category(cat uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  old_name text;
begin
  select name into old_name from public.categories where id = cat;
  if not found then
    raise exception using errcode = 'P0002', message = '카테고리를 찾지 못했어요';
  end if;
  if old_name = '기타' then
    raise exception '‘기타’는 지울 수 없어요';
  end if;

  insert into public.categories (name, icon, sort) values ('기타', 'package', 1000)
  on conflict do nothing;
  update public.items set category = '기타' where category = old_name;
  delete from public.categories where id = cat;
end;
$$;

revoke all on function public.rename_location(uuid, text) from public;
revoke all on function public.move_location(uuid, uuid, text) from public;
revoke all on function public.delete_location(uuid) from public;
revoke all on function public.rename_category(uuid, text) from public;
revoke all on function public.delete_category(uuid) from public;
grant execute on function public.rename_location(uuid, text) to anon, authenticated;
grant execute on function public.move_location(uuid, uuid, text) to anon, authenticated;
grant execute on function public.delete_location(uuid) to anon, authenticated;
grant execute on function public.rename_category(uuid, text) to anon, authenticated;
grant execute on function public.delete_category(uuid) to anon, authenticated;


-- 8) 잠금 규칙 ───────────────────────────────────────────────────
--    비밀 문구가 맞을 때만 보고 · 넣고 · 고치고 · 지울 수 있어요.

alter table public.items enable row level security;
drop policy if exists "비밀 문구가 맞을 때만" on public.items;
create policy "비밀 문구가 맞을 때만"
  on public.items
  for all
  to anon, authenticated
  using ((select public.room_key_ok()))
  with check ((select public.room_key_ok()));

alter table public.categories enable row level security;
drop policy if exists "비밀 문구가 맞을 때만" on public.categories;
create policy "비밀 문구가 맞을 때만"
  on public.categories
  for all
  to anon, authenticated
  using ((select public.room_key_ok()))
  with check ((select public.room_key_ok()));

alter table public.locations enable row level security;
drop policy if exists "비밀 문구가 맞을 때만" on public.locations;
create policy "비밀 문구가 맞을 때만"
  on public.locations
  for all
  to anon, authenticated
  using ((select public.room_key_ok()))
  with check ((select public.room_key_ok()));

grant select, insert, update, delete on table public.items to anon, authenticated;
grant select, insert, update, delete on table public.categories to anon, authenticated;
grant select, insert, update, delete on table public.locations to anon, authenticated;


-- 끝 ─────────────────────────────────────────────────────────────
select case
  when exists (select 1 from private.room_secret)
    then 'ROOMY 설정 완료! (장소 · 카테고리 업데이트 포함) 비밀 문구도 이미 정해져 있어요.'
  else '1단계 완료! 이제 2단계: 비밀문구.sql 한 줄을 실행해 주세요.'
end as "결과";
