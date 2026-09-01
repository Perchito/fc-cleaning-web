// Shared prose styling for the Privacy Policy and Terms & Conditions pages —
// keeps long-form legal text in the same navy/teal design language as the rest of the site.

export function LegalSection({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-navy-100 py-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-extrabold tracking-tight text-navy-950">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-navy-600">{children}</div>
    </section>
  )
}

export function LegalList({ items }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function LegalTOC({ items }) {
  return (
    <nav aria-label="Page sections" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="rounded-full border border-navy-200 bg-white px-3.5 py-1.5 text-xs font-bold text-navy-600 transition-colors hover:border-teal-500 hover:text-teal-600"
        >
          {item.title}
        </a>
      ))}
    </nav>
  )
}
