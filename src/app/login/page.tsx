import Link from "next/link";
import { CalendarRange } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <CalendarRange className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Buildora</span>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Local development mode bypasses authentication. Connect Supabase to
          enable real sign-in.
        </p>
        <form className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <Link
            href="/app/dashboard"
            className="block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            Continue to app
          </Link>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{" "}
          <Link href="/register" className="font-medium text-blue-600">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
