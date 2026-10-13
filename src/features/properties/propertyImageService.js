import { supabase, supabaseConfigured, SUPABASE_SETUP_MESSAGE } from '../../lib/supabase';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export async function persistPropertyImages(propertyId, images, removedImages = []) {
  if (!supabaseConfigured) throw new Error(SUPABASE_SETUP_MESSAGE);
  const uploadedPaths = [];
  let metadataSaved = false;
  try {
    const normalized = [];
    for (const [index, image] of images.entries()) {
      if (image.kind === 'existing') {
        normalized.push({ ...image, display_order: index });
        continue;
      }
      const extension = image.file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
      const storagePath = `${propertyId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('property-images').upload(storagePath, image.file, { contentType: image.file.type, upsert: false, cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
      normalized.push({ ...image, kind: 'uploaded', storage_path: storagePath, display_order: index });
    }

    const cover = normalized.find((image) => image.is_cover) || normalized[0];
    const { error: persistError } = await supabase.rpc('replace_property_images', {
      _property_id: propertyId,
      _images: normalized.map((image) => ({
        storage_path: image.storage_path,
        alt_text: image.alt_text || '',
        caption: image.caption || null,
        is_cover: Boolean(cover && image.storage_path === cover.storage_path),
      })),
    });
    if (persistError) throw persistError;
    metadataSaved = true;

    const removedPaths = removedImages.map((image) => image.storage_path).filter(Boolean);
    if (removedPaths.length) {
      const { error } = await supabase.storage.from('property-images').remove(removedPaths);
      if (error) throw new Error(`Image details were saved, but removed files could not be cleaned up: ${error.message}`);
    }
  } catch (error) {
    if (uploadedPaths.length && !metadataSaved) await supabase.storage.from('property-images').remove(uploadedPaths);
    throw error;
  }
}

export async function getSignedStorageUrl(path) {
  const { data, error } = await supabase.storage.from('property-images').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

