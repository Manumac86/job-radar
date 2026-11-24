import { Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { workerFetch } from "@/lib/worker";

export async function TelegramStatus() {
  const res = await workerFetch<{ configured: boolean; howTo?: string[] }>("/telegram/status");
  if (!res.ok || res.data.configured) return null;
  return (
    <Alert className="mb-4">
      <Send aria-hidden />
      <AlertTitle>Telegram is not connected — notifications stay in the app</AlertTitle>
      <AlertDescription className="[overflow-wrap:anywhere]">
        <ol className="list-decimal space-y-0.5 pl-5">
          {(res.data.howTo ?? []).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </AlertDescription>
    </Alert>
  );
}
