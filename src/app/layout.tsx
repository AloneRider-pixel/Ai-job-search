import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "CareerOS — Evidence-Backed Job Search OS",
  description: "Build an evidence-backed application for every job.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
