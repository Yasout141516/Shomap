import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Urgency, Verification } from "@shomap/shared";

export interface Filters {
  categories: string[];
  urgencies: Urgency[];
  verification: Verification | "all";
  status: "active" | "resolved" | "all";
  days: 1 | 7 | 14;
  areaId: string | null;
}

export const DEFAULT_FILTERS: Filters = {
  categories: [],
  urgencies: [],
  verification: "all",
  status: "active",
  days: 14,
  areaId: null,
};

export type ToastTone = "info" | "success" | "error" | "sos" | "official";
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  href?: string;
}

interface AppState {
  filters: Filters;
  setFilters: (f: Filters | ((f: Filters) => Filters)) => void;
  reportOpen: boolean;
  openReport: () => void;
  closeReport: () => void;
  connected: boolean;
  setConnected: (c: boolean) => void;
  focusRequest: { lat: number; lng: number; zoom?: number; n: number } | null;
  focusMap: (lat: number, lng: number, zoom?: number) => void;
}

interface ToastState {
  toasts: Toast[];
  toast: (text: string, tone?: ToastTone, href?: string) => void;
  dismissToast: (id: number) => void;
}

const AppCtx = createContext<AppState | null>(null);
// Toasts change often; keeping them in their own context stops every toast from re-rendering the map.
const ToastCtx = createContext<ToastState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [reportOpen, setReportOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [focusRequest, setFocus] = useState<AppState["focusRequest"]>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (text: string, tone: ToastTone = "info", href?: string) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { id, text, tone, href }]);
      window.setTimeout(() => dismissToast(id), tone === "sos" ? 9000 : 5000);
    },
    [dismissToast],
  );
  const focusMap = useCallback((lat: number, lng: number, zoom?: number) => setFocus((f) => ({ lat, lng, zoom, n: (f?.n ?? 0) + 1 })), []);
  const openReport = useCallback(() => setReportOpen(true), []);
  const closeReport = useCallback(() => setReportOpen(false), []);

  const app = useMemo<AppState>(
    () => ({ filters, setFilters, reportOpen, openReport, closeReport, connected, setConnected, focusRequest, focusMap }),
    [filters, reportOpen, openReport, closeReport, connected, focusRequest, focusMap],
  );
  const toastState = useMemo<ToastState>(() => ({ toasts, toast, dismissToast }), [toasts, toast, dismissToast]);
  return (
    <AppCtx.Provider value={app}>
      <ToastCtx.Provider value={toastState}>{children}</ToastCtx.Provider>
    </AppCtx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp outside AppStateProvider");
  return v;
}

export function useToast(): ToastState {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside AppStateProvider");
  return v;
}
