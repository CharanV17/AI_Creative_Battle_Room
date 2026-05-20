"use client";

import { FormEvent, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { apiRequest } from "../lib/api";

type User = {
  id: number;
  email: string;
  role: "admin" | "player";
};

type RoomParticipant = {
  user_id: number;
  display_name: string;
  role: "host" | "participant";
  is_eliminated: boolean;
};

type Room = {
  code: string;
  challenge_prompt: string;
  host_user_id: number;
  status: string;
  participants: RoomParticipant[];
};

export default function HomePage() {
  const [email, setEmail] = useState("host@example.com");
  const [password, setPassword] = useState("password123");
  const [role, setRole] = useState<"admin" | "player">("player");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [challengePrompt, setChallengePrompt] = useState(
    "Create the most insane luxury cyberpunk perfume campaign for Gen-Z."
  );
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<"checking" | "ok" | "down">("checking");
  const router = useRouter();

  useEffect(() => {
    // Check backend health
    const checkHealth = async () => {
      try {
        await apiRequest<{ status: string }>("/health");
        setBackendHealth("ok");
      } catch {
        setBackendHealth("down");
      }
    };
    checkHealth();

    // Restore session token or redirect to /login
    const savedToken = localStorage.getItem("battle_token");
    if (!savedToken) {
      router.push("/login");
      return;
    }

    setToken(savedToken);
    apiRequest<User>("/auth/me", { token: savedToken })
      .then((me) => {
        setUser(me);
      })
      .catch(() => {
        localStorage.removeItem("battle_token");
        setToken(null);
        router.push("/login");
      });
  }, []);

  const participantLabel = useMemo(() => {
    if (!room || !user) return "";
    const me = room.participants.find((p) => p.user_id === user.id);
    return me ? me.role : "-";
  }, [room, user]);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("All fields required");
      return;
    }
    try {
      const result = await apiRequest<{ token: string; user: User }>("/auth/register", {
        method: "POST",
        body: {
          email,
          password,
          role
        }
      });
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem("battle_token", result.token);
      setError(null);
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
      const result = await apiRequest<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: {
          email,
          password
        }
      });
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem("battle_token", result.token);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function onCreateRoom(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const created = await apiRequest<Room>("/rooms", {
        method: "POST",
        token,
        body: { challenge_prompt: challengePrompt }
      });
      setRoom(created);
      setJoinCode(created.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Room creation failed");
    }
  }

  async function onJoinRoom(e: FormEvent) {
    e.preventDefault();
    if (!token || !joinCode.trim()) return;
    setError(null);
    try {
      const joined = await apiRequest<Room>(`/rooms/${joinCode.trim().toUpperCase()}/join`, {
        method: "POST",
        token
      });
      setRoom(joined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-bold">AI Creative Battle Room - Phase 1</h1>

      <div className={`rounded-lg p-3 ${backendHealth === "ok" ? "bg-emerald-950 text-emerald-300" : backendHealth === "down" ? "bg-red-950 text-red-300" : "bg-slate-700 text-slate-300"}`}>
        Backend Status: {backendHealth === "ok" ? "✓ Connected" : backendHealth === "down" ? "✗ Not Running" : "⏳ Checking..."} (http://localhost:8000)
      </div>

      <section className="rounded-lg border border-slate-700 p-4">
        <h2 className="mb-3 text-xl font-semibold">1) Identity</h2>
        {!user ? (
          <form className="grid gap-3">
            <input
              className="rounded bg-slate-900 p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
            <input
              className="rounded bg-slate-900 p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
            />
            <select
              className="rounded bg-slate-900 p-2"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "player")}
            >
              <option value="player">Player</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-700"
                type="button"
                onClick={onRegister}
              >
                Register
              </button>
              <button
                className="flex-1 rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700"
                type="button"
                onClick={onLogin}
              >
                Login
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-emerald-300">Signed in as {user.role}</p>
            <button
              className="rounded bg-red-600 px-4 py-2 font-semibold hover:bg-red-700"
              onClick={() => {
                localStorage.removeItem("battle_token");
                setToken(null);
                setUser(null);
                router.push("/login");
              }}
            >
              Sign Out
            </button>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-700 p-4">
        <h2 className="mb-3 text-xl font-semibold">2) Rooms</h2>
        <form className="grid gap-3" onSubmit={onCreateRoom}>
          <textarea
            className="rounded bg-slate-900 p-2"
            value={challengePrompt}
            onChange={(e) => setChallengePrompt(e.target.value)}
            rows={3}
          />
          <button className="rounded bg-fuchsia-600 px-4 py-2 font-semibold" disabled={!token} type="submit">
            Create Room
          </button>
        </form>

        <form className="mt-4 flex gap-2" onSubmit={onJoinRoom}>
          <input
            className="flex-1 rounded bg-slate-900 p-2"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Room code"
          />
          <button className="rounded bg-sky-600 px-4 py-2 font-semibold" disabled={!token} type="submit">
            Join Room
          </button>
        </form>
      </section>

      {room ? (
        <section className="rounded-lg border border-slate-700 p-4">
          <h2 className="mb-2 text-xl font-semibold">Room Snapshot</h2>
          <p>Code: {room.code}</p>
          <p>Status: {room.status}</p>
          <p>Your role: {participantLabel}</p>
          <p className="mt-2">Prompt: {room.challenge_prompt}</p>
          <h3 className="mt-4 font-semibold">Participants</h3>
          <ul className="mt-2 list-disc pl-6">
            {room.participants.map((p) => (
              <li key={p.user_id}>
                {p.display_name} ({p.role})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="rounded bg-red-950 p-3 text-red-200">{error}</p> : null}
    </main>
  );
}
