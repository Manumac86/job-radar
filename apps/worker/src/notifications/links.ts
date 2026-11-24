import type { ProfileService } from "../profile-service";

/**
 * Base address for links to Job Radar in Telegram and the digest: the owner's "Open links at"
 * preference when set (such as their tailnet address), else the local web address. Read for
 * each message, so a change in Settings applies without a restart (notifications spec).
 */
export function linkBase(profile: ProfileService, fallback: string): string {
  return profile.get()?.preferences.notifications.link_base_url ?? fallback;
}
