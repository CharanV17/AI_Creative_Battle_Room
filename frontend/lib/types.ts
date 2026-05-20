// Centralised TypeScript types for the AI Creative Battle Room

export type UserRole = 'admin' | 'player';
export type ParticipantRole = 'host' | 'participant';
export type RoomStatus = 'waiting' | 'active' | 'finished';
export type RoundStatus = 'open' | 'closed';
export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'timed_out';
export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: UserRole;
}

export interface RoomParticipant {
  user_id: number;
  display_name: string;
  role: ParticipantRole;
  is_eliminated: boolean;
  joined_at: string;
  total_score: number;
}

export interface Room {
  id: number;
  code: string;
  challenge_prompt: string;
  host_user_id: number;
  status: RoomStatus;
  participants: RoomParticipant[];
}

export interface Submission {
  id: number;
  round_id: number;
  user_id: number;
  display_name: string;
  content: string;
  score: number | null;
  ai_output: string | null;
  created_at: string;
}

export interface Round {
  id: number;
  room_id: number;
  number: number;
  started_at: string;
  status: RoundStatus;
  submissions: Submission[];
}

export interface Job {
  id: number;
  room_id: number;
  round_id: number | null;
  provider_name: string;
  prompt: string;
  status: JobStatus;
  output_text: string | null;
  error_text: string | null;
  timeout_seconds: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomSnapshot {
  room: Room;
  current_round: Round | null;
  latest_job: Job | null;
}

export interface LeaderboardEntry {
  user_id: number;
  display_name: string;
  total_score: number;
  is_eliminated: boolean;
  rank: number;
}

export interface Leaderboard {
  room_code: string;
  entries: LeaderboardEntry[];
}

// WebSocket event union type
export type WsEvent =
  | { type: 'room.updated'; payload: Room }
  | { type: 'round.started'; payload: Round }
  | { type: 'submission.created'; payload: Submission }
  | { type: 'job.updated'; payload: Job }
  | { type: 'round.closed'; payload: { round: Round; room: Room } }
  | { type: 'participant.eliminated'; payload: RoomParticipant }
  | { type: 'room.finished'; payload: Leaderboard };
