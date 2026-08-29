import { useState } from 'react'
import { useSpring } from '@react-spring/web'

export default function useHoverSpring(scale = 1.04) {
  const [hovered, setHovered] = useState(false)
  const style = useSpring({
    transform: hovered ? `scale(${scale})` : 'scale(1)',
    config: { tension: 320, friction: 16 },
  })
  const bind = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }
  return [style, bind]
}
