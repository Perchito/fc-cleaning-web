import { Link } from 'react-router-dom'
import { useSpring, animated, config } from '@react-spring/web'
import useHoverSpring from '../hooks/useHoverSpring.js'

const AnimatedLink = animated(Link)

const CHIPS = ['Flexible scheduling', 'Fully insured', 'Owner-managed', 'Free first quote']

export default function Hero() {
  const badge = useSpring({
    from: { opacity: 0, transform: 'translateY(24px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 50,
    config: config.gentle,
  })
  const title = useSpring({
    from: { opacity: 0, transform: 'translateY(32px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 150,
    config: config.gentle,
  })
  const sub = useSpring({
    from: { opacity: 0, transform: 'translateY(32px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 280,
    config: config.gentle,
  })
  const actions = useSpring({
    from: { opacity: 0, transform: 'translateY(32px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 400,
    config: config.gentle,
  })
  const image = useSpring({
    from: { opacity: 0, transform: 'scale(0.96)' },
    to: { opacity: 1, transform: 'scale(1)' },
    delay: 300,
    config: config.gentle,
  })
  const floatCard = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 650,
    config: config.gentle,
  })

  const [primaryStyle, primaryBind] = useHoverSpring(1.05)
  const [ghostStyle, ghostBind] = useHoverSpring(1.05)

  return (
    <section className="relative overflow-hidden bg-navy-950">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-navy-700/40 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-32 lg:grid-cols-2 lg:px-8 lg:pb-32 lg:pt-40">
        <div>
          <animated.span
            style={badge}
            className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-400/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-[0.2em] text-teal-300"
          >
            Manchester's Hospitality Cleaning Specialists
          </animated.span>

          <animated.h1
            style={title}
            className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            Manchester's <span className="text-teal-400">Commercial Cleaning</span> Specialists
          </animated.h1>

          <animated.p style={sub} className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
            Reliable, professional cleaning services that keep your business looking its best — every day.
          </animated.p>

          <animated.div style={actions} className="mt-8 flex flex-wrap items-center gap-4">
            <AnimatedLink
              to="/contact"
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
          </animated.div>

          <animated.ul style={actions} className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {CHIPS.map((chip) => (
              <li key={chip} className="flex items-center gap-2 text-sm font-semibold text-navy-100">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/15 text-xs text-teal-300">
                  ✓
                </span>
                {chip}
              </li>
            ))}
          </animated.ul>
        </div>

        <animated.div style={image} className="relative mb-8 lg:mb-0">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-navy-800 via-navy-900 to-teal-600/30 shadow-2xl shadow-navy-950/60">
            <p className="absolute inset-0 flex items-center justify-center p-10 text-center text-sm font-semibold leading-relaxed text-navy-300">
              Clean, bright commercial kitchen and restaurant interior — drop your photo at public/images/hero.jpg
            </p>
            <img
              src="/images/hero.jpg"
              alt="Clean, bright commercial kitchen and restaurant interior"
              className="absolute inset-0 h-full w-full object-cover"
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
