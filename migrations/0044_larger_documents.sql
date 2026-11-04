-- 0044: first-party documents (Docs, Sheets, boards) may be up to 1,000,000 characters (was 200,000), so long formatted documents and
-- larger spreadsheets can be saved. Additive: the check only widens; no row changes.
alter table public.file_versions drop constraint file_versions_body_check;
alter table public.file_versions add constraint file_versions_body_check check (length(body) <= 1000000);
