import { useState } from "react";
import { api, setToken } from "../api";
import { ErrorLine } from "../components/ui";
import type { User } from "../types";

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="login">
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api<{ token: string; user: User }>("/api/auth/login", { body: { email, password } });
          setToken(r.token);
          onLogin(r.user);
        } catch (err) { setError((err as Error).message); }
      }}>
        <h1>HUB BRO</h1>
        <label className="field"><span>Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" /></label>
        <label className="field mt"><span>Пароль</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <ErrorLine error={error} />
        <button className="primary mt wide" type="submit">Войти</button>
      </form>
    </div>
  );
}
