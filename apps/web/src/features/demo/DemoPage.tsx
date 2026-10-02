import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FastForward, RefreshCw } from "lucide-react";
import { homeRouteFor, type DemoInfoDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { useAction } from "../../lib/actions";
import { useToast } from "../../lib/appState";
import { describeUser } from "../../lib/demo";
import { useLookup } from "../../lib/lookup";
import { qk, useDemoInfo, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { EmptyState } from "../../ui/states";

/** Presenter controls: LAN QR, account switcher, reset, fast-forward (spec §5). */
export function DemoPage() {
  const { t, name, list } = useI18n();
  const meta = useMeta();
  const lookup = useLookup();
  const info = useDemoInfo(!!meta.data?.demoMode);
  const { me, switchTo } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { toast } = useToast();
  const { run, busy } = useAction();
  const [confirmReset, setConfirmReset] = useState(false);

  if (meta.data && !meta.data.demoMode)
    return (
      <div className="page">
        <EmptyState title={t("errors.demo_only")} />
      </div>
    );

  const users = info.data?.users ?? [];
  const heroes = users.filter((u) => u.hero);
  const others = users.filter((u) => !u.hero);
  const go = (id: string) => void run(async () => nav(homeRouteFor((await switchTo(id)).role)));
  const reset = () =>
    void run(async () => {
      await api("/api/demo/reset", { method: "POST" });
      setConfirmReset(false);
      qc.clear();
      void qc.invalidateQueries();
      toast(t("demo.resetDone"), "success");
    });
  const fastForward = () =>
    void run(
      async () => {
        const r = await api<{ clockOffsetHours: number; closed: number; expired: number }>("/api/demo/fast-forward", { body: { hours: 72 } });
        toast(t("demo.ffDone", { h: r.clockOffsetHours, closed: r.closed, expired: r.expired }), "info");
      },
      { invalidate: [qk.demo] },
    );

  const picker = (list: DemoInfoDTO["users"]) => (
    <div className="quick-picks">
      {list.map((u) => (
        <button key={u.id} className={`quick-pick${me?.id === u.id ? " on" : ""}`} disabled={busy} onClick={() => go(u.id)}>
          <strong>{u.displayName}</strong>
          <span className="muted small">{u.hero ?? describeUser(u, t, name, lookup)}</span>
          {me?.id === u.id ? <span className="badge badge-verified">{t("demo.current")}</span> : null}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page page-wide demo-page">
      <header className="page-head">
        <h1>{t("demo.title")}</h1>
        {info.data?.clockOffsetHours ? <p className="badge badge-demo">{t("demo.clock", { h: info.data.clockOffsetHours })}</p> : null}
      </header>

      <div className="demo-grid">
        <section className="card">
          <h2>{t("demo.lan")}</h2>
          {info.data?.lanUrls.length ? (
            <>
              <p className="muted">{t("demo.lanHelp")}</p>
              {info.data.qrSvg ? <div className="qr" dangerouslySetInnerHTML={{ __html: info.data.qrSvg }} /> : null}
              {info.data.lanUrls.map((u) => (
                <p key={u} className="lan-url">
                  <code>{u}</code>
                </p>
              ))}
            </>
          ) : (
            <p className="note">{t("demo.noLan")}</p>
          )}
        </section>

        <section className="card">
          <h2>{t("demo.heroes")}</h2>
          <ol className="script">
            {list("demo.script").map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="row-gap wrap">
            {confirmReset ? (
              <>
                <p className="note small">{t("demo.resetConfirm")}</p>
                <button className="btn btn-sos btn-sm" disabled={busy} onClick={reset}>
                  {t("demo.reset")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(true)}>
                <RefreshCw size={16} aria-hidden="true" /> {t("demo.reset")}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={fastForward}>
              <FastForward size={16} aria-hidden="true" /> {t("demo.ff")}
            </button>
          </div>
        </section>

        <section className="card card-wide">
          <h2>{t("demo.switchRole")}</h2>
          {picker(heroes)}
          <details>
            <summary>{t("demo.everyone")}</summary>
            {picker(others)}
          </details>
        </section>
      </div>
    </div>
  );
}
