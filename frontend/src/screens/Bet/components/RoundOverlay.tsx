type Props = { visible: boolean; text: string };

export default function RoundOverlay({ visible, text }: Props) {
  if (!visible) return null;
  return (
    <div className="round-overlay">
      <div className="round-overlay-content">
        <div className="round-overlay-text">{text}</div>
      </div>
    </div>
  );
}
