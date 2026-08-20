const CONFIG = {
    SHEETS: {
        SALES: "Sales",
        EXPENSES: "Expenses",
        EXPENSE_SETUP: "ExpenseSetup",
        GOALS: "Goals",
        SUPPLIERS: "Suppliers",
        EMPLOYEES: "Employees",
        DEBTS: "Debts Snapshot",
    },

    // Options an employee can set on a debt while following up. Kept short
    // and on-purpose -- this isn't meant to be a full CRM, just enough to
    // answer "has anyone chased this one yet?" at a glance.
    DEBT_STATUSES: [
        "Not Contacted",
        "Contacted",
        "Promised to Pay",
        "Overdue",
        "Disputed",
    ],

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
