"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TimePicker } from "@/components/date-time-pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DesktopCard } from "./desktop-card";
import { Textarea } from "@/components/ui/textarea";
import {
  createCustomStage,
  rescoreOpenOffers,
  saveEmailSource,
  saveExcludedCompanies,
  saveProfileText,
  saveSettings,
  type ActionResult,
  type SettingsForm,
  type SettingsValues,
} from "./actions";
import { LearningPanel, type LearningData } from "./learning-panel";
import { SessionsPanel, type SessionView } from "./sessions-panel";

interface Props {
  initialTab?: string;
  timeZone: string;
  cv: string;
  preferences: string;
  validationErrors: string[];
  form: SettingsValues | null;
  excludedCompanies: string[];
  status: {
    worker: boolean;
    profile: { status: string; loadedAt: string | null; errors: string[] } | null;
    scoring: {
      llm: string;
      llmMessage: string | null;
      queued: number;
      budget: {
        scoring: { used: number; cap: number };
        drafts: { used: number; cap: number };
        research?: { used: number; cap: number };
      };
    } | null;
    telegram: { configured: boolean; howTo?: string[] } | null;
  };
  email: {
    exists: boolean;
    user: string;
    label: string;
    host: string;
    port: number;
    lookbackDays: number;
  };
  stages: { key: string; label: string; custom: boolean }[];
  sessions: SessionView[];
  learning: LearningData;
}

function useAction() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setErrors([]);
        toast.success(r.message ?? "Saved");
      } else {
        setErrors(r.errors ?? []);
        toast.error(r.error);
      }
    });
  return { pending, run, errors };
}

function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <Alert variant="destructive" data-testid="validation-errors">
      <AlertTriangle aria-hidden />
      <AlertTitle>Fix these fields</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  ...rest
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  type?: string;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} {...rest} />
    </div>
  );
}

function TimeField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-1">
      <Label asChild>
        <span>{label}</span>
      </Label>
      <TimePicker name={name} defaultValue={defaultValue} aria-label={label} />
    </div>
  );
}

function GeneralForm({ form, timeZone }: { form: SettingsValues; timeZone: string }) {
  const { pending, run, errors } = useAction();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as unknown as SettingsForm;
    run(() => saveSettings(fd));
  };
  return (
    <form onSubmit={submit} className="space-y-6" aria-label="General settings">
      <Errors errors={errors} />
      <Card>
        <CardHeader>
          <CardTitle>Rates and capacity</CardTitle>
          <CardDescription>Offers stating less than your minimum are capped at 30.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Minimum hourly rate (EUR)"
            name="minEUR"
            type="number"
            step="1"
            defaultValue={form.minEUR}
          />
          <Field
            label="Minimum hourly rate (USD)"
            name="minUSD"
            type="number"
            step="1"
            defaultValue={form.minUSD}
          />
          <Field
            label="Minimum hourly rate (GBP)"
            name="minGBP"
            type="number"
            step="1"
            defaultValue={form.minGBP}
          />
          <Field
            label="Minimum day rate (EUR)"
            name="minDailyEUR"
            type="number"
            step="1"
            defaultValue={form.minDailyEUR}
          />
          <Field
            label="Weekly capacity (hours)"
            name="capacity"
            type="number"
            min={1}
            max={80}
            defaultValue={form.capacity}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scoring</CardTitle>
          <CardDescription>
            Models run through your Claude Code login. Caps reset at midnight ({timeZone}).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Strong threshold"
            name="strong"
            type="number"
            min={1}
            max={100}
            defaultValue={form.strong}
          />
          <Field
            label="Possible threshold"
            name="possible"
            type="number"
            min={0}
            max={99}
            defaultValue={form.possible}
          />
          <div />
          <Field label="Scoring model" name="scoringModel" defaultValue={form.scoringModel} />
          <Field label="Drafting model" name="draftingModel" defaultValue={form.draftingModel} />
          <div />
          <Field
            label="Daily scoring cap"
            name="scoringCap"
            type="number"
            min={0}
            defaultValue={form.scoringCap}
          />
          <Field
            label="Daily draft cap"
            name="draftsCap"
            type="number"
            min={0}
            defaultValue={form.draftsCap}
          />
          <Field
            label="Daily company research cap"
            name="researchCap"
            type="number"
            min={0}
            max={100}
            defaultValue={form.researchCap}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Company research</CardTitle>
          <CardDescription>
            Claude searches the web and reads public pages about a company; every fact links to its
            source. It runs when you click Research company, when you shortlist an offer and, if
            enabled below, for strong offers. Profiles are reused for 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="autoResearch"
              defaultChecked={form.autoResearch}
              className="size-4 accent-foreground"
            />
            Research the company of every strong offer automatically
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <TimeField
            label="Quiet hours start"
            name="quietStart"
            defaultValue={String(form.quietStart)}
          />
          <TimeField label="Quiet hours end" name="quietEnd" defaultValue={String(form.quietEnd)} />
          <TimeField
            label="Daily digest time"
            name="digestTime"
            defaultValue={String(form.digestTime)}
          />
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="followUpDays">Follow-up reminders (days without news)</Label>
            <Input
              id="followUpDays"
              name="followUpDays"
              defaultValue={form.followUpDays}
              placeholder="7, 14"
              className="sm:w-60"
            />
            <p className="text-xs text-muted-foreground">
              Telegram reminds you to follow up when an application stays in Applied this many days
              with no update. Comma-separated, up to 5. Leave empty to turn off.
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

function ExcludedCompanies({ companies }: { companies: string[] }) {
  const [text, setText] = useState(companies.join("\n"));
  const { pending, run, errors } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hidden companies</CardTitle>
        <CardDescription>
          One company per line. Their offers are hidden from Offers and never scored. Matching
          ignores case and uses whole words, so &quot;Crossover&quot; also hides &quot;Crossover for
          Work&quot;. Remove a line to show that company again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Errors errors={errors} />
        <Label htmlFor="excluded-companies" className="sr-only">
          Hidden companies
        </Label>
        <Textarea
          id="excluded-companies"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Crossover\nRevature"}
        />
        <Button disabled={pending} onClick={() => run(() => saveExcludedCompanies(text))}>
          Save hidden companies
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfileFiles({ cv, preferences }: { cv: string; preferences: string }) {
  const [cvText, setCv] = useState(cv);
  const [prefsText, setPrefs] = useState(preferences);
  const { pending, run, errors } = useAction();
  return (
    <div className="space-y-4">
      <Errors errors={errors} />
      <Card>
        <CardHeader>
          <CardTitle>preferences.yaml</CardTitle>
          <CardDescription>
            Validated before saving; an invalid file is never written.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={prefsText}
            onChange={(e) => setPrefs(e.target.value)}
            className="h-96 font-mono text-xs"
            spellCheck={false}
            aria-label="preferences.yaml"
          />
          <Button
            disabled={pending}
            onClick={() => run(() => saveProfileText({ preferences: prefsText }))}
          >
            Save preferences
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>CV (Markdown)</CardTitle>
          <CardDescription>Drafts only use facts from this CV.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={cvText}
            onChange={(e) => setCv(e.target.value)}
            className="h-96 font-mono text-xs"
            aria-label="CV"
          />
          <Button disabled={pending} onClick={() => run(() => saveProfileText({ cv: cvText }))}>
            Save CV
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EmailForm({ email }: { email: Props["email"] }) {
  const { pending, run } = useAction();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    run(() =>
      saveEmailSource({
        user: f["user"] ?? "",
        label: f["label"] ?? "",
        host: f["host"] ?? "",
        port: f["port"] ?? "993",
        lookbackDays: f["lookbackDays"] ?? "3",
      }),
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job-alert emails</CardTitle>
        <CardDescription>
          Read-only access to one mailbox label. For Gmail: create a label (e.g.{" "}
          <code>job-alerts</code>), a filter that labels alerts from LinkedIn, Upwork, Malt and
          Wellfound, and an app password saved to <code>secrets/imap_app_password</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" aria-label="Mailbox settings">
          <Field label="Mailbox address" name="user" defaultValue={email.user} />
          <Field label="Label" name="label" defaultValue={email.label} />
          <Field label="IMAP host" name="host" defaultValue={email.host} />
          <Field label="Port" name="port" type="number" defaultValue={email.port} />
          <Field
            label="Look back (days)"
            name="lookbackDays"
            type="number"
            min={1}
            max={30}
            defaultValue={email.lookbackDays}
          />
          <div className="flex items-end">
            <Button type="submit" disabled={pending || !email.exists}>
              Save mailbox
            </Button>
          </div>
        </form>
        <p className="mt-3 text-sm text-muted-foreground">
          Enable sources and set their intervals on the{" "}
          <Link href="/sources" className="underline">
            Sources
          </Link>{" "}
          page. ATS companies are listed in <code>data/profile/companies.yaml</code>.
        </p>
      </CardContent>
    </Card>
  );
}

function StagesForm({ stages }: { stages: Props["stages"] }) {
  const [label, setLabel] = useState("");
  const [after, setAfter] = useState("final_interview");
  const { pending, run } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Application stages</CardTitle>
        <CardDescription>Add your own stages to the pipeline board.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="flex flex-wrap gap-2 text-sm">
          {stages.map((s) => (
            <li key={s.key} className="rounded-md border px-2 py-0.5">
              {s.label}
              {s.custom ? " (custom)" : ""}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Reference check"
            className="w-56"
            aria-label="New stage name"
          />
          <Select value={after} onValueChange={setAfter}>
            <SelectTrigger className="w-56" aria-label="Insert after">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  after {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={pending} onClick={() => run(() => createCustomStage(label, after))}>
            Add stage
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPanel({
  status,
  validationErrors,
}: {
  status: Props["status"];
  validationErrors: string[];
}) {
  const { pending, run } = useAction();
  const p = status.profile;
  const s = status.scoring;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {validationErrors.length ? (
            <Errors errors={validationErrors} />
          ) : (
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-strong" aria-hidden /> Files are valid
            </p>
          )}
          <p className="text-muted-foreground" data-testid="profile-loaded">
            {p?.loadedAt
              ? `Loaded by the worker ${new Date(p.loadedAt).toLocaleString("en-GB")}`
              : status.worker
                ? `Worker status: ${p?.status}`
                : "Worker not running"}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !status.worker}
            onClick={() => run(rescoreOpenOffers)}
          >
            <RefreshCw aria-hidden /> Rescore open offers
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Claude</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {s ? (
            <>
              <p>
                Status:{" "}
                <strong>
                  {s.llm === "ok"
                    ? "working"
                    : s.llm === "unknown"
                      ? "not used yet"
                      : s.llm.replace("_", " ")}
                </strong>
              </p>
              {s.llmMessage ? <p className="text-destructive">{s.llmMessage}</p> : null}
              <p className="text-muted-foreground">
                Today: {s.budget.scoring.used}/{s.budget.scoring.cap} scoring,{" "}
                {s.budget.drafts.used}/{s.budget.drafts.cap} drafts
                {s.budget.research
                  ? `, ${s.budget.research.used}/${s.budget.research.cap} company research`
                  : ""}{" "}
                · {s.queued} queued
              </p>
              {s.llm === "not_authenticated" ? (
                <p>
                  Run <code>claude</code> and log in (native), or <code>claude setup-token</code>{" "}
                  and save the token to <code>secrets/claude_oauth_token</code> (Docker).
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">Worker not running.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {status.telegram?.configured ? (
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-strong" aria-hidden /> Connected
            </p>
          ) : (
            <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
              {(status.telegram?.howTo ?? ["Start the worker to see setup steps."]).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsTabs(props: Props) {
  return (
    <Tabs defaultValue={props.initialTab ?? "general"}>
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="learning">Learning</TabsTrigger>
        <TabsTrigger value="profile">Profile files</TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
        <TabsTrigger value="sessions">Sessions</TabsTrigger>
        <TabsTrigger value="stages">Stages</TabsTrigger>
        <TabsTrigger value="status">Status</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="space-y-6">
        <DesktopCard />
        {props.form ? (
          <div className="space-y-6">
            <ExcludedCompanies companies={props.excludedCompanies} />
            <GeneralForm form={props.form} timeZone={props.timeZone} />
          </div>
        ) : (
          <Errors
            errors={
              props.validationErrors.length ? props.validationErrors : ["Profile files are missing"]
            }
          />
        )}
      </TabsContent>
      <TabsContent value="learning">
        <LearningPanel data={props.learning} />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileFiles cv={props.cv} preferences={props.preferences} />
      </TabsContent>
      <TabsContent value="sources">
        <EmailForm email={props.email} />
      </TabsContent>
      <TabsContent value="sessions">
        <SessionsPanel sessions={props.sessions} />
      </TabsContent>
      <TabsContent value="stages">
        <StagesForm stages={props.stages} />
      </TabsContent>
      <TabsContent value="status">
        <StatusPanel status={props.status} validationErrors={props.validationErrors} />
      </TabsContent>
    </Tabs>
  );
}
