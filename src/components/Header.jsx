import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSpring, animated } from '@react-spring/web'
import useHoverSpring from '../hooks/useHoverSpring.js'

const NAV = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact Us', to: '/contact' },
]

function QuoteButton({ className = '' }) {
  const [style, bind] = useHoverSpring(1.05)
  return (
    <animated.a
      href="/contact"
      style={style}
      {...bind}
      className={`inline-flex items-center justify-center rounded-full bg-teal-500 px-5 py-2.5 text-sm font-bold text-navy-950 transition-colors hover:bg-teal-400 ${className}`}
    >
      Get a Free Quote
    </animated.a>
  )
}

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const menu = useSpring({
    opacity: open ? 1 : 0,
    transform: open ? 'translateY(0px)' : 'translateY(-12px)',
    // clamp prevents the spring bouncing past its target, which let the page
    // behind the menu flash back into view for a moment on mobile
    config: { tension: 260, friction: 20, clamp: true },
  })

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open ? 'bg-navy-950/95 shadow-xl shadow-navy-950/30 backdrop-blur' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link to="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500 text-lg font-extrabold text-navy-950">
            FC
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold tracking-tight text-white">FC Cleaning Company Ltd</span>
            <span className="block text-xs font-medium text-teal-300">Commercial Cleaning Manchester</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm font-semibold text-navy-100/80 transition-colors hover:text-teal-300"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <a href="tel:01613990482" className="text-sm font-bold text-white transition-colors hover:text-teal-300">
            0161 399 0482
          </a>
          <QuoteButton />
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white lg:hidden"
        >
          <div className="space-y-1.5">
            <span className={`block h-0.5 w-5 bg-current transition-transform ${open ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-transform ${open ? '-translate-y-2 -rotate-45' : ''}`} />
          </div>
        </button>
      </div>

      <animated.div style={menu} className={`lg:hidden ${open ? '' : 'pointer-events-none'}`}>
        {/* solid bg (no backdrop-blur) — mobile browsers drop backdrop-filter during the fade animation, causing a flash */}
        <nav className="space-y-1 border-t border-white/10 bg-navy-950 px-5 pb-6 pt-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-base font-semibold text-navy-100 hover:bg-white/5 hover:text-teal-300"
            >
              {item.label}
            </Link>
          ))}
          <div className="flex items-center gap-4 px-3 pt-4">
            <a href="tel:01613990482" className="text-sm font-bold text-white">
              0161 399 0482
            </a>
            <QuoteButton />
          </div>
        </nav>
      </animated.div>
    </header>
  )
}