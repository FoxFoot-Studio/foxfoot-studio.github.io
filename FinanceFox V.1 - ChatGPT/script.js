"use strict";

/* =========================================================
   FINANCEFOX — STATE
========================================================= */

const STORAGE_KEY = "financeFoxDataV5";
const LEGACY_STORAGE_KEYS = [
  "financeFoxDataV4",
  "financeFoxDataV3",
  "financeFoxDataV2",
  "financeFoxDataV1"
];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

const DEFAULT_STATE = {
  theme: "dark",
  budgetMonth: CURRENT_MONTH,
  income: [],
  bills: [],
  outgoings: [],
  debts: [],
  notes: [],
  customColumns: {
    income: [],
    bills: [],
    outgoings: []
  }
};

let state = loadState();

const TABLE_COLUMNS = {
  income: [
    { key: "source", label: "Source" },
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount Per Payment", format: "currency" },
    { key: "frequency", label: "Frequency", format: "frequency" },
    { key: "paymentsPerMonth", label: "Payments Per Month", format: "number" },
    { key: "paymentDay", label: "Payment Day" }
  ],

  bills: [
    { key: "company", label: "Company / Payee" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount Per Payment", format: "currency" },
    { key: "frequency", label: "Frequency", format: "frequency" },
    { key: "paymentsPerMonth", label: "Payments Per Month", format: "number" },
    { key: "dueDay", label: "Due Day" },
    { key: "accountReference", label: "Account Reference" },
    { key: "phone", label: "Phone" }
  ],

  outgoings: [
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount Per Payment", format: "currency" },
    { key: "frequency", label: "Frequency", format: "frequency" },
    { key: "paymentsPerMonth", label: "Payments Per Month", format: "number" },
    { key: "paymentDay", label: "Payment Day" }
  ]
};

/* =========================================================
   INITIALISATION
========================================================= */

document.addEventListener("DOMContentLoaded", initialiseApp);

function initialiseApp() {
  initialiseTabs();
  initialiseTheme();
  initialiseBudgetMonth();
  initialiseFrequencyHelpers();
  initialiseEntryForms();
  initialiseCustomColumns();
  initialiseEditableTables();
  initialiseRowDeletion();
  initialisePaidCheckboxes();
  initialiseDebtForm();
  initialiseDebtActions();
  initialiseDebtTimelineActions();
  initialiseNotes();

  renderEverything();
}

/* =========================================================
   STORAGE AND MIGRATION
========================================================= */

function loadState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }

    if (!raw) return cloneValue(DEFAULT_STATE);

    const old = JSON.parse(raw);
    const oldOutgoings = Array.isArray(old.outgoings)
      ? old.outgoings
      : Array.isArray(old.bills)
        ? old.bills
        : Array.isArray(old.outgoing)
          ? old.outgoing
          : [];

    const migratedBills = [];
    const migratedOtherOutgoings = [];

    for (const row of oldOutgoings) {
      const looksLikeBill = Boolean(
        row.company || row.accountReference || row.phone || row.provider
      );

      if (looksLikeBill) {
        migratedBills.push(migrateBillRow(row));
      } else {
        migratedOtherOutgoings.push(migrateOutgoingRow(row));
      }
    }

    if (Array.isArray(old.bills) && old.outgoings && old.outgoings !== old.bills) {
      for (const row of old.bills) {
        if (!migratedBills.some((item) => item.id === row.id)) {
          migratedBills.push(migrateBillRow(row));
        }
      }
    }

    return {
      ...cloneValue(DEFAULT_STATE),
      theme: old.theme === "light" ? "light" : "dark",
      budgetMonth:
        old.budgetMonth ||
        old.incomeMonth ||
        old.outgoingsMonth ||
        old.debtMonth ||
        old.billsMonth ||
        CURRENT_MONTH,
      income: Array.isArray(old.income)
        ? old.income.map(migrateIncomeRow)
        : [],
      bills: migratedBills,
      outgoings: migratedOtherOutgoings,
      debts: Array.isArray(old.debts)
        ? old.debts.map(migrateDebtRow)
        : [],
      notes: Array.isArray(old.notes) ? old.notes : [],
      customColumns: {
        income: Array.isArray(old.customColumns?.income)
          ? old.customColumns.income
          : [],
        bills: Array.isArray(old.customColumns?.bills)
          ? old.customColumns.bills
          : Array.isArray(old.customColumns?.outgoings)
            ? old.customColumns.outgoings
            : [],
        outgoings: []
      }
    };
  } catch (error) {
    console.error("FinanceFox could not load its saved data:", error);
    return cloneValue(DEFAULT_STATE);
  }
}

function migrateIncomeRow(row) {
  const frequency = normaliseFrequency(
    row.frequency || row.schedule || "monthly"
  );

  return {
    ...row,
    id: row.id || createId("income"),
    source: row.source || "",
    description: row.description || "",
    amount: parseMoney(row.amount),
    frequency,
    paymentsPerMonth:
      parsePositiveNumber(row.paymentsPerMonth) ||
      defaultPaymentsPerMonth(frequency),
    paymentDay:
      row.paymentDay ||
      legacyPaymentDay(row, frequency)
  };
}

function migrateBillRow(row) {
  const frequency = normaliseFrequency(row.frequency || "monthly");

  return {
    ...row,
    id: row.id || createId("bill"),
    company: row.company || row.provider || row.description || "",
    category: row.category || "Regular Bill",
    amount: parseMoney(row.amount),
    frequency,
    paymentsPerMonth:
      parsePositiveNumber(row.paymentsPerMonth) ||
      defaultPaymentsPerMonth(frequency),
    dueDay: row.dueDay || row.dueDate || row.paymentDay || "",
    accountReference: row.accountReference || "",
    phone: row.phone || "",
    paidMonths: validObject(row.paidMonths) ? row.paidMonths : {}
  };
}

function migrateOutgoingRow(row) {
  const frequency = normaliseFrequency(row.frequency || "monthly");

  return {
    ...row,
    id: row.id || createId("outgoing"),
    description: row.description || row.company || row.category || "",
    category: row.category || "Other",
    amount: parseMoney(row.amount),
    frequency,
    paymentsPerMonth:
      parsePositiveNumber(row.paymentsPerMonth) ||
      defaultPaymentsPerMonth(frequency),
    paymentDay: row.paymentDay || row.dueDate || "",
    paidMonths: validObject(row.paidMonths) ? row.paidMonths : {}
  };
}

function migrateDebtRow(row) {
  const existingHistory = Array.isArray(row.paymentHistory)
    ? row.paymentHistory
    : [];

  const legacyPayments = Math.max(0, Number(row.paymentsMade) || 0);
  const history = [...existingHistory];

  while (history.length < legacyPayments) {
    history.push({
      id: createId("legacy-payment"),
      month: "",
      recordedAt: ""
    });
  }

  return {
    ...row,
    id: row.id || createId("debt"),
    originalCompany: row.originalCompany || "",
    originalAmount: parseMoney(row.originalAmount),
    originalReference: row.originalReference || "",
    companyPhone: row.companyPhone || "",
    collectionAgency: row.collectionAgency || "",
    collectionReference: row.collectionReference || "",
    monthlyRepayment: parseMoney(row.monthlyRepayment),
    paymentDate: row.paymentDate || "",
    paidMonths: validObject(row.paidMonths) ? row.paidMonths : {},
    paymentHistory: history
  };
}

function legacyPaymentDay(row, frequency) {
  if (!isIsoDate(row.anchorDate)) return "";

  const date = parseIsoDate(row.anchorDate);
  if (!date) return "";

  if (frequency === "monthly" || frequency === "twice-monthly") {
    return ordinalNumber(date.getDate());
  }

  if (["weekly", "fortnightly", "four-weekly"].includes(frequency)) {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long"
    }).format(date);
  }

  return formatUkDate(row.anchorDate);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("FinanceFox could not save its data:", error);
  }
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

/* =========================================================
   NAVIGATION, THEME AND HEADER MONTH
========================================================= */

function initialiseTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => {
        item.classList.remove("active");
      });

      document.querySelectorAll(".panel").forEach((panel) => {
        panel.classList.remove("active");
      });

      tab.classList.add("active");
      document
        .getElementById(`panel-${tab.dataset.tab}`)
        ?.classList.add("active");
    });
  });
}

function initialiseTheme() {
  const button = document.getElementById("theme-toggle");
  applyTheme();

  button?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState();
  });
}

function applyTheme() {
  const theme = state.theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;

  const button = document.getElementById("theme-toggle");
  if (!button) return;

  button.textContent = theme === "dark" ? "🌙" : "☀️";
  button.title =
    theme === "dark"
      ? "Dark mode — switch to light mode"
      : "Light mode — switch to dark mode";
}

function initialiseBudgetMonth() {
  const input = document.getElementById("budget-month");
  if (!input) return;

  input.value = state.budgetMonth || CURRENT_MONTH;
  updateBudgetMonthLabels();

  input.addEventListener("change", () => {
    state.budgetMonth = input.value || CURRENT_MONTH;
    saveState();
    updateBudgetMonthLabels();
    renderTable("bills");
    renderTable("outgoings");
    renderDebts();
  });
}

function updateBudgetMonthLabels() {
  const label = formatBudgetMonth(state.budgetMonth);

  document.querySelectorAll("[data-budget-month-display]").forEach((item) => {
    item.textContent = label;
  });
}

/* =========================================================
   FREQUENCY FORM HELPERS
========================================================= */

function initialiseFrequencyHelpers() {
  document.querySelectorAll("[data-frequency-form]").forEach((form) => {
    const select = form.querySelector('[data-field="frequency"]');
    if (!select) return;

    select.addEventListener("change", () => {
      updateFrequencyInputs(form, true);
    });

    updateFrequencyInputs(form, false);
  });
}

function updateFrequencyInputs(form, replaceCount) {
  const select = form.querySelector('[data-field="frequency"]');
  const countInput = form.querySelector('[data-field="paymentsPerMonth"]');
  const dayInput = form.querySelector(
    '[data-field="paymentDay"], [data-field="dueDay"]'
  );

  if (!select || !countInput) return;

  const frequency = normaliseFrequency(select.value);
  const defaults = {
    monthly: { count: 1, hint: "Day of month, e.g. 8th" },
    "twice-monthly": { count: 2, hint: "Payment days, e.g. 8th and 22nd" },
    weekly: { count: 4, hint: "Weekday, e.g. Friday" },
    fortnightly: { count: 2, hint: "Weekday, e.g. Friday" },
    "four-weekly": { count: 1, hint: "Weekday, e.g. Friday" },
    quarterly: { count: 0.33, hint: "Usual payment day" },
    annual: { count: 0.08, hint: "Usual payment date" },
    "one-off": { count: 1, hint: "Payment date" },
    other: { count: "", hint: "Payment day or pattern" }
  };

  const selected = defaults[frequency] || defaults.other;

  if (replaceCount || !countInput.value) {
    countInput.value = selected.count;
  }

  if (dayInput) {
    dayInput.placeholder = selected.hint;
  }
}

/* =========================================================
   GENERIC ENTRY FORMS AND CUSTOM COLUMNS
========================================================= */

function initialiseEntryForms() {
  document.querySelectorAll("[data-entry-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const type = form.dataset.entryForm;
      if (!["income", "bills", "outgoings"].includes(type)) return;

      const row = { id: createId(type) };

      form.querySelectorAll("[data-field]").forEach((input) => {
        row[input.dataset.field] = normaliseFormValue(
          input.dataset.field,
          input.value
        );
      });

      form.querySelectorAll("[data-custom-field]").forEach((input) => {
        row[input.dataset.customField] = input.value.trim();
      });

      row.frequency = normaliseFrequency(row.frequency);
      row.paymentsPerMonth = parsePositiveNumber(row.paymentsPerMonth);

      if (type === "bills" || type === "outgoings") {
        row.paidMonths = {};
      }

      state[type].push(row);
      form.reset();
      updateFrequencyInputs(form, false);
      saveState();
      renderTable(type);
    });
  });
}

function normaliseFormValue(field, value) {
  if (field === "amount") return parseMoney(value);
  if (field === "paymentsPerMonth") return parsePositiveNumber(value);
  return String(value || "").trim();
}

function initialiseCustomColumns() {
  document.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-column]");
    if (addButton) {
      addCustomColumn(addButton.dataset.addColumn);
      return;
    }

    const removeButton = event.target.closest("[data-remove-column]");
    if (removeButton) {
      removeCustomColumn(
        removeButton.dataset.columnType,
        removeButton.dataset.removeColumn
      );
    }
  });
}

function addCustomColumn(type) {
  if (!state.customColumns[type]) return;

  const label = window.prompt("Name the new column:");
  if (!label?.trim()) return;

  const cleanLabel = label.trim();
  const duplicate = state.customColumns[type].some(
    (column) => column.label.toLowerCase() === cleanLabel.toLowerCase()
  );

  if (duplicate) return;

  state.customColumns[type].push({
    key: createId("column"),
    label: cleanLabel
  });

  saveState();
  renderTable(type);
}

function removeCustomColumn(type, key) {
  const column = state.customColumns[type]?.find((item) => item.key === key);
  if (!column) return;

  const confirmed = window.confirm(
    `Remove the “${column.label}” column and its data?`
  );

  if (!confirmed) return;

  state.customColumns[type] = state.customColumns[type].filter(
    (item) => item.key !== key
  );

  state[type].forEach((row) => {
    delete row[key];
  });

  saveState();
  renderTable(type);
}

/* =========================================================
   GENERIC TABLES
========================================================= */

function renderEverything() {
  const monthInput = document.getElementById("budget-month");
  if (monthInput) monthInput.value = state.budgetMonth || CURRENT_MONTH;

  updateBudgetMonthLabels();
  renderTable("income");
  renderTable("bills");
  renderTable("outgoings");
  renderDebts();
  renderNotes();
}

function getColumns(type) {
  return [
    ...TABLE_COLUMNS[type],
    ...(state.customColumns[type] || [])
  ];
}

function renderTable(type) {
  renderCustomInputs(type);

  const head = document.getElementById(`${type}-head`);
  const body = document.getElementById(`${type}-body`);
  if (!head || !body) return;

  const columns = getColumns(type);
  const usesPaidCheckbox = type === "bills" || type === "outgoings";

  head.innerHTML = `
    <tr>
      ${columns
        .map((column) => {
          const custom = state.customColumns[type].some(
            (item) => item.key === column.key
          );

          return `
            <th>
              <div class="column-heading">
                <span>${escapeHtml(column.label)}</span>
                ${
                  custom
                    ? `<button
                         class="remove-column-button"
                         type="button"
                         data-column-type="${type}"
                         data-remove-column="${column.key}"
                         title="Remove custom column"
                       >×</button>`
                    : ""
                }
              </div>
            </th>
          `;
        })
        .join("")}
      ${usesPaidCheckbox ? "<th>Paid?</th>" : ""}
      <th>Delete</th>
    </tr>
  `;

  if (state[type].length === 0) {
    body.innerHTML = `
      <tr>
        <td class="empty-row" colspan="${
          columns.length + 1 + (usesPaidCheckbox ? 1 : 0)
        }">
          No entries have been added yet.
        </td>
      </tr>
    `;

    updateTableSummaries(type);
    return;
  }

  body.innerHTML = state[type]
    .map((row) => {
      const cells = columns
        .map((column) => {
          return `
            <td
              contenteditable="true"
              spellcheck="false"
              data-table-type="${type}"
              data-row-id="${row.id}"
              data-field="${column.key}"
              data-format="${column.format || "text"}"
            >${displayCellValue(row[column.key], column.format)}</td>
          `;
        })
        .join("");

      return `
        <tr>
          ${cells}
          ${usesPaidCheckbox ? createPaidCell(type, row) : ""}
          <td class="delete-cell">
            <button
              class="danger-button"
              type="button"
              data-delete-row="${row.id}"
              data-delete-type="${type}"
            >Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  updateTableSummaries(type);
}

function renderCustomInputs(type) {
  const container = document.getElementById(`${type}-custom-inputs`);
  if (!container) return;

  container.innerHTML = (state.customColumns[type] || [])
    .map(
      (column) => `
        <input
          type="text"
          data-custom-field="${column.key}"
          placeholder="${escapeHtml(column.label)}"
          aria-label="${escapeHtml(column.label)}"
        />
      `
    )
    .join("");
}

function displayCellValue(value, format) {
  if (format === "currency") return escapeHtml(formatCurrency(value));
  if (format === "frequency") {
    return escapeHtml(frequencyLabel(normaliseFrequency(value)));
  }
  if (format === "number") return escapeHtml(formatNumber(value));
  return escapeHtml(String(value ?? ""));
}

function initialiseEditableTables() {
  document.addEventListener("focusout", (event) => {
    const cell = event.target.closest('td[contenteditable="true"]');
    if (!cell) return;

    const type = cell.dataset.tableType;
    const row = state[type]?.find((item) => item.id === cell.dataset.rowId);
    if (!row) return;

    const field = cell.dataset.field;
    const format = cell.dataset.format;
    let value = cell.textContent.trim();

    if (format === "currency") {
      value = parseMoney(value);
      cell.textContent = formatCurrency(value);
    } else if (format === "frequency") {
      value = normaliseFrequency(value);
      cell.textContent = frequencyLabel(value);
    } else if (format === "number") {
      value = parsePositiveNumber(value);
      cell.textContent = formatNumber(value);
    }

    row[field] = value;
    saveState();

    if (type === "debts") {
      renderDebts();
    } else {
      updateTableSummaries(type);
    }
  });
}

function initialiseRowDeletion() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-row]");
    if (!button) return;

    const type = button.dataset.deleteType;
    if (!state[type]) return;

    const confirmed = window.confirm("Delete this row?");
    if (!confirmed) return;

    state[type] = state[type].filter(
      (row) => row.id !== button.dataset.deleteRow
    );

    saveState();
    renderTable(type);
  });
}

function createPaidCell(type, row) {
  const paid = Boolean(row.paidMonths?.[state.budgetMonth]);

  return `
    <td class="paid-cell">
      <input
        class="payment-checkbox"
        type="checkbox"
        data-paid-type="${type}"
        data-paid-id="${row.id}"
        ${paid ? "checked" : ""}
        aria-label="Mark paid for ${escapeHtml(
          formatBudgetMonth(state.budgetMonth)
        )}"
      />
    </td>
  `;
}

function initialisePaidCheckboxes() {
  document.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-paid-type]");
    if (!checkbox) return;

    const type = checkbox.dataset.paidType;
    const row = state[type]?.find((item) => item.id === checkbox.dataset.paidId);
    if (!row) return;

    row.paidMonths ||= {};
    row.paidMonths[state.budgetMonth] = checkbox.checked;

    saveState();
    updateTableSummaries(type);
  });
}

/* =========================================================
   INCOME AND OUTGOING SUMMARIES
========================================================= */

function updateTableSummaries(type) {
  if (type === "income") updateIncomeSummary();
  if (type === "bills" || type === "outgoings") updateOutgoingSummaries();
}

function monthlyValue(row) {
  return parseMoney(row.amount) * parsePositiveNumber(row.paymentsPerMonth);
}

function updateIncomeSummary() {
  const total = state.income.reduce((sum, row) => sum + monthlyValue(row), 0);
  const paymentCount = state.income.reduce(
    (sum, row) => sum + parsePositiveNumber(row.paymentsPerMonth),
    0
  );

  setText("income-total", formatCurrency(total));
  setText("income-payment-count", formatNumber(paymentCount));

  const container = document.getElementById("income-summary");
  if (!container) return;

  if (state.income.length === 0) {
    container.innerHTML = `<div class="empty-card">Add income to build the monthly summary.</div>`;
    return;
  }

  container.innerHTML = state.income
    .map(
      (row) => `
        <article class="summary-item">
          <div>
            <span>${escapeHtml(row.source || "Unnamed income")}</span>
            <small>
              ${formatCurrency(row.amount)} × ${formatNumber(
                row.paymentsPerMonth
              )} per month
              ${row.paymentDay ? ` · ${escapeHtml(row.paymentDay)}` : ""}
            </small>
          </div>
          <strong>${formatCurrency(monthlyValue(row))}</strong>
        </article>
      `
    )
    .join("");
}

function updateOutgoingSummaries() {
  const billTotal = state.bills.reduce((sum, row) => sum + monthlyValue(row), 0);
  const otherTotal = state.outgoings.reduce(
    (sum, row) => sum + monthlyValue(row),
    0
  );
  const overallTotal = billTotal + otherTotal;

  const billsPaid = state.bills.filter(
    (row) => row.paidMonths?.[state.budgetMonth]
  ).length;
  const outgoingsPaid = state.outgoings.filter(
    (row) => row.paidMonths?.[state.budgetMonth]
  ).length;

  setText("bills-total", formatCurrency(billTotal));
  setText("bills-paid-count", `${billsPaid}/${state.bills.length}`);
  setText("other-outgoings-total", formatCurrency(otherTotal));
  setText("other-outgoings-paid-count", `${outgoingsPaid}/${state.outgoings.length}`);
  setText("outgoings-total", formatCurrency(overallTotal));

  const categories = {};

  [...state.bills, ...state.outgoings].forEach((row) => {
    const category = String(row.category || "Uncategorised").trim();
    categories[category] = (categories[category] || 0) + monthlyValue(row);
  });

  const container = document.getElementById("outgoings-category-summary");
  if (!container) return;

  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-card">Add bills or outgoings to build the category summary.</div>`;
    return;
  }

  container.innerHTML = entries
    .map(
      ([category, amount]) => `
        <article class="summary-item">
          <span>${escapeHtml(category)}</span>
          <strong>${formatCurrency(amount)}</strong>
        </article>
      `
    )
    .join("");
}

/* =========================================================
   DEBTS
========================================================= */

function initialiseDebtForm() {
  const form = document.getElementById("debt-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const values = {};
    form.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      values[field] = ["originalAmount", "monthlyRepayment"].includes(field)
        ? parseMoney(input.value)
        : input.value.trim();
    });

    state.debts.push({
      id: createId("debt"),
      originalCompany: values.originalCompany || "",
      originalAmount: values.originalAmount || 0,
      originalReference: values.originalReference || "",
      companyPhone: values.companyPhone || "",
      collectionAgency: values.collectionAgency || "",
      collectionReference: values.collectionReference || "",
      monthlyRepayment: values.monthlyRepayment || 0,
      paymentDate: values.paymentDate || "",
      paidMonths: {},
      paymentHistory: []
    });

    form.reset();
    saveState();
    renderDebts();
  });
}

function ensureDebtTracking(debt) {
  debt.paidMonths = validObject(debt.paidMonths) ? debt.paidMonths : {};
  debt.paymentHistory = Array.isArray(debt.paymentHistory)
    ? debt.paymentHistory
    : [];
}

function calculateDebt(debt) {
  ensureDebtTracking(debt);

  const originalAmount = parseMoney(debt.originalAmount);
  const monthlyRepayment = parseMoney(debt.monthlyRepayment);
  const canCalculate = originalAmount > 0 && monthlyRepayment > 0;
  const plannedMonths = canCalculate
    ? Math.ceil(originalAmount / monthlyRepayment)
    : 0;
  const paymentsMade = Math.min(debt.paymentHistory.length, plannedMonths);
  const remainingMonths = Math.max(0, plannedMonths - paymentsMade);
  const remainingAmount = Math.max(
    0,
    originalAmount - paymentsMade * monthlyRepayment
  );

  return {
    originalAmount,
    monthlyRepayment,
    canCalculate,
    plannedMonths,
    paymentsMade,
    remainingMonths,
    remainingAmount
  };
}

function renderDebts() {
  renderDebtTable();
  renderDebtSummary();
  renderDebtTimelines();
}

function renderDebtTable() {
  const body = document.getElementById("debt-body");
  if (!body) return;

  if (state.debts.length === 0) {
    body.innerHTML = `
      <tr>
        <td class="empty-row" colspan="12">No debts have been added yet.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = state.debts
    .map((debt) => {
      const calculation = calculateDebt(debt);
      const paidThisMonth = Boolean(debt.paidMonths[state.budgetMonth]);
      const paymentDisabled =
        !calculation.canCalculate ||
        (calculation.remainingMonths === 0 && !paidThisMonth);

      return `
        <tr>
          ${debtEditableCell(debt, "originalCompany", debt.originalCompany)}
          ${debtEditableCell(
            debt,
            "originalAmount",
            formatCurrency(calculation.originalAmount),
            "currency"
          )}
          ${debtEditableCell(debt, "originalReference", debt.originalReference)}
          ${debtEditableCell(debt, "companyPhone", debt.companyPhone)}
          ${debtEditableCell(debt, "collectionAgency", debt.collectionAgency)}
          ${debtEditableCell(
            debt,
            "collectionReference",
            debt.collectionReference
          )}
          ${debtEditableCell(
            debt,
            "monthlyRepayment",
            formatCurrency(calculation.monthlyRepayment),
            "currency"
          )}
          ${debtEditableCell(debt, "paymentDate", debt.paymentDate)}
          <td>${calculation.canCalculate ? calculation.remainingMonths : "—"}</td>
          <td>${
            calculation.canCalculate
              ? formatCurrency(calculation.remainingAmount)
              : "—"
          }</td>
          <td class="paid-cell">
            <input
              class="payment-checkbox"
              type="checkbox"
              data-debt-paid="${debt.id}"
              ${paidThisMonth ? "checked" : ""}
              ${paymentDisabled ? "disabled" : ""}
              aria-label="Mark debt paid for ${escapeHtml(
                formatBudgetMonth(state.budgetMonth)
              )}"
            />
          </td>
          <td class="delete-cell">
            <button
              class="danger-button"
              type="button"
              data-delete-debt="${debt.id}"
            >Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function debtEditableCell(debt, field, value, format = "text") {
  return `
    <td
      contenteditable="true"
      spellcheck="false"
      data-table-type="debts"
      data-row-id="${debt.id}"
      data-field="${field}"
      data-format="${format}"
    >${escapeHtml(String(value ?? ""))}</td>
  `;
}

function initialiseDebtActions() {
  document.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-debt-paid]");
    if (!checkbox) return;

    const debt = state.debts.find((item) => item.id === checkbox.dataset.debtPaid);
    if (!debt) return;

    const changed = setDebtMonthPaid(
      debt,
      state.budgetMonth,
      checkbox.checked
    );

    if (!changed) {
      checkbox.checked = Boolean(debt.paidMonths?.[state.budgetMonth]);
      return;
    }

    saveState();
    renderDebts();
  });

  document.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-debt]");
    if (!deleteButton) return;

    const debt = state.debts.find(
      (item) => item.id === deleteButton.dataset.deleteDebt
    );
    if (!debt) return;

    const label =
      debt.collectionAgency || debt.originalCompany || "this debt";
    const confirmed = window.confirm(
      `Delete ${label} and its repayment history?`
    );

    if (!confirmed) return;

    state.debts = state.debts.filter((item) => item.id !== debt.id);
    saveState();
    renderDebts();
  });
}

function setDebtMonthPaid(debt, month, shouldBePaid) {
  ensureDebtTracking(debt);

  const alreadyPaid = Boolean(debt.paidMonths[month]);
  if (alreadyPaid === shouldBePaid) return false;

  const calculation = calculateDebt(debt);

  if (shouldBePaid) {
    if (!calculation.canCalculate || calculation.remainingMonths <= 0) {
      return false;
    }

    debt.paidMonths[month] = true;
    debt.paymentHistory.push({
      id: createId("payment"),
      month,
      amount: Math.min(
        calculation.monthlyRepayment,
        calculation.remainingAmount
      ),
      recordedAt: new Date().toISOString()
    });

    return true;
  }

  debt.paidMonths[month] = false;

  for (let index = debt.paymentHistory.length - 1; index >= 0; index -= 1) {
    if (debt.paymentHistory[index].month === month) {
      debt.paymentHistory.splice(index, 1);
      break;
    }
  }

  return true;
}

function initialiseDebtTimelineActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-debt-timeline-action]");
    if (!button) return;

    const debt = state.debts.find(
      (item) => item.id === button.dataset.debtId
    );
    if (!debt) return;

    const action = button.dataset.debtTimelineAction;

    if (action === "pay-next") {
      const changed = setDebtMonthPaid(debt, state.budgetMonth, true);
      if (!changed) return;
    }

    if (action === "undo-latest") {
      undoLatestDebtPayment(debt);
    }

    saveState();
    renderDebts();
  });
}

function undoLatestDebtPayment(debt) {
  ensureDebtTracking(debt);
  const payment = debt.paymentHistory.pop();
  if (!payment) return;

  if (payment.month) {
    const anotherPaymentForMonth = debt.paymentHistory.some(
      (item) => item.month === payment.month
    );

    if (!anotherPaymentForMonth) {
      debt.paidMonths[payment.month] = false;
    }
  }
}

function renderDebtSummary() {
  const total = state.debts.reduce(
    (sum, debt) => sum + parseMoney(debt.monthlyRepayment),
    0
  );

  setText("debt-monthly-total", formatCurrency(total));

  const container = document.getElementById("debt-payment-summary");
  if (!container) return;

  const repayments = state.debts.filter(
    (debt) => parseMoney(debt.monthlyRepayment) > 0
  );

  if (repayments.length === 0) {
    container.innerHTML = `<div class="empty-card">Add monthly debt repayments to build this summary.</div>`;
    return;
  }

  container.innerHTML = repayments
    .map(
      (debt) => `
        <article class="summary-item">
          <div>
            <span>${escapeHtml(
              debt.collectionAgency || debt.originalCompany || "Unnamed debt"
            )}</span>
            ${
              debt.paymentDate
                ? `<small>Due ${escapeHtml(debt.paymentDate)}</small>`
                : ""
            }
          </div>
          <strong>${formatCurrency(debt.monthlyRepayment)}</strong>
        </article>
      `
    )
    .join("");
}

function renderDebtTimelines() {
  const container = document.getElementById("debt-timelines");
  if (!container) return;

  if (state.debts.length === 0) {
    container.innerHTML = `<div class="empty-card">Add a debt to create its repayment timeline.</div>`;
    return;
  }

  container.innerHTML = state.debts
    .map((debt) => {
      const calculation = calculateDebt(debt);
      const name =
        debt.collectionAgency || debt.originalCompany || "Unnamed Debt";
      const reference =
        debt.collectionReference ||
        debt.originalReference ||
        "No reference entered";

      let tracker;

      if (!calculation.canCalculate) {
        tracker = `
          <div class="timeline-unavailable">
            Add a debt amount and monthly repayment to generate this tracker.
          </div>
        `;
      } else {
        const firstPaidIndex =
          calculation.plannedMonths - calculation.paymentsMade;
        const nextIndex = firstPaidIndex - 1;

        tracker = `
          <div class="timeline-track">
            ${Array.from(
              { length: calculation.plannedMonths },
              (_, index) => {
                const number = index + 1;
                const paid = index >= firstPaidIndex;
                const latestPaid =
                  calculation.paymentsMade > 0 && index === firstPaidIndex;
                const nextToPay =
                  calculation.remainingMonths > 0 && index === nextIndex;

                let action = "";
                let disabled = "disabled";
                let title = `Month ${number} remaining`;

                if (latestPaid) {
                  action = "undo-latest";
                  disabled = "";
                  title = `Month ${number} paid — click to undo the latest payment`;
                } else if (nextToPay) {
                  action = "pay-next";
                  disabled = debt.paidMonths[state.budgetMonth] ? "disabled" : "";
                  title = debt.paidMonths[state.budgetMonth]
                    ? `This budget month is already recorded as paid`
                    : `Month ${number} — click to mark ${formatBudgetMonth(
                        state.budgetMonth
                      )} paid`;
                } else if (paid) {
                  title = `Month ${number} paid`;
                }

                return `
                  <button
                    class="timeline-block ${
                      paid ? "timeline-block-paid" : "timeline-block-unpaid"
                    } ${latestPaid ? "timeline-block-latest" : ""} ${
                      nextToPay ? "timeline-block-next" : ""
                    }"
                    type="button"
                    data-debt-timeline-action="${action}"
                    data-debt-id="${debt.id}"
                    ${disabled}
                    title="${escapeHtml(title)}"
                  >${paid ? "✓" : number}</button>
                `;
              }
            ).join("")}
          </div>
        `;
      }

      return `
        <article class="debt-card">
          <div class="debt-card-header">
            <div>
              <h4>${escapeHtml(name)}</h4>
              <p class="debt-card-meta">
                ${escapeHtml(reference)}
                ${
                  calculation.canCalculate
                    ? ` · ${calculation.remainingMonths} months remaining · ${calculation.paymentsMade} paid`
                    : ""
                }
                ${
                  debt.paymentDate
                    ? ` · Payment date: ${escapeHtml(debt.paymentDate)}`
                    : ""
                }
              </p>
            </div>
            ${
              calculation.canCalculate
                ? `<div class="remaining-badge">${formatCurrency(
                    calculation.remainingAmount
                  )} remaining</div>`
                : `<div class="remaining-badge">Awaiting figures</div>`
            }
          </div>
          ${tracker}
          ${
            calculation.canCalculate && calculation.remainingMonths === 0
              ? `<div class="debt-complete">✓ Debt repayment complete</div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

/* =========================================================
   NOTES
========================================================= */

function initialiseNotes() {
  const form = document.getElementById("notes-form");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = document.getElementById("note-title")?.value.trim();
    const body = document.getElementById("note-body")?.value.trim();
    if (!title || !body) return;

    state.notes.push({
      id: createId("note"),
      title,
      body,
      createdAt: new Date().toISOString()
    });

    form.reset();
    saveState();
    renderNotes();
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-note]");
    if (!button) return;

    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;

    state.notes = state.notes.filter(
      (note) => note.id !== button.dataset.deleteNote
    );

    saveState();
    renderNotes();
  });
}

function renderNotes() {
  const container = document.getElementById("notes-list");
  if (!container) return;

  if (state.notes.length === 0) {
    container.innerHTML = `<div class="empty-card">Your saved notes will appear here.</div>`;
    return;
  }

  container.innerHTML = [...state.notes]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(
      (note) => `
        <article class="note-card">
          <div class="note-header">
            <div>
              <h4>${escapeHtml(note.title)}</h4>
              <p class="note-date">${formatDateTime(note.createdAt)}</p>
            </div>
            <button
              class="danger-button"
              type="button"
              data-delete-note="${note.id}"
            >Delete</button>
          </div>
          <p class="note-body">${escapeHtml(note.body)}</p>
        </article>
      `
    )
    .join("");
}

/* =========================================================
   FREQUENCY, DATE AND FORMAT HELPERS
========================================================= */

function normaliseFrequency(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  const aliases = {
    monthly: "monthly",
    month: "monthly",
    "every month": "monthly",
    "twice monthly": "twice-monthly",
    "twice-monthly": "twice-monthly",
    "twice a month": "twice-monthly",
    "2x monthly": "twice-monthly",
    weekly: "weekly",
    "every week": "weekly",
    fortnightly: "fortnightly",
    "two-weekly": "fortnightly",
    "two weekly": "fortnightly",
    "every 2 weeks": "fortnightly",
    "every two weeks": "fortnightly",
    biweekly: "fortnightly",
    "four-weekly": "four-weekly",
    "four weekly": "four-weekly",
    "every 4 weeks": "four-weekly",
    quarterly: "quarterly",
    annual: "annual",
    annually: "annual",
    yearly: "annual",
    "one-off": "one-off",
    "one off": "one-off",
    once: "one-off",
    other: "other"
  };

  return aliases[text] || "monthly";
}

function frequencyLabel(value) {
  const labels = {
    monthly: "Monthly",
    "twice-monthly": "Twice monthly",
    weekly: "Weekly",
    fortnightly: "Every 2 weeks",
    "four-weekly": "Every 4 weeks",
    quarterly: "Quarterly",
    annual: "Annually",
    "one-off": "One-off",
    other: "Other"
  };

  return labels[value] || "Monthly";
}

function defaultPaymentsPerMonth(frequency) {
  const defaults = {
    monthly: 1,
    "twice-monthly": 2,
    weekly: 4,
    fortnightly: 2,
    "four-weekly": 1,
    quarterly: 0.33,
    annual: 0.08,
    "one-off": 1,
    other: 1
  };

  return defaults[frequency] || 1;
}

function formatBudgetMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) {
    return "Budget Month";
  }

  const [year, month] = value.split("-").map(Number);

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1, 12));
}

function formatUkDate(value) {
  if (!isIsoDate(value)) return String(value || "");
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function parseIsoDate(value) {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function ordinalNumber(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return String(value || "");

  const lastTwo = number % 100;
  const last = number % 10;
  let suffix = "th";

  if (lastTwo < 11 || lastTwo > 13) {
    if (last === 1) suffix = "st";
    if (last === 2) suffix = "nd";
    if (last === 3) suffix = "rd";
  }

  return `${number}${suffix}`;
}

function createId(prefix = "item") {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseMoney(value) {
  const cleaned = String(value ?? "")
    .replace(/£/g, "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function parsePositiveNumber(value) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP"
  }).format(parseMoney(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2
  }).format(parsePositiveNumber(value));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(date);
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function validObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
