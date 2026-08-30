import { useState } from 'react'

// Transparent FC logo on dark surfaces. Falls back to the FC chip if the image is missing.
export default function Logo({ className = 'h-11 w-11' }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-xl bg-teal-500 text-lg font-extrabold text-navy-950 ${className}`}
      >
        FC
      </span>
    )
  }

  return (
    <img
      src="/images/fc-logo-white-icon.png"
      alt="FC Cleaning Company logo"
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
    />
  )
}
