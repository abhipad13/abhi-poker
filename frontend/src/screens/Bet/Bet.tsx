import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { makeMove, getGameSnapshot, type GameSnapshot } from "@/services/api/game";
import { useStompTopic } from "@/hooks/useStompTopic";
import ChipArea, { type ChipAreaHandle, type Denomination, type DenomConfig } from "./components/ChipArea";
import BettingControls from "./components/BettingControls";
import RoundOverlay from "./components/RoundOverlay";
// @ts-ignore
import chipSfxUrl from "../../../chip-audio.wav?url";

const CHIP_COLORS: Record<Denomination, string> = { 1: "white", 5: "red", 25: "green", 100: "blue", 500: "black" };

export default function Bet({ gameId, playerName }: { gameId: string; playerName: string }) {
  const [gameState, setGameState] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bet, setBet] = useState(0);
  const [notification, setNotification] = useState<{ text: string; isError: boolean } | null>(null);
  const [notifVisible, setNotifVisible] = useState(false);
  const [roundOverlay, setRoundOverlay] = useState<{ visible: boolean; text: string }>({ visible: false, text: "" });
  const [chipDenoms, setChipDenoms] = useState<Record<Denomination, number>>({ 1: 1, 5: 5, 25: 25, 100: 100, 500: 500 });

  const nav = useNavigate();
  const chipAreaRef = useRef<ChipAreaHandle>(null);
  const chipAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevRoundRef = useRef<string | null>(null);
  const currentTurnPlayerRef = useRef<string | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPlayer = gameState?.players.find((p) => p.name === playerName);
  const isMyTurn = gameState?.turnPlayer === playerName;
  const canAct = isMyTurn && currentPlayer && !currentPlayer.folded && !currentPlayer.allIn;
  const availableDollars = (currentPlayer?.displayCents ?? 0) / 100;

  useEffect(() => {
    try {
      chipAudioRef.current = new Audio(chipSfxUrl as string);
      chipAudioRef.current.volume = 0.5;
      chipAudioRef.current.preload = "auto";
    } catch {}
  }, []);

  // Initial snapshot fetch
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
        setError(err instanceof Error ? err.message : "Failed to fetch game state");
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

  // WebSocket: game snapshot
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

  // WebSocket: log notifications
  useStompTopic<{ message?: string; error?: boolean }>(`/topic/game.${gameId}.log`, (payload) => {
    const text = payload?.message;
    const isError = Boolean(payload?.error);
    if (!text) return;
    if (isError && currentTurnPlayerRef.current !== playerName) return;
    showNotification(String(text), isError);
  });

  function showNotification(text: string, isError = false) {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    setNotification({ text, isError });
    setNotifVisible(true);
    notifTimerRef.current = setTimeout(() => {
      setNotifVisible(false);
      setTimeout(() => setNotification(null), 150);
    }, 1500);
  }

  function pulseElement(id: string) {
    document.getElementById(id)?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
      { duration: 180, easing: "ease-out" }
    );
  }

  function handleChipClick(denom: Denomination) {
    if (chipAudioRef.current) {
      const s = chipAudioRef.current.cloneNode(true) as HTMLAudioElement;
      s.volume = 0.5;
      void s.play().catch(() => {});
    }
    const added = chipAreaRef.current?.addChip(denom, chipDenoms[denom], CHIP_COLORS[denom], availableDollars - bet) ?? 0;
    if (added > 0) {
      setBet((prev) => prev + added);
      pulseElement("betAmt");
    }
  }

  async function handleBet() {
    if (bet <= 0 || bet > availableDollars) return;
    const serverContrib = (currentPlayer?.contributionCents ?? 0) / 100;
    const totalCents = Math.round((bet + serverContrib) * 100);

    if (canAct) {
      try {
        await makeMove(gameId, { playerId: playerName, selection: "CALL_RAISE", bet: totalCents });
        chipAreaRef.current?.flyChips(() => setBet(0));
      } catch {
        setBet(0);
        chipAreaRef.current?.clearChips();
      }
    } else {
      chipAreaRef.current?.flyChips(() => setBet(0));
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

  function handleClear() {
    if (bet <= 0) return;
    chipAreaRef.current?.clearChips();
    setBet(0);
    pulseElement("betAmt");
  }

  async function handleFold() {
    if (!canAct) return;
    try {
      await makeMove(gameId, { playerId: playerName, selection: "FOLD", bet: 0 });
    } catch (err) {
      console.warn("Fold failed:", err);
    }
  }

  const denomConfigs: DenomConfig[] = ([1, 5, 25, 100, 500] as Denomination[]).map((d) => ({
    denom: d,
    displayValue: chipDenoms[d],
    color: CHIP_COLORS[d],
  }));

  if (loading) return <div className="text-white p-8">Loading game...</div>;
  if (error)   return <div className="text-red-500 p-8">{error}</div>;
  if (!gameState) return <div className="text-white p-8">No game state available.</div>;

  const fmt = (n: number) => "$" + n.toLocaleString();
  const currentBetDisplay = ((currentPlayer?.contributionCents ?? 0) / 100) + bet;

  return (
    <div
      className="min-h-screen bg-[#0b6b3a] flex items-center justify-center p-0"
      style={{
        backgroundImage: `radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px), radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)`,
        backgroundPosition: "0 0, 25px 25px",
        backgroundSize: "50px 50px",
      }}
    >
      <div className="w-full max-w-[1000px] bg-black/45 border border-white/12 rounded-[18px] shadow-2xl backdrop-blur-sm p-6 relative overflow-hidden">
        <RoundOverlay visible={roundOverlay.visible} text={roundOverlay.text} />

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap mb-[18px]">
          <div className={`font-extrabold text-[28px] tracking-[0.3px] ${isMyTurn ? "cool-name" : "text-white"}`}>
            {playerName}
          </div>

          <div className="notifications-container flex justify-center">
            {isMyTurn && !notifVisible && (() => {
              const isPreFlop = gameState.roundName === "Pre-Flop";
              const sbName = gameState.players[0]?.name;
              const bbName = gameState.players[1]?.name;
              const sbPosted = (gameState.players[0]?.contributionCents ?? 0) > 0;
              const bbPosted = (gameState.players[1]?.contributionCents ?? 0) > 0;
              const postingSB = isPreFlop && playerName === sbName && !sbPosted && gameState.smallBlindCents != null;
              const postingBB = isPreFlop && playerName === bbName && !bbPosted && gameState.bigBlindCents  != null;

              if (postingSB) return (
                <div className="turn-info-badge">
                  <div className="turn-info-content">
                    Small Blind: {fmt(gameState.smallBlindCents! / 100)}
                  </div>
                </div>
              );
              if (postingBB) return (
                <div className="turn-info-badge">
                  <div className="turn-info-content">
                    Big Blind: {fmt(gameState.bigBlindCents! / 100)}
                  </div>
                </div>
              );
              if (gameState.minCallAmt != null && gameState.minRaiseAmt != null) return (
                <div className="turn-info-badge">
                  <div className="turn-info-content">
                    Min Call: {fmt(gameState.minCallAmt / 100)} • Min Raise: {fmt(gameState.minRaiseAmt / 100)}
                  </div>
                </div>
              );
              return null;
            })()}
            {notification && (
              <div className={`notification-badge ${notification.isError ? "error" : ""} ${notifVisible ? "show" : "hide"}`}>
                <div className="notification-content">{notification.text}</div>
              </div>
            )}
          </div>

          <div className="flex gap-[18px] flex-wrap">
            <div className="border border-white/12 rounded-full px-[14px] py-[10px] bg-white/6 font-bold">
              <small className="block font-semibold text-white/75 text-[11px] tracking-[0.3px]">Your Stack</small>
              <strong className="block text-[18px]">{fmt(availableDollars)}</strong>
            </div>
            <div className="border border-white/12 rounded-full px-[14px] py-[10px] bg-white/6 font-bold">
              <small className="block font-semibold text-white/75 text-[11px] tracking-[0.3px]">Table Pot</small>
              <strong className="block text-[18px]">{fmt(gameState.totalPot / 100)}</strong>
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/25 to-transparent my-[18px]" />

        <ChipArea ref={chipAreaRef} denomConfigs={denomConfigs} onChipClick={handleChipClick} />

        <BettingControls
          currentBetDisplay={currentBetDisplay}
          canAct={Boolean(canAct)}
          hasBet={bet > 0}
          currentBet={bet}
          maxBet={availableDollars}
          onBet={handleBet}
          onCheck={handleCheck}
          onClear={handleClear}
          onFold={handleFold}
        />

        <p className="mt-3 pt-4 text-xs text-white/75 text-center" style={{ paddingTop: '16px' }}>
          {canAct ? (
            "Click chips to add them to your bet. Hit 'Bet' to commit your chips to the pot!"
          ) : (
            <span>
              Waiting for {gameState.turnPlayer} to act
              <span className="typing-dots" />
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
