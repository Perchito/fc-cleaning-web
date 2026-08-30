import { useSpring, animated } from '@react-spring/web'

// Short, snappy springs — entrance settles fast even on low-end phones
const ENTER = { tension: 210, friction: 26 }

export default function PageHero({ eyebrow, title, sub, children }) {
  const badge = useSpring({
    from: { opacity: 0, transform: 'translateY(16px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: ENTER,
  })
  const head = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 90,
    config: ENTER,
  })
  const subStyle = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 180,
    config: ENTER,
  })
  const actions = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 270,
    config: ENTER,
  })

  return (
    <section className="relative overflow-hidden bg-navy-950">
      <div className="hero-glow pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-32 lg:px-8 lg:pb-24 lg:pt-40">
        <animated.span
          style={badge}
          className="inline-flex items-center rounded-full border border-teal-400/40 bg-teal-400/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-[0.2em] text-teal-300"
        >
          {eyebrow}
        </animated.span>
        <animated.h1
          style={head}
          className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl"
        >
          {title}
        </animated.h1>
        <animated.p style={subStyle} className="mt-5 max-w-2xl text-lg leading-relaxed text-navy-200">
          {sub}
        </animated.p>
        {children ? (
          <animated.div style={actions} className="mt-8 flex flex-wrap items-center gap-4">
            {children}
          </animated.div>
        ) : null}
      </div>
    </section>
  )
}
