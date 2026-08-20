import { useEffect, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";
import { navigateFresh } from "../lib/sessionNavigation";

function getSessionName(role) {
  try {
    const session = JSON.parse(localStorage.getItem("careerforge_session"));
    if (session?.role === role && session?.name) return session.name;
  } catch {}
  return role === "admin" ? "Administrator" : "Student";
}

export default function DashboardShell({
  role,
  navItems,
  active,
  onNavigate,
  children,
  title,
  subtitle,
  actions,
  profileName,
  profileAvatar,
  searchValue,
  onSearchChange,
  onSearchSubmit,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState(() => getSessionName(role));
  useEffect(() => {
    if (profileName) {
      setName(profileName);
      return;
    }
    try {
      const session = JSON.parse(localStorage.getItem("careerforge_session"));
      if (session?.name) setName(session.name);
    } catch {}
  }, [profileName]);

  const navigate = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  const logout = () => {
    localStorage.removeItem("careerforge_session");
    localStorage.removeItem("careerforge_token");
    navigateFresh("/");
  };

  const sidebar = (
    <>
      <div className="flex h-[78px] items-center justify-between px-5">
        <Brand href={role === "admin" ? "/admin" : "/student"} />
        <button onClick={() => setMobileOpen(false)} className="btn-ghost md:hidden" aria-label="Close navigation"><X size={18} /></button>
      </div>
      {role === "admin" && (
        <div className="clay-sidebar-status mx-4 mb-4 rounded-2xl border border-ink/[0.07] bg-white/60 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Operations workspace</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative h-8 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
              <div className="h-full w-[91%] rounded-full bg-plum" />
            </div>
            <b className="text-xs">Live</b>
          </div>
        </div>
      )}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {navItems.map(({ id, label, icon: Icon, badge, group }, index) => (
          <div key={id}>
            {group && <p className={`${index ? "mt-5" : ""} mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted/65`}>{group}</p>}
            <button className={`dash-side-link ${active === id ? "dash-side-link-active" : ""}`} onClick={() => navigate(id)}>
              <Icon size={17} strokeWidth={2} />
              <span className="flex-1">{label}</span>
              {badge ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${active === id ? "bg-white/15 text-white" : "bg-coral/12 text-coral"}`}>{badge}</span> : null}
            </button>
          </div>
        ))}
      </nav>
      <div className="clay-sidebar-footer border-t border-ink/[0.07] p-3">
        <button onClick={logout} className="dash-side-link text-coral hover:bg-coral/10 hover:text-coral">
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <main className="app-clay-shell min-h-screen bg-canvas">
      <aside className="clay-dashboard-sidebar fixed inset-y-0 left-0 z-50 hidden w-[250px] flex-col border-r border-white/80 bg-white/55 backdrop-blur-2xl md:flex">
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="clay-dashboard-sidebar flex h-full w-[280px] flex-col bg-canvas shadow-lift" onClick={(event) => event.stopPropagation()}>{sidebar}</aside>
        </div>
      )}

      <div className="min-h-screen md:pl-[250px]">
        <header className="clay-dashboard-topbar sticky top-0 z-40 flex h-[78px] items-center gap-3 border-b border-white/80 bg-canvas/80 px-4 backdrop-blur-2xl sm:px-7">
          <button onClick={() => setMobileOpen(true)} className="clay-icon-button grid h-10 w-10 place-items-center rounded-xl bg-ink text-white md:hidden" aria-label="Open navigation"><Menu size={18} /></button>
          <form className="relative hidden max-w-sm flex-1 lg:block" onSubmit={(event) => { event.preventDefault(); onSearchSubmit?.(); }}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              className="input min-h-10 bg-white/55 pl-10"
              placeholder={onSearchChange ? "Search students by name or ID..." : role === "admin" ? "Search users, jobs, content..." : "Search jobs, resources, community..."}
              aria-label={onSearchChange ? "Search students" : "Search workspace"}
              {...(onSearchChange ? { value: searchValue || "", onChange: (event) => onSearchChange(event.target.value) } : {})}
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <button className="clay-icon-button relative grid h-10 w-10 place-items-center rounded-xl border border-ink/[0.08] bg-white/60 text-muted transition hover:bg-white hover:text-ink" aria-label="Notifications">
              <Bell size={17} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-coral" />
            </button>
            <div className="relative">
              <button onClick={() => setProfileOpen(!profileOpen)} className="clay-profile-button flex h-11 items-center gap-2 rounded-2xl border border-ink/[0.08] bg-white/60 pl-1.5 pr-2.5 transition hover:bg-white" aria-haspopup="menu" aria-expanded={profileOpen}>
                <span className={`grid h-8 w-8 place-items-center overflow-hidden rounded-xl text-xs font-extrabold text-white ${role === "admin" ? "bg-plum" : "bg-cobalt"}`}>{profileAvatar ? <img src={profileAvatar} alt="" className="h-full w-full object-cover" /> : name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                <span className="hidden text-left sm:block">
                  <b className="block max-w-28 truncate text-xs">{name}</b>
                  <small className="block text-[10px] capitalize text-muted">{role}</small>
                </span>
                <ChevronDown className="text-muted" size={14} />
              </button>
              {profileOpen && (
                <div className="clay-popover glass-strong absolute right-0 top-14 w-52 animate-enter rounded-2xl p-2" role="menu">
                  <button onClick={() => { navigate(role === "admin" ? "settings" : "profile"); setProfileOpen(false); }} className="dash-side-link">Account settings</button>
                  <button onClick={logout} className="dash-side-link text-coral"><LogOut size={16} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="clay-dashboard-content px-4 pb-10 pt-6 sm:px-7 lg:px-9">
          <div className="clay-page-heading mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.15em] text-cobalt">{role === "admin" ? "CareerCube control center" : "My CareerCube"}</p>
              <h1 className="text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
          <div className="animate-enter" key={active}>{children}</div>
        </div>
      </div>
    </main>
  );
}
