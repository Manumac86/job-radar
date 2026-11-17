import { unreadCount } from "@job-radar/db";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, ThemeToggle } from "@/components/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { db } from "@/lib/db";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Job Radar", template: "%s · Job Radar" },
  description: "Local job and freelance radar",
  robots: { index: false, follow: false },
};

// Every page reads the live local database.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const unread = unreadCount(db());
  return (
    // next-themes sets the theme class before hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <SidebarProvider>
              <AppSidebar unread={unread} />
              <SidebarInset>
                <header className="flex h-12 items-center gap-2 border-b px-4">
                  <SidebarTrigger />
                  <div className="ml-auto">
                    <ThemeToggle />
                  </div>
                </header>
                <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
              </SidebarInset>
            </SidebarProvider>
            <Toaster richColors />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
