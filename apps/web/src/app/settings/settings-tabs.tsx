"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  saveProfileText,
  type ActionResult,
} from "./actions";
import { CvVariantsCard, type CvVariantView } from "./cv-variants-card";
import { MailAccountsCard, type MailAccountView } from "./mail-accounts-card";
import { PreferencesPanel, type PreferencesPanelProps } from "./preferences-panel";
import { LearningPanel, type LearningData } from "./learning-panel";
import { SessionsPanel, type SessionView } from "./sessions-panel";

interface Props {
  initialTab?: string;
  cv: string;
  validationErrors: string[];
  preferencesPanel: PreferencesPanelProps;
  cvVariants: { variants: CvVariantView[]; errors: string[]; staleCount: number };
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
  mail: { accounts: MailAccountView[]; workerRunning: boolean; checkMinutes: number };
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

function ProfileFiles({ cv, cvVariants }: { cv: string; cvVariants: Props["cvVariants"] }) {
  const [cvText, setCv] = useState(cv);
  const { pending, run, errors } = useAction();
  return (
    <div className="space-y-4">
      <Errors errors={errors} />
      <Card>
        <CardHeader>
          <CardTitle>CV (Markdown)</CardTitle>
          <CardDescription>
            Drafts only use facts from this CV. Preferences are edited in the Preferences tab.
          </CardDescription>
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
      <CvVariantsCard {...cvVariants} />
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
    <Tabs defaultValue={props.initialTab ?? "preferences"}>
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="preferences">Preferences</TabsTrigger>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="learning">Learning</TabsTrigger>
        <TabsTrigger value="profile">Profile files</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
        <TabsTrigger value="sessions">Sessions</TabsTrigger>
        <TabsTrigger value="stages">Stages</TabsTrigger>
        <TabsTrigger value="status">Status</TabsTrigger>
      </TabsList>
      <TabsContent value="preferences">
        <PreferencesPanel {...props.preferencesPanel} />
      </TabsContent>
      <TabsContent value="general" className="space-y-6">
        <DesktopCard />
      </TabsContent>
      <TabsContent value="learning">
        <LearningPanel data={props.learning} />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileFiles cv={props.cv} cvVariants={props.cvVariants} />
      </TabsContent>
      <TabsContent value="email">
        <MailAccountsCard {...props.mail} />
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
