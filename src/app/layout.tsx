import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Study Brain",
  description: "Find out why you lose marks, and fix it with tomorrow's practice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href={user ? "/home" : "/"} className="font-semibold text-blue-600">
              Study Brain
            </Link>
            {user && (
              <div className="flex items-center gap-4 text-sm">
                <Link href="/home">Home</Link>
                <Link href="/upload">Upload</Link>
                <form action="/auth/signout" method="post">
                  <button className="text-slate-500">Log out</button>
                </form>
              </div>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
