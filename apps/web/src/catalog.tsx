import { useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from './api';
import { DeleteDialog } from './delete-dialog';
import { Decimal } from '../../../packages/domain/index';
import { money, Errors, Field, Notice, Empty, Loading, Dialog, useLoad, PageTitle } from './shared';

export function Catalog() {
  const { data, error, reload } = useLoad('/catalog');
  const [edit, E] = useState<any>(undefined),
    [v, V] = useState<any>({}),
    [err, R] = useState<any>(null),
    [busy, B] = useState(false),
    [remove, Remove] = useState<any>(null);
  const open = (c: any) => {
    E(c);
    V(
      c ?? {
        name: '',
        description: '',
        unit: 'hod',
        price: '',
        vat_rate: '21',
        currency: 'CZK',
        active: true,
      },
    );
    R(null);
  };
  return (
    <>
      <PageTitle
        eyebrow="OPAKOVANÉ POLOŽKY"
        title="Ceník"
        description="Pomocník při vyplňování. Ruční položky máte vždy k dispozici."
      >
        <button className="primary" onClick={() => open(null)}>
          <Plus size={18} />
          Nová položka
        </button>
      </PageTitle>
      <section className="panel">
        <Notice error={error} />
        {!data && !error ? (
          <Loading />
        ) : data?.length ? (
          <div className="catalog-grid">
            {data.map((c: any) => (
              <article className="catalog-card record-card" key={c.id}>
                <div>
                  <BookOpen size={20} />
                  <span className={'badge ' + (c.active ? 'paid' : 'draft')}>
                    {c.active ? 'Aktivní' : 'Neaktivní'}
                  </span>
                </div>
                <h3>{c.name}</h3>
                <p>{c.description}</p>
                <strong>
                  {money(c.price, c.currency)} <small>/ {c.unit || 'm.j.'}</small>
                </strong>
                <small>bez DPH · sazba {new Decimal(c.vat_rate).toString()} %</small>
                <div className="record-actions">
                  <button type="button" onClick={() => open(c)}>
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
          <Empty text="Ceník je zatím prázdný" />
        )}
      </section>
      {remove && (
        <DeleteDialog
          entity="catalog"
          record={remove}
          label={remove.name}
          onClose={() => Remove(null)}
          onDeleted={() => {
            Remove(null);
            reload();
          }}
        />
      )}
      {edit !== undefined && (
        <Dialog
          title={edit ? 'Upravit položku' : 'Nová položka ceníku'}
          onClose={() => E(undefined)}
        >
          <Errors.Provider value={err?.fields ?? []}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                B(true);
                R(null);
                try {
                  const body = Object.fromEntries(
                    ['name', 'description', 'unit', 'price', 'vat_rate', 'currency', 'active'].map(
                      (k) => [k, v[k]],
                    ),
                  );
                  await api(edit ? '/catalog/' + edit.id : '/catalog', {
                    method: edit ? 'PUT' : 'POST',
                    body: edit ? { version: edit.version, data: body } : body,
                  });
                  E(undefined);
                  reload();
                } catch (e) {
                  R(e);
                } finally {
                  B(false);
                }
              }}
            >
              <Notice error={err} />
              <div className="form-grid">
                {['name', 'description', 'unit', 'price', 'vat_rate'].map((k) => (
                  <Field
                    key={k}
                    name={k}
                    type={k === 'description' ? 'textarea' : 'text'}
                    value={v[k]}
                    required={k !== 'unit' && k !== 'description'}
                    onChange={(x: string) => V({ ...v, [k]: x })}
                  />
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={v.active}
                  onChange={(e) => V({ ...v, active: e.target.checked })}
                />
                Aktivní položka
              </label>
              <div className="form-actions">
                <button type="button" onClick={() => E(undefined)}>
                  Zrušit
                </button>
                <button className="primary" disabled={busy}>
                  Uložit položku
                </button>
              </div>
            </form>
          </Errors.Provider>
        </Dialog>
      )}
    </>
  );
}
