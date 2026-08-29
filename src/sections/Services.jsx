import { useState } from 'react'
import { useSpring, animated } from '@react-spring/web'
import Reveal from '../components/Reveal.jsx'
import useHoverSpring from '../hooks/useHoverSpring.js'

const SERVICES = [
  {
    title: 'Commercial Kitchen Cleaning',
    text: 'Deep cleaning for kitchens, prep areas, floors, tiles and grease-prone surfaces. Scheduled around your service hours.',
  },
  {
    title: 'Restaurant, Pub & Bar Cleaning',
    text: 'Routine cleaning for dining rooms, bar areas, entrances and customer-facing spaces before or after service.',
  },
  {
    title: 'Hospitality Deep Cleaning',
    text: 'Full reset cleans before inspections, busy periods or reopening. One-off or repeat schedule.',
  },
  {
    title: 'Washroom & Front-of-House Cleaning',
    text: 'Customer toilets, entrances, dining spaces and high-traffic areas kept clean and presentable every service.',
  },
]

function ServiceCard({ service, index }) {
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
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-base font-extrabold text-teal-600">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="mt-5 text-xl font-extrabold tracking-tight text-navy-950">{service.title}</h3>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-navy-500">{service.text}</p>
      <a
        href="/services"
        className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-teal-600 transition-colors hover:text-teal-500"
      >
        Learn More <span aria-hidden="true">→</span>
      </a>
    </animated.article>
  )
}

export default function Services() {
  const [ctaStyle, ctaBind] = useHoverSpring(1.05)

  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Reveal>
            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-teal-600">What we offer</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
              Our Cleaning Services
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-navy-500">
              Four specialist services for restaurants, pubs, bars and commercial kitchens across Manchester.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <animated.a
              href="/services"
              style={ctaStyle}
              {...ctaBind}
              className="inline-flex items-center rounded-full bg-navy-950 px-6 py-3 text-sm font-bold text-white"
            >
              View all services &amp; get a quote
            </animated.a>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={i * 90} className="h-full">
              <ServiceCard service={s} index={i} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
