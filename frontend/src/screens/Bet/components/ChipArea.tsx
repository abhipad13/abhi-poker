import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type Denomination = 1 | 5 | 25 | 100 | 500;

export type DenomConfig = {
  denom: Denomination;
  displayValue: number;
  color: string;
};

export type ChipAreaHandle = {
  addChip: (denom: Denomination, displayValue: number, color: string, maxAdd: number) => number;
  clearChips: () => void;
  flyChips: (onComplete: () => void) => void;
};

type Props = {
  denomConfigs: DenomConfig[];
  onChipClick: (denom: Denomination) => void;
};

const ChipArea = forwardRef<ChipAreaHandle, Props>(({ denomConfigs, onChipClick }, ref) => {
  const chipStacksRef = useRef<Record<Denomination, HTMLElement[]>>({
    1: [], 5: [], 25: [], 100: [], 500: [],
  });
  const isAnimatingRef = useRef(false);

  // Stable key derived from denom values — re-initialize only when chip values change
  const denomsKey = denomConfigs.map(d => `${d.denom}:${d.displayValue}`).join(",");

  useEffect(() => {
    if (isAnimatingRef.current) return;
    denomConfigs.forEach(({ denom, displayValue, color }) => {
      const wrapperEl = document.querySelector(`[data-chip-value="${denom}"]`);
      if (!wrapperEl) return;
      const stackEl = wrapperEl.querySelector(".chip-stack");
      if (!stackEl) return;
      stackEl.innerHTML = "";
      const chip = document.createElement("div");
      chip.className = `poker-chip ${color}-chip`;
      chip.innerHTML = `<span class="chip-label">$${displayValue}</span>`;
      chip.style.bottom = "15px";
      chip.style.zIndex = "100";
      stackEl.appendChild(chip);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denomsKey]);

  useImperativeHandle(ref, () => ({
    addChip(denom, displayValue, color, maxAdd) {
      const wrapperEl = document.querySelector(`[data-chip-value="${denom}"]`);
      if (!wrapperEl) return 0;
      const stackEl = wrapperEl.querySelector(".chip-stack");
      if (!stackEl) return 0;

      const currentStack = chipStacksRef.current[denom];
      const chip = document.createElement("div");
      chip.className = `poker-chip ${color}-chip`;
      chip.innerHTML = `<span class="chip-label">$${displayValue}</span>`;
      const stackIndex = currentStack.length;
      chip.style.bottom = `${60 + stackIndex * 6}px`;
      chip.style.zIndex = String(1000 + stackIndex);
      stackEl.appendChild(chip);
      currentStack.push(chip);

      return Math.min(displayValue, Math.max(0, maxAdd));
    },

    clearChips() {
      Object.values(chipStacksRef.current).forEach((chipArray) => {
        chipArray.forEach((chip, idx) => {
          setTimeout(() => {
            chip.style.opacity = "0";
            chip.style.transform = "translateX(-50%) scale(0.5)";
            setTimeout(() => chip.remove(), 200);
          }, idx * 20);
        });
      });
      chipStacksRef.current = { 1: [], 5: [], 25: [], 100: [], 500: [] };
    },

    flyChips(onComplete) {
      isAnimatingRef.current = true;

      const greenWrapper = document.querySelector("[data-chip-value='25']");
      if (!greenWrapper) {
        isAnimatingRef.current = false;
        onComplete();
        return;
      }

      const greenRect = greenWrapper.getBoundingClientRect();
      const convergenceX = greenRect.left + greenRect.width / 2;
      const convergenceY = greenRect.top - 200;

      let maxDelay = 0;
      Object.values(chipStacksRef.current).forEach((arr) => {
        arr.forEach((_, i) => { maxDelay = Math.max(maxDelay, i * 30); });
      });
      const totalTime = maxDelay + 400 + 300;

      Object.values(chipStacksRef.current).forEach((arr) => {
        arr.forEach((chip, idx) => {
          setTimeout(() => {
            const r = chip.getBoundingClientRect();
            const dx = convergenceX - (r.left + r.width / 2);
            const dy = convergenceY - (r.top + r.height / 2);
            const phase1 = chip.animate(
              [
                { transform: `translateX(-50%) translate(0,0) scale(1)`, opacity: 1 },
                { transform: `translateX(-50%) translate(${dx}px,${dy}px) scale(0.8)`, opacity: 0.9 },
              ],
              { duration: 400, easing: "cubic-bezier(.25,.46,.45,.94)", fill: "forwards" }
            );
            phase1.onfinish = () => {
              const phase2 = chip.animate(
                [
                  { transform: `translateX(-50%) translate(${dx}px,${dy}px) scale(0.8)`, opacity: 0.9 },
                  { transform: `translateX(-50%) translate(${dx}px,${dy - 150}px) scale(0.5)`, opacity: 0 },
                ],
                { duration: 300, easing: "ease-in", fill: "forwards" }
              );
              phase2.onfinish = () => chip.remove();
            };
          }, idx * 30);
        });
      });

      chipStacksRef.current = { 1: [], 5: [], 25: [], 100: [], 500: [] };

      setTimeout(() => {
        isAnimatingRef.current = false;
        onComplete();
      }, totalTime + 100);
    },
  }));

  return (
    <div className="flex justify-around items-end my-5 min-h-[200px] px-5">
      {denomConfigs.map(({ denom, displayValue }) => (
        <div key={denom} className="flex flex-col items-center gap-2">
          <div className="text-xs text-white/75 font-semibold">${displayValue}</div>
          <div
            className="relative h-[140px] w-[70px] grid place-items-center cursor-pointer"
            data-chip-value={denom}
            onClick={() => onChipClick(denom)}
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onChipClick(denom)}
          >
            <div className="chip-stack" />
          </div>
        </div>
      ))}
    </div>
  );
});

ChipArea.displayName = "ChipArea";
export default ChipArea;
