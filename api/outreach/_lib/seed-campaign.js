// The "Legacy" campaign — the 3-touch cadence the tool used before campaigns
// existed, expressed with merge tokens. Used by migrate.js to seed one campaign
// and mark already-contacted prospects as completed enrollments so history and
// analytics read correctly.

const FOOTER = [
  "",
  "Best,",
  "{{senderFirstName}} C.",
  "{{senderTitle}}, FC Cleaning Company Ltd",
  "{{phone}} · {{website}}",
  "",
  'Sent to you as a local business owner. Reply "unsubscribe" and I won\'t contact you again.',
].join("\n");

export const LEGACY_CAMPAIGN = {
  name: "Legacy (pre-campaigns)",
  description:
    "The original 3-touch cadence: intro email, then two follow-ups five days apart. Kept so past outreach shows up in analytics.",
  status: "paused",
  steps: [
    {
      kind: "email",
      mode: "template",
      waitDays: 0,
      subjectTmpl: "Cleaning for {{business}}",
      bodyTmpl: [
        "Hi {{firstName|there}},",
        "",
        "I'm {{senderFirstName}} from FC Cleaning Company — owner-managed commercial cleaning for restaurants, pubs and cafés across Manchester and the North West.",
        "",
        "I'm reaching out about {{hook}}. We work around service with early-morning or post-close slots, we're fully insured, and every job is checked by me personally.",
        "",
        "If it's useful I can send a free written quote within 24 hours — would a quick look round work in the next week or two?",
        FOOTER,
      ].join("\n"),
    },
    {
      kind: "email",
      mode: "template",
      waitDays: 5,
      subjectTmpl: "Re: cleaning for {{business}}",
      bodyTmpl: [
        "Hi {{firstName|there}},",
        "",
        "Just floating this back up in case it got buried — I wrote last week about {{hook}}.",
        "",
        "No pressure at all. If it's worth a quick look round, I can send a free written quote within 24 hours. If the timing's wrong, let me know and I'll check back later in the year.",
        FOOTER,
      ].join("\n"),
    },
    {
      kind: "email",
      mode: "template",
      waitDays: 5,
      subjectTmpl: "Following up — cleaning for {{business}}",
      bodyTmpl: [
        "Hi {{firstName|there}},",
        "",
        "I don't want to keep landing in your inbox, so this is the last time I'll follow up.",
        "",
        "If {{hook}} is something you'd want a price on at any point, just reply and I'll turn a free written quote around within 24 hours. Otherwise I'll leave it with you.",
        FOOTER,
      ].join("\n"),
    },
  ],
};
