function money(value) {
    return Number(value || 0).toLocaleString();
}

const COLORS = {
    primary: "#1976D2", // the one neutral brand accent (headline numbers)
    neutral: "#546E7A", // supporting stats that aren't inherently good/bad
    success: "#2E7D32", // profit-positive only
    danger: "#C62828", // profit-negative only
};

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

function getValue(id) {
    const el = document.getElementById(id);

    return el ? Number(el.value) || 0 : 0;
}

function showError(err) {
    alert(err.message || err);
}

function copyDateText(button) {
    const dateInput = document.getElementById("date").value;

    if (!dateInput) {
        alert("Please select a date first.");
        return;
    }

    const [year, month, day] = dateInput.split("-");

    const formatted = `${day}/${month}/${year}`;

    navigator.clipboard.writeText(formatted);

    const original = button.innerHTML;

    button.innerHTML = "✅";

    setTimeout(function () {
        button.innerHTML = original;
    }, 1000);
}

function copyPaymentsScript(button) {
    const script = `const result = [...document.querySelectorAll(".entry-time")]
.map(e => parseFloat(e.innerText.replace(/,/g,"")))
.join("+");

console.log(result);`;

    navigator.clipboard.writeText(script);

    const original = button.innerHTML;

    button.innerHTML = "✅";

    setTimeout(function () {
        button.innerHTML = original;
    }, 1000);
}

function isCurrentPeriod(period) {
    const today = new Date();

    const current =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0");

    return period === current;
}
function showLoading() {
    document.getElementById("loadingIndicator").style.display = "flex";
}

function hideLoading() {
    document.getElementById("loadingIndicator").style.display = "none";
}

function gsRun(functionName, ...args) {
    return new Promise((resolve, reject) => {
        google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            [functionName](...args);
    });
}
