import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSpring, animated } from '@react-spring/web'
import PageHero from '../components/PageHero.jsx'
import Reveal from '../components/Reveal.jsx'
import CtaBand from '../components/CtaBand.jsx'

const STORY = [
  "FC Cleaning Company Ltd was founded to fill a gap in Manchester's hospitality cleaning market — professional, flexible commercial cleaning that actually works around your business, not the other way around.",
  'We work directly with restaurants, pubs, bars, cafés and commercial kitchens across Manchester and the North West. As an owner-managed company, you always deal directly with the owner — no call centres, no account managers, no excuses.',
  'Every clean is carried out by experienced staff using professional-grade equipment and appropriate cleaning products. We are fully insured and proud of our track record for reliability.',
]

const FEATURES = [
  {
    title: 'Flexible scheduling',
    text: 'Early mornings, late evenings, weekends — we clean when your venue is closed so we never disrupt service.',
  },
  {
    title: 'Direct owner contact',
    text: 'You always speak to the owner. Direct communication means faster responses and consistent standards.',
  },
  {
    title: 'Fully insured',
    text: 'Full public liability insurance on every job. You can book with complete confidence.',
  },
]

const AREAS = [
  {
    tag: 'Core area',
    title: 'Manchester City Centre',
    text: 'All areas including the Northern Quarter, Deansgate, Spinningfields and MediaCityUK.',
  },
  {
    tag: 'Full coverage',
    title: 'Greater Manchester',
    text: 'Salford, Trafford, Bolton, Oldham, Stockport, Wigan and surrounding boroughs.',
  },
  {
    tag: 'On request',
    title: 'North West',
    text: 'We also cover venues across Cheshire, Lancashire and the wider North West on request.',
  },
]

function AreaCard({ area }) {
  const [hovered, setHovered] = useState(false)
  const style = useSpring({
    transform: hovered ? 'translateY(-6px)' : 'translateY(0px)',
    boxShadow: hovered ? '0 24px 48px -16px rgba(5,16,31,0.25)' : '0 8px 24px -12px rgba(5,16,31,0.10)',
    config: { tension: 280, friction: 18 },
  })

  return (
    <animated.article
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex h-full flex-col rounded-2xl border border-navy-100 bg-white p-7"
    >
      <span className="inline-flex w-fit rounded-full bg-teal-500/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-teal-600">
        {area.tag}
      </span>
      <h3 className="mt-4 text-xl font-extrabold tracking-tight text-navy-950">{area.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-navy-500">{area.text}</p>
    </animated.article>
  )
}

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="Our Story"
        title="About FC Cleaning Company Ltd"
        sub="Owner-managed, fully insured hospitality cleaning specialists based in Manchester."
      />

      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <Reveal>
            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-teal-600">Who we are</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl">
              Built on reliability, run by the owner
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-navy-500">
              {STORY.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <Link
              to="/contact#contact-form"
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-teal-600 transition-colors hover:text-teal-500"
            >
              Get a free quote <span aria-hidden="true">→</span>
            </Link>
          </Reveal>

          <div className="space-y-5">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 120}>
                <div className="flex gap-5 rounded-2xl bg-navy-950 p-6 text-white shadow-lg shadow-navy-950/20">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-sm font-extrabold text-teal-300">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold tracking-tight">{f.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-navy-200">{f.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-teal-600">Coverage</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl">Where we operate</h2>
            <p className="mt-4 text-base leading-relaxed text-navy-500">
              We cover Manchester city centre and surrounding areas across the North West.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {AREAS.map((area, i) => (
              <Reveal key={area.title} delay={i * 100} className="h-full">
                <AreaCard area={area} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
