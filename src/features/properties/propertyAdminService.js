import { supabase, supabaseConfigured, SUPABASE_SETUP_MESSAGE } from '../../lib/supabase';
import { getSignedStorageUrl } from './propertyImageService';

function requireSupabase() {
  if (!supabaseConfigured) throw new Error(SUPABASE_SETUP_MESSAGE);
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

function safeSearchTerm(value) {
  return value.trim().replace(/[^\p{L}\p{N}\s-]/gu, '').slice(0, 100);
}

export async function listAdminProperties({ search = '', status = '', listingType = '', propertyType = '', sort = 'updated', page = 1, pageSize = 20 } = {}) {
  requireSupabase();
  let query = supabase.from('properties').select('id,title,slug,price,currency,listing_type,property_type,city,state,status,is_featured,updated_at,property_images(id,storage_path,is_cover,display_order)', { count: 'exact' });
  if (sort === 'title') query = query.order('title', { ascending: true });
  else if (sort === 'price-asc') query = query.order('price', { ascending: true, nullsFirst: false });
  else if (sort === 'price-desc') query = query.order('price', { ascending: false, nullsFirst: false });
  else query = query.order('updated_at', { ascending: false });
  const term = safeSearchTerm(search);
  if (term) query = query.or(`title.ilike.%${term}%,slug.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%`);
  if (status) query = query.eq('status', status);
  if (listingType) query = query.eq('listing_type', listingType);
  if (propertyType) query = query.eq('property_type', propertyType);
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  const properties = check({ data, error }) || [];
  await Promise.all(properties.map(async (property) => {
    for (const image of property.property_images || []) image.signed_url = await getSignedStorageUrl(image.storage_path);
  }));
  return { properties, count: count || 0 };
}

export async function getAdminProperty(id) {
  requireSupabase();
  const { data, error } = await supabase.from('properties').select('*,property_images(*)').eq('id', id).maybeSingle();
  const property = check({ data, error });
  if (property) {
    (property.property_images || (property.property_images = [])).sort((a, b) => a.display_order - b.display_order);
    await Promise.all(property.property_images.map(async (image) => { image.signed_url = await getSignedStorageUrl(image.storage_path); }));
  }
  return property;
}

export async function getAdminMetrics() {
  requireSupabase();
  const results = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'archived'),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('is_featured', true),
    supabase.from('properties').select('id,status,is_featured,updated_at,title,slug').order('updated_at', { ascending: false }).limit(5),
  ]);
  results.forEach(({ error }) => { if (error) throw error; });
  const [total, published, drafts, archived, featured, recent] = results;
  return {
    total: total.count || 0,
    published: published.count || 0,
    drafts: drafts.count || 0,
    archived: archived.count || 0,
    featured: featured.count || 0,
    recent: recent.data || [],
  };
}

export async function saveProperty(values, id) {
  requireSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const payload = Object.fromEntries([
    'title', 'slug', 'description', 'currency', 'listing_type', 'property_type', 'city', 'state',
    'neighborhood', 'address', 'status', 'is_featured',
  ].map((field) => [field, values[field]]));
  Object.assign(payload, {
    currency: values.currency.trim().toUpperCase(),
    price: values.price === '' ? null : Number(values.price),
    bedrooms: values.bedrooms === '' ? null : Number(values.bedrooms),
    bathrooms: values.bathrooms === '' ? null : Number(values.bathrooms),
    toilets: values.toilets === '' ? null : Number(values.toilets),
    parking_spaces: values.parking_spaces === '' ? null : Number(values.parking_spaces),
    area_sqm: values.area_sqm === '' ? null : Number(values.area_sqm),
    land_area_sqm: values.land_area_sqm === '' ? null : Number(values.land_area_sqm),
    amenities: values.amenities.split('\n').map((item) => item.trim()).filter(Boolean),
    published_at: values.status === 'published' ? (id ? undefined : now) : null,
  });
  if (id && values.status === 'published') {
    const { data: previous, error: previousError } = await supabase.from('properties').select('published_at').eq('id', id).single();
    if (previousError) throw previousError;
    payload.published_at = previous.published_at || now;
  }
  if (id) {
    delete payload.created_by;
    const { data, error } = await supabase.from('properties').update(payload).eq('id', id).select('id').single();
    if (error?.code === '23505') throw new Error('That URL slug is already in use. Choose a different slug.');
    if (error) throw error;
    return data.id;
  }
  payload.created_by = authData.user?.id || null;
  const { data, error } = await supabase.from('properties').insert(payload).select('id').single();
  if (error?.code === '23505') throw new Error('That URL slug is already in use. Choose a different slug.');
  if (error) throw error;
  return data.id;
}

export async function setPropertyStatus(property, status) {
  requireSupabase();
  const publishedAt = status === 'published' ? property.published_at || new Date().toISOString() : null;
  const { error } = await supabase.from('properties').update({ status, published_at: publishedAt }).eq('id', property.id);
  if (error) throw error;
}

export async function deleteProperty(id) {
  requireSupabase();
  const { data: images, error: imageError } = await supabase.from('property_images').select('storage_path').eq('property_id', id);
  if (imageError) throw imageError;
  const { error } = await supabase.from('properties').delete().eq('id', id);
  if (error) throw error;
  if (images?.length) {
    const { error: storageError } = await supabase.storage.from('property-images').remove(images.map((image) => image.storage_path));
    if (storageError) throw new Error(`Property deleted, but image cleanup failed: ${storageError.message}`);
  }
}

