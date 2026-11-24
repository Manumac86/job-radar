import { toast } from "sonner";

export const INSECURE_COPY_MESSAGE =
  "Copying needs a secure address: open Job Radar at its https:// address.";

/**
 * Copies text and says so. Browsers offer no clipboard on a page that is not secure (plain http
 * through a name), so that case gets a message instead of failing silently (remote-access guide).
 */
export async function copyText(text: string, done: string): Promise<boolean> {
  if (!navigator.clipboard) {
    toast.error(INSECURE_COPY_MESSAGE);
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    toast.error("Could not copy");
    return false;
  }
}
