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

export function saveSettings(gameId: string, requesterName: string, body: GameSettings) {
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

export function setPlayerChips(gameId: string, requesterId: string, name: string, amountCents: number) {
  return httpText(
    `/api/game/${encodeURIComponent(gameId)}/player/chips?requesterId=${encodeURIComponent(requesterId)}&name=${encodeURIComponent(name)}&amountCents=${amountCents}`,
    { method: "PUT" }
  );
}

export function removePlayer(gameId: string, requesterId: string, name: string) {
  return httpText(
    `/api/game/${encodeURIComponent(gameId)}/player?requesterId=${encodeURIComponent(requesterId)}&name=${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
}

export function changeManager(gameId: string, requesterId: string, newManagerId: string) {
  return httpText(
    `/api/game/${encodeURIComponent(gameId)}/manager?requesterId=${encodeURIComponent(requesterId)}&newManagerId=${encodeURIComponent(newManagerId)}`,
    { method: "PUT" }
  );
}

export type MoveSelection = "CALL_RAISE" | "CHECK" | "FOLD";

export type MakeMoveRequest = {
  playerId: string;
  selection: MoveSelection;
  bet: number;
};

export function makeMove(gameId: string, moveData: MakeMoveRequest) {
  return httpText(`/api/game/${encodeURIComponent(gameId)}/move`, {
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
  minCallAmt?: number;
  minRaiseAmt?: number;
  smallBlindCents?: number;
  bigBlindCents?: number;
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

export type ShowdownInfo = {
  totalPot: number;
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
  winningsCents: Record<string, number>;
  showdownOver: boolean;
};

export function assignWinners(gameId: string, winners: string[]) {
  return httpText(`/api/game/${encodeURIComponent(gameId)}/assignWinners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(winners),
  });
}
