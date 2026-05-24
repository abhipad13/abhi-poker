import { BrowserRouter } from "react-router-dom";
import "@/styles/d6.css";
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
