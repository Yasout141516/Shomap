import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, LayoutDashboard, LogIn, Map as MapIcon, Plus, Rss, User } from "lucide-react";
import { homeRouteFor } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { useApp } from "../../lib/appState";
import { useMeta, useNotifications } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { RealtimeBridge } from "../../lib/realtime";
import { Toasts } from "../../ui/Toasts";
import { ReportModal } from "../report/ReportModal";
import { SosBanner } from "../sos/SosBanner";
import { FirstRun } from "./FirstRun";
import { LangToggle } from "./LangToggle";

function ProfileMenu() {
  const { t } = useI18n();
  const { me, logout } = useSession();
  const meta = useMeta();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!me) {
    return (
      <NavLink to="/login" className="btn btn-secondary btn-sm">
        <LogIn size={16} aria-hidden="true" />
        {t("common.login")}
      </NavLink>
    );
  }
  const go = (path: string) => {
    setOpen(false);
    nav(path);
  };
  return (
    <div className="profile" ref={ref}>
      <button className="profile-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">
          {me.displayName.slice(0, 1)}
        </span>
        <span className="profile-name">{me.displayName}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{me.displayName}</strong>
            <span className="muted small">{t(`roles.${me.role}`)}</span>
          </div>
          {me.role === "citizen" ? (
            <>
              <button role="menuitem" onClick={() => go("/me")}>{t("nav.myReports")}</button>
              <button role="menuitem" onClick={() => go("/me/zones")}>{t("nav.zones")}</button>
            </>
          ) : null}
          {me.role === "authority" ? <button role="menuitem" onClick={() => go("/authority")}>{t("nav.authority")}</button> : null}
          {me.role === "admin" ? <button role="menuitem" onClick={() => go("/admin")}>{t("nav.admin")}</button> : null}
          {meta.data?.demoMode ? <button role="menuitem" onClick={() => go("/demo")}>{t("nav.demo")}</button> : null}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout().then(() => nav("/"));
            }}
          >
            {t("common.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function UnreadBadge() {
  const { me } = useSession();
  const notes = useNotifications(!!me);
  const { n } = useI18n();
  const unread = notes.data?.filter((x) => !x.readAt).length ?? 0;
  if (!unread) return null;
  return <span className="count-badge">{n(Math.min(unread, 99))}</span>;
}

export function Shell() {
  const { t } = useI18n();
  const meta = useMeta();
  const { openReport, reportOpen, connected } = useApp();
  const { me } = useSession();
  const loc = useLocation();
  const staffHome = me && me.role !== "citizen" ? homeRouteFor(me.role) : null;
  const showFab = !reportOpen && (loc.pathname === "/" || loc.pathname.startsWith("/incident") || loc.pathname === "/feed" || loc.pathname === "/dashboard");

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="ShoMap">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--brand)" />
            <path d="M16 6c-4.4 0-8 3.4-8 7.7C8 19.5 16 26 16 26s8-6.5 8-12.3C24 9.4 20.4 6 16 6z" fill="#FAF8F3" />
            <circle cx="16" cy="13.5" r="3.4" fill="#F42A41" />
          </svg>
          <span className="brand-name">ShoMap</span>
        </NavLink>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/" end>
            {t("nav.map")}
          </NavLink>
          <NavLink to="/feed">{t("nav.feed")}</NavLink>
          <NavLink to="/dashboard">{t("nav.dashboard")}</NavLink>
          <NavLink to="/alerts" className="with-badge">
            {t("nav.alerts")}
            <UnreadBadge />
          </NavLink>
          {staffHome ? <NavLink to={staffHome}>{t(me?.role === "authority" ? "nav.authority" : "nav.admin")}</NavLink> : null}
        </nav>
        <div className="topbar-right">
          <LangToggle />
          <ProfileMenu />
        </div>
      </header>

      {meta.data?.publicDemo ? (
        <div className="public-banner" role="note">
          {t("demo.publicBanner")} <NavLink to="/demo">{t("demo.publicBannerLink")}</NavLink>
        </div>
      ) : null}
      <SosBanner />
      {!connected ? (
        <div className="reconnecting" role="status">
          {t("reconnecting")}
        </div>
      ) : null}

      <main id="main" className="main">
        <Outlet />
      </main>

      {showFab ? (
        <button className="fab" onClick={openReport}>
          <Plus size={20} aria-hidden="true" />
          {t("nav.report")}
        </button>
      ) : null}

      <nav className="bottombar" aria-label="Main">
        <NavLink to="/" end>
          <MapIcon size={20} aria-hidden="true" />
          <span>{t("nav.map")}</span>
        </NavLink>
        <NavLink to="/feed">
          <Rss size={20} aria-hidden="true" />
          <span>{t("nav.feed")}</span>
        </NavLink>
        <button className="bottombar-report" onClick={openReport} aria-label={t("nav.report")}>
          <Plus size={26} aria-hidden="true" />
        </button>
        <NavLink to="/alerts" className="with-badge">
          <Bell size={20} aria-hidden="true" />
          <span>{t("nav.alerts")}</span>
          <UnreadBadge />
        </NavLink>
        <NavLink to={staffHome ?? "/me"}>
          {staffHome ? <LayoutDashboard size={20} aria-hidden="true" /> : <User size={20} aria-hidden="true" />}
          <span>{staffHome ? t(me?.role === "authority" ? "nav.authority" : "nav.admin") : t("nav.me")}</span>
        </NavLink>
      </nav>

      {reportOpen ? <ReportModal /> : null}
      <FirstRun />
      <Toasts />
      <RealtimeBridge />
    </div>
  );
}
