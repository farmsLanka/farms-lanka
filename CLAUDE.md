# Farms Lanka Org — Website Project Brief

This file is the source of truth for this project. Read it fully before writing any code.

**Status:** built and content-complete, pending deployment. All of the client's
round-one corrections (Nov 2026) are already applied in the components — the text
below reflects the CORRECTED copy. Do not revert to earlier wording.

## Project

A single static, professional landing page for **FARMS LANKA** — a Christian humanitarian
organization delivering relief and development work across Sri Lanka since 1973.
Pro-bono build (developer's labour is free); only AWS running costs are billed
to the client. Built by Irosh Mathews.

No CMS, no database, no backend. Static site only.

## Tech stack

- **Astro 7** — static output
- **Tailwind CSS v4** (via `@tailwindcss/vite`; theme tokens live in `src/styles/global.css`)
- `astro-icon` with Phosphor (`ph:*`) icons
- `@fontsource` — Source Serif 4 (display) + Work Sans (body)
- `@astrojs/sitemap`
- Images via `astro:assets` `<Image>` — sources in `src/assets/`, auto-converted to WebP

## Design direction

- Deep forest **green** palette (client request). Tokens: `brand-50` … `brand-950`,
  single restrained `gold-*` accent, `paper-*` neutrals. Never introduce new raw hex.
- Tone: warm, dignified, trustworthy — a 50+ year old humanitarian/faith organization,
  not a startup. Deliberately restrained: no dark-mode-agency, neon, or heavy glassmorphism.
- Motion follows Emil Kowalski's rules: `transform`/`opacity` only, custom ease-out
  `cubic-bezier(0.23, 1, 0.32, 1)`, UI feedback under 300ms, `:active` scale ~0.97,
  everything gated behind `prefers-reduced-motion`.
- Scroll reveal: add `data-reveal` to an element (optionally `style="--reveal-delay:60ms"`).
  The hidden state is scoped to `.js` so content still shows if JS fails. Observer lives
  in `src/layouts/Layout.astro`.

## Components

`src/components/` — Nav, Hero, WhoWeAre, VideoMessage, Programs, Certifications, Contact, Footer.
Composed in `src/pages/index.astro`, wrapped by `src/layouts/Layout.astro`.

## Brand assets

- `src/assets/brand/logo-green.png` — logo in `brand-800`, transparent (light backgrounds)
- `src/assets/brand/logo-white.png` — logo in `paper-50`, transparent (dark backgrounds)
- Source logo was lime-on-white; the white was keyed out via the red channel and recoloured.
- `public/` holds favicon.ico, favicon-16/32.png, apple-touch-icon.png, icon-512.png, og-image.jpg

## Site content (CORRECTED — current)

### Name / tagline
**FARMS LANKA** — A Christian Humanitarian Organization in relief and development
projects since 1973

### Hero
- Headline: **Faith in action since 1973.**
- Body: A Christian humanitarian organization supporting relief and development projects
  across Sri Lanka for over fifty years.
- Visual: the FARMS LANKA logo on a `brand-50` panel (client asked for the logo here).

### Who We Are
FARMS LANKA is a Christian humanitarian organization dedicated to relief and development,
faithfully serving communities across Sri Lanka since 1973. Founded to address fundamental
human needs such as food security, shelter, proper education, and sustainable livelihoods,
we began by empowering communities through agriculture and animal husbandry. As the needs
of communities evolved, our work expanded into sewing, fisheries, handicrafts, grocery,
carpentry, cottage industry, and other family-based initiatives.

For more than five decades we have served with compassion, dignity, and practical support,
inspired by the love of Christ and a desire to demonstrate God's love through meaningful
action, helping families build sustainable, self-supporting futures.

Today, by God's grace, the mission continues, serving communities, transforming lives,
and bringing hope to those in need.

Photo: `src/assets/photos/front-premises.jpg` (the FARMS LANKA office in Moratuwa).

### Programs (each has its own client photo in `src/assets/photos/`)
- Agriculture Seminars — `agriculture-seminars.jpg`
- Livelihood Projects — `livelihood-projects.jpg`
- Disaster Management & Relief — `disaster-relief.jpg`
- Social Awareness Programs — `social-awareness.jpg`
- Churches & Societies — `churches-societies.jpg`
- Schools & Children's Clubs — `schools-children.jpg`

### Certifications & Awards
- Sustainable Development Goals Excellence Service Award
  (the client struck "United Nations" — do not re-add it)
- Global Youth Service Award
- Thirasarashuree Award
- Peace Ambassador Award — Mr. Clarence I. Mendis, General Manager

### Video
YouTube `AobfTkW03tI`, an interview with Clarence Mendis. Click-to-play facade only:
the poster is the YouTube `maxresdefault` thumbnail and **nothing loads from YouTube
until the user presses play**. Do not reintroduce autoplay or scroll-triggered loading.
Currently resumes at `startSeconds = 30`.

### Contact
- No 91/8 St. Peter's Road, Moratuwa (note: 91/**8**, not 91/6)
- Landline 011 2657564 · Mobile 070 106 5358 · Fax 011 2659102
- farmslanka1973@gmail.com (may move to a domain address later — not in scope)
- Mon–Fri, 10:30 AM – 5:00 PM
- Map coordinates: **6.7663933, 79.8891938**
- No social media accounts — do not add social links or icons

## SEO

Handled in `src/layouts/Layout.astro`: title/description/keywords, canonical, robots,
Open Graph + Twitter card, and `NGO` JSON-LD (address, geo, hours, contact, awards).
`@astrojs/sitemap` emits `sitemap-index.xml`; `public/robots.txt` points at it.

**Google Search Console:** set `googleSiteVerification` in `Layout.astro` to the token
from the "HTML tag" verification method, then rebuild and redeploy. Can only be done
once the site is live at farmslanka.org.

## Hosting & deployment (not yet set up)

- **S3** (private) → **CloudFront** (CDN, HTTPS) → **ACM** (SSL) → **Route 53** (DNS;
  domain stays registered at GoDaddy, nameservers point to Route 53)
- **GitHub Actions** for build & deploy
- AWS account to be owned by the client on the **Paid Plan**, with the developer added
  as an IAM admin. GitHub repo likewise to end up under client-accessible ownership.
- Neither blocks local development.

## Out of scope

- Social media setup, marketing, or handling
- Email account setup (e.g. info@farmslanka.org)
- Ongoing copywriting beyond the content above
