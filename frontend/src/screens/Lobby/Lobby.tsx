import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlayers, getSettings, reorderPlayers,
  acceptQueued, startHand, changeManager, removePlayer, setPlayerChips,
  type PlayersResponse,
} from "@/services/api/game";
import { useGameIdentity } from "@/context/GameIdentityContext";
import {
  useLobbyEvents,
  type TableUpdatePayload,
  type PlayersStatePayload,
  type LobbySnapshotPayload,
} from "@/hooks/useLobbyEvents";
import SettingsPanel from "./components/SettingsPanel";

export default function Lobby() {
  const nav = useNavigate();
  const { gameId = "" } = useParams();
  const { youName, setYouName, setManagerName } = useGameIdentity();

  const [players, setPlayers] = useState<PlayersResponse["activePlayers"]>([]);
  const [queue,   setQueue]   = useState<PlayersResponse["queuedPlayers"]>([]);
  const [manager, setManager] = useState("");
  const [error,   setError]   = useState<string | null>(null);

  const [smallBlindCents,             setSmallBlindCents]             = useState<number | undefined>();
  const [bigBlindCents,               setBigBlindCents]               = useState<number | undefined>();
  const [defaultStartingMoneyCents,   setDefaultStartingMoneyCents]   = useState<number | undefined>();
  const [chipValues,                  setChipValues]                  = useState<Record<string, number> | undefined>();
  const [customStartingMoneyCents,    setCustomStartingMoneyCents]    = useState<Record<string, number> | undefined>();

  // Always-current ref so WS callbacks never read stale players state
  const playersRef = useRef<PlayersResponse["activePlayers"]>([]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Keep context in sync whenever manager changes
  useEffect(() => {
    if (manager) setManagerName(manager);
  }, [manager, setManagerName]);

  // Initial data fetch
  useEffect(() => {
    (async () => {
      try {
        const pd = await getPlayers(gameId);
        setPlayers(pd.activePlayers);
        setQueue(pd.queuedPlayers);
        setManager(pd.manager);

        try {
          const sd = await getSettings(gameId);
          setSmallBlindCents(sd.smallBlindCents);
          setBigBlindCents(sd.bigBlindCents);
          setDefaultStartingMoneyCents(sd.defaultStartingMoneyCents);
          setChipValues(sd.chipValues);
        } catch {
          // Settings may not exist yet — populated by WS
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load lobby.");
      }
    })();
  }, [gameId]);

  // WebSocket subscriptions via hook (one connection, 3 topics)
  useLobbyEvents(gameId, {
    onTableUpdate(t: TableUpdatePayload) {
      if (t.manager?.trim()) setManager(t.manager);
      if (t.settings) {
        if (typeof t.settings.smallBlindCents === "number") setSmallBlindCents(t.settings.smallBlindCents);
        if (typeof t.settings.bigBlindCents   === "number") setBigBlindCents(t.settings.bigBlindCents);
      }
      if (typeof t.defaultStartingMoneyCents === "number") setDefaultStartingMoneyCents(t.defaultStartingMoneyCents);
      if (t.chipValues) setChipValues(t.chipValues);
      if (t.customStartingMoneyCents) setCustomStartingMoneyCents(t.customStartingMoneyCents);
      if (t.order && t.order.length > 0) {
        setPlayers((old) => {
          const byName = new Map(old.map((p) => [p.name, p]));
          return t.order!.map((name) => byName.get(name) ?? { name, chips: 0, folded: false, allIn: false });
        });
      }
      if (t.queuedPlayers !== undefined) {
        setQueue(t.queuedPlayers.map((name) => ({ name })));
      }
    },
    onPlayerState(payload: PlayersStatePayload) {
      setPlayers(payload.players.map((p) => ({
        name: p.name, chips: p.chipsCents, folded: p.folded, allIn: p.allIn,
      })));
    },
    onSnapshot(p: LobbySnapshotPayload) {
      if (p.roundName === "Pre-Flop" && playersRef.current.some((pl) => pl.name === youName)) {
        nav(`/bet/${gameId}/${youName}`);
      }
    },
  });

  const isManager = Boolean(youName && manager && youName === manager);

  // Chip editing (manager only, lobby only)
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [chipInput, setChipInput] = useState("");

  function openChipEdit(name: string, currentCents: number) {
    setEditingPlayer(name);
    setChipInput((currentCents / 100).toFixed(2));
  }

  function closeChipEdit() {
    setEditingPlayer(null);
    setChipInput("");
  }

  async function commitChipEdit(name: string) {
    const parsed = parseFloat(chipInput);
    closeChipEdit();
    if (isNaN(parsed) || parsed < 0) return;
    const cents = Math.round(parsed * 100);
    try {
      await setPlayerChips(gameId, manager, name, cents);
      setPlayers((prev) => prev.map((p) => p.name === name ? { ...p, chips: cents } : p));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update chips.");
    }
  }


  // Drag & drop seat reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);

  function onDrop(idx: number) {
    if (dragIndex === null || dragIndex === idx) return;
    const next = [...players];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setDragIndex(null);
    setPlayers(next);
    if (isManager) {
      reorderPlayers(gameId, manager, next.map((p) => p.name))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Reorder failed"));
    }
  }

  async function onMakeManager(name: string) {
    try {
      await changeManager(gameId, manager, name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to change manager.");
    }
  }

  async function onRemovePlayer(name: string) {
    try {
      await removePlayer(gameId, manager, name);
      setPlayers((prev) => prev.filter((p) => p.name !== name));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove player.");
    }
  }


  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">Lobby</h1>
            <div className="text-white/70 text-sm">
              Game ID: <code className="px-1.5 py-0.5 bg-black/30 rounded">{gameId}</code>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-80">You</div>
            <div className="text-lg font-bold">{youName || "Anonymous"}</div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Players */}
          <div className="md:col-span-2 bg-black/40 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">Players at the table</h2>
              {!youName && (
                <input
                  placeholder="Your name"
                  className="bg-black/50 border border-white/10 rounded px-3 py-2"
                  value={youName}
                  onChange={(e) => setYouName(e.target.value)}
                />
              )}
              {isManager && (
                <button
                  onClick={() => setDeleteMode((d) => !d)}
                  title={deleteMode ? "Done removing" : "Remove a player"}
                  className={`p-1.5 rounded-lg transition-all duration-200 ${
                    deleteMode
                      ? "bg-red-600/80 text-white hover:bg-red-500 scale-110"
                      : "text-white/35 hover:text-white/70 hover:bg-white/10"
                  }`}
                >
                  {deleteMode ? (
                    /* X icon */
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  ) : (
                    /* Trash icon */
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  )}
                </button>
              )}
            </div>

            <ul className="space-y-2">
              {players.map((p, idx) => {
                const isRemovable = isManager && p.name !== manager;
                const wiggling = deleteMode && isRemovable;
                const isEditing = editingPlayer === p.name;
                return (
                  <li
                    key={p.name}
                    draggable={isManager && !deleteMode && !isEditing}
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(idx)}
                    className={`flex flex-col bg-black/30 border border-white/10 rounded-xl px-3 py-2 transition-all ${
                      isManager && !deleteMode && !isEditing ? "cursor-grab" : ""
                    } ${wiggling ? "lobby-wiggle" : ""} ${isEditing ? "border-[var(--gold)]/40 bg-black/50" : ""}`}
                    style={wiggling ? { animationDelay: `${idx * 45}ms` } : undefined}
                  >
                    {/* Main row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isManager && (
                          wiggling ? (
                            <button
                              onClick={() => onRemovePlayer(p.name)}
                              className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-200 font-bold text-lg leading-none transition-colors"
                              title={`Remove ${p.name}`}
                            >×</button>
                          ) : (
                            <button
                              onClick={() => isEditing ? closeChipEdit() : openChipEdit(p.name, p.chips)}
                              className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                                isEditing ? "text-[var(--gold)]" : "text-white/40 hover:text-white/70"
                              }`}
                              title={isEditing ? "Close" : "Player options"}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                              </svg>
                            </button>
                          )
                        )}
                        <span className="font-semibold">{p.name}</span>
                        {idx === 0 && <span className="text-xs px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full">SB</span>}
                        {idx === 1 && <span className="text-xs px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full">BB</span>}
                        {p.name === manager && <span className="text-xs px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full">manager</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white/70 text-sm">
                          ${(p.chips / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Options panel — expands below when ⋮ is clicked */}
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-black/50 border border-white/15 rounded-lg px-3 py-2 flex-1">
                          <span className="text-white/40 text-sm font-medium">$</span>
                          <input
                            autoFocus
                            type="text"
                            value={chipInput}
                            onChange={(e) => setChipInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")  commitChipEdit(p.name);
                              if (e.key === "Escape") closeChipEdit();
                            }}
                            className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                            placeholder="0.00"
                          />
                        </div>
                        <button
                          onClick={() => commitChipEdit(p.name)}
                          className="px-4 py-2 rounded-lg bg-[var(--gold)] text-black text-sm font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
                        >
                          Save
                        </button>
                        <button
                          onClick={closeChipEdit}
                          className="px-3 py-2 rounded-lg bg-white/10 text-white/60 text-sm hover:bg-white/15 transition-colors"
                        >
                          Cancel
                        </button>
                        {isRemovable && (
                          <button
                            onClick={() => { onMakeManager(p.name); closeChipEdit(); }}
                            className="px-3 py-2 rounded-lg bg-white/10 text-white/70 text-sm font-semibold hover:bg-[var(--gold)]/20 hover:text-[var(--gold)] transition-colors whitespace-nowrap"
                          >
                            Make Manager
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
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
                      onClick={() => acceptQueued(gameId, manager, q.name, 0).catch((e: any) => setError(e.message))}
                      className="text-xs px-2 py-1 rounded bg-white text-black font-bold hover:opacity-90"
                    >
                      Accept
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <SettingsPanel
          gameId={gameId}
          managerName={manager}
          isManager={isManager}
          players={players.map((p) => p.name)}
          currentSmallBlindCents={smallBlindCents}
          currentBigBlindCents={bigBlindCents}
          currentDefaultStartingMoneyCents={defaultStartingMoneyCents}
          currentChipValues={chipValues}
          currentCustomStartingMoneyCents={customStartingMoneyCents}
        />

        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
          <div className="text-white/70 text-sm">When you're ready…</div>
          <button
            onClick={() =>
              startHand(gameId, manager)
                .then(() => nav(`/bet/${gameId}/${youName}`))
                .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to start hand"))
            }
            disabled={!isManager}
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
