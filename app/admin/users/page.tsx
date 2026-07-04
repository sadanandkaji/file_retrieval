"use client";

import { useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  createdAt: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to create user");
      setSaving(false);
      return;
    }

    setName("");
    setEmail("");
    setPassword("");
    setRole("USER");
    setSaving(false);
    loadUsers();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this user's access?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    loadUsers();
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] px-10 py-10">
      <p className="text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
        Administration
      </p>
      <h1 className="mt-1 text-2xl font-serif text-[#1B2430] mb-8">Manage users</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
        <form onSubmit={handleAddUser} className="bg-white border border-[#1B2430]/10 rounded-sm p-6 space-y-4 h-fit">
          <h2 className="text-sm font-medium">Add a new user</h2>

          <div>
            <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Full name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Temporary password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}
              className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#1B2430] text-[#FDFCF9] text-sm font-medium py-2.5 rounded-sm hover:bg-[#2A3648] transition-colors disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add user"}
          </button>
        </form>

        <div className="bg-white border border-[#1B2430]/10 rounded-sm overflow-hidden h-fit">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F5F0] text-[#1B2430]/60 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#1B2430]/10">
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3 text-[#1B2430]/70">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.role === "ADMIN"
                          ? "text-xs px-2 py-0.5 rounded-sm bg-[#8A7A5C]/15 text-[#8A7A5C]"
                          : "text-xs px-2 py-0.5 rounded-sm bg-[#1B2430]/5 text-[#1B2430]/60"
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#1B2430]/50">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#1B2430]/40">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
