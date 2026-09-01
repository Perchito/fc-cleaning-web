// Email drafting. The dashboard shows the draft and the user edits/confirms
// before anything sends — these are starting points, not final copy.

import { config } from "./config.mjs";

function footer() {
  return [
    ``,
    `Best,`,
    `${config.senderFirstName} C.`,
    `FC Cleaning Company Ltd`,
    `${config.from.address} | reply to ${config.replyTo} | ${config.phone}`,
    `${config.website} | ${config.postalAddress}`,
    ``,
    `Sent to you as a local business owner. Reply "unsubscribe" and I won't contact you again.`,
  ].join("\n");
}

// Optional per-prospect specifics used in follow-ups. Safe generic fallback
// if a prospect isn't listed.
const HOOKS = {
  "bay-horse-tavern": "the kitchen, cellar and bar-floor cleaning at the Bay Horse Tavern",
  bundobust: "kitchen deep cleans and extraction cleaning for the Piccadilly site",
  "ancoats-coffee-co": "an early-morning café clean plus periodic deep cleans at the roastery",
  cotton: "early-morning cleans before service and deeper work on the bakery side",
  "half-dozen-other": "a before-open clean of the room and regular kitchen degreasing",
};

export function draftFollowUp(p, round = 1) {
  const hook = HOOKS[p.id] || `commercial cleaning for ${p.business}`;
  const greeting = p.contactName ? `Hi ${p.contactName.split(" ")[0]},` : `Hi,`;

  const subject =
    round >= 2
      ? `Following up — cleaning for ${p.business}`
      : `Re: cleaning for ${p.business}`;

  const body =
    round >= 2
      ? [
          greeting,
          ``,
          `I don't want to keep landing in your inbox, so this is the last time I'll follow up.`,
          ``,
          `If ${hook} is something you'd want a price on at any point, just reply and I'll turn a free written quote around within 24 hours. Otherwise I'll leave it with you.`,
          footer(),
        ]
      : [
          greeting,
          ``,
          `Just floating this back up in case it got buried — I wrote last week about ${hook}.`,
          ``,
          `No pressure at all. If it's worth a quick look round, I can send a free written quote within 24 hours. If the timing's wrong, let me know and I'll check back later in the year.`,
          footer(),
        ];

  return { subject, text: body.join("\n") };
}

export function draftInitial(p) {
  const hook = HOOKS[p.id] || `commercial cleaning for ${p.business}`;
  const greeting = p.contactName ? `Hi ${p.contactName.split(" ")[0]},` : `Hi,`;
  const body = [
    greeting,
    ``,
    `I'm ${config.senderFirstName} from FC Cleaning Company — owner-managed commercial cleaning for restaurants, pubs and cafés across Manchester and the North West.`,
    ``,
    `I'm reaching out about ${hook}. We work around service with early-morning or post-close slots, we're fully insured, and every job is checked by me personally.`,
    ``,
    `If it's useful I can send a free written quote within 24 hours — would a quick look round work in the next week or two?`,
    footer(),
  ];
  return { subject: `Cleaning for ${p.business}`, text: body.join("\n") };
}
