import { unreadCount } from "@job-radar/db";
import type { Metadata } from "next";
import localFont from "next/font/local";
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

// Self-hosted faces (no network at build or run time): Geist for every label and figure,
// Spectral light italic as the atlas naming voice (surface brief src-app).
const geist = localFont({
  src: [
    { path: "./fonts/geist-latin.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/geist-latin-ext.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist",
  display: "swap",
});
const spectral = localFont({
  src: [
    { path: "./fonts/spectral-300-italic-latin.woff2", weight: "300", style: "italic" },
    { path: "./fonts/spectral-300-italic-latin-ext.woff2", weight: "300", style: "italic" },
    { path: "./fonts/spectral-400-italic-latin.woff2", weight: "400", style: "italic" },
    { path: "./fonts/spectral-400-italic-latin-ext.woff2", weight: "400", style: "italic" },
    { path: "./fonts/spectral-300-latin.woff2", weight: "300", style: "normal" },
    { path: "./fonts/spectral-400-latin.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-spectral",
  display: "swap",
});

// Every page reads the live local database.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const unread = unreadCount(db());
  return (
    // next-themes sets the theme class before hydration.
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${spectral.variable}`}>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <SidebarProvider>
              <AppSidebar unread={unread} />
              <SidebarInset className="min-w-0">
                <header className="flex h-12 items-center gap-2 border-b bg-background/95 px-4">
                  <SidebarTrigger />
                  <div className="ml-auto">
                    <ThemeToggle />
                  </div>
                </header>
                {/* SidebarInset is the <main> landmark; this is its content column. */}
                <div
                  data-testid="page-content"
                  className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-6 md:px-8 md:py-8 has-[[data-full-bleed]]:max-w-none"
                >
                  {children}
                </div>
              </SidebarInset>
            </SidebarProvider>
            <Toaster richColors />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
