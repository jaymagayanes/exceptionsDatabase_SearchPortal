# SAP Portal — Exceptions Database Web App
**Internal Data Search Portal · Power Query · JavaScript · HTML/CSS · Dataverse**

This project transformed an unstructured Excel spreadsheet used to track school approval exceptions across multiple operational categories into a production-grade internal web portal. It is supported by a SharePoint-connected data pipeline and a lightweight frontend that queries a live Dataverse table.

It is currently in active daily use by the School Approval team.

## 🔗 Demo & Access

- 🎥 [Watch Demo Video](https://drive.google.com/file/d/1idUeVykxLUvIzHl4FQpl8xme_jfie2cT/view)  
  Walkthrough of the system features and usage.

- 🔗 [Access SAT Portal](https://satportal.powerappsportals.com/)  
  Main platform for school approval workflows.

> ⚠️ Note: Portal access may require authorized credentials.
---

## 🎯 Why I Built This

The team maintained a multi-sheet Excel workbook tracking exceptions across six operational categories: EOIs, Post-Approval, Government Permissions, Registration, Annual Invoicing, and Retired exceptions.

The problems were real and recurring:

- No search capability across sheets — finding a country's exceptions meant manually scanning rows
- No consistent schema — each sheet had different column names, banner rows, phantom columns, and mixed date formats
- No audit trail — no way to trace which row a record came from or when it was last updated
- High error risk — copy-paste and visual scanning introduced misses at scale

This project automates the transformation layer and surfaces the data through a queryable web interface — replacing manual lookup with a fast, filterable portal.

---

## ✨ What This Project Demonstrates

### 1. Data Pipeline Engineering (M-Code / Power Query)

The core of this project is a production-grade Power Query M-Code transformation script that loads the live Excel workbook directly from SharePoint and normalizes all six sheets into a single canonical schema.

The pipeline was designed around four principles:

- **Safety-first**: Defensive null handling, schema normalization, and stable row identity throughout
- **Traceability**: Every record carries `SourceSheet`, `ExcelRow`, and `UniqueID` fields for full auditability
- **Determinism**: Consistent transformations regardless of Excel formatting quirks
- **Resilience**: Explicitly handles every documented structural issue in the source workbook

Documented issues addressed in the pipeline:

- Post-Approval: Row 1 is a banner, Row 2 is headers; `"Note "` has a trailing space
- Registration: Extra column `"To be checked (CS 2025)"` excluded from output schema
- EOIs: `"How to process EOI "` has trailing space; `"Country Prioritisation"` is sparse
- Government Permissions: 3 phantom null columns; `"Date"` is all-text (e.g. `"08.02.16"`); `"Rule No."` contains Excel formula strings
- Annual Invoicing: Extra operational columns (`Applied?`, `Checked?`, `Progress`) excluded
- Mixed-type dates (datetime objects and text strings) handled uniformly across all sheets

The pipeline outputs a clean, uniformly typed dataset pushed into a Dataverse table, where it becomes the backend for the web app.

### 2. Cross-Platform Integration Design

The data flow spans three systems:

- **Source**: SharePoint-hosted Excel workbook (live connection via `Web.Contents`)
- **Transformation**: Power Query M-Code running inside Power BI / Power Apps dataflow
- **Storage**: Microsoft Dataverse (custom table `cr557_satportalv4s`)
- **Frontend**: Lightweight HTML/CSS/JavaScript web app querying Dataverse via REST API

This mirrors the kind of multi-platform data pipeline architecture found in enterprise CX and operations environments — where source data is messy, the transformation layer must be robust, and the output must be reliable enough to trust in daily operations.

### 3. Frontend Interface & Search Logic

The web UI is built without a framework — intentionally lightweight and fast. It pulls records from Dataverse on load and handles all filtering client-side.

Features include:

- Full-text keyword search across country, exception text, notes, and source fields
- Programme filter (Early Years, Primary, Lower Secondary, Upper Secondary, Advanced, GQ) with semantic alias resolution (e.g. `"igcse"` → `"upper secondary"`)
- Sheet filter with multi-select and "All Sheets" toggle
- Paginated sidebar list with colour-coded sheet identity dots
- Detail panel rendering structured exception records with safe HTML escaping and multi-line text formatting
- Debounced input for performance

The search logic includes a jargon normalization layer — so team members can search using internal shorthand (`"a-level"`, `"pri"`, `"o level"`, `"EY"`) and still surface the right results.

### 4. Audit Trail & Governance by Design

Every record in the system carries three traceability fields added during transformation:

- `UniqueID`: Stable identifier in `SourceSheet-ExcelRow` format (e.g. `"Post Approval Exceptions-14"`)
- `SourceSheet`: The originating sheet name
- `ExcelRow`: The original row number in the source workbook

This allows any record surfaced in the portal to be traced back to its exact location in the source file — a requirement for a team handling compliance-sensitive school approval decisions.

---

## 🏗️ System Architecture

```
SharePoint Excel Workbook (live source)
        │
        ▼
Power Query M-Code Transformation Pipeline
  ├── Section 0: Reusable helper functions
  │     (CleanText, CleanHeaders, RemovePhantomColumns,
  │      RemoveBlankRows, RemoveFormulaRows, AddTraceability)
  ├── Section 1: Workbook loaded via Web.Contents
  ├── Sections 2–6: Per-sheet extraction and schema normalization
  │     (Post Approval, Registration, EOIs, Gov Permissions, Annual Invoicing)
  ├── Section 7: Table.Combine → unified master dataset
  └── Section 8: Canonical column ordering, CountryMemo duplication, final typing
        │
        ▼
Microsoft Dataverse (cr557_satportalv4s)
        │
        ▼
REST API (OData)
        │
        ▼
Web Frontend (HTML / CSS / JavaScript)
  ├── Data load: fetch from Dataverse on init
  ├── Client-side search: keyword + jargon normalization + programme + sheet filters
  ├── Sidebar: paginated match list with sheet colour coding
  └── Detail panel: structured record display
```

---

## 📋 Data Schema

After transformation, every record conforms to a canonical 14-column schema:

| Field | Description |
|---|---|
| `UniqueID` | Stable key: `SourceSheet-ExcelRow` |
| `SourceSheet` | Originating sheet name |
| `ExcelRow` | Row number in source workbook |
| `Region` | Geographic region |
| `Country` | Country name (truncated for Dataverse single-line limit) |
| `CountryMemo` | Country name (full text, Dataverse multi-line column) |
| `Customer Type` | School/centre type |
| `Programme` | Cambridge programme |
| `Process` | Operational process category |
| `Exception Type` | Classification of the exception |
| `Exception` | Full exception text |
| `Source` | Origin of the exception rule |
| `Date` | Date added or last updated |
| `Note` | Additional context |
| `Supporting Docs` | Links to supporting emails or documentation |

---

## 📁 Project Structure

```
exceptionsDatabase_SearchPortal/
├── index.html                          # App shell and UI structure
├── app.js                              # Search logic, data loading, rendering
├── styles.css                          # UI styling
└── m-code_exceptions_transform.pq     # Power Query transformation pipeline
```

---

## 🔧 Technologies Used

- **Data Pipeline**: Power Query M-Code (production-grade ETL)
- **Source**: SharePoint-hosted Excel (live via `Web.Contents`)
- **Storage**: Microsoft Dataverse (OData REST API)
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Integration Pattern**: SharePoint → Power Query → Dataverse → REST API → Web UI

---

## 💡 Design Decisions

**Why M-Code instead of a script?**
The team already works within the Microsoft 365 ecosystem. A Power Query pipeline embedded in a dataflow runs on a scheduled refresh, keeps the portal data current without manual intervention, and stays inside the governance boundary of the organisation's existing tooling.

**Why Dataverse instead of direct SharePoint query?**
Direct SharePoint calls from a browser-facing app introduce authentication complexity and CORS concerns. Dataverse provides a stable, permissioned OData endpoint that the web app can query cleanly — and the data model survives changes to the source workbook structure.

**Why client-side filtering?**
The dataset is bounded in size (hundreds of records, not millions). Loading everything into memory on init and filtering client-side eliminates round-trips, keeps the UI snappy, and reduces Dataverse API calls. For this use case, it's the right tradeoff.

**Why vanilla JavaScript?**
A framework would add build complexity for a single-page internal tool with no routing needs. The result is a zero-dependency app that loads instantly and runs in any browser — which matters for a team tool where setup friction reduces adoption.

---

## 📈 Potential Extensions

- **Scheduled refresh notifications**: Alert team when source data has changed
- **Edit/flag interface**: Allow officers to annotate or flag records directly in the portal
- **Export to CSV**: Let users export filtered results for offline use
- **Version history**: Track when exception records were added or modified over time
- **Role-based access**: Restrict write operations using Dataverse security roles
- **Power BI embed**: Surface aggregate views (exceptions by region, programme, sheet) alongside the search portal

---

## 🎓 Skills Demonstrated

| Skill | How Demonstrated |
|---|---|
| **Data Pipeline Engineering** | 400+ line production M-Code ETL handling 6 sheets with documented structural anomalies |
| **Cross-Platform Integration** | SharePoint → Power Query → Dataverse → REST → Web frontend |
| **Schema Design** | Canonical 14-column output schema normalized from heterogeneous source structures |
| **Audit & Traceability** | UniqueID, SourceSheet, ExcelRow on every record for governance compliance |
| **Frontend Development** | Full search UI with debounce, jargon normalization, multi-filter, and paginated results |
| **Problem Solving** | Identified and resolved 7 documented structural issues in the source workbook |
| **Production Thinking** | Built for daily operational use, not as a demo — resilient to messy real-world data |
| **Documentation** | Inline M-Code comments, architecture principles, and per-sheet issue documentation |

---

## 📝 Notes

This project was built to solve a real operational gap on my team. The focus throughout was reliability and correctness over cleverness — the transformation pipeline handles every known edge case in the source data explicitly, and the frontend is designed to be fast and frictionless for daily use.

**Key Insight**: The hardest part of this project wasn't the search UI — it was making the underlying data trustworthy. A portal is only useful if the records it surfaces are accurate and traceable. The M-Code pipeline exists specifically to guarantee that.

---

**Author**: [Jay Magayanes](https://github.com/jaymagayanes)
