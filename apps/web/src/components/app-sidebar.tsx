"use client";

import { Bell, Briefcase, Gauge, KanbanSquare, Rss, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/offers", label: "Offers", icon: Briefcase },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/people", label: "People", icon: Users },
  { href: "/sources", label: "Sources", icon: Rss },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** The radar mark, drawn as a chart reticle: rings, a sweep and one object under the eye. */
export function RadarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="1" />
      <path d="M12 12 18.4 5.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="16.2" cy="8.6" r="1.6" fill="var(--sidebar-primary)" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function AppSidebar({ unread }: { unread: number }) {
  const pathname = usePathname();
  // On a phone the sidebar opens over the page: choosing a page closes it (job-dashboard spec).
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-2 text-sidebar-accent-foreground">
          <RadarMark className="size-6 shrink-0" />
          <span className="font-display text-xl leading-none group-data-[collapsible=icon]:hidden">
            Job Radar
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={label}
                      className="h-9 text-sidebar-foreground data-[active=true]:font-medium"
                    >
                      <Link href={href} onClick={() => isMobile && setOpenMobile(false)}>
                        <Icon aria-hidden className={active ? "text-sidebar-primary" : undefined} />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {href === "/notifications" && unread > 0 ? (
                      <SidebarMenuBadge
                        aria-label={`${unread} unread`}
                        className="top-2 rounded-sm bg-sidebar-primary text-sidebar-primary-foreground"
                      >
                        {unread}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
