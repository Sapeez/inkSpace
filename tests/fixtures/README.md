# Test fixtures (PRD appendix)

Use these files in integration and burn-in tests. Replace placeholders with real assets before running full test suites.

| Fixture | Path | Purpose |
| ------- | ---- | ------- |
| Already-timestamped filename | `already-timestamped_20250824T071530Z.pdf` | Verify burn-in skips or handles pre-stamped names |
| Large multi-page PDF | `large-multipage.pdf` | Stress pagination, memory, and export time |
| Oversized image | `oversized-image.png` | Validate upload size limits (`MAX_UPLOAD_BYTES`) |

## Adding real binaries

```bash
# Example: copy your own assets into this folder
cp ~/samples/report-50-pages.pdf tests/fixtures/large-multipage.pdf
cp ~/samples/12000x8000.png tests/fixtures/oversized-image.png
```

Git may reject very large binaries — consider Git LFS or generating fixtures in CI.
