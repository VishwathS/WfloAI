create table if not exists public.workflow_files (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  page_count integer,
  storage_path text not null,
  extracted_text text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists workflow_files_workflow_id_idx
on public.workflow_files (workflow_id);

create index if not exists workflow_files_user_id_idx
on public.workflow_files (user_id);

alter table public.workflow_files enable row level security;

drop policy if exists "Users can select their own workflow files" on public.workflow_files;
create policy "Users can select their own workflow files"
on public.workflow_files
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workflow files" on public.workflow_files;
create policy "Users can insert their own workflow files"
on public.workflow_files
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workflows
    where id = workflow_id
    and user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own workflow files" on public.workflow_files;
create policy "Users can delete their own workflow files"
on public.workflow_files
for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('workflow-files', 'workflow-files', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own workflow files" on storage.objects;
create policy "Users can upload their own workflow files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'workflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read their own workflow files" on storage.objects;
create policy "Users can read their own workflow files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'workflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own workflow file objects" on storage.objects;
create policy "Users can delete their own workflow file objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'workflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
