import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeMove, getGameSnapshot, type GameSnapshot } from '../../services/api/game';
import { useStompTopic } from '@/hooks/useStompTopic';
// @ts-ignore - import audio as URL via Vite
import chipSfxUrl from '../../../chip-audio.wav?url';

type ExtendedGameSnapshot = GameSnapshot & { minCallAmt?: number; minRaiseAmt?: number };

export default function Bet({ gameId, playerName }: { gameId: string; playerName: string }) {
  // Real game state from backend
  const [gameState, setGameState] = useState<ExtendedGameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local betting state
  const [bet, setBet] = useState(0);
  // removed unused previousBet state

  // Track chips for each denomination (DOM elements), exactly like HTML
  type Denomination = 1 | 5 | 25 | 100 | 500;
  const chipStacksRef = useRef<Record<Denomination, HTMLElement[]>>({
    1: [],
    5: [],
    25: [],
    100: [],
    500: []
  });

  const nav = useNavigate();

  // Flag to prevent WebSocket updates during animations
  const animatingRef = useRef(false);
  // Track if a notification pill is currently visible
  const [notificationVisible, setNotificationVisible] = useState(false);
  // Round overlay state
  const [roundOverlay, setRoundOverlay] = useState<{ visible: boolean; text: string }>({ visible: false, text: '' });
  const prevRoundNameRef = useRef<string | null>(null);
  // Track latest turn player for gating error notifications
  const currentTurnPlayerRef = useRef<string | null>(null);
  // Chip click sound
  const chipAudioRef = useRef<HTMLAudioElement | null>(null);

  // Chip denominations (in dollars) – default values; will be overwritten by snapshot.chipValues if provided
  const [chipDenoms, setChipDenoms] = useState<Record<Denomination, number>>({
    1: 1,
    5: 5,
    25: 25,
    100: 100,
    500: 500,
  });



  const fmt = (n: number) => "$" + n.toLocaleString();

  // Initialize base chips like in HTML
  useEffect(() => {
    // Prepare audio element
    try {
      chipAudioRef.current = new Audio(chipSfxUrl as string);
      chipAudioRef.current.volume = 0.5;
      chipAudioRef.current.preload = 'auto';
    } catch {}

    // Don't re-initialize during animations
    if (animatingRef.current) return;

    const initializeStacks = () => {
      const chipConfigs = [
        { denomination: 1 as Denomination, color: 'white' },
        { denomination: 5 as Denomination, color: 'red' },
        { denomination: 25 as Denomination, color: 'green' },
        { denomination: 100 as Denomination, color: 'blue' },
        { denomination: 500 as Denomination, color: 'black' }
      ];

      chipConfigs.forEach(config => {
        const wrapperEl = document.querySelector(`[data-value="${config.denomination}"]`);
        if (!wrapperEl) return;

        const stackEl = wrapperEl.querySelector('.chip-stack');
        if (!stackEl) return;

        // Clear any existing chips
        stackEl.innerHTML = '';

        const chip = document.createElement('div');
        chip.className = `poker-chip ${config.color}-chip initial-chip`;
        chip.innerHTML = `<span class="chip-label">$${chipDenoms[config.denomination]}</span>`;
        chip.style.bottom = '15px'; // Base position
        chip.style.zIndex = '100';

        stackEl.appendChild(chip);
      });
    };

    // Initialize when chip denominations change
    initializeStacks();
  }, [chipDenoms]);

  // Get current player info
  const currentPlayer = gameState?.players.find(p => p.name === playerName);
  const isMyTurn = gameState?.turnPlayer === playerName;
  const canAct = isMyTurn && currentPlayer && !currentPlayer.folded && !currentPlayer.allIn;

  const showNotification = (message: string, isError: boolean = false) => {
    const notificationsEl = document.getElementById("notifications");
    const notificationContent = document.querySelector(".notification-content");

    if (notificationsEl && notificationContent) {
      // Set the message
      notificationContent.textContent = message;
      // Toggle error styling
      if (isError) {
        notificationsEl.classList.add('error');
      } else {
        notificationsEl.classList.remove('error');
      }

      // Show the notification with entrance animation
      notificationsEl.classList.remove("hidden");
      notificationsEl.classList.add("show");
      setNotificationVisible(true);

      // Hide after 1.5 seconds with exit animation
      setTimeout(() => {
        notificationsEl.classList.remove("show");
        notificationsEl.classList.add("hide");

        setTimeout(() => {
          notificationsEl.classList.add("hidden");
          notificationsEl.classList.remove("hide");
          setNotificationVisible(false);
          // Clear error class after hide
          notificationsEl.classList.remove('error');
        }, 150);
      }, 1500);
    }
  };

  const pulse = (el: HTMLElement) => {
    el.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.06)" },
        { transform: "scale(1)" }
      ],
      { duration: 180, easing: "ease-out" }
    );
  };

  const addChip = (wrapperEl: Element, denom: Denomination, displayValue: number, color: string) => {
    // Play chip sound (clone to allow rapid clicks)
    try {
      if (chipAudioRef.current) {
        const s = chipAudioRef.current.cloneNode(true) as HTMLAudioElement;
        s.volume = chipAudioRef.current.volume;
        s.currentTime = 0;
        void s.play().catch(() => {});
      }
    } catch {}

    const stackEl = wrapperEl.querySelector('.chip-stack');
    if (!stackEl) return;

    const currentStack = chipStacksRef.current[denom];

    const chip = document.createElement('div');
    chip.className = `poker-chip ${color}-chip`;
    chip.innerHTML = `<span class="chip-label">$${displayValue}</span>`;

    // Position chip in the levitated stack - EXACT same as HTML
    const stackIndex = currentStack.length;
    const baseHeight = 60; // Base elevation for levitated chips
    const spacing = 6; // Spacing between chips (matching HTML exactly)

    chip.style.bottom = `${baseHeight + stackIndex * spacing}px`;
    chip.style.zIndex = String(1000 + stackIndex);

    stackEl.appendChild(chip);
    currentStack.push(chip);

    // Add to bet immediately - EXACT same logic as HTML
    const availableDollars = (currentPlayer?.displayCents || 0) / 100;
    const maxAdd = Math.max(0, availableDollars - bet);
    const add = Math.min(displayValue, maxAdd);
    setBet(prev => prev + add);

    // Pulse the bet amount
    const betAmt = document.getElementById("betAmt");
    if (betAmt) pulse(betAmt);
  };

  const handleBet = async () => {
    // Allow animation regardless of turn; only block if invalid amount
    if (bet <= 0 || bet > (currentPlayer?.displayCents || 0) / 100) return; // FROM SERVER: cents → dollars

    const serverContributionDollars = (currentPlayer?.contributionCents || 0) / 100;
    const totalForServer = bet + serverContributionDollars; // total current bet displayed in the field

    // Set animation flag to prevent WebSocket interference
    animatingRef.current = true;

    // Only send to server if it's actually your turn
    if (canAct) {
      try {
        await makeMove(gameId, {
          playerId: playerName,
          selection: "CALL_RAISE",
          bet: Math.round(totalForServer * 100) // TO SERVER: send total current bet in cents
        });

        // SUCCESS: Do the flying animation
        doFlyingAnimation();
        setBet(0); // Clear bet after successful bet

      } catch (err) {
        // ERROR: Do the clear animation instead
        console.warn('Move (bet) failed:', err);
        setBet(0);
        // Re-enable WebSocket updates since we're not doing the flying animation
        animatingRef.current = false;
        handleClear();
        return; // Exit early
      }
    } else {
      // Demo-only visual when not your turn
      doFlyingAnimation();
      setBet(0);
    }
  };

  // Helper function to do the flying animation
  const doFlyingAnimation = () => {
    // Get the green chip wrapper position as our convergence point
    const greenWrapper = document.querySelector(`[data-value="25"]`);
    if (!greenWrapper) return;

    const greenRect = greenWrapper.getBoundingClientRect();
    const convergenceX = greenRect.left + greenRect.width / 2;
    const convergenceY = greenRect.top - 200; // Way above the green chip

    // Calculate total animation time for all chips
    let maxDelay = 0;
    Object.values(chipStacksRef.current).forEach(chipArray => {
      chipArray.forEach((_, idx) => {
        maxDelay = Math.max(maxDelay, idx * 30);
      });
    });
    const totalAnimationTime = maxDelay + 400 + 300; // delay + phase1 + phase2

    // Animate all chips flying to convergence point, then out - EXACT same as HTML
    Object.entries(chipStacksRef.current).forEach(([_, chipArray]) => {
      chipArray.forEach((chip, idx) => {
        const delay = idx * 30;
        setTimeout(() => {
          const chipRect = chip.getBoundingClientRect();
          const startX = chipRect.left + chipRect.width / 2;
          const startY = chipRect.top + chipRect.height / 2;

          // Calculate movement to convergence point
          const deltaX = convergenceX - startX;
          const deltaY = convergenceY - startY;

          // First phase: move to convergence point
          const phase1 = chip.animate([
            {
              transform: `translateX(-50%) translate(0px, 0px) scale(1)`,
              opacity: 1
            },
            {
              transform: `translateX(-50%) translate(${deltaX}px, ${deltaY}px) scale(0.8)`,
              opacity: 0.9
            }
          ], {
            duration: 400,
            easing: "cubic-bezier(.25,.46,.45,.94)",
            fill: 'forwards'
          });

          // Second phase: fly out upward from convergence point
          phase1.onfinish = () => {
            const phase2 = chip.animate([
              {
                transform: `translateX(-50%) translate(${deltaX}px, ${deltaY}px) scale(0.8)`,
                opacity: 0.9
              },
              {
                transform: `translateX(-50%) translate(${deltaX}px, ${deltaY - 150}px) scale(0.5)`,
                opacity: 0
              }
            ], {
              duration: 300,
              easing: "ease-in",
              fill: 'forwards'
            });

            phase2.onfinish = () => {
              chip.remove();
            };
          };
        }, delay);
      });
    });

    // Clear all chip stacks - EXACT same as HTML
    chipStacksRef.current = { 1: [], 5: [], 25: [], 100: [], 500: [] };

    // Re-enable WebSocket updates after animation completes
    setTimeout(() => {
      animatingRef.current = false;
    }, totalAnimationTime + 100); // Add small buffer
  };

  const handleCheck = async () => {
    if (!canAct) return;
    try {
      await makeMove(gameId, {
        playerId: playerName,
        selection: "CHECK",
        bet: 0
      });
    } catch (err) {
      // Ignore move API errors on the bet screen (do not display)
      console.warn('Move (check) failed:', err);
    }
  };

  const handleClear = () => {
    if (bet <= 0) return;

    // Animate all chips disappearing - EXACT same as HTML
    Object.values(chipStacksRef.current).forEach(chipArray => {
      chipArray.forEach((chip, idx) => {
        const delay = idx * 20;
        setTimeout(() => {
          chip.style.opacity = '0';
          chip.style.transform = `translateX(-50%) scale(0.5)`;
          setTimeout(() => {
            chip.remove();
          }, 200);
        }, delay);
      });
    });

    // Clear all chip stacks and reset bet
    chipStacksRef.current = { 1: [], 5: [], 25: [], 100: [], 500: [] };

    setBet(0);

    // (Local notifications removed; rely on server log pills)

    // Pulse the bet amount
    const betAmt = document.getElementById("betAmt");
    if (betAmt) pulse(betAmt);
  };

  const handleFold = async () => {
    if (!canAct) return;
    try {
      await makeMove(gameId, {
        playerId: playerName,
        selection: "FOLD",
        bet: 0
      });
    } catch (err) {
      // Ignore move API errors on the bet screen (do not display)
      console.warn('Move (fold) failed:', err);
    }
  };







  // Fetch initial game state
  const fetchGameState = async () => {
    try {
      setLoading(true);
      const snapshot = await getGameSnapshot(gameId);
      setGameState(snapshot);
      // Set initial turn player immediately to avoid missing early error logs
      try { currentTurnPlayerRef.current = snapshot.turnPlayer || null; } catch {}
      // Update dynamic chip denominations if provided (cents → dollars)
      if (snapshot.chipValues) {
        const { white, red, green, blue, black } = snapshot.chipValues as Record<string, number>;
        setChipDenoms({
          1: (white ?? 100) / 100,
          5: (red ?? 500) / 100,
          25: (green ?? 2500) / 100,
          100: (blue ?? 10000) / 100,
          500: (black ?? 50000) / 100,
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch game state');
    } finally {
      setLoading(false);
    }
  };

  // Fetch initial game state
  useEffect(() => {
    fetchGameState();
  }, [gameId]);

  // Real-time snapshot updates
  useStompTopic<GameSnapshot>(`/topic/game.${gameId}.snapshot`, (snapshot) => {
    setGameState(snapshot);
    currentTurnPlayerRef.current = snapshot.turnPlayer || null;

    const newRound = snapshot.roundName;
    const prevRound = prevRoundNameRef.current;
    if (prevRound && newRound && prevRound !== newRound) {
      setRoundOverlay({ visible: true, text: newRound });
      setTimeout(() => setRoundOverlay((r) => ({ ...r, visible: false })), 2500);
    }
    prevRoundNameRef.current = newRound || null;

    if (snapshot.roundName?.toLowerCase() === 'showdown') {
      nav(`/showdown/${gameId}/${playerName}`);
      return;
    }

    if (snapshot.chipValues) {
      const { white, red, green, blue, black } = snapshot.chipValues as Record<string, number>;
      setChipDenoms({
        1: (white ?? 100) / 100,
        5: (red ?? 500) / 100,
        25: (green ?? 2500) / 100,
        100: (blue ?? 10000) / 100,
        500: (black ?? 50000) / 100,
      });
    }
  });

  // Log notifications
  useStompTopic<{ message?: string; error?: boolean }>(`/topic/game.${gameId}.log`, (payload) => {
    const text = payload?.message;
    const isError = Boolean(payload?.error);
    if (!text) return;
    if (isError && currentTurnPlayerRef.current !== playerName) return;
    showNotification(String(text), isError);
  });



  if (loading) return <div className="text-white">Loading game...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (!gameState) return <div className="text-white">No game state available.</div>;

  return (
    <div className="min-h-screen bg-[#0b6b3a] flex items-center justify-center p-0"
         style={{
           backgroundImage: `
             radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px),
             radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)
           `,
           backgroundPosition: '0 0, 25px 25px',
           backgroundSize: '50px 50px'
         }}>
      <div className="w-full max-w-[1000px] bg-black/45 border border-white/12 rounded-[18px] shadow-2xl backdrop-blur-sm px-6 py-3 relative overflow-hidden">
        {/* Round Overlay */}
        {roundOverlay.visible && (
          <div className="round-overlay">
            <div className="round-overlay-content">
              <div className="round-overlay-text">{roundOverlay.text}</div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap mb-[18px]">
          <div className={`font-extrabold text-[28px] tracking-[0.3px] ${isMyTurn ? 'cool-name' : 'text-white'}`}>{playerName}</div>
          <div className="notifications-container flex justify-center">
            {isMyTurn && gameState?.minCallAmt != null && gameState?.minRaiseAmt != null && !notificationVisible && (
              <div className="turn-info-badge">
                <div className="turn-info-content">
                  Min Call: {fmt(gameState.minCallAmt / 100)} • Min Raise: {fmt(gameState.minRaiseAmt / 100)}
                </div>
              </div>
            )}
            <div className="notification-badge hidden" id="notifications">
              <div className="notification-content"></div>
            </div>
          </div>
          <div className="flex gap-[18px] flex-wrap">
            <div className="border border-white/12 rounded-full px-[14px] py-[10px] bg-white/6 font-bold">
              <small className="block font-semibold text-white/75 text-[11px] tracking-[0.3px]">Your Stack</small>
              <strong className="block text-[18px]" id="stackAmt">{fmt((currentPlayer?.displayCents || 0) / 100)}</strong>
            </div>
            <div className="border border-white/12 rounded-full px-[14px] py-[10px] bg-white/6 font-bold">
              <small className="block font-semibold text-white/75 text-[11px] tracking-[0.3px]">Table Pot</small>
              <strong className="block text-[18px]" id="potAmt">{fmt(gameState.totalPot / 100)}</strong>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/25 to-transparent my-[18px]"></div>



        {/* Animated Chip Stacks */}
        <div className="flex justify-around items-end my-4 min-h-[150px] h-[150px] px-5">
          <div className="flex flex-col items-center gap-2">
              <div className="relative h-[140px] w-[70px] grid place-items-center cursor-pointer"
                   onClick={() => {
                    const wrapperEl = document.querySelector('[data-value="1"]');
                    if (wrapperEl) addChip(wrapperEl, 1, chipDenoms[1], 'white');
                  }}
                  tabIndex={0}
                  data-value="1">
               <div className="chip-stack">
                 {/* Base chip and additional chips managed by DOM manipulation */}
               </div>
             </div>
           </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative h-[140px] w-[70px] grid place-items-center cursor-pointer"
                 onClick={() => {
                   const wrapperEl = document.querySelector('[data-value="5"]');
                   if (wrapperEl) addChip(wrapperEl, 5, chipDenoms[5], 'red');
                 }}
                 tabIndex={0}
                 data-value="5">
              <div className="chip-stack">
                {/* Base chip and additional chips managed by DOM manipulation */}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative h-[140px] w-[70px] grid place-items-center cursor-pointer"
                 onClick={() => {
                   const wrapperEl = document.querySelector('[data-value="25"]');
                   if (wrapperEl) addChip(wrapperEl, 25, chipDenoms[25], 'green');
                 }}
                 tabIndex={0}
                 data-value="25">
              <div className="chip-stack">
                {/* Base chip and additional chips managed by DOM manipulation */}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative h-[140px] w-[70px] grid place-items-center cursor-pointer"
                 onClick={() => {
                   const wrapperEl = document.querySelector('[data-value="100"]');
                    if (wrapperEl) addChip(wrapperEl, 100, chipDenoms[100], 'blue');
                 }}
                 tabIndex={0}
                 data-value="100">
              <div className="chip-stack">
                {/* Base chip and additional chips managed by DOM manipulation */}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative h-[140px] w-[70px] grid place-items-center cursor-pointer"
                 onClick={() => {
                   const wrapperEl = document.querySelector('[data-value="500"]');
                    if (wrapperEl) addChip(wrapperEl, 500, chipDenoms[500], 'black');
                 }}
                 tabIndex={0}
                 data-value="500">
              <div className="chip-stack">
                {/* Base chip and additional chips managed by DOM manipulation */}
              </div>
            </div>
          </div>
        </div>

        {/* Bet field + actions */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-center mt-0">
          <div className="bg-black/50 border border-white/12 rounded-xl p-[14px] flex items-center gap-[10px]" id="betField">
            <div>
              <div className="text-[28px] font-black ml-auto" id="betAmt">{fmt(((currentPlayer?.contributionCents || 0) / 100) + bet)}</div>
            </div>
          </div>

          <div className="flex gap-[10px] flex-wrap">
            <button
              className="border-none rounded-xl px-[18px] py-[14px] font-black cursor-pointer transition-all duration-75 bg-[#d4af37] text-black hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              id="betBtn"
              disabled={!canAct || bet <= 0 || bet > (currentPlayer?.displayCents || 0) / 100}
              onClick={handleBet}
            >
              Bet
            </button>
            <button
              className="border-none rounded-xl px-[18px] py-[14px] font-black cursor-pointer transition-all duration-75 bg-white text-black hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              id="checkBtn"
              disabled={!canAct}
              onClick={handleCheck}
            >
              Check
            </button>
            <button
              className="border-none rounded-xl px-[18px] py-[14px] font-black cursor-pointer transition-all duration-75 bg-black text-white border border-white/12 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              id="clearBtn"
              disabled={bet <= 0}
              onClick={handleClear}
            >
              Clear
            </button>
            <button
              className="border-none rounded-xl px-[18px] py-[14px] font-black cursor-pointer transition-all duration-75 bg-black text-white border border-white/12 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              id="foldBtn"
              disabled={!canAct}
              onClick={handleFold}
            >
              Fold
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-white/75 text-center">
          {canAct ? "Click chips to add them to your bet. Hit 'Bet' to commit your chips to the pot!" : (
            <span>
              Waiting for {gameState.turnPlayer} to act
              <span className="typing-dots"></span>
            </span>
          )}
        </p>

        <style>
          {`
            .poker-chip {
              position: absolute;
              left: 50%;
              width: 100px;
              height: 100px;
              border-radius: 50%;
              border: 4px solid #fff;
              display: grid;
              place-items: center;
              font-weight: 900;
              font-size: 20px;
              color: #111;
              box-shadow: 0 8px 24px rgba(0,0,0,.35), inset 0 0 0 6px rgba(255,255,255,.18);
              transform: translateX(-50%) rotate(0deg);
              transition: transform .28s cubic-bezier(.2,.7,.2,1), opacity .28s ease;
              will-change: transform, opacity;
            }

            /* Pop animation - converge to center point above green chip, then fly out */
            .pop {
              pointer-events: none;
              opacity: 0 !important;
            }

            .poker-chip .chip-label {
              background: #fff;
              color: #111;
              padding: 4px 12px;
              border-radius: 999px;
              font-weight: 900;
              box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
              font-size: 16px;
            }

            .chip-stack {
              position: absolute;
              bottom: 15px;
              left: 50%;
              transform: translateX(-50%);
              width: 60px;
              height: 120px;
            }

            /* Chip Colors */
            .white-chip {
              background: conic-gradient(from 0deg, #e5e5e5 0 12%, #fff 12% 24%, #e5e5e5 24% 36%, #fff 36% 48%, #e5e5e5 48% 60%, #fff 60% 72%, #e5e5e5 72% 84%, #fff 84% 100%);
              color: #111;
            }
            .red-chip {
              background: conic-gradient(from 0deg, #b71c1c 0 12%, #e53935 12% 24%, #b71c1c 24% 36%, #e53935 36% 48%, #b71c1c 48% 60%, #e53935 60% 72%, #b71c1c 72% 84%, #e53935 84% 100%);
              color: #fff;
            }
            .green-chip {
              background: conic-gradient(from 0deg, #1b5e20 0 12%, #2e7d32 12% 24%, #1b5e20 24% 36%, #2e7d32 36% 48%, #1b5e20 48% 60%, #2e7d32 60% 72%, #1b5e20 72% 84%, #2e7d32 84% 100%);
              color: #fff;
            }
            .black-chip {
              background: conic-gradient(from 0deg, #000 0 12%, #1c1c1c 12% 24%, #000 24% 36%, #1c1c1c 36% 48%, #000 48% 60%, #1c1c1c 60% 72%, #000 72% 84%, #1c1c1c 84% 100%);
              color: #fff;
            }
            .blue-chip {
              background: conic-gradient(from 0deg, #1565c0 0 12%, #1976d2 12% 24%, #1565c0 24% 36%, #1976d2 36% 48%, #1565c0 48% 60%, #1976d2 60% 72%, #1565c0 72% 84%, #1976d2 84% 100%);
              color: #fff;
            }

            /* Cool header name */
            .cool-name {
              background: linear-gradient(90deg, #d4af37, #f4d03f, #d4af37);
              -webkit-background-clip: text;
              background-clip: text;
              color: transparent;
              text-shadow: 0 2px 8px rgba(212, 175, 55, 0.25);
              position: relative;
            }
            .cool-name::after {
              content: '';
              position: absolute;
              left: 0;
              right: 0;
              bottom: -4px;
              height: 2px;
              background: linear-gradient(90deg, rgba(212,175,55,.7), rgba(244,208,63,.9), rgba(212,175,55,.7));
              border-radius: 999px;
              box-shadow: 0 2px 8px rgba(212,175,55,.35);
            }

            /* --- Notifications --- */
            .notifications-container {
              min-width: 200px;
              flex: 0 1 auto;
              margin: 0 20px;
            }

            .notification-badge {
              position: relative;
              background: linear-gradient(135deg, #d4af37, #f4d03f);
              border-radius: 50px;
              padding: 12px 24px;
              box-shadow: 0 4px 20px rgba(212, 175, 55, 0.4);
              transform: scale(0);
              transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
              width: 100%;
              max-width: 100%;
            }

            /* Error variant of notification pill */
            .notification-badge.error {
              background: linear-gradient(135deg, #b91c1c, #ef4444);
              box-shadow: 0 6px 22px rgba(185, 28, 28, 0.50);
            }

            .notification-badge.error .notification-content {
              color: #fff;
              text-shadow: 0 1px 2px rgba(0,0,0,0.25);
            }

            .notification-badge.error.show::before {
              background: linear-gradient(135deg, rgba(185,28,28,0.95), rgba(239,68,68,0.95));
            }

            .notification-badge.show {
              transform: scale(1);
            }

            .notification-badge.hide {
              transform: scale(0);
            }

            .notification-badge.hidden {
              display: none;
            }

            .notification-content {
              color: #111;
              font-weight: 700;
              font-size: 15px;
              text-align: center;
              white-space: nowrap;
              text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            /* Green turn info pill (same dimensions as yellow notification pill) */
            .turn-info-badge {
              position: relative;
              background: rgba(34, 197, 94, 0.10);
              border: 1px solid rgba(34, 197, 94, 0.45);
              border-radius: 50px; /* keep shape */
              padding: 12px 24px; /* keep size */
              box-shadow: 0 2px 8px rgba(0,0,0,0.15);
              width: 100%;
              max-width: 100%;
            }

            .turn-info-content {
              color: #22c55e; /* subtle green */
              font-weight: 600;
              font-size: 14px;
              text-align: center;
              white-space: nowrap;
              text-shadow: none;
            }

            /* Add a subtle pulse effect - more specific to avoid conflicts */
            .notification-badge.show::before {
              content: '';
              position: absolute;
              top: -3px;
              left: -3px;
              right: -3px;
              bottom: -3px;
              background: linear-gradient(135deg, #d4af37, #f4d03f);
              border-radius: 50px;
              z-index: -1;
              animation: notification-pulse-ring 2s infinite;
              pointer-events: none;
            }

            @keyframes notification-pulse-ring {
              0% {
                transform: scale(1);
                opacity: 0.8;
              }
              50% {
                transform: scale(1.05);
                opacity: 0.4;
              }
              100% {
                transform: scale(1);
                opacity: 0.8;
              }
            }

            /* Button animations - EXACT same as HTML */
            .btn:active {
              transform: translateY(1px) scale(0.99);
            }

            .btn:focus-visible, .stack-wrapper:focus-visible {
              outline: 2px solid #d4af37;
              outline-offset: 2px;
            }

            /* Typing dots animation */
            .typing-dots {
              display: inline-block;
              position: relative;
              width: 1.5em;
              text-align: left;
            }

            .typing-dots::after {
              content: '';
              animation: typing 2s infinite;
            }

            @keyframes typing {
              0% { content: ''; }
              25% { content: '.'; }
              50% { content: '..'; }
              75% { content: '...'; }
              100% { content: '...'; }
            }

            /* Round Overlay */
            .round-overlay {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(11, 107, 58, 0.95);
              backdrop-filter: blur(8px);
              z-index: 1000;
              display: flex;
              align-items: center;
              justify-content: center;
              animation: roundFadeIn 0.5s ease-out forwards, roundFadeOut 0.5s ease-in 2s forwards;
              border-radius: 18px;
            }

            .round-overlay-content {
              text-align: center;
              animation: roundSlideUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            }

            .round-overlay-text {
              font-size: 48px;
              font-weight: 900;
              background: linear-gradient(90deg, #d4af37, #f4d03f, #d4af37);
              -webkit-background-clip: text;
              background-clip: text;
              color: transparent;
              text-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 18px rgba(212, 175, 55, 0.30);
              letter-spacing: 0.06em; /* slightly increased for luxury feel */
              font-variant: small-caps;
              margin-bottom: 16px;
              opacity: 0;
              animation: roundTextGlow 0.8s ease-out 0.3s forwards;
              font-family: 'Playfair Display', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
            }

            @keyframes roundFadeIn {
              0% { opacity: 0; }
              100% { opacity: 1; }
            }

            @keyframes roundFadeOut {
              0% { opacity: 1; }
              100% { opacity: 0; }
            }

            @keyframes roundSlideUp {
              0% {
                transform: translateY(60px);
                opacity: 0;
              }
              100% {
                transform: translateY(0);
                opacity: 1;
              }
            }

            @keyframes roundTextGlow {
              0% {
                opacity: 0;
                text-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
              }
              50% {
                opacity: 1;
                text-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 32px rgba(212, 175, 55, 0.50);
              }
              100% {
                opacity: 1;
                text-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 12px rgba(212, 175, 55, 0.25);
              }
            }
          `}
        </style>
      </div>
    </div>
  );
}
