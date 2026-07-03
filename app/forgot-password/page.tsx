"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  BoxReveal,
  Input,
  Label,
  BottomGradient,
} from "@/components/ui/modern-animated-sign-in";
import { ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const form = event.target as HTMLFormElement;
    const email = (form.Email as HTMLInputElement)?.value.trim() || "";

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    // Always show the same confirmation regardless of whether the account
    // exists, so this page can't be used to probe for registered emails.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <section className="w-full max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
              <MailCheck className="h-7 w-7 text-emerald-600" />
            </div>

            <h1 className="text-2xl font-bold text-neutral-800">
              Check your email
            </h1>
            <p className="max-w-sm text-sm leading-6 text-neutral-600">
              If an account exists for that address, we sent a link to reset
              your password. The link expires after a short time — if it does,
              you can request a new one.
            </p>

            <Link
              href="/login"
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-blue-500"
            >
              <ArrowLeft size={15} /> Back to sign in
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
              <h1 className="text-3xl font-bold text-neutral-800">
                Forgot your password?
              </h1>
            </BoxReveal>

            <BoxReveal boxColor="var(--skeleton)" duration={0.3} className="pb-2">
              <p className="max-w-sm text-sm text-neutral-600">
                Enter the email you use to sign in and we&apos;ll send you a
                secure link to reset your password.
              </p>
            </BoxReveal>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
                  <Label htmlFor="Email">
                    Email <span className="text-red-500">*</span>
                  </Label>
                </BoxReveal>

                <BoxReveal width="100%" boxColor="var(--skeleton)" duration={0.3}>
                  <Input
                    id="Email"
                    name="Email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </BoxReveal>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <BoxReveal
                width="100%"
                boxColor="var(--skeleton)"
                duration={0.3}
                overflow="visible"
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-slate-950 relative group/btn block w-full text-white rounded-md h-10 font-medium shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] outline-none hover:cursor-pointer transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "Sending..." : "Send reset link"} &rarr;
                  <BottomGradient />
                </button>
              </BoxReveal>

              <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm font-medium text-blue-500"
                >
                  <ArrowLeft size={15} /> Back to sign in
                </Link>
              </BoxReveal>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
