import { useState, type FormEvent } from 'react';
import { Users, Plus, ArrowUpRight, Search, Pencil, Trash2 } from 'lucide-react';
import { api } from './api';
import { DeleteDialog } from './delete-dialog';
import { Errors, Field, Notice, Empty, Loading, Dialog, useLoad, PageTitle } from './shared';

export const emptyCustomer = {
  company: '',
  street: '',
  street_number: '',
  city: '',
  zip: '',
  country: 'Česká republika',
  ico: '',
  dic: '',
  payment_id: null as string | null,
  end_customer: false,
  archived: false,
};

export function CustomerForm({ initial, onSaved, onCancel }: any) {
  const [v, V] = useState({ ...emptyCustomer, ...initial }),
    [error, E] = useState<any>(null),
    [busy, B] = useState(false),
    [preview, P] = useState<any>(null);
  const change = (k: string, val: any) => V((v: any) => ({ ...v, [k]: val }));
  async function save(e: FormEvent) {
    e.preventDefault();
    B(true);
    E(null);
    try {
      const data = Object.fromEntries(Object.keys(emptyCustomer).map((k) => [k, v[k]]));
      const result = await api(initial ? '/customers/' + initial.id : '/customers', {
        method: initial ? 'PUT' : 'POST',
        body: initial ? { version: initial.version, data } : data,
      });
      onSaved(result);
    } catch (e) {
      E(e);
    } finally {
      B(false);
    }
  }
  return (
    <Errors.Provider value={error?.fields ?? []}>
      <form onSubmit={save}>
        <Notice error={error} />
        <div className="ares">
          <Field name="ico" value={v.ico} onChange={(x: string) => change('ico', x)} />
          <button
            type="button"
            disabled={busy || !/^\d{8}$/.test(v.ico)}
            onClick={async () => {
              B(true);
              E(null);
              try {
                P(await api('/ares', { method: 'POST', body: { ico: v.ico } }));
              } catch (e) {
                E(e);
              } finally {
                B(false);
              }
            }}
          >
            <Search size={16} />
            Doplnit z ARES
          </button>
        </div>
        {preview && (
          <div className="notice">
            <strong>Náhled ARES</strong>
            <p>
              {preview.company}, {preview.street} {preview.street_number}, {preview.zip}{' '}
              {preview.city}
            </p>
            <p>Potvrzením doplníte právě zobrazená pole.</p>
            <button
              type="button"
              onClick={() => {
                V({ ...v, ...preview });
                P(null);
              }}
            >
              Potvrdit doplnění
            </button>
            <button type="button" onClick={() => P(null)}>
              Zrušit
            </button>
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={v.end_customer}
            onChange={(e) => change('end_customer', e.target.checked)}
          />
          Koncový zákazník (zjednodušená adresa na faktuře)
        </label>
        <div className="form-grid">
          {['company', 'street', 'street_number', 'city', 'zip', 'country', 'dic'].map((k) => (
            <Field
              key={k}
              name={k}
              value={v[k]}
              required={k === 'company' || (!v.end_customer && k !== 'dic')}
              onChange={(x: string) => change(k, x)}
            />
          ))}
          <Field
            name="payment_id"
            value={v.payment_id}
            onChange={(x: string) => change('payment_id', x)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={v.payment_id === null}
            onChange={(e) => change('payment_id', e.target.checked ? null : '')}
          />
          Konstantní symbol není nastaven (NULL)
        </label>
        <p className="muted">
          Nastavený i prázdný konstantní symbol zachovává bankovní variantu Alto; NULL je odlišná
          hodnota.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={v.archived}
            onChange={(e) => change('archived', e.target.checked)}
          />
          Archivovaný kontakt
        </label>
        <div className="form-actions">
          <button type="button" onClick={onCancel}>
            Zrušit
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Ukládám…' : 'Uložit kontakt'}
          </button>
        </div>
      </form>
    </Errors.Provider>
  );
}

export function Customers() {
  const [q, Q] = useState(''),
    [archived, A] = useState(false),
    [edit, E] = useState<any>(undefined),
    [remove, Remove] = useState<any>(null);
  const { data, error, reload } = useLoad(
    '/customers?q=' + encodeURIComponent(q) + '&archived=' + archived,
  );
  return (
    <>
      <PageTitle
        eyebrow="LIDÉ A FIRMY"
        title="Kontakty"
        description="Odběratelé a jejich fakturační údaje."
      >
        <button className="primary" onClick={() => E(null)}>
          <Plus size={18} />
          Nový kontakt
        </button>
      </PageTitle>
      <section className="panel">
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Hledat kontakt"
              value={q}
              placeholder="Firma, IČO nebo DIČ"
              onChange={(e) => Q(e.target.value)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={archived} onChange={(e) => A(e.target.checked)} />
            Archivované
          </label>
        </div>
        <Notice error={error} />
        {!data && !error ? (
          <Loading />
        ) : data?.length ? (
          <div className="contact-grid">
            {data.map((c: any) => (
              <article className="contact-card record-card" key={c.id}>
                <span className="contact-avatar">
                  <Users size={22} />
                </span>
                <strong>{c.company}</strong>
                <small>
                  {c.end_customer
                    ? 'Koncový zákazník'
                    : `${c.street} ${c.street_number}, ${c.city}`}
                </small>
                <span>
                  {c.ico ? 'IČO ' + c.ico : 'Bez IČO'} <ArrowUpRight size={16} />
                </span>
                <div className="record-actions">
                  <button type="button" onClick={() => E(c)}>
                    <Pencil size={15} />
                    Upravit
                  </button>
                  <button type="button" className="danger" onClick={() => Remove(c)}>
                    <Trash2 size={15} />
                    Smazat
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty text="Žádné kontakty" />
        )}
      </section>
      {remove && (
        <DeleteDialog
          entity="customer"
          record={remove}
          label={remove.company}
          onClose={() => Remove(null)}
          onDeleted={() => {
            Remove(null);
            reload();
          }}
        />
      )}
      {edit !== undefined && (
        <Dialog title={edit ? 'Upravit kontakt' : 'Nový kontakt'} onClose={() => E(undefined)}>
          <CustomerForm
            initial={edit}
            onCancel={() => E(undefined)}
            onSaved={() => {
              E(undefined);
              reload();
            }}
          />
        </Dialog>
      )}
    </>
  );
}
