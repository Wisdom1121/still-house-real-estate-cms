import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import AdminApp from './features/admin/AdminApp.jsx';
import Icon from './components/Icon.jsx';
import { supabaseConfigured, SUPABASE_SETUP_MESSAGE } from './lib/supabase.js';
import { formatPrice, getFeaturedProperty, getPublishedPropertyBySlug, listPublishedProperties, propertyLocation } from './features/properties/propertyService.js';

const FRAME_COUNT = 300;
const frameUrls = Object.entries(import.meta.glob('../jpg sequence/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}))
  .sort(([pathA], [pathB]) => pathA < pathB ? -1 : pathA > pathB ? 1 : 0)
  .map(([, url]) => url);
const FRAME_PATH = (index) => frameUrls[index];
const imageAt = (frame) => frameUrls[frame - 1];
const ANNOTATIONS = [
  {
    id: 'living-room',
    frame: 150,
    position: { x: 19, y: 28 },
    mobilePosition: { x: 28, y: 26 },
    title: 'Luxury living room',
    description: 'A generous living room with a pale sectional, warm timber ceiling, and full-height garden glazing.',
  },
  {
    id: 'fitted-kitchen',
    frame: 215,
    position: { x: 18, y: 76 },
    mobilePosition: { x: 30, y: 78 },
    title: 'Modern fitted kitchen',
    description: 'Warm timber cabinetry, clean stone surfaces, and a generous central island.',
  },
  {
    id: 'private-viewing',
    frame: FRAME_COUNT,
    position: { x: 74, y: 70 },
    mobilePosition: { x: 50, y: 70 },
    title: 'Experience it in person.',
    description: 'Book a private viewing.',
    href: '/contact',
  },
];
const BASE_SEQUENCE_HEIGHT_VH = Math.max(300, FRAME_COUNT * 1.05);

function ScrollSequenceHero() {
  const sectionRef = useRef(null);
  const canvasRef = useRef(null);
  const framesRef = useRef([]);
  const targetFrameRef = useRef(0);
  const renderedFrameRef = useRef(-1);
  const frameCountRef = useRef(null);
  const copyRef = useRef(null);
  const annotationRefs = useRef([]);

  useEffect(() => {
    let disposed = false;
    const images = new Array(FRAME_COUNT);
    framesRef.current = images;

    // Load the opening frames first so the hero is visible immediately; the
    // rest follow in parallel batches and are decoded before they are drawn.
    const loadFrame = (index) => new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = FRAME_PATH(index);
      image.onload = async () => {
        try { await image.decode(); } catch { /* onload still provides a drawable image */ }
        if (!disposed) {
          images[index] = image;
          renderedFrameRef.current = -1;
        }
        resolve();
      };
      image.onerror = () => resolve();
    });

    const preload = async () => {
      await Promise.all(Array.from({ length: 12 }, (_, index) => loadFrame(index)));
      for (let index = 12; index < FRAME_COUNT; index += 12) {
        if (disposed) return;
        const end = Math.min(index + 12, FRAME_COUNT);
        await Promise.all(Array.from({ length: end - index }, (_, offset) => loadFrame(index + offset)));
      }
    };
    preload();

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    let animationFrame = 0;

    const draw = () => {
      const requested = targetFrameRef.current;
      if (requested === renderedFrameRef.current && canvas.width) return;
      let image = images[requested];
      // If scrolling outruns the loader, draw the nearest ready frame.
      if (!image) {
        for (let distance = 1; distance < FRAME_COUNT; distance += 1) {
          image = images[requested - distance] || images[requested + distance];
          if (image) break;
        }
      }
      if (!image || !canvas.width || !canvas.height) return;

      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.fillStyle = '#10110f';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      renderedFrameRef.current = requested;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        renderedFrameRef.current = -1;
      }
      draw();
    };

    const tick = () => {
      draw();
      animationFrame = requestAnimationFrame(tick);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const update = () => {
      const section = sectionRef.current;
      if (!section) return;
      const viewportHeight = window.innerHeight;
      const totalTravel = Math.max(0, section.offsetHeight - viewportHeight);
      const scrollOffset = Math.min(totalTravel, Math.max(0, -section.getBoundingClientRect().top));
      const pauseDistance = viewportHeight;
      const sequenceTravel = Math.max(1, totalTravel - ANNOTATIONS.length * pauseDistance);
      let scrollCursor = 0;
      let previousFrame = 0;
      let rawFrame = 0;
      let activeIndex = -1;
      let activeProgress = 0;

      for (let index = 0; index < ANNOTATIONS.length; index += 1) {
        const annotation = ANNOTATIONS[index];
        const markerFrame = Math.max(previousFrame, Math.min(FRAME_COUNT - 1, annotation.frame - 1));
        const segmentDistance = ((markerFrame - previousFrame) / (FRAME_COUNT - 1)) * sequenceTravel;
        const pauseStart = scrollCursor + segmentDistance;

        if (scrollOffset < pauseStart) {
          rawFrame = previousFrame + ((scrollOffset - scrollCursor) / sequenceTravel) * (FRAME_COUNT - 1);
          break;
        }

        if (scrollOffset <= pauseStart + pauseDistance || index === ANNOTATIONS.length - 1) {
          rawFrame = markerFrame;
          activeIndex = index;
          activeProgress = Math.max(0, Math.min(1, (scrollOffset - pauseStart) / pauseDistance));
          break;
        }

        scrollCursor = pauseStart + pauseDistance;
        previousFrame = markerFrame;
      }

      if (activeIndex === -1 && scrollOffset >= scrollCursor) {
        rawFrame = previousFrame + ((scrollOffset - scrollCursor) / sequenceTravel) * (FRAME_COUNT - 1);
      }

      const frame = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(rawFrame)));
      targetFrameRef.current = frame;
      if (frameCountRef.current) frameCountRef.current.textContent = String(frame + 1).padStart(3, '0');

      // Scroll progress is transient, so update through refs instead of
      // rendering the whole page on each scroll event.
      const copy = copyRef.current;
      if (copy) {
        const sequenceProgress = sequenceTravel > 0 ? rawFrame / (FRAME_COUNT - 1) : 0;
        copy.style.opacity = String(Math.max(0, 1 - sequenceProgress / 0.11));
        copy.style.transform = `perspective(900px) translate3d(0, ${-sequenceProgress * 70}px, ${-sequenceProgress * 420}px) scale(${1 + sequenceProgress * 0.14})`;
        copy.style.pointerEvents = sequenceProgress > 0.01 ? 'none' : 'auto';
      }

      const isMobile = window.matchMedia('(max-width: 640px)').matches;
      const placements = ANNOTATIONS.map((annotation, index) => {
        const panel = annotationRefs.current[index]?.panel;
        const desired = isMobile && annotation.mobilePosition ? annotation.mobilePosition : annotation.position;
        const width = panel?.offsetWidth || 360;
        const height = panel?.offsetHeight || 160;
        const x = desired.x / 100 * window.innerWidth;
        const y = desired.y / 100 * viewportHeight;
        const safeX = Math.max(width / 2 + 16, Math.min(window.innerWidth - width / 2 - 16, x));
        const safeY = Math.max(height / 2 + 16, Math.min(viewportHeight - height / 2 - 16, y));
        return { panel, safeX, safeY, refs: annotationRefs.current[index] };
      });

      placements.forEach(({ panel, safeX, safeY, refs }, index) => {
        if (!panel || !refs) return;
        panel.style.left = `${safeX}px`;
        panel.style.top = `${safeY}px`;
        const isActive = index === activeIndex;
        const progress = isActive ? activeProgress : 0;
        const easeOut = (value) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);
        const entering = easeOut(progress / 0.2);
        const leaving = easeOut((progress - 0.8) / 0.2);
        const visible = entering * (1 - leaving);
        const descriptionIn = easeOut((progress - 0.035) / 0.165);
        panel.style.opacity = String(visible);
        panel.style.transform = `translate3d(-50%, calc(-50% + ${20 * (1 - entering) - 20 * leaving}px), 0)`;
        panel.style.filter = `blur(${8 * (1 - entering) + 8 * leaving}px)`;
        panel.style.pointerEvents = isActive && visible > 0.25 && ANNOTATIONS[index].href ? 'auto' : 'none';
        if (refs.heading) {
          refs.heading.style.opacity = String(entering * (1 - leaving));
          refs.heading.style.transform = `translateY(${8 * (1 - entering) - 6 * leaving}px)`;
        }
        if (refs.description) {
          refs.description.style.opacity = String(descriptionIn * (1 - leaving));
          refs.description.style.transform = `translateY(${10 * (1 - descriptionIn) - 6 * leaving}px)`;
        }
        if (refs.category) {
          refs.category.style.opacity = String(entering * (1 - leaving));
          refs.category.style.transform = `translateY(${7 * (1 - entering) - 5 * leaving}px)`;
        }
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <section
      className="sequence-section"
      ref={sectionRef}
      style={{ '--sequence-length': `calc(${BASE_SEQUENCE_HEIGHT_VH}vh + ${ANNOTATIONS.length * 100}vh)` }}
      aria-label="Scroll through the home"
    >
      <div className="sequence-sticky">
        <canvas ref={canvasRef} className="sequence-canvas" aria-label="A contemporary home, from exterior to interior" />
        <div className="image-shade" aria-hidden="true" />
        <div className="hero-copy" ref={copyRef}>
          <p className="eyebrow">A home in its element</p>
          <h1>Space to<br />come home to.</h1>
          <p className="hero-description">Thoughtful architecture. Natural light. A quieter way to live.</p>
          <a className="hero-cta" href="/residence">Explore the residence <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a>
        </div>
        <div className="scroll-cue" aria-hidden="true">
          <span className="scroll-line" />
          <span>Scroll to explore</span>
        </div>
        <p className="frame-count" aria-hidden="true"><span ref={frameCountRef}>001</span> <span>/ 300</span></p>
        <div className="annotation-layer" aria-label="Property details">
          {ANNOTATIONS.map((annotation, index) => {
            const setRef = (key) => (node) => {
              if (!annotationRefs.current[index]) annotationRefs.current[index] = {};
              annotationRefs.current[index][key] = node;
            };
            const content = <>
              {annotation.category && <span className="annotation-category" ref={setRef('category')}>{annotation.category}</span>}
              <span className="annotation-title" ref={setRef('heading')}>{annotation.title}</span>
              <span className="annotation-description" ref={setRef('description')}>{annotation.description}</span>
            </>;
            return annotation.href
              ? <a key={annotation.id} className="annotation-glass annotation-link" ref={setRef('panel')} href={annotation.href} aria-label={`${annotation.title} ${annotation.description}`}>{content}</a>
              : <article key={annotation.id} className="annotation-glass" ref={setRef('panel')}>{content}</article>;
          })}
        </div>
      </div>
    </section>
  );
}

function SiteHeader({ overlay = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className={`site-header${overlay ? ' site-header-overlay' : ''}`}>
      <a className="wordmark" href="/" onClick={closeMenu} aria-label="Still House home">
        <span className="wordmark-mark" aria-hidden="true">S</span>
        <span>STILL HOUSE<small>REAL ESTATE · EST. 2012</small></span>
      </a>
      <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((open) => !open)}>
        <span /><span />
      </button>
      <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
        <a href="/residences" onClick={closeMenu}>Residences</a>
        <a href="/about" onClick={closeMenu}>Our approach</a>
        <a className="nav-contact" href="/contact" onClick={closeMenu}>Get in touch <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a>
      </nav>
    </header>
  );
}

function SectionHeading({ eyebrow, title, copy, link, linkText }) {
  return (
    <div className="section-heading">
      <div><p className="eyebrow eyebrow-dark">{eyebrow}</p><h2>{title}</h2></div>
      <div className="section-heading-aside">
        {copy && <p>{copy}</p>}
        {link && <a className="text-link" href={link}>{linkText || 'Discover more'} <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a>}
      </div>
    </div>
  );
}

function ImageCard({ frame, label, title, copy, href = '/residence', tall = false }) {
  return (
    <a className={`image-card${tall ? ' image-card-tall' : ''}`} href={href}>
      <img src={imageAt(frame)} alt={label} loading="lazy" />
      <span className="image-card-shade" />
      <span className="image-card-copy"><span className="card-kicker">{label}</span><strong>{title}</strong>{copy && <span className="card-description">{copy}</span>}</span>
      <span className="card-arrow" aria-hidden="true"><Icon name="arrow-up-right" /></span>
    </a>
  );
}

function HomePage() {
  return (
    <>
      <SiteHeader overlay />
      <ScrollSequenceHero />
      <section className="intro-section page-wrap">
        <p className="eyebrow eyebrow-dark">A different kind of real estate</p>
        <div className="intro-grid">
          <h2>Good homes make room for life.</h2>
          <div><p>We bring considered homes and the people who love them together. Each residence is chosen for the way it feels to live in—not just the way it looks.</p><a className="text-link" href="/about">Get to know Still House <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></div>
        </div>
        <div className="intro-rule"><span>01</span><span>Considered living, from first look to front door</span><span>Los Angeles · California</span></div>
      </section>

      <FeaturedResidence />

      <section className="qualities-section">
        <div className="page-wrap">
          <SectionHeading eyebrow="Made to be lived in" title="The feeling is in the details." copy="A thoughtful home does more than make an impression. It makes everyday life feel a little more considered." />
          <div className="qualities-grid">
            <ImageCard frame={120} label="01 / Arrival" title="A warm welcome" copy="An entry that opens into the life of the home." />
            <ImageCard frame={210} label="02 / Gathering" title="Room to come together" copy="The kitchen at the heart of daily life." />
            <ImageCard frame={300} label="03 / Retreat" title="A quieter place" copy="Natural textures and soft morning light." tall />
          </div>
        </div>
      </section>

      <section className="approach-band page-wrap">
        <span className="approach-mark" aria-hidden="true">S.</span>
        <div><p className="eyebrow">The Still House approach</p><h2>Real estate, with a little more <em>feeling.</em></h2><p>We believe finding a home should feel personal, thoughtful and unrushed. Our small team brings care to every conversation and clarity to every step.</p><a className="button button-light" href="/about">How we work <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></div>
        <span className="approach-note">A more personal<br />way home.</span>
      </section>

      <section className="inquiry-section">
        <div className="inquiry-image" style={{ backgroundImage: `url(${imageAt(1)})` }} role="img" aria-label="Soft evening light across a contemporary home" />
        <div className="inquiry-copy"><p className="eyebrow eyebrow-dark">Your next chapter</p><h2>Let's find a place<br />that feels like you.</h2><p>Tell us what home means to you. We’ll help you take it from there.</p><a className="button button-dark" href="/contact">Start a conversation <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></div>
      </section>
    </>
  );
}

function PageIntro({ eyebrow, title, copy, image = 1 }) {
  return (
    <section className="page-intro">
      <div className="page-intro-copy"><p className="eyebrow eyebrow-dark">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>
      <div className="page-intro-image"><img src={imageAt(image)} alt="A view inside the Still House residence" /></div>
    </section>
  );
}

function FeaturedResidence() {
  const [property, setProperty] = useState(null);
  const [status, setStatus] = useState(supabaseConfigured ? 'loading' : 'empty');
  useEffect(() => {
    let active = true;
    if (!supabaseConfigured) return undefined;
    getFeaturedProperty().then((result) => { if (active) { setProperty(result); setStatus(result ? 'ready' : 'empty'); } })
      .catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, []);
  return (
    <section className="featured-section page-wrap">
      <SectionHeading eyebrow="The featured residence" title="A home with a sense of calm." copy="Explore the homes currently available through Still House." link="/residences" linkText="View all residences" />
      {status === 'loading' && <p className="property-state" role="status">Loading featured residence…</p>}
      {status === 'error' && <p className="property-state property-state-error" role="alert">We couldn’t load the featured residence. Please try again later.</p>}
      {status === 'empty' && <p className="property-state">{supabaseConfigured ? 'There are no featured residences at the moment.' : SUPABASE_SETUP_MESSAGE}</p>}
      {property && <>
        <a className="featured-image" href={`/properties/${property.slug}`}>
          {property.cover_image && <img src={property.cover_image.url} alt={property.cover_image.alt_text || property.title} loading="lazy" />}
          {!property.cover_image && <span className="property-image-placeholder">Images coming soon</span>}
          <span className="featured-tag">{propertyLocation(property) || 'Featured residence'} <b><Icon name="arrow-up-right" /></b></span>
        </a>
        <div className="feature-meta"><span>{property.title}</span><span>{formatPrice(property)}</span><span>{property.bedrooms ?? '—'} bedrooms · {property.property_type}</span></div>
      </>}
    </section>
  );
}

function ResidencesPage() {
  const [properties, setProperties] = useState([]);
  const [filters, setFilters] = useState({ search: '', listingType: '', propertyType: '', state: '', minPrice: '', maxPrice: '', bedrooms: '', sort: 'newest' });
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState(supabaseConfigured ? 'loading' : 'empty');
  const [error, setError] = useState('');
  const pageSize = 9;
  useEffect(() => {
    let active = true;
    if (!supabaseConfigured) return undefined;
    setStatus('loading');
    listPublishedProperties({ ...filters, page, pageSize })
      .then((result) => { if (active) { setProperties(result.properties); setCount(result.count); setStatus('ready'); setError(''); } })
      .catch((reason) => { if (active) { setError(reason.message); setStatus('error'); } });
    return () => { active = false; };
  }, [filters, page]);
  const updateFilter = (event) => { setPage(1); setFilters((current) => ({ ...current, [event.target.name]: event.target.value })); };
  return (
    <>
      <PageIntro eyebrow="The collection" title={<>Homes with<br />a point of view.</>} copy="A small, considered collection of homes chosen for their architecture, their setting and the life they make possible." image={120} />
      <section className="listing-section page-wrap">
        <div className="listing-toolbar"><span>{count} {count === 1 ? 'residence' : 'residences'}</span><span>Thoughtfully selected</span></div>
        <form className="property-filters" onSubmit={(event) => event.preventDefault()} aria-label="Filter residences">
          <label>Search<input name="search" value={filters.search} onChange={updateFilter} placeholder="Title or location" /></label>
          <label>Listing<select name="listingType" value={filters.listingType} onChange={updateFilter}><option value="">All</option><option value="sale">For sale</option><option value="rent">For rent</option></select></label>
          <label>Property type<select name="propertyType" value={filters.propertyType} onChange={updateFilter}><option value="">All types</option>{['house','apartment','villa','land','duplex','other'].map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
          <label>State<input name="state" value={filters.state} onChange={updateFilter} placeholder="Any state" /></label>
          <label>Min price<input type="number" min="0" name="minPrice" value={filters.minPrice} onChange={updateFilter} /></label>
          <label>Max price<input type="number" min="0" name="maxPrice" value={filters.maxPrice} onChange={updateFilter} /></label>
          <label>Bedrooms<input type="number" min="0" name="bedrooms" value={filters.bedrooms} onChange={updateFilter} placeholder="Any" /></label>
          <label>Sort<select name="sort" value={filters.sort} onChange={updateFilter}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
        </form>
        {status === 'loading' && <p className="property-state" role="status">Loading residences…</p>}
        {status === 'error' && <p className="property-state property-state-error" role="alert">We couldn’t load residences: {error}</p>}
        {status === 'empty' && <p className="property-state">{supabaseConfigured ? 'No published residences match those filters.' : SUPABASE_SETUP_MESSAGE}</p>}
        {status === 'ready' && properties.length === 0 && <p className="property-state">No published residences match those filters.</p>}
        {status === 'ready' && properties.map((property) => (
          <a className="listing-card" href={`/properties/${property.slug}`} key={property.id}>
            <div className="listing-card-image">{property.cover_image ? <img src={property.cover_image.url} alt={property.cover_image.alt_text || property.title} loading="lazy" /> : <span className="property-image-placeholder">Images coming soon</span>}<span className="listing-status">{property.is_featured ? 'Featured residence' : property.listing_type === 'rent' ? 'For rent' : 'For sale'}</span></div>
            <div className="listing-card-info"><div><p className="eyebrow eyebrow-dark">{propertyLocation(property) || property.property_type}</p><h2>{property.title}</h2><p>{property.description}</p><p className="property-price">{formatPrice(property)}</p><span className="property-specs">{property.bedrooms ?? '—'} beds · {property.bathrooms ?? '—'} baths · {property.area_sqm ? `${property.area_sqm} m²` : 'Area on request'}</span></div><span className="listing-arrow" aria-hidden="true"><Icon name="arrow-up-right" /></span></div>
          </a>
        ))}
        {count > pageSize && <div className="property-pagination"><button className="text-link" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><Icon name="arrow-left" /> Previous</button><span>Page {page} of {Math.ceil(count / pageSize)}</span><button className="text-link" type="button" disabled={page >= Math.ceil(count / pageSize)} onClick={() => setPage((value) => value + 1)}>Next <Icon name="arrow-right" /></button></div>}
        <p className="collection-note">We keep our collection intentionally small. Every home is selected with care, and every introduction begins with a conversation.</p>
      </section>
      <ContactBanner />
    </>
  );
}

function ResidencePage({ slug }) {
  const [property, setProperty] = useState(null);
  const [status, setStatus] = useState(supabaseConfigured ? 'loading' : 'empty');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!supabaseConfigured) return undefined;
    const fetchProperty = slug ? getPublishedPropertyBySlug(slug) : getFeaturedProperty();
    fetchProperty.then((result) => { if (active) { setProperty(result); setStatus(result ? 'ready' : 'missing'); } })
      .catch((reason) => { if (active) { setError(reason.message); setStatus('error'); } });
    return () => { active = false; };
  }, [slug]);
  if (status === 'loading') return <section className="property-detail-state" role="status">Loading residence…</section>;
  if (!property) return <section className="property-detail-state"><h1>{status === 'missing' ? 'Residence not found.' : 'Residences are being prepared.'}</h1><p>{status === 'error' ? error : supabaseConfigured ? 'This home may no longer be available.' : SUPABASE_SETUP_MESSAGE}</p><a className="text-link" href="/residences">Browse residences <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></section>;
  const gallery = property.property_images || [];
  const cover = property.cover_image;
  return (
    <>
      <div className="residence-hero">{cover && <img src={cover.url} alt={cover.alt_text || property.title} />}<div><p className="eyebrow">{property.is_featured ? 'Featured residence' : `${property.listing_type === 'rent' ? 'For rent' : 'For sale'} · ${property.property_type}`}</p><h1>{property.title}</h1><a className="button button-light" href="/contact">Arrange a private viewing <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></div></div>
      <section className="residence-overview page-wrap"><div><p className="eyebrow eyebrow-dark">{propertyLocation(property) || 'A considered place to land'}</p><h2>{formatPrice(property)}<br />{property.bedrooms ?? '—'} bedrooms</h2></div><div><p>{property.description}</p><p>{[property.area_sqm && `${property.area_sqm} m² interior`, property.bathrooms != null && `${property.bathrooms} bathrooms`, property.parking_spaces != null && `${property.parking_spaces} parking spaces`].filter(Boolean).join(' · ')}</p><a className="text-link" href="/contact">Ask about this residence <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></div></section>
      {gallery.length > 0 && <section className="gallery-section page-wrap"><SectionHeading eyebrow="A closer look" title="Light moves through every room." copy="Explore the spaces and details of this residence." /><div className="gallery-grid">{gallery.map((image) => <figure key={image.id}><img src={image.url} alt={image.alt_text || property.title} loading="lazy" />{image.caption && <figcaption>{image.caption}</figcaption>}</figure>)}</div></section>}
      {property.amenities?.length > 0 && <section className="detail-strip property-amenities"><div><span>FEATURES</span><strong>Details that matter.</strong><p>{property.amenities.join(' · ')}</p></div></section>}
      <ContactBanner />
    </>
  );
}

function AboutPage() {
  return (
    <>
      <PageIntro eyebrow="A more personal way home" title={<>Real estate,<br />with care.</>} copy="Still House is an independent real estate studio built around a simple belief: a home is more than a place. It is where life takes shape." image={210} />
      <section className="about-story page-wrap"><p className="eyebrow eyebrow-dark">Why Still House</p><div><h2>Good guidance<br />makes room for good decisions.</h2><div className="about-body"><p>Moving is personal. The right home can change the rhythm of a morning, bring people closer and give a new chapter a place to begin. We treat that with the care it deserves.</p><p>Our approach is calm, clear and considered. We listen first, share what we know and stay alongside you through each step—from the first conversation to the moment you turn the key.</p></div></div></section>
      <section className="values-section"><div className="page-wrap"><SectionHeading eyebrow="What guides us" title="A few things we believe." /><div className="values-grid"><article><span>01</span><h3>Listen closely.</h3><p>The best advice starts with understanding what matters to you.</p></article><article><span>02</span><h3>Choose thoughtfully.</h3><p>We focus on homes with lasting character and a sense of place.</p></article><article><span>03</span><h3>Make it personal.</h3><p>Every move is different. Your experience should be, too.</p></article></div></div></section>
      <ContactBanner />
    </>
  );
}

function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };
  return (
    <>
      <section className="contact-page page-wrap"><div className="contact-copy"><p className="eyebrow eyebrow-dark">Get in touch</p><h1>Every good move<br />starts somewhere.</h1><p>Tell us a little about what you’re looking for. We’ll be in touch to continue the conversation.</p><div className="contact-direct"><span>Prefer a note?</span><a href="mailto:hello@stillhouse.example">hello@stillhouse.example</a><small>Replace this demo address with your preferred contact email.</small></div></div>
        <div className="contact-form-wrap"><p className="eyebrow eyebrow-dark">Start a conversation</p>{submitted ? <div className="form-success" role="status"><span>Thank you.</span><p>Your message has been recorded in this preview. Connect the form to an inbox to receive inquiries.</p><button className="text-link" type="button" onClick={() => setSubmitted(false)}>Send another message <Icon name="arrow-up-right" /></button></div> : <form className="contact-form" onSubmit={handleSubmit}><label>Your name<input name="name" autoComplete="name" required placeholder="Name" /></label><label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label><label>What brings you to us?<select name="interest" defaultValue=""><option value="" disabled>Select one</option><option>I'm looking for a home</option><option>I have a home to sell</option><option>I'd like to learn more about Still House</option></select></label><label>A little more (optional)<textarea name="message" rows="4" placeholder="Tell us what you're hoping to find…" /></label><button className="button button-dark" type="submit">Send inquiry <span aria-hidden="true"><Icon name="arrow-up-right" /></span></button><small>This is a front-end preview; the form is not connected to an inbox yet.</small></form>}</div>
      </section>
      <section className="contact-note"><p>“The right place has a way of making the next step feel clear.”</p><span>Still House · Real estate, considered</span></section>
    </>
  );
}

function ContactBanner() {
  return <section className="contact-banner page-wrap"><div><p className="eyebrow">A good place to begin</p><h2>Tell us what home<br />means to you.</h2></div><a className="button button-light" href="/contact">Let's talk <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></section>;
}

function SiteFooter() {
  return <footer className="site-footer"><div className="footer-top"><a className="wordmark footer-wordmark" href="/"><span className="wordmark-mark" aria-hidden="true">S</span><span>STILL HOUSE<small>REAL ESTATE · EST. 2012</small></span></a><p>A more personal<br />way home.</p><a className="footer-contact" href="/contact">Start a conversation <span aria-hidden="true"><Icon name="arrow-up-right" /></span></a></div><div className="footer-bottom"><span>© 2026 Still House Real Estate</span><div><a href="/residences">Residences</a><a href="/about">Our approach</a><a href="/contact">Contact</a></div><span>Made for living.</span></div></footer>;
}

function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const isHome = path === '/';
  const propertyMatch = path.match(/^\/properties\/([^/]+)$/);
  const adminPath = path === '/admin' || path.startsWith('/admin/');
  let page;
  if (path === '/residences') page = <ResidencesPage />;
  else if (path === '/residence') page = <ResidencePage />;
  else if (propertyMatch) page = <ResidencePage slug={decodeURIComponent(propertyMatch[1])} />;
  else if (path === '/about') page = <AboutPage />;
  else if (path === '/contact') page = <ContactPage />;
  else page = <HomePage />;

  useEffect(() => {
    const titles = {
      '/': 'Still House — A home, thoughtfully imagined',
      '/residences': 'Residences — Still House Real Estate',
      '/residence': 'Featured residence — Still House Real Estate',
      '/about': 'Our approach — Still House Real Estate',
      '/contact': 'Get in touch — Still House Real Estate',
    };
    document.title = adminPath
      ? 'Property studio — Still House Real Estate'
      : propertyMatch
      ? `${decodeURIComponent(propertyMatch[1])} — Still House Real Estate`
      : titles[path] || titles['/'];
  }, [path]);

  if (adminPath) return <AdminApp path={path} />;
  return <>{!isHome && <SiteHeader />}<main>{page}</main><SiteFooter /></>;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);

