import { useState, useEffect, useContext } from 'react';
import { Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import {
  FileText,
  Users,
  BookOpen,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  ShieldCheck,
  Menu,
} from 'lucide-react';
import { api } from './api';
import { Auth } from './shared';
import { Invoices } from './invoices';
import { Customers } from './customers';
import { Catalog } from './catalog';
import { InvoiceForm } from './invoice-form';
import { InvoiceDetail } from './invoice-detail';
import { SettingsPage } from './settings';

export function Shell() {
  const { user, refresh } = useContext(Auth);
  const [open, O] = useState(false);
  const loc = useLocation();
  useEffect(() => O(false), [loc.pathname]);
  const links = [
    ['/invoices', 'Faktury', FileText],
    ['/customers', 'Kontakty', Users],
    ['/catalog', 'Ceník', BookOpen],
    ['/reports', 'Přehledy', ChartNoAxesCombined],
    ['/settings', 'Nastavení', Settings],
  ] as const;
  return (
    <div className="app">
      <aside className={open ? 'sidebar show' : 'sidebar'}>
        <Link to="/invoices" className="brand">
          <span className="brand-mark">
            <FileText size={22} />
          </span>
          faktury<span className="brand-dot">.</span>
        </Link>
        <div className="workspace">VAŠE PRACOVNÍ MÍSTO</div>
        <nav>
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <ShieldCheck size={18} />
          <span>
            Vaše data jsou v bezpečí<small>Soukromá fakturace</small>
          </span>
        </div>
      </aside>
      {open && <button className="scrim" aria-label="Zavřít navigaci" onClick={() => O(false)} />}
      <div className="main-area">
        <header className="topbar">
          <button className="icon mobile-menu" aria-label="Navigace" onClick={() => O(!open)}>
            <Menu />
          </button>
          <span className="top-crumb">
            Pracovní přehled <span>/</span>{' '}
            {links.find(([p]) => loc.pathname.startsWith(p))?.[1] ?? 'Faktury'}
          </span>
          <div className="account">
            <span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span>
            <span>
              {user.username}
              <small>Správce</small>
            </span>
            <button
              className="icon"
              title="Odhlásit se"
              aria-label="Odhlásit se"
              onClick={async () => {
                await api('/logout', { method: 'POST' });
                await refresh();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/new" element={<InvoiceForm />} />
            <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/reports" element={<Invoices report />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/invoices" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          Faktury<span>Jednoduše. Přehledně. Soukromě.</span>
        </footer>
      </div>
    </div>
  );
}
