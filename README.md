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
- [ ] Privacy / Terms / 404

## Assets — move the uploaded images into public/

The logo and hero photo are uploaded at the repo ROOT. The code already points at their final
paths — just move each file via GitHub web (open the file → pencil/Edit → rename the path → Commit):

- `FC-NO-BG.png` → `public/images/fc-logo.png` (header + footer logo)
- `office-cleaning-hero.jpg` → `public/images/hero.jpg` (homepage hero)
- Optional, from the old repo (`fc_cleaning_site/images/company-logo/`): `fc-logo-black-icon.png` → `public/favicon.png`

Tips:
- Compress the 3.2MB hero to a few hundred KB (squoosh.app, ~80% quality) for fast mobile loading
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
