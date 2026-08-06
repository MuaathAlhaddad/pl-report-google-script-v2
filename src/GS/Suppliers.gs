const SUPPLIER_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getSupplierCalendar() {
    const sheet = getOrCreateSuppliersSheet();
    const values = sheet.getDataRange().getValues();

    const map = {};
    for (let i = 1; i < values.length; i++) {
        map[String(values[i][0]).trim()] = String(values[i][1] || "").trim();
    }

    return SUPPLIER_DAYS.map((day) => ({ day, notes: map[day] || "" }));
}

function saveSupplierNote(day, notes) {
    const sheet = getOrCreateSuppliersSheet();
    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]).trim() === day) {
            sheet.getRange(i + 1, 2).setValue(notes);
            return true;
        }
    }

    sheet.appendRow([day, notes]);
    return true;
}

function getOrCreateSuppliersSheet() {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.SUPPLIERS);

    if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.SUPPLIERS);
        sheet.appendRow(["Day", "Notes"]);

        [
            ["Sun", "الحلبي"],
            ["Mon", "المطرفي"],
            ["Tue", ""],
            ["Wed", "عكاشة"],
            ["Thu", "رهيب + بلوبيرد + الوسام"],
            ["Fri", "النخبة"],
            ["Sat", "صادق"],
        ].forEach((row) => sheet.appendRow(row));
    }

    return sheet;
}