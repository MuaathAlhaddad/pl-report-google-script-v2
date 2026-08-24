// ============================================================
// Daily debts reminder -- nudges you to actually open the Debts page,
// since tracking follow-up status is only useful if someone checks it.
//
// Two delivery paths:
//
//   1. WhatsApp (via Twilio) -- what you actually want day to day, but
//      it needs real setup first. WhatsApp requires a pre-approved
//      message TEMPLATE for any message your business sends without the
//      customer messaging you first (Meta's "24-hour session window"
//      rule) -- a daily reminder is exactly that kind of message, so it
//      can't be freeform text. Twilio's free Sandbox explicitly can't be
//      used for this either (session expires 3 days after joining, and
//      only ships 3 unrelated starter templates) -- it's for testing
//      only. See the setup checklist below; none of it can be automated
//      from here, it needs your Twilio/Meta account.
//
//   2. Email -- works today with zero extra setup, sent to your Google
//      account (and any address you put in the REMINDER_EMAIL_EXTRA
//      script property). Used automatically whenever the Twilio
//      properties below aren't fully configured yet, so you have a
//      working reminder immediately instead of waiting on WhatsApp
//      approval.
//
// ONE-TIME SETUP for WhatsApp (worth starting now -- approval isn't
// instant):
//   1. twilio.com -> Messaging -> WhatsApp -> Senders -> Self Sign-up.
//      Connect a real phone number and complete Meta's WhatsApp Business
//      verification for it.
//   2. In Twilio's Content Template Builder, create + submit a template
//      for this reminder, e.g.:
//        "Good morning! You have {{1}} debts totaling {{2}} needing
//         follow-up today. Open the Debts page: {{3}}"
//      Meta typically reviews templates within a few hours to a day.
//   3. Once approved, in the Apps Script editor -> Project Settings ->
//      Script Properties, add:
//        TWILIO_ACCOUNT_SID   = (from your Twilio console)
//        TWILIO_AUTH_TOKEN    = (from your Twilio console)
//        TWILIO_WHATSAPP_FROM = whatsapp:+1XXXXXXXXXX  (your approved sender)
//        TWILIO_WHATSAPP_TO   = whatsapp:+9665XXXXXXXX (your number)
//        TWILIO_CONTENT_SID   = HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (the
//                                approved template's Content SID)
//   4. Run setupDailyDebtsReminderTrigger() once from this editor (or
//      again if you'd added it already -- it clears old triggers first).
//
// You don't need to wait on any of that to start getting reminders --
// run setupDailyDebtsReminderTrigger() now and you'll get the email
// version today; it switches to WhatsApp automatically the moment all 5
// properties above are set.
// ============================================================

// Reads the Debts Snapshot sheet and summarizes what needs attention.
// Returns null if the sheet doesn't exist yet (nobody's run
// refreshDebtsSnapshot() at all).
function getDebtsFollowUpSummary_() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.DEBTS);

    if (!sheet) {
        return null;
    }

    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
        return { total: 0, count: 0, untouchedCount: 0, topDebts: [] };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, DEBTS_HEADERS.length).getValues();

    const debts = rows
        .filter((row) => row[1] !== "" && row[1] != null && row[5] === CONFIG.DEBT_STATUS.ACTIVE)
        .map((row) => ({
            clientName: row[0],
            amount: (Number(row[3]) || 0) - (Number(row[4]) || 0),
            lastFollowUp: row[9],
        }));

    const total = debts.reduce((sum, d) => sum + d.amount, 0);
    const untouchedCount = debts.filter((d) => !d.lastFollowUp).length;

    const topDebts = debts
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

    return { total, count: debts.length, untouchedCount, topDebts };
}

// The function the daily trigger calls. Picks WhatsApp if fully
// configured, otherwise falls back to email.
function sendDailyDebtsReminder() {
    const summary = getDebtsFollowUpSummary_();

    if (!summary) {
        Logger.log("No debts snapshot yet -- skipping today's reminder.");
        return;
    }

    if (summary.count === 0) {
        Logger.log("No outstanding debts -- skipping today's reminder.");
        return;
    }

    const props = PropertiesService.getScriptProperties();

    const twilioReady = [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_WHATSAPP_FROM",
        "TWILIO_WHATSAPP_TO",
        "TWILIO_CONTENT_SID",
    ].every((key) => props.getProperty(key));

    if (twilioReady) {
        sendWhatsAppReminder_(summary);
    } else {
        sendEmailReminder_(summary);
    }
}

function sendWhatsAppReminder_(summary) {
    const props = PropertiesService.getScriptProperties();
    const accountSid = props.getProperty("TWILIO_ACCOUNT_SID");
    const authToken = props.getProperty("TWILIO_AUTH_TOKEN");
    const url = ScriptApp.getService().getUrl();

    const payload = {
        To: props.getProperty("TWILIO_WHATSAPP_TO"),
        From: props.getProperty("TWILIO_WHATSAPP_FROM"),
        ContentSid: props.getProperty("TWILIO_CONTENT_SID"),
        ContentVariables: JSON.stringify({
            1: String(summary.count),
            2: formatMoney(summary.total),
            3: url,
        }),
    };

    const response = UrlFetchApp.fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
            method: "post",
            payload,
            headers: {
                Authorization:
                    "Basic " + Utilities.base64Encode(accountSid + ":" + authToken),
            },
            muteHttpExceptions: true,
        },
    );

    const code = response.getResponseCode();

    if (code < 200 || code >= 300) {
        Logger.log(
            `WhatsApp reminder failed (${code}): ${response.getContentText()}. Falling back to email.`,
        );
        sendEmailReminder_(summary);
        return;
    }

    Logger.log("WhatsApp reminder sent.");
}

function sendEmailReminder_(summary) {
    const props = PropertiesService.getScriptProperties();
    const url = ScriptApp.getService().getUrl();

    const recipients = [Session.getEffectiveUser().getEmail()];
    const extra = props.getProperty("REMINDER_EMAIL_EXTRA");
    if (extra) recipients.push(extra);

    const topList = summary.topDebts
        .map((d) => `  - ${d.clientName}: ${formatMoney(d.amount)}`)
        .join("\n");

    const body =
        `You have ${summary.count} outstanding debt(s) totaling ${formatMoney(summary.total)}.\n` +
        (summary.untouchedCount
            ? `${summary.untouchedCount} of them have never been followed up.\n`
            : "") +
        `\nBiggest:\n${topList}\n\n` +
        `Open the Debts page: ${url}`;

    MailApp.sendEmail({
        to: recipients.join(","),
        subject: `🧾 ${summary.count} debts need follow-up (${formatMoney(summary.total)} total)`,
        body,
    });

    Logger.log("Email reminder sent to " + recipients.join(","));
}

// Run once from the editor to schedule the daily reminder (~8am, your
// script's time zone). Safe to re-run any time -- it clears any previous
// trigger for this function first, so you won't end up with duplicates.
function setupDailyDebtsReminderTrigger() {
    ScriptApp.getProjectTriggers()
        .filter((t) => t.getHandlerFunction() === "sendDailyDebtsReminder")
        .forEach((t) => ScriptApp.deleteTrigger(t));

    ScriptApp.newTrigger("sendDailyDebtsReminder")
        .timeBased()
        .atHour(8)
        .everyDays(1)
        .inTimezone(Session.getScriptTimeZone())
        .create();

    Logger.log(
        "Daily debts reminder scheduled for ~8am " + Session.getScriptTimeZone(),
    );
}

// Run manually to test right now, without waiting for tomorrow's
// scheduled run. The first time you run this (or the trigger fires for
// the first time), Google will prompt you to authorize the Mail/WhatsApp
// permissions this needs -- that's expected, same as the one-time
// UrlFetchApp authorization you already did for Daftra.
function testDebtsReminder() {
    sendDailyDebtsReminder();
}
