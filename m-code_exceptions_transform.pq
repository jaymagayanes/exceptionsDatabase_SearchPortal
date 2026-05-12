/*
═══════════════════════════════════════════════════════════════════════════════
  PRODUCTION-GRADE POWER QUERY M-CODE TRANSFORMATION PIPELINE
  ──────────────────────────────────────────────────────────────────────────────
  EXCEPTIONS DATABASE - SharePoint Live Backend Source
  ──────────────────────────────────────────────────────────────────────────────
  
  ARCHITECTURE PRINCIPLES:
  ─────────────────────────
  1. SAFETY-FIRST: Defensive null handling, schema normalization, stable row identity
  2. TRACEABILITY: SourceSheet + ExcelRow + UniqueID for auditability
  3. DETERMINISM: Consistent transformations regardless of Excel formatting
  4. RESILIENCE: Tolerant of merged cells, banner rows, trailing spaces, formula strings
  5. NORMALIZATION: Per-sheet semantic mapping to common business schema
  6. FRONTEND-SAFE: UniqueID as stable React key, no phantom/null column leakage
  
  DOCUMENTED STRUCTURAL ISSUES ADDRESSED:
  ───────────────────────────────────────
  ✓ Post-Approval: Row 1 = banner, Row 2 = headers, "Note " has trailing space
  ✓ Registration: Extra column "To be checked (CS 2025)" excluded
  ✓ EOIs: "How to process EOI " has trailing space, sparse "Country Prioritisation"
  ✓ Government Permissions: 3 phantom null columns, Date = all text strings ("08.02.16")
  ✓ Annual Invoicing: Extra columns "Applied?", "Checked?", "Progress" excluded
  ✓ Excel formulas in Gov Permissions "Rule No." excluded safely
  ✓ Mixed-type dates (datetime objects + "30/07/2024" text) handled uniformly
  
═══════════════════════════════════════════════════════════════════════════════
*/

let
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 0: HELPER FUNCTIONS (Reusable, DRY)
    // ─────────────────────────────────────────────────────────────────────────
    
    // Helper: Deeply clean text values (remove NBSP, unicode narrow spaces, etc.)
    CleanText = (input as any) as nullable text =>
    if input = null then
        null
    else
        let
            asText    = Text.From(input),
            step0     = Text.Replace(asText, "#(cr)#(lf)", "#(lf)"),
            step0b    = Text.Replace(step0, "#(cr)", "#(lf)"),
            protected = Text.Replace(step0b, "#(lf)", "|||NEWLINE|||"),
            step1     = Text.Replace(protected, Character.FromNumber(160), " "),
            step2     = Text.Replace(step1, Character.FromNumber(8239), " "),
            step3     = Text.Clean(step2),
            restored  = Text.Replace(step3, "|||NEWLINE|||", "#(lf)"),
            step4     = Text.Trim(restored)
        in
            step4,
    
    // Helper: Clean ALL TEXT columns in a table (preserves dates, nulls)
    CleanAllTextColumns = (tbl as table) as table =>
        Table.TransformColumns(
            tbl,
            List.Transform(
                Table.ColumnNames(tbl),
                (col) =>
                    {
                        col,
                        each
                            if col = "ExcelRow" or col = "SourceSheet" or col = "UniqueID" or col = "CountryMemo" then
                                // Skip metadata columns
                                _
                            else if _ = null then
                                // Preserve nulls
                                null
                            else if _ is number or _ is logical or (_ is date or _ is time) then
                                // Don't convert numbers, bools, or dates
                                _
                            else
                                // Clean text columns
                                CleanText(_),
                        type text
                    }
            )
        ),
    
    // Helper: Clean headers only (apply trim, clean, space normalization)
    CleanHeaders = (tbl as table) as table =>
        let
            originalNames = Table.ColumnNames(tbl),
            cleanedNames = List.Transform(
                originalNames,
                (name) =>
                    if name = null or name = "" then
                        // Keep phantom null columns as is for removal later
                        name
                    else
                        CleanText(name)
            ),
            renamed = Table.RenameColumns(
                tbl,
                List.Zip({originalNames, cleanedNames})
            )
        in
            renamed,
    
    // Helper: Remove phantom null/blank columns
    RemovePhantomColumns = (tbl as table) as table =>
        let
            cols = Table.ColumnNames(tbl),
            validCols = List.Select(
                cols,
                (col) => col <> null and col <> "" and col <> "None"
            )
        in
            if List.Count(validCols) = List.Count(cols) then
                tbl
            else
                Table.SelectColumns(tbl, validCols),
    
    // Helper: Remove fully blank rows (where all meaningful columns are null/empty)
    RemoveBlankRows = (tbl as table) as table =>
        Table.SelectRows(
            tbl,
            each
                let
                    cols = Record.FieldValues(_)
                in
                    List.AnyTrue(
                        List.Transform(
                            cols,
                            (val) =>
                                val <> null
                                and (if val is text then
                                    Text.Trim(val) <> ""
                                else
                                    true)
                        )
                    )
        ),
    
    // Helper: Remove formula string rows (Excel formulas appear as "=A2+1")
    RemoveFormulaRows = (tbl as table, checkColumn as text) as table =>
        Table.SelectRows(
            tbl,
            each
                let
                    val = Record.Field(_, checkColumn)
                in
                    if val = null then
                        true
                    else if val is text then
                        not Text.StartsWith(Text.Trim(Text.From(val)), "=")
                    else
                        true
        ),
    
    // Helper: Remove rows where a critical column is null/empty
    RemoveEmptyCriticalColumn = (tbl as table, colName as text) as table =>
        Table.SelectRows(
            tbl,
            each
                let
                    val = Record.Field(_, colName)
                in
                    val <> null and (if val is text then Text.Trim(val) <> "" else true)
        ),
    
    // Helper: Add row traceability (SourceSheet + ExcelRow + UniqueID)
    AddTraceability = (tbl as table, sheetName as text, startRow as number) as table =>
        let
            // First, add ExcelRow if not present
            withExcelRow =
                if Table.HasColumns(tbl, {"ExcelRow"}) then
                    tbl
                else
                    Table.AddIndexColumn(tbl, "ExcelRow", startRow, 1, Int64.Type),
            
            // Add SourceSheet
            withSource = Table.AddColumn(
                withExcelRow,
                "SourceSheet",
                each sheetName,
                type text
            ),
            
            // Add UniqueID = SourceSheet-ExcelRow
            withUniqueID = Table.AddColumn(
                withSource,
                "UniqueID",
                each [SourceSheet] & "-" & Text.From([ExcelRow]),
                type text
            )
        in
            withUniqueID,
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: LOAD WORKBOOK FROM SHAREPOINT
    // ─────────────────────────────────────────────────────────────────────────
    
    FileBinary =
        Web.Contents(
            "https://cambridgeorg.sharepoint.com/sites/SchoolApproval/Shared Documents/General/Exceptions Databse/Exceptions Database.xlsx"
        ),
    
    Workbook = Excel.Workbook(FileBinary, null, true),
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: POST-APPROVAL EXCEPTIONS
    // ─────────────────────────────────────────────────────────────────────────
    // Structural: Row 1 = banner, Row 2 = headers, Row 3+ = data
    // Issue: "Note " has trailing space
    // ─────────────────────────────────────────────────────────────────────────
    
    PostApprovalRaw =
        Table.SelectRows(
            Workbook,
            each [Kind] = "Sheet"
                and Text.Contains(Text.Lower([Name]), "post")
                and not Text.Contains(Text.Lower([Name]), "retired")
        ){0}[Data],
    
    // Skip row 1 (banner), keep row 2 (headers) and row 3+ (data)
    PostApprovalSkipped = Table.Skip(PostApprovalRaw, 1),
    PostApprovalPromoted = Table.PromoteHeaders(
        PostApprovalSkipped,
        [PromoteAllScalars = true]
    ),
    PostApprovalCleaned = CleanHeaders(PostApprovalPromoted),
    PostApprovalNoPhantom = RemovePhantomColumns(PostApprovalCleaned),
    PostApprovalNoBlank = RemoveBlankRows(PostApprovalNoPhantom),
    
    // Add row tracking (Row 3 is first data row, since we skipped 1 row initially)
    PostApprovalIndexed = AddTraceability(PostApprovalNoBlank, "Post Approval Exceptions", 3),
    
    // Select canonical columns with safe null handling
    PostApprovalSelected = Table.SelectColumns(
        PostApprovalIndexed,
        {
            "ExcelRow",
            "SourceSheet",
            "UniqueID",
            "Region",
            "Country",
            "Customer Type",
            "Programme",
            "Process",
            "Exception Type",
            "Exception",
            "Source",
            "Date added/Last updated",
            "Supporting emails/docs",
            "Note"
        },
        MissingField.UseNull
    ),
    
    // Clean text in all columns except metadata
    PostApprovalTextCleaned = CleanAllTextColumns(PostApprovalSelected),
    
    // Rename to canonical schema
    PostApprovalRenamed = Table.RenameColumns(
        PostApprovalTextCleaned,
        {
            {"Date added/Last updated", "Date"},
            {"Supporting emails/docs", "Supporting Docs"}
        },
        MissingField.UseNull
    ),
    
    // Remove rows where Exception is null/empty (critical for accuracy)
    PostApprovalFiltered = RemoveEmptyCriticalColumn(PostApprovalRenamed, "Exception"),
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: REGISTRATION EXCEPTIONS
    // ─────────────────────────────────────────────────────────────────────────
    // Structural: Row 1 = headers, Row 2+ = data
    // Issues: Extra column "To be checked (CS 2025)" not in target schema
    //         "Qualifications" → "Programme", "Model" → "Customer Type"
    // ─────────────────────────────────────────────────────────────────────────
    
    RegistrationRaw =
        Table.SelectRows(
            Workbook,
            each [Kind] = "Sheet"
                and Text.Contains(Text.Lower([Name]), "registration")
                and not Text.Contains(Text.Lower([Name]), "retired")
        ){0}[Data],
    
    RegistrationPromoted = Table.PromoteHeaders(
        RegistrationRaw,
        [PromoteAllScalars = true]
    ),
    RegistrationCleaned = CleanHeaders(RegistrationPromoted),
    RegistrationNoPhantom = RemovePhantomColumns(RegistrationCleaned),
    RegistrationNoBlank = RemoveBlankRows(RegistrationNoPhantom),
    RegistrationIndexed = AddTraceability(RegistrationNoBlank, "Registration Exceptions", 2),
    
    // Select canonical columns
    RegistrationSelected = Table.SelectColumns(
        RegistrationIndexed,
        {
            "ExcelRow",
            "SourceSheet",
            "UniqueID",
            "Process",
            "Country",
            "Qualifications",
            "Model",
            "Exception Type",
            "Exception",
            "Source",
            "Date instigated/Last updated",
            "Notes"
        },
        MissingField.UseNull
    ),
    
    RegistrationTextCleaned = CleanAllTextColumns(RegistrationSelected),
    
    // Rename to canonical schema
    RegistrationRenamed = Table.RenameColumns(
        RegistrationTextCleaned,
        {
            {"Qualifications", "Programme"},
            {"Model", "Customer Type"},
            {"Date instigated/Last updated", "Date"},
            {"Notes", "Note"}
        },
        MissingField.UseNull
    ),
    
    // Add missing columns with nulls
    RegistrationWithMissing =
        Table.AddColumn(
            Table.AddColumn(
                RegistrationRenamed,
                "Region",
                each null,
                type text
            ),
            "Supporting Docs",
            each null,
            type text
        ),
    
    RegistrationFiltered = RemoveEmptyCriticalColumn(RegistrationWithMissing, "Exception"),
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: EOIs (EXPRESSION OF INTEREST)
    // ─────────────────────────────────────────────────────────────────────────
    // Structural: Row 1 = headers, Row 2+ = data
    // Issues: "How to process EOI " has trailing space
    //         "Country Prioritisation" is sparse (mostly null)
    // ─────────────────────────────────────────────────────────────────────────
    
    EOIRaw =
        Table.SelectRows(
            Workbook,
            each [Kind] = "Sheet"
                and Text.Contains(Text.Lower([Name]), "eoi")
                and not Text.Contains(Text.Lower([Name]), "retired")
        ){0}[Data],
    
    EOIPromoted = Table.PromoteHeaders(EOIRaw, [PromoteAllScalars = true]),
    EOICleaned = CleanHeaders(EOIPromoted),
    EOINoPhantom = RemovePhantomColumns(EOICleaned),
    EOINoBlank = RemoveBlankRows(EOINoPhantom),
    EOIIndexed = AddTraceability(EOINoBlank, "EOIs", 2),
    
    // Select canonical columns
    EOISelected = Table.SelectColumns(
        EOIIndexed,
        {
            "ExcelRow",
            "SourceSheet",
            "UniqueID",
            "Country",
            "Country Prioritisation",
            "How to process EOI",
            "Source",
            "Date instigated/Last updated",
            "Notes"
        },
        MissingField.UseNull
    ),
    
    EOITextCleaned = CleanAllTextColumns(EOISelected),
    
    // Rename to canonical schema
    EOIRenamed = Table.RenameColumns(
        EOITextCleaned,
        {
            {"Country Prioritisation", "Exception Type"},
            {"How to process EOI", "Exception"},
            {"Date instigated/Last updated", "Date"},
            {"Notes", "Note"}
        },
        MissingField.UseNull
    ),
    
    // Add missing columns
    EOIWithMissing = Table.AddColumn(
        Table.AddColumn(
            Table.AddColumn(
                Table.AddColumn(
                    Table.AddColumn(
                        EOIRenamed,
                        "Region",
                        each null,
                        type text
                    ),
                    "Programme",
                    each null,
                    type text
                ),
                "Process",
                each null,
                type text
            ),
            "Customer Type",
            each null,
            type text
        ),
        "Supporting Docs",
        each null,
        type text
    ),
    
    EOIFiltered = RemoveEmptyCriticalColumn(EOIWithMissing, "Exception"),
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: GOVERNMENT PERMISSIONS
    // ─────────────────────────────────────────────────────────────────────────
    // Structural: Row 1 = headers, Row 2+ = data
    // Issues: 3 phantom null columns (G, H, I)
    //         "Rule No." contains Excel formulas ("=A2+1") → exclude
    //         "Date" column is ALL TEXT (e.g. "08.02.16"), NOT datetime
    // ─────────────────────────────────────────────────────────────────────────
    
    GovPermRaw =
        Table.SelectRows(
            Workbook,
            each [Kind] = "Sheet"
                and Text.Contains(Text.Lower([Name]), "government")
        ){0}[Data],
    
    GovPermPromoted = Table.PromoteHeaders(
        GovPermRaw,
        [PromoteAllScalars = true]
    ),
    GovPermCleaned = CleanHeaders(GovPermPromoted),
    GovPermNoPhantom = RemovePhantomColumns(GovPermCleaned),
    GovPermNoBlank = RemoveBlankRows(GovPermNoPhantom),
    
    // CRITICAL: Remove formula rows (Rule No. contains "=A2+1")
    GovPermNoFormulas = RemoveFormulaRows(GovPermNoBlank, "Rule No."),
    
    GovPermIndexed = AddTraceability(GovPermNoFormulas, "Government Permissions", 2),
    
    // Select canonical columns (exclude Rule No. which contains formulas)
    GovPermSelected = Table.SelectColumns(
        GovPermIndexed,
        {
            "ExcelRow",
            "SourceSheet",
            "UniqueID",
            "Country",
            "Rule",
            "Source",
            "Date",
            "Notes"
        },
        MissingField.UseNull
    ),
    
    GovPermTextCleaned = CleanAllTextColumns(GovPermSelected),
    
    // Rename to canonical schema
    GovPermRenamed = Table.RenameColumns(
        GovPermTextCleaned,
        {
            {"Rule", "Exception"},
            {"Notes", "Note"}
        },
        MissingField.UseNull
    ),
    
    // Add missing columns
    GovPermWithMissing = Table.AddColumn(
        Table.AddColumn(
            Table.AddColumn(
                Table.AddColumn(
                    Table.AddColumn(
                        GovPermRenamed,
                        "Region",
                        each null,
                        type text
                    ),
                    "Programme",
                    each null,
                    type text
                ),
                "Process",
                each null,
                type text
            ),
            "Customer Type",
            each null,
            type text
        ),
        "Exception Type",
        each null,
        type text
    ),
    
    GovPermWithMissing2 = Table.AddColumn(
        GovPermWithMissing,
        "Supporting Docs",
        each null,
        type text
    ),
    
    GovPermFiltered = RemoveEmptyCriticalColumn(GovPermWithMissing2, "Exception"),
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: ANNUAL INVOICING EXCEPTIONS
    // ─────────────────────────────────────────────────────────────────────────
    // Structural: Row 1 = headers, Row 2+ = data
    // Issues: Extra columns "Applied?", "Checked?", "Progress" not in target schema
    //         Date column is sparse/often null
    // ─────────────────────────────────────────────────────────────────────────
    
    AnnualRaw =
        Table.SelectRows(
            Workbook,
            each [Kind] = "Sheet"
                and Text.Contains(Text.Lower([Name]), "annual invoicing")
        ){0}[Data],
    
    AnnualPromoted = Table.PromoteHeaders(
        AnnualRaw,
        [PromoteAllScalars = true]
    ),
    AnnualCleaned = CleanHeaders(AnnualPromoted),
    AnnualNoPhantom = RemovePhantomColumns(AnnualCleaned),
    AnnualNoBlank = RemoveBlankRows(AnnualNoPhantom),
    AnnualIndexed = AddTraceability(AnnualNoBlank, "Annual Invoicing Exceptions", 2),
    
    // Select canonical columns (exclude Applied?, Checked?, Progress)
    AnnualSelected = Table.SelectColumns(
        AnnualIndexed,
        {
            "ExcelRow",
            "SourceSheet",
            "UniqueID",
            "Country",
            "Rule Type",
            "Exception",
            "Origin",
            "Date instigated/Last updated",
            "Notes"
        },
        MissingField.UseNull
    ),
    
    AnnualTextCleaned = CleanAllTextColumns(AnnualSelected),
    
    // Rename to canonical schema
    AnnualRenamed = Table.RenameColumns(
        AnnualTextCleaned,
        {
            {"Rule Type", "Exception Type"},
            {"Origin", "Source"},
            {"Date instigated/Last updated", "Date"},
            {"Notes", "Note"}
        },
        MissingField.UseNull
    ),
    
    // Add missing columns
    AnnualWithMissing = Table.AddColumn(
        Table.AddColumn(
            Table.AddColumn(
                Table.AddColumn(
                    Table.AddColumn(
                        AnnualRenamed,
                        "Region",
                        each null,
                        type text
                    ),
                    "Programme",
                    each null,
                    type text
                ),
                "Process",
                each null,
                type text
            ),
            "Customer Type",
            each null,
            type text
        ),
        "Supporting Docs",
        each null,
        type text
    ),
    
    AnnualFiltered = RemoveEmptyCriticalColumn(AnnualWithMissing, "Exception"),
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7: COMBINE ALL SOURCES INTO MASTER DATASET
    // ─────────────────────────────────────────────────────────────────────────
    
    CombinedAll = Table.Combine(
        {
            PostApprovalFiltered,
            RegistrationFiltered,
            EOIFiltered,
            GovPermFiltered,
            AnnualFiltered
        }
    ),
    
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 8: FINAL SCHEMA ORDERING AND CLEANUP
    // ─────────────────────────────────────────────────────────────────────────
    
    // Define canonical column order (metadata first, then business fields)
    CanonicalOrder = {
        "UniqueID",
        "SourceSheet",
        "ExcelRow",
        "Region",
        "Country",
        "Customer Type",
        "Programme",
        "Process",
        "Exception Type",
        "Exception",
        "Source",
        "Date",
        "Note",
        "Supporting Docs"
    },
    
    // Reorder columns to canonical schema
    FinalOrdered = Table.ReorderColumns(CombinedAll, CanonicalOrder),

    // ── ADD THIS ─────────────────────────────────────────────────────────────
    // Duplicate Country into CountryMemo for multiline Dataverse column
    // CountryMemo maps to cr557_countrymemo (Multiple Lines of Text)
    // This preserves the full untruncated text that cr557_country drops
    FinalWithMemo = Table.AddColumn(
        FinalOrdered,
        "CountryMemo",
        each [Country],
        type text
    ),
    
    // Type all columns as text for web app safety (avoids rendering issues with mixed types)
    // IMPORTANT: Dates are stringified to prevent frontend type confusion
    FinalTyped = Table.TransformColumnTypes(
        FinalWithMemo,
        List.Transform(Table.ColumnNames(FinalWithMemo), each {_, type text})
    )

in
    FinalTyped