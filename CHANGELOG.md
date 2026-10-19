# Changelog

## Unreleased

### Closing
- The app now reads the *Total geral* line of each Linx report and
  compares it with the sum of the people it read. The tape gets a
  *Total geral no relatório* line, and a warning appears (also in the
  printed report) when they differ. A report without that line is not
  checked, and the app says so.

### Pending items
- When the CPF typed for a person without a register entry already
  belongs to another code, a notice shows whose it is and offers to link
  the code to that person. Saving as typed still works.

## 1.1.0 (2026-10-13)

### Closing
- The result opens with a reconciliation tape, like an adding-machine
  roll: each store's total in Linx, their sum, what was ignored and what
  goes to payroll.
- Each step's number is part of its title.
- On wide screens (1200 px or more) the column is wider and the company
  table sits beside the tape.

### Demo
- The demo opens at the top of the page and shows that it is loading.
  Nothing moves while the sample files arrive (cumulative layout shift 0,
  measured in Edge on a computer and on a throttled phone).
- The demo banner sits at the top of the page, above the sidebar and the
  bar, in the brand color.
- SheetJS and PDF.js download alongside the sample files, not after them.
- Notifications stack in the bottom-right corner on a computer.

### Outputs
- Files are named after the month of the due dates
  (`Fechamento_UnifyData_2026-09.xlsx`).
- In the demo, the Excel and the A4 report say the data is made up, and
  the file names (Excel, CSV) end in `_DEMO`. The CSV itself carries no
  notice.
- The report and the Excel header use the brand teal instead of burgundy,
  and the report summary shows the same reconciliation as the tape.

### Privacy and security
- The fonts are hosted in the repository: the page no longer calls Google
  Fonts and sends no referrer. The CSP is tighter, and the 404 page has
  its own.
- An unexpected read error says what to do; the technical detail goes to
  the console.
- CSS and scripts carry a version in their address, so a new release
  never runs with an old file from the cache.

### Project
- CI runs on Node 22 and 24. Tests: 11 → 13 (file names and the
  reconciliation).
- The README says exactly what the tests cover.
- Link preview with image size and alt text; icon for iPhone.

## 1.0.0 (2026-10-02)

- New interface: the four steps with a sidebar, light and dark themes, a
  phone layout and a demo with sample files.
- Excel, CSV and an A4 report; the rules in `js/nucleo.js`, tested with
  `node --test`.
