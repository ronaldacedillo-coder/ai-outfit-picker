import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Wardrobe</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Signed in as {user?.email}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="rounded-lg border border-dashed border-neutral-300 px-6 py-16 text-center text-sm text-neutral-500">
        Wardrobe upload is coming in the next build step. Auth foundation is
        live — this page is only reachable when signed in.
      </section>
    </main>
  );
}
