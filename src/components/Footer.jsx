import { Link } from 'react-router-dom'

const SERVICES = [
  'Commercial Kitchen Cleaning',
  'Restaurant, Pub & Bar Cleaning',
  'Hospitality Deep Cleaning',
  'Washroom & Front-of-House',
]

const LINKS = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact Us', to: '/contact' },
]

const CHIPS = ['Fully Insured', 'Owner-managed', 'Flexible Hours']

export default function Footer() {
  return (
    <footer className="bg-navy-950 text-navy-100">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500 text-lg font-extrabold text-navy-950">
              FC
            </span>
            <span className="text-sm font-extrabold tracking-tight text-white">FC Cleaning Company Ltd</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-navy-300">
            Specialist restaurant, pub, bar and commercial kitchen cleaning across Manchester and the North West.
            Owner-managed and fully insured.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <span key={chip} className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-navy-200">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">Quick Links</h3>
          <ul className="mt-4 space-y-2.5">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-sm text-navy-200 transition-colors hover:text-teal-300">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">Our Services</h3>
          <ul className="mt-4 space-y-2.5">
            {SERVICES.map((s) => (
              <li key={s}>
                <Link to="/services" className="text-sm text-navy-200 transition-colors hover:text-teal-300">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">Get in Touch</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-navy-200">
            <li>
              <a href="tel:01613990482" className="font-bold text-white transition-colors hover:text-teal-300">
                0161 399 0482
              </a>
            </li>
            <li>
              <a href="mailto:fernando.c@fccleaningcompany.com" className="transition-colors hover:text-teal-300">
                fernando.c@fccleaningcompany.com
              </a>
            </li>
            <li>Manchester &amp; the North West</li>
            <li>Early mornings, evenings &amp; weekends</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-navy-400 sm:flex-row lg:px-8">
          <p>© 2026 FC Cleaning Company Ltd. All rights reserved.</p>
          <p className="flex gap-4">
            <Link to="/privacy" className="transition-colors hover:text-teal-300">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-teal-300">
              Terms &amp; Conditions
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
