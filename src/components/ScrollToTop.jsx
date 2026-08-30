import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      // Deep link (e.g. /contact#contact-form): jump straight to the element
      // once the new route has painted, instead of scrolling to the top.
      const id = hash.slice(1)
      const t = setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' })
      }, 80)
      return () => clearTimeout(t)
    }
    window.scrollTo(0, 0)
    return undefined
  }, [pathname, hash])

  return null
}
