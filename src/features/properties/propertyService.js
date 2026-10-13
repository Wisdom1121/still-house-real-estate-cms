import { supabase, supabaseConfigured, SUPABASE_SETUP_MESSAGE } from '../../lib/supabase';

const propertyFields = 'id,title,slug,description,price,currency,listing_type,property_type,city,state,neighborhood,bedrooms,bathrooms,toilets,area_sqm,land_area_sqm,parking_spaces,amenities,is_featured,created_at,updated_at,published_at';
const imageFields = 'id,property_id,storage_path,alt_text,caption,display_order,is_cover,created_at';

function safeSearchTerm(value) {
  return value.trim().replace(/[^\p{L}\p{N}\s-]/gu, '').slice(0, 100);
}

function requireSupabase() {
  if (!supabaseConfigured) throw new Error(SUPABASE_SETUP_MESSAGE);
}

async function addImageUrls(property) {
  const images = await Promise.all((property.property_images || [])
    .sort((a, b) => a.display_order - b.display_order)
    .map(async (image) => {
      const { data, error } = await supabase.storage.from('property-images').createSignedUrl(image.storage_path, 3600);
      if (error) throw error;
      return { ...image, url: data.signedUrl };
    }));
  return { ...property, property_images: images, cover_image: images.find((image) => image.is_cover) || images[0] || null };
}

async function withImages(properties) {
  if (!properties.length) return [];
  const ids = properties.map((property) => property.id);
  const { data: images, error } = await supabase.from('property_images').select(imageFields).in('property_id', ids).order('display_order');
  if (error) throw error;
  const grouped = new Map(ids.map((id) => [id, []]));
  (images || []).forEach((image) => grouped.get(image.property_id)?.push(image));
  return Promise.all(properties.map((property) => addImageUrls({ ...property, property_images: grouped.get(property.id) || [] })));
}

export async function listPublishedProperties({ search = '', listingType = '', propertyType = '', state = '', minPrice = '', maxPrice = '', bedrooms = '', sort = 'newest', page = 1, pageSize = 12 } = {}) {
  requireSupabase();
  let query = supabase.from('public_properties').select(propertyFields, { count: 'exact' });
  if (sort === 'price-asc') query = query.order('price', { ascending: true, nullsFirst: false });
  else if (sort === 'price-desc') query = query.order('price', { ascending: false, nullsFirst: false });
  else query = query.order('published_at', { ascending: false });
  const term = safeSearchTerm(search);
  if (term) query = query.or(`title.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%,neighborhood.ilike.%${term}%`);
  if (listingType) query = query.eq('listing_type', listingType);
  if (propertyType) query = query.eq('property_type', propertyType);
  if (state) query = query.ilike('state', `%${state}%`);
  if (minPrice !== '') query = query.gte('price', Number(minPrice));
  if (maxPrice !== '') query = query.lte('price', Number(maxPrice));
  if (bedrooms !== '') query = query.gte('bedrooms', Number(bedrooms));
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  return { properties: await withImages(data || []), count: count || 0 };
}

export async function getPublishedPropertyBySlug(slug) {
  requireSupabase();
  const { data, error } = await supabase.from('public_properties').select(propertyFields).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withImages([data]))[0];
}

export async function getFeaturedProperty() {
  requireSupabase();
  const { data, error } = await supabase.from('public_properties').select(propertyFields).eq('is_featured', true).order('published_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withImages([data]))[0];
}

export function propertyLocation(property) {
  return [property.neighborhood, property.city, property.state].filter(Boolean).join(', ');
}

export function formatPrice(property) {
  if (property.price == null) return 'Price upon request';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: property.currency || 'NGN', maximumFractionDigits: 0 }).format(Number(property.price));
  } catch {
    return `${property.currency || 'NGN'} ${Number(property.price).toLocaleString()}`;
  }
}

