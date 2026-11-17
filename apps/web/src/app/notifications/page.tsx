import { listNotifications, unreadCount } from "@job-radar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { NotificationList, type NotificationView } from "./notification-list";
import { TelegramStatus } from "./telegram-status";

export const metadata: Metadata = { title: "Notifications" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const unreadOnly = sp["unread"] === "1";
  const d = db();
  const items: NotificationView[] = listNotifications(d, { unreadOnly, limit: 200 }).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    offerId: n.offerId,
    read: n.readAt !== null,
    telegramStatus: n.telegramStatus,
    createdAt: formatDate(n.createdAt, true),
  }));
  return (
    <>
      <PageHeader title="Notifications" description={`${unreadCount(d)} unread.`} />
      <TelegramStatus />
      <NotificationList items={items} unreadOnly={unreadOnly} />
    </>
  );
}
