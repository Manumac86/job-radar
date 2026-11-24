"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { offerHref } from "./back-link";

/** A link to an offer that remembers the list's filters, for "Back to offers". */
export function OfferLink({
  id,
  className,
  children,
}: {
  id: number;
  className?: string;
  children: ReactNode;
}) {
  const params = useSearchParams();
  return (
    <Link href={offerHref(id, params.toString())} className={className}>
      {children}
    </Link>
  );
}
