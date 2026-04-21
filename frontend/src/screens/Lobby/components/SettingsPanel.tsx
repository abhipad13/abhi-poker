import { useEffect, useState } from "react";
import { saveSettings } from "@/services/api/game";
import { fromCents, toCents } from "@/utils/money";

type Props = {
  gameId: string;
  managerName: string;
  isManager: boolean;
  players: string[];
  currentSmallBlindCents?: number;
  currentBigBlindCents?: number;
  currentDefaultStartingMoneyCents?: number;
  currentChipValues?: Record<string, number>;
  currentCustomStartingMoneyCents?: Record<string, number>;
};

const DEFAULT_CHIPS: Record<string, number> = {
  white: 10, red: 20, green: 25, blue: 50, black: 100,
};

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gold)] ${props.className ?? ""}`}
  />
);

export default function SettingsPanel({
  gameId, managerName, isManager, players,
  currentSmallBlindCents, currentBigBlindCents,
  currentDefaultStartingMoneyCents, currentChipValues,
  currentCustomStartingMoneyCents,
}: Props) {
  const [smallBlind,   setSmallBlind]   = useState(fromCents(currentSmallBlindCents   ?? 10));
  const [bigBlind,     setBigBlind]     = useState(fromCents(currentBigBlindCents     ?? 20));
  const [defaultStack, setDefaultStack] = useState(fromCents(currentDefaultStartingMoneyCents ?? 500));

  // Chip values stored as dollar strings for controlled inputs
  const [chipStrings, setChipStrings] = useState<Record<string, string>>(() => {
    const src = currentChipValues && Object.keys(currentChipValues).length > 0 ? currentChipValues : DEFAULT_CHIPS;
    return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, fromCents(v)]));
  });

  // Per-player overrides stored as dollar strings
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    if (!currentCustomStartingMoneyCents) return {};
    return Object.fromEntries(
      Object.entries(currentCustomStartingMoneyCents).map(([k, v]) => [k, fromCents(v)])
    );
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);
  const [err, setErr]       = useState<string | null>(null);

  // Sync from props when WebSocket pushes new values
  useEffect(() => { if (currentSmallBlindCents)            setSmallBlind(fromCents(currentSmallBlindCents));           }, [currentSmallBlindCents]);
  useEffect(() => { if (currentBigBlindCents)              setBigBlind(fromCents(currentBigBlindCents));               }, [currentBigBlindCents]);
  useEffect(() => { if (currentDefaultStartingMoneyCents)  setDefaultStack(fromCents(currentDefaultStartingMoneyCents)); }, [currentDefaultStartingMoneyCents]);

  useEffect(() => {
    if (!currentChipValues || Object.keys(currentChipValues).length === 0) return;
    setChipStrings(Object.fromEntries(Object.entries(currentChipValues).map(([k, v]) => [k, fromCents(v)])));
  }, [currentChipValues]);

  useEffect(() => {
    if (!currentCustomStartingMoneyCents) return;
    setOverrides(Object.fromEntries(
      Object.entries(currentCustomStartingMoneyCents).map(([k, v]) => [k, fromCents(v)])
    ));
  }, [currentCustomStartingMoneyCents]);

  async function onSave() {
    if (!isManager) return;
    setErr(null); setMsg(null); setSaving(true);
    try {
      const chipValues: Record<string, number> = {};
      Object.entries(chipStrings).forEach(([color, str]) => {
        const cents = toCents(str);
        if (cents > 0) chipValues[color] = cents;
      });

      const customStartingMoneyCents: Record<string, number> = {};
      players.forEach((name) => {
        const val = overrides[name];
        if (val && parseFloat(val) > 0) customStartingMoneyCents[name] = toCents(val);
      });

      const text = await saveSettings(gameId, managerName, {
        smallBlindCents:            toCents(smallBlind),
        bigBlindCents:              toCents(bigBlind),
        defaultStartingMoneyCents:  toCents(defaultStack),
        chipValues,
        customStartingMoneyCents,
      });
      setMsg(text || "Settings saved.");
    } catch (e: any) {
      setErr(e.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">Table Settings</h3>
        {!isManager && <span className="text-xs text-white/60">view-only</span>}
      </div>

      {/* Blinds */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-1">Small blind ($)</label>
          <Input
            type="number" step="0.01" min="0"
            value={smallBlind}
            onChange={(e) => setSmallBlind(e.target.value)}
            disabled={!isManager}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Big blind ($)</label>
          <Input
            type="number" step="0.01" min="0"
            value={bigBlind}
            onChange={(e) => setBigBlind(e.target.value)}
            disabled={!isManager}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm mb-1">Default starting stack ($)</label>
          <Input
            type="number" step="0.01" min="0"
            value={defaultStack}
            onChange={(e) => setDefaultStack(e.target.value)}
            disabled={!isManager}
          />
        </div>
      </div>

      {/* Chip values */}
      <div>
        <div className="text-sm mb-2">Chip values (per chip)</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.keys(chipStrings).map((color) => (
            <div key={color}>
              <label className="block text-xs mb-1 capitalize">{color} ($)</label>
              <Input
                type="number" step="0.01" min="0"
                value={chipStrings[color]}
                onChange={(e) => setChipStrings((prev) => ({ ...prev, [color]: e.target.value }))}
                disabled={!isManager}
                placeholder="0.00"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-player overrides */}
      {players.length > 0 && (
        <div>
          <div className="text-sm mb-2">Per-player starting stacks (optional)</div>
          <div className="grid md:grid-cols-2 gap-3">
            {players.map((name) => (
              <div key={name} className="flex items-center gap-3">
                <div className="w-32 truncate">{name}</div>
                <Input
                  type="number" step="0.01" min="0"
                  placeholder="e.g. 150.00"
                  value={overrides[name] ?? ""}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, [name]: e.target.value }))}
                  disabled={!isManager}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {isManager && (
        <div className="flex justify-end">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--gold)] text-black font-bold disabled:opacity-60 hover:opacity-90"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}

      {msg && <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-2">{msg}</div>}
      {err && <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-2">{err}</div>}
    </div>
  );
}
