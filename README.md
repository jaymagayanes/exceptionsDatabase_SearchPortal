# Exceptions Search Portal

A small internal-style web app that turns a messy, multi-sheet Excel workbook into something you can actually search. The data is cleaned with Power Query, stored in Microsoft Dataverse, and shown through a lightweight HTML/CSS/JavaScript front end.

**Stack:** Power Query (M), SharePoint, Dataverse (OData), vanilla JavaScript, HTML, CSS

**Demo:** [Watch the walkthrough video](https://drive.google.com/file/d/1idUeVykxLUvIzHl4FQpl8xme_jfie2cT/view)

> The live version ran against a private data source, so this repo can't be run as-is. To try it yourself, point `app.js` at your own Dataverse table that uses the schema below.

---

## The problem

A team was tracking exceptions to their standard approval rules in one Excel workbook with six sheets, one per category. It worked until it didn't:

- You couldn't search across sheets. Finding everything about one country meant opening each sheet and scanning rows.
- Every sheet had its own layout: different column names, banner rows, empty columns and mixed date formats.
- There was no way to tell where a record came from or when it was last touched.
- Copy-pasting and eyeballing rows at that scale meant things got missed.

I built a pipeline that cleans the workbook into one consistent table, and a search page on top of it so people can find what they need in seconds.

## How it works

```
Excel workbook on SharePoint (live source)
        |
        v
Power Query (M) transformation
  - shared helper functions (clean text, fix headers, drop blank rows, add trace fields)
  - one extraction step per sheet, each mapped to the same columns
  - all sheets combined into one table with a fixed column order
        |
        v
Microsoft Dataverse table
        |
        v
OData REST API
        |
        v
Web front end (HTML / CSS / JavaScript)
  - loads the records once on startup
  - filters in the browser: keyword, programme and sheet
  - results list on the left, full record on the right
```

### 1. The data pipeline (Power Query M)

The script reads the workbook straight from SharePoint and shapes every sheet into the same structure. I wrote it around four ideas:

- **Safe:** handle nulls everywhere and give every row a stable identity.
- **Traceable:** every record keeps the sheet and row it came from.
- **Predictable:** the same input gives the same output, whatever the Excel formatting looks like.
- **Resilient:** every quirk I found in the source file is handled on purpose, not by luck.

Some of the quirks it deals with:

- Banner rows sitting above the real header row
- Header names with stray trailing spaces
- Empty "phantom" columns and extra working columns that shouldn't reach the final table
- Dates that are a mix of real dates and text such as `08.02.16`
- Cells that hold Excel formula text instead of values
- Sparse columns that are only filled in for some rows

### 2. Search and filtering

The front end uses no framework, because a single-page tool with no routing doesn't need one. It loads everything on startup and filters in memory.

- Keyword search across country, exception text, notes and source
- Programme filter with alias matching, so typing `a-level` or `pri` still finds the right level
- Multi-select sheet filter with an "All sheets" toggle
- Paginated results list with a coloured dot for each sheet
- Detail panel with escaped HTML and preserved line breaks
- Debounced typing so the list doesn't re-render on every keystroke

The alias matching was the part I cared about most. People search in their own shorthand, and a search box that only understands official names gets ignored.

### 3. Traceability

Every record gets three extra fields during the transformation:

- `UniqueID`: a stable key in the form `SheetName-RowNumber`
- `SourceSheet`: the sheet it came from
- `ExcelRow`: its row number in the original workbook

Any result in the portal can be traced back to the exact cell it started from. That matters when people are making decisions based on what they find.

## Data schema

Every record ends up with these 15 fields:

| Field | Description |
|---|---|
| `UniqueID` | Stable key: `SheetName-RowNumber` |
| `SourceSheet` | Sheet the record came from |
| `ExcelRow` | Row number in the source workbook |
| `Region` | Geographic region |
| `Country` | Country name, shortened to fit a Dataverse single-line column |
| `CountryMemo` | Full country text, stored in a multi-line column |
| `Customer Type` | Type of school or centre |
| `Programme` | Education programme or level |
| `Process` | Process category |
| `Exception Type` | Classification of the exception |
| `Exception` | Full exception text |
| `Source` | Where the rule came from |
| `Date` | Date added or last updated |
| `Note` | Extra context |
| `Supporting Docs` | Links to supporting emails or documents |

## Project structure

```
exceptionsDatabase_SearchPortal/
├── index.html                        # page structure
├── app.js                            # data loading, search, rendering
├── styles.css                        # styling
└── m-code_exceptions_transform.pq    # Power Query pipeline
```

## Why I made these choices

**Power Query instead of a script.** The team already worked in Microsoft 365. A Power Query dataflow refreshes on a schedule, so the portal stays current without anyone running anything, and it stays inside tools the organisation already manages.

**Dataverse instead of querying SharePoint from the browser.** Calling SharePoint directly from a web page brings authentication and CORS headaches. Dataverse gives a stable, permissioned OData endpoint, and the data model keeps working even if the Excel layout changes.

**Filtering in the browser.** The dataset is hundreds of records, not millions. Loading it once and filtering locally means no round trips, a snappy UI and far fewer API calls.

**Vanilla JavaScript.** A build step would be extra weight for a tool this size. The result has no dependencies, loads instantly and works in any browser, which helps adoption when a team just wants to look something up.

## Ideas for next steps

- Export filtered results to CSV
- Let users flag or annotate records, with write access limited by Dataverse security roles
- Show when a record was added or changed
- Notify the team when the source data changes
- Embed a Power BI view with totals by region, programme and sheet

## What I took from this

The search page was the easy part. The hard part was making the data underneath trustworthy, because a search tool is only as good as the records it returns. Most of the work went into the pipeline, so that what people find is accurate and can be traced back to its source.

---

Built by [Jay Magayanes](https://github.com/jaymagayanes)
