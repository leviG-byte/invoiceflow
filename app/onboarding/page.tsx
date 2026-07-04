"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Sparkles,
  Building2,
  Mail,
  Phone,
  MapPin,
  ImageIcon,
  Clock,
  Package,
  ArrowRight,
  ArrowLeft,
  Check,
  PartyPopper,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markProfileComplete } from "@/components/AppShell";

type InvoiceFormat = "hourly" | "fixed";

type Profile = {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  defaultItemType: InvoiceFormat;
};

const TOTAL_STEPS = 6; // 0 welcome … 5 finish

// Deterministic index hash (GLSL-style) so the confetti is varied but the
// render stays pure — no Math.random during render.
function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const CONFETTI_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#0ea5e9",
];

const CONFETTI_PIECES = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: hash(i + 1) * 100,
  delay: hash(i + 2) * 0.6,
  duration: 1.6 + hash(i + 3) * 1.4,
  rotate: hash(i + 4) * 360,
  color: CONFETTI_COLORS[i % 6],
  size: 6 + hash(i + 5) * 8,
}));

function Confetti() {
  const pieces = CONFETTI_PIECES;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -40, opacity: 0, rotate: 0 }}
          animate={{ y: "110vh", opacity: [0, 1, 1, 0], rotate: p.rotate }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeIn",
            repeat: Infinity,
            repeatDelay: 0.4,
          }}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            background: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export default function OnboardingPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [profile, setProfile] = useState<Profile>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
    defaultItemType: "hourly",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const logoPreview = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : ""),
    [logoFile]
  );

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  // Guard: if a profile already exists, this user does not belong here.
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("business_profile")
        .select("id, email")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;

      if (data) {
        markProfileComplete();
        router.replace("/dashboard");
      } else if (user.email) {
        // Pre-fill the contact email with their login email.
        setProfile((prev) => ({ ...prev, email: prev.email || user.email! }));
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, router]);

  function next() {
    setError("");
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }

  function back() {
    setError("");
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  function canAdvance() {
    if (step === 1) return profile.businessName.trim().length > 0;
    return true;
  }

  async function handleFinish() {
    setSaving(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Please sign in again.");
      setSaving(false);
      return;
    }

    let logoUrl = "";

    if (logoFile) {
      const ext = logoFile.name.split(".").pop() || "png";
      const fileName = `${user.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, logoFile, { upsert: true });

      if (uploadError) {
        console.error("Logo upload error:", uploadError);
        setError("We couldn't upload your logo. You can add it later in Settings.");
      } else {
        const { data: publicUrlData } = supabase.storage
          .from("logos")
          .getPublicUrl(fileName);
        logoUrl = publicUrlData.publicUrl;
      }
    }

    const { error: insertError } = await supabase
      .from("business_profile")
      .insert([
        {
          user_id: user.id,
          business_name: profile.businessName.trim(),
          email: profile.email.trim() || null,
          phone: profile.phone.trim() || null,
          address: profile.address.trim() || null,
          logo_url: logoUrl || null,
          default_item_type: profile.defaultItemType,
        },
      ]);

    if (insertError) {
      console.error("Onboarding save error:", insertError);
      setError(insertError.message || "Could not save your setup. Please try again.");
      setSaving(false);
      return;
    }

    markProfileComplete();
    next(); // reveal the celebration step

    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2600);
  }

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_60%,_#020617_100%)] px-6 py-10">
      {step === TOTAL_STEPS - 1 && <Confetti />}

      <div className="relative w-full max-w-lg">
        {/* Progress */}
        {step < TOTAL_STEPS - 1 && (
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <span>InvoiceFlow Setup</span>
              <span>
                Step {step + 1} of {TOTAL_STEPS - 1}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-white p-8 shadow-2xl sm:p-10">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -60 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {/* Step 0 — Welcome */}
              {step === 0 && (
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 12 }}
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950"
                  >
                    <Sparkles className="h-8 w-8 text-white" />
                  </motion.div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                    Welcome to InvoiceFlow
                  </h1>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
                    Let&apos;s set up your business in a few quick steps. This
                    info appears on every invoice and PDF you send — you can
                    change any of it later in Settings.
                  </p>
                </div>
              )}

              {/* Step 1 — Business name */}
              {step === 1 && (
                <div>
                  <StepHeader
                    icon={<Building2 className="h-6 w-6" />}
                    title="What's your business name?"
                    subtitle="This is the name your clients will see at the top of every invoice."
                  />
                  <input
                    autoFocus
                    value={profile.businessName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, businessName: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canAdvance()) next();
                    }}
                    placeholder="Haven & Hammer Services"
                    className={inputClass}
                  />
                </div>
              )}

              {/* Step 2 — Contact */}
              {step === 2 && (
                <div>
                  <StepHeader
                    icon={<Mail className="h-6 w-6" />}
                    title="How can clients reach you?"
                    subtitle="Optional, but it makes your invoices look complete and professional."
                  />
                  <div className="space-y-4">
                    <IconInput icon={<Mail className="h-4 w-4" />}>
                      <input
                        type="email"
                        value={profile.email}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, email: e.target.value }))
                        }
                        placeholder="Email address"
                        className={`${inputClass} pl-10`}
                      />
                    </IconInput>
                    <IconInput icon={<Phone className="h-4 w-4" />}>
                      <input
                        type="text"
                        value={profile.phone}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, phone: e.target.value }))
                        }
                        placeholder="Phone number"
                        className={`${inputClass} pl-10`}
                      />
                    </IconInput>
                    <IconInput icon={<MapPin className="h-4 w-4" />}>
                      <input
                        type="text"
                        value={profile.address}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, address: e.target.value }))
                        }
                        placeholder="Business address"
                        className={`${inputClass} pl-10`}
                      />
                    </IconInput>
                  </div>
                </div>
              )}

              {/* Step 3 — Logo */}
              {step === 3 && (
                <div>
                  <StepHeader
                    icon={<ImageIcon className="h-6 w-6" />}
                    title="Add your logo"
                    subtitle="Give your invoices a branded header. You can skip this and add one later."
                  />

                  <div className="flex flex-col items-center gap-5">
                    <div className="flex h-32 w-full items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
                      {logoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="max-h-24 max-w-[70%] object-contain"
                        />
                      ) : (
                        <p className="text-sm text-slate-400">
                          No logo selected yet
                        </p>
                      )}
                    </div>

                    <input
                      id="logo-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setLogoFile(e.target.files[0]);
                      }}
                    />
                    <label
                      htmlFor="logo-input"
                      className="cursor-pointer rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {logoFile ? "Choose a different file" : "Upload logo"}
                    </label>
                  </div>
                </div>
              )}

              {/* Step 4 — Invoice format */}
              {step === 4 && (
                <div>
                  <StepHeader
                    icon={<Package className="h-6 w-6" />}
                    title="How do you bill your clients?"
                    subtitle="We'll use this as the default for new invoice items. You can switch any item while creating an invoice."
                  />

                  <div className="grid gap-4">
                    <FormatCard
                      active={profile.defaultItemType === "hourly"}
                      onClick={() =>
                        setProfile((p) => ({ ...p, defaultItemType: "hourly" }))
                      }
                      icon={<Clock className="h-5 w-5" />}
                      title="Hourly billing"
                      description="Track a date, hours worked, and an hourly rate. Best for time-based work."
                    />
                    <FormatCard
                      active={profile.defaultItemType === "fixed"}
                      onClick={() =>
                        setProfile((p) => ({ ...p, defaultItemType: "fixed" }))
                      }
                      icon={<Package className="h-5 w-5" />}
                      title="Flat rate per item"
                      description="A description and a fixed price. Best for products, packages, and project pricing."
                    />
                  </div>
                </div>
              )}

              {/* Step 5 — Finish */}
              {step === 5 && (
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 10 }}
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500"
                  >
                    <PartyPopper className="h-8 w-8 text-white" />
                  </motion.div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                    You&apos;re all set!
                  </h1>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
                    {profile.businessName.trim() || "Your business"} is ready to
                    start invoicing. Taking you to your dashboard...
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Controls */}
          {step < TOTAL_STEPS - 1 && (
            <div className="mt-8 flex items-center justify-between gap-3">
              {step > 0 ? (
                <button
                  onClick={back}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <ArrowLeft size={16} /> Back
                </button>
              ) : (
                <span />
              )}

              {step === 0 && (
                <button
                  onClick={next}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Get started <ArrowRight size={16} />
                </button>
              )}

              {step >= 1 && step <= 3 && (
                <button
                  onClick={next}
                  disabled={!canAdvance()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {step === 2 || step === 3 ? "Continue" : "Next"}{" "}
                  <ArrowRight size={16} />
                </button>
              )}

              {step === 4 && (
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Setting up..." : "Finish setup"}{" "}
                  {!saving && <Check size={16} />}
                </button>
              )}
            </div>
          )}

          {/* Skip contact / logo steps */}
          {(step === 2 || step === 3) && (
            <div className="mt-4 text-center">
              <button
                onClick={next}
                className="text-sm font-medium text-slate-400 transition hover:text-slate-600"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        {icon}
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
    </div>
  );
}

function IconInput({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
        {icon}
      </span>
      {children}
    </div>
  );
}

function FormatCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition ${
        active
          ? "border-blue-500 bg-blue-50 ring-4 ring-blue-100"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
    </button>
  );
}
