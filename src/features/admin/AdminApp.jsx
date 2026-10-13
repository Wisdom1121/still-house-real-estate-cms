import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured, SUPABASE_SETUP_MESSAGE } from '../../lib/supabase';
import { deleteProperty, getAdminMetrics, getAdminProperty, listAdminProperties, saveProperty, setPropertyStatus } from '../properties/propertyAdminService';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, persistPropertyImages } from '../properties/propertyImageService';
import { formatPrice, propertyLocation } from '../properties/propertyService';
import { getAdminAccess, signInAdmin } from './authService';
import { slugify, validateProperty } from '../properties/propertyValidation';

const PROPERTY_TYPES = ['house', 'apartment', 'villa', 'land', 'duplex', 'other'];
const EMPTY_FORM = {
  title: '', slug: '', description: '', price: '', currency: 'NGN', listing_type: 'sale', property_type: 'house',
  city: '', state: '', neighborhood: '', address: '', bedrooms: '', bathrooms: '', toilets: '',
  area_sqm: '', land_area_sqm: '', parking_spaces: '', amenities: '', status: 'draft', is_featured: false,
};

function AdminApp({ path }) {
  const [session, setSession] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [access, setAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    if (!supabaseConfigured) { setAuthResolved(true); return undefined; }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data?.session || null);
      setCheckingAccess(Boolean(data?.session));
      setAuthResolved(true);
      if (error) setAccessError(error.message);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingAccess(Boolean(nextSession));
      setAuthResolved(true);
      setAccess(false);
      setAccessError('');
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session) { setAccess(false); setCheckingAccess(false); return undefined; }
    setCheckingAccess(true);
    getAdminAccess(session).then((authorized) => {
      if (active) { setAccess(authorized); setAccessError(''); setCheckingAccess(false); }
    }).catch((error) => {
      if (active) { setAccess(false); setAccessError(error.message); setCheckingAccess(false); }
    });
    return () => { active = false; };
  }, [session?.user?.id]);

  const signOut = async () => { await supabase?.auth.signOut(); window.location.assign('/admin/login'); };
  if (!authResolved || checkingAccess) return <AdminLoading />;
  if (!supabaseConfigured) return <AdminLogin setupMessage={SUPABASE_SETUP_MESSAGE} />;
  if (!session) {
    if (path !== '/admin/login') window.history.replaceState({}, '', '/admin/login');
    return <AdminLogin />;
  }
  if (!access) return <div className="admin-auth-state"><div><span className="eyebrow eyebrow-dark">Still House · Property management</span><h1>Admin access required.</h1><p>{accessError || 'This signed-in account is not on the property administrator allowlist.'}</p><button className="button button-dark" type="button" onClick={signOut}>Sign out</button></div></div>;

  const editMatch = path.match(/^\/admin\/properties\/([^/]+)\/edit$/);
  let content;
  if (path === '/admin') content = <AdminDashboard />;
  else if (path === '/admin/properties') content = <AdminProperties />;
  else if (path === '/admin/properties/new') content = <PropertyForm />;
  else if (/^\/admin\/properties\/[^/]+\/preview$/.test(path)) content = <AdminPropertyPreview propertyId={path.split('/')[3]} />;
  else if (editMatch) content = <PropertyForm propertyId={editMatch[1]} />;
  else content = <AdminDashboard />;
  return <div className="admin-app"><aside className="admin-sidebar"><a className="wordmark admin-wordmark" href="/"><span className="wordmark-mark">S</span><span>STILL HOUSE<small>PROPERTY STUDIO</small></span></a><p className="admin-nav-label">Workspace</p><nav aria-label="Admin navigation"><a className={path === '/admin' ? 'is-current' : ''} href="/admin">Overview</a><a className={path.startsWith('/admin/properties') ? 'is-current' : ''} href="/admin/properties">Properties</a></nav><a href="/" className="admin-return">← View public site</a><button className="admin-signout" type="button" onClick={signOut}>Sign out <span aria-hidden="true">↗</span></button></aside><main className="admin-main"><div className="admin-mobilebar"><a className="wordmark" href="/">STILL HOUSE</a><button type="button" className="admin-signout" onClick={signOut}>Sign out</button><nav className="admin-mobile-links" aria-label="Admin navigation"><a href="/admin">Overview</a><a href="/admin/properties">Properties</a><a href="/">Public site ↗</a></nav></div>{content}</main></div>;
}

function AdminLoading() {
  return <div className="admin-auth-state" role="status"><div><span className="eyebrow eyebrow-dark">Still House</span><h1>Checking admin access…</h1><div className="admin-skeleton" /></div></div>;
}

function AdminLogin({ setupMessage = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await signInAdmin(email, password); window.location.assign('/admin'); }
    catch (reason) { setError(reason.message || 'Unable to sign in.'); setBusy(false); }
  }
  return <main className="admin-login"><a className="wordmark" href="/"><span className="wordmark-mark">S</span><span>STILL HOUSE<small>PROPERTY STUDIO</small></span></a><div className="admin-login-card"><p className="eyebrow eyebrow-dark">Private workspace</p><h1>Sign in to manage properties.</h1>{setupMessage && <p className="admin-notice">{setupMessage} See the CMS setup guide in README.md.</p>}{error && <p className="admin-error" role="alert">{error}</p>}<form onSubmit={submit}><label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button button-dark" disabled={busy || Boolean(setupMessage)}>{busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">↗</span></button></form><p className="admin-login-footnote">Administrator accounts are created by an existing project owner. Public registration is disabled.</p></div></main>;
}

function AdminPageHeading({ eyebrow = 'Property studio', title, action }) {
  return <div className="admin-page-heading"><div><p className="eyebrow eyebrow-dark">{eyebrow}</p><h1>{title}</h1></div>{action}</div>;
}

function useAdminRequest(loader, dependencies = []) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setState('loading');
    loader().then((value) => { if (active) { setData(value); setState('ready'); setError(''); } })
      .catch((reason) => { if (active) { setError(reason.message || 'Request failed.'); setState('error'); } });
    return () => { active = false; };
  }, [...dependencies, refresh]);
  return { data, state, error, reload: () => setRefresh((value) => value + 1) };
}

function AdminDashboard() {
  const request = useAdminRequest(getAdminMetrics);
  const metrics = request.data;
  return <section className="admin-content"><AdminPageHeading eyebrow="Overview" title="Property dashboard" action={<a className="button button-dark" href="/admin/properties/new">Add a property <span aria-hidden="true">↗</span></a>} />
    {request.state === 'loading' && <div className="admin-loading-block" role="status">Loading property metrics…</div>}
    {request.state === 'error' && <div className="admin-error" role="alert">Couldn’t load dashboard data: {request.error} <button type="button" onClick={request.reload}>Try again</button></div>}
    {metrics && <><div className="admin-metrics">{[['Total properties', metrics.total], ['Published', metrics.published], ['Drafts', metrics.drafts], ['Archived', metrics.archived], ['Featured', metrics.featured]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow eyebrow-dark">Latest changes</p><h2>Recently updated</h2></div><a className="text-link" href="/admin/properties">All properties <span aria-hidden="true">↗</span></a></div>{metrics.recent.length ? <div className="admin-recent-list">{metrics.recent.map((property) => <a href={`/admin/properties/${property.id}/edit`} key={property.id}><span><strong>{property.title}</strong><small>/{property.slug}</small></span><StatusBadge status={property.status} /><time>{new Date(property.updated_at).toLocaleDateString()}</time></a>)}</div> : <AdminEmpty title="No properties yet" copy="Create a draft to begin building your property collection." action={<a className="button button-dark" href="/admin/properties/new">Add your first property</a>} />}</section></>}
  </section>;
}

function StatusBadge({ status }) { return <span className={`status-badge status-${status}`}>{status}</span>; }

function AdminProperties() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [listingType, setListingType] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const request = useAdminRequest(() => listAdminProperties({ search, status: statusFilter, listingType, propertyType, sort, page, pageSize: 20 }), [search, statusFilter, listingType, propertyType, sort, page]);
  const runAction = async (property, action) => {
    setActionError(''); setNotice(''); setBusyId(property.id);
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete “${property.title}” and its image files? This cannot be undone.`)) { setBusyId(''); return; }
        await deleteProperty(property.id); setNotice('Property deleted.');
      } else {
        const status = action === 'publish' ? 'published' : action === 'archive' ? 'archived' : 'draft';
        await setPropertyStatus(property, status); setNotice(`Property ${status === 'draft' ? 'unpublished' : status}.`);
      }
      request.reload();
    } catch (error) { setActionError(error.message || 'Could not update this property.'); }
    setBusyId('');
  };
  return <section className="admin-content"><AdminPageHeading eyebrow="Collection" title="Properties" action={<a className="button button-dark" href="/admin/properties/new">Add property <span aria-hidden="true">↗</span></a>} />
    {notice && <p className="admin-success" role="status">{notice}</p>}{actionError && <p className="admin-error" role="alert">{actionError}</p>}
    <div className="admin-filters"><label>Search<input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Title, slug or location" /></label><label>Status<select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">All statuses</option><option>draft</option><option>published</option><option>archived</option></select></label><label>Listing<select value={listingType} onChange={(event) => { setPage(1); setListingType(event.target.value); }}><option value="">All</option><option value="sale">Sale</option><option value="rent">Rent</option></select></label><label>Property type<select value={propertyType} onChange={(event) => { setPage(1); setPropertyType(event.target.value); }}><option value="">All types</option>{PROPERTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }}><option value="updated">Recently updated</option><option value="title">Title A–Z</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label></div>
    {request.state === 'loading' && <div className="admin-loading-block" role="status">Loading properties…</div>}
    {request.state === 'error' && <div className="admin-error" role="alert">Couldn’t load properties: {request.error} <button type="button" onClick={request.reload}>Try again</button></div>}
    {request.data && request.data.properties.length === 0 && <AdminEmpty title="No properties found" copy="Add a property or adjust your search and filters." action={<a className="button button-dark" href="/admin/properties/new">Add property</a>} />}
    {request.data?.properties.length > 0 && <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Residence</th><th>Location</th><th>Price</th><th>Type</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{request.data.properties.map((property) => {
      const cover = property.property_images?.find((image) => image.is_cover) || property.property_images?.[0];
      return <tr key={property.id}><td><div className="admin-property-cell">{cover ? <img src={cover.signed_url} alt="" /> : <span className="admin-thumb-placeholder">SH</span>}<span><strong>{property.title}</strong><small>/{property.slug}{property.is_featured ? ' · Featured' : ''}</small></span></div></td><td>{propertyLocation(property) || '—'}</td><td>{formatPrice(property)}</td><td>{property.listing_type} · {property.property_type}</td><td><StatusBadge status={property.status} /></td><td>{new Date(property.updated_at).toLocaleDateString()}</td><td><details className="admin-row-actions"><summary aria-label={`Actions for ${property.title}`}>•••</summary><div><a href={`/admin/properties/${property.id}/edit`}>Edit</a>{property.status !== 'published' && <button disabled={busyId === property.id} onClick={() => runAction(property, 'publish')}>Publish</button>}{property.status === 'published' && <button disabled={busyId === property.id} onClick={() => runAction(property, 'draft')}>Unpublish</button>}{property.status !== 'archived' && <button disabled={busyId === property.id} onClick={() => runAction(property, 'archive')}>Archive</button>}<a href={`/admin/properties/${property.id}/preview`} target="_blank" rel="noreferrer">Preview ↗</a><button className="admin-delete-action" disabled={busyId === property.id} onClick={() => runAction(property, 'delete')}>Delete…</button></div></details></td></tr>;
    })}</tbody></table></div><div className="admin-pagination"><span>{request.data.count} properties · Page {page}</span><div><button className="button button-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="button button-outline" disabled={page * 20 >= request.data.count} onClick={() => setPage((value) => value + 1)}>Next</button></div></div></>}
  </section>;
}

function AdminPropertyPreview({ propertyId }) {
  const request = useAdminRequest(() => getAdminProperty(propertyId), [propertyId]);
  const property = request.data;
  if (request.state === 'loading') return <section className="admin-content"><div className="admin-loading-block" role="status">Loading preview…</div></section>;
  if (request.state === 'error' || !property) return <section className="admin-content"><AdminPageHeading title="Preview unavailable" action={<a className="text-link" href="/admin/properties">← Properties</a>} /><p className="admin-error" role="alert">{request.error || 'This property could not be found.'}</p></section>;
  return <section className="admin-content"><AdminPageHeading eyebrow="Private preview" title={property.title} action={<a className="button button-dark" href={`/admin/properties/${property.id}/edit`}>Edit listing <span aria-hidden="true">↗</span></a>} /><p className="admin-preview-notice"><StatusBadge status={property.status} /> This preview is visible to signed-in administrators only.</p><div className="admin-preview-hero">{property.property_images?.find((image) => image.is_cover)?.signed_url && <img src={property.property_images.find((image) => image.is_cover).signed_url} alt={property.property_images.find((image) => image.is_cover).alt_text || property.title} />}<div><p className="eyebrow">{propertyLocation(property)}</p><h2>{property.title}</h2><strong>{formatPrice(property)}</strong></div></div><section className="admin-preview-body"><div><p className="eyebrow eyebrow-dark">Property overview</p><p>{property.description || 'No description added yet.'}</p></div><dl>{[['Type', property.property_type], ['Listing', property.listing_type], ['Bedrooms', property.bedrooms], ['Bathrooms', property.bathrooms], ['Interior area', property.area_sqm ? `${property.area_sqm} m²` : '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>{property.property_images?.length > 0 && <div className="admin-preview-gallery">{property.property_images.map((image) => <figure key={image.id}><img src={image.signed_url} alt={image.alt_text || property.title} />{image.caption && <figcaption>{image.caption}</figcaption>}</figure>)}</div>}</section></section>;
}

function AdminEmpty({ title, copy, action }) {
  return <div className="admin-empty"><span className="admin-empty-mark">S.</span><h2>{title}</h2><p>{copy}</p>{action}</div>;
}

function PropertyForm({ propertyId: initialId }) {
  const [propertyId, setPropertyId] = useState(initialId || '');
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  const [removedImages, setRemovedImages] = useState([]);
  const [baseline, setBaseline] = useState('');
  const [slugTouched, setSlugTouched] = useState(Boolean(initialId));
  const [loading, setLoading] = useState(Boolean(initialId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activity, setActivity] = useState('');
  const fileRef = useRef(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const currentSnapshot = useMemo(() => JSON.stringify({ form, images: images.map(({ kind, id, alt_text, caption, is_cover, file }) => ({ kind, id, alt_text, caption, is_cover, name: file?.name })) }), [form, images]);
  const dirty = Boolean(baseline && currentSnapshot !== baseline);

  useEffect(() => () => imagesRef.current.filter((image) => image.kind === 'new').forEach((image) => URL.revokeObjectURL(image.preview)), []);

  useEffect(() => {
    if (!initialId) { setBaseline(JSON.stringify({ form: EMPTY_FORM, images: [] })); return undefined; }
    let active = true;
    getAdminProperty(initialId).then((property) => {
      if (!active) return;
      if (!property) throw new Error('This property no longer exists.');
      const nextForm = { ...EMPTY_FORM, ...property, amenities: (property.amenities || []).join('\n'), price: property.price ?? '', bedrooms: property.bedrooms ?? '', bathrooms: property.bathrooms ?? '', toilets: property.toilets ?? '', area_sqm: property.area_sqm ?? '', land_area_sqm: property.land_area_sqm ?? '', parking_spaces: property.parking_spaces ?? '' };
      const nextImages = (property.property_images || []).map((image) => ({ ...image, kind: 'existing', preview: image.signed_url }));
      setForm(nextForm); setImages(nextImages); setRemovedImages([]); setBaseline(JSON.stringify({ form: nextForm, images: nextImages.map(({ kind, id, alt_text, caption, is_cover }) => ({ kind, id, alt_text, caption, is_cover, name: undefined })) })); setLoading(false);
    }).catch((reason) => { if (active) { setError(reason.message || 'Could not load this property.'); setLoading(false); } });
    return () => { active = false; };
  }, [initialId]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value, ...(name === 'title' && !slugTouched ? { slug: slugify(value) } : {}) }));
  };
  const handleFiles = (event) => {
    const incoming = Array.from(event.target.files || []);
    const invalid = incoming.find((file) => !ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES);
    if (invalid) { setError(`${invalid.name}: use JPEG, PNG, WebP or AVIF files up to 8 MB.`); event.target.value = ''; return; }
    setError('');
    const staged = incoming.map((file, index) => ({ kind: 'new', file, preview: URL.createObjectURL(file), alt_text: form.title, caption: '', is_cover: images.length === 0 && index === 0 }));
    setImages((current) => [...current, ...staged]);
    event.target.value = '';
  };
  const changeImage = (index, key, value) => setImages((current) => current.map((image, itemIndex) => itemIndex === index ? { ...image, [key]: value } : image));
  const removeImage = (index) => {
    const removed = images[index];
    if (!removed) return;
    if (removed.kind === 'existing') setRemovedImages((items) => [...items, removed]);
    if (removed.kind === 'new') URL.revokeObjectURL(removed.preview);
    setImages((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (removed.is_cover && next[0]) next[0] = { ...next[0], is_cover: true };
      return next;
    });
  };
  const moveImage = (index, direction) => setImages((current) => {
    const next = [...current]; const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const nextStatus = event.nativeEvent.submitter?.value || form.status || 'draft';
    setError(''); setSuccess(''); setActivity('Saving property details…'); setBusy(true);
    try {
      const validationMessage = validateProperty(form, images);
      if (validationMessage) throw new Error(validationMessage);
      const values = { ...form, status: nextStatus };
      const id = await saveProperty(values, propertyId || undefined);
      if (!propertyId) { setPropertyId(id); window.history.replaceState({}, '', `/admin/properties/${id}/edit`); }
      setActivity(images.some((image) => image.kind === 'new') ? 'Uploading images and updating the gallery…' : 'Updating the gallery…');
      await persistPropertyImages(id, images, removedImages);
      setSuccess(nextStatus === 'published' ? 'Property published and available on the public site.' : nextStatus === 'archived' ? 'Property archived.' : 'Draft saved.');
      const saved = await getAdminProperty(id);
      if (saved) {
        const nextForm = { ...EMPTY_FORM, ...saved, amenities: (saved.amenities || []).join('\n'), price: saved.price ?? '', bedrooms: saved.bedrooms ?? '', bathrooms: saved.bathrooms ?? '', toilets: saved.toilets ?? '', area_sqm: saved.area_sqm ?? '', land_area_sqm: saved.land_area_sqm ?? '', parking_spaces: saved.parking_spaces ?? '' };
        const nextImages = (saved.property_images || []).map((image) => ({ ...image, kind: 'existing', preview: image.signed_url }));
        images.filter((image) => image.kind === 'new').forEach((image) => URL.revokeObjectURL(image.preview));
        setForm(nextForm); setImages(nextImages); setRemovedImages([]); setBaseline(JSON.stringify({ form: nextForm, images: nextImages.map(({ kind, id: imageId, alt_text, caption, is_cover }) => ({ kind, id: imageId, alt_text, caption, is_cover, name: undefined })) }));
      }
    } catch (reason) { setError(reason.message || 'Could not save this property. Your entries are still here.'); }
    finally { setBusy(false); setActivity(''); }
  }

  if (loading) return <section className="admin-content"><div className="admin-loading-block" role="status">Loading property…</div></section>;
  return <section className="admin-content"><AdminPageHeading eyebrow={propertyId ? 'Edit residence' : 'New listing'} title={propertyId ? form.title || 'Edit property' : 'Add a property'} action={<a className="text-link" href="/admin/properties">← All properties</a>} />
    {error && <p className="admin-error" role="alert">{error}</p>}{success && <p className="admin-success" role="status">{success}</p>}{activity && <p className="admin-upload-progress" role="status">{activity}</p>}
    <form className="property-editor" onSubmit={submit}>
      <div className="property-editor-main">
        <section className="admin-panel editor-panel"><div className="admin-panel-heading"><div><p className="eyebrow eyebrow-dark">01 · Information</p><h2>Property details</h2></div></div><div className="admin-form-grid"><label className="field-wide">Title<input name="title" required maxLength="180" value={form.title} onChange={update} /></label><label className="field-wide">URL slug<div className="slug-input"><span>/properties/</span><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(event) => { setSlugTouched(true); update(event); }} /></div></label><label className="field-wide">Description<textarea name="description" rows="6" value={form.description} onChange={update} /></label><label>Property type<select name="property_type" value={form.property_type} onChange={update}>{PROPERTY_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label><label>Listing type<select name="listing_type" value={form.listing_type} onChange={update}><option value="sale">For sale</option><option value="rent">For rent</option></select></label><label>Price<input name="price" type="number" min="0" step="0.01" value={form.price} onChange={update} /></label><label>Currency<input name="currency" maxLength="3" pattern="[A-Z]{3}" value={form.currency} onChange={update} /></label></div></section>
        <section className="admin-panel editor-panel"><div className="admin-panel-heading"><div><p className="eyebrow eyebrow-dark">02 · Location</p><h2>Where it is</h2></div></div><div className="admin-form-grid"><label>State<input name="state" value={form.state} onChange={update} /></label><label>City<input name="city" value={form.city} onChange={update} /></label><label>Neighborhood<input name="neighborhood" value={form.neighborhood} onChange={update} /></label><label>Street address <span className="field-note">Optional; hidden from public pages</span><input name="address" value={form.address || ''} onChange={update} /></label></div></section>
        <section className="admin-panel editor-panel"><div className="admin-panel-heading"><div><p className="eyebrow eyebrow-dark">03 · Specifications</p><h2>Space and amenities</h2></div></div><div className="admin-form-grid admin-number-grid">{[['bedrooms','Bedrooms'],['bathrooms','Bathrooms'],['toilets','Toilets'],['parking_spaces','Parking spaces'],['area_sqm','Interior area (m²)'],['land_area_sqm','Land area (m²)']].map(([name,label]) => <label key={name}>{label}<input name={name} type="number" min="0" step={name.includes('area') || name === 'bathrooms' ? '0.1' : '1'} value={form[name]} onChange={update} /></label>)}<label className="field-wide">Amenities <span className="field-note">One feature per line</span><textarea name="amenities" rows="4" value={form.amenities} onChange={update} placeholder={'Garden\nSwimming pool\nSecurity'} /></label></div></section>
        <section className="admin-panel editor-panel"><div className="admin-panel-heading"><div><p className="eyebrow eyebrow-dark">04 · Images</p><h2>Property gallery</h2><p className="panel-copy">JPEG, PNG, WebP or AVIF · up to 8 MB per image.</p></div><button type="button" className="button button-outline" onClick={() => fileRef.current?.click()}>Add images <span aria-hidden="true">＋</span></button><input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} multiple hidden onChange={handleFiles} /></div>
          {images.length === 0 ? <div className="image-upload-empty"><span>＋</span><strong>No images added</strong><p>Add a cover image and gallery photos for this listing.</p><button type="button" className="text-link" onClick={() => fileRef.current?.click()}>Choose image files</button></div> : <div className="admin-image-list">{images.map((image, index) => <article className="admin-image-row" key={image.id || image.preview}><img src={image.preview} alt="" /><div className="admin-image-fields"><span className="admin-image-order">IMAGE {String(index + 1).padStart(2, '0')} {image.is_cover && <b>· COVER</b>}</span><label>Alternative text<input value={image.alt_text || ''} onChange={(event) => changeImage(index, 'alt_text', event.target.value)} placeholder={form.title || 'Describe this image'} /></label><label>Caption<input value={image.caption || ''} onChange={(event) => changeImage(index, 'caption', event.target.value)} /></label></div><div className="admin-image-actions"><button type="button" title="Move up" disabled={index === 0} onClick={() => moveImage(index, -1)}>↑</button><button type="button" title="Move down" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button type="button" className="admin-delete-action" onClick={() => removeImage(index)}>Remove</button>{!image.is_cover && <button type="button" onClick={() => setImages((current) => current.map((item, itemIndex) => ({ ...item, is_cover: itemIndex === index })))}>Set cover</button>}</div></article>)}</div>}
        </section>
      </div>
      <aside className="property-editor-aside"><section className="admin-panel editor-panel"><p className="eyebrow eyebrow-dark">05 · Publication</p><h2>Listing status</h2><label className="admin-status-select">Status<select name="status" value={form.status} onChange={update}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label className="admin-checkbox"><input type="checkbox" name="is_featured" checked={form.is_featured} onChange={update} /> Featured residence</label><p className="field-note">Featured homes appear in the homepage feature slot.</p><button className="button button-dark editor-save" type="submit" value={form.status} disabled={busy}>{busy ? 'Saving…' : form.status === 'published' ? 'Save and publish' : form.status === 'archived' ? 'Save archived listing' : 'Save draft'} <span aria-hidden="true">↗</span></button>{form.status !== 'published' && <button className="button button-outline editor-save" type="submit" value="published" disabled={busy}>Publish listing</button>}{form.status !== 'draft' && <button className="button button-outline editor-save" type="submit" value="draft" disabled={busy}>Save as draft</button>}{form.status !== 'archived' && propertyId && <button className="text-link editor-archive" type="button" onClick={() => setForm((current) => ({ ...current, status: 'archived' }))}>Archive listing</button>}{dirty && <small className="unsaved-label">Unsaved changes</small>}</section>{propertyId && <a className="text-link" href={`/admin/properties/${propertyId}/preview`} target="_blank" rel="noreferrer">Preview property <span aria-hidden="true">↗</span></a>}</aside>
    </form>
  </section>;
}

export default AdminApp;

