import { useState } from 'react';
import { api } from './api';
import { Dialog, Notice } from './shared';

const paths = {
  invoice: '/invoices/',
  customer: '/customers/',
  catalog: '/catalog/',
  bank: '/settings/banks/',
  supplier: '/settings/supplier/',
};
export function DeleteDialog({ entity, record, label, onClose, onDeleted }: any) {
  const [token, T] = useState<string | null>(null),
    [busy, B] = useState(false),
    [error, E] = useState<any>(null);
  async function confirm() {
    B(true);
    E(null);
    try {
      if (!token) {
        const r = await api('/deletions/prepare', {
          method: 'POST',
          body: { entity, id: String(record.id), version: record.version },
        });
        T(r.token);
      } else {
        await api(paths[entity as keyof typeof paths] + record.id, {
          method: 'DELETE',
          body: { version: record.version, token },
        });
        onDeleted();
      }
    } catch (e) {
      E(e);
    } finally {
      B(false);
    }
  }
  return (
    <Dialog
      title={token ? 'Opravdu smazat záznam?' : 'Smazat záznam?'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="eyebrow">{token ? 'POTVRZENÍ 2 ZE 2' : 'POTVRZENÍ 1 ZE 2'}</p>
      <p>
        <strong>{label}</strong>
      </p>
      <p>
        {entity === 'invoice'
          ? 'Faktura zmizí z přehledu i součtů. Její číslo se uvolní pro nové použití a předchozí verze zůstanou v historii.'
          : 'Záznam zmizí z nabídky. Údaje a položky na dřívějších fakturách zůstanou zachované.'}
      </p>
      {token && <p>První potvrzení je hotové. Druhým potvrzením záznam smažete.</p>}
      <Notice error={error} />
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={onClose}>
          Zrušit
        </button>
        <button
          key={token ? 'final' : 'first'}
          type="button"
          className={token ? 'primary' : 'button danger'}
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? 'Zpracovávám…' : token ? 'Ano, smazat' : 'Ano, pokračovat'}
        </button>
      </div>
    </Dialog>
  );
}
