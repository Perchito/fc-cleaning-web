import { Link } from 'react-router-dom'
import { useSpring, animated } from '@react-spring/web'
import useHoverSpring from '../hooks/useHoverSpring.js'

const AnimatedLink = animated(Link)

const CHIPS = ['Flexible scheduling', 'Fully insured', 'Owner-managed', 'Free first quote']

// Short, snappy springs — the whole entrance settles in ~0.7s even on low-end phones
const ENTER = { tension: 210, friction: 26 }

export default function Hero() {
  const badge = useSpring({
    from: { opacity: 0, transform: 'translateY(16px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: ENTER,
  })
  const block = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 90,
    config: ENTER,
  })
  const actions = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 180,
    config: ENTER,
  })
  const visual = useSpring({
    from: { opacity: 0, transform: 'scale(0.97)' },
    to: { opacity: 1, transform: 'scale(1)' },
    delay: 150,
    config: ENTER,
  })
  const floatCard = useSpring({
    from: { opacity: 0, transform: 'translateY(14px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 380,
    config: ENTER,
  })

  const [primaryStyle, primaryBind] = useHoverSpring(1.05)
  const [ghostStyle, ghostBind] = useHoverSpring(1.05)

  return (
    <section className="relative overflow-hidden bg-navy-950">
      <div className="hero-glow pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-32 lg:grid-cols-2 lg:px-8 lg:pb-32 lg:pt-40">
        <div>
          <animated.span
            style={badge}
            className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-400/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-[0.2em] text-teal-300"
          >
            Manchester's Hospitality Cleaning Specialists
          </animated.span>

          <animated.div style={block}>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Manchester's <span className="text-teal-400">Commercial Cleaning</span> Specialists
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Reliable, professional cleaning services that keep your business looking its best — every day.
            </p>
          </animated.div>

          <animated.div style={actions}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <AnimatedLink
                to="/contact#contact-form"
                style={primaryStyle}
                {...primaryBind}
                className="inline-flex items-center rounded-full bg-teal-500 px-7 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-teal-400"
              >
                Get a Free Quote
              </AnimatedLink>
              <AnimatedLink
                to="/services"
                style={ghostStyle}
                {...ghostBind}
                className="inline-flex items-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-bold text-white transition-colors hover:border-teal-300 hover:text-teal-300"
              >
                Our Services
              </AnimatedLink>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {CHIPS.map((chip) => (
                <li key={chip} className="flex items-center gap-2 text-sm font-semibold text-navy-100">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/15 text-xs text-teal-300">
                    ✓
                  </span>
                  {chip}
                </li>
              ))}
            </ul>
          </animated.div>
        </div>

        <animated.div style={visual} className="relative mb-8 lg:mb-0">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-navy-800 via-navy-900 to-teal-600/30 shadow-2xl shadow-navy-950/60">
            <p className="absolute inset-0 flex items-center justify-center p-10 text-center text-sm font-semibold leading-relaxed text-navy-300">
              Clean, bright commercial interior
            </p>
            <img
              src="/images/office-cleaning-hero.jpg"
              alt="Clean, bright commercial kitchen and restaurant interior"
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              fetchpriority="high"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>

          <animated.div
            style={floatCard}
            className="absolute -bottom-6 left-6 rounded-2xl border border-white/10 bg-navy-900/90 px-5 py-4 shadow-xl backdrop-blur"
          >
            <p className="text-2xl font-extrabold text-teal-400">24h</p>
            <p className="text-xs font-semibold text-navy-200">Typical quote turnaround</p>
          </animated.div>
        </animated.div>
      </div>
    </section>
  )
}
