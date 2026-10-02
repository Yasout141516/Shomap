import { useI18n } from "../../i18n";
import { useSession } from "../../lib/session";

/** EN / বাং switch. Saves the choice to the account when logged in (FR-13.1). */
export function LangToggle() {
  const { lang, setLang } = useI18n();
  const { me, updateMe } = useSession();
  const pick = (l: "en" | "bn") => {
    setLang(l);
    if (me) void updateMe({ lang: l }).catch(() => undefined);
  };
  return (
    <div className="lang-toggle" role="group" aria-label="Language / ভাষা">
      <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => pick("en")} lang="en">
        EN
      </button>
      <button className={lang === "bn" ? "on" : ""} aria-pressed={lang === "bn"} onClick={() => pick("bn")} lang="bn">
        বাং
      </button>
    </div>
  );
}
