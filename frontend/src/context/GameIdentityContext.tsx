import { createContext, useContext, useState, type ReactNode } from "react";

type GameIdentityContextType = {
  youName: string;
  setYouName: (n: string) => void;
  managerName: string;
  setManagerName: (n: string) => void;
};

const GameIdentityContext = createContext<GameIdentityContextType | null>(null);

export function GameIdentityProvider({ children }: { children: ReactNode }) {
  const [youName, setYouNameState] = useState(() => localStorage.getItem("youName") ?? "");
  const [managerName, setManagerNameState] = useState(() => localStorage.getItem("managerName") ?? "");

  function setYouName(n: string) {
    setYouNameState(n);
    localStorage.setItem("youName", n);
  }

  function setManagerName(n: string) {
    setManagerNameState(n);
    localStorage.setItem("managerName", n);
  }

  return (
    <GameIdentityContext.Provider value={{ youName, setYouName, managerName, setManagerName }}>
      {children}
    </GameIdentityContext.Provider>
  );
}

export function useGameIdentity() {
  const ctx = useContext(GameIdentityContext);
  if (!ctx) throw new Error("useGameIdentity must be used within GameIdentityProvider");
  return ctx;
}
