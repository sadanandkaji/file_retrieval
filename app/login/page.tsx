"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
            Policy Index
          </p>
          <h1 className="mt-1 text-2xl font-serif text-[#1B2430]">Sign in to continue</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-[#1B2430]/10 rounded-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1B2430] text-[#FDFCF9] text-sm font-medium py-2.5 rounded-sm hover:bg-[#2A3648] transition-colors disabled:opacity-40"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-[#1B2430]/40 mt-6">
          Accounts are created by an administrator. Contact yours if you need access.
        </p>
      </div>
    </div>
  );
}
