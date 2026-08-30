import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSpring, animated } from '@react-spring/web'
import PageHero from '../components/PageHero.jsx'
import Reveal from '../components/Reveal.jsx'
import CtaBand from '../components/CtaBand.jsx'
import useHoverSpring from '../hooks/useHoverSpring.js'

const AnimatedLink = animated(Link)

const CATEGORIES = ['All questions', 'Services', 'Coverage & Hours', 'Pricing & Contracts', 'Trust & Quality']

const GROUP_ORDER = ['Services', 'Coverage & Hours', 'Pricing & Contracts', 'Trust & Quality']

const FAQS = [
  {
    category: 'Services',
    q: 'What types of venue do you clean?',
    a: "We specialise in hospitality venues — restaurants, pubs, bars, cafés, bistros, takeaways, dark kitchens and commercial kitchen facilities. We don't do domestic cleaning.",
  },
  {
    category: 'Services',
    q: 'Do you offer one-off deep cleans as well as regular contracts?',
    a: 'Yes. We offer both. One-off deep cleans are ideal before inspections, refurbishments or busy periods. We also offer regular weekly and daily cleaning contracts. All options are tailored to your venue.',
  },
  {
    category: 'Services',
    q: 'What cleaning products and equipment do you use?',
    a: 'We use professional-grade commercial cleaning products appropriate for hospitality environments including food-safe chemicals for kitchen areas. All equipment is maintained to a professional standard.',
  },
  {
    category: 'Services',
    q: 'How do I get started?',
    a: "Simply fill in our contact form or call 0161 399 0482. Tell us about your venue and we'll get back to you within 24 hours with a tailored proposal.",
  },
  {
    category: 'Coverage & Hours',
    q: 'What areas do you cover?',
    a: 'We cover Manchester city centre and all of Greater Manchester including Salford, Trafford, Bolton, Stockport, Oldham and Wigan. We also serve venues across Cheshire, Lancashire and the wider North West — just get in touch to confirm your location.',
  },
  {
    category: 'Coverage & Hours',
    q: 'Do you clean outside normal business hours?',
    a: 'Yes. We specifically schedule cleaning for early mornings, late evenings and weekends so we can work around your service hours without any disruption.',
  },
  {
    category: 'Pricing & Contracts',
    q: 'How quickly can you give me a quote?',
    a: "We typically respond to all enquiries within 24 hours. For urgent requirements, call us directly on 0161 399 0482. Quotes are always free and there's no obligation.",
  },
  {
    category: 'Pricing & Contracts',
    q: 'Do I need to sign a long-term contract?',
    a: "No. We offer flexible arrangements. Some clients prefer a rolling monthly agreement; others book on a job-by-job basis. We'll agree the terms that work for your business.",
  },
  {
    category: 'Trust & Quality',
    q: 'Are you fully insured?',
    a: "Yes. FC Cleaning Company Ltd carries full public liability insurance on every job. You can book with complete confidence that you're covered.",
  },
  {
    category: 'Trust & Quality',
    q: 'Will I speak to the owner or a call centre?',
    a: "You'll always speak directly to the owner. There are no call centres, account managers or third parties. Direct communication is one of the things our clients appreciate most.",
  },
]

function AccordionItem({ item, open, onToggle }) {
  const icon = useSpring({
    transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
    config: { tension: 300, friction: 20 },
  })

  return (
    <div className="rounded-2xl border border-navy-100 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-base font-extrabold tracking-tight text-navy-950">{item.q}</span>
        <animated.span
          style={icon}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold transition-colors ${
            open ? 'bg-teal-500 text-navy-950' : 'bg-navy-50 text-navy-500'
          }`}
        >
          +
        </animated.span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm leading-relaxed text-navy-500">{item.a}</p>
        </div>
      </div>
    </div>
  )
}

function Sidebar() {
  const [msgStyle, msgBind] = useHoverSpring(1.04)
  const [telStyle, telBind] = useHoverSpring(1.04)

  return (
    <aside className="lg:sticky lg:top-28">
      <div className="rounded-3xl bg-navy-950 p-8 text-white shadow-xl shadow-navy-950/20">
        <h2 className="text-2xl font-extrabold tracking-tight">Still have a question?</h2>
        <p className="mt-3 text-sm leading-relaxed text-navy-200">Get in touch — we reply within 24 hours</p>
        <div className="mt-6 space-y-3">
          <AnimatedLink
            to="/contact"
            style={msgStyle}
            {...msgBind}
            className="flex items-center justify-center rounded-full bg-teal-500 px-6 py-3 text-sm font-bold text-navy-950 transition-colors hover:bg-teal-400"
          >
            Send us a message
          </AnimatedLink>
          <animated.a
            href="tel:01613990482"
            style={telStyle}
            {...telBind}
            className="flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition-colors hover:border-teal-300 hover:text-teal-300"
          >
            0161 399 0482
          </animated.a>
        </div>
      </div>
    </aside>
  )
}

export default function Faq() {
  const [active, setActive] = useState('All questions')
  const [openQ, setOpenQ] = useState(FAQS[0].q)

  const groups = active === 'All questions' ? GROUP_ORDER : [active]

  return (
    <>
      <PageHero
        eyebrow="Help Centre"
        title="Frequently Asked Questions"
        sub="Everything you need to know about our commercial cleaning services in Manchester and the North West."
      />

      <section className="bg-navy-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActive(cat)}
                  className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
                    active === cat
                      ? 'bg-navy-950 text-white'
                      : 'border border-navy-200 bg-white text-navy-600 hover:border-teal-500 hover:text-teal-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              {groups.map((group) => {
                const items = FAQS.filter((f) => f.category === group)
                if (items.length === 0) return null
                return (
                  <div key={group}>
                    <Reveal>
                      <h2 className="text-xs font-extrabold uppercase tracking-[0.25em] text-teal-600">{group}</h2>
                    </Reveal>
                    <div className="mt-4 space-y-3">
                      {items.map((item) => (
                        <AccordionItem
                          key={item.q}
                          item={item}
                          open={openQ === item.q}
                          onToggle={() => setOpenQ(openQ === item.q ? null : item.q)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <Reveal delay={150}>
              <Sidebar />
            </Reveal>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
