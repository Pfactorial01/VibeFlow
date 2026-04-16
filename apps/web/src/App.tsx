import type { ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { FeedPage } from "./pages/FeedPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { UploadPage } from "./pages/UploadPage";

function Shell({ children }: { children: ReactNode }) {
  const { user, logout, loading } = useAuth();
  return (
    <div className="shell">
      <header className="topnav">
        <NavLink to="/feed" className="brand">
          VibeFlow
        </NavLink>
        <nav className="topnav__links">
          <NavLink to="/feed" end>
            Latest
          </NavLink>
          <NavLink to="/feed/trending">Trending</NavLink>
          {user ? (
            <NavLink to="/upload">Upload</NavLink>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <NavLink to="/signup">Sign up</NavLink>
            </>
          )}
          {user ? (
            <button type="button" className="btn btn--ghost" onClick={() => void logout()}>
              Log out ({user.username})
            </button>
          ) : null}
        </nav>
      </header>
      <main className="main">
        {loading ? <p className="muted center">Loading session…</p> : children}
      </main>
    </div>
  );
}

function FeedLatest() {
  return <FeedPage tab="latest" />;
}

function FeedTrending() {
  return <FeedPage tab="trending" />;
}

function ProtectUpload() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <UploadPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<FeedLatest />} />
            <Route path="/feed/trending" element={<FeedTrending />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/upload" element={<ProtectUpload />} />
            <Route path="*" element={<Navigate to="/feed" replace />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </AuthProvider>
  );
}
