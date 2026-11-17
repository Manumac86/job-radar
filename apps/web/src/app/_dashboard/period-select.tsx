"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PeriodSelect({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Tabs
      value={String(value)}
      onValueChange={(v) => {
        const next = new URLSearchParams(params.toString());
        next.set("period", v);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    >
      <TabsList aria-label="Period">
        <TabsTrigger value="7">7 days</TabsTrigger>
        <TabsTrigger value="30">30 days</TabsTrigger>
        <TabsTrigger value="90">90 days</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
