-- «Долг пятёрками»: таблицы, доступ для всех и живые обновления.
-- Вставь целиком в Supabase → SQL Editor → New query и нажми Run.
-- Скрипт можно запускать повторно: уже записанные данные он не трогает.

-- Сумма долга (одна строка, id = 1)
create table if not exists public.settings (
  id    int primary key default 1 check (id = 1),
  debt  int not null check (debt >= 0)
);
insert into public.settings (id, debt) values (1, 2000) on conflict (id) do nothing;

-- Пятёрки
create table if not exists public.fives (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null check (char_length(subject) between 1 and 60),
  price       int  not null check (price in (100, 200)),
  count       int  not null check (count between 1 and 20),
  amount      int  not null check (amount = price * count),
  date        date not null,
  created_at  timestamptz not null default now()
);

-- Доступ: любой, у кого есть ссылка на приложение, читает и меняет данные
alter table public.settings enable row level security;
alter table public.fives    enable row level security;

drop policy if exists "settings: read"   on public.settings;
drop policy if exists "settings: insert" on public.settings;
drop policy if exists "settings: update" on public.settings;
create policy "settings: read"   on public.settings for select to anon, authenticated using (true);
create policy "settings: insert" on public.settings for insert to anon, authenticated with check (id = 1);
create policy "settings: update" on public.settings for update to anon, authenticated using (true) with check (id = 1);

drop policy if exists "fives: read"   on public.fives;
drop policy if exists "fives: insert" on public.fives;
drop policy if exists "fives: delete" on public.fives;
create policy "fives: read"   on public.fives for select to anon, authenticated using (true);
create policy "fives: insert" on public.fives for insert to anon, authenticated with check (true);
create policy "fives: delete" on public.fives for delete to anon, authenticated using (true);

grant select, insert, update on public.settings to anon, authenticated;
grant select, insert, delete on public.fives    to anon, authenticated;

-- Живые обновления: изменения сразу видны на всех телефонах
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fives') then
    alter publication supabase_realtime add table public.fives;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settings') then
    alter publication supabase_realtime add table public.settings;
  end if;
end $$;
