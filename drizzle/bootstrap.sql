-- Shadow Visit — one-time bootstrap. Run after migrations. Re-runnable.
--
-- Auto-create a public.profiles row whenever a new auth.users row appears
-- (magic-link sign-in). Without this, authenticated users have no profile and
-- the app treats them as logged out.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'full_name',
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill profiles for anyone who signed up before the trigger existed.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name',
  'student'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
