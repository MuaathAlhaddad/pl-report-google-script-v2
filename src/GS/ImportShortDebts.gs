// Bulk-imports Short Debtors (the paper notebook debts) straight into the
// "Debts Snapshot" sheet the Employee PWA reads from, instead of typing
// each one into the app's one-at-a-time "Add debt" form. Menu-driven since
// this project is container-bound to the shared spreadsheet (unlike
// employee-debts-api, which is standalone and can't auto-add a menu here).
//
// HOW TO USE: Sheets menu -> "Debts Tools" -> "Import Short Debtors from
// notebook" once, to create the "Import Short Debtors" tab. Fill in Name +
// Amount (Phone/Due Date/Date Given/Notes optional) for each notebook
// entry, then run the same menu item again to move them into "Debts
// Snapshot" -- imported rows are cleared from the import tab afterward so
// running it again is always safe (nothing gets double-imported).
//
// Row shape mirrors addShortDebt() in employee-debts-api/src/Debts.gs
// EXACTLY (same 14 columns, same Client ID prefix, same opening Log
// entry) so these are indistinguishable in the app from debts an employee
// added by hand.

const IMPORT_SHORT_DEBTS_SHEET = "Import Short Debtors";
const IMPORT_SHORT_DEBTS_HEADERS = ["Name", "Amount", "Phone", "Due Date", "Date Given", "Notes", "Creditor"];

// Same columns as employee-debts-api/src/Daftra.gs's DEBTS_HEADERS --
// duplicated here (not shared code between the two separate Apps Script
// projects) rather than guessed, so a header mismatch fails loudly instead
// of silently misfiling columns.
const DEBTS_SNAPSHOT_SHEET = "Debts Snapshot";
const DEBTS_SNAPSHOT_HEADERS = [
    "Client",
    "Client ID",
    "Type",
    "Amount Owed",
    "Amount Paid",
    "Status",
    "Phone",
    "Due Date",
    "Date Given",
    "Last Follow Up",
    "Promise Count",
    "Log",
    "Snapshot Time",
    "Creditor",
];

// Same "Employees" sheet the app's PIN login reads (Name | PIN | Role |
// Active) -- used here only for the Creditor column's dropdown list, kept
// a fixed list per the owner's request (2026-08-25) rather than free text
// so tags stay consistent in the app's UI.
function getActiveEmployeeNames_() {
    const sheet = SpreadsheetApp.getActive().getSheetByName("Employees");
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    return sheet
        .getRange(2, 1, lastRow - 1, 4)
        .getValues()
        .filter((row) => row[0] && row[3] === true)
        .map((row) => String(row[0]));
}

// Applies (or refreshes) a dropdown on the Creditor column so entries stay
// consistent with the Employees roster instead of free text. Covers a
// generous range of rows below the header, not just currently-filled
// ones, so it's still there for whatever gets typed in next.
function applyCreditorDropdown_(importSheet) {
    const names = getActiveEmployeeNames_();
    if (!names.length) return;

    const creditorCol = IMPORT_SHORT_DEBTS_HEADERS.indexOf("Creditor") + 1;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(false).build();

    importSheet.getRange(2, creditorCol, 500, 1).setDataValidation(rule);
}

function onOpen(e) {
    SpreadsheetApp.getUi()
        .createMenu("Debts Tools")
        .addItem("Import Short Debtors from notebook", "importShortDebtsFromNotebook")
        .addItem("Today's Entry Summary", "showTodaysEntrySummary")
        .addToUi();
}

function importShortDebtsFromNotebook() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActive();

    let importSheet = ss.getSheetByName(IMPORT_SHORT_DEBTS_SHEET);

    if (!importSheet) {
        importSheet = ss.insertSheet(IMPORT_SHORT_DEBTS_SHEET);
        importSheet
            .getRange(1, 1, 1, IMPORT_SHORT_DEBTS_HEADERS.length)
            .setValues([IMPORT_SHORT_DEBTS_HEADERS])
            .setFontWeight("bold");
        importSheet.autoResizeColumns(1, IMPORT_SHORT_DEBTS_HEADERS.length);
        importSheet.setFrozenRows(1);

        applyCreditorDropdown_(importSheet);

        ui.alert(
            `Created the "${IMPORT_SHORT_DEBTS_SHEET}" tab. Fill in Name + Amount for each ` +
                "notebook debtor (Phone/Due Date/Date Given/Notes/Creditor are optional -- Creditor " +
                "is a dropdown of active employees), then run this same menu item again to import them.",
        );
        return;
    }

    // Re-applied on every run (not just at creation) so a newly-hired
    // employee shows up in the dropdown without needing to delete and
    // recreate the whole import tab.
    applyCreditorDropdown_(importSheet);

    const debtsSheet = ss.getSheetByName(DEBTS_SNAPSHOT_SHEET);
    if (!debtsSheet) {
        ui.alert(
            `Can't find the "${DEBTS_SNAPSHOT_SHEET}" tab yet -- open the Employee PWA and tap ` +
                '"Refresh from Daftra" once (edit-role account) to create it, then try importing again.',
        );
        return;
    }

    const currentHeaders = debtsSheet.getRange(1, 1, 1, DEBTS_SNAPSHOT_HEADERS.length).getValues()[0];
    if (JSON.stringify(currentHeaders) !== JSON.stringify(DEBTS_SNAPSHOT_HEADERS)) {
        ui.alert(
            `"${DEBTS_SNAPSHOT_SHEET}"'s columns don't match what this import expects -- stopping ` +
                "rather than risk writing into the wrong fields. Check employee-debts-api's DEBTS_HEADERS " +
                "still matches DEBTS_SNAPSHOT_HEADERS in ImportShortDebts.gs.",
        );
        return;
    }

    const lastRow = importSheet.getLastRow();
    if (lastRow <= 1) {
        ui.alert(`No rows to import -- add some to "${IMPORT_SHORT_DEBTS_SHEET}" first.`);
        return;
    }

    const rows = importSheet.getRange(2, 1, lastRow - 1, IMPORT_SHORT_DEBTS_HEADERS.length).getValues();
    const now = new Date();
    const today = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");

    const newDebtRows = [];
    let skipped = 0;

    rows.forEach((row) => {
        const [name, amount, phone, dueDate, dateGiven, notes, creditor] = row;
        const trimmedName = String(name || "").trim();
        const value = Number(amount) || 0;

        if (!trimmedName || value <= 0) {
            if (trimmedName || value) skipped++; // only count genuinely-filled-in-but-invalid rows
            return;
        }

        const clientId = "S-" + Utilities.getUuid();
        const given = String(dateGiven || "").trim() || today;
        const due = String(dueDate || "").trim();

        const openingNote =
            "Debt recorded" +
            (notes ? ` -- ${String(notes).trim()}` : "") +
            (due ? ` -- due ${due}` : "");

        const log = [
            {
                id: Utilities.getUuid(),
                date: today,
                time: now.toISOString(),
                actor: "Owner (notebook import)",
                note: openingNote,
            },
        ];

        newDebtRows.push([
            trimmedName,
            clientId,
            "Short",
            value,
            0,
            "active",
            String(phone || "").trim(),
            due,
            given,
            "",
            0,
            JSON.stringify(log),
            now,
            String(creditor || "").trim(),
        ]);
    });

    if (newDebtRows.length > 0) {
        debtsSheet
            .getRange(debtsSheet.getLastRow() + 1, 1, newDebtRows.length, DEBTS_SNAPSHOT_HEADERS.length)
            .setValues(newDebtRows);
    }

    // Clear only the rows just processed (not the header) so a fresh batch
    // can be typed in and imported again later without any leftovers.
    importSheet.getRange(2, 1, lastRow - 1, IMPORT_SHORT_DEBTS_HEADERS.length).clearContent();

    ui.alert(
        `Imported ${newDebtRows.length} short debtor(s) into "${DEBTS_SNAPSHOT_SHEET}".` +
            (skipped > 0 ? `\n\nSkipped ${skipped} row(s) with a missing name or amount.` : ""),
    );
}
