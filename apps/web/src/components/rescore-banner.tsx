"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { rescoreOpenOffers } from "@/app/settings/actions";
import { dismissRescoreBanner } from "@/app/settings/learning-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shown while learned preferences changed after the last rescore (offer-feedback spec). */
export function RescoreBanner({ openOffers }: { openOffers: number }) {
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Done");
      else toast.error(r.error ?? "Failed");
    });
  return (
    <Alert data-testid="rescore-banner">
      <Sparkles aria-hidden />
      <AlertTitle>Learned preferences changed</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>
          Rescore {openOffers} open offer{openOffers === 1 ? "" : "s"} so their scores use them? It
          uses {openOffers} scoring call{openOffers === 1 ? "" : "s"} within your daily cap.
        </span>
        <span className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => act(rescoreOpenOffers)}>
            <RefreshCw aria-hidden /> Rescore {openOffers}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => act(dismissRescoreBanner)}
          >
            Not now
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
