import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTransition, animated } from '@react-spring/web'
import useHoverSpring from '../hooks/useHoverSpring.js'
import Logo from './Logo.jsx'

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

  // Close the menu if the viewport grows to desktop width (e.g. rotating a tablet)
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Lock body scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Menu only exists in the DOM while open (or animating out) — no invisible overlay
  const menuTransition = useTransition(open, {
    from: { opacity: 0, transform: 'translateY(-12px)' },
    enter: { opacity: 1, transform: 'translateY(0px)' },
    leave: { opacity: 0, transform: 'translateY(-12px)' },
    config: { tension: 280, friction: 22 },
  })

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`transition-all duration-300 ${
          scrolled || open ? 'bg-navy-950/95 shadow-xl shadow-navy-950/30 backdrop-blur' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <Logo />
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight text-white">FC Cleaning Company Ltd</span>
              <span className="block text-xs font-medium text-teal-300">Commercial Cleaning Manchester</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
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
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white lg:hidden"
          >
            <div className="space-y-1.5">
              <span
                className={`block h-0.5 w-5 bg-current transition-transform duration-300 ${
                  open ? 'translate-y-2 rotate-45' : ''
                }`}
              />
              <span className={`block h-0.5 w-5 bg-current transition-opacity duration-300 ${open ? 'opacity-0' : ''}`} />
              <span
                className={`block h-0.5 w-5 bg-current transition-transform duration-300 ${
                  open ? '-translate-y-2 -rotate-45' : ''
                }`}
              />
            </div>
          </button>
        </div>
      </div>

      {menuTransition((style, isOpen) =>
        isOpen ? (
          <animated.div id="mobile-menu" style={style} className="lg:hidden">
            <nav
              aria-label="Mobile navigation"
              className="space-y-1 border-t border-white/10 bg-navy-950/95 px-5 pb-6 pt-3 shadow-xl shadow-navy-950/30 backdrop-blur"
            >
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
        ) : null,
      )}
    </header>
  )
}
