import { UserPen } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Shown while the CV is still the bundled example (candidate-profile spec). */
export function ExampleProfileNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Alert className="mb-4" data-testid="example-profile">
      <UserPen aria-hidden />
      <AlertTitle>This is the example profile</AlertTitle>
      <AlertDescription>
        <p>
          Offers are scored against a fictional candidate until you add your own CV and preferences.{" "}
          <Link href="/settings?tab=profile" className="font-medium underline underline-offset-4">
            Edit your profile
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
