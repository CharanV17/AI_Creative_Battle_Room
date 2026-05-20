'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../lib/api';
import { useBattleStore } from '../lib/store';
import type { Room, User } from '../lib/types';

export default function LobbyPage() {
  const router = useRouter();
  const { token, user, setToken, setUser } = useBattleStore();

  const [challengePrompt, setChallengePrompt] = useState(
    'Create the most insane luxury cyberpunk perfume campaign for Gen-Z.'
  );
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'create' | 'join' | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Check backend health
    apiRequest<{ status: string }>('/health')
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));

    // Restore session from localStorage
    const saved = localStorage.getItem('battle_token');
    if (!saved) {
      router.push('/login');
      return;
    }
    if (!token) {
      setToken(saved);
      apiRequest<User>('/auth/me', { token: saved })
        .then((me) => setUser(me))
        .catch(() => {
          localStorage.removeItem('battle_token');
          router.push('/login');
        });
    }
  }, []);

  async function onCreateRoom(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading('create');
    try {
      const room = await apiRequest<Room>('/rooms', {
        method: 'POST',
        token,
        body: { challenge_prompt: challengePrompt },
      });
      router.push(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(null);
    }
  }

  async function onJoinRoom(e: FormEvent) {
    e.preventDefault();
    if (!token || !joinCode.trim()) return;
    setError(null);
    setLoading('join');
    try {
      const room = await apiRequest<Room>(`/rooms/${joinCode.trim().toUpperCase()}/join`, {
        method: 'POST',
        token,
      });
      router.push(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(null);
    }
  }

  function signOut() {
    localStorage.removeItem('battle_token');
    setToken(null);
    setUser(null);
    router.push('/login');
  }

  return (
    <main className="min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}
          >
            <span className="text-sm">⚡</span>
          </div>
          <span className="font-bold">Battle Room</span>
        </div>
        <div className="flex items-center gap-4">
          {backendOk !== null && (
            <div className={`flex items-center gap-1.5 text-xs ${backendOk ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className={`h-2 w-2 rounded-full ${backendOk ? 'bg-emerald-400' : 'bg-red-400'}`} />
              API {backendOk ? 'Online' : 'Offline'}
            </div>
          )}
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                👤 {user.display_name}{' '}
                <span className="text-purple-400">({user.role})</span>
              </span>
              <button onClick={signOut} className="btn-ghost py-1.5 text-sm">
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        <div className="mb-12 text-center animate-slide-up">
          <h1 className="text-5xl font-black gradient-text mb-4">AI Creative Battle Room</h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Host a challenge. Submit your wildest concepts. Watch AI bring them to life. May the most creative mind win.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Create Room */}
          <div className="glass-strong rounded-2xl p-6 animate-slide-up">
            <div className="mb-5 flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                <span>🏆</span>
              </div>
              <div>
                <h2 className="font-bold text-white">Host a Battle</h2>
                <p className="text-xs text-gray-400">Create a room and set the challenge</p>
              </div>
            </div>
            <form onSubmit={onCreateRoom} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Challenge Prompt
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={4}
                  value={challengePrompt}
                  onChange={(e) => setChallengePrompt(e.target.value)}
                  placeholder="Describe the creative challenge..."
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary flex items-center justify-center gap-2"
                disabled={loading === 'create' || !token}
              >
                {loading === 'create' ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating...
                  </>
                ) : (
                  '🚀 Create Room'
                )}
              </button>
            </form>
          </div>

          {/* Join Room */}
          <div className="glass-strong rounded-2xl p-6 animate-slide-up">
            <div className="mb-5 flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)' }}
              >
                <span>🎯</span>
              </div>
              <div>
                <h2 className="font-bold text-white">Join a Battle</h2>
                <p className="text-xs text-gray-400">Enter a room code to compete</p>
              </div>
            </div>
            <form onSubmit={onJoinRoom} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Room Code
                </label>
                <input
                  className="input-field text-center text-xl font-mono font-bold tracking-widest uppercase"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-success flex items-center justify-center gap-2"
                disabled={loading === 'join' || !token || !joinCode.trim()}
              >
                {loading === 'join' ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Joining...
                  </>
                ) : (
                  '⚔️ Enter Room'
                )}
              </button>
            </form>
          </div>
        </div>

        {error && (
          <div className="mt-6 animate-slide-up rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            ⚠ {error}
          </div>
        )}

        {/* How it works */}
        <div className="mt-12 animate-fade-in">
          <h3 className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-gray-500">
            How It Works
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: '🎨', title: 'Challenge', desc: 'Host sets a creative prompt for the round' },
              { icon: '⚡', title: 'Submit', desc: 'Participants submit their concept ideas' },
              { icon: '🤖', title: 'Generate', desc: 'AI expands each concept into a full creative output' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="glass rounded-xl p-4 text-center">
                <div className="mb-2 text-2xl">{icon}</div>
                <div className="mb-1 font-semibold text-white">{title}</div>
                <div className="text-xs text-gray-400">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
