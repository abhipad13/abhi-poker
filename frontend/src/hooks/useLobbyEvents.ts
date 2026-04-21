import { useEffect, useRef } from "react";
import { Client } from "@stomp/stompjs";
// @ts-ignore
import SockJS from "sockjs-client";
import { WS_HTTP_BASE } from "@/services/api/client";

export type TableUpdatePayload = {
  gameId: string;
  settings?: { smallBlindCents?: number; bigBlindCents?: number };
  chipValues?: Record<string, number>;
  order?: string[];
  manager?: string;
  defaultStartingMoneyCents?: number;
  customStartingMoneyCents?: Record<string, number>;
  queuedPlayers?: string[];
};

export type PlayersStatePayload = {
  gameId: string;
  players: { name: string; chipsCents: number; folded: boolean; allIn: boolean }[];
};

export type LobbySnapshotPayload = { roundName: string };

type LobbyHandlers = {
  onTableUpdate: (payload: TableUpdatePayload) => void;
  onPlayerState: (payload: PlayersStatePayload) => void;
  onSnapshot: (payload: LobbySnapshotPayload) => void;
};

export function useLobbyEvents(gameId: string, handlers: LobbyHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(`${WS_HTTP_BASE}/ws`),
      reconnectDelay: 2000,
    });
    client.onConnect = () => {
      client.subscribe(`/topic/game.${gameId}.table`, (frame) => {
        try { handlersRef.current.onTableUpdate(JSON.parse(frame.body)); } catch {}
      });
      client.subscribe(`/topic/game.${gameId}.players`, (frame) => {
        try { handlersRef.current.onPlayerState(JSON.parse(frame.body)); } catch {}
      });
      client.subscribe(`/topic/game.${gameId}.snapshot`, (frame) => {
        try { handlersRef.current.onSnapshot(JSON.parse(frame.body)); } catch {}
      });
    };
    client.activate();
    return () => { client.deactivate(); };
  }, [gameId]);
}
