// ============================================================
// Employee accounts for the Debts page.
//
// Your team signs in with personal Gmail accounts (not a shared Google
// Workspace domain), so Apps Script can't reliably detect who's using the
// app the way it can on a company domain. Instead each employee picks
// their name from a list and enters a short PIN once; the app remembers
// them on that device afterwards (stored in the browser only, not tied to
// their Google login).
//
// ONE-TIME SETUP: an "Employees" sheet is created automatically the first
// time anyone opens the Debts page. Open it and add one row per employee:
//   Name | PIN | Role | Active
// Role must be exactly "edit" or "view". Active must be TRUE for them to
// be able to log in. A starter "Owner" row with PIN 0000 is added for
// you -- change that PIN before handing phones to employees.
//
// This is a lightweight PIN check for an internal team tool, not a real
// authentication system -- anyone with edit access to this Google Sheet
// can already see every PIN in plain text. Don't reuse a PIN that
// protects anything else.
// ============================================================

// Hands back the Debts page's markup/styles/logic for the client to inject
// on first visit -- see JS/debts.js's header comment for why this isn't
// just baked into the initial page like every other tab. No PIN check here:
// this is generic app code, identical for anyone, same as the rest of the
// page's HTML/CSS/JS that's already sent to every visitor regardless of
// whether they ever log in. Actual debt DATA still goes through
// authenticateEmployee() in every other function in this file.
function getDebtsBundle() {
    return {
        html: include("debts.html"),
        css: include("debts.css"),
        js: include("debts-script.html"),
    };
}

function getEmployeesSheet_() {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);

    if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.EMPLOYEES);

        sheet
            .getRange(1, 1, 1, 4)
            .setValues([["Name", "PIN", "Role", "Active"]])
            .setFontWeight("bold");

        sheet.getRange(2, 1, 1, 4).setValues([["Owner", "0000", "edit", true]]);

        sheet.autoResizeColumns(1, 4);
        sheet.setFrozenRows(1);
    }

    return sheet;
}

function getEmployeeRows_() {
    const sheet = getEmployeesSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) return [];

    return sheet.getRange(2, 1, lastRow - 1, 4).getValues();
}

// Public list of active employee names for the login screen's picker --
// PINs are never sent to the browser.
function getEmployeeNames() {
    return getEmployeeRows_()
        .filter((row) => row[0] && row[3] === true)
        .map((row) => ({ name: String(row[0]) }));
}

// Throws if the name/PIN combination doesn't match an active employee.
// Returns { name, role } on success.
function authenticateEmployee(name, pin) {
    const rows = getEmployeeRows_();

    for (const row of rows) {
        const [rowName, rowPin, rowRole, active] = row;

        if (
            active === true &&
            String(rowName).trim() === String(name || "").trim() &&
            String(rowPin).trim() === String(pin || "").trim()
        ) {
            return {
                name: String(rowName).trim(),
                role: rowRole === "edit" ? "edit" : "view",
            };
        }
    }

    throw new Error("Name or PIN not recognized -- check with the shop owner.");
}

function requireEditAccess_(employeeName, employeePin) {
    const employee = authenticateEmployee(employeeName, employeePin);

    if (employee.role !== "edit") {
        throw new Error("You have view-only access and can't make changes.");
    }

    return employee;
}

// ============================================================
// Debts list -- reads/writes the "Debts Snapshot" sheet that
// refreshDebtsSnapshot() (in Daftra.gs) populates with live Daftra
// balances. Every call here re-checks the employee's PIN server-side, so
// a view-only employee can't just edit the page's JS to save changes.
//
// Column layout is DEBTS_HEADERS in Daftra.gs -- see that file's header
// comment for what "Long" vs "Short" rows mean and which fields survive a
// Daftra refresh.
// ============================================================

function getDebtsSheet_() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.DEBTS);

    if (!sheet) {
        throw new Error(
            'No debts snapshot yet. Ask the shop owner to run "refreshDebtsSnapshot" once from the Apps Script editor.',
        );
    }

    return sheet;
}

function todayStr_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function formatDebtDateTime_(value) {
    if (!value) return "";

    return Utilities.formatDate(
        new Date(value),
        Session.getScriptTimeZone(),
        "dd/MM/yyyy HH:mm",
    );
}

// Due Date / Date Given / Last Follow Up are written as plain "yyyy-MM-dd"
// strings, but Sheets sometimes auto-converts a recognizable date string
// into a real Date cell depending on locale -- normalize either shape back
// to a plain string so round-tripping is predictable.
function normalizeDebtDate_(value) {
    if (!value) return "";
    if (value instanceof Date) {
        return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    return String(value);
}

function rowToDebt_(row) {
    return {
        clientName: row[0],
        // Always a string -- Daftra client IDs come back as numbers from
        // Sheets, but the frontend compares clientId against onclick
        // handler arguments (always strings), so this keeps that consistent.
        clientId: String(row[1]),
        type: row[2] || "Long",
        amount: Number(row[3]) || 0,
        amountPaid: Number(row[4]) || 0,
        status: row[5] || CONFIG.DEBT_STATUS.ACTIVE,
        phone: row[6] || "",
        dueDate: normalizeDebtDate_(row[7]),
        dateGiven: normalizeDebtDate_(row[8]),
        lastFollowUp: normalizeDebtDate_(row[9]),
        promiseCount: Number(row[10]) || 0,
        log: parseDebtLog_(row[11]),
    };
}

// Any logged-in employee (view or edit) can see the list. Splits into
// "long" (Daftra) and "short" (hand-entered notebook) debts -- see the
// header comment in Daftra.gs for what distinguishes them. Includes
// paid/dead debts too (the page's tabs need them) -- only the outstanding
// total excludes anything not "active".
function getDebtsList(employeeName, employeePin) {
    authenticateEmployee(employeeName, employeePin);

    const sheet = getDebtsSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
        return { long: [], short: [], total: 0, todayStr: todayStr_(), snapshotTime: "" };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, DEBTS_HEADERS.length).getValues();

    const debts = rows
        .filter((row) => row[1] !== "" && row[1] != null)
        .map(rowToDebt_);

    const long = debts.filter((d) => d.type !== "Short").sort((a, b) => b.amount - a.amount);
    const short = debts.filter((d) => d.type === "Short").sort((a, b) => b.amount - a.amount);

    const outstanding = (d) => (d.status === CONFIG.DEBT_STATUS.ACTIVE ? d.amount - d.amountPaid : 0);
    const total = debts.reduce((sum, d) => sum + outstanding(d), 0);

    const snapshotTime = rows.length ? formatDebtDateTime_(rows[0][12]) : "";

    return { long, short, total, todayStr: todayStr_(), snapshotTime };
}

function findDebtRow_(sheet, clientId) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();

    for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(clientId)) return 2 + i;
    }

    return null;
}

function loadDebtRow_(sheet, clientId) {
    const row = findDebtRow_(sheet, clientId);

    if (!row) {
        throw new Error("That client isn't in the current debts snapshot -- try refreshing first.");
    }

    return { row, values: sheet.getRange(row, 1, 1, DEBTS_HEADERS.length).getValues()[0] };
}

function appendDebtLogEntry_(sheet, row, values, actor, note) {
    const log = parseDebtLog_(values[11]);

    log.push({
        id: Utilities.getUuid(),
        date: todayStr_(),
        time: new Date().toISOString(),
        actor,
        note,
    });

    sheet.getRange(row, 10).setValue(todayStr_()); // Last Follow Up
    sheet.getRange(row, 12).setValue(JSON.stringify(log)); // Log
}

// Logs a plain follow-up note ("chased today") without changing amount,
// status, or due date. Edit-role only.
function addDebtFollowUp(employeeName, employeePin, clientId, note) {
    const employee = requireEditAccess_(employeeName, employeePin);
    const sheet = getDebtsSheet_();
    const { row, values } = loadDebtRow_(sheet, clientId);

    appendDebtLogEntry_(sheet, row, values, employee.name, (note || "").trim() || "Followed up");

    return { success: true };
}

// Records a full or partial payment. Caps the amount at what's actually
// still owed, and auto-marks the debt "paid" once nothing's left. Works
// for both Long and Short debts -- for Long debts this is on top of
// whatever Daftra later reports once the real payment is entered there too.
function recordDebtPayment(employeeName, employeePin, clientId, amount) {
    const employee = requireEditAccess_(employeeName, employeePin);
    const amt = Number(amount);

    if (!amt || amt <= 0) {
        throw new Error("Enter an amount greater than zero.");
    }

    const sheet = getDebtsSheet_();
    const { row, values } = loadDebtRow_(sheet, clientId);

    const owed = Number(values[3]) || 0;
    const paidSoFar = Number(values[4]) || 0;
    const remaining = owed - paidSoFar;
    const applied = Math.min(amt, remaining);
    const newPaid = paidSoFar + applied;
    const newRemaining = owed - newPaid;

    sheet.getRange(row, 5).setValue(newPaid); // Amount Paid

    let note = `Payment received: ${applied} (remaining ${newRemaining})`;

    if (newRemaining <= 0) {
        sheet.getRange(row, 6).setValue(CONFIG.DEBT_STATUS.PAID); // Status
        note += " -- fully paid";
    }

    appendDebtLogEntry_(sheet, row, values, employee.name, note);

    return { success: true };
}

// Pushes the due date out and records it as a "promise" -- edit-role only.
function rescheduleDebtDueDate(employeeName, employeePin, clientId, newDueDate) {
    const employee = requireEditAccess_(employeeName, employeePin);
    const nextDate = String(newDueDate || "").trim();

    if (!nextDate) {
        throw new Error("Pick a new due date.");
    }

    const sheet = getDebtsSheet_();
    const { row, values } = loadDebtRow_(sheet, clientId);

    const oldDate = normalizeDebtDate_(values[7]) || "no date set";
    const promiseCount = (Number(values[10]) || 0) + 1;

    sheet.getRange(row, 8).setValue(nextDate); // Due Date
    sheet.getRange(row, 11).setValue(promiseCount); // Promise Count

    appendDebtLogEntry_(
        sheet,
        row,
        values,
        employee.name,
        `Promised new date: ${nextDate} (was ${oldDate})`,
    );

    return { success: true };
}

// Marks a debt fully paid, writes it off as dead debt, or reopens either
// one back to active. Edit-role only.
function setDebtStatus(employeeName, employeePin, clientId, status) {
    const employee = requireEditAccess_(employeeName, employeePin);
    const valid = [CONFIG.DEBT_STATUS.ACTIVE, CONFIG.DEBT_STATUS.PAID, CONFIG.DEBT_STATUS.DEAD];

    if (valid.indexOf(status) === -1) {
        throw new Error("Unknown debt status.");
    }

    const sheet = getDebtsSheet_();
    const { row, values } = loadDebtRow_(sheet, clientId);

    sheet.getRange(row, 6).setValue(status); // Status

    if (status === CONFIG.DEBT_STATUS.PAID) {
        sheet.getRange(row, 5).setValue(Number(values[3]) || 0); // Amount Paid = Amount Owed
    }

    const note =
        status === CONFIG.DEBT_STATUS.PAID
            ? "Marked fully paid"
            : status === CONFIG.DEBT_STATUS.DEAD
              ? "Written off as dead debt"
              : "Reopened";

    appendDebtLogEntry_(sheet, row, values, employee.name, note);

    return { success: true };
}

// Manually records a debt from the separate notebook that never becomes a
// Daftra invoice -- edit-role only. Unlike long debts, this is the ONLY
// way these rows get created or changed; refreshDebtsSnapshot() never
// touches them.
function addShortDebt(employeeName, employeePin, debtorName, amount, phone, dueDate, dateGiven, notes) {
    const employee = requireEditAccess_(employeeName, employeePin);

    const name = String(debtorName || "").trim();
    const value = Number(amount) || 0;

    if (!name) {
        throw new Error("Enter who owes this money.");
    }

    if (value <= 0) {
        throw new Error("Enter an amount greater than zero.");
    }

    const sheet = getDebtsSheet_();
    const now = new Date();
    const today = todayStr_();
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
            actor: employee.name,
            note: openingNote,
        },
    ];

    sheet.appendRow([
        name,
        clientId,
        "Short",
        value,
        0,
        CONFIG.DEBT_STATUS.ACTIVE,
        String(phone || "").trim(),
        due,
        given,
        "",
        0,
        JSON.stringify(log),
        now,
    ]);

    return { success: true, clientId };
}

// Edit-role employees only. Re-pulls live balances from Daftra -- can take
// a minute or two on an account with a lot of invoice history. Never
// touches short (manually entered) debts.
function refreshDebtsFromApp(employeeName, employeePin) {
    requireEditAccess_(employeeName, employeePin);

    return refreshDebtsSnapshot();
}

// ============================================================
// Owner-style review checklist -- lets whoever's checking up on the team
// tick off which follow-up log entries they've already seen, without
// deleting or hiding them. Available to any edit-role employee for now;
// a true owner-only tier can come later alongside a fuller employee roster.
// ============================================================

function getDebtsReviewSheet_() {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.DEBTS_REVIEW);

    if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.DEBTS_REVIEW);
        sheet
            .getRange(1, 1, 1, 3)
            .setValues([["Entry ID", "Reviewed By", "Reviewed At"]])
            .setFontWeight("bold");
        sheet.setFrozenRows(1);
    }

    return sheet;
}

// Returns { entryId: { by, at } } for every log entry marked reviewed.
function getDebtsReviewLog(employeeName, employeePin) {
    authenticateEmployee(employeeName, employeePin);

    const sheet = getDebtsReviewSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) return {};

    const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const result = {};

    rows.forEach((row) => {
        if (!row[0]) return;
        result[row[0]] = { by: row[1], at: formatDebtDateTime_(row[2]) };
    });

    return result;
}

// Toggles one log entry's reviewed state. Edit-role only.
function toggleDebtReviewEntry(employeeName, employeePin, entryId) {
    const employee = requireEditAccess_(employeeName, employeePin);
    const sheet = getDebtsReviewSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow > 1) {
        const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

        for (let i = 0; i < ids.length; i++) {
            if (String(ids[i][0]) === String(entryId)) {
                sheet.deleteRow(2 + i);
                return { reviewed: false };
            }
        }
    }

    sheet.appendRow([entryId, employee.name, new Date()]);
    return { reviewed: true };
}
