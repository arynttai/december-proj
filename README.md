# Jeltoqsan: The December 1986 Uprising in Alma-Ata

Immersive scrollytelling web app — **HTML**, **Tailwind CSS**, **GSAP ScrollTrigger**, archival photos from the Almaty State Archive.

## Quick start

```bash
npx serve .
```

Open `http://localhost:3000` (or the port shown).

## Project structure

```
index.html      — page structure
css/main.css    — design system & components
js/app.js       — GSAP scrollytelling logic
images/         — archival & monument photos
```

## Features

- Fixed nav with scroll progress and section highlights
- Hero with portrait, stats, and “Explore timeline” CTA
- Compact timeline rows (photo + text) — no long pinned scroll
- Jump chips to skip between milestones
- Legacy section with monument imagery and stat cards
- Loader, back-to-top, `prefers-reduced-motion` support
