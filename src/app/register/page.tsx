import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { SignUpForm } from "@/components/auth/SignUpForm";

export const dynamic = "force-dynamic";

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
          Once your email is confirmed, an administrator can add you to a
          workspace.
        </p>

        <SignUpForm />

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
