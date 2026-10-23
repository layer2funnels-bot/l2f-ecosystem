-- Form Builder (Design v4, final): eleven field types, help text, number/length limits, file limits, "show if" logic, a confirmation message and redirect,
-- a retention note and a template flag. Versions stay immutable and every submission stays tied to the version it answered. Public publishing and
-- embedding are NOT part of this migration (no public path exists). Additive and local-only until the owner approves the go-live package.
alter table public.forms
  add column confirmation_message text check (length(confirmation_message) <= 1000),
  add column redirect_url text check (redirect_url ~ '^https://[^[:space:]]+$' and length(redirect_url) <= 500),
  add column retention_note text check (length(retention_note) <= 500),
  add column is_template boolean not null default false;

-- what a version may contain
create or replace function private.form_fields_valid(f jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; seen text[] := '{}'; t text; o jsonb; s jsonb; a jsonb;
begin
  if jsonb_typeof(f) <> 'array' then return 'fields must be a list'; end if;
  if jsonb_array_length(f) > 60 then return 'at most 60 fields'; end if;
  if octet_length(f::text) > 60000 then return 'the form is too large'; end if;
  for e in select * from jsonb_array_elements(f) loop
    if jsonb_typeof(e) <> 'object' then return 'each field must be an object'; end if;
    k := e ->> 'key'; t := e ->> 'type';
    if k is null or k !~ '^[a-z][a-z0-9_]{0,39}$' then return 'a field key is missing or invalid'; end if;
    if k = any(seen) then return 'duplicate field key ' || k; end if;
    if t is null or t not in ('text', 'textarea', 'email', 'phone', 'url', 'number', 'date', 'select', 'multi_select', 'checkbox', 'file') then return 'unknown field type for ' || k; end if;
    if e ->> 'label' is null or length(e ->> 'label') not between 1 and 200 then return 'a field label is missing or too long'; end if;
    if e ? 'required' and jsonb_typeof(e -> 'required') <> 'boolean' then return 'required must be true or false'; end if;
    if e ? 'help' and (jsonb_typeof(e -> 'help') <> 'string' or length(e ->> 'help') > 300) then return 'help text is too long (' || k || ')'; end if;
    if t in ('select', 'multi_select') then
      o := e -> 'options';
      if o is null or jsonb_typeof(o) <> 'array' or jsonb_array_length(o) not between 1 and 50 then return 'choices need 1 to 50 options (' || k || ')'; end if;
      if exists (select 1 from jsonb_array_elements(o) x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') not between 1 and 100) then return 'options must be short text (' || k || ')'; end if;
    end if;
    if (e ? 'min' or e ? 'max') then
      if t not in ('number', 'text', 'textarea') then return 'limits only apply to numbers and text (' || k || ')'; end if;
      if (e ? 'min' and jsonb_typeof(e -> 'min') <> 'number') or (e ? 'max' and jsonb_typeof(e -> 'max') <> 'number') then return 'limits must be numbers (' || k || ')'; end if;
      if e ? 'min' and e ? 'max' and (e ->> 'min')::numeric > (e ->> 'max')::numeric then return 'the minimum is above the maximum (' || k || ')'; end if;
      if t <> 'number' and ((e ? 'min' and ((e ->> 'min')::numeric < 0 or (e ->> 'min')::numeric > 10000)) or (e ? 'max' and ((e ->> 'max')::numeric < 1 or (e ->> 'max')::numeric > 10000))) then return 'text limits are 0 to 10000 (' || k || ')'; end if;
    end if;
    if t = 'file' then
      if e ? 'accept' then
        a := e -> 'accept';
        if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 10 or exists (select 1 from jsonb_array_elements(a) x where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[a-z0-9]{1,8}$') then return 'accepted file types are short lower-case extensions (' || k || ')'; end if;
      end if;
      if e ? 'max_mb' and (jsonb_typeof(e -> 'max_mb') <> 'number' or (e ->> 'max_mb')::numeric not between 1 and 25) then return 'file size limit is 1 to 25 MB (' || k || ')'; end if;
    elsif e ? 'accept' or e ? 'max_mb' then return 'file limits only apply to file fields (' || k || ')'; end if;
    if e ? 'show_if' then
      s := e -> 'show_if';
      if jsonb_typeof(s) <> 'object' or s ->> 'key' is null or not (s ->> 'key') = any(seen) then return 'show-if must point at an earlier field (' || k || ')'; end if;
      if (s ->> 'op') is null or (s ->> 'op') not in ('eq', 'neq', 'filled', 'empty') then return 'show-if needs an operator (' || k || ')'; end if;
      if (s ->> 'op') in ('eq', 'neq') and (not s ? 'value' or jsonb_typeof(s -> 'value') not in ('string', 'number', 'boolean') or length(s ->> 'value') > 100) then return 'show-if needs a short value (' || k || ')'; end if;
    end if;
    seen := seen || k;
  end loop;
  return null;
end $$;

-- answers against the version they were given for
create or replace function private.form_answers_valid(f jsonb, a jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; t text; v jsonb; s jsonb; sv jsonb; vis boolean; hit boolean; n int;
begin
  if jsonb_typeof(a) <> 'object' then return 'answers must be an object'; end if;
  if octet_length(a::text) > 100000 then return 'answers are too large'; end if;
  if exists (select 1 from jsonb_object_keys(a) ak where not exists (select 1 from jsonb_array_elements(f) fe where fe ->> 'key' = ak)) then return 'an answer does not belong to this form'; end if;
  for e in select * from jsonb_array_elements(f) loop
    k := e ->> 'key'; t := e ->> 'type'; v := a -> k; vis := true;
    if e ? 'show_if' then
      s := e -> 'show_if'; sv := a -> (s ->> 'key');
      hit := case s ->> 'op'
        when 'eq' then coalesce(sv = (s -> 'value') or (jsonb_typeof(sv) = 'array' and sv @> jsonb_build_array(s -> 'value')), false)
        when 'neq' then not coalesce(sv = (s -> 'value') or (jsonb_typeof(sv) = 'array' and sv @> jsonb_build_array(s -> 'value')), false)
        when 'filled' then not (sv is null or sv = 'null'::jsonb or sv = '""'::jsonb or sv = '[]'::jsonb)
        else (sv is null or sv = 'null'::jsonb or sv = '""'::jsonb or sv = '[]'::jsonb) end;
      vis := hit;
    end if;
    if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
      if vis and coalesce((e ->> 'required')::boolean, false) and t <> 'checkbox' then return 'required: ' || k; end if;
      continue;
    end if;
    if not vis then return 'an answer for a hidden question: ' || k; end if;
    if t in ('text', 'textarea') and (jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 10000) then return 'text expected: ' || k; end if;
    if t in ('text', 'textarea') and ((e ? 'min' and length(v #>> '{}') < (e ->> 'min')::numeric) or (e ? 'max' and length(v #>> '{}') > (e ->> 'max')::numeric)) then return 'wrong length: ' || k; end if;
    if t = 'email' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[^\s@]{1,64}@[^\s@]{1,255}$') then return 'e-mail expected: ' || k; end if;
    if t = 'phone' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[-+0-9 ()]{5,30}$') then return 'phone number expected: ' || k; end if;
    if t = 'url' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^https?://[^\s]+$' or length(v #>> '{}') > 2000) then return 'web address expected: ' || k; end if;
    if t = 'number' and jsonb_typeof(v) <> 'number' then return 'number expected: ' || k; end if;
    if t = 'number' and ((e ? 'min' and (v #>> '{}')::numeric < (e ->> 'min')::numeric) or (e ? 'max' and (v #>> '{}')::numeric > (e ->> 'max')::numeric)) then return 'out of range: ' || k; end if;
    if t = 'date' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') then return 'date expected: ' || k; end if;
    if t = 'checkbox' and jsonb_typeof(v) <> 'boolean' then return 'yes or no expected: ' || k; end if;
    if t = 'select' and not (e -> 'options') @> jsonb_build_array(v) then return 'one of the options expected: ' || k; end if;
    if t = 'multi_select' and (jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements(v) x where not (e -> 'options') @> jsonb_build_array(x))) then return 'options expected: ' || k; end if;
    if t = 'file' then
      if jsonb_typeof(v) <> 'array' then return 'files expected: ' || k; end if;
      n := jsonb_array_length(v);
      if n > 10 or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return 'files expected: ' || k; end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function private.form_fields_valid(jsonb), private.form_answers_valid(jsonb, jsonb) from public;
