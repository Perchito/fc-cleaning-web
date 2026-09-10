import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, post, patch, toast } from "../api.js";
import { PageHead } from "../App.jsx";
import { Button, Badge, Card, Loading, Field, Input, Select, TextArea } from "../ui.jsx";

const BLANK = {
  name: "",
  description: "",
  status: "draft",
  dailyCap: 25,
  abMinSends: 8,
  windowStart: "08:00",
  windowEnd: "16:00",
  steps: [blankStep(0)],
};
function blankStep(i) {
  return {
    kind: "email",
    mode: "template",
    waitDays: i === 0 ? 0 : 5,
    subjectTmpl: "Cleaning for {{business}}",
    bodyTmpl: "Hi {{firstName|there}},\n\n\n",
    aiGuidance: "",
    abEnabled: false,
    subjectTmplB: "",
    bodyTmplB: "",
  };
}

const TOKENS = [
  "firstName",
  "business",
  "hook",
  "location",
  "contactName",
  "senderFirstName",
  "phone",
  "website",
];

export default function CampaignEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(id ? null : BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) api(`/campaigns?id=${id}`).then((r) => setC(r.campaign)).catch((e) => toast(e.message, "error"));
  }, [id]);

  if (!c) return <Loading />;

  const set = (patchObj) => setC((x) => ({ ...x, ...patchObj }));
  const setStep = (i, p) =>
    setC((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) }));
  const addStep = () => setC((x) => ({ ...x, steps: [...x.steps, blankStep(x.steps.length)] }));
  const rmStep = (i) => setC((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }));
  const moveStep = (i, dir) =>
    setC((x) => {
      const s = [...x.steps];
      const j = i + dir;
      if (j < 0 || j >= s.length) return x;
      [s[i], s[j]] = [s[j], s[i]];
      return { ...x, steps: s };
    });

  async function save() {
    if (!c.name.trim()) return toast("Give it a name", "error");
    setSaving(true);
    const payload = {
      name: c.name,
      description: c.description,
      status: c.status,
      dailyCap: Number(c.dailyCap),
      abMinSends: Number(c.abMinSends),
      windowStart: String(c.windowStart).slice(0, 5),
      windowEnd: String(c.windowEnd).slice(0, 5),
      steps: c.steps,
    };
    try {
      if (id) {
        await patch(`/campaigns?id=${id}`, payload);
        toast("Saved", "success");
      } else {
        const r = await post("/campaigns", payload);
        toast("Created", "success");
        nav(`/campaigns/${r.campaign.id}`, { replace: true });
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead title={id ? "Edit campaign" : "New campaign"}>
        <Button variant="ghost" size="sm" onClick={() => nav("/campaigns")}>
          Back
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </PageHead>

      <div className="space-y-4 p-5">
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name">
              <Input value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. NQ restaurants — Q4" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Input
                value={c.description || ""}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="who this targets / the angle"
              />
            </Field>
          </div>
          <Field label="Status">
            <Select value={c.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="draft">Draft (won't queue)</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Daily cap" hint="max emails/day from this campaign">
            <Input
              type="number"
              value={c.dailyCap}
              onChange={(e) => set({ dailyCap: Number(e.target.value) })}
            />
          </Field>
          <Field label="Send window start">
            <Input type="time" value={String(c.windowStart).slice(0, 5)} onChange={(e) => set({ windowStart: e.target.value })} />
          </Field>
          <Field label="Send window end">
            <Input type="time" value={String(c.windowEnd).slice(0, 5)} onChange={(e) => set({ windowEnd: e.target.value })} />
          </Field>
          <Field label="A/B min sends per variant" hint="before a winner is locked in">
            <Input type="number" value={c.abMinSends} onChange={(e) => set({ abMinSends: Number(e.target.value) })} />
          </Field>
        </Card>

        {c.steps.map((s, i) => (
          <StepCard
            key={i}
            i={i}
            step={s}
            last={i === c.steps.length - 1}
            onChange={(p) => setStep(i, p)}
            onRemove={() => rmStep(i)}
            onMove={(d) => moveStep(i, d)}
          />
        ))}

        <Button variant="outline" size="sm" onClick={addStep}>
          + Add step
        </Button>
      </div>
    </>
  );
}

function StepCard({ i, step, last, onChange, onRemove, onMove }) {
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  async function runPreview() {
    setPreviewing(true);
    try {
      const r = await post("/preview", { subjectTmpl: step.subjectTmpl, bodyTmpl: step.bodyTmpl });
      setPreview(r);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="blue">Step {i + 1}</Badge>
        {i === 0 ? (
          <span className="text-xs text-navy-400">sent when a prospect is enrolled</span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-navy-500">
            wait
            <input
              type="number"
              value={step.waitDays}
              onChange={(e) => onChange({ waitDays: Number(e.target.value) })}
              className="w-14 rounded border border-navy-200 px-1.5 py-0.5 text-center"
            />
            days after the previous step
          </span>
        )}
        <span className="grow" />
        {i > 0 && (
          <button className="text-navy-400 hover:text-navy-700" onClick={() => onMove(-1)}>
            ↑
          </button>
        )}
        {!last && (
          <button className="text-navy-400 hover:text-navy-700" onClick={() => onMove(1)}>
            ↓
          </button>
        )}
        {i > 0 && (
          <button className="text-rose-400 hover:text-rose-600" onClick={onRemove}>
            remove
          </button>
        )}
      </div>

      <div className="mb-3 flex gap-2">
        <TabBtn on={step.mode === "template"} onClick={() => onChange({ mode: "template" })}>
          Template
        </TabBtn>
        <TabBtn on={step.mode === "ai"} onClick={() => onChange({ mode: "ai" })}>
          AI-drafted per prospect
        </TabBtn>
      </div>

      {step.mode === "ai" ? (
        <Field label="Direction for the AI" hint="tone, what to emphasise, length. Uses the prospect's research + hook automatically.">
          <TextArea
            value={step.aiGuidance}
            onChange={(e) => onChange({ aiGuidance: e.target.value })}
            rows={4}
            placeholder="e.g. Lead with their extraction / kitchen deep-clean needs. Keep it under 100 words. Mention we work around service."
          />
        </Field>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1">
            {TOKENS.map((t) => (
              <button
                key={t}
                onClick={() => onChange({ bodyTmpl: step.bodyTmpl + `{{${t}}}` })}
                className="rounded bg-navy-100 px-1.5 py-0.5 font-mono text-[11px] text-navy-600 hover:bg-navy-200"
              >
                {`{{${t}}}`}
              </button>
            ))}
          </div>
          <Field label="Subject">
            <Input value={step.subjectTmpl} onChange={(e) => onChange({ subjectTmpl: e.target.value })} />
          </Field>
          <div className="mt-2">
            <Field label="Body" hint="A greeting and the sign-off/unsubscribe footer are added automatically.">
              <TextArea value={step.bodyTmpl} onChange={(e) => onChange({ bodyTmpl: e.target.value })} rows={8} />
            </Field>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={step.abEnabled}
              onChange={(e) => onChange({ abEnabled: e.target.checked })}
            />
            A/B test a second subject line
          </label>
          {step.abEnabled && (
            <div className="mt-2">
              <Field label="Variant B subject">
                <Input value={step.subjectTmplB} onChange={(e) => onChange({ subjectTmplB: e.target.value })} />
              </Field>
              <div className="mt-2">
                <Field label="Variant B body (optional — leave blank to reuse the body above)">
                  <TextArea value={step.bodyTmplB} onChange={(e) => onChange({ bodyTmplB: e.target.value })} rows={5} />
                </Field>
              </div>
            </div>
          )}

          <div className="mt-3">
            <Button size="sm" variant="subtle" onClick={runPreview} disabled={previewing}>
              {previewing ? "Rendering…" : "Preview against a real prospect"}
            </Button>
            {preview && (
              <div className="mt-2 rounded-lg border border-navy-200 bg-navy-50 p-3 text-sm">
                <div className="text-xs text-navy-400">
                  {preview.prospect.business}
                  {preview.unresolved.length > 0 && (
                    <span className="ml-2 text-amber-600">unresolved: {preview.unresolved.join(", ")}</span>
                  )}
                </div>
                <div className="mt-1 font-semibold">{preview.subject}</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-navy-700">{preview.body}</pre>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function TabBtn({ on, ...p }) {
  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
        on ? "bg-navy-900 text-white" : "bg-navy-100 text-navy-600 hover:bg-navy-200"
      }`}
      {...p}
    />
  );
}
