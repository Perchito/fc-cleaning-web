# FC Cleaning Company Ltd — Website

Modern rebuild of fccleaningcompany.com with a premium navy + teal design system.

## Stack

- React 19 + Vite
- Tailwind CSS v4 (Plus Jakarta Sans, custom navy/teal tokens)
- @react-spring/web — physics-based animations (scroll reveals, stat counters, hover springs, FAQ accordion)
- react-router-dom — client-side routing
- Formspree — contact form email delivery

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/` — deployable to Vercel (vercel.json SPA rewrite included), Netlify or GitHub Pages.

## Content status

- [x] Homepage (hero, trust marquee, why-FC stats, services, process, CTA, footer)
- [x] About Us (story, feature blocks, coverage cards)
- [x] Services (4 detailed service blocks, per-service CTAs, process)
- [x] FAQ (categorised accordion, filter tabs, contact sidebar)
- [x] Contact Us (enquiry form → Formspree, contact sidebar, what-to-expect)
- [x] Thank-you (form confirmation)
- [x] Floating WhatsApp button (wa.me/447473379928, prefilled message)
- [x] Privacy / Terms
- [ ] 404 page (unknown routes currently fall through to Home)

## Assets

Live in `public/images/` and wired in code:

- `public/images/FC-NO-BG.png` — header + footer logo (`src/components/Logo.jsx`)
- `public/images/hero-team-cleaning.webp` — homepage hero (`src/sections/Hero.jsx`)
- `public/images/kitchen-cleaning.webp`, `restaurant-bar-cleaning.webp`, `hospitality-deep-cleaning.webp`,
  `washroom-cleaning.webp` — the four service blocks on `src/pages/Services.jsx`
- `public/images/about-cleaning.webp` — About page (`src/pages/About.jsx`)
- Optional: `fc-logo-black-icon.png` from the old repo → `public/favicon.png` (browser tab icon)

**The photos above are stock (Pexels License — free for commercial use, no attribution required),
picked as placeholders because there's no client work to photograph yet.** Swap every one of them
for real photos of your own vans, team and finished venues as soon as you have them — genuine
photography will out-convert stock every time for a hospitality cleaning business. All are already
compressed to WebP (20–75KB each) — keep new photos under ~150KB at the same dimensions
(`cwebp -q 78 in.jpg -o out.webp`, or squoosh.app) so mobile load times don't regress.

Tips:
- If the logo looks invisible on the dark navy header, it's the dark-artwork variant — either upload
  `fc-logo-white-icon.png` instead (update the path in `src/components/Logo.jsx`) or ask for a white backing chip
- `FC-NO-BG` shared as `.jpeg` arrives blank — JPEG has no transparency; always use the PNG

## Performance notes

- Entrance springs are tuned short (tension 210 / friction 26, tight stagger) — full hero entrance settles in ~0.7s
- Glows use static radial gradients (`.hero-glow`) instead of blur filters — far cheaper on low-end phones
- Judge speed with `npm run build && npm run preview` (production), not the dev server — dev is unminified and slower

## Notes

- Contact form is wired to Formspree (`mzdjyqnv`) — first submission sends a verification email to the recipient address; confirm it once and enquiries flow to the inbox
- Floating WhatsApp button opens a chat to 07473 379928 with a prefilled quote request (edit `WHATSAPP_URL` in `src/components/WhatsAppFloat.jsx` to change it)
