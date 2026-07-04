"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { Mail, Lock } from "lucide-react";

function validatePassword(password: string): string {
  if (password.length < 8) return "Password must be at least 8 characters long.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return "";
}

const fieldClass =
  "w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export default function AccountSettings() {
  const supabase = useState(() => createClient())[0];
  const { toast } = useToast();

  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (active && user?.email) setCurrentEmail(user.email);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleChangeEmail() {
    const email = newEmail.trim();
    if (!/\S+@\S+\.\S+/.test(email)) {
      toast("Please enter a valid email address.", "error");
      return;
    }
    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      toast("That's already your email address.", "error");
      return;
    }

    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email });
    setSavingEmail(false);

    if (error) {
      toast(error.message || "Could not update email.", "error");
      return;
    }

    setNewEmail("");
    toast(
      "Check both your old and new inboxes to confirm the email change.",
      "success"
    );
  }

  async function handleChangePassword() {
    const validationError = validatePassword(password);
    if (validationError) {
      toast(validationError, "error");
      return;
    }
    if (password !== confirm) {
      toast("Passwords do not match.", "error");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);

    if (error) {
      toast(error.message || "Could not update password.", "error");
      return;
    }

    setPassword("");
    setConfirm("");
    toast("Your password has been updated.", "success");
  }

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Account & Security</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Manage the email and password you use to sign in.
      </p>

      {/* Change email */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <Mail size={16} className="text-slate-500 dark:text-slate-400" /> Email address
        </div>
        {currentEmail && (
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Current: <span className="font-medium text-slate-700 dark:text-slate-300">{currentEmail}</span>
          </p>
        )}
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="New email address"
          className={fieldClass}
        />
        <button
          onClick={handleChangeEmail}
          disabled={savingEmail || !newEmail.trim()}
          className="mt-3 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingEmail ? "Sending..." : "Update email"}
        </button>
      </div>

      <div className="my-6 border-t border-slate-100 dark:border-slate-800" />

      {/* Change password */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <Lock size={16} className="text-slate-500 dark:text-slate-400" /> Password
        </div>
        <div className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (8+ chars, letters & numbers)"
            autoComplete="new-password"
            className={fieldClass}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            className={fieldClass}
          />
        </div>
        <button
          onClick={handleChangePassword}
          disabled={savingPassword || !password || !confirm}
          className="mt-3 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingPassword ? "Updating..." : "Update password"}
        </button>
      </div>
    </div>
  );
}
