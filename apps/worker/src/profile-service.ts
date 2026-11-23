import {
  ensureProfileFiles,
  excludedCompany,
  excludedCompanyReason,
  remoteOnlyReason,
  loadProfile,
  type Profile,
} from "@job-radar/core";
import {
  applyCompanyExclusions,
  applyHybridRegions,
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
  /** "" with no CV variants; changes when any variant changes (cv-variants D3). */
  variantsHash: string;
  /** Variant files that were skipped (they never stop scoring). */
  variantErrors: string[];
  variants: { id: string; name: string; useFor: string }[];
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
      variantsHash: "",
      variantErrors: [],
      variants: [],
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
        variantsHash: result.variantsHash,
        variantErrors: result.variantErrors,
        variants: (result.profile.variants ?? []).map(({ id, name, useFor }) => ({
          id,
          name,
          useFor,
        })),
      };
      if (result.variantErrors.length)
        log.warn("some CV variants were skipped", { errors: result.variantErrors });
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
      const location = result.profile.preferences.location;
      const hybrid = applyHybridRegions(this.db, (o) =>
        remoteOnlyReason({ ...o, remotePolicy: "hybrid" }, location),
      );
      if (hybrid.filtered || hybrid.restored) log.info("hybrid regions applied", hybrid);
    } else {
      // Keep nothing usable: an invalid file must stop scoring, not silently reuse stale values.
      this.current = null;
      this.lastStatus = {
        status: result.status,
        loadedAt: null,
        lastAttemptAt: now.toISOString(),
        errors: result.errors,
        dir: this.dir,
        variantsHash: "",
        variantErrors: [],
        variants: [],
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

  /** Hash of the loaded CV variants; scores record it (cv-variants D3). */
  variantsHash(): string {
    return this.lastStatus.variantsHash;
  }

  status(): ProfileStatus {
    return this.lastStatus;
  }

  lastSuccessfulLoad(): Date | null {
    return lastSuccessfulProfileLoad(this.db);
  }
}
