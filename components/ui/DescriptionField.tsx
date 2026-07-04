"use client";

import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";

type DescriptionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

/**
 * Multi-line description input with an expand button that opens a large
 * modal editor for longer text.
 */
export default function DescriptionField({
  value,
  onChange,
  placeholder = "Description",
  label = "Description",
}: DescriptionFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function openEditor() {
    setDraft(value);
    setIsOpen(true);
  }

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  function saveDraft() {
    onChange(draft);
    setIsOpen(false);
  }

  return (
    <>
      <div className="relative min-w-0">
        <textarea
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 resize-y rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 pr-11 text-slate-900 dark:text-slate-100 placeholder-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />

        <button
          type="button"
          onClick={openEditor}
          aria-label="Open large editor"
          title="Open large editor"
          className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Maximize2 size={15} />
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${label.toLowerCase()}`}
        >
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{label}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Write as much detail as you need — it will appear on the invoice
              and the PDF.
            </p>

            <textarea
              autoFocus
              rows={10}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-4 w-full resize-y rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 placeholder-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-2xl border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveDraft}
                className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Save Description
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
