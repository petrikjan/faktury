import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { FileText, X } from 'lucide-react';
import { api } from './api';
import { todayPrague, Decimal } from '../../../packages/domain/index';

export const money = (v: string | null, currency = 'CZK') => {
  if (v === null) return 'Neznámé';
  const [whole, fraction] = new Decimal(v).toFixed(2).split('.');
  return (
    new Intl.NumberFormat('cs-CZ').format(BigInt(whole)) +
    ',' +
    fraction +
    ' ' +
    ({ CZK: 'Kč', EUR: '€', USD: 'US$' }[currency] ?? currency)
  );
};

export const date = (v: string) =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague' }).format(
    new Date(v.slice(0, 10) + 'T12:00:00Z'),
  );

export const labels: Record<string, string> = {
  company: 'Firma / jméno',
  street: 'Ulice',
  street_number: 'Číslo domu',
  city: 'Město',
  zip: 'PSČ',
  country: 'Země',
  ico: 'IČO',
  dic: 'DIČ',
  payment_id: 'Konstantní symbol',
  name: 'Název',
  description: 'Popis',
  unit: 'Jednotka',
  price: 'Cena bez DPH',
  vat_rate: 'DPH (%)',
  currency: 'Měna',
  account_number: 'Číslo účtu',
  bank_code: 'Kód banky',
  label: 'Název účtu',
  phone: 'Telefon',
  email: 'E-mail',
  website: 'Web v hlavičce faktury',
  footer: 'Patička faktury',
  footer_left: 'Levá patička faktury',
};

export const Auth = createContext<{ user: any; refresh: () => Promise<void> }>({
  user: null,
  refresh: async () => {},
});

export const Errors = createContext<{ path: string; message: string }[]>([]);

export function Field({
  name,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  readOnly = false,
  min,
  max,
  step,
  children,
}: any) {
  const errors = useContext(Errors).filter((e) => e.path === name || e.path.endsWith('.' + name));
  const control = {
    id: name,
    name,
    value: value ?? '',
    onChange: onChange ? (e: any) => onChange(e.target.value) : undefined,
    required,
    'aria-invalid': !!errors.length,
    'aria-describedby': errors.length ? name + '-error' : undefined,
  };
  return (
    <label className={'field ' + (type === 'textarea' ? 'wide' : '')} htmlFor={name}>
      <span>
        {label ?? labels[name] ?? name}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      {children ? (
        <select {...control}>{children}</select>
      ) : type === 'textarea' ? (
        <textarea {...control} rows={3} />
      ) : (
        <input {...control} type={type} readOnly={readOnly} min={min} max={max} step={step} />
      )}{' '}
      {!!errors.length && (
        <small className="field-error" id={name + '-error'}>
          {errors.map((e) => e.message).join(' ')}
        </small>
      )}
    </label>
  );
}

export function Notice({ error }: any) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      {error.message ?? String(error)}
    </div>
  );
}

export function Empty({ text = 'Zatím tu nic není.', children }: any) {
  return (
    <div className="empty">
      <FileText size={30} />
      <h3>{text}</h3>
      <p>Vše potřebné se zobrazí na tomto místě.</p>
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status">
      Načítám…
    </div>
  );
}

export function Dialog({ title, onClose, children }: any) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" className="icon" aria-label="Zavřít" onClick={onClose}>
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function useLoad<T = any>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<any>(null),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    api<T>(path)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

export function PageTitle({ eyebrow, title, description, children }: any) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="title-actions">{children}</div>
    </div>
  );
}

export function Status({ invoice: i }: any) {
  const overdue =
    i.status === 'issued' && i.payment_status === 'unpaid' && i.due_date < todayPrague();
  return (
    <span
      className={
        'badge ' +
        (i.status === 'draft'
          ? 'draft'
          : i.status === 'void'
            ? 'void'
            : i.payment_status === 'paid'
              ? 'paid'
              : overdue
                ? 'overdue'
                : 'unpaid')
      }
    >
      {i.status === 'draft'
        ? 'Návrh'
        : i.status === 'void'
          ? 'Storno'
          : i.payment_status === 'paid'
            ? 'Zaplaceno'
            : overdue
              ? 'Po splatnosti'
              : i.payment_status === 'unknown'
                ? 'Neznámá úhrada'
                : 'Nezaplaceno'}
    </span>
  );
}
