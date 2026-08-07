const SUPPLIER_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_SUPPLIER_ITEMS = {
    Sun: ["الحلبي"],
    Mon: ["المطرفي"],
    Tue: [],
    Wed: ["عكاشة"],
    Thu: ["رهيب", "بلوبيرد", "الوسام"],
    Fri: ["النخبة"],
    Sat: ["صادق"],
};

function getSupplierCalendar() {
    const sheet = getOrCreateSuppliersSheet();
    const values = sheet.getDataRange().getValues();

    const byDay = {};
    SUPPLIER_DAYS.forEach((day) => (byDay[day] = []));

    for (let i = 1; i < values.length; i++) {
        const day = String(values[i][0]).trim();
        if (!byDay[day]) continue;

        byDay[day].push({
            row: i + 1,
            text: String(values[i][1] || "").trim(),
            done: values[i][2] === true,
        });
    }

    return SUPPLIER_DAYS.map((day) => ({ day, items: byDay[day] }));
}

function addSupplierItem(day, text) {
    text = String(text || "").trim();

    if (text) {
        const sheet = getOrCreateSuppliersSheet();
        sheet.appendRow([day, text, false]);
    }

    return getSupplierCalendar();
}

function toggleSupplierItem(row, done) {
    const sheet = getOrCreateSuppliersSheet();
    sheet.getRange(row, 3).setValue(!!done);
    return true;
}

function deleteSupplierItem(row) {
    const sheet = getOrCreateSuppliersSheet();
    sheet.deleteRow(row);
    return getSupplierCalendar();
}

function getOrCreateSuppliersSheet() {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.SUPPLIERS);

    if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.SUPPLIERS);
        sheet.appendRow(["Day", "Note", "Done"]);

        SUPPLIER_DAYS.forEach((day) => {
            (DEFAULT_SUPPLIER_ITEMS[day] || []).forEach((text) => {
                sheet.appendRow([day, text, false]);
            });
        });
    }

    return sheet;
}
