"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markRead, markUnread } from "./actions";

export interface NotificationView {
  id: number;
  kind: string;
  title: string;
  body: string;
  offerId: number | null;
  read: boolean;
  telegramStatus: string;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = {
  strong_match: "Strong match",
  interview_reminder: "Interview",
  session_expired: "Session",
  source_stopped: "Source",
  llm_cap_reached: "LLM cap",
  llm_unavailable: "LLM",
  no_response: "Follow-up",
  follow_up: "Follow-up",
  interview_prep: "Interview prep",
  learned_preferences: "Learning",
  digest: "Digest",
};

export function NotificationList({
  items,
  unreadOnly,
}: {
  items: NotificationView[];
  unreadOnly: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.replace(unreadOnly ? pathname : `${pathname}?unread=1`)}
        >
          {unreadOnly ? "Show all" : "Unread only"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => start(() => markRead("all"))}
        >
          Mark all as read
        </Button>
      </div>
      {items.length ? (
        <ul className="divide-y rounded-lg border" data-testid="notifications">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn("flex gap-3 p-3", !n.read && "bg-muted/40")}
              data-read={n.read}
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  n.read ? "bg-transparent" : "bg-foreground",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{KIND_LABELS[n.kind] ?? n.kind}</Badge>
                  <span className="font-medium">{n.title}</span>
                  <span className="text-xs text-muted-foreground">{n.createdAt}</span>
                  {n.telegramStatus === "held" ? (
                    <Badge variant="secondary">Held (quiet hours)</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{n.body}</p>
                {n.offerId ? (
                  <Link
                    href={`/offers/${n.offerId}`}
                    className="text-sm underline"
                    onClick={() => !n.read && start(() => markRead([n.id]))}
                  >
                    Open offer
                  </Link>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => start(() => (n.read ? markUnread(n.id) : markRead([n.id])))}
                aria-label={n.read ? `Mark "${n.title}" as unread` : `Mark "${n.title}" as read`}
              >
                {n.read ? "Mark unread" : "Mark read"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No notifications.
        </p>
      )}
    </div>
  );
}
