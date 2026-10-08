import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ has_logo: false, logo_updated: null });

  const refresh = useCallback(() => {
    if (!localStorage.getItem("token")) return;
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <SettingsContext.Provider value={{ settings, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
