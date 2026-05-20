'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../lib/api';
import { useBattleStore } from '../../lib/store';
import type { User } from '../../lib/types';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useBattleStore((s) => s.setUser);
  const setToken = useBattleStore((s) => s.setToken);

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'player'>('player');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError('All fields required'); return; }
    setLoading(true);
    try {
      const endpoint = tab === 'register' ? '/auth/register' : '/auth/login';
      const body = tab === 'register' ? { email, password, role } : { email, password };
      const result = await apiRequest<{ token: string; user: User }>(endpoint, { method: 'POST', body });
      localStorage.setItem('battle_token', result.token);
      setToken(result.token);
      setUser(result.user);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div
            className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', boxShadow: '0 0 40px rgba(124, 58, 237, 0.5)' }}
          >
            <span className="text-3xl">⚡</span>
          </div>
          <h1 className="text-3xl font-black gradient-text">Battle Room</h1>
          <p className="mt-2 text-gray-400">AI-powered creative competitions</p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-2xl p-8">
          {/* Tabs */}
          <div className="mb-6 flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setError(null); }}
                className="flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-all duration-200"
                style={
                  tab === t
                    ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white' }
                    : { color: '#94a3b8' }
                }
              >
                {t}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 6 characters"
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </div>

            {tab === 'register' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Role
                </label>
                <select
                  id="login-role"
                  className="input-field"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'player')}
                >
                  <option value="player">Player — compete in rooms</option>
                  <option value="admin">Admin — host and manage rooms</option>
                </select>
              </div>
            )}

            {error && (
              <div className="animate-slide-up rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary mt-2 flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Processing...
                </>
              ) : tab === 'login' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          AI Creative Battle Room · Poiro Intern Assignment
        </p>
      </div>
    </main>
  );
}
