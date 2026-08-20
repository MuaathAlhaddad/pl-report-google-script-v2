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

// Any logged-in employee (view or edit) can see the list.
function getDebtsList(employeeName, employeePin) {
    authenticateEmployee(employeeName, employeePin);

    const sheet = getDebtsSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
        return { debts: [], total: 0, snapshotTime: "" };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, DEBTS_HEADERS.length).getValues();

    const debts = rows
        .filter((row) => row[1] !== "" && row[1] != null)
        .map((row) => ({
            clientId: row[1],
            clientName: row[0],
            amount: Number(row[2]) || 0,
            status: row[3] || CONFIG.DEBT_STATUSES[0],
            notes: row[4] || "",
            updatedBy: row[5] || "",
            updatedAt: formatDebtDateTime_(row[6]),
        }))
        .sort((a, b) => b.amount - a.amount);

    const total = debts.reduce((sum, d) => sum + d.amount, 0);
    const snapshotTime = rows.length ? formatDebtDateTime_(rows[0][7]) : "";

    return { debts, total, snapshotTime, statuses: CONFIG.DEBT_STATUSES };
}

// Edit-role employees only -- checked server-side.
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
                    .getRange(row, 4, 1, 3)
                    .setValues([[status, notes, employee.name]]);

                sheet.getRange(row, 7).setValue(new Date());

                return { success: true };
            }
        }
    }

    throw new Error(
        "That client isn't in the current debts snapshot -- try refreshing first.",
    );
}

// Edit-role employees only. Re-pulls live balances from Daftra -- can take
// a minute or two on an account with a lot of invoice history.
function refreshDebtsFromApp(employeeName, employeePin) {
    const employee = authenticateEmployee(employeeName, employeePin);

    if (employee.role !== "edit") {
        throw new Error("You have view-only access and can't refresh debts.");
    }

    return refreshDebtsSnapshot();
}
