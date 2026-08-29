import { useSpring, animated } from '@react-spring/web'
import Reveal from '../components/Reveal.jsx'
import useInViewOnce from '../hooks/useInViewOnce.js'

const STATS = [
  { value: 10, suffix: '+', label: 'Years of hospitality cleaning experience' },
  { value: 100, suffix: '%', label: 'Owner-managed — direct contact always' },
  { value: 5, suffix: '★', label: 'Consistent client satisfaction rating' },
  { value: 24, suffix: 'h', label: 'Typical quote turnaround time' },
]

const BENEFITS = [
  {
    title: 'Scheduled around your operation',
    text: 'Early mornings, late evenings, weekends — we clean when it suits your business, not when it suits us.',
  },
  {
    title: 'Owner-managed, always',
    text: 'You deal directly with the owner. No call centres, no handoffs — clear, consistent communication every single time.',
  },
  {
    title: 'Fully insured & accountable',
    text: 'Manchester-based, fully insured and proud of our reliability. We show up, every time, to exactly the standard you expect.',
  },
  {
    title: 'Tailored, not templated',
    text: "Every quote and routine is built around your specific venue — no one-size-fits-all packages that don't actually fit.",
  },
]

function Stat({ value, suffix, label, inView, delay }) {
  const { number } = useSpring({
    from: { number: 0 },
    to: { number: inView ? value : 0 },
    delay,
    config: { tension: 55, friction: 14 },
  })

  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-6 shadow-sm">
      <p className="text-4xl font-extrabold tracking-tight text-navy-950">
        <animated.span>{number.to((n) => Math.round(n).toString())}</animated.span>
        <span className="text-teal-500">{suffix}</span>
      </p>
      <p className="mt-2 text-sm font-semibold leading-snug text-navy-500">{label}</p>
    </div>
  )
}

export default function WhyFC() {
  const [statsRef, statsInView] = useInViewOnce()

  return (
    <section className="bg-navy-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
          <Reveal>
            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-teal-600">Why businesses choose FC</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
              A cleaning partner you can actually rely on
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="text-base leading-relaxed text-navy-500">
              From restaurants and pubs to bars and commercial kitchens across Manchester and the North West.
            </p>
            <a
              href="/contact"
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-teal-600 transition-colors hover:text-teal-500"
            >
              Get a free quote <span aria-hidden="true">→</span>
            </a>
          </Reveal>
        </div>

        <div ref={statsRef} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Stat key={s.label} {...s} inView={statsInView} delay={i * 120} />
          ))}
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 100} className="h-full">
              <div className="flex h-full flex-col rounded-2xl bg-navy-950 p-6 text-white shadow-lg shadow-navy-950/20">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/15 text-sm font-extrabold text-teal-300">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-4 text-lg font-extrabold tracking-tight">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-200">{b.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
