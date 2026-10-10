import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function usePricingTarget() {
  const [target, setTarget] = useState({ mode: "percent", value: 20, loaded: false });
  useEffect(() => { api.get("/pricing/settings").then((r) => setTarget({ ...r.data, loaded: true })).catch(() => {}); }, []);
  return target;
}
