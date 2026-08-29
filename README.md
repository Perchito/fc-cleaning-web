# FC Cleaning Company Ltd — Website

Modern rebuild of fccleaningcompany.com with a premium navy + teal design system.

## Stack

- React 19 + Vite
- Tailwind CSS v4 (Plus Jakarta Sans, custom navy/teal tokens)
- @react-spring/web — physics-based animations (scroll reveals, stat counters, hover springs, FAQ accordion)
- react-router-dom — client-side routing

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/` — deployable to Vercel, Netlify or GitHub Pages.

## Content status

- [x] Homepage (hero, trust marquee, why-FC stats, services, process, CTA, footer)
- [x] About Us (story, feature blocks, coverage cards)
- [x] Services (4 detailed service blocks, per-service CTAs, process)
- [x] FAQ (categorised accordion, filter tabs, contact sidebar)
- [ ] Contact Us
- [ ] Thank-you / Privacy / Terms / 404

## Notes

- Hero photo: drop your image into `public/images/hero.jpg` (a styled placeholder shows until then)
- Contact form wiring arrives with the Contact page build
