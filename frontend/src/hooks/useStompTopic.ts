import { useEffect, useRef } from "react";
import { Client } from "@stomp/stompjs";
// @ts-ignore
import SockJS from "sockjs-client";
import { WS_HTTP_BASE } from "@/services/api/client";

export function useStompTopic<T>(topic: string, onMessage: (payload: T) => void) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(`${WS_HTTP_BASE}/ws`),
      reconnectDelay: 2000,
    });
    client.onConnect = () => {
      client.subscribe(topic, (frame) => {
        try {
          handlerRef.current(JSON.parse(frame.body) as T);
        } catch {}
      });
    };
    client.activate();
    return () => { client.deactivate(); };
  }, [topic]);
}
