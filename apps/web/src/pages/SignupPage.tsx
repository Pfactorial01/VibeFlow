import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function SignupPage() {
  const nav = useNavigate();
  const { signup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await signup(username, password);
      nav("/feed", { replace: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Signup failed");
    }
  };

  return (
    <div className="auth-page">
      <h1>Create account</h1>
      {err ? <p className="error-banner">{err}</p> : null}
      <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <button type="submit" className="btn btn--primary btn--block">
          Sign up
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
