type Props = { open: boolean; onClose: () => void };

export default function HandGuideOverlay({ open, onClose }: Props) {
  return (
    <div className={`ovScrim ${open ? "open" : ""}`} onClick={onClose}>
      <div
        className="ovSheet handsSheet handsSheetImg"
        style={{ backgroundColor: "rgb(10, 79, 44)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="ovClose ovCloseFloat" onClick={onClose} aria-label="Close">
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 2 L10 10 M10 2 L2 10" />
          </svg>
        </button>
        <img src="/hand-guide.png" alt="Poker hand ranking guide" className="hgImg" />
      </div>
    </div>
  );
}
