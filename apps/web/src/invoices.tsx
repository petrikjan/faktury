import { useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import {
  FileText,
  Plus,
  ArrowUpRight,
  Search,
  ArrowLeft,
  ArrowRight,
  Download,
  ShieldCheck,
  ChevronDown,
  Wallet,
  Calculator,
  Pencil,
  Trash2,
} from 'lucide-react';
import { DeleteDialog } from './delete-dialog';
import { todayPrague } from '../../../packages/domain/index';
import { money, date, Notice, Empty, Loading, useLoad, PageTitle } from './shared';

export function Invoices({ report = false }: any) {
  const [params, setParams] = useSearchParams();
  const currency = 'CZK';
  const loc = useLocation();
  const query = params.toString();
  const { data: d, error, reload } = useLoad('/invoices?' + query);
  const [remove, Remove] = useState<any>(null);
  const set = (key: string, val: string) => {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'quarter') next.delete('month');
    if (key === 'month') next.delete('quarter');
    setParams(next);
  };
  const stat = d?.summary.find((x: any) => x.currency === currency);
  const totals = [
    ['Základ bez DPH', stat?.net ?? '0', FileText],
    ['Výše DPH', stat?.vat ?? '0', Calculator],
    ['Celkem s DPH', stat?.gross ?? '0', Wallet],
  ] as const;
  return (
    <>
      <PageTitle
        eyebrow={report ? 'ČÍSLA, KTERÁ MAJÍ SMYSL' : 'VAŠE FAKTURACE'}
        title={report ? 'Přehledy' : 'Faktury'}
        description={
          report
            ? 'Přehled základu, DPH a celkové částky vystavených faktur.'
            : 'Všechny doklady na jednom místě. S přehledem.'
        }
      >
        <Link to="/invoices/new" className="button primary">
          <Plus size={18} />
          Nová faktura
        </Link>
      </PageTitle>
      <div className="stat-toolbar">
        <span>
          <span className="live-dot" /> Souhrn celého filtrovaného výsledku · vystavené doklady
        </span>
      </div>
      <div className="stats">
        {totals.map(([label, key, Icon], i) => (
          <div className="stat" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{money(key, currency)}</strong>
            <small>
              {i === 0
                ? 'Základ vystavených dokladů'
                : i === 1
                  ? 'DPH vystavených dokladů'
                  : 'Základ a DPH dohromady'}
            </small>
          </div>
        ))}
      </div>
      {stat?.uncertain > 0 && (
        <div className="notice">
          U části starých dokladů chybí sazba DPH. Zobrazená DPH a celkem zahrnují pouze vyčíslené
          doklady.
        </div>
      )}
      {params.get('quarter') && d && (
        <section className="quarter-split" aria-label="Rozdělení faktur podle částky s DPH">
          <div className="quarter-split-heading">
            <h2>Členění kvartálu podle částky s DPH</h2>
            <button className="button" onClick={() => set('amount_group', '')}>
              Všechny částky
            </button>
          </div>
          <div className="quarter-groups">
            {(
              [
                ['under', 'Pod 10 000 Kč s DPH'],
                ['upper', 'Od 10 000 Kč s DPH'],
              ] as const
            ).map(([value, label]) => {
              const group = d.amount_groups.find(
                (g: any) => g.currency === 'CZK' && g.amount_group === value,
              );
              return (
                <button
                  key={value}
                  className="amount-group panel"
                  aria-pressed={params.get('amount_group') === value}
                  onClick={() => set('amount_group', value)}
                >
                  <strong>{label}</strong>
                  <span>{group?.count ?? 0} dokladů</span>
                  <dl>
                    <dt>Bez DPH</dt>
                    <dd>{money(group?.net ?? '0')}</dd>
                    <dt>DPH</dt>
                    <dd>{money(group?.vat ?? '0')}</dd>
                    <dt>Celkem</dt>
                    <dd>{money(group?.gross ?? '0')}</dd>
                  </dl>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {report ? 'Období a filtry' : 'Přehled dokladů'}{' '}
            {!report && d && <span className="count">{d.total}</span>}
          </h2>
          <span className="muted">{params.get('year') ?? 'Všechny roky'}</span>
        </div>
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Hledat fakturu"
              placeholder="Číslo faktury, odběratel, IČO…"
              value={params.get('q') ?? ''}
              onChange={(e) => set('q', e.target.value)}
            />
          </label>
          <select
            aria-label="Rok"
            value={params.get('year') ?? ''}
            onChange={(e) => {
              const n = new URLSearchParams(params);
              if (e.target.value) n.set('year', e.target.value);
              else {
                n.delete('year');
                n.delete('quarter');
                n.delete('month');
              }
              n.delete('page');
              setParams(n);
            }}
          >
            <option value="">Všechny roky</option>
            {(d?.years ?? [Number(todayPrague().slice(0, 4))]).map((y: number) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <select
            aria-label="Kvartál"
            disabled={!params.get('year')}
            value={params.get('quarter') ?? ''}
            onChange={(e) => set('quarter', e.target.value)}
          >
            <option value="">Celý rok</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                Q{n}
              </option>
            ))}
          </select>
          <select
            aria-label="Měsíc"
            disabled={!params.get('year')}
            value={params.get('month') ?? ''}
            onChange={(e) => set('month', e.target.value)}
          >
            <option value="">Všechny měsíce</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}. měsíc
              </option>
            ))}
          </select>
          <select
            aria-label="Stav"
            value={params.get('status') ?? 'all'}
            onChange={(e) => set('status', e.target.value)}
          >
            {[
              ['all', 'Všechny stavy'],
              ['paid', 'Zaplaceno'],
              ['unpaid', 'Nezaplaceno'],
              ['overdue', 'Po splatnosti'],
              ['draft', 'Návrhy'],
            ].map(([v, t]) => (
              <option value={v} key={v}>
                {t}
              </option>
            ))}
          </select>
          <select
            aria-label="Částka s DPH"
            value={params.get('amount_group') ?? 'all'}
            onChange={(e) => set('amount_group', e.target.value === 'all' ? '' : e.target.value)}
          >
            <option value="all">Všechny částky</option>
            <option value="under">Pod 10 000 Kč s DPH</option>
            <option value="upper">Od 10 000 Kč s DPH</option>
          </select>
        </div>
        <Notice error={error} />
        {!d && !error ? (
          <Loading />
        ) : report ? (
          d && <Report data={d} currency={currency} />
        ) : (
          d && (
            <>
              {d.items.length ? (
                <>
                  <div className="table-wrap">
                    <table className="invoice-table">
                      <thead>
                        <tr>
                          {[
                            ['number', 'Číslo dokladu'],
                            ['customer', 'Odběratel'],
                            ['date', 'Vystaveno'],
                            ['net', 'Bez DPH'],
                            ['vat', 'DPH'],
                            ['gross', 'Celkem s DPH'],
                          ].map(([key, t]) => (
                            <th key={key}>
                              <button
                                className="sort"
                                onClick={() => {
                                  const n = new URLSearchParams(params);
                                  n.set('sort', key);
                                  n.set(
                                    'direction',
                                    params.get('sort') === key && params.get('direction') !== 'asc'
                                      ? 'asc'
                                      : 'desc',
                                  );
                                  setParams(n);
                                }}
                              >
                                {t}
                                <ChevronDown size={13} />
                              </button>
                            </th>
                          ))}
                          <th aria-label="Akce" />
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((i: any) => (
                          <tr key={i.id}>
                            <td data-label="Doklad">
                              <Link
                                className="invoice-number"
                                to={'/invoices/' + i.id}
                                state={{ returnTo: loc.pathname + loc.search }}
                              >
                                <span className="doc-icon">
                                  <FileText size={16} />
                                </span>
                                {i.invoice_number ?? 'Návrh #' + i.id}
                              </Link>
                            </td>
                            <td data-label="Odběratel">
                              <strong>
                                {i.snapshot.customer.end_customer
                                  ? 'Koncový zákazník'
                                  : i.snapshot.customer.company}
                              </strong>
                              <small>
                                {i.snapshot.customer.ico
                                  ? 'IČO ' + i.snapshot.customer.ico
                                  : 'Bez IČO'}
                              </small>
                            </td>
                            <td data-label="Vystaveno">
                              {date(i.issue_date)}
                              <small>Splatnost {date(i.due_date)}</small>
                            </td>
                            <td data-label="Bez DPH" className="amount">
                              {money(i.net, i.currency)}
                            </td>
                            <td data-label="DPH" className="amount">
                              {money(i.vat, i.currency)}
                            </td>
                            <td data-label="Celkem s DPH" className="amount">
                              {money(i.gross, i.currency)}
                            </td>
                            <td className="row-actions">
                              <Link
                                to={'/invoices/' + i.id}
                                state={{ returnTo: loc.pathname + loc.search }}
                                title="Detail"
                                aria-label={'Detail dokladu ' + (i.invoice_number ?? i.id)}
                              >
                                <ArrowUpRight size={18} />
                              </Link>
                              <Link
                                to={'/invoices/' + i.id + '/edit'}
                                title="Upravit"
                                aria-label={'Upravit doklad ' + (i.invoice_number ?? i.id)}
                              >
                                <Pencil size={17} />
                              </Link>
                              {i.status !== 'draft' && (
                                <a
                                  href={'/api/invoices/' + i.id + '/pdf?download=1'}
                                  title="Stáhnout PDF"
                                  aria-label={'Stáhnout PDF ' + i.invoice_number}
                                >
                                  <Download size={17} />
                                </a>
                              )}
                              <button
                                type="button"
                                className="icon danger"
                                title="Smazat"
                                aria-label={'Smazat doklad ' + (i.invoice_number ?? i.id)}
                                onClick={() => Remove(i)}
                              >
                                <Trash2 size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination">
                    <span>
                      {(d.page - 1) * d.size + 1}–{Math.min(d.page * d.size, d.total)} z {d.total}{' '}
                      dokladů
                    </span>
                    <label>
                      Na stránce{' '}
                      <select
                        aria-label="Počet řádků"
                        value={d.size}
                        onChange={(e) => set('size', e.target.value)}
                      >
                        {[20, 50, 100].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <button
                        className="icon"
                        aria-label="Předchozí stránka"
                        disabled={d.page <= 1}
                        onClick={() => set('page', String(d.page - 1))}
                      >
                        <ArrowLeft size={17} />
                      </button>
                      <span>{d.page}</span>
                      <button
                        className="icon"
                        aria-label="Další stránka"
                        disabled={d.page * d.size >= d.total}
                        onClick={() => set('page', String(d.page + 1))}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <Empty text="Žádné doklady pro tento výběr">
                  <Link className="button" to="/invoices/new">
                    <Plus size={16} />
                    Vytvořit fakturu
                  </Link>
                </Empty>
              )}
            </>
          )
        )}
      </section>
      <div className="quiet-note">
        <ShieldCheck size={15} /> Doklady se ukládají se snímkem údajů platným při vystavení.
      </div>
      {remove && (
        <DeleteDialog
          entity="invoice"
          record={remove}
          label={remove.invoice_number ?? 'Návrh #' + remove.id}
          onClose={() => Remove(null)}
          onDeleted={() => {
            Remove(null);
            const next = new URLSearchParams(params);
            next.delete('page');
            setParams(next);
            reload();
          }}
        />
      )}
    </>
  );
}

export function Report({ data: d, currency }: any) {
  const s = d.summary.find((s: any) => s.currency === currency),
    months = d.months.filter((m: any) => m.currency === currency),
    annual = d.annual_summary?.find((x: any) => x.currency === currency);
  const monthly = Array.from({ length: 12 }, (_, i) =>
    months
      .filter((m: any) => m.month === i + 1)
      .reduce((n: number, m: any) => n + Number(m.net), 0),
  );
  const max = Math.max(1, ...monthly);
  return (
    <div className="report">
      <div className="report-grid">
        <div>
          <h3>Základ podle měsíce · {currency}</h3>
          <div className="bars">
            {monthly.map((v, i) => {
              const height = Math.max(2, (v / max) * 130);
              return (
                <div className="bar-col" key={i} title={money(String(v), currency)}>
                  <svg
                    className="bar"
                    viewBox="0 0 100 130"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <rect x="0" y={130 - height} width="100" height={height} rx="4" />
                  </svg>
                  <span>{i + 1}</span>
                </div>
              );
            })}
          </div>
          <p className="muted">Bez výběru roku graf sčítá stejný měsíc ze všech let.</p>
        </div>
        <div>
          <h3>Roční souhrn a původní členění</h3>
          <dl>
            <dt>Počet vystavených dokladů ve filtru</dt>
            <dd>{s?.count ?? 0}</dd>
            <dt>Roční základ (celý vybraný rok)</dt>
            <dd>{annual ? money(annual.net, currency) : 'Vyberte rok'}</dd>
            {currency === 'CZK' && (
              <>
                <dt>Základ dokladů pod 10 000 {currency} s DPH</dt>
                <dd>{money(s?.under_net ?? '0', currency)}</dd>
                <dt>Základ dokladů od 10 000 {currency} s DPH</dt>
                <dd>{money(s?.upper_net ?? '0', currency)}</dd>
              </>
            )}
            <dt>Roční průměr za měsíc</dt>
            <dd>
              {annual?.monthly_average ? money(annual.monthly_average, currency) : 'Vyberte rok'}
            </dd>
          </dl>
          <p className="muted">
            {d.average_divisor
              ? 'Dělitel: ' +
                d.average_divisor +
                ' měsíců; minulý rok /12, aktuální rok /počet měsíců do dneška včetně.'
              : ''}{' '}
            Roční součet neomezuje kvartál, měsíc ani hledání. Členění je provozní přehled, nikoliv
            právní výkaz.
          </p>
          {s?.uncertain > 0 && (
            <div className="notice">
              U části starých dokladů chybí sazba DPH. Souhrn obsahuje pouze vyčíslenou DPH.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
