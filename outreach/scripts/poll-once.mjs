// One-off reply check from the command line: `npm run poll`
import { pollReplies } from "../lib/imap.mjs";
import { load, save } from "../lib/store.mjs";

const r = await pollReplies();
const db = load();
db.lastPollAt = r.ranAt;
save(db);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
