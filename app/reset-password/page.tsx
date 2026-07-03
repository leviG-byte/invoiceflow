"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BoxReveal,
  Input,
  Label,
  BottomGradient,
} from "@/components/ui/modern-animated-sign-in";
import { ArrowLeft, ShieldCheck } from "lucide-react";

type LinkState = "checking" | "ready" | "invalid";

function validatePassword(password: string): string {
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return "";
}

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The Supabase browser client exchanges the recovery code from the URL
    // automatically; poll briefly for the resulting session instead of
    // assuming it is ready on first render.
    let cancelled = false;
    let attempts = 0;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (session) {
        setLinkState("ready");
        return;
      }

      attempts += 1;
      if (attempts >= 6) {
        setLinkState("invalid");
        return;
      }

      setTimeout(checkSession, 500);
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const form = event.target as HTMLFormElement;
    const password = (form.NewPassword as HTMLInputElement)?.value || "";
    const confirm = (form.ConfirmPassword as HTMLInputElement)?.value || "";

    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1800);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <section className="w-full max-w-md">
        {linkState === "checking" && (
          <p className="text-center text-sm text-neutral-500">
            Verifying your reset link...
          </p>
        )}

        {linkState === "invalid" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-bold text-neutral-800">
              Link expired or invalid
            </h1>
            <p className="max-w-sm text-sm leading-6 text-neutral-600">
              Password reset links only work once and expire quickly for your
              security. Request a new one and try again.
            </p>
            <Link
              href="/forgot-password"
              className="rounded-md bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Request new link
            </Link>
          </div>
        )}

        {linkState === "ready" && done && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
              <ShieldCheck className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-800">
              Password updated
            </h1>
            <p className="text-sm text-neutral-600">
              Taking you to your dashboard...
            </p>
          </div>
        )}

        {linkState === "ready" && !done && (
          <div className="flex flex-col gap-4">
            <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
              <h1 className="text-3xl font-bold text-neutral-800">
                Set a new password
              </h1>
            </BoxReveal>

            <BoxReveal boxColor="var(--skeleton)" duration={0.3} className="pb-2">
              <p className="max-w-sm text-sm text-neutral-600">
                Use at least 8 characters with a mix of letters and numbers.
              </p>
            </BoxReveal>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="NewPassword">
                  New password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="NewPassword"
                  name="NewPassword"
                  type="password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="ConfirmPassword">
                  Confirm password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="ConfirmPassword"
                  name="ConfirmPassword"
                  type="password"
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="bg-slate-950 relative group/btn block w-full text-white rounded-md h-10 font-medium shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] outline-none hover:cursor-pointer transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Updating..." : "Update password"} &rarr;
                <BottomGradient />
              </button>

              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-500"
              >
                <ArrowLeft size={15} /> Back to sign in
              </Link>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
