import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlayers,
  getSettings,
  reorderPlayers,
  acceptQueued,
  startHand,
  changeManager,
  PlayersResponse,
  GameSettings,
} from "@/services/api/game";
import SettingsPanel from "./components/SettingsPanel";

// STOMP + SockJS
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
const RAW_API_BASE = (import.meta as any).env.VITE_API_BASE ?? "";
const API_BASE = String(RAW_API_BASE).replace(/\/$/, "");
const WS_HTTP_BASE = API_BASE || ""; // when empty, relative '/ws' hits same-origin

type TableUpdateSettings = {
  smallBlindCents?: number;
  bigBlindCents?: number;
};

type TableUpdatePayload = {
  gameId: string;
  settings?: TableUpdateSettings;
  chipValues?: Record<string, number>;
  order?: string[];
  manager?: string;
  defaultStartingMoneyCents?: number;
  customStartingMoneyCents?: Record<string, number>;
};

type PlayersStatePayload = {
  gameId: string;
  players: {
    name: string;
    chipsCents: number;
    folded: boolean;
    allIn: boolean;
  }[];
};

type SnapshotPayload = { roundName: string };

export default function Lobby() {
  const nav = useNavigate();
  const { gameId = "" } = useParams();
  const [youName, setYouName] = useState<string>(() => localStorage.getItem("youName") || ""); // optional
  const [players, setPlayers] = useState<PlayersResponse["activePlayers"]>([]);
  const [queue, setQueue] = useState<PlayersResponse["queuedPlayers"]>([]);
  const [manager, setManager] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Persist manager to localStorage for other screens (e.g., Showdown)
  useEffect(() => {
    try {
      if (manager) {
        localStorage.setItem("managerName", manager);
      }
    } catch {}
  }, [manager]);

  // Settings state from WebSocket updates
  const [smallBlindCents, setSmallBlindCents] = useState<number | undefined>();
  const [bigBlindCents, setBigBlindCents] = useState<number | undefined>();
  const [defaultStartingMoneyCents, setDefaultStartingMoneyCents] = useState<number | undefined>();
  const [chipValues, setChipValues] = useState<Record<string, number> | undefined>();
  const [customStartingMoneyCents, setCustomStartingMoneyCents] = useState<Record<string, number> | undefined>();

  const stompRef = useRef<Client | null>(null);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        // Fetch players first (required)
        const playersData = await getPlayers(gameId);
        console.log("Initial API call - manager:", playersData.manager);
        
        setPlayers(playersData.activePlayers);
        setQueue(playersData.queuedPlayers);
        setManager(playersData.manager);
        
        // Try to fetch settings (optional - may not exist yet)
        try {
          const settingsData = await getSettings(gameId);
          console.log("Initial API call - settings:", settingsData);
          
          // Populate settings from API response
          setSmallBlindCents(settingsData.smallBlindCents);
          setBigBlindCents(settingsData.bigBlindCents);
          setDefaultStartingMoneyCents(settingsData.defaultStartingMoneyCents);
          setChipValues(settingsData.chipValues);
        } catch (settingsError) {
          console.warn("Settings endpoint not available yet:", settingsError);
          // Settings will be populated by websocket messages instead
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load lobby.";
        setError(msg);
      }
    })();
  }, [gameId]);

  // subscribe to WS table + log + phase
  useEffect(() => {
    let cancelled = false;

    {
      const client = new Client({
        webSocketFactory: () => new SockJS(`${WS_HTTP_BASE}/ws`),
        reconnectDelay: 2000,
      });

      client.onConnect = () => {
        // TABLE_UPDATE → order + manager + settings + starting money
        client.subscribe(`/topic/game.${gameId}.table`, (msg) => {
          try {
            const t: TableUpdatePayload = JSON.parse(msg.body);
            
            // Only update manager if the message contains a valid manager value
            if (t.manager && t.manager.trim() !== "") {
              setManager(t.manager);
            }
            
            // Update settings
            if (t.settings) {
              if (typeof t.settings.smallBlindCents === "number") setSmallBlindCents(t.settings.smallBlindCents);
              if (typeof t.settings.bigBlindCents === "number") setBigBlindCents(t.settings.bigBlindCents);
            }
            
            // Update default starting money
            if (typeof t.defaultStartingMoneyCents === "number") {
              setDefaultStartingMoneyCents(t.defaultStartingMoneyCents);
            }
            
            // Update chip values
            if (t.chipValues) setChipValues(t.chipValues);

            // Update custom starting money overrides
            if (t.customStartingMoneyCents) setCustomStartingMoneyCents(t.customStartingMoneyCents);

            // Update player order and starting money
            if (t.order && t.order.length > 0) {
              setPlayers((old) => {
                const byName = new Map(old.map((p) => [p.name, p]));
                return t.order.map((name) => {
                  const existing = byName.get(name);
                  if (existing) {
                    // Keep existing player data but don't update chips from TABLE_UPDATE
                    return {
                      ...existing,
                      // Keep existing chips - only PLAYER_STATE should update these
                    } as PlayersResponse["activePlayers"][number];
                  } else {
                    // New player - don't set starting money from TABLE_UPDATE
                    return { 
                      name, 
                      chips: 0, // Will be populated by PLAYER_STATE
                      folded: false, 
                      allIn: false 
                    };
                  }
                });
              });
            }
          } catch (e) {
            console.error("Failed to parse TABLE_UPDATE message:", e);
          }
        });

        // PLAYER_STATE → chip stacks update when settings are saved or hands end
        client.subscribe(`/topic/game.${gameId}.players`, (msg) => {
          try {
            const payload: PlayersStatePayload = JSON.parse(msg.body);
            setPlayers((old) => {
              const order = old.map((p) => p.name);
              const byName = new Map(payload.players.map((p) => [p.name, p]));
              return order.map((name) => {
                const upd = byName.get(name);
                if (upd) {
                  // Update player with all properties from WebSocket
                  return { 
                    name, 
                    chips: upd.chipsCents, 
                    folded: upd.folded, 
                    allIn: upd.allIn 
                  };
                } else {
                  // Keep existing player data if not in update
                  const existing = old.find(p => p.name === name);
                  return existing || { name, chips: 0, folded: false, allIn: false };
                }
              });
            });
          } catch (e) {
            console.error("Failed to parse PLAYER_STATE message:", e);
          }
        });

        // SNAPSHOT → if Pre-Flop starts, hop to betting screen
        client.subscribe(`/topic/game.${gameId}.snapshot`, (msg) => {
          try {
            const p: SnapshotPayload = JSON.parse(msg.body);
            if (p.roundName === "Pre-Flop") nav(`/bet/${gameId}/${youName}`);
          } catch {}
        });
      };

      client.activate();
      stompRef.current = client;
    }

    return () => {
      cancelled = true;
      if (stompRef.current) {
        stompRef.current.deactivate();
        stompRef.current = null;
      }
    };
  }, [gameId, nav, youName]);

  // Determine if current user is manager
  const isManager = Boolean(youName && manager && youName === manager);
  
  // Debug logging for manager status (dev only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("Manager status:", { youName, manager, isManager });
    }
  }, [youName, manager, isManager]);

  // drag & drop — HTML5 API (no deps)
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function onDragStart(idx: number) { setDragIndex(idx); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(idx: number) {
    if (dragIndex === null || dragIndex === idx) return;
    const next = [...players];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setDragIndex(null);

    // optimistic update
    setPlayers(next);
    // send to server
    if (isManager) {
      const names = next.map((p) => p.name);
      reorderPlayers(gameId, manager, names).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Reorder failed";
        setError(msg);
        // (we could refetch /players here)
      });
    }
  }

  async function onMakeManager(name: string) {
    try {
      await changeManager(gameId, manager, name);
      // server will broadcast TABLE_UPDATE with new manager
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to change manager.";
      setError(msg);
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">Lobby</h1>
            <div className="text-white/70 text-sm">Game ID: <code className="px-1.5 py-0.5 bg-black/30 rounded">{gameId}</code></div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-80">You</div>
            <div className="text-lg font-bold">{youName || "Anonymous"}</div>
          </div>
        </div>

        {/* Players + Queue */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Players */}
          <div className="md:col-span-2 bg-black/40 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">Players at the table</h2>
              {!youName && (
                <input
                  placeholder="Your name (so we know if you're manager)"
                  className="bg-black/50 border border-white/10 rounded px-3 py-2"
                  value={youName}
                  onChange={(e) => { setYouName(e.target.value); localStorage.setItem("youName", e.target.value); }}
                />
              )}
            </div>

            <ul className="space-y-2">
              {players.map((p, idx) => (
                <li
                  key={p.name}
                  draggable={!!isManager}
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(idx)}
                  className={`flex items-center justify-between bg-black/30 border border-white/10 rounded-xl px-3 py-2 ${isManager ? "cursor-grab" : ""}`}
                  title={isManager ? "Drag to reorder (manager only)" : undefined}
                >
                  <div className="flex items-center gap-3">
                    {isManager && <span className="text-white/40">≡</span>}
                    <span className="font-semibold">{p.name}</span>
                    {idx === 0 && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full">SB</span>
                    )}
                    {idx === 1 && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full">BB</span>
                    )}
                    {p.name === manager && <span className="text-xs px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full">manager</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/70 text-sm">{(p.chips/100).toFixed(2)}$</span>
                    {isManager && p.name !== manager && (
                      <button
                        onClick={() => onMakeManager(p.name)}
                        className="text-xs px-2 py-1 rounded bg-[var(--gold)] text-black font-bold hover:opacity-90"
                      >
                        Make Manager
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Queue */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
            <h2 className="text-xl font-bold mb-3">Queued players</h2>
            {queue.length === 0 && <div className="text-white/60 text-sm">No one queued.</div>}
            <ul className="space-y-2">
              {queue.map((q) => (
                <li key={q.name} className="flex items-center justify-between bg-black/30 border border-white/10 rounded-xl px-3 py-2">
                  <span>{q.name}</span>
                  {isManager && (
                    <button
                      onClick={() => acceptQueued(gameId, manager, q.name, 1000).catch((e: any)=>setError(e.message))}
                      className="text-xs px-2 py-1 rounded bg-white text-black font-bold hover:opacity-90"
                    >
                      Accept ($10.00)
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Settings Panel */}
        <SettingsPanel
          gameId={gameId}
          managerName={manager}
          isManager={isManager}
          players={players.map(p => p.name)}
          currentSmallBlindCents={smallBlindCents}
          currentBigBlindCents={bigBlindCents}
          currentDefaultStartingMoneyCents={defaultStartingMoneyCents}
          currentChipValues={chipValues}
          currentCustomStartingMoneyCents={customStartingMoneyCents}
        />

        {/* Manager actions */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
          <div className="text-white/70 text-sm">When you're ready…</div>
          <button
            onClick={() => startHand(gameId, manager).then(()=>nav(`/bet/${gameId}/${youName}`)).catch((e: unknown)=>setError(e instanceof Error ? e.message : "Failed to start hand"))}
            disabled={!Boolean(isManager)}
            className="px-4 py-2 rounded-lg bg-[var(--gold)] text-black font-bold disabled:opacity-50 hover:opacity-90"
          >
            Start Hand
          </button>
        </div>

        {error && <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-3">{error}</div>}
      </div>
    </div>
  );
}
