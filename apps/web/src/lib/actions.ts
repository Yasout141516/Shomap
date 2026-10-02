import { useCallback, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useI18n } from "../i18n";
import { errorText } from "./api";
import { useToast } from "./appState";

/**
 * Runs a mutation with the app's standard handling: busy flag, error toast, optional success
 * toast, then invalidate the given queries whether it worked or not.
 */
export function useAction() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T>(fn: () => Promise<T>, opts: { success?: string; invalidate?: QueryKey[] } = {}): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await fn();
        if (opts.success) toast(opts.success, "success");
        return result;
      } catch (e) {
        toast(errorText(e, t), "error");
        return undefined;
      } finally {
        setBusy(false);
        for (const key of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
      }
    },
    [qc, t, toast],
  );
  return { run, busy };
}

/** Copies an incident's link; falls back to showing it when the clipboard is unavailable. */
export function useCopyIncidentLink() {
  const { t } = useI18n();
  const { toast } = useToast();
  return useCallback(
    async (id: string) => {
      const url = `${window.location.origin}/incident/${id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast(t("common.copied"), "success");
      } catch {
        toast(`${t("common.copyFailed")} ${url}`, "info");
      }
    },
    [t, toast],
  );
}
