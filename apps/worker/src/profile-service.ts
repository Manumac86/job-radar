import {
  ensureProfileFiles,
  excludedCompany,
  excludedCompanyReason,
  loadProfile,
  type Profile,
} from "@job-radar/core";
import {
  applyCompanyExclusions,
  lastSuccessfulProfileLoad,
  recordProfileLoad,
  type Db,
} from "@job-radar/db";
import { log } from "./log";

export interface ProfileStatus {
  status: "ok" | "invalid" | "missing";
  loadedAt: string | null;
  lastAttemptAt: string;
  errors: string[];
  dir: string;
}

/** Holds the current profile; scoring and drafting refuse to run while it is invalid. */
export class ProfileService {
  private current: Profile | null = null;
  private lastStatus: ProfileStatus;

  constructor(
    private readonly db: Db,
    readonly dir: string,
    private readonly seedDir?: string,
  ) {
    this.lastStatus = {
      status: "missing",
      loadedAt: null,
      lastAttemptAt: new Date().toISOString(),
      errors: [],
      dir,
    };
  }

  reload(now = new Date()): ProfileStatus {
    if (this.seedDir) {
      for (const f of ensureProfileFiles(this.dir, this.seedDir))
        log.info("profile seeded", { file: f });
    }
    const result = loadProfile(this.dir, now);
    if (result.ok) {
      this.current = result.profile;
      this.lastStatus = {
        status: "ok",
        loadedAt: now.toISOString(),
        lastAttemptAt: now.toISOString(),
        errors: [],
        dir: this.dir,
      };
      recordProfileLoad(this.db, {
        loadedAt: now,
        status: "ok",
        cvHash: result.cvHash,
        preferencesHash: result.preferencesHash,
        errors: [],
      });
      log.info("profile loaded");
      const excluded = result.profile.preferences.keywords.exclude_companies;
      const changed = applyCompanyExclusions(
        this.db,
        (name) => excludedCompany(name, excluded),
        excludedCompanyReason,
      );
      if (changed.hidden || changed.restored) log.info("company exclusions applied", changed);
    } else {
      // Keep nothing usable: an invalid file must stop scoring, not silently reuse stale values.
      this.current = null;
      this.lastStatus = {
        status: result.status,
        loadedAt: null,
        lastAttemptAt: now.toISOString(),
        errors: result.errors,
        dir: this.dir,
      };
      recordProfileLoad(this.db, { loadedAt: now, status: result.status, errors: result.errors });
      log.error("profile invalid; scoring paused", { errors: result.errors });
    }
    return this.lastStatus;
  }

  /** The loaded profile, or null when files are missing or invalid. */
  get(): Profile | null {
    return this.current;
  }

  status(): ProfileStatus {
    return this.lastStatus;
  }

  lastSuccessfulLoad(): Date | null {
    return lastSuccessfulProfileLoad(this.db);
  }
}
