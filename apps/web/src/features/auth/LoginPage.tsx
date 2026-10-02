import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MeDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { ApiFail, api, errorText } from "../../lib/api";
import { useDemoInfo, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";

const HERO_IDS = ["u-rahim", "u-nila", "u-shirin", "u-arif", "u-staff-thana-tejgaon", "u-admin"];

/** PRD FR-1.1: phone + mock OTP (always 1234). Demo mode adds one-tap accounts. */
export function LoginPage() {
  const { t, name } = useI18n();
  const nav = useNavigate();
  const meta = useMeta();
  const demo = useDemoInfo(!!meta.data?.demoMode);
  const { afterChange, switchTo } = useSession();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phoneOk = /^01\d{9}$/.test(phone);
  const done = (me: MeDTO) => nav(me.role === "authority" ? "/authority" : me.role === "admin" ? "/admin" : "/");

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ me: MeDTO }>("/api/auth/login", { body: { phone, otp, displayName: displayName.trim() || undefined } });
      afterChange(r.me);
      done(r.me);
    } catch (e) {
      if (e instanceof ApiFail && e.details?.needsName) setNeedsName(true);
      else setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const heroes = (demo.data?.users ?? []).filter((u) => HERO_IDS.includes(u.id)).sort((a, b) => HERO_IDS.indexOf(a.id) - HERO_IDS.indexOf(b.id));

  return (
    <div className="page page-narrow">
      <h1>{t("auth.title")}</h1>
      {heroes.length ? (
        <section className="card">
          <h2>{t("auth.quickPick")}</h2>
          <div className="quick-picks">
            {heroes.map((u) => {
              const area = meta.data?.areas.find((a) => a.id === u.homeAreaId);
              const auth = meta.data?.authorities.find((a) => a.id === u.authorityId);
              return (
                <button key={u.id} className="quick-pick" onClick={() => void switchTo(u.id).then(done)}>
                  <strong>{u.displayName}</strong>
                  <span className="muted small">
                    {t(`roles.${u.role}`)}
                    {area ? ` · ${name(area)}` : auth ? ` · ${name(auth)}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="muted small">{t("auth.or")}</p>
        </section>
      ) : null}

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          if (stage === "phone") setStage("otp");
          else void login();
        }}
      >
        <label className="field">
          <span className="field-label">{t("auth.phone")}</span>
          <input id="login-phone" inputMode="numeric" autoComplete="tel" value={phone} maxLength={11} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} aria-describedby="phone-help" />
          <span id="phone-help" className="field-help">
            {phone && !phoneOk ? t("auth.phoneInvalid") : t("auth.phoneHelp")}
          </span>
        </label>
        {stage === "otp" ? (
          <label className="field">
            <span className="field-label">{t("auth.otp")}</span>
            <input id="login-otp" inputMode="numeric" autoComplete="one-time-code" value={otp} maxLength={6} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} aria-describedby="otp-help" autoFocus />
            <span id="otp-help" className="field-help">
              {t("auth.otpHelp")}
            </span>
          </label>
        ) : null}
        {needsName ? (
          <label className="field">
            <span className="field-label">{t("auth.name")}</span>
            <input id="login-name" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
            <span className="field-help">{t("auth.nameHelp")}</span>
          </label>
        ) : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-block" disabled={busy || !phoneOk || (stage === "otp" && otp.length < 4) || (needsName && displayName.trim().length < 2)}>
          {stage === "phone" ? t("auth.sendOtp") : t("auth.verify")}
        </button>
      </form>
    </div>
  );
}
