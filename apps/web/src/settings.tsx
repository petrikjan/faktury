import { useState, useEffect, useContext } from 'react';
import { Plus, Wallet, Pencil, Trash2 } from 'lucide-react';
import { api } from './api';
import { DeleteDialog } from './delete-dialog';
import { Auth, Errors, Field, Notice, Loading, Dialog, useLoad, PageTitle } from './shared';

export function SettingsPage() {
  const { data: s, error, reload } = useLoad('/settings');
  const { data: audit, reload: reloadAudit } = useLoad('/audit');
  const [v, V] = useState<any>(null),
    [err, E] = useState<any>(null),
    [success, S] = useState(''),
    [bank, Bank] = useState<any>(undefined),
    [password, P] = useState({ current: '', next: '' }),
    [busy, B] = useState(false),
    [remove, Remove] = useState<any>(null);
  const { refresh } = useContext(Auth);
  useEffect(() => {
    if (s)
      V({
        data: s.supplier?.data ?? {
          company: '',
          street: '',
          city: '',
          zip: '',
          country: 'Česká republika',
          ico: '',
          dic: '',
          phone: '',
          email: '',
          website: '',
          footer: '',
        },
        vat_rate: s.supplier?.vat_rate ?? '21',
        version: s.supplier?.version ?? 0,
      });
  }, [s]);
  async function run(fn: () => Promise<any>, message: string) {
    B(true);
    E(null);
    S('');
    try {
      await fn();
      S(message);
      reload();
      reloadAudit();
    } catch (e) {
      E(e);
    } finally {
      B(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="VAŠE PRACOVNÍ MÍSTO"
        title="Nastavení"
        description="Dodavatel, platební účty a zabezpečení aplikace."
      />
      <Notice error={error ?? err} />
      {success && (
        <div className="notice success" role="status">
          {success}
        </div>
      )}
      {!v ? (
        <Loading />
      ) : (
        <Errors.Provider value={err?.fields ?? []}>
          <form
            className="panel form-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api('/settings/supplier', { method: 'PUT', body: v }),
                'Údaje dodavatele byly uloženy. Vystavené doklady se nezměnily.',
              );
            }}
          >
            <h2>Dodavatel</h2>
            <p className="muted">
              Změny se použijí pro další vystavení. Existující doklady mají vlastní snímek.
            </p>
            <div className="form-grid three">
              {Object.keys(v.data).map((k) => (
                <Field
                  key={k}
                  name={k}
                  type={k === 'footer' ? 'textarea' : 'text'}
                  value={v.data[k]}
                  onChange={(x: string) => V({ ...v, data: { ...v.data, [k]: x } })}
                />
              ))}
              <Field
                name="vat_rate"
                label="Výchozí sazba DPH (%)"
                value={v.vat_rate}
                onChange={(x: string) => V({ ...v, vat_rate: x })}
              />
            </div>
            <div className="form-actions">
              {s?.supplier && (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    Remove({
                      entity: 'supplier',
                      record: s.supplier,
                      label: s.supplier.data.company,
                    })
                  }
                >
                  <Trash2 size={15} />
                  Smazat dodavatele
                </button>
              )}
              <button className="primary" disabled={busy}>
                Uložit dodavatele
              </button>
            </div>
          </form>
        </Errors.Provider>
      )}
      <section className="panel form-panel">
        <div className="section-title">
          <h2>Bankovní účty</h2>
          <button
            onClick={() =>
              Bank({
                label: '',
                account_number: '',
                bank_code: '',
                variant: 'standard',
                active: true,
              })
            }
          >
            <Plus size={16} />
            Přidat účet
          </button>
        </div>
        <div className="bank-grid">
          {s?.banks.map((b: any) => (
            <article className="bank-card record-card" key={b.id}>
              <Wallet size={20} />
              <strong>{b.label}</strong>
              <span>
                {b.account_number}/{b.bank_code}
              </span>
              <small>
                {b.variant === 'alto' ? 'Varianta Alto' : 'Standardní varianta'} ·{' '}
                {b.active ? 'Aktivní' : 'Neaktivní'}
              </small>
              <div className="record-actions">
                <button type="button" onClick={() => Bank(b)}>
                  <Pencil size={15} />
                  Upravit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    Remove({
                      entity: 'bank',
                      record: b,
                      label: b.label + ' · ' + b.account_number + '/' + b.bank_code,
                    })
                  }
                >
                  <Trash2 size={15} />
                  Smazat
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel form-panel">
        <h2>Zabezpečení a soukromí</h2>
        <p>
          <span className="badge paid">Argon2id</span> Serverové relace · ochrana CSRF · omezení
          přihlášení
        </p>
        <div className="notice">
          <strong>MCP: {s?.mcp_enabled ? 'minimální navigační režim' : 'vypnuté'}</strong>
          <p>
            MCP neposkytuje faktury, kontakty, ceny, PDF ani souhrny. Po zapnutí vrací pouze
            statický technický stav a odkazy na chráněný web. Přímé připojení z vašeho mobilního
            ChatGPT zatím není ověřené.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/password', { method: 'POST', body: password });
              P({ current: '', next: '' });
              await refresh();
            }, 'Heslo bylo změněno. Přihlaste se znovu.');
          }}
        >
          <h3>Změnit heslo</h3>
          <div className="form-grid">
            <label className="field">
              <span>Současné heslo</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password.current}
                onChange={(e) => P({ ...password, current: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Nové heslo (alespoň 12 znaků)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password.next}
                onChange={(e) => P({ ...password, next: e.target.value })}
                minLength={12}
                required
              />
            </label>
          </div>
          <button disabled={busy}>Změnit heslo a odhlásit relace</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Poslední aktivita</h2>
          <small>Bez obsahu faktur a osobních údajů</small>
        </div>
        <div className="audit-list">
          {audit?.map((a: any) => (
            <div key={a.id}>
              <span>{a.action}</span>
              <small>
                {a.actor ?? 'Lokální proces'} · {a.created_at}
              </small>
            </div>
          ))}
        </div>
      </section>
      {remove && (
        <DeleteDialog
          entity={remove.entity}
          record={remove.record}
          label={remove.label}
          onClose={() => Remove(null)}
          onDeleted={() => {
            Remove(null);
            reload();
            reloadAudit();
          }}
        />
      )}
      {bank !== undefined && (
        <Dialog title="Bankovní účet" onClose={() => Bank(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { id, version } = bank;
                const rest = Object.fromEntries(
                  ['label', 'account_number', 'bank_code', 'variant', 'active'].map((k) => [
                    k,
                    bank[k],
                  ]),
                );
                await api('/settings/banks' + (id ? '/' + id : ''), {
                  method: id ? 'PUT' : 'POST',
                  body: id ? { version, data: rest } : rest,
                });
                Bank(undefined);
              }, 'Účet byl uložen.');
            }}
          >
            <div className="form-grid">
              {['label', 'account_number', 'bank_code'].map((k) => (
                <Field
                  key={k}
                  name={k}
                  value={bank[k]}
                  required
                  onChange={(x: string) => Bank({ ...bank, [k]: x })}
                />
              ))}
              <Field
                name="variant"
                label="Varianta"
                value={bank.variant}
                onChange={(x: string) => Bank({ ...bank, variant: x })}
              >
                <option value="standard">Standardní</option>
                <option value="alto">Alto</option>
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={bank.active}
                onChange={(e) => Bank({ ...bank, active: e.target.checked })}
              />
              Aktivní účet
            </label>
            <button className="primary" disabled={busy}>
              Uložit účet
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
