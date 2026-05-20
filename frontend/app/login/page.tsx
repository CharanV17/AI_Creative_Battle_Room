"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { apiRequest } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "player">("player");
  const [error, setError] = useState<string | null>(null);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("All fields required");
      return;
    }
    try {
      const result = await apiRequest<{ token: string }>("/auth/register", {
        method: "POST",
        body: { email, password, role }
      });
      localStorage.setItem("battle_token", result.token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Email and password required");
      return;
    }
    try {
      const result = await apiRequest<{ token: string }>("/auth/login", {
        method: "POST",
        body: { email, password }
      });
      localStorage.setItem("battle_token", result.token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-20">
      <section className="rounded-lg border border-slate-700 p-6">
        <h1 className="mb-4 text-2xl font-bold">Sign in or Register</h1>
        <form className="grid gap-3">
          <input className="rounded bg-slate-900 p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input className="rounded bg-slate-900 p-2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          <select className="rounded bg-slate-900 p-2" value={role} onChange={(e) => setRole(e.target.value as "admin" | "player")}>
            <option value="player">Player</option>
            <option value="admin">Admin</option>
          </select>
          <div className="flex gap-2">
            <button className="flex-1 rounded bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-700" type="button" onClick={onRegister}>
              Register
            </button>
            <button className="flex-1 rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700" type="button" onClick={onLogin}>
              Login
            </button>
          </div>
        </form>
        {error ? <p className="mt-3 rounded bg-red-950 p-3 text-red-200">{error}</p> : null}
      </section>
    </main>
  );
}
