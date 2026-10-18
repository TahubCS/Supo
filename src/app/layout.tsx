import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "../styles/index.css";

export const metadata: Metadata = {
  title: {
    default: "Supo",
    template: "%s | Supo",
  },
  description:
    "Supo is an AI support platform for teams that need automation, human handoff, and operational visibility in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Before the page: effects run in tree order, and the Toaster must
              subscribe before a page effect raises a toast on load (sonner
              drops toasts raised while no Toaster is listening). */}
          <Toaster />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
