import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Diagram, DiagramSummary, DiagramType, Page } from '../api/types';
import DiagramTable from '../components/DiagramTable';

const PAGE_SIZE = 20;

export default function MyDiagramsPage() {
  const navigate = useNavigate();
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<DiagramType>('UML');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | DiagramType>('');
  const [pageNumber, setPageNumber] = useState(0);
  const [page, setPage] = useState<Page<DiagramSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(pageNumber), size: String(PAGE_SIZE) });
    if (search.trim()) params.set('title', search.trim());
    if (typeFilter) params.set('diagramType', typeFilter);
    try {
      setPage(await api<Page<DiagramSummary>>(`/diagrams?${params}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [pageNumber, search, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const diagram = await api<Diagram>('/diagrams', {
        method: 'POST',
        body: { title: newTitle, diagramType: newType },
      });
      navigate(`/diagrams/${diagram.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleDelete = async (diagram: DiagramSummary) => {
    if (!confirm(`Delete "${diagram.title}"? This cannot be undone.`)) return;
    try {
      await api(`/diagrams/${diagram.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="page">
      <h1>My diagrams</h1>

      <form className="row" onSubmit={handleCreate}>
        <input
          placeholder="New diagram title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={255}
          required
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value as DiagramType)}>
          <option value="UML">UML</option>
          <option value="ERD">ERD</option>
        </select>
        <button type="submit">Create</button>
      </form>

      <div className="row">
        <input
          placeholder="Search by title"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPageNumber(0);
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as '' | DiagramType);
            setPageNumber(0);
          }}
        >
          <option value="">All types</option>
          <option value="UML">UML</option>
          <option value="ERD">ERD</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {page && <DiagramTable page={page} onPageChange={setPageNumber} onDelete={handleDelete} />}
    </div>
  );
}
