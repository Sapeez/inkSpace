import { useEffect, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface PageNavigatorProps {
  pdfDoc: PDFDocumentProxy | null;
}

// Coordinates with PDFViewer.tsx through the `pdf-page-<n>` id and the
// `.pdf-viewer`/`.pdf-viewer-page` classes it assigns, the same convention
// ThumbnailPanel.tsx uses to scroll the main view.
function scrollToPage(pageNumber: number) {
  document.getElementById(`pdf-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getVisiblePageNumber(container: Element): number | null {
  const pages = container.querySelectorAll<HTMLElement>('.pdf-viewer-page');
  if (pages.length === 0) return null;

  const containerTop = container.getBoundingClientRect().top;
  let closestPage: HTMLElement = pages[0]!;
  let closestDistance = Infinity;

  pages.forEach((page) => {
    const distance = Math.abs(page.getBoundingClientRect().top - containerTop);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPage = page;
    }
  });

  const match = closestPage.id.match(/^pdf-page-(\d+)$/);
  return match ? Number(match[1]) : null;
}

export default function PageNavigator({ pdfDoc }: PageNavigatorProps) {
  const numPages = pdfDoc?.numPages ?? 0;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    setCurrentPage(1);
    setPageInput('1');
  }, [pdfDoc]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    const container = document.querySelector('.pdf-viewer');
    if (!container) return undefined;

    let frame: number | null = null;

    function handleScroll() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const visiblePage = getVisiblePageNumber(container as Element);
        if (visiblePage !== null) setCurrentPage(visiblePage);
      });
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [pdfDoc]);

  function goToPage(pageNumber: number) {
    if (numPages === 0) return;
    const clamped = Math.min(Math.max(pageNumber, 1), numPages);
    setCurrentPage(clamped);
    scrollToPage(clamped);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setPageInput(event.target.value);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    const trimmed = pageInput.trim();
    const parsed = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPage(parsed);
  }

  function handleInputBlur() {
    setPageInput(String(currentPage));
  }

  const disabled = numPages === 0;

  return (
    <div className="page-navigator" data-testid="page-navigator">
      <button
        type="button"
        className="page-navigator-button"
        data-testid="prev-page-button"
        aria-label="Previous page"
        disabled={disabled || currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
      >
        ‹
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="page-navigator-input"
        data-testid="current-page-input"
        aria-label="Current page"
        value={pageInput}
        disabled={disabled}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        onBlur={handleInputBlur}
      />
      <span className="page-navigator-total">of {numPages}</span>
      <button
        type="button"
        className="page-navigator-button"
        data-testid="next-page-button"
        aria-label="Next page"
        disabled={disabled || currentPage >= numPages}
        onClick={() => goToPage(currentPage + 1)}
      >
        ›
      </button>
    </div>
  );
}
