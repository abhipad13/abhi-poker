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

  const [introPlaying, setIntroPlaying] = useState(true);
  const [info, setInfo] = useState<ShowdownInfo | null>(null);
  const [showdownOver, setShowdownOver] = useState(false);
  const [startingNext, setStartingNext] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedWinners, setSelectedWinners] = useState<Set<string>>(new Set());


  useEffect(() => {
    const t = setTimeout(() => setIntroPlaying(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // Initial HTTP fetch
  useEffect(() => {
    let cancelled = false;
    getShowdownInfo(gameId)
      .then((data) => {
        if (!cancelled) {
          setInfo(data);
          setShowdownOver(data.showdownOver);
        }
      })
      .catch((e) => console.error("Failed to fetch showdown info", e));
    return () => { cancelled = true; };
  }, [gameId]);

  // WebSocket: showdown updates + winnings
  useShowdownEvents(gameId, {
    onShowdownUpdate: setInfo,
    onWinnings: handleWinnings,
  });

  // WebSocket: snapshot — redirect everyone when next hand starts
  useStompTopic<GameSnapshot>(`/topic/game.${gameId}.snapshot`, (snapshot) => {
    if (snapshot.roundName === "Pre-Flop") nav(`/bet/${gameId}/${playerName}`);
  });

  const totalPotDollars = useMemo(() => (info ? (info.totalPot ?? 0) / 100 : 0), [info]);

  const playersView = useMemo(() => {
    if (!info) return [] as { id: string; name: string; moneyDollars: number; status: string; eligible: boolean }[];
    return info.players.map((p) => ({
      id: p.name,
      name: p.name,
      moneyDollars: (p.moneyCents ?? 0) / 100,
      status: p.allIn ? "All-in" : p.folded ? "Folded" : "Active",
      eligible: !p.folded,
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
    const potCircleEl = document.getElementById("potCircle");
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
      className="min-h-screen flex items-center justify-center p-0"
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
          {/* Left: Pot + instruction + actions */}
          <div className="showdown-left">
            <div className="pot-section">
              <div className="pot-circle" id="potCircle">
                <div className="pot-label">Total Pot</div>
                <div className="pot-amount" id="potAmount">${totalPotDollars.toLocaleString()}</div>
              </div>
            </div>

          </div>

          {/* Right: Players */}
          <div className="players-section">
            <div
              className="players-list"
              id="playersList"
              style={!isManager || isProcessing ? { pointerEvents: "none", opacity: isManager ? 1 : 0.6 } : undefined}
            >
              {Array.from({ length: 10 }, (_, i) => {
                const p = playersView[i];
                if (!p) return <div key={i} className="player empty" />;
                return (
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
                );
              })}
              {/* Buttons (or waiting message) occupy the 2 empty cells in row 3 */}
              <div className="confirm-section" style={{ gridColumn: "span 2", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                {!isManager && !showdownOver ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center" }}>
                    Waiting for manager to distribute the pot<span className="typing-dots" />
                  </div>
                ) : showdownOver ? (
                  <div style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "center" }}>
                    <a className="icon-btn" href={`/lobby/${gameId}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      <span>Lobby</span>
                    </a>
                    {isManager && (
                      <button className="icon-btn" onClick={onStartNextHand} disabled={startingNext} style={{ opacity: startingNext ? 0.5 : undefined }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                        <span>{startingNext ? "Starting…" : "New Hand"}</span>
                      </button>
                    )}
                  </div>
                ) : (
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
                )}
              </div>
            </div>
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
      trail.style.left = `${startX + (endX - startX) * p - 4}px`;
      trail.style.top = `${startY + (endY - startY) * p - 4}px`;
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
    const dist = 60 + Math.random() * 40;
    particle.style.setProperty("--end-position", `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`);
    const size = 8 + Math.random() * 8;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.animationDelay = `${Math.random() * 0.2}s`;
    burst.appendChild(particle);
  }
  playerEl.appendChild(burst);
  setTimeout(() => burst.remove(), 1200);
}

function showMoneyIncrement(playerEl: HTMLElement, amount: number) {
  const inc = document.createElement("div");
  inc.className = "money-increment";
  inc.textContent = `+${amount}`;
  playerEl.appendChild(inc);
  setTimeout(() => inc.remove(), 2000);
}

function animateChipTransfer(playerEl: HTMLElement, potCircleEl: HTMLElement, dollars: number): Promise<void> {
  return new Promise((resolve) => {
    const potRect = potCircleEl.getBoundingClientRect();
    const playerRect = playerEl.getBoundingClientRect();
    playerEl.classList.add("receiving");

    const startX = potRect.left + potRect.width / 2;
    const startY = potRect.top + potRect.height / 2;
    const endX = playerRect.left + playerRect.width / 2;
    const endY = playerRect.top + playerRect.height / 2;

    const chipCount = Math.min(Math.floor(dollars) + 1, 5);
    let completed = 0;

    for (let i = 0; i < chipCount; i++) {
      setTimeout(() => {
        const chip = document.createElement("div");
        chip.className = "chip-animation";
        chip.innerHTML = `<div class="chip-inner"><div class="chip-face chip-front">$</div><div class="chip-face chip-back"></div></div>`;
        const angle = (Math.PI * 2 * i) / chipCount;
        const radius = 30;
        const ox = Math.cos(angle) * radius;
        const oy = Math.sin(angle) * radius;
        chip.style.left = `${startX + ox - 25}px`;
        chip.style.top = `${startY + oy - 25}px`;
        chip.style.position = "fixed";
        document.body.appendChild(chip);

        createParticleTrail(startX + ox, startY + oy, endX, endY, i * 50);

        const duration = 1200 + i * 100;
        const ctrlX = (startX + endX) / 2 + (Math.random() - 0.5) * 100;
        const ctrlY = Math.min(startY, endY) - 100 - Math.random() * 50;
        let startTime: number | null = null;

        const frame = (ts: number) => {
          if (!startTime) startTime = ts;
          const progress = Math.min((ts - startTime) / duration, 1);
          const t = 1 - Math.pow(1 - progress, 3);
          const x = Math.pow(1 - t, 2) * (startX + ox) + 2 * (1 - t) * t * ctrlX + t * t * endX;
          const y = Math.pow(1 - t, 2) * (startY + oy) + 2 * (1 - t) * t * ctrlY + t * t * endY;
          chip.style.left = `${x - 25}px`;
          chip.style.top = `${y - 25}px`;
          if (progress > 0.7) {
            const fade = (progress - 0.7) / 0.3;
            chip.style.opacity = String(1 - fade);
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
