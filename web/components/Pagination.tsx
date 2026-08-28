interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const delta = 1;
  const left = Math.max(2, page - delta);
  const right = Math.min(totalPages - 1, page + delta);

  const items: (number | "…")[] = [1];
  if (left > 2) items.push("…");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < totalPages - 1) items.push("…");
  if (totalPages > 1) items.push(totalPages);
  return items;
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        ‹ Prev
      </button>
      {pageWindow(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="page-ellipsis">
            …
          </span>
        ) : (
          <button key={p} className={`page-btn ${p === page ? "active" : ""}`} onClick={() => onChange(p)}>
            {p}
          </button>
        )
      )}
      <button className="page-btn" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        Next ›
      </button>
    </div>
  );
}
