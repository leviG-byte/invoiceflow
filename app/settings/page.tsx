"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";

type BusinessProfile = {
  id?: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string;
};

type DatabaseBusinessProfile = {
  id: string;
  user_id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
};

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: "",
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBusinessProfile() {
      setIsLoading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("Load user error:", userError);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("business_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Load business profile error:", error);
        setMessage(error.message || "Could not load business profile.");
        setIsLoading(false);
        return;
      }

      if (data) {
        const profile = data as DatabaseBusinessProfile;

        setBusinessProfile({
          id: profile.id,
          businessName: profile.business_name || "",
          email: profile.email || "",
          phone: profile.phone || "",
          address: profile.address || "",
          logoUrl: profile.logo_url || "",
        });
      }

      setIsLoading(false);
    }

    loadBusinessProfile();
  }, [supabase]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [logoFile]);

  async function handleSaveProfile() {
    setIsSaving(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Save user error:", userError);
      setMessage("User not authenticated.");
      setIsSaving(false);
      return;
    }

    let logoUrl = businessProfile.logoUrl || "";

    if (logoFile) {
      setIsUploadingLogo(true);

      const fileExt = logoFile.name.split(".").pop() || "png";
      const fileName = `${user.id}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, logoFile, {
          upsert: true,
        });

      setIsUploadingLogo(false);

      if (uploadError) {
        console.error("Logo upload error:", uploadError);
        setMessage(uploadError.message || "Error uploading logo.");
        setIsSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("logos")
        .getPublicUrl(fileName);

      logoUrl = publicUrlData.publicUrl;

      console.log("Generated logo public URL:", logoUrl);
    }

    if (businessProfile.id) {
      const { error } = await supabase
        .from("business_profile")
        .update({
          business_name: businessProfile.businessName,
          email: businessProfile.email,
          phone: businessProfile.phone,
          address: businessProfile.address,
          logo_url: logoUrl,
        })
        .eq("id", businessProfile.id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Update business profile error:", error);
        setMessage(error.message || "Could not update profile.");
        setIsSaving(false);
        return;
      }

      setBusinessProfile((prev) => ({
        ...prev,
        logoUrl,
      }));

      setLogoFile(null);
      setLogoPreviewUrl("");
      setMessage("Business profile updated.");
      setIsSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("business_profile")
      .insert([
        {
          user_id: user.id,
          business_name: businessProfile.businessName,
          email: businessProfile.email,
          phone: businessProfile.phone,
          address: businessProfile.address,
          logo_url: logoUrl,
        },
      ])
      .select("id")
      .single();

    if (error) {
      console.error("Insert business profile error:", error);
      setMessage(error.message || "Could not save profile.");
      setIsSaving(false);
      return;
    }

    setBusinessProfile((prev) => ({
      ...prev,
      id: data.id,
      logoUrl,
    }));

    setLogoFile(null);
    setLogoPreviewUrl("");
    setMessage("Business profile saved.");
    setIsSaving(false);
  }

  const displayedLogo = logoPreviewUrl || businessProfile.logoUrl || "";

  const profileCompletionCount = [
    businessProfile.businessName,
    businessProfile.email,
    businessProfile.phone,
    businessProfile.address,
    displayedLogo,
  ].filter((value) => String(value).trim() !== "").length;

  const profileCompletion = Math.round((profileCompletionCount / 5) * 100);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                InvoiceFlow
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                Settings
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Manage your business identity, contact details, and logo used across
                your invoices and PDF documents.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                Profile completion:{" "}
                <span className="font-semibold text-white">{profileCompletion}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 bg-white px-5 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Business Name</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {businessProfile.businessName || "Not set"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Email</p>
            <p className="mt-2 text-lg font-bold text-slate-950 break-words">
              {businessProfile.email || "Not set"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Phone</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {businessProfile.phone || "Not set"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Logo</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {displayedLogo ? "Uploaded" : "Not set"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {isLoading ? (
            <p className="text-slate-600">Loading...</p>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900">
                  Business Profile
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  This information appears across your app and can be used in your
                  invoices and exported PDFs.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">
                    Business Name
                  </label>
                  <input
                    placeholder="Business Name"
                    value={businessProfile.businessName}
                    onChange={(e) =>
                      setBusinessProfile((prev) => ({
                        ...prev,
                        businessName: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">
                    Email
                  </label>
                  <input
                    placeholder="Email"
                    value={businessProfile.email}
                    onChange={(e) =>
                      setBusinessProfile((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">
                    Phone
                  </label>
                  <input
                    placeholder="Phone"
                    value={businessProfile.phone}
                    onChange={(e) =>
                      setBusinessProfile((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">
                    Address
                  </label>
                  <input
                    placeholder="Address"
                    value={businessProfile.address}
                    onChange={(e) =>
                      setBusinessProfile((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Business Logo
                </label>

                <p className="mb-4 text-sm text-slate-500">
                  Upload a logo to strengthen your brand identity on invoices and
                  PDF exports.
                </p>

                <div className="flex flex-wrap items-center gap-4">
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setLogoFile(e.target.files[0]);
                        setMessage("");
                      }
                    }}
                  />

                  <label
                    htmlFor="logo-upload"
                    className="cursor-pointer rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Upload Logo
                  </label>

                  <span className="break-words text-sm text-slate-600">
                    {logoFile ? logoFile.name : "No file selected"}
                  </span>
                </div>

                {isUploadingLogo && (
                  <div className="mt-5 max-w-md">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                      <span>Uploading logo...</span>
                      <span>Please wait</span>
                    </div>

                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving || isUploadingLogo}
                  className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </>
          )}

          {message && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-700">{message}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Logo Preview</h2>
            <p className="mt-1 text-sm text-slate-500">
              This is how your uploaded logo will appear inside the app.
            </p>

            {displayedLogo ? (
              <div className="mt-5 flex min-h-[180px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <img
                  src={displayedLogo}
                  alt="Logo Preview"
                  className="max-h-28 max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="mt-5 flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    No logo uploaded yet
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Upload a logo to preview your business branding here.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Branding Tips</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>Use your official business name for a more professional invoice header.</p>
              <p>Keep your logo simple and readable on both desktop and PDF versions.</p>
              <p>Add a clear email and phone number so clients can contact you easily.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}