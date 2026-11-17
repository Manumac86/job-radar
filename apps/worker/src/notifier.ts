import {
  createNotification,
  type Db,
  type Notification,
  type NotificationInput,
} from "@job-radar/db";
import { log } from "./log";

export type DeliveryHook = (n: Notification) => void | Promise<void>;

/**
 * Every notification is stored for the in-app center first; delivery hooks (Telegram)
 * run only for newly created ones, so a dedupe key guarantees "once per offer".
 */
export class Notifier {
  private hooks: DeliveryHook[] = [];
  constructor(private readonly db: Db) {}

  onCreated(hook: DeliveryHook): void {
    this.hooks.push(hook);
  }

  notify(input: NotificationInput): Notification | null {
    const { notification, created } = createNotification(this.db, input);
    if (!created) return null;
    log.info("notification", { kind: notification.kind, id: notification.id });
    for (const hook of this.hooks) {
      Promise.resolve(hook(notification)).catch((err: unknown) =>
        log.error("notification delivery failed", { id: notification.id, error: String(err) }),
      );
    }
    return notification;
  }
}
