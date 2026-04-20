import { http, httpText } from "./client";

export function createGame(managerName: string) {
  return http<{ gameId: string }>(`/api/game/create?managerName=${encodeURIComponent(managerName)}`, {
    method: "POST",
  });
}

export function joinGame(gameId: string, name: string) {
  return httpText(`/api/game/${encodeURIComponent(gameId)}/player?name=${encodeURIComponent(name)}`, {
    method: "POST",
  });
}

export type PlayersResponse = {
  activePlayers: { name: string; chips: number; folded: boolean; allIn: boolean }[];
  queuedPlayers: { name: string }[];
  manager: string;
};

export function getPlayers(gameId: string) {
  return http<PlayersResponse>(`/api/game/${encodeURIComponent(gameId)}/players`);
}

export type GameSettings = {
  smallBlindCents: number;
  bigBlindCents: number;
  defaultStartingMoneyCents: number;
  chipValues: Record<string, number>;
  customStartingMoneyCents?: Record<string, number>;
};

export function getSettings(gameId: string) {
  return http<GameSettings>(`/api/game/${encodeURIComponent(gameId)}/settings`);
}

export function saveSettings(gameId: string, requesterName: string, body: any) {
  return httpText(`/api/game/${encodeURIComponent(gameId)}/settings?requesterName=${encodeURIComponent(requesterName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function startHand(gameId: string, requesterName: string) {
  return http<{ message: string; round: number }>(
    `/api/game/${encodeURIComponent(gameId)}/hand/start?requesterName=${encodeURIComponent(requesterName)}`,
    { method: "POST" }
  );
}

export function reorderPlayers(gameId: string, requesterId: string, names: string[]) {
  return httpText(`/api/game/${encodeURIComponent(gameId)}/players/reorder?requesterId=${encodeURIComponent(requesterId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(names),
  });
}

export function acceptQueued(gameId: string, requesterId: string, name: string, startingMoneyCents: number) {
  return httpText(`/api/game/${encodeURIComponent(gameId)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterId, name, startingMoneyCents }),
  });
}

export function changeManager(gameId: string, requesterId: string, newManagerId: string) {
  return httpText(
    `/api/game/${encodeURIComponent(gameId)}/manager?requesterId=${encodeURIComponent(requesterId)}&newManagerId=${encodeURIComponent(newManagerId)}`,
    { method: "PUT" }
  );
}

// New API functions for betting and game state
export type MoveSelection = "CALL_RAISE" | "CHECK" | "FOLD";

export type MakeMoveRequest = {
  playerId: string;
  selection: MoveSelection;
  bet: number; // in cents
};

export function makeMove(gameId: string, moveData: MakeMoveRequest) {
  const url = `/api/game/${encodeURIComponent(gameId)}/move`;
  // Log outgoing request for visibility in the browser console
  try {
    console.log('[API] POST', url, { ...moveData });
  } catch {}
  return httpText(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(moveData),
  });
}

export type GameSnapshot = {
  gameId: string;
  roundName: string;
  turnPlayer: string;
  totalPot: number;
  chipValues?: Record<string, number>;
  // Optional amounts in cents (provided by backend when available)
  minCallAmt?: number;
  minRaiseAmt?: number;
  players: {
    name: string;
    displayCents: number;
    contributionCents: number;
    folded: boolean;
    allIn: boolean;
  }[];
};

export function getGameSnapshot(gameId: string) {
  return http<GameSnapshot>(`/api/game/${encodeURIComponent(gameId)}/snapshot`);
}

// STOMP WebSocket support for real-time updates
import { Client } from '@stomp/stompjs';
// @ts-ignore
import SockJS from 'sockjs-client';

const RAW_API_BASE = (import.meta as any).env.VITE_API_BASE ?? "";
const API_BASE = String(RAW_API_BASE).replace(/\/$/, "");
const WS_HTTP_BASE = API_BASE || ""; // when empty, relative paths hit same-origin

export class GameWebSocket {
  private client: Client | null = null;
  private connected = false;

  constructor(private gameId: string) {}

  connect(onSnapshot: (snapshot: any) => void, onError?: (error: any) => void) {
    try {
      console.log('🔄 Setting up STOMP client for game:', this.gameId);
      
      this.client = new Client({
        webSocketFactory: () => new SockJS(`${WS_HTTP_BASE}/ws`),
        reconnectDelay: 2000,
        debug: (str) => console.log('STOMP Debug:', str),
      });

      this.client.onConnect = () => {
        console.log('✅ STOMP client connected successfully');
        this.connected = true;
        
        // Subscribe to the game snapshot topic
        const destination = `/topic/game.${this.gameId}.snapshot`;
        console.log('📡 Subscribing to topic:', destination);
        
        this.client!.subscribe(destination, (message) => {
          try {
            const payload = JSON.parse(message.body);
            console.log('📊 Snapshot received:', payload);
            onSnapshot(payload);
          } catch (error) {
            console.error('❌ Failed to parse snapshot message:', error);
          }
        });
      };

      this.client.onStompError = (frame) => {
        console.error('❌ STOMP error:', frame);
        this.connected = false;
        if (onError) onError(new Error(`STOMP error: ${frame.headers.message}`));
      };

      this.client.onWebSocketError = (error) => {
        console.error('❌ WebSocket error:', error);
        this.connected = false;
        if (onError) onError(error);
      };

      this.client.onWebSocketClose = () => {
        console.log('🔌 WebSocket connection closed');
        this.connected = false;
      };

      // Activate the client
      this.client.activate();
      
    } catch (error) {
      console.error('❌ Failed to create STOMP client:', error);
      if (onError) onError(error);
    }
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected;
  }
}

// --- Showdown HTTP + WebSocket ---
export type ShowdownInfo = {
  totalPot: number; // in cents
  players: {
    name: string;
    moneyCents: number;
    folded: boolean;
    allIn: boolean;
  }[];
};

export function getShowdownInfo(gameId: string) {
  return http<ShowdownInfo>(`/api/game/${encodeURIComponent(gameId)}/showdownInfo`);
}

export type WinningsPayload = {
  gameId: string;
  winningsCents: Record<string, number>; // name -> cents won
  showdownOver: boolean;
};

export function assignWinners(gameId: string, winners: string[]) {
  const url = `/api/game/${encodeURIComponent(gameId)}/assignWinners`;
  try { console.log('[API] POST', url, winners); } catch {}
  return httpText(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(winners),
  });
}

export class ShowdownWebSocket {
  private client: Client | null = null;
  private connected = false;

  constructor(private gameId: string) {}

  connect(
    onShowdownUpdate: (info: ShowdownInfo) => void,
    onWinningsUpdate?: (payload: WinningsPayload) => void,
    onError?: (error: any) => void
  ) {
    try {
      console.log('🔄 Setting up STOMP client for showdown:', this.gameId);

      this.client = new Client({
        webSocketFactory: () => new SockJS(`${WS_HTTP_BASE}/ws`),
        reconnectDelay: 2000,
        debug: (str) => console.log('STOMP Debug (showdown):', str),
      });

      this.client.onConnect = () => {
        console.log('✅ STOMP client connected (showdown)');
        this.connected = true;

        const showdownTopic = `/topic/game.${this.gameId}.showdown`;
        console.log('📡 Subscribing to topic:', showdownTopic);
        this.client!.subscribe(showdownTopic, (message) => {
          try {
            const payload = JSON.parse(message.body) as ShowdownInfo;
            onShowdownUpdate(payload);
          } catch (error) {
            console.error('❌ Failed to parse showdown message:', error);
          }
        });

        const winningsTopic = `/topic/game.${this.gameId}.winnings`;
        console.log('📡 Subscribing to topic:', winningsTopic);
        this.client!.subscribe(winningsTopic, (message) => {
          try {
            const payload = JSON.parse(message.body) as WinningsPayload;
            if (onWinningsUpdate) onWinningsUpdate(payload);
          } catch (error) {
            console.error('❌ Failed to parse winnings message:', error);
          }
        });
      };

      this.client.onStompError = (frame) => {
        console.error('❌ STOMP error (showdown):', frame);
        this.connected = false;
        if (onError) onError(new Error(`STOMP error: ${frame.headers.message}`));
      };

      this.client.onWebSocketError = (error) => {
        console.error('❌ WebSocket error (showdown):', error);
        this.connected = false;
        if (onError) onError(error);
      };

      this.client.onWebSocketClose = () => {
        console.log('🔌 WebSocket connection closed (showdown)');
        this.connected = false;
      };

      this.client.activate();
    } catch (error) {
      console.error('❌ Failed to create STOMP client (showdown):', error);
      if (onError) onError(error);
    }
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected;
  }
}