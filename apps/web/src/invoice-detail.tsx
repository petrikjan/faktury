import { useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Download, Copy, Check, Archive, Eye, Trash2 } from 'lucide-react';
import { api } from './api';
import { DeleteDialog } from './delete-dialog';
import { Decimal } from '../../../packages/domain/index';
import { money, date, Field, Notice, Loading, Dialog, useLoad, PageTitle, Status } from './shared';

export function InvoiceDetail() {
  const { id } = useParams(),
    loc = useLocation(),
    nav = useNavigate();
  const { data: d, error, reload } = useLoad('/invoices/' + id);
  const { data: history } = useLoad('/invoices/' + id + '/history');
  const [err, E] = useState<any>(null),
    [busy, B] = useState(false),
    [pdf, P] = useState(false),
    [pay, Pay] = useState(false),
    [paymentDate, PD] = useState(''),
    [remove, Remove] = useState(false);
  async function action(fn: () => Promise<any>) {
    B(true);
    E(null);
    try {
      await fn();
      reload();
    } catch (e) {
      E(e);
    } finally {
      B(false);
    }
  }
  if (!d) return error ? <Notice error={error} /> : <Loading />;
  return (
    <>
      <Link className="back-link" to={loc.state?.returnTo ?? '/invoices'}>
        <ArrowLeft size={16} />
        Zpět na přehled
      </Link>
      <PageTitle
        eyebrow="DETAIL DOKLADU"
        title={d.invoice_number ?? 'Návrh #' + d.id}
        description={'Vystaveno ' + date(d.issue_date) + ' · splatnost ' + date(d.due_date)}
      >
        <Status invoice={d} />
        <Link className="button" to={'/invoices/' + id + '/edit'}>
          {d.status === 'draft' ? 'Upravit návrh' : 'Upravit fakturu'}
          <ArrowRight size={16} />
        </Link>
        {d.status !== 'draft' && (d.files.length > 0 || (d.vat !== null && d.gross !== null)) && (
          <>
            <button onClick={() => P(true)}>
              <Eye size={17} />
              Náhled PDF
            </button>
            <a className="button primary" href={'/api/invoices/' + id + '/pdf?download=1'}>
              <Download size={17} />
              Stáhnout PDF
            </a>
          </>
        )}
      </PageTitle>
      <Notice error={err} />
      {d.status !== 'draft' && d.files.length === 0 && (
        <div className="notice">
          {d.vat !== null && d.gross !== null
            ? 'Původní PDF chybí. Náhled nebo stažení vytvoří novou kopii z uložených údajů faktury.'
            : 'Původní PDF chybí. Pro vytvoření nové kopie nejdříve doplňte DPH v úpravě faktury.'}
        </div>
      )}
      {d.files.some((f: any) => f.template_version.startsWith('reconstructed:')) && (
        <div className="notice">
          PDF bylo nově vytvořeno z uložených údajů faktury. Původní příloha nebyla k dispozici.
        </div>
      )}
      {d.files.some((f: any) => f.template_version.includes('unapproved')) && (
        <div className="notice">
          PDF šablona je v místním ověřování. Vizuální shoda zatím nebyla schválena.
        </div>
      )}
      {d.snapshot_origin === 'owner_revision' && (
        <div className="notice">
          Upravená faktura. Předchozí verze a PDF najdete v historii níže.
        </div>
      )}
      {d.snapshot_origin !== 'new_issue' && d.snapshot_origin !== 'owner_revision' && (
        <div className="notice">
          Historický doklad · údaje jsou rekonstruované z dostupného legacy stavu, nejde o doložený
          historický snímek.
          {d.confirmed_vat_rate != null
            ? ` DPH dopočtena sazbou ${new Decimal(d.confirmed_vat_rate).toString()} % podle potvrzení vlastníka.`
            : !!d.historical_vat_uncertain && ' Historická DPH není známá.'}
        </div>
      )}
      <div className="detail-grid">
        <section className="panel form-panel">
          <span className="eyebrow">ODBĚRATEL</span>
          <h2>
            {d.snapshot.customer.end_customer ? 'Koncový zákazník' : d.snapshot.customer.company}
          </h2>
          {!d.snapshot.customer.end_customer && (
            <p>
              {d.snapshot.customer.street} {d.snapshot.customer.street_number}
              <br />
              {d.snapshot.customer.zip} {d.snapshot.customer.city}
              <br />
              {d.snapshot.customer.country}
              <br />
              IČO {d.snapshot.customer.ico} · DIČ {d.snapshot.customer.dic || '—'}
            </p>
          )}
        </section>
        <section className="panel form-panel">
          <span className="eyebrow">PLATEBNÍ ÚDAJE</span>
          <h2>
            {d.snapshot.bank.account_number}/{d.snapshot.bank.bank_code}
          </h2>
          <p>
            Variabilní symbol: {d.invoice_number ?? 'Po vystavení'}
            <br />
            Konstantní symbol:{' '}
            {d.snapshot.customer.payment_id === null
              ? 'Není nastaven (NULL)'
              : d.snapshot.customer.payment_id === ''
                ? 'Prázdná hodnota'
                : d.snapshot.customer.payment_id}
            <br />
            DUZP: {date(d.tax_date)}
            <br />
            Datum úhrady: {d.payment_date ? date(d.payment_date) : 'Neznámé / nezadané'}
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Položky</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Popis</th>
                <th>Množství</th>
                <th>Cena m.j.</th>
                <th>DPH</th>
                <th>Bez DPH</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((i: any) => (
                <tr key={i.id}>
                  <td className="description">{i.description}</td>
                  <td>
                    {new Decimal(i.quantity).toString()} {i.unit}
                  </td>
                  <td>{money(i.price, d.currency)}</td>
                  <td>
                    {i.vat_rate === null ? 'Neznámá' : new Decimal(i.vat_rate).toString() + ' %'}
                  </td>
                  <td>{money(i.net, d.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="detail-total">
          <span>
            Základ {money(d.net, d.currency)} · DPH {money(d.vat, d.currency)}
          </span>
          <strong>Celkem {money(d.gross, d.currency)}</strong>
        </div>
      </section>
      {history?.length > 0 && (
        <section className="panel form-panel">
          <h2>Historie faktury</h2>
          <div className="invoice-history">
            {history.map((h: any) => (
              <div key={h.id}>
                <span>
                  Verze {h.version} · {date(h.created_at)} ·{' '}
                  {h.action === 'delete' ? 'před smazáním' : 'před úpravou'}
                </span>
                {h.has_pdf && (
                  <a
                    className="button"
                    href={'/api/invoices/' + id + '/history/' + h.id + '/pdf?download=1'}
                  >
                    <Download size={15} />
                    PDF verze {h.version}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="detail-actions">
        <button className="danger" disabled={busy} onClick={() => Remove(true)}>
          <Trash2 size={16} />
          Smazat fakturu
        </button>
        <button
          disabled={busy}
          onClick={() =>
            action(async () => {
              const copy = await api('/invoices/' + id + '/duplicate', { method: 'POST' });
              if (
                copy.requires_review &&
                !window.confirm(
                  'Historická sazba DPH není doložena. V novém návrhu je nutné sazby výslovně zkontrolovat. Pokračovat?',
                )
              )
                return;
              nav('/invoices/new', { state: { duplicate: copy } });
            })
          }
        >
          <Copy size={16} />
          Duplikovat do návrhu
        </button>
        {d.status === 'issued' && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                d.payment_status === 'paid'
                  ? action(() =>
                      api('/invoices/' + id + '/payment', {
                        method: 'POST',
                        body: { paid: false, date: null },
                      }),
                    )
                  : Pay(true)
              }
            >
              <Check size={16} />
              {d.payment_status === 'paid' ? 'Označit nezaplaceno' : 'Označit zaplaceno'}
            </button>
            <button
              disabled={busy}
              className="danger"
              onClick={() => {
                if (
                  window.confirm(
                    'Stornovat vystavený doklad? Doklad i historie zůstanou zachované.',
                  )
                )
                  void action(() => api('/invoices/' + id + '/void', { method: 'POST' }));
              }}
            >
              <Archive size={16} />
              Stornovat
            </button>
          </>
        )}
      </div>
      {remove && (
        <DeleteDialog
          entity="invoice"
          record={d}
          label={d.invoice_number ?? 'Návrh #' + d.id}
          onClose={() => Remove(false)}
          onDeleted={() => nav('/invoices', { replace: true })}
        />
      )}
      {pdf && (
        <Dialog
          title={
            d.files.length === 0 ||
            d.files.some((f: any) => f.template_version.startsWith('reconstructed:'))
              ? 'PDF z uložených údajů'
              : d.files.some((f: any) => f.kind === 'original')
                ? 'Původní historické PDF'
                : 'Náhled PDF'
          }
          onClose={() => {
            P(false);
            reload();
          }}
        >
          <iframe
            title="Náhled faktury PDF"
            src={'/api/invoices/' + id + '/pdf'}
            className="pdf-preview"
          />
        </Dialog>
      )}
      {pay && (
        <Dialog title="Označit jako zaplaceno" onClose={() => Pay(false)}>
          <p>Čas této akce zaznamenáme automaticky. Skutečné datum platby je nepovinné.</p>
          <Field
            name="payment-date"
            label="Skutečné datum úhrady (volitelné)"
            type="date"
            value={paymentDate}
            onChange={PD}
          />
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await api('/invoices/' + id + '/payment', {
                  method: 'POST',
                  body: { paid: true, date: paymentDate || null },
                });
                Pay(false);
              })
            }
          >
            Potvrdit úhradu
          </button>
        </Dialog>
      )}
    </>
  );
}
