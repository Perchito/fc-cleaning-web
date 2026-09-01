import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSpring, animated } from '@react-spring/web'
import PageHero from '../components/PageHero.jsx'
import Reveal from '../components/Reveal.jsx'
import CtaBand from '../components/CtaBand.jsx'
import Process from '../sections/Process.jsx'
import useHoverSpring from '../hooks/useHoverSpring.js'

const AnimatedLink = animated(Link)

const SERVICES = [
  {
    title: 'Commercial Kitchen Cleaning',
    text: 'Deep cleaning for restaurant kitchens, food prep areas, back-of-house spaces, floors, walls, tiles, and grease-prone surfaces.',
    bullets: [
      'Grease build-up & high-use surfaces',
      'Equipment exteriors, floors & tiles',
      'Scheduled around service & prep times',
    ],
    bestFor: 'Best for restaurants, cafés, takeaways & dark kitchens',
    cta: 'Get a Kitchen Cleaning Quote',
    image: '/images/kitchen-cleaning.webp',
    imageAlt: 'Sanitising a stainless steel commercial kitchen sink',
  },
  {
    title: 'Restaurant, Pub & Bar Cleaning',
    text: 'Routine cleaning for dining rooms, bar areas, entrances, customer toilets, staff areas, and front-of-house spaces before or after service.',
    bullets: [
      'Flexible around opening & closing times',
      'Floors, surfaces, washrooms & touchpoints',
      'Daily or weekly routines available',
    ],
    bestFor: 'Best for restaurants, pubs, bars, cafés & bistros',
    cta: 'Book Restaurant & Bar Cleaning',
    image: '/images/restaurant-bar-cleaning.webp',
    imageAlt: 'Wiping down a table in a restaurant dining area',
  },
  {
    title: 'Hospitality Deep Cleaning',
    text: 'Periodic deep cleans for kitchens, dining rooms, washrooms, floors, and venues that need a full reset before inspections, events or busy periods.',
    bullets: [
      'Pre-inspection & seasonal deep cleans',
      'Extra attention for built-up grease & grime',
      'One-off or repeat schedule available',
    ],
    bestFor: 'Best for any hospitality venue needing a thorough reset',
    cta: 'Ask About Deep Cleaning',
    image: '/images/hospitality-deep-cleaning.webp',
    imageAlt: 'Close-up of a deep clean with gloves and cleaning spray',
  },
  {
    title: 'Washroom & Front-of-House Cleaning',
    text: 'Cleaning for customer toilets, entrances, waiting areas, dining spaces, bar fronts, staff rooms, and all high-traffic customer-facing areas.',
    bullets: [
      'Washroom cleaning for customer & staff facilities',
      'Entrances, floors, tables & high-touch surfaces',
      'Keeps your venue presentable before, during & after trading',
    ],
    bestFor: 'Best for venues where customer presentation matters every service',
    cta: 'Get a Venue Cleaning Quote',
    image: '/images/washroom-cleaning.webp',
    imageAlt: 'Cleaning a customer washroom sink and surfaces',
  },
]

function ServiceBlock({ service, index }) {
  const dark = index % 2 === 1
  const [hovered, setHovered] = useState(false)
  const card = useSpring({
    transform: hovered ? 'translateY(-6px)' : 'translateY(0px)',
    boxShadow: hovered ? '0 28px 56px -20px rgba(5,16,31,0.35)' : '0 10px 28px -14px rgba(5,16,31,0.12)',
    config: { tension: 280, friction: 18 },
  })
  const [btnStyle, btnBind] = useHoverSpring(1.04)

  return (
    <animated.article
      style={card}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`rounded-3xl border p-8 lg:p-10 ${
        dark ? 'border-white/10 bg-navy-950' : 'border-navy-100 bg-white'
      }`}
    >
      <span className={`text-5xl font-extrabold tracking-tight ${dark ? 'text-teal-400/25' : 'text-navy-100'}`}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="mt-5 grid gap-8 lg:grid-cols-[0.85fr_1fr_0.85fr] lg:gap-10">
        <div className={`overflow-hidden rounded-2xl ${dark ? 'order-1' : 'order-1 lg:order-3'}`}>
          <img
            src={service.image}
            alt={service.imageAlt}
            loading="lazy"
            className="aspect-[4/3] h-full w-full object-cover"
          />
        </div>

        <div className="order-2">
          <h3 className={`text-2xl font-extrabold tracking-tight ${dark ? 'text-white' : 'text-navy-950'}`}>
            {service.title}
          </h3>
          <p className={`mt-3 text-base leading-relaxed ${dark ? 'text-navy-200' : 'text-navy-500'}`}>
            {service.text}
          </p>
          <AnimatedLink
            to="/contact#contact-form"
            style={btnStyle}
            {...btnBind}
            className={`mt-6 inline-flex items-center rounded-full px-6 py-3 text-sm font-bold transition-colors ${
              dark ? 'bg-teal-500 text-navy-950 hover:bg-teal-400' : 'bg-navy-950 text-white hover:bg-navy-800'
            }`}
          >
            {service.cta}
          </AnimatedLink>
        </div>

        <div className={dark ? 'order-3' : 'order-3 lg:order-1'}>
          <ul className="space-y-3">
            {service.bullets.map((b) => (
              <li
                key={b}
                className={`flex items-start gap-3 text-sm font-semibold ${dark ? 'text-navy-100' : 'text-navy-700'}`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                    dark ? 'bg-teal-500/15 text-teal-300' : 'bg-teal-500/10 text-teal-600'
                  }`}
                >
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
          <p
            className={`mt-5 rounded-xl border px-4 py-3 text-xs font-bold leading-relaxed ${
              dark ? 'border-white/10 bg-white/5 text-teal-300' : 'border-navy-100 bg-navy-50 text-navy-600'
            }`}
          >
            {service.bestFor}
          </p>
        </div>
      </div>
    </animated.article>
  )
}

export default function Services() {
  const [primaryStyle, primaryBind] = useHoverSpring(1.05)
  const [ghostStyle, ghostBind] = useHoverSpring(1.05)

  return (
    <>
      <PageHero
        eyebrow="Manchester & the North West"
        title="Hospitality cleaning services built around your business"
        sub="From commercial kitchen deep cleans to daily front-of-house routines — flexible, reliable cleaning scheduled around your hours, not ours."
      >
        <AnimatedLink
          to="/contact#contact-form"
          style={primaryStyle}
          {...primaryBind}
          className="inline-flex items-center rounded-full bg-teal-500 px-7 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-teal-400"
        >
          Get a Free Quote
        </AnimatedLink>
        <animated.a
          href="tel:01613990482"
          style={ghostStyle}
          {...ghostBind}
          className="inline-flex items-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-bold text-white transition-colors hover:border-teal-300 hover:text-teal-300"
        >
          0161 399 0482
        </animated.a>
      </PageHero>

      <section className="bg-navy-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-teal-600">What we offer</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
              Four specialist cleaning services
            </h2>
            <p className="mt-4 text-base leading-relaxed text-navy-500">
              Each service is designed around how hospitality venues actually operate — before service, after close,
              or when a full reset is needed.
            </p>
          </Reveal>

          <div className="mt-12 space-y-6">
            {SERVICES.map((s, i) => (
              <Reveal key={s.title} delay={80}>
                <ServiceBlock service={s} index={i} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Process heading="From enquiry to sparkling clean" />
      <CtaBand />
    </>
  )
}
