import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, pages, total, onPage, perPage }) {
  if (!total) return null
  const per = perPage || Math.ceil(total / pages)
  const from = (page - 1) * per + 1
  const to = Math.min(total, page * per)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span className="num">
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="btn-ghost !h-8 !px-2"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="num px-1 text-xs">
          {page} / {pages}
        </span>
        <button
          className="btn-ghost !h-8 !px-2"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
