import { Routes, Route, useParams, useSearchParams } from "react-router-dom";
import JoinCreateGame from "@/screens/JoinCreateGame";
import Lobby from "@/screens/Lobby";
import Bet from "@/screens/Bet/Bet";
import BetV3 from "@/screens/Bet/Bet.v3";
import Showdown from "@/screens/Showdown";

function BetWrapper() {
  const { gameId, playerName } = useParams();
  const [searchParams] = useSearchParams();
  const id = gameId || "";
  const name = playerName || "";
  return searchParams.get("ui") === "v3"
    ? <BetV3 gameId={id} playerName={name} />
    : <Bet   gameId={id} playerName={name} />;
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
