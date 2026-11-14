-- ROLLBACK of 0056 (Office V8). Run only with the owner's approval, after the app code that uses it is rolled back.
-- Removes the new offer/story/brand-kit fields people filled, the strategy template versions and the document sections (the Drive
-- folders and files themselves are not touched).
begin;
drop table if exists public.doc_sections;
alter table public.funnel_strategies drop column if exists template_version;
drop table if exists public.strategy_templates;
drop index if exists public.funnel_brand_kits_one_main;
alter table public.funnel_brand_kits drop column if exists asset_file_ids, drop column if exists voice_never, drop column if exists voice_say,
  drop column if exists icon_file_id, drop column if exists logo_dark_file_id, drop column if exists is_main;
alter table public.funnel_stories drop column if exists use_in, drop column if exists consent_file_id, drop column if exists permission,
  drop column if exists best_quote, drop column if exists after_text, drop column if exists before_text;
alter table public.funnel_offers drop column if exists internal_notes, drop column if exists ladder_step, drop column if exists avatar_ids,
  drop column if exists bonuses, drop column if exists included, drop column if exists delivery_time, drop column if exists guarantee,
  drop column if exists billing, drop column if exists status, drop column if exists offer_type;
commit;
