# UnifyData Web

> **Zero-install payroll reconciliation tool — runs entirely in your browser.**

UnifyData Web automates the monthly cross-referencing of employee benefit consumption (extracted from Linx AutoSystem) against HR payroll records, generating a formatted Excel report split by company unit — with no server, no Python, no dependencies.

---

## 🌐 Live Demo

> Open `index.html` directly in Chrome or Edge. No installation required.

---

## ✨ Features

- **Zero Installation** — a single `.html` file, runs offline in any modern browser
- **Persistent Local Database** — employee records (ID, CPF, Company) are saved in `localStorage` and survive between sessions
- **Enrollment-Code Matching** — reconciliation uses employee enrollment codes, not name fuzzy-matching, guaranteeing mathematical precision
- **Dual-Value Capture** — extracts both the *overdue* and *total debt* values from each Linx report line
- **Drag & Drop** — all upload zones support drag-and-drop
- **Divergence Resolution** — unknown or unlinked employees surface in an interactive panel for manual resolution before export
- **Excel Export** — generates a `.xlsx` file with one sheet per company, color-coded headers, currency formatting, and auto-width columns

---

## 🗂️ Project Structure

```
unifydata-web/
├── index.html       # Main application (single entry point)
├── script.js        # All business logic: DB, parsing, reconciliation, export
├── style.css        # Dark-mode UI styles
└── README.md
```

---

## 🚀 How to Use

### Step 1 — Set Up the Local Database *(one-time only)*

1. Double-click `index.html` to open it in your browser.
2. In the **Local Database** section, upload:
   - The **Linx Accounts Receivable PDF** (contains enrollment codes and CPFs)
   - The **HR spreadsheets** (`.xls` or `.xlsx`) with employee names, CPFs, and company units
3. Click **Update System Memory**. Records are saved permanently in the browser.

> If new employees join later, repeat this step or resolve them manually during monthly processing.

### Step 2 — Monthly Closing

1. Open `index.html`.
2. Go to the **Monthly Closing** section.
3. Upload the **Linx consumption reports** (`.csv` files).
4. Click **Process and Generate Spreadsheet**.
5. Resolve any flagged divergences (unknown employees or missing company links).
6. Download the consolidated `.xlsx` report.

---

## 📊 Output Format

Each company unit gets its own sheet. Columns per sheet:

| Funcionário | CPF | Overdue [Origin] | Total [Origin] | ... | Total Discount |
|---|---|---|---|---|---|
| JOHN DOE | 000.000.000-00 | R$ 0,00 | R$ 150,00 | ... | R$ 150,00 |

- Header row: dark burgundy background, white bold text
- Employees with zero consumption: displayed in gray
- Footer row: grand total in bold

---

## 🛠️ Tech Stack

| Technology | Role |
|---|---|
| Vanilla JavaScript (ES2020+) | All business logic |
| [SheetJS (xlsx)](https://sheetjs.com/) | Reading `.xls` / `.xlsx` HR files |
| [ExcelJS](https://github.com/exceljs/exceljs) | Generating the output `.xlsx` |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Extracting data from Linx PDF reports |
| `localStorage` | Persistent in-browser employee database |
| CSS Variables | Dark-mode design system |

All libraries are loaded via CDN — no `npm`, no build step.

---

## 📋 Requirements

- Google Chrome or Microsoft Edge (Chromium-based)
- No internet connection required after first load (CDN libraries are cached)

---

## ⚠️ Notes

- The local database is tied to the browser and device. Clearing browser data will erase it.
- The PDF parser expects the Linx "Accounts Receivable" report format (`Pessoa: [ID] - [NAME] - [CPF]`).
- CSV consumption files must follow the Linx "Pending by Responsible" layout.

---

## 🤝 Contributing

Feel free to open issues or pull requests. This project was built for a real-world payroll use case and contributions that improve CSV format compatibility are especially welcome.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

*Developed by AFN Systems · 2026*
