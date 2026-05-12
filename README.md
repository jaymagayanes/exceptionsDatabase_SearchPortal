# SAP Portal — Internal Search & Knowledge Tool

> A web-based search and reference portal built on Microsoft Power Pages, connected to a Dataverse backend. Designed to replace a fragmented, manually-maintained Excel database with a fast, filterable, and team-friendly interface.

🔗 https://satportal.powerappsportals.com/
---

## 🧩 Problem It Solves

The team was managing a growing exceptions database across multiple Excel sheets — different tabs, inconsistent formatting, and no way to search across them efficiently. Finding a specific country exception meant opening the file, switching tabs, and manually scanning rows.

This portal centralises all of that into a single searchable interface with smart filtering, card-based results, and related-record suggestions — accessible directly from the browser without needing to open Excel at all.

---

## ✨ Features

- **Full-text search** across all record fields with real-time results
- **Jargon normalisation engine** — maps common abbreviations and shorthand (e.g. `IGCSE`, `LS`, `EY`) to their canonical programme names before querying, so searches work naturally regardless of how a user phrases them
- **Multi-filter system** — filter by programme type and record category simultaneously, independent of search input
- **Card-based result display** — each result renders as a structured card with labelled fields, a detail view, and related records
- **Sidebar navigation** with paginated result list for quick scanning
- **Idle / active state transitions** — the UI distinguishes between an empty state and an active search session with subtle animations
- **Responsive layout** — adapts across screen sizes

---

## 🏗️ Architecture

```
Browser (Power Pages)
    │
    ├── HTML/CSS/JS frontend (custom web component)
    │       ├── Search input + debounce handler
    │       ├── Filter controls (programme, category)
    │       ├── Jargon normalisation layer
    │       └── Card renderer + pagination logic
    │
    └── Dataverse OData REST API
            └── Internal exceptions table
                    ├── Country / region metadata
                    ├── Programme & process fields
                    ├── Exception detail text
                    ├── Supporting documentation notes
                    └── Source / date tracking
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Hosting | Microsoft Power Pages |
| Database | Microsoft Dataverse |
| API | OData REST (via Dataverse Web API) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Styling | CSS custom properties (design tokens), responsive grid |
| Auth | Power Pages session-based (organisational SSO) |

---

## 🔍 How the Search Works

1. User types a query — a **debounce handler** delays execution by ~220ms to avoid firing on every keystroke
2. The raw query string is passed through a **jargon normalisation function** that maps known shorthand terms to their full equivalents using a static lookup table
3. The normalised query is split into individual keywords and matched against a pre-built `_searchText` field on each record (a concatenation of all relevant fields, also normalised at load time)
4. Active **sheet filters** and **programme filters** are applied as pre-query gates — records that don't match the selected filters are excluded before keyword matching runs
5. Results are rendered into the sidebar list and the main stage simultaneously

This approach keeps all filtering client-side after initial data load, making the search feel instant.

---

## 🔐 Data Privacy Approach

This project handles internal organisational data. The following practices were applied:

- **No sensitive data in source code** — all records are fetched at runtime from Dataverse via authenticated OData calls; nothing is hardcoded or stored in the frontend
- **Session-based access control** — the Power Pages environment enforces organisational SSO; the portal is not publicly accessible
- **No external data transmission** — all search and filter logic runs entirely client-side after the authenticated API fetch; no data leaves the internal environment
- **This repository contains no real data** — the codebase is shared here for portfolio/technical demonstration purposes only. All record content, internal URLs, field schemas, and organisational references have been removed or abstracted

---

## 📁 Repository Contents

```
/
├── portal.html         # Main UI — search, filters, sidebar, card display
├── styles.css          # Design system (tokens, layout, components)
├── app.js              # Search logic, filter engine, jargon map, render functions
└── README.md
```

> Note: The Dataverse connection and Power Pages hosting configuration are managed at the platform level and are not included here. This repo contains the frontend layer only.

---

## 💡 Key Engineering Decisions

**Why client-side search instead of server-side filtering?**
The dataset is bounded (a few thousand records at most), so fetching all records once on load and filtering locally gives a significantly faster search experience than round-tripping to the API on every keystroke. The OData `$top` parameter caps the initial fetch to a safe maximum.

**Why a jargon normalisation layer?**
Users search the way they talk — `IGCSE`, `GQ`, `lower sec`, `EY` — but the underlying data uses full formal names. Rather than forcing users to match exact field values, the normalisation layer translates both the query and the stored records into a common vocabulary before comparison.

**Why Power Pages instead of a standalone app?**
The tool needed to live inside the organisation's existing Microsoft 365 environment to inherit SSO, SharePoint integration, and Dataverse connectivity without additional infrastructure or authentication setup.

---

## 🚧 Potential Improvements

- [ ] Add keyboard navigation between results (arrow keys)
- [ ] Export filtered results to CSV
- [ ] Highlight matched keywords in result cards
- [ ] Add a "recently viewed" sidebar section using session storage
- [ ] Progressive loading for very large datasets

---

## 👤 Author

**Jay Magayanes**
[github.com/jaymagayanes](https://github.com/jaymagayanes) · magayanesjesh@gmail.com
