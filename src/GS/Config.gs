const CONFIG = {
    SHEETS: {
        SALES: "Sales",
        EXPENSES: "Expenses",
        EXPENSE_SETUP: "ExpenseSetup",
        GOALS: "Goals",
        SUPPLIERS: "Suppliers",
        EMPLOYEES: "Employees",
        DEBTS: "Debts Snapshot",
        DEBTS_REVIEW: "Debts Review Log",
    },

    // A debt is either being actively chased, fully paid, or written off as
    // uncollectable ("dead"). "Has anyone chased this one" is answered by
    // Last Follow Up + the activity log, not a bigger status list.
    DEBT_STATUS: {
        ACTIVE: "active",
        PAID: "paid",
        DEAD: "dead",
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
