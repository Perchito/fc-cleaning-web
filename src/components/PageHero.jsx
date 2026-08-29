import { useSpring, animated, config } from '@react-spring/web'

export default function PageHero({ eyebrow, title, sub }) {
  const badge = useSpring({
    from: { opacity: 0, transform: 'translateY(24px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 50,
    config: config.gentle,
  })
  const head = useSpring({
    from: { opacity: 0, transform: 'translateY(32px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 150,
    config: config.gentle,
  })
  const subStyle = useSpring({
    from: { opacity: 0, transform: 'translateY(32px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: 280,
    config: config.gentle,
  })

  return (
    <section className="relative overflow-hidden bg-navy-950">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-navy-700/40 blur-3xl" />

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
      </div>
    </section>
  )
}
