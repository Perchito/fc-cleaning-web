import Reveal from '../components/Reveal.jsx'

const CLIENTS = [
  'Brighton & Hove City Council',
  'NHS Manchester',
  'The Midland Manchester',
  'University of Manchester',
  'Bolton NHS Trust',
]

export default function TrustBar() {
  const row = [...CLIENTS, ...CLIENTS]

  return (
    <section className="border-b border-navy-100 bg-white py-10">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal>
          <p className="text-center text-xs font-extrabold uppercase tracking-[0.25em] text-navy-400">
            Trusted by businesses across Manchester &amp; the North West
          </p>
        </Reveal>
      </div>
      <div className="marquee mt-7" aria-hidden="true">
        <div className="marquee-track items-center gap-16 pr-16">
          {row.map((name, i) => (
            <span key={`${name}-${i}`} className="whitespace-nowrap text-lg font-extrabold tracking-tight text-navy-300">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
