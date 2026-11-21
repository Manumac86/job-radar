import { loadVariants, readProfileFiles } from "@job-radar/core/profile";
import { getSource, listSources, listStages, staleCvRecommendationCount } from "@job-radar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { learningData } from "@/lib/learning";
import { ExampleProfileNotice } from "@/components/example-profile-notice";
import {
  preferencesHash,
  profileDir,
  readPreferences,
  usingExampleProfile,
  withoutSources,
} from "@/lib/profile";
import { workerFetch } from "@/lib/worker";
import type { MailAccountView } from "./mail-accounts-card";
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

const TABS = [
  "preferences",
  "general",
  "learning",
  "profile",
  "email",
  "sources",
  "sessions",
  "stages",
  "status",
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = params["tab"];
  const view = params["view"];
  const initialTab = typeof tab === "string" && TABS.includes(tab) ? tab : "preferences";
  const d = db();
  let files = { cv: "", preferences: "" };
  try {
    files = readProfileFiles(profileDir());
  } catch {
    // Files missing: the worker seeds them on start; the editors start empty.
  }
  const { prefs, errors } = readPreferences();
  const cvVariants = loadVariants(profileDir());
  const [profileStatus, scoring, telegram, mailAccounts] = await Promise.all([
    workerFetch<ProfileStatus>("/profile/status"),
    workerFetch<ScoringStatus>("/scoring/status"),
    workerFetch<{ configured: boolean; howTo?: string[] }>("/telegram/status"),
    workerFetch<MailAccountView[]>("/mail/accounts"),
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
        cv={files.cv}
        validationErrors={errors}
        cvVariants={{
          variants: cvVariants.variants,
          errors: cvVariants.errors,
          staleCount: cvVariants.variants.length
            ? staleCvRecommendationCount(d, cvVariants.hash)
            : 0,
        }}
        preferencesPanel={{
          initialView: view === "yaml" ? "yaml" : "form",
          text: files.preferences,
          hash: preferencesHash(files.preferences),
          values: prefs ? withoutSources(prefs) : null,
          errors,
        }}
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
        mail={{
          accounts: mailAccounts.ok ? mailAccounts.data : [],
          workerRunning: mailAccounts.ok,
          checkMinutes: prefs?.mail.check_minutes ?? 15,
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
