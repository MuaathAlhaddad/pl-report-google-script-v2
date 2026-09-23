function getExpenseSetup() {
    const sheet = SpreadsheetApp.getActive().getSheetByName("ExpenseSetup");

    const values = sheet.getDataRange().getValues();

    // Optional "Hint" column, found by header so it can sit anywhere after
    // the Category / Subcategory / Account columns.
    const hintCol = values[0].findIndex(
        (h) => String(h).trim().toLowerCase() == "hint",
    );

    const categories = {};

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

        if (account == "") {
            if (
                !categories[category].general.some((g) => g.name == subcategory)
            )
                categories[category].general.push({ name: subcategory, hint });
        } else {
            if (!categories[category].sections[subcategory])
                categories[category].sections[subcategory] = [];

            categories[category].sections[subcategory].push({
                name: account,
                hint,
            });
        }
    }

    return Object.values(categories).map((c) => ({
        title: c.title,

        general: c.general,

        sections: Object.keys(c.sections).map((name) => ({
            title: name,

            accounts: c.sections[name],
        })),
    }));
}
