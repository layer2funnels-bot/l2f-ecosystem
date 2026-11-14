-- ROLLBACK of 0055 (profile details). Run only with the owner's approval, in one transaction, after the app code that calls
-- profile.details / profile.details.set has been rolled back. Deletes the four optional fields people typed (full name, job title,
-- time zone, about); display name, email and photo (0012/0041) are untouched. Export them first if they should be kept (see the doc).
begin;
drop function if exists public.profile_details_set(text, text, text, text);
drop function if exists public.profile_details();
alter table public.profiles drop column if exists about, drop column if exists time_zone, drop column if exists job_title, drop column if exists full_name;
commit;
