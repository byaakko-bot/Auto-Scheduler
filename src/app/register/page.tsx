import Link from "next/link";
import { CalendarRange } from "lucide-react";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <CalendarRange className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Buildora</span>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Create account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set up your company workspace.
        </p>
        <form className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Full name</label>
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Company</label>
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <Link
            href="/app/dashboard"
            className="block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            Create workspace
          </Link>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-600">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
