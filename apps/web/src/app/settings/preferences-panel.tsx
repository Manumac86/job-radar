"use client";

import type { PreferenceChange, PreferenceFieldError } from "@job-radar/core/profile";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { TimePicker } from "@/components/date-time-pickers";
import { TagInput } from "@/components/tag-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PreferenceValues } from "@/lib/profile";
import {
  rescoreOpenOffers,
  savePreferences,
  savePreferencesYaml,
  validatePreferencesYaml,
  type PreferencesSaveResult,
} from "./actions";

type View = "form" | "yaml";
type Path = (string | number)[];

const ENGAGEMENT_TYPES = [
  ["contract", "Contract"],
  ["part-time", "Part-time"],
  ["full-time", "Full-time"],
  ["full-time-remote", "Full-time remote"],
  ["freelance", "Freelance"],
] as const;
const STAGES = ["pre-seed", "seed", "series-a", "series-b", "series-c", "later", "public"];
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN"];
/** Lists and per-currency maps are saved as whole values; everything else per field. */
const WHOLE_VALUES = new Set(["rates.min_hourly", "rates.target_hourly"]);
/** Optional keys removed from the file when cleared. */
const OPTIONAL = new Set(["rates.target_hourly", "location.max_overlap_required"]);

const isPlain = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Changed fields between two form states, as edits for applyPreferenceChanges. */
export function diffPreferences(a: unknown, b: unknown, path: Path = []): PreferenceChange[] {
  const key = path.join(".");
  const empty = b === undefined || b === "" || (isPlain(b) && !Object.keys(b).length);
  if (OPTIONAL.has(key) && empty) return a === undefined ? [] : [{ path, delete: true }];
  if (path.length && (!isPlain(a) || !isPlain(b) || WHOLE_VALUES.has(key)))
    return same(a, b) ? [] : [{ path, value: b }];
  const ra = (a ?? {}) as Record<string, unknown>;
  const rb = (b ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(ra), ...Object.keys(rb)])].flatMap((k) =>
    diffPreferences(ra[k], rb[k], [...path, k]),
  );
}

function setIn<T>(obj: T, path: Path, value: unknown): T {
  const [head, ...rest] = path;
  if (head === undefined) return value as T;
  const current = (obj as Record<string, unknown> | undefined)?.[String(head)];
  const next = rest.length ? setIn(current, rest, value) : value;
  // Keep key order: put the key back where it was.
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [k, v] of Object.entries((obj ?? {}) as Record<string, unknown>)) {
    if (k === String(head)) {
      if (next !== undefined) out[k] = next;
      placed = true;
    } else out[k] = v;
  }
  if (!placed && next !== undefined) out[String(head)] = next;
  return out as T;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export interface PreferencesPanelProps {
  initialView: View;
  text: string;
  hash: string;
  values: PreferenceValues | null;
  errors: string[];
}

export function PreferencesPanel(props: PreferencesPanelProps) {
  const [view, setView] = useState<View>(props.values ? props.initialView : "yaml");
  const [saved, setSaved] = useState({ text: props.text, hash: props.hash, values: props.values });
  const [values, setValues] = useState(props.values);
  const [yaml, setYaml] = useState(props.text);
  const [errors, setErrors] = useState<string[]>(props.values ? [] : props.errors);
  const [fieldErrors, setFieldErrors] = useState<PreferenceFieldError[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<View | null>(null);
  const [pending, start] = useTransition();

  const changes = useMemo(
    () => (values && saved.values ? diffPreferences(saved.values, values) : []),
    [values, saved.values],
  );
  const dirty = view === "form" ? changes.length > 0 : yaml !== saved.text;

  const showView = (v: View) => {
    setView(v);
    setErrors([]);
    setFieldErrors([]);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "preferences");
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  };

  const afterSave = (r: PreferencesSaveResult, onDone?: () => void) => {
    if (!r.ok) {
      setErrors(r.errors ?? [r.error]);
      setFieldErrors(r.fieldErrors ?? []);
      toast.error(r.error);
      return;
    }
    setSaved({ text: r.text, hash: r.hash, values: r.values });
    setValues(r.values);
    setYaml(r.text);
    setErrors([]);
    setFieldErrors([]);
    if (r.rescoreSuggested) {
      toast.success(r.message, {
        description: "Existing offers keep their scores until rescored.",
        action: {
          label: "Rescore open offers",
          onClick: () =>
            void rescoreOpenOffers().then((x) =>
              x.ok ? toast.success(x.message) : toast.error(x.error),
            ),
        },
      });
    } else toast.success(r.message);
    onDone?.();
  };

  const save = (onDone?: () => void) =>
    start(async () => {
      const r =
        view === "form"
          ? await savePreferences({ changes, baseHash: saved.hash })
          : await savePreferencesYaml({ text: yaml, baseHash: saved.hash });
      afterSave(r, onDone);
    });

  const discard = () => {
    setValues(saved.values);
    setYaml(saved.text);
    setErrors([]);
    setFieldErrors([]);
  };

  const requestSwitch = (v: View) => {
    if (v === view) return;
    if (view === "yaml" && yaml !== saved.text) {
      start(async () => {
        const check = await validatePreferencesYaml(yaml);
        if (!check.ok) {
          setErrors(check.errors);
          toast.error("Fix the YAML before switching to the form");
          return;
        }
        setPendingSwitch(v);
      });
      return;
    }
    if (view === "yaml" && !saved.values) {
      setErrors(props.errors.length ? props.errors : ["Fix the YAML before using the form"]);
      return;
    }
    if (dirty) setPendingSwitch(v);
    else showView(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(v) => v && requestSwitch(v as View)}
          aria-label="Preferences view"
        >
          <ToggleGroupItem value="form" className="px-4">
            Form
          </ToggleGroupItem>
          <ToggleGroupItem value="yaml" className="px-4">
            YAML
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          Both views edit preferences.yaml. It is validated before saving; an invalid file is never
          written.
        </p>
      </div>

      {errors.length > 0 && (
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
      )}

      {view === "form" && values ? (
        <PreferencesForm values={values} setValues={setValues} fieldErrors={fieldErrors} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>preferences.yaml</CardTitle>
            <CardDescription>
              The whole file, including per-source settings (<code>sources:</code>) that the form
              does not show.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              className="h-[32rem] font-mono text-xs"
              spellCheck={false}
              aria-label="preferences.yaml"
            />
          </CardContent>
        </Card>
      )}

      <div
        className={cn(
          "sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-md border bg-background/95 px-3 py-2 backdrop-blur",
          !dirty && "opacity-80",
        )}
      >
        <span className="text-sm text-muted-foreground" data-testid="unsaved-count">
          {view === "form"
            ? changes.length
              ? `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}`
              : "No unsaved changes"
            : dirty
              ? "Unsaved YAML edits"
              : "No unsaved changes"}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || pending} onClick={discard}>
            Discard
          </Button>
          <Button disabled={!dirty || pending} onClick={() => save()}>
            Save preferences
          </Button>
        </div>
      </div>

      <Dialog open={pendingSwitch !== null} onOpenChange={(o) => !o && setPendingSwitch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              Save or discard your changes before switching to the{" "}
              {pendingSwitch === "yaml" ? "YAML" : "form"} view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingSwitch(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const v = pendingSwitch;
                setPendingSwitch(null);
                discard();
                if (v) showView(v);
              }}
            >
              Discard
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                const v = pendingSwitch;
                setPendingSwitch(null);
                if (v) save(() => showView(v));
              }}
            >
              Save and switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title,
  description,
  open = false,
  children,
}: {
  title: string;
  description?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="py-0">
      <details open={open} className="group">
        <summary className="cursor-pointer list-none px-6 py-4 [&::-webkit-details-marker]:hidden">
          <span className="font-semibold">{title}</span>
          <span className="ml-2 text-xs text-muted-foreground group-open:hidden">(show)</span>
          {description && (
            <span className="block text-sm text-muted-foreground">{description}</span>
          )}
        </summary>
        <CardContent className="space-y-4 pb-6">{children}</CardContent>
      </details>
    </Card>
  );
}

function FieldError({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {messages.join("; ")}
    </p>
  );
}

function PreferencesForm({
  values,
  setValues,
  fieldErrors,
}: {
  values: PreferenceValues;
  setValues: (fn: (v: PreferenceValues | null) => PreferenceValues | null) => void;
  fieldErrors: PreferenceFieldError[];
}) {
  const set = (path: Path, value: unknown) => setValues((v) => (v ? setIn(v, path, value) : v));
  const errs = (path: string) =>
    fieldErrors
      .filter((e) => e.path === path || e.path.startsWith(`${path}.`))
      .map((e) => e.message);
  const timeZones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  const text = (label: string, path: string, value: string | undefined, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`pref-${path}`}>{label}</Label>
      <Input
        id={`pref-${path}`}
        value={value ?? ""}
        placeholder={placeholder}
        aria-invalid={errs(path).length > 0}
        onChange={(e) =>
          set(path.split("."), OPTIONAL.has(path) && !e.target.value ? undefined : e.target.value)
        }
      />
      <FieldError messages={errs(path)} />
    </div>
  );
  const num = (
    label: string,
    path: string,
    value: number | undefined,
    opts: { min?: number; max?: number; step?: string; errorPath?: string } = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`pref-${path}`}>{label}</Label>
      <Input
        id={`pref-${path}`}
        type="number"
        inputMode="decimal"
        min={opts.min}
        max={opts.max}
        step={opts.step ?? "1"}
        value={value ?? ""}
        aria-invalid={errs(path).length > 0}
        onChange={(e) =>
          set(path.split("."), e.target.value === "" ? null : Number(e.target.value))
        }
      />
      <FieldError messages={[...errs(path), ...(opts.errorPath ? errs(opts.errorPath) : [])]} />
    </div>
  );
  const tags = (
    label: string,
    path: string,
    value: string[],
    extra: { suggestions?: readonly string[]; splitOnComma?: boolean; placeholder?: string } = {},
  ) => (
    <div className="space-y-1">
      <TagInput
        label={label}
        value={value}
        onChange={(v) => set(path.split("."), v)}
        invalid={errs(path).length > 0}
        {...extra}
      />
      <FieldError messages={errs(path)} />
    </div>
  );
  const check = (label: string, path: string, value: boolean) => (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`pref-${path}`}
        checked={value}
        onCheckedChange={(c) => set(path.split("."), c === true)}
      />
      <Label htmlFor={`pref-${path}`}>{label}</Label>
    </div>
  );
  const time = (label: string, path: string, value: string) => (
    <div className="space-y-1">
      <Label asChild>
        <span>{label}</span>
      </Label>
      <TimePicker value={value} onChange={(t) => set(path.split("."), t)} aria-label={label} />
      <FieldError messages={errs(path)} />
    </div>
  );

  const v = values;
  return (
    <form
      className="space-y-4"
      aria-label="Preferences"
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      <Section title="Targets" description="What you look for. Scoring reads all of it." open>
        {tags("Target roles", "target_roles", v.target_roles, { splitOnComma: false })}
        {tags("Skills", "skills", v.skills)}
        <div className="grid gap-4 sm:grid-cols-2">
          {tags(
            "Leadership roles: company stages",
            "leadership_target.company_stage",
            v.leadership_target.company_stage,
            { suggestions: STAGES },
          )}
          {num(
            "Leadership roles: maximum engineering team",
            "leadership_target.max_engineering_team",
            v.leadership_target.max_engineering_team,
            { min: 1 },
          )}
        </div>
      </Section>

      <Section
        title="Keywords and companies"
        description="The pre-filter: offers without an include keyword, or with an exclude keyword, are never scored."
        open
      >
        {tags("Include keywords", "keywords.include", v.keywords.include)}
        {tags("Exclude keywords", "keywords.exclude", v.keywords.exclude, {
          placeholder: "e.g. PHP, or title:junior to match the title only",
        })}
        {tags("Title must contain one of", "keywords.title_include", v.keywords.title_include, {
          placeholder: "Leave empty to accept any title",
        })}
        {tags("Hidden companies", "keywords.exclude_companies", v.keywords.exclude_companies, {
          splitOnComma: false,
          placeholder: "Their offers are hidden and never scored",
        })}
      </Section>

      <Section
        title="Engagement and rates"
        description="Offers stating less than your minimum are capped at 30."
        open
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Engagement types</legend>
          <div className="flex flex-wrap gap-4">
            {ENGAGEMENT_TYPES.map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`pref-engagement-${key}`}
                  checked={v.engagement.types.includes(key)}
                  onCheckedChange={(c) =>
                    set(
                      ["engagement", "types"],
                      c === true
                        ? [...v.engagement.types, key]
                        : v.engagement.types.filter((t) => t !== key),
                    )
                  }
                />
                <Label htmlFor={`pref-engagement-${key}`}>{label}</Label>
              </div>
            ))}
          </div>
          <FieldError messages={errs("engagement.types")} />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          {num(
            "Weekly capacity (hours)",
            "engagement.weekly_capacity_hours",
            v.engagement.weekly_capacity_hours,
            { min: 1, max: 80 },
          )}
          {num(
            "Minimum project hours per week",
            "engagement.min_project_hours_per_week",
            v.engagement.min_project_hours_per_week,
            { min: 0 },
          )}
          {num("Minimum day rate (EUR)", "rates.min_daily_eur", v.rates.min_daily_eur, { min: 1 })}
        </div>
        <CurrencyRates
          title="Minimum hourly rate"
          value={v.rates.min_hourly}
          onChange={(r) => set(["rates", "min_hourly"], r)}
          errors={errs("rates.min_hourly")}
        />
        <CurrencyRates
          title="Target hourly rate"
          optional
          value={v.rates.target_hourly ?? {}}
          onChange={(r) => set(["rates", "target_hourly"], Object.keys(r).length ? r : undefined)}
          errors={errs("rates.target_hourly")}
        />
      </Section>

      <Section title="Location">
        {check("Remote only", "location.remote_only", v.location.remote_only)}
        {tags("Accepted regions", "location.accepted_regions", v.location.accepted_regions)}
        {text(
          "Maximum time-zone overlap required",
          "location.max_overlap_required",
          v.location.max_overlap_required,
          "e.g. until 17:00 US Eastern",
        )}
        {tags("Hybrid regions", "location.hybrid_regions", v.location.hybrid_regions ?? [], {
          placeholder: "e.g. Spain, Madrid",
        })}
        <p className="text-xs text-muted-foreground">
          With Remote only on, hybrid offers located here are still scored. Names match whole words
          in the offer&apos;s location.
        </p>
        {tags(
          "Preferred regions",
          "location.preferred_regions",
          v.location.preferred_regions ?? [],
          {
            placeholder: "e.g. Spain",
          },
        )}
        {num("Preferred region bonus", "location.preferred_bonus", v.location.preferred_bonus, {
          min: 0,
          max: 20,
        })}
        <p className="text-xs text-muted-foreground">
          Points added to the overall score of offers in a preferred region, remote or hybrid. Never
          added to a capped offer.
        </p>
      </Section>

      <Section
        title="Service lines"
        description="What you offer; used to label matches and tailor drafts."
      >
        <ServiceLines
          value={v.service_lines}
          onChange={(s) => set(["service_lines"], s)}
          errors={(i, f) => errs(`service_lines.${i}.${f}`)}
        />
        <FieldError
          messages={fieldErrors.filter((e) => e.path === "service_lines").map((e) => e.message)}
        />
      </Section>

      <Section title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("Name", "owner.name", v.owner.name)}
          {text("Base location", "owner.base_location", v.owner.base_location)}
          <div className="space-y-1">
            <Label htmlFor="pref-owner.timezone">Time zone</Label>
            <Input
              id="pref-owner.timezone"
              list="pref-timezones"
              value={v.owner.timezone}
              aria-invalid={errs("owner.timezone").length > 0}
              onChange={(e) => set(["owner", "timezone"], e.target.value)}
            />
            <datalist id="pref-timezones">
              {timeZones.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
            <FieldError messages={errs("owner.timezone")} />
          </div>
        </div>
        {tags("Work authorization", "owner.work_authorization", v.owner.work_authorization)}
        {tags("Languages", "owner.languages", v.owner.languages, { splitOnComma: false })}
      </Section>

      <Section title="Scoring and research">
        <div className="grid gap-4 sm:grid-cols-3">
          {num("Strong threshold", "scoring.thresholds.strong", v.scoring.thresholds.strong, {
            min: 1,
            max: 100,
          })}
          {num("Possible threshold", "scoring.thresholds.possible", v.scoring.thresholds.possible, {
            min: 0,
            max: 99,
            errorPath: "scoring.thresholds",
          })}
          <span />
          {text("Scoring model", "scoring.models.scoring", v.scoring.models.scoring)}
          {text("Drafting model", "scoring.models.drafting", v.scoring.models.drafting)}
          <span />
          {num("Daily scoring cap", "scoring.daily_caps.scoring", v.scoring.daily_caps.scoring, {
            min: 0,
          })}
          {num("Daily drafts cap", "scoring.daily_caps.drafts", v.scoring.daily_caps.drafts, {
            min: 0,
          })}
          {num(
            "Daily company research cap",
            "scoring.daily_caps.research",
            v.scoring.daily_caps.research,
            { min: 0, max: 100 },
          )}
        </div>
        {check(
          "Research the company of every strong match",
          "research.auto_strong",
          v.research.auto_strong,
        )}
      </Section>

      <Section title="Notifications">
        <div className="grid gap-4 sm:grid-cols-3">
          {time(
            "Quiet hours start",
            "notifications.quiet_hours.start",
            v.notifications.quiet_hours.start,
          )}
          {time(
            "Quiet hours end",
            "notifications.quiet_hours.end",
            v.notifications.quiet_hours.end,
          )}
          {time("Daily digest time", "notifications.digest_time", v.notifications.digest_time)}
          {num("Check email every (minutes)", "mail.check_minutes", v.mail.check_minutes, {
            min: 5,
            max: 1440,
          })}
        </div>
        <div className="space-y-1">
          <TagInput
            label="Follow-up reminders (days in Applied)"
            value={v.notifications.follow_up_days.map(String)}
            onChange={(days) =>
              set(
                ["notifications", "follow_up_days"],
                [...new Set(days.map(Number))].sort((a, b) => a - b),
              )
            }
            placeholder="e.g. 7, 14 — empty turns reminders off"
            invalid={errs("notifications.follow_up_days").length > 0}
          />
          <FieldError messages={errs("notifications.follow_up_days")} />
        </div>
      </Section>

      <p className="text-sm text-muted-foreground">
        Per-source settings (<code>sources:</code>) are edited in the YAML view; saving the form
        leaves them as they are.
      </p>
    </form>
  );
}

function CurrencyRates({
  title,
  value,
  onChange,
  errors,
  optional = false,
}: {
  title: string;
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  errors: string[];
  optional?: boolean;
}) {
  const rows = Object.entries(value);
  const toRecord = (r: [string, number][]) => Object.fromEntries(r.filter(([c]) => c));
  const unused = CURRENCIES.filter((c) => !(c in value));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {title}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </legend>
      <div className="flex flex-wrap gap-3">
        {rows.map(([cur, amount], i) => (
          <div key={cur} className="flex items-center gap-1">
            <Label htmlFor={`rate-${title}-${cur}`} className="w-10 text-sm text-muted-foreground">
              {cur}
            </Label>
            <Input
              id={`rate-${title}-${cur}`}
              type="number"
              min={1}
              className="w-24"
              value={Number.isFinite(amount) ? amount : ""}
              aria-label={`${title} (${cur})`}
              onChange={(e) => {
                const next = [...rows] as [string, number][];
                next[i] = [cur, e.target.value === "" ? Number.NaN : Number(e.target.value)];
                onChange(toRecord(next));
              }}
            />
            {(optional || rows.length > 1) && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove ${title} (${cur})`}
                onClick={() => onChange(toRecord(rows.filter((_, j) => j !== i)))}
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {unused.length > 0 && (
          <select
            aria-label={`Add currency to ${title}`}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            value=""
            onChange={(e) => e.target.value && onChange({ ...value, [e.target.value]: 0 })}
          >
            <option value="">+ currency</option>
            {unused.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
      <FieldError messages={errors} />
    </fieldset>
  );
}

type ServiceLine = PreferenceValues["service_lines"][number];

function ServiceLines({
  value,
  onChange,
  errors,
}: {
  value: ServiceLine[];
  onChange: (next: ServiceLine[]) => void;
  errors: (index: number, field: string) => string[];
}) {
  const update = (i: number, patch: Partial<ServiceLine>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-3">
      {value.map((s, i) => (
        <div key={i} className="space-y-2 rounded-md border p-3" data-testid="service-line">
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor={`sl-name-${i}`}>Name</Label>
              <Input
                id={`sl-name-${i}`}
                value={s.name}
                onChange={(e) =>
                  update(i, {
                    name: e.target.value,
                    // Keep the id in step with the name until the owner edits it.
                    ...(s.id === slug(s.name) || !s.id ? { id: slug(e.target.value) } : {}),
                  })
                }
              />
              <FieldError messages={errors(i, "name")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`sl-id-${i}`}>Id</Label>
              <Input
                id={`sl-id-${i}`}
                value={s.id}
                className="font-mono text-xs"
                onChange={(e) => update(i, { id: e.target.value })}
              />
              <FieldError messages={errors(i, "id")} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="self-end"
              aria-label={`Remove service line ${s.name || i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`sl-evidence-${i}`}>Evidence</Label>
            <Textarea
              id={`sl-evidence-${i}`}
              rows={2}
              value={s.evidence}
              onChange={(e) => update(i, { evidence: e.target.value })}
            />
            <FieldError messages={errors(i, "evidence")} />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { id: "", name: "", evidence: "" }])}
      >
        <Plus aria-hidden /> Add service line
      </Button>
    </div>
  );
}
