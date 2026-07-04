"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("invoiceflow-theme", theme);
  } catch {
    // ignore storage failures
  }
}

export default function ThemeToggle() {
  // Lazy initializer runs on the client during hydration, reading the class
  // the no-flash script already set — so no state-updating effect is needed.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
    ) {
      return "dark";
    }
    return "light";
  });

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white"
    >
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
