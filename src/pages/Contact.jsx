import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { animated } from '@react-spring/web'
import PageHero from '../components/PageHero.jsx'
import Reveal from '../components/Reveal.jsx'
import CtaBand from '../components/CtaBand.jsx'
import useHoverSpring from '../hooks/useHoverSpring.js'

// 1. Create a free form at https://formspree.io
// 2. Replace YOUR_FORM_ID below with your form ID — done, enquiries land in your inbox
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID'

const SERVICES = [
  'Commercial Kitchen Cleaning',
  'Restaurant, Pub & Bar Cleaning',
  'Hospitality Deep Cleaning',
  'Washroom & Front-of-House Cleaning',
  'Not sure yet',
]

const EXPECTATIONS = [
  'We reply to all enquiries within 24 hours',
  'Free, no-obligation quote tailored to your venue',
  'You speak directly to the owner — always',
  'Fully insured on every job',
]

const inputClass =
  'w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm font-medium text-navy-900 placeholder:text-navy-300 outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-navy-900">
        {label}
        {required ? <span className="text-teal-500"> *</span> : null}
      </span>
      {children}
    </label>
  )
}

export default function Contact() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', business: '', email: '', phone: '', service: '', message: '' })
  const [status, setStatus] = useState('idle')
  const [submitStyle, submitBind] = useHoverSpring(1.03)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        navigate('/thank-you')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Get in Touch"
        title="Get a free cleaning quote"
        sub="Tell us about your venue and we'll put together a tailored proposal within 24 hours. No obligation, no call centres."
      />

      <section className="bg-navy-50 py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 lg:grid-cols-5 lg:px-8">
          <Reveal className="lg:col-span-3">
            <form onSubmit={onSubmit} className="rounded-3xl border border-navy-100 bg-white p-7 shadow-sm lg:p-10">
              <h2 className="text-2xl font-extrabold tracking-tight text-navy-950">Send us a message</h2>

              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <Field label="Your name" required>
                  <input required value={form.name} onChange={update('name')} className={inputClass} placeholder="e.g. Alex Smith" autoComplete="name" />
                </Field>
                <Field label="Business name">
                  <input value={form.business} onChange={update('business')} className={inputClass} placeholder="e.g. The Northern Quarter Bistro" autoComplete="organization" />
                </Field>
                <Field label="Email address" required>
                  <input required type="email" value={form.email} onChange={update('email')} className={inputClass} placeholder="you@business.co.uk" autoComplete="email" />
                </Field>
                <Field label="Phone number">
                  <input type="tel" value={form.phone} onChange={update('phone')} className={inputClass} placeholder="07123 456789" autoComplete="tel" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Service required">
                    <select value={form.service} onChange={update('service')} className={inputClass}>
                      <option value="">Select a service…</option>
                      {SERVICES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Tell us about your venue" required>
                    <textarea
                      required
                      rows={5}
                      value={form.message}
                      onChange={update('message')}
                      className={inputClass}
                      placeholder="Venue type, size, location and the schedule you have in mind…"
                    />
                  </Field>
                </div>
              </div>

              {status === 'error' ? (
                <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  Something went wrong — please call us on 0161 399 0482 or email fernando.c@fccleaningcompany.com.
                </p>
              ) : null}

              <animated.button
                type="submit"
                disabled={status === 'sending'}
                style={submitStyle}
                {...submitBind}
                className="mt-7 inline-flex items-center justify-center rounded-full bg-teal-500 px-8 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'sending' ? 'Sending…' : 'Send my enquiry'}
              </animated.button>
              <p className="mt-4 text-xs font-semibold text-navy-400">
                We reply within 24 hours • Your data is never shared •{' '}
                <Link to="/privacy" className="text-teal-600 transition-colors hover:text-teal-500">
                  Privacy Policy
                </Link>
              </p>
            </form>
          </Reveal>

          <div className="space-y-6 lg:col-span-2">
            <Reveal delay={120}>
              <div className="rounded-3xl bg-navy-950 p-7 text-white lg:p-8">
                <h2 className="text-lg font-extrabold tracking-tight">Other ways to reach us</h2>
                <ul className="mt-6 space-y-5">
                  <li>
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">Phone</p>
                    <a href="tel:01613990482" className="mt-1 block text-base font-bold text-white transition-colors hover:text-teal-300">
                      0161 399 0482
                    </a>
                    <p className="text-xs text-navy-300">Mon–Sun, early mornings to late evenings</p>
                  </li>
                  <li>
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">Email</p>
                    <a
                      href="mailto:fernando.c@fccleaningcompany.com"
                      className="mt-1 block break-all text-base font-bold text-white transition-colors hover:text-teal-300"
                    >
                      fernando.c@fccleaningcompany.com
                    </a>
                  </li>
                  <li>
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">WhatsApp</p>
                    <a
                      href="https://wa.me/447473379928"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-2 text-base font-bold text-white transition-colors hover:text-teal-300"
                    >
                      Message us on WhatsApp <span aria-hidden="true">→</span>
                    </a>
                  </li>
                  <li>
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">Service area</p>
                    <p className="mt-1 text-base font-bold text-white">Manchester &amp; the North West</p>
                  </li>
                </ul>
              </div>
            </Reveal>

            <Reveal delay={220}>
              <div className="rounded-3xl border border-navy-100 bg-white p-7 lg:p-8">
                <h2 className="text-lg font-extrabold tracking-tight text-navy-950">What to expect</h2>
                <ul className="mt-5 space-y-3">
                  {EXPECTATIONS.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm font-semibold text-navy-700">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-xs text-teal-600">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
