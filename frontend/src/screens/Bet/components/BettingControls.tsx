type Props = {
  currentBetDisplay: number;
  canAct: boolean;
  hasBet: boolean;
  currentBet: number;
  maxBet: number;
  onBet: () => void;
  onCheck: () => void;
  onClear: () => void;
  onFold: () => void;
};

const fmt = (n: number) => "$" + n.toLocaleString();

export default function BettingControls({
  currentBetDisplay, canAct, hasBet, currentBet, maxBet,
  onBet, onCheck, onClear, onFold,
}: Props) {
  const btnBase = "border-none rounded-xl px-[18px] py-[14px] font-black cursor-pointer transition-all duration-75 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 items-center mt-0">
      <div className="bg-black/50 border border-white/12 rounded-xl p-[14px] flex items-center gap-[10px]">
        <div>
          <div className="text-[28px] font-black" id="betAmt">{fmt(currentBetDisplay)}</div>
        </div>
      </div>

      <div className="flex gap-[10px] flex-wrap">
        <button
          className={`${btnBase} bg-[#d4af37] text-black`}
          disabled={!canAct || currentBet <= 0 || currentBet > maxBet}
          onClick={onBet}
        >
          Bet
        </button>
        <button
          className={`${btnBase} bg-white text-black`}
          disabled={!canAct}
          onClick={onCheck}
        >
          Check
        </button>
        <button
          className={`${btnBase} bg-black text-white border border-white/12`}
          disabled={!hasBet}
          onClick={onClear}
        >
          Clear
        </button>
        <button
          className={`${btnBase} bg-black text-white border border-white/12`}
          disabled={!canAct}
          onClick={onFold}
        >
          Fold
        </button>
      </div>
    </div>
  );
}
