import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import LandingPage from "../components/LandingPage";
import AuthExperience from "../components/AuthExperience";
import StudentWorkspace from "../components/student/StudentWorkspace";
import AdminWorkspace from "../components/admin/AdminWorkspace";
import CommunityLandingPage from "../components/public/CommunityLandingPage";
import ResourcesLandingPage from "../components/public/ResourcesLandingPage";
import { RouterProvider, useLocation } from "../lib/router";
import { clearNavigationToken, navigateFresh } from "../lib/sessionNavigation";
import { getRoleSession, getRoleToken } from "../lib/roleSession";
import { ThemeProvider } from "../lib/theme";

const RECOVERY_KEY = "careerforge:route-recovery";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("CareerCube route render failed", error);
    if (!sessionStorage.getItem(RECOVERY_KEY)) {
      sessionStorage.setItem(RECOVERY_KEY, window.location.pathname);
      navigateFresh(`${window.location.pathname}${window.location.search}`);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
        <div className="panel max-w-md p-8">
          <h1 className="text-xl font-extrabold">This page needs a clean reload.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Your account data is safe. Reload the current page to continue.</p>
          <button className="btn-primary mt-6" onClick={() => navigateFresh(window.location.pathname)}>Reload page</button>
        </div>
      </main>
    );
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    clearNavigationToken();
    sessionStorage.removeItem(RECOVERY_KEY);
  }, [pathname]);
  return null;
}

function RequireAuth({ role, children }) {
  const session = getRoleSession(role);
  const token = getRoleToken(role);
  const authenticated = Boolean(token && session?.role === role);

  useEffect(() => {
    if (!authenticated) {
      navigateFresh(`/login/${role}`);
    }
  }, [authenticated, role]);

  if (!authenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas">
        <p className="text-sm font-bold text-muted">Checking your session...</p>
      </main>
    );
  }

  return children;
}

function App() {
  const { pathname } = useLocation();
  let page = <LandingPage />;
  if (pathname === "/community") page = <CommunityLandingPage />;
  else if (pathname === "/resources") page = <ResourcesLandingPage />;
  else if (pathname === "/login/student") page = <AuthExperience role="student" />;
  else if (pathname === "/login/admin") page = <AuthExperience role="admin" />;
  else if (pathname === "/student") page = <RequireAuth role="student"><StudentWorkspace /></RequireAuth>;
  else if (pathname === "/admin") page = <RequireAuth role="admin"><AdminWorkspace /></RequireAuth>;
  return <><ScrollToTop />{page}</>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppErrorBoundary>
        <RouterProvider>
          <App />
        </RouterProvider>
      </AppErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
