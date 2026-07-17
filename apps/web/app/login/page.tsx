import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[380px] rounded-xl border border-border bg-surface p-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="rounded-[5px] bg-accent px-2 py-1 text-[15px] font-extrabold tracking-[0.5px] text-white">
            GO
          </span>
          <span className="text-[15px] font-extrabold tracking-[2px] text-ink">DIGITAL</span>
          <span className="ml-1 rounded-[5px] bg-chip px-1.5 py-0.5 text-[11px] font-bold text-muted">
            OS
          </span>
        </div>
        <h1 className="mb-1 text-[17px] font-extrabold text-ink">Најава</h1>
        <p className="mb-6 text-[12px] text-muted-2">Финансиски систем · АЛМА ДИЗАЈН ДООЕЛ</p>

        <form action={loginAction} className="flex flex-col gap-3">
          <label className="text-[12px] font-semibold text-muted">
            Е-пошта
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
            />
          </label>
          <label className="text-[12px] font-semibold text-muted">
            Лозинка
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
            />
          </label>
          {error && (
            <p className="rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger">
              Погрешна е-пошта или лозинка.
            </p>
          )}
          <button
            type="submit"
            className="mt-2 rounded-md bg-accent py-2.5 text-[13px] font-bold text-white hover:opacity-90"
          >
            Најави се
          </button>
        </form>
      </div>
    </div>
  );
}
