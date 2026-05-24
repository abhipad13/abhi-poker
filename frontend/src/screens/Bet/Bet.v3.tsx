import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { makeMove, getGameSnapshot, type GameSnapshot } from "@/services/api/game";
import { useStompTopic } from "@/hooks/useStompTopic";
import RoundOverlay from "./components/RoundOverlay";
import HandGuideOverlay from "./components/HandGuideOverlay";
// @ts-ignore
import chipSfxUrl from "../../../chip-audio.wav?url";

type Denom = 1 | 5 | 25 | 100 | 500;
type ChipEntry = { id: number; denom: Denom; value: number };

const DENOM_CLASS: Record<Denom, string> = { 1: "c1", 5: "c5", 25: "c25", 100: "c100", 500: "c500" };
const DENOMS: Denom[] = [1, 5, 25, 100, 500];
const DENOMS_DESC: Denom[] = [500, 100, 25, 5, 1];

const fmtDollars = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function BetV3({ gameId, playerName }: { gameId: string; playerName: string }) {
  const [gameState, setGameState] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chips, setChips] = useState<ChipEntry[]>([]);
  const [animating, setAnimating] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [handsOpen, setHandsOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [notifVisible, setNotifVisible] = useState(false);
  const [chipDenoms, setChipDenoms] = useState<Record<Denom, number>>({ 1: 1, 5: 5, 25: 25, 100: 100, 500: 500 });
  const [roundOverlay, setRoundOverlay] = useState<{ visible: boolean; text: string }>({ visible: false, text: "" });

  const chipRefs = useRef<Record<number, HTMLElement | null>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRoundRef = useRef<string | null>(null);
  const currentTurnPlayerRef = useRef<string | null>(null);
  const presetMenuRef = useRef<HTMLDivElement>(null);
  const presetTrigRef = useRef<HTMLButtonElement>(null);
  const chipAudioRef = useRef<HTMLAudioElement | null>(null);

  const nav = useNavigate();

  const currentPlayer = gameState?.players.find((p) => p.name === playerName);
  const isMyTurn = gameState?.turnPlayer === playerName;
  const canAct = isMyTurn && currentPlayer && !currentPlayer.folded && !currentPlayer.allIn;
  const stackDollars = (currentPlayer?.displayCents ?? 0) / 100;
  const contributionDollars = (currentPlayer?.contributionCents ?? 0) / 100;
  const bet = chips.reduce((s, c) => s + c.value, 0);

  // ── Audio ────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      chipAudioRef.current = new Audio(chipSfxUrl as string);
      chipAudioRef.current.volume = 0.5;
      chipAudioRef.current.preload = "auto";
    } catch {}
  }, []);

  function playChipSound() {
    if (!chipAudioRef.current) return;
    const s = chipAudioRef.current.cloneNode(true) as HTMLAudioElement;
    s.volume = 0.5;
    void s.play().catch(() => {});
  }

  // ── Initial snapshot ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const snapshot = await getGameSnapshot(gameId);
        setGameState(snapshot);
        currentTurnPlayerRef.current = snapshot.turnPlayer ?? null;
        if (snapshot.chipValues) applyChipValues(snapshot.chipValues);
        if (snapshot.roundName) {
          prevRoundRef.current = snapshot.roundName;
          setRoundOverlay({ visible: true, text: snapshot.roundName });
          setTimeout(() => setRoundOverlay((r) => ({ ...r, visible: false })), 2500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load game");
      } finally {
        setLoading(false);
      }
    })();
  }, [gameId]);

  function applyChipValues(cv: Record<string, number>) {
    setChipDenoms({
      1:   (cv.white ?? 100)   / 100,
      5:   (cv.red   ?? 500)   / 100,
      25:  (cv.green ?? 2500)  / 100,
      100: (cv.blue  ?? 10000) / 100,
      500: (cv.black ?? 50000) / 100,
    });
  }

  // ── WebSocket: snapshot ───────────────────────────────────────────────────
  useStompTopic<GameSnapshot>(`/topic/game.${gameId}.snapshot`, (snapshot) => {
    setGameState(snapshot);
    currentTurnPlayerRef.current = snapshot.turnPlayer ?? null;

    const prev = prevRoundRef.current;
    const next = snapshot.roundName;
    if (prev && next && prev !== next) {
      setRoundOverlay({ visible: true, text: next });
      setTimeout(() => setRoundOverlay((r) => ({ ...r, visible: false })), 2500);
    }
    prevRoundRef.current = next ?? null;

    if (snapshot.roundName?.toLowerCase() === "showdown") {
      nav(`/showdown/${gameId}/${playerName}`);
      return;
    }
    if (snapshot.chipValues) applyChipValues(snapshot.chipValues);
  });

  // ── WebSocket: log notifications ──────────────────────────────────────────
  useStompTopic<{ message?: string; error?: boolean }>(`/topic/game.${gameId}.log`, (payload) => {
    const text = payload?.message;
    const isError = Boolean(payload?.error);
    if (!text) return;
    if (isError && currentTurnPlayerRef.current !== playerName) return;
    showNotification(String(text));
  });

  // ── Notification ──────────────────────────────────────────────────────────
  function showNotification(text: string) {
    if (notifTimer.current) clearTimeout(notifTimer.current);
    setNotification(text);
    setNotifVisible(true);
    notifTimer.current = setTimeout(() => {
      setNotifVisible(false);
      setTimeout(() => setNotification(null), 320);
    }, 1500);
  }

  // ── Preset menu close-on-outside-click ────────────────────────────────────
  useEffect(() => {
    if (!presetMenuOpen) return;
    function onDown(e: PointerEvent) {
      if (presetMenuRef.current?.contains(e.target as Node)) return;
      if (presetTrigRef.current?.contains(e.target as Node)) return;
      setPresetMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [presetMenuOpen]);

  // ── Chip helpers ──────────────────────────────────────────────────────────
  function addChip(denom: Denom) {
    if (animating) return;
    const value = chipDenoms[denom];
    if (bet + value > stackDollars) return;
    playChipSound();
    setInteracted(true);
    idCounter.current += 1;
    setChips((prev) => [...prev, { id: idCounter.current, denom, value }]);
  }

  function setBetTo(target: number) {
    if (animating) return;
    setInteracted(true);
    const capped = Math.max(0, Math.min(Math.floor(target), stackDollars));
    const result: ChipEntry[] = [];
    let remaining = capped;
    for (const d of DENOMS_DESC) {
      const val = chipDenoms[d];
      if (val <= 0) continue;
      while (remaining >= val) {
        idCounter.current += 1;
        result.push({ id: idCounter.current, denom: d, value: val });
        remaining -= val;
      }
    }
    setChips(result);
    setPresetMenuOpen(false);
  }

  function clearChips() {
    if (animating || chips.length === 0) return;
    setAnimating(true);
    chips.forEach((c, idx) => {
      const el = chipRefs.current[c.id];
      if (!el) return;
      setTimeout(() => {
        el.animate(
          [
            { opacity: "1", transform: "translateX(-50%) scale(1)" },
            { opacity: "0", transform: "translateX(-50%) scale(0.5)" },
          ],
          { duration: 200, easing: "ease-out", fill: "forwards" }
        );
      }, idx * 20);
    });
    const total = chips.length * 20 + 200 + 60;
    setTimeout(() => {
      setChips([]);
      setAnimating(false);
    }, total);
  }

  function flyBet(onDone?: () => void) {
    if (animating || chips.length === 0) { onDone?.(); return; }
    setAnimating(true);

    const rootEl = rootRef.current;
    if (!rootEl) { setChips([]); setAnimating(false); onDone?.(); return; }

    const rect = rootEl.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top - 140;

    let maxDelay = 0;
    chips.forEach((c, idx) => {
      const el = chipRefs.current[c.id];
      if (!el) return;
      const delay = idx * 25;
      maxDelay = Math.max(maxDelay, delay);
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        const dx = targetX - (r.left + r.width / 2);
        const dy = targetY - (r.top + r.height / 2);
        el.animate(
          [
            { transform: "translateX(-50%) translate(0,0) scale(1)", opacity: "1" },
            { transform: `translateX(-50%) translate(${dx}px,${dy}px) scale(0.9)`, opacity: "1" },
          ],
          { duration: 520, easing: "cubic-bezier(.4,.0,.6,1)", fill: "forwards" }
        );
      }, delay);
    });

    const total = maxDelay + 520 + 80;
    setTimeout(() => {
      setChips([]);
      setAnimating(false);
      onDone?.();
    }, total);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const minOpenBetDollars = (gameState?.bigBlindCents ?? 0) / 100;
  const isOpenBet = !gameState?.lastAggressorName || gameState?.lastAggressorAction === "blind";
  const betTooSmall = isOpenBet && bet > 0 && bet < minOpenBetDollars;

  async function handleBet() {
    if (animating || bet <= 0 || bet > stackDollars || !canAct || betTooSmall) return;
    const totalCents = Math.round((bet + contributionDollars) * 100);
    try {
      await makeMove(gameId, { playerId: playerName, selection: "CALL_RAISE", bet: totalCents });
      showNotification(`Bet $${bet.toLocaleString()}`);
      flyBet();
    } catch (err) {
      console.warn("Bet failed:", err);
      clearChips();
    }
  }

  async function handleCheck() {
    if (!canAct) return;
    try {
      await makeMove(gameId, { playerId: playerName, selection: "CHECK", bet: 0 });
    } catch (err) {
      console.warn("Check failed:", err);
    }
  }

  async function handleFold() {
    if (!canAct) return;
    try {
      await makeMove(gameId, { playerId: playerName, selection: "FOLD", bet: 0 });
    } catch (err) {
      console.warn("Fold failed:", err);
    }
  }

  // ── Presets ───────────────────────────────────────────────────────────────
  const presets = [
    { id: "call",  label: "CALL",    value: Math.min(Math.round((gameState?.minCallAmt  ?? 0) / 100), stackDollars) },
    { id: "raise", label: "RAISE",   value: Math.min(Math.round((gameState?.minRaiseAmt ?? 0) / 100), stackDollars) },
    { id: "half",  label: "½ POT",   value: Math.min(Math.round((gameState?.totalPot ?? 0) / 200), stackDollars) },
    { id: "pot",   label: "POT",     value: Math.min(Math.round((gameState?.totalPot ?? 0) / 100), stackDollars) },
    { id: "allin", label: "ALL-IN",  value: stackDollars },
  ];

  // ── Action context pill ───────────────────────────────────────────────────
  function renderActionPill() {
    if (!isMyTurn || !gameState) return null;

    const isPreFlop = gameState.roundName === "Pre-Flop";
    const sbName  = gameState.players[0]?.name;
    const bbName  = gameState.players[1]?.name;
    const sbPosted = (gameState.players[0]?.contributionCents ?? 0) > 0;
    const bbPosted = (gameState.players[1]?.contributionCents ?? 0) > 0;

    const toCallDollars = Math.max(
      0,
      ((gameState.minCallAmt ?? 0) - (currentPlayer?.contributionCents ?? 0)) / 100
    );
    const aggAction = gameState.lastAggressorAction ?? null;
    const aggName   = gameState.lastAggressorName   ?? null;
    const aggAmt    = (gameState.lastAggressorAmtCents ?? 0) / 100;

    const dot  = <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>;
    const call = <><span style={{ color: "var(--gold)" }}>{fmtDollars(toCallDollars)}</span>{" to call"}</>;

    // 1. SB hasn't posted yet
    if (isPreFlop && playerName === sbName && !sbPosted && gameState.smallBlindCents != null) {
      return <div className="turnBadge">Post small blind: {fmtDollars(gameState.smallBlindCents / 100)}</div>;
    }

    // 2. BB hasn't posted yet
    if (isPreFlop && playerName === bbName && !bbPosted && gameState.bigBlindCents != null) {
      return <div className="turnBadge">Post big blind: {fmtDollars(gameState.bigBlindCents / 100)}</div>;
    }

    // 3. No aggressor (or blind was the aggressor), preflop — blinds posted
    if ((!aggName || aggAction === "blind") && isPreFlop) {
      const bbAmt = aggAction === "blind" ? aggAmt : (gameState.bigBlindCents ?? 0) / 100;
      return <div className="turnBadge">BB posted {fmtDollars(bbAmt)}{dot}{call}</div>;
    }

    // 4. No aggressor, not preflop — first to act
    if (!aggName && !isPreFlop) {
      return (
        <div className="turnBadge">
          Min bet: {fmtDollars((gameState.bigBlindCents ?? 0) / 100)}{dot}or check
        </div>
      );
    }

    // 5–8. Aggressor exists
    let left = "";
    if      (aggAction === "bet")      left = `${aggName} bet ${fmtDollars(aggAmt)}`;
    else if (aggAction === "raised")   left = `${aggName} raised to ${fmtDollars(aggAmt)}`;
    else if (aggAction === "reraised") left = `${aggName} re-raised to ${fmtDollars(aggAmt)}`;
    else if (aggAction === "allin")    left = `${aggName} all-in ${fmtDollars(aggAmt)}`;
    else return null;

    return <div className="turnBadge">{left}{dot}{call}</div>;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="min-h-screen flex items-center justify-center text-white">Loading…</div>;
  if (error)   return <div className="min-h-screen flex items-center justify-center text-red-400">{error}</div>;
  if (!gameState) return null;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 844, height: 393, flexShrink: 0 }}>
      <div className="d6 d6-v3" data-frame="panel" data-breaks="subtle" data-felt="classic" ref={rootRef}>
        <RoundOverlay visible={roundOverlay.visible} text={roundOverlay.text} />

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--gold)" }}>
              {isMyTurn ? "YOUR TURN" : "TURN"}
            </div>
            <h1>{playerName}</h1>
          </div>

          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            {notification ? (
              <div className={`notif ${notifVisible ? "show" : ""}`}>{notification}</div>
            ) : (
              renderActionPill()
            )}
            {!isMyTurn && !notification && (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Waiting for {gameState.turnPlayer}
                <span className="typing-dots" />
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div className="pill">
              <span className="label">Stack</span>
              <span className="v">{fmtDollars(stackDollars)}</span>
            </div>
            <div className="pill gold">
              <span className="label" style={{ color: "var(--gold)" }}>Pot</span>
              <span className="v">{fmtDollars((gameState.totalPot ?? 0) / 100)}</span>
            </div>
          </div>
        </div>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <div className="divider timed"><i /><i /></div>

        {/* ── Chip row ────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            flex: 1,
          }}
        >
          {DENOMS.map((d) => {
            const colChips = chips.filter((c) => c.denom === d);
            const denomVal = chipDenoms[d];
            return (
              <div key={d} className="chipCol">
                {/* Ghost base chip — always present, fades when interacted */}
                <div
                  className={`chip ${DENOM_CLASS[d]} base ghost${interacted ? "" : " idle"}`}
                  onClick={() => addChip(d)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && addChip(d)}
                >
                  <div className="core">${denomVal}</div>
                </div>

                {/* Stacked chips */}
                {colChips.map((c, i) => (
                  <div
                    key={c.id}
                    ref={(el) => { chipRefs.current[c.id] = el; }}
                    className={`chip ${DENOM_CLASS[d]} stacked`}
                    style={{ bottom: i * 12, zIndex: 2 + i }}
                    onClick={() => addChip(d)}
                  >
                    <div className="core">${c.value}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── Bet box + actions ────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", marginTop: 12 }}>

          {/* Bet box */}
          <div className="betBoxWrap">
            {contributionDollars > 0 && (
              <div className="tabRow">
                <div className="betBoxTab">
                  You committed: <span className="v">{fmtDollars(contributionDollars)}</span>
                </div>
              </div>
            )}
            <div
              className="betBox"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px 10px 10px", position: "relative", overflow: "hidden" }}
            >
              {/* Preset menu trigger */}
              <button
                ref={presetTrigRef}
                className={`presetTrig ${presetMenuOpen ? "open" : ""}`}
                onClick={() => setPresetMenuOpen((o) => !o)}
                disabled={animating}
                aria-label="Quick-bet presets"
                aria-expanded={presetMenuOpen}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <rect x="2.5" y="3"   width="11" height="2.2" rx="1.1" />
                  <rect x="2.5" y="6.9" width="11" height="2.2" rx="1.1" />
                  <rect x="2.5" y="10.8" width="11" height="2.2" rx="1.1" />
                </svg>
              </button>

              {/* Bet amount + inline undo */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 12,
                  opacity: presetMenuOpen ? 0 : 1,
                  transition: "opacity .15s",
                }}
              >
                {bet > 0 && !animating && (
                  <button
                    className="undoInline"
                    onClick={clearChips}
                    title="Undo all chips"
                    aria-label="Undo all chips"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 7v6h6" />
                      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                    </svg>
                  </button>
                )}
                <span className="num" style={{ fontSize: 44, color: "var(--gold)", lineHeight: 1 }}>
                  ${bet.toLocaleString()}
                </span>
              </div>

              {/* Preset menu */}
              <div
                ref={presetMenuRef}
                className={`presetMenu ${presetMenuOpen ? "open" : ""}`}
                role="menu"
                aria-hidden={!presetMenuOpen}
              >
                {presets.map((p) => (
                  <button
                    key={p.id}
                    className="presetItem"
                    onClick={() => setBetTo(p.value)}
                    disabled={animating || p.value === 0}
                    role="menuitem"
                    style={{ fontSize: "11px" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            <button
              className="btn gold"
              onClick={handleBet}
              disabled={bet === 0 || animating || !canAct || betTooSmall}
              style={{ minWidth: 80 }}
            >
              Bet
            </button>
            <button
              className="btn ghost"
              onClick={handleCheck}
              disabled={animating || !canAct}
            >
              Check
            </button>
            <button
              className="btn danger"
              onClick={handleFold}
              disabled={animating || !canAct}
            >
              Fold
            </button>

            {/* Hand guide in the undo slot position */}
            <button
              className="undoBtn handsUndoSlot"
              onClick={() => setHandsOpen(true)}
              title="Poker hand guide"
              aria-label="Poker hand guide"
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2.5" y="2.5" width="7" height="10" rx="1.3" fill="currentColor" opacity="0.55" transform="rotate(-8 6 7.5)" />
                <rect x="6"   y="3"   width="7" height="10" rx="1.3" fill="currentColor" opacity="0.95" transform="rotate(8 9.5 8)" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Hand Guide overlay ───────────────────────────────────────────── */}
        <HandGuideOverlay open={handsOpen} onClose={() => setHandsOpen(false)} />
      </div>
      </div>
    </div>
  );
}
