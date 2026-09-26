// Shared by PDFViewer.tsx and PageNavigator.tsx, which coordinate through the
// `pdf-page-<n>` id and `.pdf-viewer-page` class PDFViewer.tsx assigns to each
// page wrapper, rather than a shared ref/prop.
export function getMostVisiblePageNumber(scrollContainer: Element): number | null {
  const pages = scrollContainer.querySelectorAll<HTMLElement>('.pdf-viewer-page');
  if (pages.length === 0) return null;

  const containerTop = scrollContainer.getBoundingClientRect().top;
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

export function scrollToPage(pageNumber: number, behavior: ScrollBehavior = 'smooth') {
  document.getElementById(`pdf-page-${pageNumber}`)?.scrollIntoView({ behavior, block: 'start' });
}
