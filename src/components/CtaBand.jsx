import { Link } from 'react-router-dom'
import { animated } from '@react-spring/web'
import Reveal from './Reveal.jsx'
import useHoverSpring from '../hooks/useHoverSpring.js'

const AnimatedLink = animated(Link)

const CHIPS = ['Free quote, no obligation', 'Reply within 24 hours', 'Fully insured', 'Owner-managed']

export default function CtaBand() {
  const [primaryStyle, primaryBind] = useHoverSpring(1.05)
  const [ghostStyle, ghostBind] = useHoverSpring(1.05)

  return (
    <section id="quote" className="relative overflow-hidden bg-teal-500">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-teal-400/60" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-navy-950/10" />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-navy-900/70">Not sure where to start?</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
            Tell us about your venue — we'll handle the rest
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-navy-900/80">
            Whether you need a daily routine or a one-off deep clean, we'll put together a tailored proposal fast. No
            obligation, no call centres — just a straight answer from the owner.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <span key={chip} className="rounded-full bg-navy-950/10 px-3.5 py-1.5 text-xs font-bold text-navy-950">
                {chip}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <AnimatedLink
              to="/contact#contact-form"
              style={primaryStyle}
              {...primaryBind}
              className="inline-flex items-center rounded-full bg-navy-950 px-7 py-3.5 text-sm font-bold text-white"
            >
              Get a Free Quote
            </AnimatedLink>
            <animated.a
              href="tel:01613990482"
              style={ghostStyle}
              {...ghostBind}
              className="inline-flex items-center rounded-full border-2 border-navy-950/80 px-7 py-3.5 text-sm font-bold text-navy-950"
            >
              0161 399 0482
            </animated.a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
