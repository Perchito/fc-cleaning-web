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
- [ ] Privacy / Terms / 404

## Assets to upload (via GitHub web: Add file → Upload files)

Binary files can't be pushed via API — upload these from the old repo (`fc_cleaning_site/images/company-logo/`):

- `fc-logo-white-icon.png` → `public/images/fc-logo-white-icon.png` (header + footer logo)
- `fc-logo-black-icon.png` → `public/favicon.png` (browser tab icon)
- Hero photo → `public/images/hero.jpg` (styled placeholder shows until then)

Note: `FC-NO-BG` shared as a `.jpeg` arrives as a blank white image — JPEG has no transparency,
so always share the logo as the original PNG.

## Notes

- Contact form is wired to Formspree (`mzdjyqnv`) — first submission sends a verification email to the recipient address; confirm it once and enquiries flow to the inbox
- WhatsApp button links to 07473 379928 via wa.me/447473379928
