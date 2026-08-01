'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Field, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import type { ApiPage, CrmCompany } from '@/lib/crm';
export default function CompaniesPage() {
  const [items, setItems] = useState<CrmCompany[]>([]),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [city, setCity] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '50' });
      if (search) query.set('search', search);
      setItems((await api<ApiPage<CrmCompany>>(`/crm/companies?${query}`)).data);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      <PageHeader
        title="Empresas"
        description="Organizaciones reales vinculadas a sus contactos y contexto comercial."
        action={<Button onClick={() => setOpen((value) => !value)}>Registrar empresa</Button>}
      />
      {open && (
        <form
          className="crm-inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await api('/crm/companies', { method: 'POST', body: JSON.stringify({ name, city }) });
              setName('');
              setCity('');
              setOpen(false);
              await load();
            } catch (reason) {
              setError(messageOf(reason));
            }
          }}
        >
          <Field
            label="Nombre de la empresa"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Field label="Ciudad" value={city} onChange={(event) => setCity(event.target.value)} />
          <Button>Guardar</Button>
        </form>
      )}
      <div className="max-w-md">
        <Field
          label="Buscar empresa"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="mt-5 h-80" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No hay empresas registradas"
          description="Registre una organización solo cuando exista contexto comercial verificable."
        />
      ) : (
        <div className="crm-companies">
          {items.map((item) => (
            <article key={item.id}>
              <span>EMPRESA</span>
              <h2>{item.name}</h2>
              <p>{item.legalName || item.city || 'Contexto por completar'}</p>
              <small>{item.contacts.length} contacto(s) vinculados</small>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
