-- Secure Telegram Mini App editor
--
-- Run this once in Supabase SQL Editor before enabling the Telegram editor.
-- It creates server-only draft, version, and audit stores, and disables the
-- legacy browser-admin write path. The service-role key used by server.mjs
-- bypasses RLS; no browser receives that key.

begin;

create extension if not exists pgcrypto;

-- Security-definer publishing never needs object creation in this schema.
-- Removing the default public CREATE permission prevents object-shadowing.
revoke create on schema public from public;

create table if not exists public.editor_content_drafts (
  editor_id text primary key,
  editor_name text not null,
  content jsonb not null,
  base_revision timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.editor_content_versions (
  id uuid primary key default gen_random_uuid(),
  editor_id text not null,
  editor_name text not null,
  content jsonb not null,
  summary text not null,
  published_at timestamptz not null default now()
);

create table if not exists public.editor_audit (
  id bigint generated always as identity primary key,
  editor_id text not null,
  editor_name text not null,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists editor_content_versions_published_at_idx
  on public.editor_content_versions (published_at desc);
create index if not exists editor_audit_created_at_idx
  on public.editor_audit (created_at desc);

-- Preserve existing records from any early bigint-based installation while
-- avoiding JavaScript/Postgres integer precision coupling for Telegram IDs.
alter table public.editor_content_drafts
  alter column editor_id type text using editor_id::text;
alter table public.editor_content_versions
  alter column editor_id type text using editor_id::text;
alter table public.editor_audit
  alter column editor_id type text using editor_id::text;

alter table public.editor_content_drafts enable row level security;
alter table public.editor_content_versions enable row level security;
alter table public.editor_audit enable row level security;

-- No policies are deliberately defined: anon/authenticated browser roles get
-- no access. Supabase's service_role key is used only by the application
-- server after Telegram initData and allowlist verification.
revoke all on table public.editor_content_drafts from public, anon, authenticated;
revoke all on table public.editor_content_versions from public, anon, authenticated;
revoke all on table public.editor_audit from public, anon, authenticated;

-- The server reads the owner's current draft and version history directly.
-- All draft mutations run inside the security-definer functions below.
grant select on table public.editor_content_drafts to service_role;
grant select on table public.editor_content_versions to service_role;
grant insert on table public.editor_audit to service_role;
grant usage, select on sequence public.editor_audit_id_seq to service_role;
grant select on table public.site_content to service_role;

-- Draft writes are compare-and-swap operations. A second owner tab cannot
-- overwrite a newer draft, and the draft mutation and its audit entry commit
-- together.
drop function if exists public.save_telegram_draft(jsonb, timestamptz, text, text, timestamptz, text, text, jsonb);

create or replace function public.save_telegram_draft(
  p_content jsonb,
  p_base_revision timestamptz,
  p_editor_id text,
  p_editor_name text,
  p_expected_draft_revision timestamptz,
  p_action text,
  p_summary text,
  p_metadata jsonb
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_at timestamptz;
begin
  if p_action not in ('draft_saved', 'version_restored_to_draft') then
    raise exception 'Unsupported draft audit action.' using errcode = '22023';
  end if;

  if p_expected_draft_revision is null then
    insert into public.editor_content_drafts (
      editor_id, editor_name, content, base_revision, updated_at
    ) values (
      p_editor_id, p_editor_name, p_content, p_base_revision, pg_catalog.clock_timestamp()
    )
    on conflict (editor_id) do nothing
    returning public.editor_content_drafts.updated_at into saved_at;
  else
    update public.editor_content_drafts as draft
    set editor_name = p_editor_name,
        content = p_content,
        base_revision = p_base_revision,
        updated_at = pg_catalog.clock_timestamp()
    where draft.editor_id = p_editor_id
      and draft.updated_at = p_expected_draft_revision
    returning draft.updated_at into saved_at;
  end if;

  if not found then
    raise exception 'The draft changed while this request was in progress.' using errcode = 'P0001';
  end if;

  insert into public.editor_audit (
    editor_id, editor_name, action, summary, metadata
  ) values (
    p_editor_id, p_editor_name, p_action, p_summary, coalesce(p_metadata, '{}'::jsonb)
  );

  return query select saved_at;
end;
$$;

revoke all on function public.save_telegram_draft(jsonb, timestamptz, text, text, timestamptz, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_telegram_draft(jsonb, timestamptz, text, text, timestamptz, text, text, jsonb)
  to service_role;

-- Publish exactly the stored, reviewed draft. The row lock makes a concurrent
-- save fail safely instead of losing the newer draft. Versioning, publish,
-- draft removal, and audit logging are one transaction.
drop function if exists public.publish_telegram_content(jsonb, timestamptz, bigint, text, text);
drop function if exists public.publish_telegram_content(jsonb, timestamptz, text, text, text);

create or replace function public.publish_telegram_content(
  p_expected_revision timestamptz,
  p_editor_id text,
  p_editor_name text,
  p_summary text,
  p_expected_draft_revision timestamptz
)
returns table (content jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_row record;
  published_row record;
begin
  if p_expected_draft_revision is null then
    raise exception 'Save a draft before publishing.' using errcode = 'P0001';
  end if;

  select draft.content, draft.updated_at into draft_row
  from public.editor_content_drafts as draft
  where draft.editor_id = p_editor_id
    and draft.updated_at = p_expected_draft_revision
  for update;

  if not found then
    raise exception 'The draft changed while this publish was in progress.' using errcode = 'P0001';
  end if;

  update public.site_content as live
  set content = draft_row.content,
      updated_at = pg_catalog.clock_timestamp()
  where live.id = 'live' and live.updated_at = p_expected_revision
  returning live.content, live.updated_at into published_row;

  if not found then
    raise exception 'The live site changed while this publish was in progress.' using errcode = 'P0001';
  end if;

  insert into public.editor_content_versions (
    editor_id, editor_name, content, summary, published_at
  ) values (
    p_editor_id, p_editor_name, published_row.content, p_summary, published_row.updated_at
  );

  delete from public.editor_content_drafts as draft
  where draft.editor_id = p_editor_id
    and draft.updated_at = p_expected_draft_revision;

  insert into public.editor_audit (
    editor_id, editor_name, action, summary, metadata
  ) values (
    p_editor_id, p_editor_name, 'published', p_summary,
    pg_catalog.jsonb_build_object('revision', published_row.updated_at)
  );

  return query select published_row.content, published_row.updated_at;
end;
$$;

revoke all on function public.publish_telegram_content(timestamptz, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.publish_telegram_content(timestamptz, text, text, text, timestamptz)
  to service_role;

-- Retire the former browser editor path. Public visitors can read only the
-- live row; all writes now require the verified server and service role.
alter table public.site_content enable row level security;
revoke insert, update, delete on table public.site_content from public, anon, authenticated;
grant select on table public.site_content to anon, authenticated;
drop policy if exists "Public can read live site content" on public.site_content;
create policy "Public can read live site content"
  on public.site_content
  for select
  to anon, authenticated
  using (id = 'live');

-- The Mini App uploads through the verified server route. This revokes direct
-- browser mutations for Supabase Storage. Keep public reads configured for the
-- site-assets bucket if the site uses uploaded artwork publicly.
revoke insert, update, delete on table storage.objects from public, anon, authenticated;

commit;
