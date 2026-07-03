"use client";

import { useState, ChangeEvent, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Ripple,
  AnimatedForm,
  TechOrbitDisplay,
} from "@/components/ui/modern-animated-sign-in";
import {
  FileText,
  DollarSign,
  CreditCard,
  Receipt,
  PieChart,
  Users,
  TrendingUp,
  Wallet,
} from "lucide-react";

type FormData = {
  email: string;
  password: string;
};

interface OrbitIcon {
  component: () => ReactNode;
  className: string;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
  reverse?: boolean;
}

const iconsArray: OrbitIcon[] = [
  {
    component: () => <Receipt className="size-full text-slate-700" />,
    className: "size-[34px] border-none bg-transparent",
    duration: 20,
    delay: 20,
    radius: 100,
    path: false,
    reverse: false,
  },
  {
    component: () => <DollarSign className="size-full text-emerald-600" />,
    className: "size-[34px] border-none bg-transparent",
    duration: 20,
    delay: 10,
    radius: 100,
    path: false,
    reverse: false,
  },
  {
    component: () => <FileText className="size-full text-blue-600" />,
    className: "size-[44px] border-none bg-transparent",
    radius: 165,
    duration: 20,
    delay: 5,
    path: false,
    reverse: true,
  },
  {
    component: () => <CreditCard className="size-full text-slate-700" />,
    className: "size-[44px] border-none bg-transparent",
    radius: 165,
    duration: 20,
    delay: 15,
    path: false,
    reverse: true,
  },
  {
    component: () => <PieChart className="size-full text-violet-600" />,
    className: "size-[48px] border-none bg-transparent",
    radius: 230,
    duration: 20,
    delay: 2,
    path: false,
    reverse: false,
  },
  {
    component: () => <Users className="size-full text-slate-700" />,
    className: "size-[48px] border-none bg-transparent",
    radius: 230,
    duration: 20,
    delay: 12,
    path: false,
    reverse: false,
  },
  {
    component: () => <TrendingUp className="size-full text-emerald-600" />,
    className: "size-[52px] border-none bg-transparent",
    radius: 295,
    duration: 20,
    delay: 7,
    path: false,
    reverse: true,
  },
  {
    component: () => <Wallet className="size-full text-blue-600" />,
    className: "size-[52px] border-none bg-transparent",
    radius: 295,
    duration: 20,
    delay: 17,
    path: false,
    reverse: true,
  },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>,
    name: keyof FormData
  ) => {
    const value = event.target.value;

    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    // Read from the form element rather than state so browser autofill
    // (which doesn't always fire React onChange) still works.
    const form = event.target as HTMLFormElement;
    const email =
      (form.Email as HTMLInputElement)?.value || formData.email;
    const password =
      (form.Password as HTMLInputElement)?.value || formData.password;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const formFields = {
    header: "Welcome back",
    subHeader: "Sign in to manage invoices, clients, and settings.",
    fields: [
      {
        label: "Email",
        required: true,
        type: "email" as const,
        placeholder: "you@example.com",
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          handleInputChange(event, "email"),
      },
      {
        label: "Password",
        required: true,
        type: "password" as const,
        placeholder: "Enter your password",
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          handleInputChange(event, "password"),
      },
    ],
    submitButton: loading ? "Signing in..." : "Sign in",
    textVariantButton: "Forgot password?",
  };

  const goToForgotPassword = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    router.push("/forgot-password");
  };

  return (
    <section className="flex max-lg:justify-center">
      {/* Left side — animated orbit display */}
      <span className="flex flex-col justify-center w-1/2 max-lg:hidden">
        <Ripple mainCircleSize={100} />
        <TechOrbitDisplay iconsArray={iconsArray} text="InvoiceFlow" />
      </span>

      {/* Right side — sign-in form */}
      <span className="w-1/2 h-[100dvh] flex flex-col justify-center items-center max-lg:w-full max-lg:px-[10%]">
        <AnimatedForm
          {...formFields}
          errorField={error}
          isSubmitting={loading}
          onSubmit={handleSubmit}
          goTo={goToForgotPassword}
        />
      </span>
    </section>
  );
}
