import { Routes, Route, useParams } from "react-router-dom";
import JoinCreateGame from "@/screens/JoinCreateGame";
import Lobby from "@/screens/Lobby";
import Bet from "@/screens/Bet/Bet";
import Showdown from "@/screens/Showdown";

function BetWrapper() {
  const { gameId, playerName } = useParams();
  return <Bet gameId={gameId || ""} playerName={playerName || ""} />;
}

function ShowdownWrapper() {
  const { gameId, playerName } = useParams();
  return <Showdown gameId={gameId || ""} playerName={playerName || ""} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<JoinCreateGame />} />
      <Route path="/lobby/:gameId" element={<Lobby />} />
      <Route path="/bet/:gameId/:playerName" element={<BetWrapper />} />
      <Route path="/showdown/:gameId/:playerName" element={<ShowdownWrapper />} />
    </Routes>
  );
}
