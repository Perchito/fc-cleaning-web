import { useSpring, animated } from '@react-spring/web'
import useInViewOnce from '../hooks/useInViewOnce.js'

export default function Reveal({ children, delay = 0, y = 24, className = '' }) {
  const [ref, inView] = useInViewOnce()
  const styles = useSpring({
    opacity: inView ? 1 : 0,
    transform: inView ? 'translateY(0px)' : `translateY(${y}px)`,
    delay,
    config: { tension: 170, friction: 22 },
  })

  return (
    <animated.div ref={ref} style={styles} className={className}>
      {children}
    </animated.div>
  )
}
