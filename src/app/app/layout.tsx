import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Sidebar } from "@/components/app/Sidebar";
import { currentUser, hasRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already turns anonymous callers away; this is the second gate,
  // and the one that knows whether the account belongs to a workspace.
  const user = await currentUser();
  if (!user) redirect("/login");

  if (!user.companyId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">
            No workspace yet
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            You are signed in as {user.email}, but this account has not been
            added to a workspace. Ask an administrator to invite you.
          </p>
          <form action="/auth/sign-out" method="post" className="mt-6">
            <button
              type="submit"
              className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
          isAdmin: hasRole(user, "ADMIN"),
        }}
      />
      <div className="flex-1 overflow-y-auto thin-scroll">{children}</div>
    </div>
  );
}
