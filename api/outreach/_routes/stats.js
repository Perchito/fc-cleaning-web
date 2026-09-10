// Analytics: overall + per-campaign funnel, reply rates, per-step and
// per-variant breakdowns, and a 14-day activity series.

import { sql } from "../_lib/db.js";
import { aiEnabled, aiBackend, aiSpendToday } from "../_lib/ai.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  const [{ pj }] = await sql`select count(*)::int as pj from ai_jobs where status in ('pending','running')`;
  const ai = { enabled: aiEnabled(), backend: aiBackend(), pendingJobs: pj, ...(await aiSpendToday()) };

  const [overall] = await sql`
    select
      (select count(*) from prospects)                                   as prospects,
      (select count(*) from prospects where status = 'draft')            as draft,
      (select count(*) from sends where status = 'sent')                 as sent,
      (select count(distinct prospect_id) from sends where status='sent') as contacted,
      (select count(*) from events where type = 'reply')                 as replies,
      (select count(*) from events where type = 'reply'
         and intent in ('interested','meeting'))                         as positive,
      (select count(*) from events where type = 'bounce')                as bounces,
      (select count(*) from prospects where status = 'won')              as won,
      (select count(*) from suppression)                                 as suppressed`;

  const campaigns = await sql`
    select
      c.id, c.name, c.status,
      count(distinct e.id)                                       as enrolled,
      count(distinct e.id) filter (where e.status='active')      as active,
      count(distinct s.id) filter (where s.status='sent')        as sent,
      count(distinct s.prospect_id) filter (where s.status='sent') as contacted,
      count(distinct ev.id) filter (where ev.type='reply')       as replies,
      count(distinct ev.id) filter (where ev.type='reply'
        and ev.intent in ('interested','meeting'))               as positive,
      count(distinct ev.id) filter (where ev.type='bounce')      as bounces
    from campaigns c
    left join enrollments e on e.campaign_id = c.id
    left join sends s       on s.campaign_id = c.id
    left join events ev     on ev.campaign_id = c.id
    group by c.id, c.name, c.status
    order by c.created_at desc`;

  // per-step: sends at each step, and replies whose prospect's most recent
  // prior send was at that step
  const steps = await sql`
    with sent as (
      select s.campaign_id, s.step_index, s.prospect_id, s.sent_at,
             row_number() over (partition by s.prospect_id order by s.sent_at desc) as rn
      from sends s where s.status='sent'
    )
    select
      s.campaign_id, s.step_index,
      count(*)                                                  as sent,
      count(*) filter (where exists (
        select 1 from events ev
        where ev.prospect_id = s.prospect_id and ev.type='reply' and ev.at >= s.sent_at
      ) and s.rn = 1)                                           as replied
    from sent s
    group by s.campaign_id, s.step_index
    order by s.campaign_id, s.step_index`;

  const variants = await sql`
    select
      s.campaign_id, s.step_index, s.variant_key,
      count(*) filter (where s.status='sent') as sent,
      count(*) filter (where s.status='sent' and exists (
        select 1 from events ev where ev.prospect_id = s.prospect_id
        and ev.type='reply' and ev.at >= s.sent_at
      )) as replied
    from sends s
    where s.variant_key is not null
    group by s.campaign_id, s.step_index, s.variant_key
    order by s.campaign_id, s.step_index, s.variant_key`;

  const activity = await sql`
    select d::date as day,
      (select count(*) from sends where status='sent' and sent_at::date = d::date) as sent,
      (select count(*) from events where type='reply' and at::date = d::date)       as replies
    from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
    order by day`;

  const num = (x) => Number(x || 0);
  return res.json({
    ai,
    overall: {
      prospects: num(overall.prospects),
      draft: num(overall.draft),
      sent: num(overall.sent),
      contacted: num(overall.contacted),
      replies: num(overall.replies),
      positive: num(overall.positive),
      bounces: num(overall.bounces),
      won: num(overall.won),
      suppressed: num(overall.suppressed),
      replyRate: num(overall.sent) ? num(overall.replies) / num(overall.sent) : 0,
    },
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      enrolled: num(c.enrolled),
      active: num(c.active),
      sent: num(c.sent),
      contacted: num(c.contacted),
      replies: num(c.replies),
      positive: num(c.positive),
      bounces: num(c.bounces),
      replyRate: num(c.sent) ? num(c.replies) / num(c.sent) : 0,
    })),
    steps: steps.map((s) => ({
      campaignId: s.campaign_id,
      stepIndex: s.step_index,
      sent: num(s.sent),
      replied: num(s.replied),
    })),
    variants: variants.map((v) => ({
      campaignId: v.campaign_id,
      stepIndex: v.step_index,
      variantKey: v.variant_key,
      sent: num(v.sent),
      replied: num(v.replied),
    })),
    activity: activity.map((a) => ({ day: a.day, sent: num(a.sent), replies: num(a.replies) })),
  });
}
