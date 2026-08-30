import { Link } from 'react-router-dom'
import { animated } from '@react-spring/web'
import Reveal from '../components/Reveal.jsx'
import useHoverSpring from '../hooks/useHoverSpring.js'

const AnimatedLink = animated(Link)

const STEPS = [
  {
    n: '01',
    title: 'Tell us about your venue',
    text: 'Drop us a message or call — share your business type, size and the cleaning schedule that works for you. Zero obligation, no pushy sales calls.',
  },
  {
    n: '02',
    title: 'We create your plan',
    text: 'We visit your venue in person, get a clear picture of what you need and put together a tailored cleaning proposal with transparent pricing.',
  },
  {
    n: '03',
    title: 'Cleaning starts on your terms',
    text: 'Consistent, reliable cleaning begins — on the schedule you agreed, with direct communication and a routine built entirely around your business.',
  },
]

export default function Process({ heading = 'How it works' }) {
  const [ctaStyle, ctaBind] = useHoverSpring(1.05)

  return (
    <section className="bg-navy-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-teal-400">Simple process</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">{heading}</h2>
          <p className="mt-4 text-base leading-relaxed text-navy-300">
            Three straightforward steps from your first message to a spotless venue — no hassle, no hidden extras.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 120} className="h-full">
              <div className="relative h-full rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur">
                <span className="text-5xl font-extrabold tracking-tight text-teal-400/25">{step.n}</span>
                <h3 className="mt-4 text-xl font-extrabold tracking-tight text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-navy-200">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mt-10 flex flex-wrap items-center gap-5">
          <AnimatedLink
            to="/contact"
            style={ctaStyle}
            {...ctaBind}
            className="inline-flex items-center rounded-full bg-teal-500 px-7 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-teal-400"
          >
            Start with a free quote
          </AnimatedLink>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-navy-200">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/15 text-xs text-teal-300">
              ✓
            </span>
            Fully insured &amp; owner-managed
          </span>
        </Reveal>
      </div>
    </section>
  )
}
