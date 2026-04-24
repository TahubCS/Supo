import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";

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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
