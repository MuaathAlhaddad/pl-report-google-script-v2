const CONFIG = {
    SHEETS: {
        SALES: "Sales",
        EXPENSES: "Expenses",
        EXPENSE_SETUP: "ExpenseSetup",
        GOALS: "Goals",
    },

    // Turning a feature off hides its tab and makes its server functions
    // refuse to run (see assertFeatureEnabled_()). Its code stays in place,
    // so setting the flag back to true is all it takes to re-enable it.
    FEATURES: {
        BULK_INVOICE: false,
        BULK_PAYMENT: false,
    },

    PROFIT_MARGIN: 0.05,

    DAILY_EXPENSE: {
        NORMAL: 285,
        HEAVY: 335,
    },

    COLORS: {
        SUCCESS: "#2E7D32",
        WARNING: "#F9A825",
        DANGER: "#C62828",
        PRIMARY: "#1976D2",
    },
};

// Guards every client-callable entry point of a feature that can be turned
// off in CONFIG.FEATURES -- hiding the tab alone isn't enough, since
// google.script.run can still call any global function (e.g. from a page
// that was already open before the flag changed).
function assertFeatureEnabled_(feature, label) {
    if (!CONFIG.FEATURES[feature]) {
        throw new Error(label + " is currently disabled.");
    }
}
