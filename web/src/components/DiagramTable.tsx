import { Link } from 'react-router-dom';
import type { DiagramSummary, Page } from '../api/types';

interface Props {
  page: Page<DiagramSummary>;
  onPageChange: (page: number) => void;
  onDelete?: (diagram: DiagramSummary) => void;
}

export default function DiagramTable({ page, onPageChange, onDelete }: Props) {
  if (page.content.length === 0) return <p>No diagrams.</p>;

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            {onDelete && <th>Public</th>}
            <th>Updated</th>
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {page.content.map((diagram) => (
            <tr key={diagram.id}>
              <td>
                <Link to={`/diagrams/${diagram.id}`}>{diagram.title}</Link>
              </td>
              <td>{diagram.diagramType}</td>
              {onDelete && <td>{diagram.isPublic ? 'Yes' : 'No'}</td>}
              <td>{new Date(diagram.updatedAt).toLocaleString()}</td>
              {onDelete && (
                <td>
                  <button type="button" className="danger" onClick={() => onDelete(diagram)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {page.totalPages > 1 && (
        <div className="row">
          <button type="button" disabled={page.page === 0} onClick={() => onPageChange(page.page - 1)}>
            Previous
          </button>
          <span>
            Page {page.page + 1} of {page.totalPages}
          </span>
          <button
            type="button"
            disabled={page.page + 1 >= page.totalPages}
            onClick={() => onPageChange(page.page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
