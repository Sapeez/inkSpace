interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

// WF11: persistent search/filter bar. Filters client-side (see
// WorkspacePage.tsx) — acceptable per code-review.md §3 Performance, which
// only flags this pattern when the underlying list is unbounded/unpaginated
// at the data layer, not for a single workspace's own file list.
export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="search-bar" data-testid="search-bar">
      <input
        type="search"
        className="search-bar-input"
        data-testid="search-input"
        placeholder="Search files"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search files"
      />
    </div>
  );
}
