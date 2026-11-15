-- Rollback of 0057 (Customer Avatar Studio). Drops the versions table and the new columns; avatars keep name, summary, pains, desires, objections.
drop table if exists public.avatar_versions;
alter table public.funnel_avatars drop column if exists tagline, drop column if exists role, drop column if exists market, drop column if exists look,
  drop column if exists stage, drop column if exists version, drop column if exists profile, drop column if exists source_file_id;
