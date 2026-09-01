import PageHero from '../components/PageHero.jsx'
import Reveal from '../components/Reveal.jsx'
import { LegalSection, LegalList, LegalTOC } from '../components/LegalContent.jsx'

const LAST_UPDATED = '1 September 2026'

const SECTIONS = [
  { id: 'about', title: 'About us' },
  { id: 'quotes', title: 'Quotes & pricing' },
  { id: 'booking', title: 'Booking & access' },
  { id: 'cancellations', title: 'Cancellations & rescheduling' },
  { id: 'ongoing', title: 'Ongoing contracts' },
  { id: 'payment', title: 'Payment terms' },
  { id: 'standard', title: 'Standard of work & complaints' },
  { id: 'insurance', title: 'Insurance & liability' },
  { id: 'client-responsibilities', title: 'Your responsibilities' },
  { id: 'health-safety', title: 'Health, safety & products' },
  { id: 'force-majeure', title: 'Events beyond our control' },
  { id: 'law', title: 'Governing law' },
  { id: 'changes', title: 'Changes to these terms' },
  { id: 'contact', title: 'Contact us' },
]

export default function Terms() {
  return (
    <>
      <PageHero
        compact
        eyebrow="Legal"
        title="Terms & Conditions"
        sub={`The terms that apply when you get a quote from, or book cleaning services with, FC Cleaning Company Ltd. Last updated ${LAST_UPDATED}.`}
      />

      <section className="bg-navy-50 py-16 lg:py-24">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <Reveal>
            <div className="rounded-3xl border border-navy-100 bg-white p-7 lg:p-10">
              <p className="text-sm leading-relaxed text-navy-600">
                These terms apply whenever FC Cleaning Company Ltd ("we", "us", "our") provides a quote or carries
                out cleaning services for you ("you", "your", "the client"). By asking us for a quote, confirming a
                booking, or accepting our services, you agree to these terms. If anything here doesn't match what we
                agreed in writing for your specific job, our written agreement takes priority.
              </p>

              <div className="mt-6">
                <LegalTOC items={SECTIONS} />
              </div>

              <LegalSection id="about" title="1. About us">
                <p>
                  FC Cleaning Company Ltd is an owner-managed commercial cleaning company based in Manchester,
                  providing kitchen, restaurant, pub, bar and washroom cleaning services across Manchester and the
                  North West.
                </p>
              </LegalSection>

              <LegalSection id="quotes" title="2. Quotes & pricing">
                <p>
                  Quotes are free and given without obligation. Where possible, we base a quote on the information
                  you provide about your venue; for a routine or larger contract we may also carry out a site visit
                  before confirming a final price. Prices are confirmed in writing (by email, text or WhatsApp)
                  before any work begins, and are only valid for the scope of work described.
                </p>
                <p>
                  If the condition of a venue, the scope of work, or access on the day differs materially from what
                  was described when the quote was given, we'll let you know and agree any change in price with you
                  before continuing.
                </p>
              </LegalSection>

              <LegalSection id="booking" title="3. Booking & access">
                <p>
                  Once you confirm a booking, we'll agree a schedule that works around your trading hours — early
                  mornings, evenings, weekends or during closed periods. You're responsible for making sure we have
                  safe, lawful access to the venue at the agreed time (keys, entry codes, alarm codes or a
                  contact who can let us in), and that any relevant utilities (water, electricity) are available.
                </p>
                <p>
                  If we can't gain access at the agreed time through no fault of ours, the visit may still be
                  chargeable — see Section 4.
                </p>
              </LegalSection>

              <LegalSection id="cancellations" title="4. Cancellations & rescheduling">
                <p>
                  We ask for at least 24 hours' notice to cancel or reschedule a booked visit. Cancellations, access
                  failures, or reschedule requests with less than 24 hours' notice may be charged at our discretion,
                  up to the full price of that visit, to cover the time reserved for you.
                </p>
                <p>We'll always try to be flexible where something genuinely unexpected comes up — just get in touch as early as you can.</p>
              </LegalSection>

              <LegalSection id="ongoing" title="5. Ongoing contracts">
                <p>
                  We don't require long-term tie-in contracts. Regular cleaning arrangements run on a rolling basis,
                  and either party may end the arrangement by giving at least 14 days' written notice (email or
                  WhatsApp is fine). Any outstanding invoices remain payable regardless of who ends the arrangement.
                </p>
              </LegalSection>

              <LegalSection id="payment" title="6. Payment terms">
                <p>
                  Unless otherwise agreed in writing, invoices are issued after each clean or on a monthly basis for
                  regular contracts, and are due within 14 days of the invoice date. Late payments may incur
                  statutory interest under the Late Payment of Commercial Debts (Interest) Act 1998.
                </p>
              </LegalSection>

              <LegalSection id="standard" title="7. Standard of work & complaints">
                <p>
                  We aim to get every clean right first time. If you're not satisfied with any part of a visit,
                  please tell us within 48 hours so we can put it right — usually with a free re-clean of the area
                  in question. Because you deal directly with the owner, complaints are handled personally and
                  quickly, without call centres or account managers.
                </p>
              </LegalSection>

              <LegalSection id="insurance" title="8. Insurance & liability">
                <p>
                  FC Cleaning Company Ltd carries public liability insurance covering our cleaning work. If our team
                  accidentally damages something at your venue, please report it within 48 hours of the visit so we
                  can investigate and put things right, either through repair, replacement or a claim on our
                  insurance, as appropriate.
                </p>
                <p>
                  We are not liable for pre-existing damage, general wear and tear, or issues arising from faulty
                  equipment, fixtures or fittings that were not caused by our work. Our liability for any claim is
                  limited to the value of the cleaning service provided, except where liability cannot be limited or
                  excluded by law (such as for death or personal injury caused by our negligence).
                </p>
              </LegalSection>

              <LegalSection id="client-responsibilities" title="9. Your responsibilities">
                <LegalList
                  items={[
                    'Securing or removing valuables and sensitive items ahead of a visit',
                    'Telling us about any hazards, allergies, or areas that need special care before we start',
                    'Providing accurate information about your venue when requesting a quote',
                    'Making sure any equipment or products you ask us to use are safe and fit for purpose',
                  ]}
                />
              </LegalSection>

              <LegalSection id="health-safety" title="10. Health, safety & products">
                <p>
                  Our team uses professional-grade cleaning products and equipment, maintained to a professional
                  standard and used in line with COSHH (Control of Substances Hazardous to Health) guidance. In
                  food preparation areas, we use food-safe chemicals appropriate for hospitality environments.
                </p>
              </LegalSection>

              <LegalSection id="force-majeure" title="11. Events beyond our control">
                <p>
                  We won't be liable for any delay or failure to carry out a clean caused by circumstances beyond
                  our reasonable control — for example, extreme weather, road closures, power or water outages, or
                  other events outside our control. We'll let you know as soon as possible and agree a new time.
                </p>
              </LegalSection>

              <LegalSection id="law" title="12. Governing law">
                <p>
                  These terms are governed by the laws of England and Wales, and any disputes will be subject to the
                  exclusive jurisdiction of the courts of England and Wales.
                </p>
              </LegalSection>

              <LegalSection id="changes" title="13. Changes to these terms">
                <p>
                  We may update these terms from time to time; the date at the top of this page shows when they were
                  last revised. For an active booking or contract, we'll always confirm any change that affects you
                  directly before it applies.
                </p>
              </LegalSection>

              <LegalSection id="contact" title="14. Contact us">
                <p>Questions about these terms? Get in touch:</p>
                <p className="font-bold text-navy-900">
                  FC Cleaning Company Ltd
                  <br />
                  <a href="mailto:fernando.c@fccleaningcompany.com" className="text-teal-600 hover:text-teal-500">
                    fernando.c@fccleaningcompany.com
                  </a>
                  <br />
                  <a href="tel:01613990482" className="text-teal-600 hover:text-teal-500">
                    0161 399 0482
                  </a>
                  <br />
                  Manchester, United Kingdom
                </p>
              </LegalSection>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
