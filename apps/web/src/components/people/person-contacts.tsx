"use client";

// LinkedIn opens in the browser and other contacts are copied: Job Radar never sends, connects or
// messages anyone (contacts spec).
import { Copy, ExternalLink } from "lucide-react";
import type { PersonView } from "@/app/offers/[id]/people-actions";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";

async function copy(label: string, value: string) {
  await copyText(value, `${label} copied`);
}

function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="[overflow-wrap:anywhere]">{value}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => copy(label, value)}
      >
        <Copy className="size-3" />
      </Button>
    </span>
  );
}

export function PersonContacts({ person }: { person: PersonView }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {person.linkedinUrl ? (
        <a
          href={person.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          LinkedIn <ExternalLink className="size-3" />
        </a>
      ) : null}
      {person.email ? <CopyValue label="Email" value={person.email} /> : null}
      {person.phone ? <CopyValue label="Phone" value={person.phone} /> : null}
      {person.other ? <CopyValue label="Contact" value={person.other} /> : null}
    </div>
  );
}

/** "Recruiter at Northwind Talent", or the parts that are known. */
export function roleLine(p: Pick<PersonView, "role" | "companyName">): string {
  if (p.role && p.companyName) return `${p.role} at ${p.companyName}`;
  return p.role ?? p.companyName ?? "";
}
