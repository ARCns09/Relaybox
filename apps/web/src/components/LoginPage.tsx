import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { PlatformUser } from "../platform";
import { Brand } from "./Brand";

interface Props {
  users: PlatformUser[];
  onLogin(email: string, password: string): Promise<void>;
}

export function LoginPage({ users, onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoveryNote, setRecoveryNote] = useState(false);

  const submit = async () => {
    setError(""); setRecoveryNote(false);
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) { setError("Enter your invited email and password."); return; }
    setBusy(true);
    try { await onLogin(email, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in."); }
    finally { setBusy(false); }
  };

  const previews = users.filter((user) => user.status === "active").slice(0, 2);
  return <main className="login-page">
    <div className="login-backdrop"><i /><i /><i /></div>
    <section className="login-shell">
      <div className="login-story">
        <Brand />
        <div><span className="login-kicker"><ShieldCheck /> Private by invitation</span><h1>Your email, without the audience.</h1>
          <p>Relaybox is a private mailbox workspace for trusted members. Accounts are created directly by the administrator.</p></div>
        <ul><li><LockKeyhole /> Token-protected mailboxes</li><li><Mail /> Private domains and conversations</li><li><KeyRound /> No public registration</li></ul>
        <small>Invite-only access · locally protected credentials</small>
      </div>
      <div className="login-card-wrap">
        <form className="login-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <header><span>Welcome back</span><h2>Sign in to Relaybox</h2><p>Use the account details provided by your administrator.</p></header>
          <label className="login-field"><span>Email address</span><div><Mail /><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div></label>
          <label className="login-field"><span>Password</span><div><LockKeyhole /><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          <button className="forgot-link" type="button" onClick={() => setRecoveryNote(true)}>Forgot password?</button>
          {recoveryNote && <p className="login-note">Contact your Relaybox administrator to receive a temporary password.</p>}
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary login-submit" disabled={busy} type="submit">{busy ? <Loader2 className="spin" /> : <ArrowRight />}{busy ? "Signing in…" : "Sign in"}</button>
          <div className="preview-access"><span>Frontend preview</span><p>Authentication is not connected yet. Choose a mock account and enter any non-empty password.</p><div>{previews.map((user) => <button type="button" key={user.id} onClick={() => { setEmail(user.email); setPassword("preview-only"); setError(""); }}><strong>{user.role === "admin" ? "Admin" : "Member"}</strong><small>{user.email}</small></button>)}</div></div>
          <footer><ShieldCheck /> No public signup is available.</footer>
        </form>
      </div>
    </section>
  </main>;
}
