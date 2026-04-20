import { useEffect, useState } from "react";
import { saveSettings } from "@/services/api/game";
import { fromCents, toCents } from "@/utils/money";

type Props = {
  gameId: string;
  managerName: string;        // who is making the request
  isManager: boolean;
  // For per-player overrides (optional)
  players: string[];
  // Optional current values (if known from WS TABLE_UPDATE)
  currentSmallBlindCents?: number;
  currentBigBlindCents?: number;
  currentDefaultStartingMoneyCents?: number;
  currentChipValues?: Record<string, number>;
  currentCustomStartingMoneyCents?: Record<string, number>;
};

const DEFAULT_CHIPS: Record<string, number> = {
  white: 10,   // $0.10
  red: 20,     // $0.20
  green: 25,   // $0.25
  blue: 50,    // $0.50
  black: 100,  // $1.00
};

export default function SettingsPanel({
  gameId,
  managerName,
  isManager,
  players,
  currentSmallBlindCents,
  currentBigBlindCents,
  currentDefaultStartingMoneyCents,
  currentChipValues,
  currentCustomStartingMoneyCents,
}: Props) {
  // form state in dollars for easy typing
  const [smallBlind, setSmallBlind]   = useState(fromCents(currentSmallBlindCents ?? 10));   // $0.10
  const [bigBlind, setBigBlind]       = useState(fromCents(currentBigBlindCents ?? 20));    // $0.20
  const [defaultStack, setDefaultStack] = useState(fromCents(currentDefaultStartingMoneyCents ?? 500)); // $5.00

  // chip values (in cents internally)
  const [chips, setChips] = useState<Record<string, number>>(DEFAULT_CHIPS);
  
  // per-player override (dollars text)
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (currentChipValues && Object.keys(currentChipValues).length > 0) {
      setChips(currentChipValues);
    } else {
      setChips(DEFAULT_CHIPS);
    }
  }, [currentChipValues]);

  useEffect(() => {
    if (currentDefaultStartingMoneyCents) {
      setDefaultStack(fromCents(currentDefaultStartingMoneyCents));
    }
  }, [currentDefaultStartingMoneyCents]);

  useEffect(() => {
    if (currentSmallBlindCents) {
      setSmallBlind(fromCents(currentSmallBlindCents));
    }
  }, [currentSmallBlindCents]);

  useEffect(() => {
    if (currentBigBlindCents) {
      setBigBlind(fromCents(currentBigBlindCents));
    }
  }, [currentBigBlindCents]);

  useEffect(() => {
    if (currentCustomStartingMoneyCents) {
      const newOverrides: Record<string, string> = {};
      Object.entries(currentCustomStartingMoneyCents).forEach(([playerName, cents]) => {
        newOverrides[playerName] = fromCents(cents);
      });
      setOverrides(newOverrides);
    }
  }, [currentCustomStartingMoneyCents]);

  async function onSave() {
    if (!isManager) return;
    setErr(null); setMsg(null); setSaving(true);
    try {
      // Get current chip values from the DOM inputs
      const currentChipValues: Record<string, number> = {};
      Object.keys(chips).forEach(color => {
        const input = document.querySelector(`input[data-chip-color="${color}"]`) as HTMLInputElement;
        if (input && input.value) {
          const cents = toCents(input.value);
          if (cents > 0) {
            currentChipValues[color] = cents;
          }
        }
      });

      // Get current values from the DOM inputs
      const smallBlindInput = document.querySelector('input[data-field="smallBlind"]') as HTMLInputElement;
      const bigBlindInput = document.querySelector('input[data-field="bigBlind"]') as HTMLInputElement;
      const defaultStackInput = document.querySelector('input[data-field="defaultStack"]') as HTMLInputElement;
      
      const currentSmallBlind = smallBlindInput?.value || smallBlind;
      const currentBigBlind = bigBlindInput?.value || bigBlind;
      const currentDefaultStack = defaultStackInput?.value || defaultStack;

      // Get current player overrides from DOM
      const currentOverrides: Record<string, number> = {};
      players.forEach(name => {
        const input = document.querySelector(`input[data-player-override="${name}"]`) as HTMLInputElement;
        if (input && input.value && parseFloat(input.value) > 0) {
          currentOverrides[name] = toCents(input.value);
        }
      });

      const body = {
        smallBlindCents: toCents(currentSmallBlind),
        bigBlindCents: toCents(currentBigBlind),
        defaultStartingMoneyCents: toCents(currentDefaultStack),
        chipValues: currentChipValues,
        customStartingMoneyCents: currentOverrides,
      };
      const text = await saveSettings(gameId, managerName, body);
      setMsg(text || "Settings saved.");
      // Your backend already does `applyInitialMoney()` here
      // and (per earlier guidance) should broadcast TABLE_UPDATE.
    } catch (e: any) {
      setErr(e.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...props}
      className={`w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--gold)] ${props.className||""}`}
    />
  );

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
            defaultValue={smallBlind}
            key={`smallBlind-${currentSmallBlindCents}`}
            data-field="smallBlind"
            onBlur={(e) => {
              const newValue = e.target.value;
              if (newValue && !isNaN(parseFloat(newValue)) && parseFloat(newValue) >= 0) {
                setSmallBlind(newValue);
              }
            }}
            disabled={!isManager}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Big blind ($)</label>
          <Input
            type="number" step="0.01" min="0"
            defaultValue={bigBlind}
            key={`bigBlind-${currentBigBlindCents}`}
            data-field="bigBlind"
            onBlur={(e) => {
              const newValue = e.target.value;
              if (newValue && !isNaN(parseFloat(newValue)) && parseFloat(newValue) >= 0) {
                setBigBlind(newValue);
              }
            }}
            disabled={!isManager}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm mb-1">Default starting stack ($)</label>
          <Input
            type="number" step="0.01" min="0"
            defaultValue={defaultStack}
            key={`defaultStack-${currentDefaultStartingMoneyCents}`}
            data-field="defaultStack"
            onBlur={(e) => {
              const newValue = e.target.value;
              if (newValue && !isNaN(parseFloat(newValue)) && parseFloat(newValue) >= 0) {
                setDefaultStack(newValue);
              }
            }}
            disabled={!isManager}
          />
        </div>
      </div>

      {/* Chip values */}
      <div>
        <div className="text-sm mb-2">Chip values (per chip)</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(chips).map(([color, cents]) => (
            <div key={color}>
              <label className="block text-xs mb-1 capitalize">{color} ($)</label>
              <Input
                type="number" step="0.01" min="0"
                defaultValue={fromCents(cents)}
                key={`chip-${color}-${currentChipValues?.[color] || 0}`}
                data-chip-color={color}
                onBlur={(e) => {
                  const newValue = e.target.value;
                  if (newValue && !isNaN(parseFloat(newValue)) && parseFloat(newValue) > 0) {
                    const cents = toCents(newValue);
                    setChips(prev => ({ ...prev, [color]: cents }));
                  }
                }}
                disabled={!isManager}
                placeholder="0.00"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-player overrides */}
      <div>
        <div className="text-sm mb-2">Per-player starting stacks (optional)</div>
        <div className="grid md:grid-cols-2 gap-3">
          {players.map((name) => (
            <div key={name} className="flex items-center gap-3">
              <div className="w-32 truncate">{name}</div>
              <Input
                type="number" step="0.01" min="0"
                placeholder="e.g. 150.00"
                defaultValue={overrides[name] ?? ""}
                key={`override-${name}-${currentCustomStartingMoneyCents?.[name] || 0}`}
                data-player-override={name}
                onBlur={(e) => {
                  const newValue = e.target.value;
                  if (newValue && !isNaN(parseFloat(newValue)) && parseFloat(newValue) >= 0) {
                    setOverrides((m) => ({ ...m, [name]: newValue }));
                  }
                }}
                disabled={!isManager}
              />
            </div>
          ))}
        </div>
      </div>

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
