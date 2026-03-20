"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";

type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  rate?: string;
  defaultPaymentMethod?: string;
  defaultPaymentNotes?: string;
};

type DatabaseClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  rate: number | string | null;
  default_payment_method: string | null;
  default_payment_notes: string | null;
};

export default function ClientsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("");
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState("");
  const [defaultPaymentNotes, setDefaultPaymentNotes] = useState("");

  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  function mapDatabaseClientToUI(client: DatabaseClient): Client {
    return {
      id: client.id,
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      rate:
        client.rate !== null && client.rate !== undefined
          ? String(client.rate)
          : "",
      defaultPaymentMethod: client.default_payment_method || "",
      defaultPaymentNotes: client.default_payment_notes || "",
    };
  }

  async function loadClients() {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMessage("Could not load clients.");
      setIsLoading(false);
      return;
    }

    const formattedClients = ((data as DatabaseClient[]) || []).map(
      mapDatabaseClientToUI
    );

    setClients(formattedClients);
    setIsLoading(false);
  }

  useEffect(() => {
    loadClients();
  }, []);

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setRate("");
    setDefaultPaymentMethod("");
    setDefaultPaymentNotes("");
    setEditingClientId(null);
    setShowForm(false);
  }

  async function handleSaveClient() {
    if (!name.trim()) {
      setMessage("Client name is required.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    if (editingClientId) {
      const { error } = await supabase
        .from("clients")
        .update({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          rate: rate.trim() ? Number(rate) : 0,
          default_payment_method: defaultPaymentMethod.trim() || null,
          default_payment_notes: defaultPaymentNotes.trim() || null,
        })
        .eq("id", editingClientId);

      if (error) {
        console.error(error);
        setMessage("Could not update client.");
        setIsSaving(false);
        return;
      }

      setMessage("Client updated successfully.");
      await loadClients();
      resetForm();
      setIsSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in to save a client.");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase.from("clients").insert([
      {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        rate: rate.trim() ? Number(rate) : 0,
        default_payment_method: defaultPaymentMethod.trim() || null,
        default_payment_notes: defaultPaymentNotes.trim() || null,
        user_id: user.id,
      },
    ]);

    if (error) {
      console.error(error);
      setMessage("Could not save client.");
      setIsSaving(false);
      return;
    }

    setMessage("Client saved successfully.");
    await loadClients();
    resetForm();
    setIsSaving(false);
  }

  function handleEditClient(client: Client) {
    setEditingClientId(client.id);
    setName(client.name);
    setEmail(client.email || "");
    setPhone(client.phone || "");
    setRate(client.rate || "");
    setDefaultPaymentMethod(client.defaultPaymentMethod || "");
    setDefaultPaymentNotes(client.defaultPaymentNotes || "");
    setShowForm(true);
    setMessage("");
  }

  async function handleDeleteClient(clientId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this client?"
    );

    if (!confirmed) return;

    const { error } = await supabase.from("clients").delete().eq("id", clientId);

    if (error) {
      console.error(error);
      setMessage("Could not delete client.");
      return;
    }

    if (editingClientId === clientId) {
      resetForm();
    }

    setMessage("Client deleted successfully.");
    await loadClients();
  }

  const clientsWithEmail = clients.filter((client) => client.email).length;
  const clientsWithRate = clients.filter((client) => client.rate).length;
  const averageRate =
    clientsWithRate > 0
      ? clients.reduce((sum, client) => sum + (Number(client.rate) || 0), 0) /
        clientsWithRate
      : 0;

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
                Clients
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Manage client records, contact details, hourly rates, and default
                payment instructions from one clean workspace.
              </p>
            </div>

            <button
              onClick={() => {
                if (showForm) {
                  resetForm();
                } else {
                  setShowForm(true);
                  setEditingClientId(null);
                  setMessage("");
                }
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              {showForm ? "Cancel" : "+ Add Client"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 bg-white px-5 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Total Clients</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {clients.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">With Email</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {clientsWithEmail}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">With Rate</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {clientsWithRate}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Average Rate</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              ${averageRate.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingClientId ? "Edit Client" : "New Client"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Save the client’s contact information, billing rate, and payment
                defaults.
              </p>
            </div>

            {editingClientId && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                Editing existing client
              </div>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Client Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Microsoft"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Hourly Rate
              </label>
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="30"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="client@email.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="123-456-7890"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Default Payment Method
              </label>
              <input
                type="text"
                value={defaultPaymentMethod}
                onChange={(e) => setDefaultPaymentMethod(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Zelle, Bank Transfer, Cash, PayPal"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Default Payment Notes
              </label>
              <textarea
                value={defaultPaymentNotes}
                onChange={(e) => setDefaultPaymentNotes(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Bank: Chase | Zelle: email@email.com | Due in 7 days"
                rows={4}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleSaveClient}
              disabled={isSaving}
              className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving
                ? "Saving..."
                : editingClientId
                ? "Update Client"
                : "Save Client"}
            </button>

            <button
              onClick={resetForm}
              type="button"
              className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">{message}</p>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">Loading clients...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-900">
            No clients saved yet
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Add your first client to start creating faster invoices with saved
            payment defaults.
          </p>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingClientId(null);
              setMessage("");
            }}
            className="mt-4 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Add Client
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {clients.map((client) => (
            <div
              key={client.id}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
                      {client.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <p className="break-words text-xl font-semibold text-slate-900">
                        {client.name}
                      </p>

                      <p className="mt-1 text-sm font-medium text-slate-500">
                        {client.rate ? `$${client.rate}/hr` : "No rate set"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1">
                    {client.email && (
                      <p className="break-words text-sm text-slate-700">
                        {client.email}
                      </p>
                    )}

                    {client.phone && (
                      <p className="text-sm text-slate-700">{client.phone}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 sm:flex-col sm:items-end">
                  <button
                    onClick={() => handleEditClient(client)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDeleteClient(client.id)}
                    className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {(client.defaultPaymentMethod || client.defaultPaymentNotes) && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  {client.defaultPaymentMethod && (
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">
                        Payment Method:
                      </span>{" "}
                      {client.defaultPaymentMethod}
                    </p>
                  )}

                  {client.defaultPaymentNotes && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">
                        Payment Notes:
                      </span>{" "}
                      {client.defaultPaymentNotes}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}