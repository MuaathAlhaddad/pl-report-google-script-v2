function getExpenseSetup() {
    const sheet = SpreadsheetApp.getActive().getSheetByName("ExpenseSetup");

    const values = sheet.getDataRange().getValues();

    const categories = {};

    for (let i = 1; i < values.length; i++) {
        const category = String(values[i][0]).trim();

        const subcategory = String(values[i][1]).trim();

        const account = String(values[i][2] || "").trim();

        if (!categories[category]) {
            categories[category] = {
                title: category,

                general: [],

                sections: {},
            };
        }

        if (account == "") {
            if (!categories[category].general.includes(subcategory))
                categories[category].general.push(subcategory);
        } else {
            if (!categories[category].sections[subcategory])
                categories[category].sections[subcategory] = [];

            categories[category].sections[subcategory].push(account);
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
