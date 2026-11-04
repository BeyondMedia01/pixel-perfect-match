import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "1–50 of 312" with previous / next. Renders nothing when everything fits on one page. */
export function Pager({
  pager,
  noun = "items",
}: {
  pager: {
    page: number;
    pages: number;
    total: number;
    from: number;
    to: number;
    setPage: (p: number) => void;
  };
  noun?: string;
}) {
  if (pager.pages <= 1) return null;
  return (
    <nav
      aria-label={`More ${noun}`}
      className="mt-3 flex items-center justify-between gap-3 text-sm"
    >
      <span className="tabular text-muted-foreground">
        {pager.from}–{pager.to} of {pager.total} {noun}
      </span>
      <span className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={pager.page === 0}
          onClick={() => pager.setPage(pager.page - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <span className="tabular px-2 text-xs text-muted-foreground">
          Page {pager.page + 1} of {pager.pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pager.page >= pager.pages - 1}
          onClick={() => pager.setPage(pager.page + 1)}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </span>
    </nav>
  );
}
