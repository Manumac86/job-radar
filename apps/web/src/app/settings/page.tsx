import { appTimeZone } from "@job-radar/core/time";
import { readProfileFiles } from "@job-radar/core/profile";
import { getSource, listSources, listStages } from "@job-radar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { learningData } from "@/lib/learning";
import { ExampleProfileNotice } from "@/components/example-profile-notice";
import { profileDir, readPreferences, usingExampleProfile } from "@/lib/profile";
import { workerFetch } from "@/lib/worker";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "Settings" };

interface ProfileStatus {
  status: string;
  loadedAt: string | null;
  errors: string[];
}
interface ScoringStatus {
  llm: string;
  llmMessage: string | null;
  queued: number;
  budget: { scoring: { used: number; cap: number }; drafts: { used: number; cap: number } };
}

const TABS = ["general", "learning", "profile", "sources", "sessions", "stages", "status"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tab = (await searchParams)["tab"];
  const initialTab = typeof tab === "string" && TABS.includes(tab) ? tab : "general";
  const d = db();
  let files = { cv: "", preferences: "" };
  try {
    files = readProfileFiles(profileDir());
  } catch {
    // Files missing: the worker seeds them on start; the editors start empty.
  }
  const { prefs, errors } = readPreferences();
  const [profileStatus, scoring, telegram] = await Promise.all([
    workerFetch<ProfileStatus>("/profile/status"),
    workerFetch<ScoringStatus>("/scoring/status"),
    workerFetch<{ configured: boolean; howTo?: string[] }>("/telegram/status"),
  ]);
  const email = getSource(d, "email_alerts");
  const es = email?.settings ?? {};
  const loggedIn = listSources(d).filter((s) => s.requiresLogin);

  return (
    <>
      <PageHeader title="Settings" description={`Profile files live in ${profileDir()}.`} />
      <ExampleProfileNotice show={usingExampleProfile()} />
      <SettingsTabs
        initialTab={initialTab}
        timeZone={appTimeZone()}
        cv={files.cv}
        preferences={files.preferences}
        validationErrors={errors}
        excludedCompanies={prefs?.keywords.exclude_companies ?? []}
        form={
          prefs
            ? {
                strong: prefs.scoring.thresholds.strong,
                possible: prefs.scoring.thresholds.possible,
                scoringModel: prefs.scoring.models.scoring,
                draftingModel: prefs.scoring.models.drafting,
                scoringCap: prefs.scoring.daily_caps.scoring,
                draftsCap: prefs.scoring.daily_caps.drafts,
                researchCap: prefs.scoring.daily_caps.research,
                autoResearch: prefs.research.auto_strong,
                quietStart: prefs.notifications.quiet_hours.start,
                quietEnd: prefs.notifications.quiet_hours.end,
                digestTime: prefs.notifications.digest_time,
                minEUR: prefs.rates.min_hourly["EUR"] ?? 0,
                minUSD: prefs.rates.min_hourly["USD"] ?? 0,
                minGBP: prefs.rates.min_hourly["GBP"] ?? 0,
                minDailyEUR: prefs.rates.min_daily_eur,
                capacity: prefs.engagement.weekly_capacity_hours,
                followUpDays: prefs.notifications.follow_up_days.join(", "),
              }
            : null
        }
        status={{
          worker: profileStatus.ok,
          profile: profileStatus.ok ? profileStatus.data : null,
          scoring: scoring.ok ? scoring.data : null,
          telegram: telegram.ok ? telegram.data : null,
        }}
        email={{
          exists: Boolean(email),
          user: typeof es["user"] === "string" ? es["user"] : "",
          label: typeof es["label"] === "string" ? es["label"] : "job-alerts",
          host: typeof es["host"] === "string" ? es["host"] : "imap.gmail.com",
          port: typeof es["port"] === "number" ? es["port"] : 993,
          lookbackDays: typeof es["lookback_days"] === "number" ? es["lookback_days"] : 3,
        }}
        learning={learningData()}
        stages={listStages(d).map((s) => ({ key: s.key, label: s.label, custom: s.custom }))}
        sessions={loggedIn.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          enabled: s.enabled,
        }))}
      />
    </>
  );
}
