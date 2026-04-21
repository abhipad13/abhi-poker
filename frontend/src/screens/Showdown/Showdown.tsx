import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getShowdownInfo, assignWinners, startHand, type ShowdownInfo, type WinningsPayload, type GameSnapshot } from "@/services/api/game";
import { useGameIdentity } from "@/context/GameIdentityContext";
import { useShowdownEvents } from "@/hooks/useShowdownEvents";
import { useStompTopic } from "@/hooks/useStompTopic";

export default function Showdown({ gameId, playerName }: { gameId: string; playerName: string }) {
  const nav = useNavigate();
  const { managerName } = useGameIdentity();
  const isManager = managerName === playerName;

  const [introPlaying,  setIntroPlaying]  = useState(true);
  const [info,          setInfo]          = useState<ShowdownInfo | null>(null);
  const [showdownOver,  setShowdownOver]  = useState(false);
  const [startingNext,  setStartingNext]  = useState(false);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [selectedWinners, setSelectedWinners] = useState<Set<string>>(new Set());
  const [instructionText, setInstructionText] = useState(
    isManager ? "Select winner(s) for this pot" : "Waiting for manager to distribute the pot"
  );

  useEffect(() => {
    const t = setTimeout(() => setIntroPlaying(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // Initial HTTP fetch
  useEffect(() => {
    let cancelled = false;
    getShowdownInfo(gameId)
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((e) => console.error("Failed to fetch showdown info", e));
    return () => { cancelled = true; };
  }, [gameId]);

  // WebSocket: showdown updates + winnings
  useShowdownEvents(gameId, {
    onShowdownUpdate: setInfo,
    onWinnings:       handleWinnings,
  });

  // WebSocket: snapshot — redirect everyone when next hand starts
  useStompTopic<GameSnapshot>(`/topic/game.${gameId}.snapshot`, (snapshot) => {
    if (snapshot.roundName === "Pre-Flop") nav(`/bet/${gameId}/${playerName}`);
  });

  const totalPotDollars = useMemo(() => (info ? (info.totalPot ?? 0) / 100 : 0), [info]);

  const playersView = useMemo(() => {
    if (!info) return [] as { id: string; name: string; moneyDollars: number; status: string; eligible: boolean }[];
    return info.players.map((p) => ({
      id:           p.name,
      name:         p.name,
      moneyDollars: (p.moneyCents ?? 0) / 100,
      status:       p.allIn ? "All-in" : p.folded ? "Folded" : "Active",
      eligible:     !p.folded,
    }));
  }, [info]);

  function toggleWinner(id: string) {
    setSelectedWinners((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function onConfirmWinners() {
    if (selectedWinners.size === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      await assignWinners(gameId, Array.from(selectedWinners));
      setSelectedWinners(new Set());
    } catch (e) {
      console.error("Failed to assign winners", e);
      alert("Failed to assign winners. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleWinnings(winnings: WinningsPayload) {
    const totalWonCents = Object.values(winnings.winningsCents).reduce((s, v) => s + v, 0);
    setInfo((prev) => prev ? { ...prev, totalPot: Math.max(0, prev.totalPot - totalWonCents) } : prev);

    const playersListEl = document.getElementById("playersList");
    const potCircleEl   = document.getElementById("potCircle");
    if (playersListEl && potCircleEl) {
      Object.entries(winnings.winningsCents).forEach(([name, cents], i) => {
        const playerEl = playersListEl.querySelector(`[data-player-id="${CSS.escape(name)}"]`) as HTMLElement | null;
        if (!playerEl) return;
        setTimeout(async () => {
          await animateChipTransfer(playerEl, potCircleEl, cents / 100);
          setInfo((prev) => {
            if (!prev) return prev;
            return { ...prev, players: prev.players.map((p) => p.name === name ? { ...p, moneyCents: p.moneyCents + cents } : p) };
          });
        }, i * 200);
      });
    }

    setShowdownOver(Boolean(winnings.showdownOver));
    setInstructionText(winnings.showdownOver ? "Showdown complete" : "Select the next winner(s) for this pot");
    if (winnings.showdownOver) setSelectedWinners(new Set());
  }

  async function onStartNextHand() {
    if (startingNext) return;
    try {
      setStartingNext(true);
      await startHand(gameId, playerName);
      window.location.href = `/bet/${gameId}/${playerName}`;
    } catch (e) {
      console.error("Failed to start next hand", e);
      alert("Failed to start next hand. Please try again.");
    } finally {
      setStartingNext(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        backgroundColor: "#0b6b3a",
        backgroundImage: `radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px), radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)`,
        backgroundPosition: "0 0, 25px 25px",
        backgroundSize: "50px 50px",
      }}
    >
      {introPlaying && (
        <div className="showdown-overlay" aria-hidden>
          <div className="showdown-backdrop" />
          <div className="showdown-center">
            <span className="sword-giant left">🗡️</span>
            <div className="showdown-title">Showdown</div>
            <span className="sword-giant right">🗡️</span>
          </div>
        </div>
      )}

      {!introPlaying && (
        <div className="showdown-container">
          {/* Game info badge */}
          <div style={{ position: "absolute", top: 14, right: 16, color: "rgba(255,255,255,0.75)", fontSize: 12, textAlign: "right" }}>
            <div>Game: <code style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 6 }}>{gameId}</code></div>
            <div style={{ marginTop: 4 }}>You: <strong style={{ color: "#fff" }}>{playerName}</strong></div>
            {!isManager && <div style={{ marginTop: 6, color: "rgba(255,255,255,0.7)" }}>Manager-only controls</div>}
          </div>

          {/* Pot */}
          <div className="pot-section">
            <div className="pot-circle" id="potCircle">
              <div className="pot-label">Total Pot</div>
              <div className="pot-amount" id="potAmount">${totalPotDollars.toLocaleString()}</div>
            </div>
          </div>

          <div className="showdown-instruction">{instructionText}</div>

          {/* Players */}
          <div className="players-section">
            <div
              className="players-list"
              id="playersList"
              style={!isManager || isProcessing ? { pointerEvents: "none", opacity: isManager ? 1 : 0.6 } : undefined}
            >
              {playersView.length === 0 && <div style={{ color: "var(--muted)" }}>Waiting for showdown info…</div>}
              {playersView.map((p) => (
                <div
                  key={p.id}
                  className={`player ${!p.eligible ? "ineligible" : ""} ${selectedWinners.has(p.id) ? "selected" : ""}`}
                  data-player-id={p.id}
                  onClick={() => { if (p.eligible && !isProcessing) toggleWinner(p.id); }}
                >
                  {selectedWinners.has(p.id) && <div className="winner-badge">✓</div>}
                  <div className="player-name">{p.name}</div>
                  <div className="player-money" data-player-money={p.id}>${p.moneyDollars.toLocaleString()}</div>
                  <div className="player-status">{p.status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="confirm-section">
            {showdownOver ? (
              <div className="manager-actions">
                <a className="btn-confirm active" href={`/lobby/${gameId}`} style={{ textDecoration: "none", display: "inline-block" }}>
                  Lobby
                </a>
                {isManager && (
                  <button className="btn-confirm active" onClick={onStartNextHand} disabled={startingNext}>
                    {startingNext ? "Starting…" : "Next Hand"}
                  </button>
                )}
              </div>
            ) : (
              isManager && (
                <button
                  className={`btn-confirm ${selectedWinners.size > 0 ? "active" : ""} ${isProcessing ? "btn-loading" : ""}`}
                  onClick={onConfirmWinners}
                  disabled={selectedWinners.size === 0 || isProcessing}
                >
                  {isProcessing
                    ? <><span className="spinner" /> Processing...</>
                    : selectedWinners.size > 0
                      ? `Confirm ${selectedWinners.size} Winner${selectedWinners.size > 1 ? "s" : ""}`
                      : "Confirm Winners"}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chip transfer animation helpers ──────────────────────────────────────────

function createParticleTrail(startX: number, startY: number, endX: number, endY: number, delay: number) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const trail = document.createElement("div");
      trail.className = "chip-trail";
      const p = i / count;
      trail.style.left   = `${startX + (endX - startX) * p - 4}px`;
      trail.style.top    = `${startY + (endY - startY) * p - 4}px`;
      trail.style.position = "fixed";
      trail.style.animation = "trailFade 0.6s ease-out forwards";
      document.body.appendChild(trail);
      setTimeout(() => trail.remove(), 600);
    }, delay + i * (1200 / count));
  }
}

function createMoneyBurst(playerEl: HTMLElement) {
  const burst = document.createElement("div");
  burst.className = "money-burst";
  for (let i = 0; i < 12; i++) {
    const particle = document.createElement("div");
    particle.className = "burst-particle";
    const angle = (Math.PI * 2 * i) / 12;
    const dist  = 60 + Math.random() * 40;
    particle.style.setProperty("--end-position", `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`);
    const size = 8 + Math.random() * 8;
    particle.style.width  = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.animationDelay = `${Math.random() * 0.2}s`;
    burst.appendChild(particle);
  }
  playerEl.appendChild(burst);
  setTimeout(() => burst.remove(), 1200);
}

function showMoneyIncrement(playerEl: HTMLElement, amount: number) {
  const inc = document.createElement("div");
  inc.className   = "money-increment";
  inc.textContent = `+${amount}`;
  playerEl.appendChild(inc);
  setTimeout(() => inc.remove(), 2000);
}

function animateChipTransfer(playerEl: HTMLElement, potCircleEl: HTMLElement, dollars: number): Promise<void> {
  return new Promise((resolve) => {
    const potRect    = potCircleEl.getBoundingClientRect();
    const playerRect = playerEl.getBoundingClientRect();
    playerEl.classList.add("receiving");

    const startX = potRect.left    + potRect.width  / 2;
    const startY = potRect.top     + potRect.height / 2;
    const endX   = playerRect.left + playerRect.width  / 2;
    const endY   = playerRect.top  + playerRect.height / 2;

    const chipCount = Math.min(Math.floor(dollars) + 1, 5);
    let completed   = 0;

    for (let i = 0; i < chipCount; i++) {
      setTimeout(() => {
        const chip = document.createElement("div");
        chip.className = "chip-animation";
        chip.innerHTML = `<div class="chip-inner"><div class="chip-face chip-front">$</div><div class="chip-face chip-back"></div></div>`;
        const angle  = (Math.PI * 2 * i) / chipCount;
        const radius = 30;
        const ox = Math.cos(angle) * radius;
        const oy = Math.sin(angle) * radius;
        chip.style.left     = `${startX + ox - 25}px`;
        chip.style.top      = `${startY + oy - 25}px`;
        chip.style.position = "fixed";
        document.body.appendChild(chip);

        createParticleTrail(startX + ox, startY + oy, endX, endY, i * 50);

        const duration = 1200 + i * 100;
        const ctrlX    = (startX + endX) / 2 + (Math.random() - 0.5) * 100;
        const ctrlY    = Math.min(startY, endY) - 100 - Math.random() * 50;
        let startTime: number | null = null;

        const frame = (ts: number) => {
          if (!startTime) startTime = ts;
          const progress  = Math.min((ts - startTime) / duration, 1);
          const t         = 1 - Math.pow(1 - progress, 3);
          const x = Math.pow(1-t,2)*(startX+ox) + 2*(1-t)*t*ctrlX + t*t*endX;
          const y = Math.pow(1-t,2)*(startY+oy) + 2*(1-t)*t*ctrlY + t*t*endY;
          chip.style.left = `${x - 25}px`;
          chip.style.top  = `${y - 25}px`;
          if (progress > 0.7) {
            const fade = (progress - 0.7) / 0.3;
            chip.style.opacity   = String(1 - fade);
            chip.style.transform = `scale(${1 - fade * 0.5})`;
          }
          if (progress < 1) {
            requestAnimationFrame(frame);
          } else {
            chip.remove();
            if (++completed === chipCount) {
              createMoneyBurst(playerEl);
              showMoneyIncrement(playerEl, dollars);
              playerEl.classList.remove("receiving");
              resolve();
            }
          }
        };
        requestAnimationFrame(frame);
      }, i * 80);
    }
  });
}
