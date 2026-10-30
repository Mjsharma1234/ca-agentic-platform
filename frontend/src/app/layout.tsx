import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export const metadata: Metadata = {
  title: "CA Agentic Platform",
  description: "AI-powered compliance platform for CA firms",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans bg-slate-50 text-slate-900">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col h-screen overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-auto bg-slate-50 p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
