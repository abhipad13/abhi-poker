import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGame, joinGame } from "@/services/api/game";
import { useGameIdentity } from "@/context/GameIdentityContext";

export default function JoinCreateGame() {
  const nav = useNavigate();
  const { setYouName } = useGameIdentity();

  // Create form
  const [managerName, setManagerName] = useState("");
  const [creating, setCreating] = useState(false);

  // Join form
  const [joinGameId, setJoinGameId] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onCreate() {
    setError(null); setOk(null); setCreating(true);
    try {
      if (!managerName.trim()) throw new Error("Enter your name.");
      const res = await createGame(managerName.trim());
      setYouName(managerName.trim());
      setOk(`Game created: ${res.gameId}`);
      nav(`/lobby/${res.gameId}`);
    } catch (e: any) {
      setError(e.message || "Failed to create game.");
    } finally {
      setCreating(false);
    }
  }

  async function onJoin() {
    setError(null); setOk(null); setJoining(true);
    try {
      if (!joinGameId.trim() || !joinName.trim()) throw new Error("Enter game ID and your name.");
      await joinGame(joinGameId.trim(), joinName.trim());
      setYouName(joinName.trim());
      setOk("Joined! Taking you to the lobby…");
      nav(`/lobby/${joinGameId.trim()}`);
    } catch (e: any) {
      setError(e.message || "Failed to join game.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-6">
        {/* Create card */}
        <div className="rounded-2xl p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)] bg-black/40 border border-white/10 backdrop-blur">
          <h1 className="text-3xl font-extrabold mb-2">Create a Table</h1>
          <p className="opacity-70 mb-6">Start a new game as the manager.</p>

          <label className="block text-sm mb-2">Your name</label>
          <input
            className="w-full rounded-lg bg-black/50 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            placeholder="e.g., Sohan"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
          />

          <button
            onClick={onCreate}
            disabled={creating}
            className="mt-4 w-full bg-[var(--gold)] text-black font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-60 transition"
          >
            {creating ? "Creating…" : "Create Game"}
          </button>

          <Divider />

          <ul className="opacity-80 text-sm space-y-1">
            <li>• Auto-creates a gameId (8 chars)</li>
            <li>• Adds you as manager + player</li>
            <li>• Next screen: lobby</li>
          </ul>
        </div>

        {/* Join card */}
        <div className="rounded-2xl p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)] bg-black/40 border border-white/10 backdrop-blur">
          <h2 className="text-3xl font-extrabold mb-2">Join a Table</h2>
          <p className="opacity-70 mb-6">Enter the game ID the manager shared.</p>

          <label className="block text-sm mb-2">Game ID</label>
          <input
            className="w-full rounded-lg bg-black/50 border border-white/10 px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            placeholder="e.g., a1b2c3d4"
            value={joinGameId}
            onChange={(e) => setJoinGameId(e.target.value)}
          />

          <label className="block text-sm mb-2">Your name</label>
          <input
            className="w-full rounded-lg bg-black/50 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            placeholder="e.g., Abhi"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
          />

          <button
            onClick={onJoin}
            disabled={joining}
            className="mt-4 w-full bg-white text-black font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-60 transition"
          >
            {joining ? "Joining…" : "Join Game"}
          </button>

          <Divider />

          <ul className="opacity-80 text-sm space-y-1">
            <li>• Only need ID + your name</li>
            <li>• Next screen: lobby</li>
          </ul>
        </div>

        {(error || ok) && (
          <div className="md:col-span-2">
            {error && <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4">{error}</div>}
            {ok && <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-4">{ok}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />;
}
