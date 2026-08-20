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

// ============================================================
// Debts list -- reads/writes the "Debts Snapshot" sheet that
// refreshDebtsSnapshot() (in Daftra.gs) populates with live Daftra
// balances. Every call here re-checks the employee's PIN server-side, so
// a view-only employee can't just edit the page's JS to save changes.
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

function formatDebtDateTime_(value) {
    if (!value) return "";

    return Utilities.formatDate(
        new Date(value),
        Session.getScriptTimeZone(),
        "dd/MM/yyyy HH:mm",
    );
}

function rowToDebt_(row) {
    return {
        clientName: row[0],
        clientId: row[1],
        type: row[2] || "Long",
        amount: Number(row[3]) || 0,
        status: row[4] || CONFIG.DEBT_STATUSES[0],
        notes: row[5] || "",
        updatedBy: row[6] || "",
        updatedAt: formatDebtDateTime_(row[7]),
    };
}

// Any logged-in employee (view or edit) can see the list. Splits into
// "long" (Daftra) and "short" (hand-entered notebook) debts -- see the
// header comment in Daftra.gs for what distinguishes them. Debts marked
// "Paid" are resolved and drop out of the active list (the row stays in
// the sheet as a record, it just isn't shown or counted here).
function getDebtsList(employeeName, employeePin) {
    authenticateEmployee(employeeName, employeePin);

    const sheet = getDebtsSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
        return { long: [], short: [], total: 0, snapshotTime: "", statuses: CONFIG.DEBT_STATUSES };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, DEBTS_HEADERS.length).getValues();

    const debts = rows
        .filter((row) => row[1] !== "" && row[1] != null)
        .map(rowToDebt_)
        .filter((d) => d.status !== "Paid");

    const long = debts.filter((d) => d.type !== "Short").sort((a, b) => b.amount - a.amount);
    const short = debts.filter((d) => d.type === "Short").sort((a, b) => b.amount - a.amount);

    const total =
        long.reduce((sum, d) => sum + d.amount, 0) +
        short.reduce((sum, d) => sum + d.amount, 0);

    const snapshotTime = rows.length ? formatDebtDateTime_(rows[0][8]) : "";

    return { long, short, total, snapshotTime, statuses: CONFIG.DEBT_STATUSES };
}

// Edit-role employees only -- checked server-side. Works for both long and
// short debts -- it just finds the row by Client ID.
function saveDebtNote(employeeName, employeePin, clientId, status, notes) {
    const employee = authenticateEmployee(employeeName, employeePin);

    if (employee.role !== "edit") {
        throw new Error("You have view-only access and can't edit debts.");
    }

    const sheet = getDebtsSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow > 1) {
        const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();

        for (let i = 0; i < ids.length; i++) {
            if (String(ids[i][0]) === String(clientId)) {
                const row = i + 2;

                sheet
                    .getRange(row, 5, 1, 3)
                    .setValues([[status, notes, employee.name]]);

                sheet.getRange(row, 8).setValue(new Date());

                return { success: true };
            }
        }
    }

    throw new Error(
        "That client isn't in the current debts snapshot -- try refreshing first.",
    );
}

// Edit-role employees only. Re-pulls live balances from Daftra -- can take
// a minute or two on an account with a lot of invoice history. Never
// touches short (manually entered) debts.
function refreshDebtsFromApp(employeeName, employeePin) {
    const employee = authenticateEmployee(employeeName, employeePin);

    if (employee.role !== "edit") {
        throw new Error("You have view-only access and can't refresh debts.");
    }

    return refreshDebtsSnapshot();
}

// Manually records a debt from the separate notebook that never becomes a
// Daftra invoice -- edit-role only. Unlike long debts, this is the ONLY
// way these rows get created or changed; refreshDebtsSnapshot() never
// touches them.
function addShortDebt(employeeName, employeePin, debtorName, amount, notes) {
    const employee = authenticateEmployee(employeeName, employeePin);

    if (employee.role !== "edit") {
        throw new Error("You have view-only access and can't add debts.");
    }

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
    const clientId = "S-" + Utilities.getUuid();

    sheet.appendRow([
        name,
        clientId,
        "Short",
        value,
        CONFIG.DEBT_STATUSES[0],
        notes || "",
        employee.name,
        now,
        now,
    ]);

    return { success: true, clientId };
}
