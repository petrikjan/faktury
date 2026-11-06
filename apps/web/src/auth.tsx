import { useState, useEffect, useContext, type FormEvent } from 'react';
import { FileText, ArrowRight, ShieldCheck } from 'lucide-react';
import { api, setCsrf } from './api';
import { Auth, Notice, Loading } from './shared';
import { Shell } from './layout';

export function App() {
  const [user, setUser] = useState<any>(undefined),
    [expired, setExpired] = useState(false),
    [error, setError] = useState<any>(null);
  const refresh = async () => {
    try {
      const s = await api('/session');
      setUser(s.user);
      setCsrf(s.csrf);
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void refresh();
    const expire = () => {
      setUser(null);
      setCsrf(null);
      setExpired(true);
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  if (error)
    return (
      <div className="login">
        <Notice error={error} />
        <button onClick={refresh}>Zkusit znovu</button>
      </div>
    );
  if (user === undefined) return <Loading />;
  return (
    <Auth.Provider value={{ user, refresh }}>
      {user ? <Shell /> : <Login expired={expired} />}
    </Auth.Provider>
  );
}

export function Login({ expired }: any) {
  const [username, U] = useState(''),
    [password, P] = useState(''),
    [busy, B] = useState(false),
    [error, E] = useState<any>(null);
  const { refresh } = useContext(Auth);
  async function submit(e: FormEvent) {
    e.preventDefault();
    B(true);
    E(null);
    try {
      const s = await api('/login', { method: 'POST', body: { username, password } });
      setCsrf(s.csrf);
      P('');
      await refresh();
    } catch (e) {
      E(e);
    } finally {
      B(false);
    }
  }
  return (
    <main className="login">
      <div className="login-story">
        <span className="brand-mark">
          <FileText />
        </span>
        <span className="eyebrow">MÉNĚ ADMINISTRATIVY, VÍCE PŘEHLEDU</span>
        <h1>
          Vaše práce.
          <br />
          Vaše faktury.
          <br />
          <em>Vše na svém místě.</em>
        </h1>
        <p>Klidné místo pro každodenní fakturaci.</p>
        <div className="story-note">
          <ShieldCheck size={18} /> Soukromá aplikace · chráněný přístup
        </div>
      </div>
      <form onSubmit={submit} className="login-form">
        <span className="eyebrow">FAKTURY</span>
        <h2>Vítejte zpátky</h2>
        <p>Přihlaste se ke své fakturaci.</p>
        {expired && <div className="notice">Relace vypršela. Přihlaste se znovu.</div>}
        <Notice error={error} />
        <label className="field">
          <span>Přihlašovací jméno</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => U(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Heslo</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => P(e.target.value)}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'Přihlašuji…' : 'Přihlásit se'}
          <ArrowRight size={17} />
        </button>
        <small>Účet vytváří správce. Veřejná registrace není dostupná.</small>
      </form>
    </main>
  );
}
