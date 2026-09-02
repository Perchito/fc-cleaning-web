import { useEffect, useRef, useState } from 'react'

export default function useInViewOnce(options) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      // threshold: 0 fires as soon as a single pixel is on-screen — unlike an area-based
      // threshold (e.g. 0.2), this stays correct no matter how tall the revealed content is.
      // A tall block (a legal page, a service card with a photo) can never get 20% of its
      // *area* on-screen on a normal viewport, so a >0 threshold silently never fires.
      options || { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, inView]
}
