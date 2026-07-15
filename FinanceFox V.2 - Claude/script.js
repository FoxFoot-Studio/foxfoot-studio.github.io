"use strict";

/* =========================================================
   FINANCEFOX — STATE
========================================================= */

const STORAGE_KEY = "financeFoxDataV6";
const LEGACY_STORAGE_KEYS = [
  "financeFoxDataV5",
  "financeFoxDataV4",
  "financeFoxDataV3",
  "financeFoxDataV2",
  "financeFoxDataV1"
];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

/*
  Every table is driven by its column list. Columns marked
  essential power the monthly maths, so they cannot be removed.
  Everything else — including the starting columns — can be
  deleted with the × in its header, or added with + Add Column.
*/
const DEFAULT_COLUMNS = {
  income: [
    { key: "source", label: "Source" },
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount", format: "currency", essential: true },
    { key: "frequency", label: "Frequency", format: "frequency", essential: true },
    { key: "date", label: "Date", hint: "e.g. 8th or Friday" }
  ],

  outgoings: [
    { key: "expense", label: "Expense" },
    { key: "notes", label: "Notes" },
    { key: "amount", label: "Cost", format: "currency", essential: true },
    { key: "frequency", label: "Frequency", format: "frequency", essential: true },
    { key: "date", label: "Date", hint: "e.g. 15th" }
  ],

  bills: [
    { key: "company", label: "Company" },
    { key: "bill", label: "Bill" },
    { key: "amount", label: "Cost", format: "currency", essential: true },
    { key: "frequency", label: "Frequency", format: "frequency", essential: true },
    { key: "date", label: "Date", hint: "e.g. 1st" }
  ]
};

const DEFAULT_STATE = {
  theme: "dark",
  budgetMonth: CURRENT_MONTH,
  columns: cloneValue(DEFAULT_COLUMNS),
  income: [],
  outgoings: [],
  bills: [],
  debts: [],
  notes: []
};

let state = loadState();

/* =========================================================
   INITIALISATION
========================================================= */

document.addEventListener("DOMContentLoaded", initialiseApp);

function initialiseApp() {
  initialiseTabs();
  initialiseTheme();
  initialiseBudgetMonth();
  initialiseDataTools();
  initialiseEntryForms();
  initialiseColumnControls();
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

    return migrateState(JSON.parse(raw));
  } catch (error) {
    console.error("FinanceFox could not load its saved data:", error);
    return cloneValue(DEFAULT_STATE);
  }
}

function migrateState(old) {
  if (!validObject(old)) return cloneValue(DEFAULT_STATE);

  const migrated = {
    ...cloneValue(DEFAULT_STATE),
    theme: old.theme === "light" ? "light" : "dark",
    budgetMonth: old.budgetMonth || CURRENT_MONTH,
    notes: Array.isArray(old.notes) ? old.notes : []
  };

  // Column lists: keep saved ones if present, otherwise seed defaults.
  if (validObject(old.columns)) {
    for (const type of ["income", "outgoings", "bills"]) {
      if (Array.isArray(old.columns[type]) && old.columns[type].length > 0) {
        migrated.columns[type] = old.columns[type];
      }
    }
  }

  // Legacy custom columns (pre-V6) become ordinary columns.
  if (validObject(old.customColumns)) {
    for (const type of ["income", "outgoings", "bills"]) {
      for (const column of old.customColumns[type] || []) {
        const exists = migrated.columns[type].some(
          (item) => item.key === column.key
        );
        if (!exists) migrated.columns[type].push({ ...column });
      }
    }
  }

  migrated.income = (Array.isArray(old.income) ? old.income : []).map(
    migrateIncomeRow
  );

  // Pre-V5 saves kept bills and outgoings in one list.
  const oldOutgoings = Array.isArray(old.outgoings)
    ? old.outgoings
    : Array.isArray(old.outgoing)
      ? old.outgoing
      : [];
  const oldBills = Array.isArray(old.bills) ? old.bills : [];

  if (oldBills.length === 0 && oldOutgoings.length > 0 && !old.columns) {
    for (const row of oldOutgoings) {
      const looksLikeBill = Boolean(
        row.company || row.accountReference || row.phone || row.provider
      );

      if (looksLikeBill) {
        migrated.bills.push(migrateBillRow(row));
      } else {
        migrated.outgoings.push(migrateOutgoingRow(row));
      }
    }
  } else {
    migrated.bills = oldBills.map(migrateBillRow);
    migrated.outgoings = oldOutgoings.map(migrateOutgoingRow);
  }

  migrated.debts = (Array.isArray(old.debts) ? old.debts : []).map(
    migrateDebtRow
  );

  return migrated;
}

function migrateIncomeRow(row) {
  return {
    ...row,
    id: row.id || createId("income"),
    source: row.source || "",
    description: row.description || "",
    amount: parseMoney(row.amount),
    frequency: normaliseFrequency(row.frequency || row.schedule || "monthly"),
    date: row.date || row.paymentDay || ""
  };
}

function migrateBillRow(row) {
  return {
    ...row,
    id: row.id || createId("bill"),
    company: row.company || row.provider || "",
    bill: row.bill || row.category || row.description || "",
    amount: parseMoney(row.amount),
    frequency: normaliseFrequency(row.frequency || "monthly"),
    date: row.date || row.dueDay || row.dueDate || "",
    paidMonths: validObject(row.paidMonths) ? row.paidMonths : {}
  };
}

function migrateOutgoingRow(row) {
  return {
    ...row,
    id: row.id || createId("outgoing"),
    expense: row.expense || row.description || row.company || "",
    notes: row.notes || row.category || "",
    amount: parseMoney(row.amount),
    frequency: normaliseFrequency(row.frequency || "monthly"),
    date: row.date || row.paymentDay || row.dueDate || "",
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

  const debt = {
    ...row,
    id: row.id || createId("debt"),
    originalCompany: row.originalCompany || "",
    originalAmount: parseMoney(row.originalAmount),
    originalReference: row.originalReference || "",
    collectionAgency: row.collectionAgency || "",
    collectionReference: row.collectionReference || "",
    repaymentAmount: parseMoney(row.repaymentAmount ?? row.monthlyRepayment),
    frequency: normaliseFrequency(row.frequency || "monthly"),
    paymentDate: row.paymentDate || "",
    paymentHistory: history
  };

  delete debt.monthlyRepayment;
  syncDebtPaidMonths(debt);
  return debt;
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
   BACKUP — EXPORT AND IMPORT
========================================================= */

function initialiseDataTools() {
  const exportButton = document.getElementById("export-data");
  const importButton = document.getElementById("import-data");
  const importInput = document.getElementById("import-file");

  exportButton?.addEventListener("click", () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `financefox-backup-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  importButton?.addEventListener("click", () => importInput?.click());

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (!validObject(parsed)) {
        throw new Error("Not a FinanceFox backup file.");
      }

      const confirmed = window.confirm(
        "Replace everything currently in FinanceFox with this backup?"
      );
      if (!confirmed) return;

      state = migrateState(parsed);
      saveState();
      applyTheme();
      renderEverything();
    } catch (error) {
      console.error("FinanceFox could not import that file:", error);
      window.alert("That file could not be read as a FinanceFox backup.");
    } finally {
      importInput.value = "";
    }
  });
}

/* =========================================================
   ENTRY FORMS — BUILT FROM THE COLUMN LISTS
========================================================= */

function renderEntryForm(type) {
  const form = document.querySelector(`[data-entry-form="${type}"]`);
  if (!form) return;

  const buttonLabels = {
    income: "+ Add Income",
    outgoings: "+ Add Outgoing",
    bills: "+ Add Bill"
  };

  form.innerHTML = `
    ${state.columns[type]
      .map((column) => {
        if (column.format === "frequency") {
          return `
            <select data-field="${column.key}" aria-label="${escapeHtml(
              column.label
            )}">
              ${frequencyOptions()}
            </select>
          `;
        }

        if (column.format === "currency") {
          return `
            <input
              type="number"
              data-field="${column.key}"
              placeholder="${escapeHtml(column.label)}"
              aria-label="${escapeHtml(column.label)}"
              min="0"
              step="0.01"
            />
          `;
        }

        const hint = column.hint
          ? `${column.label}, ${column.hint}`
          : column.label;

        return `
          <input
            type="text"
            data-field="${column.key}"
            placeholder="${escapeHtml(hint)}"
            aria-label="${escapeHtml(column.label)}"
          />
        `;
      })
      .join("")}
    <button class="primary-button" type="submit">${
      buttonLabels[type] || "+ Add Row"
    }</button>
  `;
}

function frequencyOptions(selected = "monthly") {
  const options = [
    ["monthly", "Monthly"],
    ["twice-monthly", "Twice monthly"],
    ["weekly", "Weekly"],
    ["fortnightly", "Every 2 weeks"],
    ["four-weekly", "Every 4 weeks"],
    ["quarterly", "Quarterly"],
    ["annual", "Annually"],
    ["one-off", "One-off"],
    ["other", "Other"]
  ];

  return options
    .map(
      ([value, label]) =>
        `<option value="${value}" ${
          value === selected ? "selected" : ""
        }>${label}</option>`
    )
    .join("");
}

function initialiseEntryForms() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-entry-form]");
    if (!form) return;

    event.preventDefault();

    const type = form.dataset.entryForm;
    if (!["income", "bills", "outgoings"].includes(type)) return;

    const row = { id: createId(type) };

    form.querySelectorAll("[data-field]").forEach((input) => {
      const column = state.columns[type].find(
        (item) => item.key === input.dataset.field
      );

      row[input.dataset.field] = normaliseCellValue(
        input.value,
        column?.format
      );
    });

    if (type === "bills" || type === "outgoings") {
      row.paidMonths = {};
    }

    state[type].push(row);
    form.reset();
    saveState();
    renderTable(type);
  });
}

function normaliseCellValue(value, format) {
  if (format === "currency") return parseMoney(value);
  if (format === "frequency") return normaliseFrequency(value);
  return String(value || "").trim();
}

/* =========================================================
   COLUMN CONTROLS — ADD AND REMOVE
========================================================= */

function initialiseColumnControls() {
  document.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-column]");
    if (addButton) {
      addColumn(addButton.dataset.addColumn);
      return;
    }

    const removeButton = event.target.closest("[data-remove-column]");
    if (removeButton) {
      removeColumn(
        removeButton.dataset.columnType,
        removeButton.dataset.removeColumn
      );
    }
  });
}

function addColumn(type) {
  if (!state.columns[type]) return;

  const label = window.prompt("Name the new column:");
  if (!label?.trim()) return;

  const cleanLabel = label.trim();
  const duplicate = state.columns[type].some(
    (column) => column.label.toLowerCase() === cleanLabel.toLowerCase()
  );

  if (duplicate) {
    window.alert(`This table already has a “${cleanLabel}” column.`);
    return;
  }

  state.columns[type].push({
    key: createId("column"),
    label: cleanLabel
  });

  saveState();
  renderTable(type);
}

function removeColumn(type, key) {
  const column = state.columns[type]?.find((item) => item.key === key);
  if (!column || column.essential) return;

  const confirmed = window.confirm(
    `Remove the “${column.label}” column and everything typed in it?`
  );

  if (!confirmed) return;

  state.columns[type] = state.columns[type].filter(
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
  renderTable("outgoings");
  renderTable("bills");
  renderDebts();
  renderNotes();
}

function renderTable(type) {
  renderEntryForm(type);

  const head = document.getElementById(`${type}-head`);
  const body = document.getElementById(`${type}-body`);
  if (!head || !body) return;

  const columns = state.columns[type];
  const usesPaidCheckbox = type === "bills" || type === "outgoings";

  head.innerHTML = `
    <tr>
      ${columns
        .map(
          (column) => `
            <th>
              <div class="column-heading">
                <span>${escapeHtml(column.label)}</span>
                ${
                  column.essential
                    ? ""
                    : `<button
                         class="remove-column-button"
                         type="button"
                         data-column-type="${type}"
                         data-remove-column="${column.key}"
                         title="Remove the ${escapeHtml(column.label)} column"
                       >×</button>`
                }
              </div>
            </th>
          `
        )
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
        .map(
          (column) => `
            <td
              contenteditable="true"
              spellcheck="false"
              data-table-type="${type}"
              data-row-id="${row.id}"
              data-field="${column.key}"
              data-format="${column.format || "text"}"
            >${displayCellValue(row[column.key], column.format)}</td>
          `
        )
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

function displayCellValue(value, format) {
  if (format === "currency") return escapeHtml(formatCurrency(value));
  if (format === "frequency") {
    return escapeHtml(frequencyLabel(normaliseFrequency(value)));
  }
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

  // Enter finishes an edit instead of adding a new line inside the cell.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    const cell = event.target.closest('td[contenteditable="true"]');
    if (!cell) return;

    event.preventDefault();
    cell.blur();
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
    const row = state[type]?.find(
      (item) => item.id === checkbox.dataset.paidId
    );
    if (!row) return;

    row.paidMonths ||= {};
    row.paidMonths[state.budgetMonth] = checkbox.checked;

    saveState();
    updateTableSummaries(type);
  });
}

/* =========================================================
   SUMMARIES AND THE HOME DASHBOARD
========================================================= */

/*
  The frequency alone drives the monthly maths:
  £250 every 2 weeks = £250 × 2 = £500 per month.
*/
function frequencyMultiplier(frequency) {
  const multipliers = {
    monthly: 1,
    "twice-monthly": 2,
    weekly: 4,
    fortnightly: 2,
    "four-weekly": 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
    "one-off": 1,
    other: 1
  };

  return multipliers[normaliseFrequency(frequency)] ?? 1;
}

function monthlyValue(row) {
  return parseMoney(row.amount) * frequencyMultiplier(row.frequency);
}

function updateTableSummaries(type) {
  if (type === "income") updateIncomeSummary();
  if (type === "bills") updateBillsSummary();
  if (type === "outgoings") updateOutgoingsSummary();
  updateHomeSummary();
}

function updateIncomeSummary() {
  const total = state.income.reduce((sum, row) => sum + monthlyValue(row), 0);
  setText("income-total", formatCurrency(total));

  const container = document.getElementById("income-summary");
  if (!container) return;

  if (state.income.length === 0) {
    container.innerHTML = `<div class="empty-card">Add income to build the monthly summary.</div>`;
    return;
  }

  container.innerHTML = state.income
    .map((row) => {
      const multiplier = frequencyMultiplier(row.frequency);

      return `
        <article class="summary-item">
          <div>
            <span>${escapeHtml(row.source || "Unnamed income")}</span>
            <small>
              ${formatCurrency(row.amount)} ${escapeHtml(
                frequencyLabel(normaliseFrequency(row.frequency)).toLowerCase()
              )}${
                multiplier !== 1 ? ` (× ${formatNumber(multiplier)})` : ""
              }${row.date ? ` · ${escapeHtml(row.date)}` : ""}
            </small>
          </div>
          <strong>${formatCurrency(monthlyValue(row))}</strong>
        </article>
      `;
    })
    .join("");
}

function updateBillsSummary() {
  const total = state.bills.reduce((sum, row) => sum + monthlyValue(row), 0);
  const paid = state.bills.filter(
    (row) => row.paidMonths?.[state.budgetMonth]
  ).length;

  setText("bills-total", formatCurrency(total));
  setText("bills-paid-count", `${paid}/${state.bills.length}`);
}

function updateOutgoingsSummary() {
  const total = state.outgoings.reduce(
    (sum, row) => sum + monthlyValue(row),
    0
  );
  const paid = state.outgoings.filter(
    (row) => row.paidMonths?.[state.budgetMonth]
  ).length;

  setText("outgoings-total", formatCurrency(total));
  setText("outgoings-paid-count", `${paid}/${state.outgoings.length}`);
}

function updateHomeSummary() {
  const income = state.income.reduce((sum, row) => sum + monthlyValue(row), 0);
  const bills = state.bills.reduce((sum, row) => sum + monthlyValue(row), 0);
  const outgoings = state.outgoings.reduce(
    (sum, row) => sum + monthlyValue(row),
    0
  );
  const debts = calculateDebtTotals();

  const totalOut = bills + outgoings + debts.monthly;
  const leftOver = income - totalOut;

  setText("home-income-total", formatCurrency(income));
  setText("home-outgoings-total", formatCurrency(totalOut));
  setText("home-leftover", formatSignedCurrency(leftOver));

  const leftoverCard = document.getElementById("home-leftover-card");
  if (leftoverCard) {
    leftoverCard.classList.toggle("stat-negative", leftOver < 0);
    leftoverCard.classList.toggle("stat-positive", leftOver >= 0);
  }
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
      values[field] = ["originalAmount", "repaymentAmount"].includes(field)
        ? parseMoney(input.value)
        : input.value.trim();
    });

    state.debts.push({
      id: createId("debt"),
      originalCompany: values.originalCompany || "",
      originalAmount: values.originalAmount || 0,
      originalReference: values.originalReference || "",
      collectionAgency: values.collectionAgency || "",
      collectionReference: values.collectionReference || "",
      repaymentAmount: values.repaymentAmount || 0,
      frequency: normaliseFrequency(values.frequency),
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

/*
  One block per payment: a £500 debt at £50 per payment is a
  10-block tracker regardless of how often the payments land.
*/
function calculateDebt(debt) {
  ensureDebtTracking(debt);

  const originalAmount = parseMoney(debt.originalAmount);
  const repaymentAmount = parseMoney(debt.repaymentAmount);
  const canCalculate = originalAmount > 0 && repaymentAmount > 0;
  const plannedPayments = canCalculate
    ? Math.ceil(originalAmount / repaymentAmount)
    : 0;
  const paymentsMade = Math.min(debt.paymentHistory.length, plannedPayments);
  const remainingPayments = Math.max(0, plannedPayments - paymentsMade);
  const remainingAmount = Math.max(
    0,
    originalAmount - paymentsMade * repaymentAmount
  );

  return {
    originalAmount,
    repaymentAmount,
    canCalculate,
    plannedPayments,
    paymentsMade,
    remainingPayments,
    remainingAmount
  };
}

function calculateDebtTotals() {
  let monthly = 0;
  let remaining = 0;
  let cleared = 0;

  state.debts.forEach((debt) => {
    const calculation = calculateDebt(debt);

    if (calculation.canCalculate) {
      remaining += calculation.remainingAmount;
      cleared += calculation.originalAmount - calculation.remainingAmount;
    } else {
      remaining += calculation.originalAmount;
    }

    const stillOwing =
      !calculation.canCalculate || calculation.remainingAmount > 0;

    if (stillOwing) {
      monthly +=
        calculation.repaymentAmount * frequencyMultiplier(debt.frequency);
    }
  });

  return { monthly, remaining, cleared };
}

function renderDebts() {
  renderDebtTable();
  renderDebtSummary();
  renderDebtTimelines();
  updateHomeSummary();
}

function renderDebtTable() {
  const body = document.getElementById("debt-body");
  if (!body) return;

  if (state.debts.length === 0) {
    body.innerHTML = `
      <tr>
        <td class="empty-row" colspan="11">No debts have been added yet.</td>
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
        (calculation.remainingPayments === 0 && !paidThisMonth);

      return `
        <tr>
          ${debtEditableCell(debt, "originalCompany", debt.originalCompany)}
          ${debtEditableCell(
            debt,
            "originalReference",
            debt.originalReference
          )}
          ${debtEditableCell(debt, "collectionAgency", debt.collectionAgency)}
          ${debtEditableCell(
            debt,
            "collectionReference",
            debt.collectionReference
          )}
          ${debtEditableCell(
            debt,
            "repaymentAmount",
            formatCurrency(calculation.repaymentAmount),
            "currency"
          )}
          ${debtEditableCell(
            debt,
            "frequency",
            frequencyLabel(normaliseFrequency(debt.frequency)),
            "frequency"
          )}
          ${debtEditableCell(debt, "paymentDate", debt.paymentDate)}
          <td>${
            calculation.canCalculate ? calculation.remainingPayments : "—"
          }</td>
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

    const debt = state.debts.find(
      (item) => item.id === checkbox.dataset.debtPaid
    );
    if (!debt) return;

    const changed = checkbox.checked
      ? recordDebtPayment(debt)
      : removeDebtPaymentForMonth(debt, state.budgetMonth);

    if (!changed) {
      checkbox.checked = Boolean(debt.paidMonths?.[state.budgetMonth]);
      return;
    }

    saveState();
    renderDebts();
  });

  document.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-debt]");
    if (deleteButton) {
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
      return;
    }

    const owedButton = event.target.closest("[data-edit-owed]");
    if (owedButton) {
      const debt = state.debts.find(
        (item) => item.id === owedButton.dataset.editOwed
      );
      if (!debt) return;

      const answer = window.prompt(
        "Total amount owed for this debt:",
        parseMoney(debt.originalAmount) || ""
      );
      if (answer === null) return;

      debt.originalAmount = parseMoney(answer);
      saveState();
      renderDebts();
    }
  });
}

function recordDebtPayment(debt) {
  const calculation = calculateDebt(debt);

  if (!calculation.canCalculate || calculation.remainingPayments <= 0) {
    return false;
  }

  debt.paymentHistory.push({
    id: createId("payment"),
    month: state.budgetMonth,
    amount: Math.min(
      calculation.repaymentAmount,
      calculation.remainingAmount
    ),
    recordedAt: new Date().toISOString()
  });

  syncDebtPaidMonths(debt);
  return true;
}

function removeDebtPaymentForMonth(debt, month) {
  ensureDebtTracking(debt);

  for (let index = debt.paymentHistory.length - 1; index >= 0; index -= 1) {
    if (debt.paymentHistory[index].month === month) {
      debt.paymentHistory.splice(index, 1);
      syncDebtPaidMonths(debt);
      return true;
    }
  }

  return false;
}

function undoLatestDebtPayment(debt) {
  ensureDebtTracking(debt);
  debt.paymentHistory.pop();
  syncDebtPaidMonths(debt);
}

function syncDebtPaidMonths(debt) {
  debt.paymentHistory = Array.isArray(debt.paymentHistory)
    ? debt.paymentHistory
    : [];
  debt.paidMonths = {};

  for (const payment of debt.paymentHistory) {
    if (payment.month) debt.paidMonths[payment.month] = true;
  }
}

function initialiseDebtTimelineActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-debt-timeline-action]");
    if (!button) return;

    const debt = state.debts.find((item) => item.id === button.dataset.debtId);
    if (!debt) return;

    const action = button.dataset.debtTimelineAction;

    if (action === "pay-next") {
      const changed = recordDebtPayment(debt);
      if (!changed) return;
    }

    if (action === "undo-latest") {
      undoLatestDebtPayment(debt);
    }

    saveState();
    renderDebts();
  });
}

function renderDebtSummary() {
  const totals = calculateDebtTotals();

  setText("debt-monthly-total", formatCurrency(totals.monthly));
  setText("debt-remaining-total", formatCurrency(totals.remaining));

  const container = document.getElementById("debt-payment-summary");
  if (!container) return;

  const repayments = state.debts.filter(
    (debt) => parseMoney(debt.repaymentAmount) > 0
  );

  if (repayments.length === 0) {
    container.innerHTML = `<div class="empty-card">Add debt repayments to build this summary.</div>`;
    return;
  }

  container.innerHTML = repayments
    .map((debt) => {
      const monthly =
        parseMoney(debt.repaymentAmount) * frequencyMultiplier(debt.frequency);

      return `
        <article class="summary-item">
          <div>
            <span>${escapeHtml(
              debt.collectionAgency || debt.originalCompany || "Unnamed debt"
            )}</span>
            <small>
              ${formatCurrency(debt.repaymentAmount)} ${escapeHtml(
                frequencyLabel(normaliseFrequency(debt.frequency)).toLowerCase()
              )}${
                debt.paymentDate ? ` · ${escapeHtml(debt.paymentDate)}` : ""
              }
            </small>
          </div>
          <strong>${formatCurrency(monthly)}</strong>
        </article>
      `;
    })
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
            Add the amount owed and cost per payment to generate this tracker.
          </div>
        `;
      } else {
        const firstPaidIndex =
          calculation.plannedPayments - calculation.paymentsMade;
        const nextIndex = firstPaidIndex - 1;

        tracker = `
          <div class="timeline-track">
            ${Array.from(
              { length: calculation.plannedPayments },
              (_, index) => {
                const number = index + 1;
                const paid = index >= firstPaidIndex;
                const latestPaid =
                  calculation.paymentsMade > 0 && index === firstPaidIndex;
                const nextToPay =
                  calculation.remainingPayments > 0 && index === nextIndex;

                let action = "";
                let disabled = "disabled";
                let title = `Payment ${number} remaining`;

                if (latestPaid) {
                  action = "undo-latest";
                  disabled = "";
                  title = `Payment ${number} made — click to undo the latest payment`;
                } else if (nextToPay) {
                  action = "pay-next";
                  disabled = "";
                  title = `Payment ${number} — click to record a payment for ${formatBudgetMonth(
                    state.budgetMonth
                  )}`;
                } else if (paid) {
                  title = `Payment ${number} made`;
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
                    ? ` · ${calculation.paymentsMade} of ${calculation.plannedPayments} payments made`
                    : ""
                }
                ${
                  debt.paymentDate
                    ? ` · Payment date: ${escapeHtml(debt.paymentDate)}`
                    : ""
                }
              </p>
            </div>
            <button
              class="remaining-badge"
              type="button"
              data-edit-owed="${debt.id}"
              title="Click to edit the total amount owed"
            >${
              calculation.canCalculate
                ? `${formatCurrency(calculation.remainingAmount)} remaining`
                : "Set amount owed"
            }</button>
          </div>
          ${tracker}
          ${
            calculation.canCalculate && calculation.remainingPayments === 0
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

function formatSignedCurrency(value) {
  const number = Number(value) || 0;
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP"
  }).format(Math.abs(number));

  return number < 0 ? `−${formatted}` : formatted;
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
