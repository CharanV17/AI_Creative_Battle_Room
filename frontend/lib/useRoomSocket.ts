import { useEffect, useRef } from 'react';
import { useBattleStore } from './store';
import type { WsEvent } from './types';

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL || 'ws://127.0.0.1:8000';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export function useRoomSocket(roomCode: string | null, token: string | null) {
  const applyWsEvent = useBattleStore((s) => s.applyWsEvent);
  const setWsStatus = useBattleStore((s) => s.setWsStatus);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!roomCode || !token) return;
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;
      setWsStatus(retriesRef.current === 0 ? 'connecting' : 'reconnecting');
      const ws = new WebSocket(`${WS_BASE}/ws/${roomCode}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        setWsStatus('connected');
      };

      ws.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data) as WsEvent;
          applyWsEvent(event);
        } catch {
          console.error('WS: failed to parse event', evt.data);
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setWsStatus('disconnected');
        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, retriesRef.current);
          retriesRef.current++;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      wsRef.current?.close();
      setWsStatus('disconnected');
    };
  }, [roomCode, token]);
}
