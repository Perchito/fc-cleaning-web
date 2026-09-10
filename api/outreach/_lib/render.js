// Merge-field rendering for campaign steps and templates.
//
//   {{firstName}}            -> "Sam"  (blank if unknown)
//   {{firstName|there}}      -> "Sam", or "there" when unknown
//
// validate(rendered) returns any {{...}} left unresolved (no fallback given).

import { config } from "./config.js";

// One-line personalisation hooks for the hand-picked prospects. AI-researched
// leads carry their own `hook`; everything else falls back to a generic phrase.
export const HOOKS = {
  "bay-horse-tavern": "the kitchen, cellar and bar-floor cleaning at the Bay Horse Tavern",
  bundobust: "kitchen deep cleans and extraction cleaning for the Piccadilly site",
  "ancoats-coffee-co": "an early-morning café clean plus periodic deep cleans at the roastery",
  cotton: "early-morning cleans before service and deeper work on the bakery side",
  "half-dozen-other": "a before-open clean of the room and regular kitchen degreasing",
  "the-pearl":
    "cleaning the kitchen, extraction and dining room at The Pearl around your Thursday–Sunday service",
  "scrumptious-tea-rooms": "a before-open clean of the tea room plus the kitchen and bakes side",
  "olio-didsbury": "kitchen deep cleans, extraction and front-of-house on Wilmslow Road",
  "eden-monton": "kitchen deep cleans, extraction canopies and the dining room at Eden",
  "backs-deli": "the deli counter, prep area, floors and shopfront on Heaton Moor Road",
};

export function hookFor(p) {
  return p.hook || HOOKS[p.id] || `commercial cleaning for ${p.business}`;
}

export function tokensFor(p) {
  const first = (p.contactName || "").trim().split(/\s+/)[0] || "";
  return {
    firstName: first,
    contactName: p.contactName || "",
    business: p.business || "",
    hook: hookFor(p),
    location: p.location || "",
    address: p.address || "",
    phone: config.phone,
    website: config.website,
    senderFirstName: config.senderFirstName,
    senderTitle: config.senderTitle,
  };
}

export function render(tmpl, p) {
  const t = tokensFor(p);
  return String(tmpl || "").replace(/\{\{\s*([a-zA-Z]+)\s*(?:\|([^}]*))?\}\}/g, (_, key, fb) => {
    const v = t[key];
    if (v != null && v !== "") return v;
    return fb != null ? fb.trim() : `{{${key}}}`;
  });
}

/** Unresolved tokens left after render() (i.e. no value and no fallback). */
export function validate(rendered) {
  const out = [];
  const re = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(rendered || "")))) out.push(m[1]);
  return [...new Set(out)];
}

// The compliance footer — always appended by us, never left to a template or
// the LLM, so the unsubscribe line and sender identity can't go missing.
export const FOOTER_TMPL = [
  "",
  "Best,",
  "{{senderFirstName}} C.",
  "{{senderTitle}}, FC Cleaning Company Ltd",
  "{{phone}} · {{website}}",
  "",
  'Sent to you as a local business owner. Reply "unsubscribe" and I won\'t contact you again.',
].join("\n");

export function renderedFooter(p) {
  return render(FOOTER_TMPL, p);
}

/** Body core (no sign-off) + the standard footer. Strips any footer the source
 *  already contains so we never double up. */
export function withFooter(bodyCore, p) {
  let core = String(bodyCore || "").trimEnd();
  const cut = core.search(/\n\s*Best,\s*\n/i);
  if (cut !== -1) core = core.slice(0, cut).trimEnd();
  return core + "\n" + renderedFooter(p);
}

export const MERGE_TOKENS = [
  "firstName",
  "contactName",
  "business",
  "hook",
  "location",
  "address",
  "phone",
  "website",
  "senderFirstName",
  "senderTitle",
];
