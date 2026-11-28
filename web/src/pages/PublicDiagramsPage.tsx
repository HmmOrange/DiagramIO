import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { DiagramSummary, Page } from '../api/types';
import DiagramTable from '../components/DiagramTable';

export default function PublicDiagramsPage() {
  const [pageNumber, setPageNumber] = useState(0);
  const [page, setPage] = useState<Page<DiagramSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Page<DiagramSummary>>(`/diagrams/public?page=${pageNumber}&size=20`, { auth: false })
      .then((result) => {
        setPage(result);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [pageNumber]);

  return (
    <div className="page">
      <h1>Public diagrams</h1>
      {error && <p className="error">{error}</p>}
      {page && <DiagramTable page={page} onPageChange={setPageNumber} />}
    </div>
  );
}
