import { BrowserRouter } from "react-router-dom";
import { GameIdentityProvider } from "@/context/GameIdentityContext";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <GameIdentityProvider>
        <AppRoutes />
      </GameIdentityProvider>
    </BrowserRouter>
  );
}
