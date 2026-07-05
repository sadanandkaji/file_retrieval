"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { ChatSummary, CurrentUser } from "./sidebar";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  createdAt: string;
};

type PendingDoc = {
  id: string;
  name: string;
  chunkCount: number;
  status: string;
  createdAt: string;
};

export default function AdminUsersClient({ initialUser }: { initialUser: CurrentUser }) {
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [tableError, setTableError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --- Document transfer modal state ---
  // Opens automatically when a delete attempt is blocked (409, has_documents).
  const [transferUser, setTransferUser] = useState<UserRow | null>(null);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [user] = useState<CurrentUser | null>(initialUser);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
  }

  async function loadChats() {
    const res = await fetch("/api/chats");
    const data = await res.json();
    setChats(data.chats ?? []);
  }

  useEffect(() => {
    loadUsers();
    loadChats();
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

  // Attempts to delete a user. If blocked because they still own documents,
  // opens the transfer modal instead of just showing an error.
  async function attemptDelete(id: string) {
    setTableError("");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });

      if (res.ok) {
        await loadUsers();
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.reason === "has_documents") {
        await openTransferModal(id);
        return;
      }

      setTableError(data.error ?? "Failed to remove user");
    } catch {
      setTableError("Failed to remove user. Check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this user's access? Their chat history will be deleted too.")) return;
    await attemptDelete(id);
  }

  async function openTransferModal(userId: string) {
    const target = users.find((u) => u.id === userId) ?? null;
    setTransferUser(target);
    setTransferError("");
    setTransferTargetId("");
    setLoadingDocs(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/documents`);
      const data = await res.json();
      setPendingDocs(data.documents ?? []);
    } catch {
      setPendingDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  function closeTransferModal() {
    setTransferUser(null);
    setPendingDocs([]);
    setTransferTargetId("");
    setTransferError("");
  }

  async function handleConfirmTransfer() {
    if (!transferUser) return;
    if (!transferTargetId) {
      setTransferError("Choose who these documents should belong to.");
      return;
    }

    setTransferring(true);
    setTransferError("");

    try {
      const transferRes = await fetch(`/api/admin/users/${transferUser.id}/transfer-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: transferTargetId }),
      });

      if (!transferRes.ok) {
        const data = await transferRes.json().catch(() => ({}));
        setTransferError(data.error ?? "Failed to transfer documents");
        setTransferring(false);
        return;
      }

      // Documents are clear now — retry the delete.
      const deleteRes = await fetch(`/api/admin/users/${transferUser.id}`, { method: "DELETE" });

      if (!deleteRes.ok) {
        const data = await deleteRes.json().catch(() => ({}));
        setTransferError(data.error ?? "Documents transferred, but removing the user still failed.");
        setTransferring(false);
        return;
      }

      setTransferring(false);
      closeTransferModal();
      await loadUsers();
    } catch {
      setTransferError("Something went wrong. Check your connection and try again.");
      setTransferring(false);
    }
  }

  async function handleNewChat() {
    try {
      const res = await fetch("/api/chats", { method: "POST" });
      if (!res.ok) {
        console.error("Failed to create chat:", res.status);
        return;
      }
      const data = await res.json();
      if (data?.id) router.push(`/chat/${data.id}`);
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  }

  function handleSelectChat(id: string) {
    router.push(`/chat/${id}`);
  }

  const transferCandidates = users.filter((u) => u.id !== transferUser?.id);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        chats={chats}
        activeChatId={null}
        isOpen={sidebarOpen}
        user={user}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />

      <div className="flex-1 min-h-screen bg-[#F7F5F0] px-4 py-6 sm:px-10 sm:py-10">
        <p className="text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
          Administration
        </p>
        <h1 className="mt-1 text-xl sm:text-2xl font-serif text-[#1B2430] mb-6 sm:mb-8">Manage users</h1>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 lg:gap-8">
          <form onSubmit={handleAddUser} className="bg-white border border-[#1B2430]/10 rounded-sm p-5 sm:p-6 space-y-4 h-fit">
            <h2 className="text-sm font-medium">Add a new user</h2>

            <div>
              <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Full name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-3 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-3 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
                inputMode="email"
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
                className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-3 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}
                className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-3 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#1B2430] text-[#FDFCF9] text-sm font-medium py-3 rounded-sm hover:bg-[#2A3648] transition-colors disabled:opacity-40"
            >
              {saving ? "Adding…" : "Add user"}
            </button>
          </form>

          <div className="h-fit">
            {tableError && (
              <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm px-4 py-2">
                {tableError}
              </p>
            )}

            <div className="bg-white border border-[#1B2430]/10 rounded-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
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
                          disabled={deletingId === u.id}
                          className={
                            "text-xs " +
                            (deletingId === u.id
                              ? "text-[#1B2430]/40 cursor-not-allowed"
                              : "text-red-600 hover:underline")
                          }
                        >
                          {deletingId === u.id ? "Removing…" : "Remove"}
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
      </div>

      {/* Transfer-documents modal — shown when deletion is blocked */}
      {transferUser && (
        <div className="fixed inset-0 bg-[#1B2430]/40 flex items-center justify-center z-50 px-3 sm:px-4">
          <div className="bg-white rounded-sm max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-base sm:text-lg font-serif text-[#1B2430]">
                Transfer {transferUser.name}&apos;s documents
              </h3>
              <p className="mt-1 text-sm text-[#1B2430]/60 leading-relaxed">
                This account still owns uploaded documents. Choose who should take
                ownership of them before removing the account. Their chat history
                will be deleted along with the account either way.
              </p>
            </div>

            {loadingDocs ? (
              <p className="text-sm text-[#1B2430]/50">Loading documents…</p>
            ) : (
              <div className="max-h-40 overflow-y-auto border border-[#1B2430]/10 rounded-sm divide-y divide-[#1B2430]/10">
                {pendingDocs.map((d) => (
                  <div key={d.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <span className="truncate">{d.name}</span>
                    <span className="text-xs text-[#1B2430]/40 shrink-0">
                      {d.chunkCount} sections
                    </span>
                  </div>
                ))}
                {pendingDocs.length === 0 && (
                  <p className="px-3 py-2 text-sm text-[#1B2430]/40">No documents found.</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#1B2430]/60 mb-1">
                Transfer to
              </label>
              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                className="w-full border border-[#1B2430]/15 rounded-sm px-3 py-3 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
              >
                <option value="">Select a user…</option>
                {transferCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {transferError && <p className="text-xs text-red-600">{transferError}</p>}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2">
              <button
                onClick={closeTransferModal}
                disabled={transferring}
                className="text-sm px-4 py-2.5 sm:py-2 rounded-sm border border-[#1B2430]/15 text-[#1B2430]/70 hover:bg-[#1B2430]/5 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTransfer}
                disabled={transferring || pendingDocs.length === 0}
                className="text-sm px-4 py-2.5 sm:py-2 rounded-sm bg-[#1B2430] text-[#FDFCF9] hover:bg-[#2A3648] transition-colors disabled:opacity-40"
              >
                {transferring ? "Transferring…" : "Transfer & remove account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}