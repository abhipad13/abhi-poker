import { useEffect, useRef } from "react";
import { Client } from "@stomp/stompjs";
// @ts-ignore
import SockJS from "sockjs-client";
import { WS_HTTP_BASE } from "@/services/api/client";
import type { ShowdownInfo, WinningsPayload } from "@/services/api/game";

type ShowdownHandlers = {
  onShowdownUpdate: (payload: ShowdownInfo) => void;
  onWinnings: (payload: WinningsPayload) => void;
};

export function useShowdownEvents(gameId: string, handlers: ShowdownHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(`${WS_HTTP_BASE}/ws`),
      reconnectDelay: 2000,
    });
    client.onConnect = () => {
      client.subscribe(`/topic/game.${gameId}.showdown`, (frame) => {
        try { handlersRef.current.onShowdownUpdate(JSON.parse(frame.body)); } catch {}
      });
      client.subscribe(`/topic/game.${gameId}.winnings`, (frame) => {
        try { handlersRef.current.onWinnings(JSON.parse(frame.body)); } catch {}
      });
    };
    client.activate();
    return () => { client.deactivate(); };
  }, [gameId]);
}
