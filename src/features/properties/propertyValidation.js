export function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function validateProperty(values, images = []) {
  if (!values.title.trim()) return 'A property title is required.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) return 'Use a URL-friendly slug with lowercase letters, numbers and hyphens.';
  if (values.description.trim().length < 10) return 'Add a property description of at least 10 characters.';
  if (!/^[A-Z]{3}$/.test(values.currency.trim().toUpperCase())) return 'Currency must be a three-letter code such as NGN or USD.';
  if (values.price !== '' && (!Number.isFinite(Number(values.price)) || Number(values.price) < 0)) return 'Price must be a valid non-negative number.';
  for (const field of ['bedrooms', 'toilets', 'parking_spaces']) {
    if (values[field] !== '' && (!Number.isInteger(Number(values[field])) || Number(values[field]) < 0)) return `${field.replaceAll('_', ' ')} must be a non-negative whole number.`;
  }
  for (const field of ['bathrooms', 'area_sqm', 'land_area_sqm']) {
    if (values[field] !== '' && (!Number.isFinite(Number(values[field])) || Number(values[field]) < 0)) return `${field.replaceAll('_', ' ')} must be a valid non-negative number.`;
  }
  for (const field of ['area_sqm', 'land_area_sqm']) if (values[field] !== '' && Number(values[field]) === 0) return `${field.replaceAll('_', ' ')} must be greater than zero.`;
  if (images.some((image) => !image.alt_text?.trim())) return 'Add alternative text for every property image.';
  if (images.filter((image) => image.is_cover).length > 1) return 'Choose only one cover image.';
  return '';
}

