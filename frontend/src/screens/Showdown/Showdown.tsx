import { useEffect, useMemo, useRef, useState } from "react";
import { getShowdownInfo, type ShowdownInfo, ShowdownWebSocket, assignWinners, type WinningsPayload, startHand, GameWebSocket, type GameSnapshot } from "@/services/api/game";
import { useNavigate } from "react-router-dom";

export default function Showdown({ gameId, playerName }: { gameId: string; playerName: string }) {
  const [introPlaying, setIntroPlaying] = useState(true);
  const [info, setInfo] = useState<ShowdownInfo | null>(null);
  const [showdownOver, setShowdownOver] = useState(false);
  const [startingNext, setStartingNext] = useState(false);
  const nav = useNavigate();

  // Determine if current user is manager (static: from localStorage)
  const isManager = (() => {
    try {
      return localStorage.getItem('managerName') === playerName;
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    const t = setTimeout(() => setIntroPlaying(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // Initial HTTP fetch of showdown info
  useEffect(() => {
    let cancelled = false;
    async function fetchInfo() {
      try {
        console.log('🔍 Fetching showdown info for game:', gameId);
        const data = await getShowdownInfo(gameId);
        console.log('📡 HTTP showdown info received:', data);
        if (!cancelled) setInfo(data);
      } catch (e) {
        console.error('❌ Failed to fetch showdown info', e);
      }
    }
    fetchInfo();
    return () => { cancelled = true; };
  }, [gameId]);

  // WebSocket subscription for showdown updates and winnings
  const showdownWsRef = useRef<ShowdownWebSocket | null>(null);
  useEffect(() => {
    console.log('🔄 Setting up showdown WebSocket for game:', gameId);
    showdownWsRef.current = new ShowdownWebSocket(gameId);
    showdownWsRef.current.connect(
      (payload: ShowdownInfo) => {
        console.log('📡 WebSocket showdown update received:', payload);
        setInfo(payload);
      },
      (winnings: WinningsPayload) => {
        console.log('💰 WebSocket winnings received:', winnings);
        handleWinnings(winnings);
      },
      (err) => console.error('❌ showdown ws error', err)
    );

    return () => {
      if (showdownWsRef.current) showdownWsRef.current.disconnect();
    };
  }, [gameId]);

  // Subscribe to game snapshot to redirect all users when next hand begins
  useEffect(() => {
    const ws = new GameWebSocket(gameId);
    ws.connect((snapshot: GameSnapshot) => {
      try {
        if (snapshot.roundName === 'Pre-Flop') {
          nav(`/bet/${gameId}/${playerName}`);
        }
      } catch {}
    }, (err) => console.error('❌ showdown snapshot ws error', err));

    return () => ws.disconnect();
  }, [gameId, nav, playerName]);

  // Derived UI pieces from info
  const totalPotDollars = useMemo(() => {
    const result = info ? (info.totalPot || 0) / 100 : 0;
    console.log('💰 Derived totalPotDollars:', result, 'from info:', info);
    return result;
  }, [info]);

  const playersView = useMemo(() => {
    if (!info) {
      console.log('👥 No info yet, returning empty players');
      return [] as { id: string; name: string; moneyDollars: number; status: string; eligible: boolean }[];
    }
    const result = info.players.map((p) => ({
      id: p.name,
      name: p.name,
      moneyDollars: (p.moneyCents || 0) / 100,
      status: p.allIn ? 'All-in' : (p.folded ? 'Folded' : 'Active'),
      eligible: !p.folded,
    }));
    console.log('👥 Derived playersView:', result, 'from info:', info);
    return result;
  }, [info]);

  // --- Shared helpers for animations and formatting ---
  function formatDollars(dollars: number): string {
    return `$${dollars.toLocaleString()}`;
  }

  function createParticleTrail(startX: number, startY: number, endX: number, endY: number, delay: number) {
    const particleCount = 8;
    const duration = 1200;
    for (let i = 0; i < particleCount; i++) {
      setTimeout(() => {
        const trail = document.createElement('div');
        trail.className = 'chip-trail';
        const progress = i / particleCount;
        const x = startX + (endX - startX) * progress;
        const y = startY + (endY - startY) * progress;
        trail.style.left = `${x - 4}px`;
        trail.style.top = `${y - 4}px`;
        trail.style.position = 'fixed';
        trail.style.animation = 'trailFade 0.6s ease-out forwards';
        document.body.appendChild(trail);
        setTimeout(() => trail.remove(), 600);
      }, delay + (i * (duration / particleCount)));
    }
  }

  function createMoneyBurst(playerEl: HTMLElement) {
    const burst = document.createElement('div');
    burst.className = 'money-burst';
    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'burst-particle';
      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 60 + Math.random() * 40;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      particle.style.setProperty('--end-position', `translate(${x}px, ${y}px)`);
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
    const inc = document.createElement('div');
    inc.className = 'money-increment';
    inc.textContent = `+${amount}`;
    playerEl.appendChild(inc);
    setTimeout(() => inc.remove(), 2000);
  }

  // Note: kept for reference; currently not used directly
  function animatePotUpdate(newAmount: number) {
    const potAmountEl = document.getElementById('potAmount') as HTMLElement | null;
    if (!potAmountEl) return;
    potAmountEl.style.transform = 'scale(1.2)';
    setTimeout(() => {
      potAmountEl.textContent = formatDollars(newAmount);
      potAmountEl.style.transform = 'scale(1)';
    }, 200);
  }

  function animateChipTransfer(playerEl: HTMLElement, amount: number, delay: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const potCircleEl = document.getElementById('potCircle') as HTMLElement | null;
        if (!potCircleEl) return resolve();

        const potRect = potCircleEl.getBoundingClientRect();
        const playerRect = playerEl.getBoundingClientRect();
        playerEl.classList.add('receiving');

        const startX = potRect.left + potRect.width / 2;
        const startY = potRect.top + potRect.height / 2;
        const endX = playerRect.left + playerRect.width / 2;
        const endY = playerRect.top + playerRect.height / 2;

        const chipCount = Math.min(Math.floor(amount / 100) + 1, 5);
        let completed = 0;

        for (let i = 0; i < chipCount; i++) {
          setTimeout(() => {
            const chip = document.createElement('div');
            chip.className = 'chip-animation';
            chip.innerHTML = `
              <div class="chip-inner">
                <div class="chip-face chip-front">$</div>
                <div class="chip-face chip-back"></div>
              </div>
            `;
            const angleOffset = (Math.PI * 2 * i) / chipCount;
            const radiusOffset = 30;
            const startOffsetX = Math.cos(angleOffset) * radiusOffset;
            const startOffsetY = Math.sin(angleOffset) * radiusOffset;
            chip.style.left = `${startX + startOffsetX - 25}px`;
            chip.style.top = `${startY + startOffsetY - 25}px`;
            chip.style.position = 'fixed';
            document.body.appendChild(chip);

            createParticleTrail(startX + startOffsetX, startY + startOffsetY, endX, endY, i * 50);

            const duration = 1200 + i * 100;
            const controlX = (startX + endX) / 2 + (Math.random() - 0.5) * 100;
            const controlY = Math.min(startY, endY) - 100 - Math.random() * 50;
            let startTime: number | null = null;

            const animateFrame = (timestamp: number) => {
              if (!startTime) startTime = timestamp;
              const progress = Math.min((timestamp - startTime) / duration, 1);
              const easeProgress = 1 - Math.pow(1 - progress, 3);
              const t = easeProgress;
              const x = Math.pow(1 - t, 2) * (startX + startOffsetX) + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * endX;
              const y = Math.pow(1 - t, 2) * (startY + startOffsetY) + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * endY;
              chip.style.left = `${x - 25}px`;
              chip.style.top = `${y - 25}px`;
              if (progress > 0.7) {
                const fadeProgress = (progress - 0.7) / 0.3;
                chip.style.opacity = String(1 - fadeProgress);
                chip.style.transform = `scale(${1 - fadeProgress * 0.5})`;
              }
              if (progress < 1) {
                requestAnimationFrame(animateFrame);
              } else {
                chip.remove();
                completed++;
                if (completed === chipCount) {
                  createMoneyBurst(playerEl);
                  showMoneyIncrement(playerEl, amount);
                  playerEl.classList.remove('receiving');
                  resolve();
                }
              }
            };

            requestAnimationFrame(animateFrame);
          }, i * 80);
        }
      }, delay);
    });
  }

  // interactions for selection + animations (manager-only)
  useEffect(() => {
    if (introPlaying || !isManager) return;

    const potAmountEl = document.getElementById('potAmount') as HTMLElement | null;
    const potCircleEl = document.getElementById('potCircle') as HTMLElement | null;
    const playersListEl = document.getElementById('playersList') as HTMLElement | null;
    const confirmBtnEl = document.getElementById('confirmBtn') as HTMLButtonElement | null;
    if (!potAmountEl || !potCircleEl || !playersListEl || !confirmBtnEl) return;

    const selected = new Set<string>();
    let isProcessing = false;

    // formatting helpers are defined at component scope

    function updateConfirm() {
      if (selected.size > 0) {
        confirmBtnEl!.classList.add('active');
        confirmBtnEl!.textContent = `Confirm ${selected.size} Winner${selected.size > 1 ? 's' : ''}`;
      } else {
        confirmBtnEl!.classList.remove('active');
        confirmBtnEl!.textContent = 'Confirm Winners';
      }
    }

    function addWinnerBadge(playerEl: HTMLElement) {
      const existing = playerEl.querySelector('.winner-badge');
      if (existing) return;
      const badge = document.createElement('div');
      badge.className = 'winner-badge';
      badge.textContent = '✓';
      playerEl.appendChild(badge);
    }

    function removeWinnerBadge(playerEl: HTMLElement) {
      const existing = playerEl.querySelector('.winner-badge');
      if (existing) existing.remove();
    }

    function handlePlayerClick(e: Event) {
      const el = e.currentTarget as HTMLElement;
      if (isProcessing) return;
      if (el.classList.contains('ineligible')) return;
      const playerId = el.getAttribute('data-player-id');
      if (!playerId) return;
      if (selected.has(playerId)) {
        selected.delete(playerId);
        el.classList.remove('selected');
        removeWinnerBadge(el);
      } else {
        selected.add(playerId);
        el.classList.add('selected');
        addWinnerBadge(el);
      }
      updateConfirm();
    }

    const playerEls = Array.from(playersListEl.querySelectorAll('.player')) as HTMLElement[];
    playerEls.forEach((el) => {
      if (!el.classList.contains('ineligible')) {
        el.addEventListener('click', handlePlayerClick);
      }
    });

    // animations are provided by component-scoped helpers

    // animations are provided by component-scoped helpers

    // animations are provided by component-scoped helpers

    // animations are provided by component-scoped helpers

    // animations are provided by component-scoped helpers

    async function onConfirmClick() {
      if (selected.size === 0 || isProcessing) return;
      isProcessing = true;
      confirmBtnEl!.innerHTML = '<span class="spinner"></span> Processing...';
      confirmBtnEl!.classList.add('loading');
      playerEls.forEach((el) => { (el as HTMLElement).style.pointerEvents = 'none'; });

      const winnerIds = Array.from(selected);
      try {
        await assignWinners(gameId, winnerIds);
        console.log('✅ Winners assigned, waiting for winnings payload via WS...');
      } catch (e) {
        console.error('❌ Failed to assign winners', e);
        alert('Failed to assign winners. Please try again.');
      }

      selected.clear();
      playerEls.forEach((el) => {
        el.classList.remove('selected');
        const badge = el.querySelector('.winner-badge');
        if (badge) badge.remove();
      });
      updateConfirm();

      confirmBtnEl!.textContent = 'Confirm Winners';
      confirmBtnEl!.classList.remove('loading');
      playerEls.forEach((el) => { (el as HTMLElement).style.pointerEvents = el.classList.contains('ineligible') ? 'none' : 'auto'; });
      isProcessing = false;
    }

    confirmBtnEl.addEventListener('click', onConfirmClick);

    return () => {
      playerEls.forEach((el) => {
        if (!el.classList.contains('ineligible')) {
          el.removeEventListener('click', handlePlayerClick);
        }
      });
      confirmBtnEl.removeEventListener('click', onConfirmClick);
    };
  }, [introPlaying, isManager, playerName, info]);

  // Handle winnings payload from WebSocket: update pot, animate chips, update balances
  function handleWinnings(winnings: WinningsPayload) {
    const potAmountEl = document.getElementById('potAmount') as HTMLElement | null;
    const playersListEl = document.getElementById('playersList') as HTMLElement | null;
    const potCircleEl = document.getElementById('potCircle') as HTMLElement | null;
    if (!potAmountEl || !playersListEl || !potCircleEl) return;

    // Sum total winnings and update pot display
    const totalWonCents = Object.values(winnings.winningsCents).reduce((sum, v) => sum + v, 0);
    const currentPotCents = Math.round(((info?.totalPot ?? 0)));
    const newPotCents = Math.max(0, currentPotCents - totalWonCents);

    // Update pot only; update individual player balances after their animation completes
    setInfo((prev) => (prev ? { ...prev, totalPot: newPotCents } : prev));

    // Animate per-winner chips and update visible balances
    Object.entries(winnings.winningsCents).forEach(([winnerName, cents], index) => {
      const playerEl = playersListEl.querySelector(`[data-player-id="${CSS.escape(winnerName)}"]`) as HTMLElement | null;
      if (!playerEl) return;
      const dollars = cents / 100;
      setTimeout(async () => {
        await animateChipTransfer(playerEl, dollars, 0);
        // After animation completes, increment the winner's balance in state
        setInfo((prev) => {
          if (!prev) return prev;
          const updatedPlayers = prev.players.map((p) =>
            p.name === winnerName ? { ...p, moneyCents: p.moneyCents + cents } : p
          );
          return { ...prev, players: updatedPlayers };
        });
      }, index * 200);
    });

    // Reflect showdownOver in state to drive UI
    setShowdownOver(Boolean(winnings.showdownOver));
    // Update instruction text depending on showdownOver
    const instructionEl = document.getElementById('instruction');
    if (instructionEl) {
      instructionEl.textContent = winnings.showdownOver ? 'Showdown complete' : 'Select the next winner(s) for this pot';
    }
  }

  async function onStartNextHand() {
    if (startingNext) return;
    try {
      setStartingNext(true);
      await startHand(gameId, playerName);
      window.location.href = `/bet/${gameId}/${playerName}`;
    } catch (e) {
      console.error('Failed to start next hand', e);
      alert('Failed to start next hand. Please try again.');
    } finally {
      setStartingNext(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        backgroundColor: '#0b6b3a',
        backgroundImage: `radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px), radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)`,
        backgroundPosition: '0 0, 25px 25px',
        backgroundSize: '50px 50px'
      }}
    >
      {introPlaying && (
        <div className="showdown-overlay" aria-hidden>
          <div className="showdown-backdrop"></div>
          <div className="showdown-center">
            <span className="sword-giant left">🗡️</span>
            <div className="showdown-title">Showdown</div>
            <span className="sword-giant right">🗡️</span>
          </div>
        </div>
      )}

      {!introPlaying && (
        <div className="container" id="showdownContainer">
          <div style={{ position: 'absolute', top: 14, right: 16, color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'right' }}>
            <div>Game ID: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 6 }}>{gameId}</code></div>
            <div style={{ marginTop: 4 }}>You: <strong style={{ color: '#fff' }}>{playerName}</strong></div>
            {!isManager && (
              <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.7)' }}>Manager-only controls</div>
            )}

          </div>
          <div className="pot-section">
            <div className="pot-circle" id="potCircle">
              <div className="pot-label">Total Pot</div>
              <div className="pot-amount" id="potAmount">${totalPotDollars.toLocaleString()}</div>
            </div>
          </div>

          <div className="instruction" id="instruction">{isManager ? 'Select winner(s) for this pot' : 'Waiting for manager to distribute the pot'}</div>

          <div className="players-section">
            <div className="players-list" id="playersList" style={!isManager ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
              {playersView.length === 0 && (
                <div style={{ color: 'var(--muted)' }}>Waiting for showdown info…</div>
              )}
              {playersView.map((p) => (
                <div key={p.id} className={`player ${!p.eligible ? 'ineligible' : ''}`} data-player-id={p.id}>
                  <div className="player-name">{p.name}</div>
                  <div className="player-money" data-player-money={p.id}>{`$${p.moneyDollars.toLocaleString()}`}</div>
                  <div className="player-status">{p.status}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="confirm-section">
            {showdownOver ? (
              <div className="manager-actions">
                <a
                  className="btn-confirm active"
                  href={`/lobby/${gameId}`}
                  style={{ opacity: 1, textDecoration: 'none', display: 'inline-block' }}
                >
                  Lobby
                </a>
                {isManager && (
                  <button
                    className="btn-confirm active"
                    onClick={onStartNextHand}
                    disabled={startingNext}
                    style={{ opacity: 1 }}
                  >
                    {startingNext ? 'Starting…' : 'Next Hand'}
                  </button>
                )}
              </div>
            ) : (
              isManager && (
                <button className="btn-confirm" id="confirmBtn">Confirm Winners</button>
              )
            )}
          </div>
        </div>
      )}
      <style>
        {`
          :root{ --felt:#0b6b3a; --gold:#d4af37; --panel:rgba(0,0,0,.45); --border:rgba(255,255,255,.12); --text:#fff; --muted:rgba(255,255,255,.75); --selected:#4caf50; --selected-border:#66bb6a; }
          *{box-sizing:border-box}
          .container{ width:min(1000px, 96vw); background:var(--panel); border:1px solid var(--border); border-radius:18px; box-shadow: 0 12px 30px rgba(0,0,0,.35); backdrop-filter: blur(8px); padding:40px; text-align:center; position:relative; }
          .pot-section{ margin-bottom:60px; position:relative; }
          .pot-circle{ width:200px; height:200px; border-radius:50%; background:radial-gradient(circle, rgba(212,175,55,0.3), rgba(212,175,55,0.1)); border:4px solid var(--gold); display:flex; flex-direction:column; align-items:center; justify-content:center; margin:0 auto 20px auto; box-shadow: 0 0 30px rgba(212,175,55,0.4); position:relative; transition: all 0.3s ease; }
          .pot-label{ font-size:16px; color:var(--muted); font-weight:600; margin-bottom:8px; }
          .pot-amount{ font-size:36px; font-weight:900; color:var(--gold); transition: all 0.5s ease; }
          .players-section{ margin-bottom:40px; }
          .players-list{ display:flex; justify-content:center; gap:20px; flex-wrap:wrap; }
          .player{ background:rgba(0,0,0,.3); border:2px solid var(--border); border-radius:12px; padding:16px; min-width:140px; position:relative; cursor:pointer; transition: all 0.2s ease; user-select:none; }
          .player:hover:not(.ineligible){ transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
          .player.selected{ background:rgba(76,175,80,0.2); border:2px solid var(--selected-border); box-shadow: 0 0 20px rgba(76,175,80,0.3); }
          .player.ineligible{ opacity:0.4; cursor:not-allowed; }
          .player-name{ font-weight:700; font-size:16px; margin-bottom:8px; }
          .player-money{ font-size:20px; font-weight:900; color:var(--gold); transition: all 0.5s ease; }
          .player-status{ font-size:12px; color:var(--muted); margin-top:4px; }
          .instruction{ color:var(--muted); font-size:14px; margin-bottom:20px; }
          .confirm-section{ margin-top:30px; }
          .btn-confirm{ background:var(--gold); color:#111; border:none; border-radius:12px; padding:14px 32px; font-weight:800; font-size:16px; cursor:pointer; transition: all 0.2s ease; opacity:0.5; pointer-events:none; }
          .btn-confirm.active{ opacity:1; pointer-events:auto; }
          .btn-confirm.active:hover{ transform: translateY(-2px); box-shadow: 0 4px 12px rgba(212,175,55,0.4); }
          .chip-animation{ position:fixed; width:50px; height:50px; pointer-events:none; z-index:1000; }
          .chip-inner{ width:100%; height:100%; position:relative; transform-style: preserve-3d; animation: chipRotate 2s linear infinite; }
          @keyframes chipRotate{ 0%{ transform: rotateY(0deg) rotateX(10deg); } 100%{ transform: rotateY(360deg) rotateX(10deg); } }
          .chip-face{ position:absolute; width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:20px; backface-visibility: hidden; }
          .chip-front{ background: linear-gradient(145deg, #f4d03f, #d4af37); border: 3px solid #fff; color:#111; box-shadow: 0 0 20px rgba(212,175,55,0.6), inset 0 0 10px rgba(255,255,255,0.3); z-index:2; }
          .chip-back{ background: linear-gradient(145deg, #d4af37, #b8941f); border: 3px solid #fff; transform: rotateY(180deg); box-shadow: 0 0 20px rgba(212,175,55,0.6), inset 0 0 10px rgba(0,0,0,0.2); }
          .chip-trail{ position:fixed; width:8px; height:8px; background:var(--gold); border-radius:50%; pointer-events:none; z-index:999; opacity:0; box-shadow: 0 0 6px var(--gold); }
          @keyframes trailFade{ 0%{ opacity:1; transform:scale(1); } 100%{ opacity:0; transform:scale(0.3); } }
          .money-burst{ position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); pointer-events:none; z-index:101; }
          .burst-particle{ position:absolute; width:30px; height:30px; background:var(--gold); border-radius:50%; opacity:0; animation: burstOut 1s ease-out forwards; }
          @keyframes burstOut{ 0%{ opacity:1; transform:translate(0, 0) scale(0.5); } 100%{ opacity:0; transform:var(--end-position) scale(0.1); } }
          @keyframes winnerGlow{ 0%{ box-shadow: 0 0 0 0 rgba(76,175,80,0.7); } 50%{ box-shadow: 0 0 30px 10px rgba(76,175,80,0.3); } 100%{ box-shadow: 0 0 0 0 rgba(76,175,80,0); }
          }
          .player.receiving{ animation: winnerGlow 1.5s ease-out; }
          .money-increment{ position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:var(--gold); font-size:24px; font-weight:900; pointer-events:none; z-index:102; animation: floatUp 2s ease-out forwards; text-shadow: 0 0 10px rgba(212,175,55,0.8); }
          @keyframes floatUp{ 0%{ opacity:0; transform:translate(-50%, -50%) translateY(0); } 20%{ opacity:1; } 100%{ opacity:0; transform:translate(-50%, -50%) translateY(-60px); } }
          .winner-badge{ position:absolute; top:-10px; right:-10px; background:var(--gold); color:#111; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:18px; animation: pulse 1s ease infinite; }
          @keyframes pulse{ 0%, 100%{ transform: scale(1); } 50%{ transform: scale(1.1); } }
          .loading{ pointer-events:none; opacity:0.6; }
          .spinner{ display:inline-block; width:20px; height:20px; border:3px solid rgba(255,255,255,0.3); border-radius:50%; border-top-color:#fff; animation: spin 1s ease-in-out infinite; }
          @keyframes spin{ to{ transform: rotate(360deg); } }
          /* Manager actions appear animation */
          .manager-actions {
            display:flex;
            gap:12px;
            justify-content:center;
            opacity: 0;
            transform: translateY(8px) scale(0.98);
            animation: actions-in 420ms cubic-bezier(.25,.46,.45,.94) 50ms forwards;
          }
          .manager-actions > .btn-confirm:nth-child(1) {
            animation: action-pop 360ms ease 120ms both;
          }
          .manager-actions > .btn-confirm:nth-child(2) {
            animation: action-pop 360ms ease 220ms both;
          }
          @keyframes actions-in {
            0% { opacity: 0; transform: translateY(8px) scale(0.98); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes action-pop {
            0% { transform: translateY(6px) scale(0.96); }
            60% { transform: translateY(-2px) scale(1.02); }
            100% { transform: translateY(0) scale(1); }
          }
          /* Full-screen Showdown swords overlay */
          .showdown-overlay {
            position: fixed;
            inset: 0;
            background: transparent;
            z-index: 2000;
            display: grid;
            place-items: center;
            overflow: hidden;
          }
          .showdown-backdrop {
            position: absolute;
            inset: 0;
            background:
              radial-gradient(1200px 600px at 50% 40%, rgba(255,255,255,0.06), transparent 60%),
              radial-gradient(800px 400px at 50% 60%, rgba(212,175,55,0.08), transparent 65%),
              rgba(0,0,0,0.78);
            box-shadow: inset 0 0 180px rgba(0,0,0,0.55);
            animation: backdrop-in 600ms ease-out both;
          }
          @keyframes backdrop-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .showdown-center {
            position: absolute;
            inset: 0;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            justify-items: center;
            pointer-events: none;
          }
          .showdown-title {
            font-size: clamp(36px, 8vw, 92px);
            font-weight: 900;
            background: linear-gradient(90deg, #d4af37, #f4d03f, #d4af37);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-shadow: 0 6px 22px rgba(0, 0, 0, 0.45), 0 0 24px rgba(212, 175, 55, 0.30);
            letter-spacing: 0.06em;
            font-variant: small-caps;
            animation: title-in 900ms cubic-bezier(.25,.46,.45,.94) 350ms both, title-glow 2.2s ease-in-out 1s both;
          }
          @keyframes title-in {
            0% { opacity: 0; transform: translateY(18px) scale(0.96); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes title-glow {
            0% { text-shadow: 0 6px 22px rgba(0,0,0,.45), 0 0 10px rgba(212,175,55,.15); }
            50% { text-shadow: 0 6px 22px rgba(0,0,0,.45), 0 0 36px rgba(212,175,55,.55); }
            100% { text-shadow: 0 6px 22px rgba(0,0,0,.45), 0 0 18px rgba(212,175,55,.35); }
          }
          .sword-giant {
            font-size: clamp(48px, 14vw, 140px);
            filter: drop-shadow(0 10px 22px rgba(0,0,0,.45));
            opacity: 0;
          }
          .sword-giant.left { animation: cross-in-left 780ms cubic-bezier(.25,.46,.45,.94) 200ms both; }
          .sword-giant.right { animation: cross-in-right 780ms cubic-bezier(.25,.46,.45,.94) 200ms both; }
          @keyframes cross-in-left {
            0% { opacity: 0; transform: translateX(-120%) rotate(-35deg) scale(0.8); }
            70% { opacity: 1; transform: translateX(10%) rotate(-15deg) scale(1.05); }
            100% { opacity: 0.95; transform: translateX(0) rotate(-18deg) scale(1); }
          }
          @keyframes cross-in-right {
            0% { opacity: 0; transform: translateX(120%) rotate(35deg) scale(0.8); }
            70% { opacity: 1; transform: translateX(-10%) rotate(15deg) scale(1.05); }
            100% { opacity: 0.95; transform: translateX(0) rotate(18deg) scale(1); }
          }
        `}
      </style>
    </div>
  );
}



