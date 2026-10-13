create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  price numeric(14, 2) check (price is null or price >= 0),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  listing_type text not null check (listing_type in ('sale', 'rent')),
  property_type text not null check (property_type in ('house', 'apartment', 'villa', 'land', 'duplex', 'other')),
  city text not null default '',
  state text not null default '',
  neighborhood text not null default '',
  address text,
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  bathrooms numeric(4, 1) check (bathrooms is null or bathrooms >= 0),
  toilets integer check (toilets is null or toilets >= 0),
  area_sqm numeric(12, 2) check (area_sqm is null or area_sqm > 0),
  land_area_sqm numeric(12, 2) check (land_area_sqm is null or land_area_sqm > 0),
  parking_spaces integer check (parking_spaces is null or parking_spaces >= 0),
  amenities text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint published_requires_timestamp check (status <> 'published' or published_at is not null)
);

create table if not exists public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '' check (length(trim(alt_text)) <= 500),
  caption text check (caption is null or length(caption) <= 500),
  display_order integer not null default 0 check (display_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.property_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists properties_status_updated_idx on public.properties(status, updated_at desc);
create index if not exists properties_published_idx on public.properties(published_at desc) where status = 'published';
create index if not exists properties_listing_filter_idx on public.properties(listing_type, property_type, state, city) where status = 'published';
create index if not exists property_images_order_idx on public.property_images(property_id, display_order);
create unique index if not exists property_images_one_cover_idx on public.property_images(property_id) where is_cover;

create or replace function public.set_property_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at before update on public.properties
for each row execute function public.set_property_updated_at();

create or replace function public.is_property_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.property_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_property_admin() from public;
grant execute on function public.is_property_admin() to authenticated;

create or replace function public.replace_property_images(_property_id uuid, _images jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  cover_count integer;
begin
  if not public.is_property_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if _images is null or jsonb_typeof(_images) <> 'array' then
    raise exception 'Image data must be an array' using errcode = '22023';
  end if;
  select count(*) filter (where coalesce((entry->>'is_cover')::boolean, false))
    into cover_count from jsonb_array_elements(_images) as listed(entry);
  if cover_count > 1 then
    raise exception 'Only one cover image is allowed' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(_images) as listed(entry)
    where jsonb_typeof(entry) <> 'object'
       or coalesce(trim(entry->>'alt_text'), '') = ''
       or length(entry->>'alt_text') > 500
       or coalesce(entry->>'storage_path', '') not like _property_id::text || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'property-images' and o.name = entry->>'storage_path')
  ) then
    raise exception 'Image paths must belong to this property' using errcode = '22023';
  end if;
  if not exists (select 1 from public.properties where id = _property_id) then
    raise exception 'Property not found' using errcode = 'P0002';
  end if;

  delete from public.property_images where property_id = _property_id;
  insert into public.property_images (property_id, storage_path, alt_text, caption, display_order, is_cover)
  select _property_id, entry->>'storage_path', coalesce(entry->>'alt_text', ''), nullif(entry->>'caption', ''), ordinal - 1,
         coalesce((entry->>'is_cover')::boolean, false)
  from jsonb_array_elements(_images) with ordinality as listed(entry, ordinal);
end;
$$;
revoke all on function public.replace_property_images(uuid, jsonb) from public;
grant execute on function public.replace_property_images(uuid, jsonb) to authenticated;

alter table public.properties enable row level security;
alter table public.property_images enable row level security;
alter table public.property_admins enable row level security;

drop policy if exists "published properties are public" on public.properties;
create policy "published properties are public" on public.properties for select to anon, authenticated
using (status = 'published');
drop policy if exists "admins manage properties" on public.properties;
create policy "admins manage properties" on public.properties for all to authenticated
using (public.is_property_admin()) with check (public.is_property_admin());

drop policy if exists "published property image metadata is public" on public.property_images;
create policy "published property image metadata is public" on public.property_images for select to anon, authenticated
using (exists (select 1 from public.properties p where p.id = property_id and p.status = 'published'));
drop policy if exists "admins manage property image metadata" on public.property_images;
create policy "admins manage property image metadata" on public.property_images for all to authenticated
using (public.is_property_admin()) with check (public.is_property_admin());

drop policy if exists "property admins are private" on public.property_admins;

revoke all on public.properties from anon;
grant select (id, title, slug, description, price, currency, listing_type, property_type, city, state, neighborhood,
              bedrooms, bathrooms, toilets, area_sqm, land_area_sqm, parking_spaces, amenities, is_featured,
              created_at, updated_at, published_at, status) on public.properties to anon;
grant select on public.properties to authenticated;
grant insert, update, delete on public.properties to authenticated;
grant select on public.property_images to anon, authenticated;
grant insert, update, delete on public.property_images to authenticated;
revoke all on public.property_admins from anon, authenticated;

create or replace view public.public_properties with (security_invoker = true) as
select id, title, slug, description, price, currency, listing_type, property_type,
       city, state, neighborhood, bedrooms, bathrooms, toilets, area_sqm,
       land_area_sqm, parking_spaces, amenities, is_featured, created_at, updated_at, published_at
from public.properties where status = 'published';
grant select on public.public_properties to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', false, 8388608, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "published property images are public" on storage.objects;
create policy "published property images are public" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'property-images'
  and exists (
    select 1 from public.properties p
    where p.id::text = split_part(name, '/', 1) and p.status = 'published'
  )
);
drop policy if exists "admins read property images" on storage.objects;
create policy "admins read property images" on storage.objects for select to authenticated
using (bucket_id = 'property-images' and public.is_property_admin());
drop policy if exists "admins upload property images" on storage.objects;
create policy "admins upload property images" on storage.objects for insert to authenticated
with check (bucket_id = 'property-images' and public.is_property_admin() and array_length(storage.foldername(name), 1) = 1);
drop policy if exists "admins update property images" on storage.objects;
create policy "admins update property images" on storage.objects for update to authenticated
using (bucket_id = 'property-images' and public.is_property_admin())
with check (bucket_id = 'property-images' and public.is_property_admin());
drop policy if exists "admins delete property images" on storage.objects;
create policy "admins delete property images" on storage.objects for delete to authenticated
using (bucket_id = 'property-images' and public.is_property_admin());

