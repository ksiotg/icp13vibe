-- ════════════════════════════════════════════════════════════════════
--  ROOMY · Supabase 설정 명령문
-- ════════════════════════════════════════════════════════════════════
--  사용법 (자세한 건 설정안내.md 3단계)
--   1. 이 파일 내용을 전부 복사해서 Supabase > SQL Editor 에 붙여넣기
--   2. 아래 ▼ 표시된 줄에서 '여기에-비밀-문구' 를 내 비밀 문구로 바꾸기
--   3. Run 누르기 → 맨 아래에 "ROOMY 설정 완료" 가 나오면 끝
--
--  · 여러 번 실행해도 괜찮아요. 이미 넣은 물건은 지워지지 않아요.
--  · 비밀 문구를 바꾸고 싶을 때도, 새 문구로 이 파일을 다시 실행하면 돼요.
--  · 바꾼 비밀 문구는 이 파일(GitHub)에 저장하지 마세요. Supabase 화면에서만 바꾸세요.
-- ════════════════════════════════════════════════════════════════════


-- 1) 비밀 문구 보관함 ───────────────────────────────────────────────
--    앱에서는 절대 볼 수 없는 곳(private)에, 문구 자체가 아니라
--    문구를 알아볼 수 없게 바꾼 값(해시)만 보관해요.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.room_secret (
  id        integer primary key default 1 check (id = 1),
  key_hash  text not null
);
alter table private.room_secret enable row level security;
revoke all on table private.room_secret from public, anon, authenticated;

do $$
declare
  -- ▼▼▼ 여기 따옴표 안을 내 비밀 문구로 바꾸세요 (영어 소문자·숫자로 8자 이상 추천) ▼▼▼
  phrase text := '여기에-비밀-문구';
  -- ▲▲▲
begin
  phrase := btrim(phrase);
  if phrase = '' or phrase = '여기에-비밀-문구' then
    raise exception '비밀 문구를 먼저 정해주세요 → ▼ 표시된 줄의 따옴표 안을 내 문구로 바꾼 뒤 다시 Run 하세요.';
  end if;
  if char_length(phrase) < 4 then
    raise exception '비밀 문구가 너무 짧아요. 4자 이상(8자 이상 추천)으로 정해주세요.';
  end if;

  insert into private.room_secret (id, key_hash)
  values (1, encode(sha256(convert_to(normalize(phrase, NFC), 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
end;
$$;


-- 2) 물건 표 ─────────────────────────────────────────────────────
--    물건 하나 = 한 줄. 칸마다 들어갈 수 있는 값을 정해둬요.

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  location    text not null default '' check (char_length(location) <= 100),
  category    text not null default '기타'
              check (category in ('문구', '전자기기', '옷', '화장품', '생활용품', '기타')),
  quantity    integer not null default 1 check (quantity between 1 and 99999),
  status      text not null default '가끔 씀'
              check (status in ('자주 씀', '가끔 씀', '안 씀', '처분 예정')),
  icon        text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'),
  memo        text not null default '' check (char_length(memo) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.items is 'ROOMY: 내 방 물건 목록 (물건 하나 = 한 줄)';


-- 3) 고칠 때마다 수정 날짜 자동 기록 ─────────────────────────────

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


-- 4) 비밀 문구 확인 ─────────────────────────────────────────────
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


-- 5) 잠금 규칙 ───────────────────────────────────────────────────
--    비밀 문구가 맞을 때만 물건을 보고·넣고·고치고·지울 수 있어요.

alter table public.items enable row level security;

drop policy if exists "비밀 문구가 맞을 때만" on public.items;
create policy "비밀 문구가 맞을 때만"
  on public.items
  for all
  to anon, authenticated
  using ((select public.room_key_ok()))
  with check ((select public.room_key_ok()));

grant select, insert, update, delete on table public.items to anon, authenticated;


-- 끝 ─────────────────────────────────────────────────────────────
select 'ROOMY 설정 완료! 이제 앱에서 비밀 문구로 열 수 있어요.' as "결과";
