// ============================================================
// Debts page -- lets employees (signed in with a name + PIN, since the
// team is on personal Gmail rather than a shared Workspace domain) see
// who currently owes money and log follow-up status/notes. The numbers
// themselves come from Daftra via the "Debts Snapshot" sheet
// (refreshDebtsSnapshot() in Daftra.gs); this file just renders/edits
// that sheet through the server functions in Debts.gs.
//
// The logged-in employee's name + PIN are kept in this browser's
// localStorage so they don't have to log in every visit -- see the note
// in Debts.gs about why that's an acceptable tradeoff for an internal
// tool, not something to reuse for anything sensitive.
// ============================================================

const DEBTS = {
    employee: null,
    data: null,
};

const DEBTS_STORAGE_KEY = "shopDebtsEmployee";

function loadDebtsPage() {
    const saved = localStorage.getItem(DEBTS_STORAGE_KEY);

    if (saved) {
        try {
            DEBTS.employee = JSON.parse(saved);
        } catch (e) {
            DEBTS.employee = null;
        }
    }

    if (DEBTS.employee) {
        showDebtsMain();
    } else {
        showDebtsLogin();
    }
}

function showDebtsLogin() {
    document.getElementById("debtsLogin").style.display = "block";
    document.getElementById("debtsMain").style.display = "none";

    const errorBox = document.getElementById("debtsLoginError");
    errorBox.style.display = "none";
    document.getElementById("debtsLoginPin").value = "";

    showLoading();

    gsRun("getEmployeeNames")
        .then(function (names) {
            hideLoading();

            const select = document.getElementById("debtsLoginName");
            select.innerHTML = names
                .map(
                    (e) =>
                        `<option value="${escapeAttr(e.name)}">${escapeHtml(e.name)}</option>`,
                )
                .join("");
        })
        .catch(function (err) {
            hideLoading();
            showError(err);
        });
}

function debtsLogin() {
    const name = document.getElementById("debtsLoginName").value;
    const pin = document.getElementById("debtsLoginPin").value;
    const errorBox = document.getElementById("debtsLoginError");

    errorBox.style.display = "none";
    showLoading();

    gsRun("authenticateEmployee", name, pin)
        .then(function (employee) {
            hideLoading();

            DEBTS.employee = { name: employee.name, pin: pin, role: employee.role };
            localStorage.setItem(DEBTS_STORAGE_KEY, JSON.stringify(DEBTS.employee));

            showDebtsMain();
        })
        .catch(function (err) {
            hideLoading();
            errorBox.textContent = err.message || err;
            errorBox.style.display = "block";
        });
}

function debtsLogout() {
    localStorage.removeItem(DEBTS_STORAGE_KEY);
    DEBTS.employee = null;
    DEBTS.data = null;
    showDebtsLogin();
}

function showDebtsMain() {
    document.getElementById("debtsLogin").style.display = "none";
    document.getElementById("debtsMain").style.display = "block";
    document.getElementById("debtsWhoAmI").textContent = DEBTS.employee.name;

    document.getElementById("debtsRefreshButton").style.display =
        DEBTS.employee.role === "edit" ? "inline-block" : "none";

    fetchDebts();
}

function fetchDebts() {
    showLoading();

    gsRun("getDebtsList", DEBTS.employee.name, DEBTS.employee.pin)
        .then(function (data) {
            hideLoading();
            DEBTS.data = data;

            document.getElementById("debtsSnapshotTime").textContent =
                data.snapshotTime ? "Updated " + data.snapshotTime : "";

            document.getElementById("debtsTotal").textContent = money(data.total);
            document.getElementById("debtsCount").textContent = data.debts.length;

            renderDebts();
        })
        .catch(function (err) {
            hideLoading();

            // A removed/changed PIN shows up here as an auth error -- bounce
            // back to the login screen instead of a dead-end error alert.
            if (String(err.message || err).indexOf("Name or PIN not recognized") !== -1) {
                debtsLogout();
                return;
            }

            showError(err);
        });
}

function refreshDebts() {
    showLoading();

    gsRun("refreshDebtsFromApp", DEBTS.employee.name, DEBTS.employee.pin)
        .then(function () {
            fetchDebts();
        })
        .catch(function (err) {
            hideLoading();
            showError(err);
        });
}

function renderDebts() {
    if (!DEBTS.data) return;

    const search = document.getElementById("debtsSearch").value.trim().toLowerCase();

    const debts = DEBTS.data.debts.filter((d) =>
        d.clientName.toLowerCase().includes(search),
    );

    const list = document.getElementById("debtsList");
    const empty = document.getElementById("debtsEmpty");

    if (debts.length === 0) {
        list.innerHTML = "";
        empty.style.display = "block";
        return;
    }

    empty.style.display = "none";

    const canEdit = DEBTS.employee.role === "edit";
    const statuses = DEBTS.data.statuses || [];

    list.innerHTML = debts.map((d) => debtRowHtml(d, canEdit, statuses)).join("");
}

function debtRowHtml(d, canEdit, statuses) {
    const statusOptions = statuses
        .map(
            (s) =>
                `<option value="${escapeAttr(s)}" ${s === d.status ? "selected" : ""}>${escapeHtml(s)}</option>`,
        )
        .join("");

    const meta = d.updatedBy
        ? `${escapeHtml(d.updatedBy)} · ${escapeHtml(d.updatedAt)}`
        : "Not yet followed up";

    const editControls = canEdit
        ? `
        <div class="accRow" style="flex-direction: column; align-items: stretch; gap: 6px">
            <label style="margin: 0">Status</label>
            <select id="debtStatus-${d.clientId}">${statusOptions}</select>
        </div>
        <div class="accRow" style="flex-direction: column; align-items: stretch; gap: 6px">
            <label style="margin: 0">Notes</label>
            <textarea id="debtNotes-${d.clientId}" rows="2" style="width: 100%; box-sizing: border-box; font-family: inherit; padding: 8px">${escapeHtml(d.notes)}</textarea>
        </div>
        <button type="button" class="saveButton" onclick="saveDebt('${d.clientId}')">
            💾 Save
        </button>
        `
        : `
        <div class="accRow"><span>Status</span><span>${escapeHtml(d.status)}</span></div>
        <div class="accRow"><span>Notes</span><span>${d.notes ? escapeHtml(d.notes) : "—"}</span></div>
        `;

    return `
        <div class="accItem">
            <div class="accHeader" onclick="toggleDebtRow(this)">
                <span class="accChevron">▶</span>
                <span class="accTitle">${escapeHtml(d.clientName)}</span>
                <span class="accTotal">${money(d.amount)}</span>
            </div>
            <div class="accBody" style="display: none">
                <div class="accRow"><span>Last Updated</span><span>${meta}</span></div>
                ${editControls}
            </div>
        </div>
    `;
}

function toggleDebtRow(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector(".accChevron");
    const isOpen = body.style.display !== "none";

    body.style.display = isOpen ? "none" : "block";
    chevron.style.transform = isOpen ? "rotate(90deg)" : "rotate(0deg)";
}

function saveDebt(clientId) {
    const status = document.getElementById(`debtStatus-${clientId}`).value;
    const notes = document.getElementById(`debtNotes-${clientId}`).value;

    showLoading();

    gsRun(
        "saveDebtNote",
        DEBTS.employee.name,
        DEBTS.employee.pin,
        clientId,
        status,
        notes,
    )
        .then(function () {
            fetchDebts();
        })
        .catch(function (err) {
            hideLoading();
            showError(err);
        });
}
