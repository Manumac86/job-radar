"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Site-specific risk notices for logged-in adapters (browser-sessions spec). */
export const RISK_NOTICES: Record<string, { text: string; preferEmail: boolean }> = {
  upwork: {
    text: "Upwork's terms restrict automated access. Even read-only browsing can lead to account limits or suspension.",
    preferEmail: true,
  },
  linkedin: {
    text: "LinkedIn's user agreement prohibits automated access and actively restricts accounts that browse automatically, even read-only.",
    preferEmail: true,
  },
  malt: {
    text: "Malt may limit accounts that browse automatically. Job Radar only reads pages, slowly, with a page cap.",
    preferEmail: false,
  },
  wellfound: {
    text: "Wellfound may limit accounts that browse automatically. Job Radar only reads pages, slowly, with a page cap.",
    preferEmail: false,
  },
  mercor: {
    text: "Mercor may limit accounts that browse automatically. Job Radar only reads pages, slowly, with a page cap.",
    preferEmail: false,
  },
};

export function RiskDialog({
  open,
  onOpenChange,
  sourceId,
  sourceName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sourceId: string;
  sourceName: string;
  onConfirm: () => void;
}) {
  const notice = RISK_NOTICES[sourceId] ?? {
    text: "This site may restrict automated access.",
    preferEmail: false,
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable {sourceName}?</DialogTitle>
          <DialogDescription>{notice.text}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            Read-only: Job Radar never clicks apply, send, connect or message, and never fills
            forms.
          </li>
          <li>At most 20 pages per hour, with random pauses of 5–20 seconds.</li>
          <li>You log in yourself in an isolated browser; no password is stored.</li>
        </ul>
        {notice.preferEmail ? (
          <p className="rounded-md border p-2 text-sm">
            Recommended instead: forward {sourceName} job alerts to your <strong>job-alerts</strong>{" "}
            label and use the job-alert email source. It carries no account risk.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep disabled
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            I understand the risk, enable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
