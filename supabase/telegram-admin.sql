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

-- The server reads and writes the owner's current draft directly (outside
-- the publish transaction below), and only reads version history. Keep its
-- ACLs explicit; it never needs browser grants.
grant select, insert, update on table public.editor_content_drafts to service_role;
grant select on table public.editor_content_versions to service_role;
grant insert on table public.editor_audit to service_role;
grant usage, select on sequence public.editor_audit_id_seq to service_role;
grant select on table public.site_content to service_role;

-- Publish, version, clear the private draft, and audit as one database
-- transaction. If the live revision changed, nothing is written.
drop function if exists public.publish_telegram_content(jsonb, timestamptz, bigint, text, text);

create or replace function public.publish_telegram_content(
  p_content jsonb,
  p_expected_revision timestamptz,
  p_editor_id text,
  p_editor_name text,
  p_summary text
)
returns table (content jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  published_row record;
begin
  update public.site_content as live
  set content = p_content,
      updated_at = clock_timestamp()
  where live.id = 'live' and live.updated_at = p_expected_revision
  returning live.content, live.updated_at into published_row;

  if not found then
    raise exception 'The live site changed while this publish was in progress.'
      using errcode = 'P0001';
  end if;

  insert into public.editor_content_versions (
    editor_id, editor_name, content, summary, published_at
  ) values (
    p_editor_id, p_editor_name, published_row.content, p_summary, published_row.updated_at
  );

  delete from public.editor_content_drafts where editor_id = p_editor_id;

  insert into public.editor_audit (
    editor_id, editor_name, action, summary, metadata
  ) values (
    p_editor_id, p_editor_name, 'published', p_summary,
    jsonb_build_object('revision', published_row.updated_at)
  );

  return query select published_row.content, published_row.updated_at;
end;
$$;

revoke all on function public.publish_telegram_content(jsonb, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.publish_telegram_content(jsonb, timestamptz, text, text, text)
  to service_role;

-- Retire the former direct-browser editor path. Public SELECT remains so the
-- public site can still read site_content, but writes now require the server.
alter table public.site_content enable row level security;
revoke insert, update, delete on table public.site_content from public, anon, authenticated;

-- The Mini App uploads through the verified server route. This revokes direct
-- browser mutations for Supabase Storage. Keep public reads configured for the
-- site-assets bucket if the site uses uploaded artwork publicly.
revoke insert, update, delete on table storage.objects from public, anon, authenticated;
