// Persistent log of what the Bulk Invoice / Bulk Payment tools actually
// created in Daftra -- both tools' results only ever showed on-screen
// once, then were gone, leaving nothing for the manager to check back
// against at day's end (owner's request, 2026-08-27: "review data entry
// clerk work in Daftra system"). This covers the portion of data entry
// that goes through these two tools -- it doesn't reconcile against the
// paper notebook or the WhatsApp "products received" photos, which would
// need a separate, much bigger effort (OCR or manual digitization).

const DAILY_ENTRY_LOG_SHEET = "Daily Entry Log";
const DAILY_ENTRY_LOG_HEADERS = ["Date", "Time", "Type", "Client", "Amount", "Status", "Reference"];

function logDailyEntry_(type, clientName, amount, success, reference) {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(DAILY_ENTRY_LOG_SHEET);

    if (!sheet) {
        sheet = ss.insertSheet(DAILY_ENTRY_LOG_SHEET);
        sheet
            .getRange(1, 1, 1, DAILY_ENTRY_LOG_HEADERS.length)
            .setValues([DAILY_ENTRY_LOG_HEADERS])
            .setFontWeight("bold");
        sheet.setFrozenRows(1);
    }

    const now = new Date();
    sheet.appendRow([
        Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd"),
        Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss"),
        type,
        clientName,
        amount,
        success ? "OK" : "FAILED",
        reference || "",
    ]);
}

// "Debts Tools" menu item -- filters the log to today and gives the
// manager an at-a-glance check on what actually got into Daftra today,
// without cross-referencing Daftra by hand.
function showTodaysEntrySummary() {
    const ui = SpreadsheetApp.getUi();
    const sheet = SpreadsheetApp.getActive().getSheetByName(DAILY_ENTRY_LOG_SHEET);

    if (!sheet || sheet.getLastRow() <= 1) {
        ui.alert("No entries logged yet -- run a Bulk Invoice or Bulk Payment batch first.");
        return;
    }

    const lastRow = sheet.getLastRow();
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    const rows = sheet.getRange(2, 1, lastRow - 1, DAILY_ENTRY_LOG_HEADERS.length).getValues();
    const todaysRows = rows.filter((row) => {
        const rowDate = row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(row[0]);
        return rowDate === today;
    });

    if (todaysRows.length === 0) {
        ui.alert("No entries logged today yet.");
        return;
    }

    const invoices = todaysRows.filter((r) => r[2] === "Invoice");
    const payments = todaysRows.filter((r) => r[2] === "Payment");
    const failed = todaysRows.filter((r) => r[5] === "FAILED");

    const sumOk = (rowSet) => rowSet.filter((r) => r[5] !== "FAILED").reduce((sum, r) => sum + (Number(r[4]) || 0), 0);

    let message =
        `Invoices created: ${invoices.length} (total ${sumOk(invoices).toLocaleString()})\n` +
        `Payments recorded: ${payments.length} (total ${sumOk(payments).toLocaleString()})\n`;

    message += failed.length > 0
        ? `\n⚠️ ${failed.length} failed:\n` + failed.map((r) => `- ${r[3]}: ${r[6]}`).join("\n")
        : "\nNo failures today.";

    ui.alert("Today's Entry Summary", message, ui.ButtonSet.OK);
}
