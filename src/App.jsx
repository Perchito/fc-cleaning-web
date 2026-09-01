import { Routes, Route, useLocation } from 'react-router-dom'
import { useTransition, animated } from '@react-spring/web'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import WhatsAppFloat from './components/WhatsAppFloat.jsx'
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Services from './pages/Services.jsx'
import Faq from './pages/Faq.jsx'
import Contact from './pages/Contact.jsx'
import ThankYou from './pages/ThankYou.jsx'
import Privacy from './pages/Privacy.jsx'
import Terms from './pages/Terms.jsx'

// Fast crossfade + slight rise between pages. Outgoing page is lifted out of the
// layout (absolute) so both pages never stack in flow during the swap.
function AnimatedRoutes() {
  const location = useLocation()
  const transitions = useTransition(location, {
    keys: (loc) => loc.pathname,
    initial: null,
    from: { opacity: 0, transform: 'translateY(12px)' },
    enter: { opacity: 1, transform: 'translateY(0px)' },
    leave: { opacity: 0, transform: 'translateY(-8px)', position: 'absolute', top: 0, left: 0, right: 0 },
    config: { tension: 300, friction: 30 },
  })

  return transitions((style, loc) => (
    <animated.div style={style}>
      <Routes location={loc}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/services" element={<Services />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </animated.div>
  ))
}

export default function App() {
  return (
    <div className="min-h-screen bg-white font-sans text-navy-900 antialiased">
      <ScrollToTop />
      <Header />
      <main className="relative">
        <AnimatedRoutes />
      </main>
      <Footer />
      <WhatsAppFloat />
    </div>
  )
}
