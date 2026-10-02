-- Shadow Visit — one-time bootstrap. Run after migrations. Re-runnable.
--
-- Auto-create a public.profiles row whenever a new auth.users row appears
-- (magic-link sign-in). Without this, authenticated users have no profile and
-- the app treats them as logged out.

-- Standing rule (2026-08-27): only these two emails may ever land as admin
-- via auto-provisioning. Everyone else always starts as 'student' regardless
-- of signup metadata. Update this list, not the app, if that changes.
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
    (case
      when lower(new.email) in ('riversf@greenhill.org', 'abbondanziom@greenhill.org')
        then 'admin'
      else 'student'
    end)::public.user_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill profiles for anyone whose auth.users row predates their profile.
--
-- This must apply the SAME admin rule as the trigger above. It used to
-- hardcode 'student', which quietly contradicted the standing rule twenty
-- lines up: any database where the auth.users rows already exist — a
-- restored environment, or one where only the public schema was reset, since
-- auth.users lives in the auth schema and survives that — got its admins
-- backfilled as students, locking them out of /admin with no error.
--
-- Also re-asserts the role for profiles that already exist, so running this
-- file is enough to repair a database that has already been mis-backfilled.
insert into public.profiles (id, email, first_name, last_name, full_name, role)
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'first_name',
  u.raw_user_meta_data->>'last_name',
  u.raw_user_meta_data->>'full_name',
  (case
    when lower(u.email) in ('riversf@greenhill.org', 'abbondanziom@greenhill.org')
      then 'admin'
    else 'student'
  end)::public.user_role
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Repair pass: promote the standing admins if an earlier run demoted them.
-- Deliberately one-way — it never demotes anyone, so an admin granted
-- manually in the app keeps their role.
update public.profiles
set role = 'admin'
where lower(email) in ('riversf@greenhill.org', 'abbondanziom@greenhill.org')
  and role <> 'admin';
