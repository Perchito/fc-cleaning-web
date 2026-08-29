import { animated } from '@react-spring/web'
import PageHero from '../components/PageHero.jsx'
import CtaBand from '../components/CtaBand.jsx'
import useHoverSpring from '../hooks/useHoverSpring.js'

export default function ThankYou() {
  const [primaryStyle, primaryBind] = useHoverSpring(1.05)
  const [ghostStyle, ghostBind] = useHoverSpring(1.05)

  return (
    <>
      <PageHero
        eyebrow="Message Received"
        title="Thank you for getting in touch!"
        sub="We've received your enquiry and will get back to you within 24 hours. For urgent matters call us directly on 0161 399 0482."
      >
        <animated.a
          href="/"
          style={primaryStyle}
          {...primaryBind}
          className="inline-flex items-center rounded-full bg-teal-500 px-7 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-teal-400"
        >
          Back to home
        </animated.a>
        <animated.a
          href="/services"
          style={ghostStyle}
          {...ghostBind}
          className="inline-flex items-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-bold text-white transition-colors hover:border-teal-300 hover:text-teal-300"
        >
          Explore services
        </animated.a>
      </PageHero>

      <CtaBand />
    </>
  )
}
