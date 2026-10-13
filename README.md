# Still House — Real Estate Website & Property CMS

Still House is a polished real estate experience built around a cinematic, scroll-controlled home tour and a practical property management CMS. The public site pairs editorial storytelling with live property listings; the private studio lets an authorized administrator manage listings without editing React source code.

## What makes it stand out

- **A scroll-driven property tour:** 300 image frames are drawn to a full-screen canvas and scrub forward or backward with the visitor's scroll. The tour stays pinned while it plays, then returns to the regular page flow.
- **Context at the right moment:** room annotations pause the sequence for a full viewport of scrolling at frame 150 (living room), frame 215 (kitchen), and the final private-viewing call to action. Each glass panel is anchored to the viewport, animates with scroll progress, and reverses naturally when scrolling up.
- **An editorial real estate identity:** the sequence leads into a considered homepage, featured residence, collection, about, and contact pages. Property discovery and management use the same visual language instead of a generic dashboard template.
- **Real property data:** published listings are fetched from Supabase. Search, filters, sorting, pagination, property details, and gallery images all use database records.
- **A secure property studio:** authorized administrators can create and edit listings, manage drafts and publication, feature a property, and curate its image gallery.

## Website features

### Public experience

- Responsive, full-screen scroll-controlled image sequence with a canvas renderer.
- Room annotations at selected sequence frames with frosted-glass styling and scroll-linked opacity, movement, and blur.
- Homepage sections for the Still House approach, featured residence, property details, and enquiry.
- Residence collection with search, sale/rent and property-type filters, location and price filtering, bedroom filtering, sorting, and pagination.
- Slug-based property detail pages with specifications, amenities, location, and signed gallery images.
- About and contact pages, responsive navigation, loading, empty, and error states.
- Public queries expose published properties only; optional street addresses stay private.

### Property CMS

The CMS is available at `/admin` and `/admin/login`.

- Supabase email/password authentication with an explicit administrator allowlist.
- Dashboard metrics based on database records.
- Property search, status/listing/type filters, sorting, pagination, previews, and management actions.
- Reusable create/edit form for property description, slug, price, location, specifications, amenities, featured state, and publication status.
- Draft, publish, unpublish, archive, and confirmed delete workflows.
- Multiple image uploads with local previews, ordering, cover selection, captions, and alt text.
- Images stored in a private Supabase Storage bucket; the database stores storage paths and gallery metadata rather than image data.

## How the CMS works

Supabase is the source of truth for property records. The React app uses the Supabase publishable key, while PostgreSQL Row Level Security enforces access on the server:

1. An owner creates an administrator account in Supabase Auth and adds that user's UUID to `public.property_admins`.
2. The admin signs in to the private property studio. The app checks the allowlist through `is_property_admin()`; the database policies independently enforce the same authorization.
3. The administrator creates or edits a listing. A listing can remain a draft, be published to the public collection, or be archived.
4. Gallery files are uploaded to the private `property-images` bucket. Ordered metadata and storage paths are written to `property_images`.
5. Public pages query the published-only `public_properties` view. Draft and archived records are not available to public visitors.

The migration is in [`supabase/migrations/202610130001_property_cms.sql`](supabase/migrations/202610130001_property_cms.sql). It defines the property tables, indexes, timestamps, RLS policies, admin checks, image replacement RPC, and storage bucket policies.

## Architecture

```text
src/
  main.jsx                         Public routes and scroll-sequence experience
  features/admin/AdminApp.jsx      Admin dashboard, listing table, and editor
  features/admin/authService.js    Sign-in and administrator authorization
  features/properties/             Public queries, admin mutations, image handling, validation
  lib/supabase.js                  Environment-based Supabase client
  styles.css                       Site and responsive styling
supabase/
  config.toml                      Supabase CLI project configuration
  migrations/                      Version-controlled PostgreSQL schema and policies
tests/
  propertyValidation.test.js       Focused property form validation tests
```

## AI in the development process

AI was used as a development copilot to turn the brief into a concrete implementation: shaping the scroll-linked sequence and annotation timing, organizing the Supabase schema and access rules, building the CMS flows, and helping diagnose configuration and data-fetch issues. The resulting code and migration were reviewed and exercised with the available build, unit tests, and live database checks.

**AI is not a feature of the shipped product.** The website does not use AI to generate listings, make recommendations, or process visitor data. Property content is entered and managed by an administrator.

## Technology

- React and Vite
- Supabase Auth, PostgreSQL, Storage, and Row Level Security
- JavaScript, CSS, HTML Canvas, and the browser image APIs
- Node.js built-in test runner

## Run locally

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Create a local `.env` (or `.env.local`) from `.env.example`:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Restart Vite after changing environment variables. Never place a database password, service-role key, or other privileged credential in a `VITE_` variable. Environment files are excluded from Git; `.env.example` contains placeholders only.

## Supabase setup

1. Create a Supabase project and configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` locally and in your hosting environment.
2. Apply `supabase/migrations/202610130001_property_cms.sql` to the project's PostgreSQL database. For a fresh project, use the Supabase SQL Editor or the Supabase CLI migration workflow.
3. Create an administrator in **Authentication → Users**. Copy that user's UUID and run this as the project owner in the SQL Editor:

   ```sql
   insert into public.property_admins (user_id)
   values ('AUTH_USER_UUID');
   ```

4. Keep public sign-ups disabled. Do not expose the database password or service-role key in the browser.
5. Start the app with `npm run dev`, sign in at `/admin/login`, and create a listing. Publish it to make it appear in `/residences` and `/properties/:slug`.

The schema migration has been applied to the configured Supabase project used during development. Applying it to any other project is a separate setup step. No credentials are included in this repository.

## Deploy to Vercel

The site is a Vite single-page app. `vercel.json` rewrites direct requests such as `/residences`, `/about`, `/admin/login`, and `/properties/:slug` to the app entry point so browser refreshes and shared page links load correctly.

1. In Vercel, choose **Add New → Project** and import `Wisdom1121/still-house-real-estate-cms` from GitHub.
2. Keep the project root at `.`. Select **Vite** if Vercel does not detect it automatically. Use `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory.
3. Add these two environment variables in the Vercel project settings for **Production**, **Preview**, and **Development**:

   ```text
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
   ```

   Use the URL and publishable key from the same Supabase project where the CMS migration and administrator allowlist were configured. These `VITE_` values are embedded in browser code at build time; only use the publishable key here. Never add `SUPABASE_DB_PASSWORD`, a database connection string, or a Supabase secret/service-role key to Vercel's `VITE_` variables.
4. Deploy. After changing environment variables, trigger a new deployment so Vite rebuilds with the updated values. GitHub pushes to the connected production branch will trigger future deployments.
5. In Supabase **Authentication → URL Configuration**, set the production Vercel URL (or your custom domain) as the Site URL. Add the Vercel preview domain patterns to Redirect URLs only if you use auth flows that redirect back to the site.
6. Verify `/`, `/residences`, `/about`, `/contact`, `/admin/login`, and one published `/properties/:slug` URL by opening each directly and refreshing. Sign in at `/admin/login` with the existing allowlisted administrator. Publish a property in `/admin/properties` to make it appear on the public site.

Supabase remains the backend: PostgreSQL and RLS protect property records, Supabase Auth handles the administrator session, and Supabase Storage holds property images. Vercel hosts the static React frontend; no separate Vercel API functions are needed for the current CMS. The contact form is still a front-end preview and does not send or store enquiries until an email or lead-capture backend is connected.

## Checks

```bash
npm test
npm run build
```

The current unit suite covers slug and property-field validation. The production build succeeds; Vite reports a bundle-size warning for the main JavaScript chunk. Live authentication, browser-session behavior, image uploads, and deployment hosting configuration depend on the target Supabase project and should be verified in that environment.

## Portfolio notes

This project brings together brand storytelling, scroll-linked interaction design, responsive property discovery, and a real administrative workflow. The defining interaction is the frame-accurate home tour; the CMS makes the listings behind that experience maintainable by a non-developer while keeping access control in the database.

