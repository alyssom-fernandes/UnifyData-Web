# UnifyData Web

![UnifyData: the closing on a computer and the pending items on a phone](docs/telas/capa.png)

**UnifyData does the month-end closing of employee purchases** for a
group of companies. Employees buy on credit at the group's own stores (a
gas station, a restaurant, a hotel), and Linx AutoSystem, the stores'
management software, records each purchase under the employee's code
(*matrícula*). At the end of the month someone has to turn those Linx
reports into a payroll deduction sheet for each company. UnifyData matches
the monthly reports against the employee register (employee code, CPF, the
Brazilian taxpayer ID, and company) and hands back the spreadsheet, one
sheet per company.

It runs entirely in the browser, with plain JavaScript: no framework, no
build step and no server. The files are read on the computer and never
leave it. The interface is in Portuguese.

**[Open UnifyData](https://alyssom-fernandes.github.io/UnifyData-Web/)** · **[Try the demo](https://alyssom-fernandes.github.io/UnifyData-Web/?demo=1)**, with
made-up files: nothing is saved.

[![Tests](https://github.com/alyssom-fernandes/UnifyData-Web/actions/workflows/testes.yml/badge.svg)](https://github.com/alyssom-fernandes/UnifyData-Web/actions/workflows/testes.yml)
![JavaScript](https://img.shields.io/badge/JavaScript-no_framework-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![No build](https://img.shields.io/badge/build_step-none-success?style=flat-square)
![No server](https://img.shields.io/badge/server-none-success?style=flat-square)
![Theme](https://img.shields.io/badge/theme-light_and_dark-0d6e66?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

This README is also available in [Portuguese](README.pt-BR.md).

## In 30 seconds

1. Open the [demo](https://alyssom-fernandes.github.io/UnifyData-Web/?demo=1).
   It loads the sample files: the Linx accounts receivable PDF, three HR
   spreadsheets and the consumption reports of two stores, LOJA and
   RESTAURANTE.
2. Click **Processar fechamento** (Process closing). Four pending items
   (*Pendências*) show up: two people who are in Linx but not in the
   register, and two with no company. Pick a company for each (the CPF is
   optional), or ignore them.
3. The closing is ready: totals by company and by store, and the buttons
   **Baixar Excel**, **CSV** and **Imprimir ou PDF** (Print or PDF).

## Screenshots

Taken from the demo mode.

| Closing ready, dark theme | Pending items, light theme |
|---|---|
| ![Closing ready in the dark theme, with totals by company and store](docs/telas/resultado-escuro.png) | ![Pending items in the light theme, with the CPF and company fields](docs/telas/pendencias-claro.png) |
| **Start screen, light theme** | **Closing ready, light theme** |
| ![Start screen, with the four steps in the sidebar](docs/telas/inicio-claro.png) | ![Closing ready in the light theme](docs/telas/resultado-claro.png) |

| On a phone, light theme | On a phone, dark theme |
|---|---|
| <img src="docs/telas/celular-pendencias-claro.png" alt="Pending items on a phone, light theme" width="260"> | <img src="docs/telas/celular-escuro.png" alt="Closing ready on a phone, dark theme" width="260"> |

## What comes out

![The A4 report, the Excel workbook with one sheet per company, and the CSV](docs/telas/saidas.png)

- **Excel**: one sheet per company, ready for payroll. Frozen header,
  currency format, formatted CPF and a totals row with `SUM` formulas
  (the result is already stored, and the formulas recalculate if someone
  edits a cell). Sheet names are always valid in Excel: invalid
  characters, the 31-character limit, the reserved name *History* and
  duplicates are handled, and long names are cut at a whole word. Each
  sheet is set to print on A4, fitting the page width.
- **CSV**: `;` separators and decimal commas, the way Excel in Portuguese
  opens it, with a company column.
- **Report** to print or save as PDF: A4, landscape when there are three
  stores or more, each company kept whole on a page when it fits, and
  numbered pages. Ignored items are listed at the bottom, so nothing
  leaves the closing silently.

## What it does

### Employee register

- Built once, and then updated only when new people join: the Linx
  *Contas a Receber* (accounts receivable) PDF brings code, name and CPF;
  the HR spreadsheets (.xls, .xlsx or .csv) bring the company.
- The file name becomes the company name (`Empregados Posto Central.xls`
  becomes *Posto Central*); a workbook with several sheets becomes
  *Company - Sheet*, unless the sheet has Excel's default name (Plan1,
  Planilha1...).
- Saved in the browser. Uploading again only adds and corrects; nothing
  that is already there is lost.

### Monthly closing

- The Linx *Pendências por responsável* (pending by person) reports, one
  CSV per store. The file name becomes the column name.
- Two values per person and store: *overdue* and *total*. The due-date
  period is read from the report and shown on the screen and in the
  printed report.
- Matching is **by employee code**, so it is exact and does not depend on
  how names are spelled.

### Pending items

- People in Linx without a register entry, or without a company, are
  listed to be fixed on the spot: CPF with an input mask, company with
  autocomplete (or a new one). What is saved there also goes into the
  register.
- Or they are ignored, and the result and the report say who was left
  out and how much.

### Phone, themes and details

- Light and dark themes, following the system on the first visit, with
  no flash on load.
- A sidebar with the four steps and their status. On a phone (tested
  down to 375 px wide), a top bar replaces it and the cards take the full
  width.
- Lenient parsing: Windows-1252 or UTF-8 files, HR CSVs with `;` or `,`,
  CPFs stored as numbers in Excel (leading zeros come back), total lines
  in different Linx layouts.
- A file uploaded again with the same name replaces the previous one.

## Privacy and security

- **No server.** Spreadsheets, PDFs and reports are read by the browser
  itself (SheetJS and PDF.js) and are never sent anywhere.
- **The register** (code, name, CPF and company) lives in this browser's
  `localStorage`, on this computer only. It is not encrypted: anyone with
  access to this browser profile can read it.
- **The demo** uses an in-memory register: it never reads or changes the
  real one.
- **Content Security Policy** without `'unsafe-inline'`. SheetJS, ExcelJS
  and PDF.js are pinned and loaded with Subresource Integrity (SRI), only
  when they are needed (the PDF.js worker is pinned by version, since a
  worker cannot take a hash); PDF.js runs with `eval` turned off.
- **Text from the files is never trusted**: names and file names are escaped
  before they become HTML, and CSV cells that start with `=`, `+`, `-` or
  `@` get a leading apostrophe, so a spreadsheet cannot run a formula
  hidden in a name.

## How it is built

| Part | Technology |
|---|---|
| Interface | HTML, CSS and JavaScript, no framework and no build |
| Reading | SheetJS 0.20 for the HR spreadsheets, PDF.js 3.11 for the Linx PDF |
| Writing | ExcelJS 4.4 for the .xlsx; the CSV and the report are made by the app |
| Data | `localStorage` for the register and the theme |
| Fonts | Instrument Sans for the interface; JetBrains Mono for numbers, labels and the signature (Google Fonts) |
| Tests | `node --test`, no dependencies, on every push (GitHub Actions) |

Some decisions behind it:

- **The rules live apart from the screen.** Everything that decides a
  number is in `js/nucleo.js`, as pure functions: reading the Linx
  reports and the HR files, updating the register, matching, grouping by
  company, sheet names and the CSV. The tests run them in Node, against
  the same sample files as the demo.
- **Classic scripts, not modules**, so `index.html` also works with a
  double click, straight from disk.
- **Libraries load on demand.** Opening the page downloads nothing heavy;
  the first PDF or spreadsheet brings only the library it needs.
- **Nothing is dropped silently.** Ignored items are listed, with their
  value, on the screen and in the report, and a file of the wrong type is
  refused with a notice instead of being skipped.

## Known limitations

- It depends on the layouts of the two Linx reports: the accounts
  receivable PDF (lines like `Pessoa: <code> - <name> - <CPF>`) and the
  pending-by-person CSV.
- The register stays in one browser. Clearing the site's data erases it,
  and another computer starts empty.
- The libraries and fonts come from CDNs, so the first PDF or spreadsheet
  of a session needs an internet connection.
- The demo loads its files with `fetch`, so it needs the page to be
  served over HTTP (GitHub Pages or a local server), not opened from
  disk.
- Tested in Chrome and Edge, on a computer and at phone width. The
  interface is in Portuguese only.

## Running your own copy

Open `index.html` in the browser. For real use, that is all you need;
the demo needs the folder to be served, for example with:

```bash
python -m http.server 8000
```

and then `http://localhost:8000/?demo=1`. GitHub Pages serves the folder
as it is.

To run the tests (Node 22 or newer, nothing to install):

```bash
node --test
```

## Project structure

```
index.html            the page: sidebar, the four steps and the report
404.html              page for addresses that do not exist
favicon.svg           the UnifyData mark
css/style.css         light and dark themes, phone and print
js/
  boot.js             theme before the page shows up, and the error log
  nucleo.js           pure rules: parsing, register, matching, sheets, CSV
  app.js              screen, uploads, pending items and the exports
tests/                tests for the rules, with the sample files
exemplos/             made-up files in the Linx and HR formats
.github/workflows/    runs the tests on every push
docs/telas/           images for this README and the link preview (og.png)
```

## The Python version

[UnifyData Python](https://github.com/alyssom-fernandes/UnifyData-Python)
does the same closing for when Linx and HR share no code: it matches
people **by name**, with fuzzy matching, and asks a person only about the
doubtful cases. It is built with Streamlit and runs on your own
computer.

## License

[MIT](LICENSE). Made by [Alyssom Fernandes](https://github.com/alyssom-fernandes), AFN Systems.
