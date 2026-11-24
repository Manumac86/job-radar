import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="min-w-0">
        <h1 className="font-display text-[2.125rem] leading-[1.05] text-balance">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]" data-tabular>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
