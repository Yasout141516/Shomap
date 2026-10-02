import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FastForward, RefreshCw } from "lucide-react";
import { useI18n } from "../../i18n";
import { api, errorText } from "../../lib/api";
import { useApp } from "../../lib/appState";
import { qk, useDemoInfo, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { EmptyState } from "../../ui/states";

const HEROES = ["u-rahim", "u-nila", "u-tanvir", "u-rafiq", "u-shirin", "u-arif", "u-staff-thana-tejgaon", "u-admin"];

/** Presenter controls: LAN QR, account switcher, reset, fast-forward (spec §5). */
export function DemoPage() {
  const { t, name, list } = useI18n();
  const meta = useMeta();
  const info = useDemoInfo(!!meta.data?.demoMode);
  const { me, switchTo } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { toast } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  if (meta.data && !meta.data.demoMode) return <div className="page"><EmptyState title={t("errors.demo_only")} /></div>;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(false);
    }
  };

  const users = info.data?.users ?? [];
  const heroes = HEROES.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const others = users.filter((u) => !HEROES.includes(u.id));
  const describe = (u: (typeof users)[number]) => {
    const area = meta.data?.areas.find((a) => a.id === u.homeAreaId);
    const auth = meta.data?.authorities.find((a) => a.id === u.authorityId);
    return `${t(`roles.${u.role}`)}${area ? ` · ${name(area)}` : auth ? ` · ${name(auth)}` : ""}`;
  };
  const go = (id: string) =>
    run(async () => {
      const next = await switchTo(id);
      nav(next.role === "authority" ? "/authority" : next.role === "admin" ? "/admin" : "/");
    });

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
                <button
                  className="btn btn-sos btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api("/api/demo/reset", { method: "POST" });
                      setConfirmReset(false);
                      qc.clear();
                      void qc.invalidateQueries();
                      toast(t("demo.resetDone"), "success");
                    })
                  }
                >
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
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ clockOffsetHours: number; closed: number; expired: number }>("/api/demo/fast-forward", { body: { hours: 72 } });
                  void qc.invalidateQueries({ queryKey: qk.demo });
                  toast(t("demo.ffDone", { h: r.clockOffsetHours, closed: r.closed, expired: r.expired }), "info");
                })
              }
            >
              <FastForward size={16} aria-hidden="true" /> {t("demo.ff")}
            </button>
          </div>
        </section>

        <section className="card card-wide">
          <h2>{t("demo.switchRole")}</h2>
          <div className="quick-picks">
            {heroes.map((u) => (
              <button key={u.id} className={`quick-pick${me?.id === u.id ? " on" : ""}`} disabled={busy} onClick={() => void go(u.id)}>
                <strong>{u.displayName}</strong>
                <span className="muted small">{describe(u)}</span>
                {me?.id === u.id ? <span className="badge badge-verified">{t("demo.current")}</span> : null}
              </button>
            ))}
          </div>
          <details>
            <summary>{t("demo.everyone")}</summary>
            <div className="quick-picks">
              {others.map((u) => (
                <button key={u.id} className={`quick-pick${me?.id === u.id ? " on" : ""}`} disabled={busy} onClick={() => void go(u.id)}>
                  <strong>{u.displayName}</strong>
                  <span className="muted small">{describe(u)}</span>
                </button>
              ))}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
