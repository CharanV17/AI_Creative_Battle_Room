'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiRequest } from '../../../lib/api';
import { useBattleStore } from '../../../lib/store';
import { useRoomSocket } from '../../../lib/useRoomSocket';
import type {
  Job,
  Leaderboard,
  Room,
  RoomParticipant,
  RoomSnapshot,
  Round,
  Submission,
  User,
  WsStatus,
} from '../../../lib/types';

// ---------------------------------------------------------------------------
// WS Status Indicator
// ---------------------------------------------------------------------------
function WsIndicator({ status }: { status: WsStatus }) {
  const map: Record<WsStatus, { color: string; label: string; pulse: boolean }> = {
    connected: { color: 'bg-emerald-400', label: 'Live', pulse: true },
    connecting: { color: 'bg-yellow-400', label: 'Connecting', pulse: true },
    reconnecting: { color: 'bg-orange-400', label: 'Reconnecting', pulse: true },
    disconnected: { color: 'bg-red-400', label: 'Disconnected', pulse: false },
  };
  const { color, label, pulse } = map[status];
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className={`${color} absolute inline-flex h-full w-full animate-ping rounded-full opacity-75`}
          />
        )}
        <span className={`${color} relative inline-flex h-2 w-2 rounded-full`} />
      </span>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job Status Card
// ---------------------------------------------------------------------------
function JobCard({ job }: { job: Job }) {
  const icons: Record<string, string> = {
    pending: '⏳',
    running: '⚙️',
    succeeded: '✅',
    failed: '❌',
    timed_out: '⏱',
  };
  const labels: Record<string, string> = {
    pending: 'Queued',
    running: 'Generating...',
    succeeded: 'Complete',
    failed: 'Failed',
    timed_out: 'Timed Out',
  };
  const isActive = job.status === 'running' || job.status === 'pending';

  return (
    <div className={`glass rounded-xl p-4 animate-slide-up ${isActive ? 'animate-pulse-glow' : ''}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {job.status === 'running' ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
          ) : (
            <span>{icons[job.status]}</span>
          )}
          <span className={`text-sm font-semibold job-${job.status}`}>{labels[job.status]}</span>
        </div>
        <span className="text-xs text-gray-500">{job.provider_name}</span>
      </div>

      {job.status === 'running' && (
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
          <div className="shimmer h-full w-1/2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
        </div>
      )}

      {job.output_text && job.status === 'succeeded' && (
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            🤖 AI Output
          </p>
          <p className="text-sm leading-relaxed text-gray-200">{job.output_text}</p>
        </div>
      )}

      {job.error_text && (job.status === 'failed' || job.status === 'timed_out') && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-400">Error</p>
          <p className="text-xs text-red-300">{job.error_text}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submission Card
// ---------------------------------------------------------------------------
function SubmissionCard({ sub }: { sub: Submission }) {
  return (
    <div className="glass rounded-xl p-4 animate-slide-up">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">
            {sub.display_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-gray-200">{sub.display_name}</span>
        </div>
        {sub.score !== null && (
          <div className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5">
            <span className="text-xs text-amber-300">⭐</span>
            <span className="text-sm font-bold text-amber-300">{sub.score}</span>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-white/5 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Concept</p>
        <p className="text-sm text-gray-200">{sub.content}</p>
      </div>

      {sub.ai_output && (
        <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-purple-400">
            🤖 AI Expansion
          </p>
          <p className="text-sm leading-relaxed text-gray-300">{sub.ai_output}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard Panel
// ---------------------------------------------------------------------------
function LeaderboardPanel({ leaderboard }: { leaderboard: Leaderboard }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="glass-strong rounded-2xl p-6 animate-slide-up">
      <h3 className="mb-4 text-lg font-bold">🏆 Final Leaderboard</h3>
      <div className="flex flex-col gap-2">
        {leaderboard.entries.map((entry) => (
          <div
            key={entry.user_id}
            className={`flex items-center justify-between rounded-xl px-4 py-3 ${
              entry.rank === 1
                ? 'border border-amber-500/20 bg-amber-500/10'
                : 'glass'
            } ${entry.is_eliminated ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">
                {medals[entry.rank - 1] ?? `#${entry.rank}`}
              </span>
              <span className="font-semibold">{entry.display_name}</span>
              {entry.is_eliminated && (
                <span className="badge badge-eliminated">Out</span>
              )}
            </div>
            <span className="text-xl font-black text-amber-300">{entry.total_score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participant Row (inside the participants panel)
// ---------------------------------------------------------------------------
function ParticipantRow({
  p,
  isHost,
  loadingAction,
  onEliminate,
}: {
  p: RoomParticipant;
  isHost: boolean;
  loadingAction: string | null;
  onEliminate: (userId: number) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
        p.is_eliminated ? 'opacity-40 line-through' : 'glass'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">
          {p.display_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold">{p.display_name}</p>
          <span
            className={`badge !px-1.5 !py-0 text-xs ${
              p.role === 'host' ? 'badge-host' : 'badge-participant'
            }`}
          >
            {p.role}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {p.total_score > 0 && (
          <span className="text-sm font-bold text-amber-300">⭐{p.total_score}</span>
        )}
        {isHost && p.role === 'participant' && !p.is_eliminated && (
          <button
            onClick={() => onEliminate(p.user_id)}
            disabled={loadingAction === `elim-${p.user_id}`}
            className="rounded-lg px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
            title="Eliminate player"
          >
            ✂
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Room Page
// ---------------------------------------------------------------------------
export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string)?.toUpperCase();

  const {
    user,
    token,
    room,
    currentRound,
    latestJob,
    leaderboard,
    wsStatus,
    setUser,
    setToken,
    applySnapshot,
    setLeaderboard,
  } = useBattleStore();

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [submitText, setSubmitText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Connect WebSocket
  useRoomSocket(code || null, token);

  // Init: restore session + load snapshot
  useEffect(() => {
    if (!code) return;

    const saved = localStorage.getItem('battle_token');
    if (!saved) {
      router.push('/login');
      return;
    }

    const resolvedToken = token || saved;
    if (!token) setToken(saved);

    async function init() {
      try {
        let me = user;
        if (!me) {
          me = await apiRequest<User>('/auth/me', { token: resolvedToken });
          setUser(me);
        }
        const snap = await apiRequest<RoomSnapshot>(`/rooms/${code}/snapshot`, {
          token: resolvedToken,
        });
        applySnapshot(snap.room, snap.current_round, snap.latest_job);
        setInitialized(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('401')) {
          localStorage.removeItem('battle_token');
          router.push('/login');
        } else if (msg.includes('403') || msg.includes('404')) {
          // Not a participant yet — try to auto-join
          try {
            await apiRequest<Room>(`/rooms/${code}/join`, {
              method: 'POST',
              token: resolvedToken,
            });
            const snap = await apiRequest<RoomSnapshot>(`/rooms/${code}/snapshot`, {
              token: resolvedToken,
            });
            applySnapshot(snap.room, snap.current_round, snap.latest_job);
            setInitialized(true);
          } catch {
            setError('Could not join room. It may not exist or has already ended.');
          }
        } else {
          setError('Failed to load room data.');
        }
      }
    }

    init();
  }, [code]);

  // Derived state
  const myParticipation = room?.participants.find((p) => p.user_id === user?.id);
  const isHost = !!user && room?.host_user_id === user.id;
  const isParticipant = myParticipation?.role === 'participant';
  const isEliminated = myParticipation?.is_eliminated ?? false;
  const hasSubmitted = !!(
    currentRound &&
    user &&
    currentRound.submissions.find((s) => s.user_id === user.id)
  );
  const canSubmit =
    isParticipant && !isEliminated && !hasSubmitted && currentRound?.status === 'open';
  const roundIsOpen = currentRound?.status === 'open';

  // Generic action wrapper
  async function doAction(action: string, fn: () => Promise<unknown>) {
    setError(null);
    setLoadingAction(action);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  async function startRound() {
    await doAction('start', () =>
      apiRequest<Round>(`/rooms/${code}/rounds/start`, {
        method: 'POST',
        token: token!,
      })
    );
  }

  async function closeRound() {
    if (!currentRound) return;
    await doAction('close', () =>
      apiRequest<Round>(`/rooms/${code}/rounds/${currentRound.id}/close`, {
        method: 'POST',
        token: token!,
      })
    );
  }

  async function finishGame() {
    await doAction('finish', async () => {
      const lb = await apiRequest<Leaderboard>(`/rooms/${code}/finish`, {
        method: 'POST',
        token: token!,
      });
      setLeaderboard(lb);
    });
  }

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!submitText.trim() || !currentRound) return;
    await doAction('submit', async () => {
      await apiRequest<Submission>(
        `/rooms/${code}/rounds/${currentRound.id}/submit`,
        {
          method: 'POST',
          token: token!,
          body: { content: submitText.trim() },
        }
      );
      setSubmitText('');
    });
  }

  async function eliminate(userId: number) {
    await doAction(`elim-${userId}`, () =>
      apiRequest(`/rooms/${code}/participants/${userId}/eliminate`, {
        method: 'POST',
        token: token!,
      })
    );
  }

  function copyCode() {
    navigator.clipboard.writeText(code || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500/30 border-t-purple-500" />
          <p className="text-gray-400">Loading battle room...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Room not found
  // ---------------------------------------------------------------------------
  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-strong rounded-2xl p-8 text-center">
          <p className="mb-4 text-2xl">🚫</p>
          <p className="mb-2 font-semibold">Room not found</p>
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          <button
            onClick={() => router.push('/')}
            className="btn-ghost mt-4 text-sm"
          >
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; cls: string }> = {
    waiting: { label: '⏸ Waiting', cls: 'badge-waiting' },
    active: { label: '🔴 Live', cls: 'badge-active' },
    finished: { label: '🏁 Finished', cls: 'badge-finished' },
  };
  const sc = statusConfig[room.status] ?? { label: room.status, cls: 'badge-waiting' };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen">
      {/* Sticky Header */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 px-6 py-3"
        style={{ background: 'rgba(3,7,18,0.85)', backdropFilter: 'blur(16px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-sm text-gray-400 transition-colors hover:text-white"
          >
            ← Lobby
          </button>
          <span className="text-gray-600">/</span>
          <span className="font-mono font-bold text-purple-300">{code}</span>
          <button
            onClick={copyCode}
            className="rounded-lg px-2 py-1 text-xs transition-colors hover:bg-white/10"
            title="Copy room code"
          >
            {copied ? '✅ Copied' : '📋 Copy'}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <WsIndicator status={wsStatus} />
          <span className={`badge ${sc.cls}`}>{sc.label}</span>
          {user && <span className="text-xs text-gray-400">{user.display_name}</span>}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Challenge Banner */}
        <div className="glass-strong mb-6 animate-slide-up rounded-2xl p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-purple-400">
            🎯 Challenge
          </p>
          <h1 className="text-xl font-bold text-white">{room.challenge_prompt}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>
              Room <span className="font-mono text-gray-300">{code}</span>
            </span>
            <span>·</span>
            <span>
              {room.participants.length} participant
              {room.participants.length !== 1 ? 's' : ''}
            </span>
            {myParticipation && (
              <>
                <span>·</span>
                <span
                  className={`badge ${
                    myParticipation.role === 'host' ? 'badge-host' : 'badge-participant'
                  }`}
                >
                  You: {myParticipation.role}
                </span>
                {isEliminated && (
                  <span className="badge badge-eliminated">Eliminated</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 animate-slide-up rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            ⚠ {error}
          </div>
        )}

        {/* Final Leaderboard (game over) */}
        {room.status === 'finished' && leaderboard && (
          <div className="mb-6">
            <LeaderboardPanel leaderboard={leaderboard} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ---- Left Column: Participants + Host Controls ---- */}
          <div className="flex flex-col gap-4">
            {/* Participants Panel */}
            <div className="glass-strong rounded-2xl p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-400">
                Participants ({room.participants.length})
              </h2>
              <div className="flex flex-col gap-2">
                {room.participants.map((p) => (
                  <ParticipantRow
                    key={p.user_id}
                    p={p}
                    isHost={isHost}
                    loadingAction={loadingAction}
                    onEliminate={eliminate}
                  />
                ))}
              </div>
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="glass-strong rounded-2xl p-4">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-400">
                  Host Controls
                </h2>
                <div className="flex flex-col gap-2">
                  {/* Start Round — only if game isn't finished and no round is open */}
                  {room.status !== 'finished' && !roundIsOpen && (
                    <button
                      onClick={startRound}
                      disabled={loadingAction === 'start'}
                      className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm"
                    >
                      {loadingAction === 'start' ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                          Starting...
                        </>
                      ) : (
                        '▶ Start Round'
                      )}
                    </button>
                  )}

                  {/* Close Round */}
                  {roundIsOpen && (
                    <button
                      onClick={closeRound}
                      disabled={loadingAction === 'close'}
                      className="btn-danger flex w-full items-center justify-center gap-2 py-2.5 text-sm"
                    >
                      {loadingAction === 'close' ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                          Closing...
                        </>
                      ) : (
                        '⏹ Close Round & Score'
                      )}
                    </button>
                  )}

                  {/* End Game */}
                  {room.status !== 'finished' && (
                    <button
                      onClick={finishGame}
                      disabled={loadingAction === 'finish'}
                      className="btn-ghost w-full py-2 text-sm"
                    >
                      {loadingAction === 'finish' ? (
                        <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                      ) : (
                        '🏁 End Game'
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Eliminated notice for players */}
            {isEliminated && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                <p className="text-2xl mb-1">💀</p>
                <p className="text-sm font-semibold text-red-400">You've been eliminated</p>
                <p className="text-xs text-gray-500 mt-1">You can still watch the battle unfold</p>
              </div>
            )}
          </div>

          {/* ---- Center + Right: Round / Submissions / Job ---- */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            {/* AI Generation Job */}
            {latestJob && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  AI Generation
                </p>
                <JobCard job={latestJob} />
              </div>
            )}

            {/* Waiting State */}
            {room.status === 'waiting' && !currentRound && (
              <div className="glass-strong flex flex-col items-center justify-center rounded-2xl p-12 text-center">
                <div className="mb-4 text-5xl animate-pulse-glow">⚡</div>
                <h3 className="mb-2 text-lg font-bold">Waiting for the host to start</h3>
                <p className="text-sm text-gray-400">
                  Share the room code <span className="font-mono text-purple-300">{code}</span> with
                  other players
                </p>
              </div>
            )}

            {/* Current Round */}
            {currentRound && (
              <div className="glass-strong rounded-2xl p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-bold">Round #{currentRound.number}</h2>
                  <span
                    className={`badge ${
                      currentRound.status === 'open' ? 'badge-active' : 'badge-finished'
                    }`}
                  >
                    {currentRound.status === 'open' ? '🔴 Open' : '✅ Closed'}
                  </span>
                </div>

                {/* Submission Form for participants */}
                {canSubmit && (
                  <form
                    onSubmit={submitEntry}
                    className="glass mb-4 rounded-xl p-4"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-400">
                      Your Submission
                    </p>
                    <textarea
                      className="input-field mb-3 resize-none"
                      rows={3}
                      value={submitText}
                      onChange={(e) => setSubmitText(e.target.value)}
                      placeholder="Describe your creative concept..."
                      maxLength={500}
                      required
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">{submitText.length}/500</span>
                      <button
                        type="submit"
                        disabled={loadingAction === 'submit' || !submitText.trim()}
                        className="btn-primary flex items-center gap-2 py-2 text-sm"
                      >
                        {loadingAction === 'submit' ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                            Submitting...
                          </>
                        ) : (
                          '⚡ Submit'
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* Already submitted notice */}
                {hasSubmitted && currentRound.status === 'open' && (
                  <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
                    ✅ Submission received — waiting for round to close
                  </div>
                )}

                {/* Host waiting notice */}
                {isHost && currentRound.status === 'open' && (
                  <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-400">
                    🕐 {currentRound.submissions.length} submission
                    {currentRound.submissions.length !== 1 ? 's' : ''} received — close when
                    ready to score
                  </div>
                )}

                {/* Submissions List */}
                {currentRound.submissions.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Submissions ({currentRound.submissions.length})
                    </p>
                    {currentRound.submissions.map((sub) => (
                      <SubmissionCard key={sub.id} sub={sub} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
                    No submissions yet — waiting for players to submit their concepts
                  </div>
                )}
              </div>
            )}

            {/* Game Finished — no leaderboard yet */}
            {room.status === 'finished' && !leaderboard && (
              <div className="glass-strong flex flex-col items-center justify-center rounded-2xl p-12 text-center">
                <div className="mb-4 text-5xl">🏁</div>
                <h3 className="mb-2 text-lg font-bold">Battle Complete!</h3>
                <p className="text-sm text-gray-400">Leaderboard is being calculated...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
