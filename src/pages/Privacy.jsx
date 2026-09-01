import PageHero from '../components/PageHero.jsx'
import Reveal from '../components/Reveal.jsx'
import { LegalSection, LegalList, LegalTOC } from '../components/LegalContent.jsx'

const LAST_UPDATED = '1 September 2026'

const SECTIONS = [
  { id: 'who-we-are', title: 'Who we are' },
  { id: 'what-we-collect', title: 'What we collect' },
  { id: 'how-we-use-it', title: 'How we use it' },
  { id: 'sharing', title: 'Sharing your data' },
  { id: 'cookies', title: 'Cookies' },
  { id: 'retention', title: 'How long we keep it' },
  { id: 'your-rights', title: 'Your rights' },
  { id: 'security', title: 'Keeping your data secure' },
  { id: 'children', title: "Children's privacy" },
  { id: 'changes', title: 'Changes to this policy' },
  { id: 'contact', title: 'Contact us' },
]

export default function Privacy() {
  return (
    <>
      <PageHero
        compact
        eyebrow="Legal"
        title="Privacy Policy"
        sub={`How FC Cleaning Company Ltd collects, uses and protects your personal data. Last updated ${LAST_UPDATED}.`}
      />

      <section className="bg-navy-50 py-16 lg:py-24">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <Reveal>
            <div className="rounded-3xl border border-navy-100 bg-white p-7 lg:p-10">
              <p className="text-sm leading-relaxed text-navy-600">
                FC Cleaning Company Ltd ("we", "us", "our") is committed to protecting your privacy. This policy
                explains what personal data we collect when you contact us or use this website, why we collect it,
                and the rights you have over it under the UK General Data Protection Regulation (UK GDPR) and the
                Data Protection Act 2018.
              </p>

              <div className="mt-6">
                <LegalTOC items={SECTIONS} />
              </div>

              <LegalSection id="who-we-are" title="1. Who we are">
                <p>
                  FC Cleaning Company Ltd is the data controller for the personal data described in this policy. We
                  are an owner-managed commercial cleaning company based in Manchester, serving restaurants, pubs,
                  bars, cafés and commercial kitchens across Manchester and the North West.
                </p>
                <p>
                  If you have any questions about this policy or how we handle your data, contact us using the
                  details in <a href="#contact" className="font-bold text-teal-600 hover:text-teal-500">Section 11</a>.
                </p>
              </LegalSection>

              <LegalSection id="what-we-collect" title="2. What we collect">
                <p>We only collect the personal data you give us directly. This is typically limited to:</p>
                <LegalList
                  items={[
                    'Your name and business name',
                    'Your email address and phone number',
                    'The contents of any enquiry, message or quote request you send us',
                    'Details you share about your venue when arranging a quote or booking (e.g. venue type, size, location and cleaning schedule)',
                    'If you contact us by phone or WhatsApp, the number you contact us from and the content of that conversation',
                  ]}
                />
                <p>
                  We do not use cookies, tracking pixels or analytics scripts to monitor visitors on this website,
                  so we do not collect browsing data, device fingerprints or location data through the site itself.
                </p>
              </LegalSection>

              <LegalSection id="how-we-use-it" title="3. How we use it">
                <p>We use your personal data only to:</p>
                <LegalList
                  items={[
                    'Respond to your enquiry and provide a free, no-obligation quote',
                    'Arrange, schedule and carry out cleaning services you book with us',
                    'Communicate with you about an existing booking or contract',
                    'Meet our legal and accounting obligations (for example, invoicing and financial record-keeping)',
                  ]}
                />
                <p>
                  Our legal basis for processing enquiry details is our legitimate interest in responding to
                  prospective clients and taking steps, at your request, before entering into a contract. Where you
                  become a client, we process your data to perform that contract, and where required by law (such
                  as tax records) our legal obligation.
                </p>
                <p>We do not use your data for automated decision-making or profiling, and we do not send marketing emails or texts unless you separately ask us to.</p>
              </LegalSection>

              <LegalSection id="sharing" title="4. Sharing your data">
                <p>
                  We do not sell, rent or trade your personal data. We share it only with the trusted third parties
                  who help us run this website and respond to enquiries:
                </p>
                <LegalList
                  items={[
                    'Formspree — processes and delivers messages submitted through our contact form',
                    'WhatsApp (Meta) — if you choose to message us via the WhatsApp button on this site',
                    'Our email and phone providers — to receive and respond to your enquiry',
                    'Vercel — hosts this website',
                  ]}
                />
                <p>
                  Each of these providers has its own privacy policy governing how it handles data on our behalf. We
                  do not share your data with any other third party unless required by law.
                </p>
              </LegalSection>

              <LegalSection id="cookies" title="5. Cookies">
                <p>
                  This website does not use marketing, advertising or analytics cookies. Our contact form provider,
                  Formspree, may use a strictly necessary cookie to process your submission securely — this is not
                  used to track you across other websites. If that ever changes, we will update this policy.
                </p>
              </LegalSection>

              <LegalSection id="retention" title="6. How long we keep it">
                <p>
                  If your enquiry doesn't lead to a booking, we keep your details only for as long as needed to
                  respond and follow up, and delete them after a reasonable period of inactivity. If you become a
                  client, we retain contract and invoicing records for as long as required by UK tax law (currently
                  six years), after which they are securely deleted.
                </p>
              </LegalSection>

              <LegalSection id="your-rights" title="7. Your rights">
                <p>Under UK GDPR, you have the right to:</p>
                <LegalList
                  items={[
                    'Access the personal data we hold about you',
                    'Ask us to correct inaccurate or incomplete data',
                    'Ask us to delete your data, where we have no legal reason to keep it',
                    'Ask us to restrict or object to certain processing',
                    'Ask for your data in a portable format',
                    'Withdraw consent at any time, where processing is based on consent',
                  ]}
                />
                <p>
                  To exercise any of these rights, contact us using the details below. If you're unhappy with how we
                  handle your data, you also have the right to complain to the Information Commissioner's Office
                  (ICO) at{' '}
                  <a
                    href="https://ico.org.uk"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-teal-600 hover:text-teal-500"
                  >
                    ico.org.uk
                  </a>.
                </p>
              </LegalSection>

              <LegalSection id="security" title="8. Keeping your data secure">
                <p>
                  We take reasonable technical and organisational steps to protect the personal data you share with
                  us against loss, misuse or unauthorised access, including relying on reputable providers (Vercel,
                  Formspree) who maintain their own security standards.
                </p>
              </LegalSection>

              <LegalSection id="children" title="9. Children's privacy">
                <p>
                  Our services are aimed at businesses, not individuals, and this website is not directed at
                  children. We do not knowingly collect personal data from anyone under 18.
                </p>
              </LegalSection>

              <LegalSection id="changes" title="10. Changes to this policy">
                <p>
                  We may update this policy from time to time — for example, if we start using a new tool or
                  service. The date at the top of this page shows when it was last revised. Please check back
                  occasionally to stay informed.
                </p>
              </LegalSection>

              <LegalSection id="contact" title="11. Contact us">
                <p>For any question about this policy or your personal data, contact us at:</p>
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
