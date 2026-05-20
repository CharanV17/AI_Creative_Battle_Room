import { create } from 'zustand';
import type { Job, Leaderboard, Room, Round, User, WsEvent, WsStatus } from './types';

interface BattleState {
  // Auth
  user: User | null;
  token: string | null;
  // Room
  room: Room | null;
  currentRound: Round | null;
  latestJob: Job | null;
  leaderboard: Leaderboard | null;
  // WebSocket
  wsStatus: WsStatus;
  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRoom: (room: Room | null) => void;
  setCurrentRound: (round: Round | null) => void;
  setLatestJob: (job: Job | null) => void;
  setLeaderboard: (lb: Leaderboard | null) => void;
  setWsStatus: (status: WsStatus) => void;
  applySnapshot: (room: Room, round: Round | null, job: Job | null) => void;
  applyWsEvent: (event: WsEvent) => void;
  reset: () => void;
}

export const useBattleStore = create<BattleState>((set, get) => ({
  user: null,
  token: null,
  room: null,
  currentRound: null,
  latestJob: null,
  leaderboard: null,
  wsStatus: 'disconnected',

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setRoom: (room) => set({ room }),
  setCurrentRound: (round) => set({ currentRound: round }),
  setLatestJob: (job) => set({ latestJob: job }),
  setLeaderboard: (lb) => set({ leaderboard: lb }),
  setWsStatus: (status) => set({ wsStatus: status }),

  applySnapshot: (room, round, job) =>
    set({ room, currentRound: round, latestJob: job }),

  applyWsEvent: (event) => {
    const state = get();
    switch (event.type) {
      case 'room.updated':
        set({ room: event.payload });
        break;
      case 'round.started':
        set({ currentRound: event.payload });
        break;
      case 'submission.created': {
        const round = state.currentRound;
        if (round) {
          const exists = round.submissions.find((s) => s.id === event.payload.id);
          if (!exists) {
            set({
              currentRound: {
                ...round,
                submissions: [...round.submissions, event.payload],
              },
            });
          }
        }
        break;
      }
      case 'job.updated':
        set({ latestJob: event.payload });
        break;
      case 'round.closed':
        set({
          currentRound: event.payload.round,
          room: event.payload.room,
        });
        break;
      case 'participant.eliminated': {
        const room = state.room;
        if (room) {
          set({
            room: {
              ...room,
              participants: room.participants.map((p) =>
                p.user_id === event.payload.user_id ? { ...p, is_eliminated: true } : p
              ),
            },
          });
        }
        break;
      }
      case 'room.finished':
        set({ leaderboard: event.payload });
        if (state.room) {
          set({ room: { ...state.room, status: 'finished' } });
        }
        break;
    }
  },

  reset: () =>
    set({
      room: null,
      currentRound: null,
      latestJob: null,
      leaderboard: null,
      wsStatus: 'disconnected',
    }),
}));
