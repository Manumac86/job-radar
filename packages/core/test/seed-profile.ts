import { join } from "node:path";
import { loadProfile, type Profile } from "../src/index";

export function loadSeedProfile(): Profile {
  const result = loadProfile(join(import.meta.dirname, "..", "..", "..", "profile-seed"));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.profile;
}
