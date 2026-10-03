function getExpenseSetup() {
    return readExpenseSetup_().setup;
}

// Reads the ExpenseSetup sheet exactly once and returns both the wizard
// setup (active lines only) and a lookup of Inactive lines, so callers that
// need both (getExpenseWizard, saveExpenses) don't re-read the sheet.
function readExpenseSetup_() {
    const sheet = SpreadsheetApp.getActive().getSheetByName("ExpenseSetup");

    const values = sheet.getDataRange().getValues();

    // Optional "Hint" column, found by header so it can sit anywhere after
    // the Category / Subcategory / Account columns.
    const hintCol = values[0].findIndex(
        (h) => String(h).trim().toLowerCase() == "hint",
    );

    // Optional "Status" column (Active / Inactive), found by header the same
    // way. A line marked Inactive stays in the sheet but is left out of the
    // wizard and refused by saveExpenses; anything else (incl. blank) counts
    // as Active.
    const statusCol = values[0].findIndex(
        (h) => String(h).trim().toLowerCase() == "status",
    );

    const categories = {};

    const inactive = {};

    for (let i = 1; i < values.length; i++) {
        const category = String(values[i][0]).trim();

        const subcategory = String(values[i][1]).trim();

        const account = String(values[i][2] || "").trim();

        const hint =
            hintCol >= 0 ? String(values[i][hintCol] || "").trim() : "";

        if (!categories[category]) {
            categories[category] = {
                title: category,

                general: [],

                sections: {},
            };
        }

        if (account != "" && !categories[category].sections[subcategory])
            categories[category].sections[subcategory] = [];

        if (
            statusCol >= 0 &&
            String(values[i][statusCol]).trim().toLowerCase() == "inactive"
        ) {
            inactive[expenseLineKey_(category, subcategory, account)] = true;
            continue;
        }

        if (account == "") {
            if (
                !categories[category].general.some((g) => g.name == subcategory)
            )
                categories[category].general.push({ name: subcategory, hint });
        } else {
            categories[category].sections[subcategory].push({
                name: account,
                hint,
            });
        }
    }

    return {
        setup: Object.values(categories).map((c) => ({
            title: c.title,

            general: c.general,

            sections: Object.keys(c.sections).map((name) => ({
                title: name,

                accounts: c.sections[name],
            })),
        })),

        inactive,
    };
}

function isExpenseLineInactive_(inactive, category, subcategory, account) {
    return !!inactive[expenseLineKey_(category, subcategory, account)];
}

function expenseLineKey_(category, subcategory, account) {
    return [category, subcategory, account || ""]
        .map((v) => String(v).trim())
        .join("\u0001");
}
