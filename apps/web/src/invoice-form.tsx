import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useParams, useBlocker } from 'react-router-dom';
import {
  Plus,
  Search,
  ArrowLeft,
  ArrowRight,
  Trash2,
  GripVertical,
  ShieldCheck,
} from 'lucide-react';
import { api } from './api';
import { calculate, addDays, todayPrague, dateInput } from '../../../packages/domain/index';
import { money, Errors, Field, Notice, Dialog, Loading, useLoad, PageTitle } from './shared';
import { CustomerForm } from './customers';

export const blankItem = () => ({
  description: '',
  unit: '',
  price: '',
  quantity: '1',
  vat_rate: '21',
});
const dueDateFor = (issued: string, days: string) => {
  if (!dateInput.safeParse(issued).success || !/^\d{1,4}$/.test(days)) return '';
  const date = addDays(issued, Number(days));
  return dateInput.safeParse(date).success ? date : '';
};

export function InvoiceForm() {
  const { id } = useParams(),
    nav = useNavigate(),
    loc = useLocation();
  const { data: customers, reload: reloadCustomers } = useLoad('/customers');
  const { data: catalog } = useLoad('/catalog');
  const { data: settings } = useLoad('/settings');
  const [v, V] = useState<any>({
      customer_id: '',
      issue_date: todayPrague(),
      tax_date: todayPrague(),
      due_date: addDays(todayPrague(), 14),
      currency: 'CZK',
      bank_account_id: '',
      items: [blankItem()],
    }),
    [dueDays, DueDays] = useState('14'),
    [version, Ver] = useState(1),
    [error, E] = useState<any>(null),
    [busy, B] = useState(false),
    [contact, C] = useState(false),
    [dirty, D] = useState(false),
    [customerSearch, CS] = useState(''),
    [confirmIssue, CI] = useState<any>(null),
    [original, Original] = useState<any>(null),
    [invoiceNumber, NumberValue] = useState(''),
    [confirmRevision, CR] = useState(false);
  const key = useRef(crypto.randomUUID()),
    saved = useRef(false),
    dirtyRef = useRef(false);
  const blocker = useBlocker(() => dirtyRef.current);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  useEffect(() => {
    if (id) {
      api('/invoices/' + id)
        .then((d) => {
          Original(d);
          NumberValue(d.invoice_number ?? '');
          Ver(d.version);
          DueDays(String(d.due_days));
          V({
            customer_id: String(d.customer_id),
            issue_date: d.issue_date,
            tax_date: d.tax_date,
            due_date: d.due_date,
            currency: d.currency,
            bank_account_id: String(d.bank_account_id),
            items: d.items.map((i: any) => ({
              description: i.description,
              unit: i.unit,
              price: i.price,
              quantity: i.quantity,
              vat_rate: i.vat_rate,
            })),
          });
        })
        .catch(E);
    } else if (loc.state?.duplicate) {
      const { requires_review: _review, ...copy } = loc.state.duplicate;
      V((old: any) => ({ ...old, ...copy }));
    }
  }, [id]);
  useEffect(() => {
    if (settings && !v.bank_account_id)
      V((old: any) => ({
        ...old,
        bank_account_id:
          settings.banks.find((b: any) => b.active && b.variant === 'standard')?.id ?? '',
      }));
  }, [settings]);
  // Business data are kept in component memory only. No invoice data or session tokens in localStorage.
  const change = (k: string, val: any) => {
    V((old: any) =>
      k === 'issue_date'
        ? { ...old, issue_date: val, tax_date: val, due_date: dueDateFor(val, dueDays) }
        : { ...old, [k]: val },
    );
    dirtyRef.current = true;
    D(true);
  };
  const item = (p: number, k: string, val: string) =>
    change(
      'items',
      v.items.map((i: any, n: number) => (n === p ? { ...i, [k]: val } : i)),
    );
  let totals: any = null;
  try {
    totals = calculate(
      v.items.map((i: any) => ({
        ...i,
        price: i.price.replace(',', '.'),
        quantity: i.quantity.replace(',', '.'),
        vat_rate: i.vat_rate.replace(',', '.'),
      })),
    );
  } catch {
    /* Incomplete input has no numeric preview. */
  }
  const isRevision = original && original.status !== 'draft';
  const customerChoices = [...(customers ?? [])];
  if (isRevision && !customerChoices.some((c) => c.id === original.customer_id))
    customerChoices.push({ ...original.snapshot.customer, id: original.customer_id });
  const bankChoices = [...(settings?.banks ?? [])].filter((bank) => bank.active);
  if (isRevision && !bankChoices.some((b) => b.id === original.bank_account_id))
    bankChoices.push({ ...original.snapshot.bank, id: original.bank_account_id, active: true });
  async function save(issue = false) {
    if (!/^\d{1,4}$/.test(dueDays)) {
      E({
        message: 'Vyplňte splatnost ve dnech (0–9999).',
        fields: [{ path: 'due_days', message: 'Zadejte celé nezáporné číslo.' }],
      });
      return;
    }
    if (isRevision) {
      CR(true);
      return;
    }
    B(true);
    E(null);
    try {
      let d;
      if (id) d = await api('/invoices/' + id, { method: 'PUT', body: { version, data: v } });
      else if (saved.current) d = confirmIssue;
      else {
        d = await api('/invoices', { method: 'POST', body: v, key: key.current });
        saved.current = true;
      }
      Ver(d.version);
      dirtyRef.current = false;
      D(false);
      if (issue) {
        CI(d);
        if (!id) nav('/invoices/' + d.id + '/edit', { replace: true });
      } else nav('/invoices/' + d.id);
    } catch (e) {
      E(e);
    } finally {
      B(false);
    }
  }
  if (id && !original) return error ? <Notice error={error} /> : <Loading />;
  return (
    <>
      <Link className="back-link" to="/invoices">
        <ArrowLeft size={16} />
        Zpět na faktury
      </Link>
      <PageTitle
        eyebrow={isRevision ? 'ÚPRAVA FAKTURY' : 'NOVÝ DOKLAD'}
        title={isRevision ? 'Upravit fakturu' : id ? 'Upravit návrh' : 'Nová faktura'}
        description={
          isRevision
            ? 'Upravte údaje a uložte novou verzi. Předchozí verze zůstane v historii.'
            : 'Doplňte údaje, zkontrolujte částky a doklad vystavte.'
        }
      >
        <span className="badge draft">
          {isRevision ? 'Úprava uložené faktury' : 'Nevystavený návrh'}
        </span>
      </PageTitle>
      <Errors.Provider value={error?.fields ?? []}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          <Notice error={error} />
          {isRevision && (
            <div className="notice">
              Uloží se nová verze s aktuálními údaji dodavatele a vybraného kontaktu. Původní verze
              a PDF zůstanou v historii.
            </div>
          )}
          <div className="editor-layout">
            <div>
              <section className="panel form-panel">
                <div className="section-title">
                  <span>01</span>
                  <h2>Odběratel</h2>
                  <button type="button" onClick={() => C(true)}>
                    <Plus size={15} />
                    Nový kontakt
                  </button>
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Vyhledat odběratele"
                    value={customerSearch}
                    onChange={(e) => CS(e.target.value)}
                    placeholder="Vyhledat kontakt…"
                  />
                </label>
                <Field
                  name="customer_id"
                  label="Kontakt"
                  required
                  value={v.customer_id}
                  onChange={(x: string) => {
                    change('customer_id', x);
                    const c = customerChoices.find((c: any) => c.id === x);
                    const bank = settings?.banks.find(
                      (b: any) =>
                        b.active && b.variant === (c?.payment_id !== null ? 'alto' : 'standard'),
                    );
                    if (bank) change('bank_account_id', bank.id);
                  }}
                >
                  <option value="">Vyberte odběratele</option>
                  {customerChoices
                    .filter(
                      (c: any) =>
                        c.id === v.customer_id ||
                        [c.company, c.ico, c.dic]
                          .join(' ')
                          .toLowerCase()
                          .includes(customerSearch.toLowerCase()),
                    )
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.company}
                        {c.ico ? ' · ' + c.ico : ''}
                      </option>
                    ))}
                </Field>
              </section>
              <section className="panel form-panel">
                <div className="section-title">
                  <span>02</span>
                  <h2>Údaje dokladu</h2>
                </div>
                <div className="form-grid three">
                  {isRevision && (
                    <Field
                      name="invoice_number"
                      label="Číslo faktury"
                      required
                      value={invoiceNumber}
                      onChange={(value: string) => {
                        NumberValue(value);
                        dirtyRef.current = true;
                        D(true);
                      }}
                    />
                  )}
                  <Field
                    name="issue_date"
                    label="Datum vystavení"
                    type="date"
                    required
                    value={v.issue_date}
                    onChange={(x: string) => change('issue_date', x)}
                  />
                  <Field
                    name="tax_date"
                    label="DUZP"
                    type="date"
                    required
                    value={v.tax_date}
                    onChange={(x: string) => change('tax_date', x)}
                  />
                  <Field
                    name="due_date"
                    label="Datum splatnosti"
                    type="date"
                    required
                    value={v.due_date}
                    readOnly
                  />
                  <Field
                    name="due_days"
                    label="Splatnost ve dnech"
                    type="number"
                    min={0}
                    max={9999}
                    step={1}
                    required
                    value={dueDays}
                    onChange={(x: string) => {
                      DueDays(x);
                      change('due_date', dueDateFor(v.issue_date, x));
                    }}
                  />
                  <Field
                    name="bank_account_id"
                    label="Bankovní účet"
                    required
                    value={v.bank_account_id}
                    onChange={(x: string) => change('bank_account_id', x)}
                  >
                    <option value="">Vyberte účet</option>
                    {bankChoices
                      .filter(
                        (b: any) => b.active || (isRevision && b.id === original.bank_account_id),
                      )
                      .map((b: any) => (
                        <option value={b.id} key={b.id}>
                          {b.label} · {b.account_number}/{b.bank_code}
                        </option>
                      ))}
                  </Field>
                </div>
              </section>
              <section className="panel form-panel">
                <div className="section-title">
                  <span>03</span>
                  <h2>Položky faktury</h2>
                </div>
                {v.items.map((i: any, p: number) => (
                  <div className="invoice-item" key={p}>
                    <div className="item-heading">
                      <strong>
                        <GripVertical size={16} />
                        Položka {p + 1}
                      </strong>
                      <div>
                        <button
                          type="button"
                          className="icon"
                          aria-label={'Posunout položku ' + (p + 1) + ' nahoru'}
                          disabled={p === 0}
                          onClick={() => {
                            const next = [...v.items];
                            [next[p - 1], next[p]] = [next[p], next[p - 1]];
                            change('items', next);
                          }}
                        >
                          <ArrowLeft size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon"
                          aria-label={'Posunout položku ' + (p + 1) + ' dolů'}
                          disabled={p === v.items.length - 1}
                          onClick={() => {
                            const next = [...v.items];
                            [next[p], next[p + 1]] = [next[p + 1], next[p]];
                            change('items', next);
                          }}
                        >
                          <ArrowRight size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon"
                          aria-label={'Odebrat položku ' + (p + 1)}
                          disabled={v.items.length === 1}
                          onClick={() =>
                            change(
                              'items',
                              v.items.filter((_: any, n: number) => n !== p),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <Field
                      name={`items.${p}.description`}
                      label="Popis položky"
                      required
                      type="textarea"
                      value={i.description}
                      onChange={(x: string) => item(p, 'description', x)}
                    />
                    <div className="form-grid item-numbers">
                      {[
                        ['quantity', 'Množství'],
                        ['price', 'Cena bez DPH'],
                        ['vat_rate', 'DPH (%)'],
                        ['unit', 'Jednotka'],
                      ].map(([k, l]) => (
                        <Field
                          name={`items.${p}.${k}`}
                          key={k}
                          label={l}
                          value={i[k]}
                          required={k !== 'unit'}
                          onChange={(x: string) => item(p, k, x)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="add-items">
                  <button
                    type="button"
                    onClick={() =>
                      change('items', [
                        ...v.items,
                        { ...blankItem(), vat_rate: settings?.supplier?.vat_rate ?? '21' },
                      ])
                    }
                  >
                    <Plus size={16} />
                    Ruční položka
                  </button>
                  <select
                    aria-label="Přidat z ceníku"
                    value=""
                    onChange={(e) => {
                      const c = catalog.find((c: any) => c.id === e.target.value);
                      if (!c) return;
                      const selected = {
                        description: c.description || c.name,
                        price: c.price,
                        quantity: '1',
                        unit: c.unit,
                        vat_rate: c.vat_rate,
                      };
                      const empty = v.items.findIndex(
                        (i: any) =>
                          i.description === '' &&
                          i.price === '' &&
                          i.unit === '' &&
                          i.quantity === '1' &&
                          [blankItem().vat_rate, settings?.supplier?.vat_rate].includes(i.vat_rate),
                      );
                      change(
                        'items',
                        empty < 0
                          ? [...v.items, selected]
                          : v.items.map((i: any, index: number) =>
                              index === empty ? selected : i,
                            ),
                      );
                    }}
                  >
                    <option value="">Přidat z ceníku…</option>
                    {catalog
                      ?.filter((c: any) => c.active && c.currency === v.currency)
                      .map((c: any) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </section>
            </div>
            <aside className="editor-summary panel">
              <span className="eyebrow">REKAPITULACE</span>
              <h2>Váš doklad</h2>
              <dl>
                <dt>Základ bez DPH</dt>
                <dd>{totals ? money(totals.net, v.currency) : '—'}</dd>
                <dt>DPH</dt>
                <dd>{totals ? money(totals.vat, v.currency) : '—'}</dd>
              </dl>
              <div className="summary-total">
                <span>Celkem k úhradě</span>
                <strong>{totals ? money(totals.gross, v.currency) : '—'}</strong>
              </div>
              <button className="primary" disabled={busy || !totals} type="submit">
                {busy ? 'Ukládám…' : isRevision ? 'Zkontrolovat úpravy' : 'Zkontrolovat a vystavit'}
                <ArrowRight size={17} />
              </button>
              {!isRevision && (
                <button type="button" disabled={busy} onClick={() => save()}>
                  Uložit návrh
                </button>
              )}
              <small>
                <ShieldCheck size={14} />
                {isRevision
                  ? 'Změny se uloží jako další verze faktury.'
                  : 'Číslo přidělíme až při vystavení. Server částky znovu ověří.'}
              </small>
              <small>
                {dirty
                  ? 'Máte neuložené změny.'
                  : isRevision
                    ? 'Předchozí verze zůstane zachovaná.'
                    : 'Návrh můžete upravovat.'}
              </small>
            </aside>
          </div>
        </form>
      </Errors.Provider>
      {contact && (
        <Dialog title="Nový odběratel" onClose={() => C(false)}>
          <CustomerForm
            onCancel={() => C(false)}
            onSaved={(c: any) => {
              reloadCustomers();
              change('customer_id', c.id);
              C(false);
            }}
          />
        </Dialog>
      )}
      {confirmRevision && (
        <Dialog
          title="Uložit novou verzi faktury?"
          onClose={() => {
            if (!busy) CR(false);
          }}
        >
          <p>
            Číslo faktury: <strong>{invoiceNumber}</strong>
          </p>
          <p>
            Bez DPH <strong>{totals ? money(totals.net) : '—'}</strong> · DPH{' '}
            <strong>{totals ? money(totals.vat) : '—'}</strong>
          </p>
          <p>
            Celkem <strong>{totals ? money(totals.gross) : '—'}</strong>. Vznikne nové PDF.
            Předchozí verze zůstane v historii.
          </p>
          <Notice error={error} />
          <div className="form-actions">
            <button disabled={busy} onClick={() => CR(false)}>
              Zpět k úpravám
            </button>
            <button
              className="primary"
              disabled={busy || !totals}
              onClick={async () => {
                B(true);
                E(null);
                try {
                  const result = await api('/invoices/' + id, {
                    method: 'PUT',
                    body: { version, data: v, revision: true, invoice_number: invoiceNumber },
                  });
                  CR(false);
                  dirtyRef.current = false;
                  D(false);
                  nav('/invoices/' + result.id);
                } catch (e) {
                  E(e);
                } finally {
                  B(false);
                }
              }}
            >
              Uložit novou verzi
            </button>
          </div>
        </Dialog>
      )}
      {confirmIssue && (
        <Dialog title="Vystavit fakturu?" onClose={() => CI(null)}>
          <p>
            Odběratel: <strong>{confirmIssue.snapshot.customer.company}</strong>
          </p>
          <p>
            Celkem <strong>{money(confirmIssue.gross, confirmIssue.currency)}</strong>. Po vystavení
            můžete fakturu upravit; předchozí verze zůstane v historii.
          </p>
          <Notice error={error} />
          <div className="form-actions">
            <button onClick={() => CI(null)}>Zpět k návrhu</button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                B(true);
                E(null);
                try {
                  const d = await api('/invoices/' + confirmIssue.id + '/issue', {
                    method: 'POST',
                    body: { version: confirmIssue.version },
                  });
                  CI(null);
                  dirtyRef.current = false;
                  D(false);
                  nav('/invoices/' + d.id);
                } catch (e) {
                  E(e);
                } finally {
                  B(false);
                }
              }}
            >
              Vystavit fakturu
            </button>
          </div>
        </Dialog>
      )}
      {blocker.state === 'blocked' && (
        <Dialog title="Neuložené změny" onClose={() => blocker.reset()}>
          <p>Rozepsaná faktura obsahuje neuložené změny. Opravdu ji chcete opustit?</p>
          <div className="form-actions">
            <button onClick={() => blocker.reset()}>Zůstat u faktury</button>
            <button
              className="danger"
              onClick={() => {
                dirtyRef.current = false;
                blocker.proceed();
              }}
            >
              Opustit změny
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
