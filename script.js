"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM ---
  const form = document.getElementById("calcForm");
  const principalEl = document.getElementById("principal");
  const monthlyContribEl = document.getElementById("monthlyContribution");
  const rateEl = document.getElementById("interestRate");
  const rangeEl = document.getElementById("interestRange");
  const yearsEl = document.getElementById("durationYears");
  const compoundingEl = document.getElementById("compounding"); // dropdown
  const displayModeEl = document.getElementById("displayMode");

  const summary = document.getElementById("summary");
  const endingBalanceEl = document.getElementById("endingBalance");
  const summaryModeLabel = document.getElementById("summaryModeLabel");
  const rangeSummaryEl = document.getElementById("rangeSummary");

  const viewSelect = document.getElementById("viewSelect");
  const chartContainer = document.getElementById("chart-container");
  const hoverInfo = document.getElementById("hoverInfo");
  const tableHead = document.getElementById("tableHead");
  const tableBody = document.getElementById("tableBody");
  const tableContainer = document.getElementById("table-container");

  // --- Consts & state ---
  const INFL = 0.03; // 3% inflation
  let currentView = "yearly";
  let durationYearsCache = 0;

  let monthlyResults = [];
  let yearlyResults = [];
  let minMonthlyResults = [];
  let minYearlyResults = [];
  let maxMonthlyResults = [];
  let maxYearlyResults = [];

  let baseRate = 0;
  let minRate = 0;
  let maxRate = 0;
  let rangeValue = 0;

  let chart;

  // --- Helpers: compounding models ---
  // Your original monthly/yearly functions can be kept if you had them; these are safe drop-ins.

  // Monthly compounding: interest each month on prior balance, then add deposit at month end
  function computeMonthly(principal, r, mContrib, months) {
    const out = [];
    let bal = principal;
    for (let m = 1; m <= months; m++) {
      const start = bal;
      const i = start * (r / 12);
      bal = start + i + mContrib;
      out.push({ period: m, startBalance: start, deposit: mContrib, interest: i, endBalance: bal });
    }
    return out;
  }

  // Yearly compounding: interest once per year; deposits monthly before year-end interest
  function computeYearly(principal, r, mContrib, months) {
    const out = [];
    let bal = principal;
    for (let m = 1; m <= months; m++) {
      const start = bal;
      // add monthly deposit
      bal = start + mContrib;
      let i = 0;
      if (m % 12 === 0) {
        i = bal * r;
        bal += i;
      }
      out.push({ period: m, startBalance: start, deposit: mContrib, interest: i, endBalance: bal });
    }
    return out;
  }

  // Quarterly / Semi-Annually: interest at end of each period; deposits monthly
  function computePeriodic(principal, r, mContrib, months, periodsPerYear) {
    const out = [];
    let bal = principal;
    const monthsPerPeriod = Math.round(12 / periodsPerYear);
    for (let m = 1; m <= months; m++) {
      const start = bal;
      bal = start + mContrib;
      let i = 0;
      if (m % monthsPerPeriod === 0) {
        i = bal * (r / periodsPerYear);
        bal += i;
      }
      out.push({ period: m, startBalance: start, deposit: mContrib, interest: i, endBalance: bal });
    }
    return out;
  }

  // Daily: use effective monthly factor derived from daily compounding
  function computeDailyEffective(principal, r, mContrib, months) {
    const out = [];
    let bal = principal;
    const monthlyFactor = Math.pow(1 + r / 365, 365 / 12);
    for (let m = 1; m <= months; m++) {
      const start = bal;
      // deposit then interest on the month's balance
      const preInterest = start + mContrib;
      const end = preInterest * monthlyFactor;
      const i = end - preInterest;
      bal = end;
      out.push({ period: m, startBalance: start, deposit: mContrib, interest: i, endBalance: bal });
    }
    return out;
  }

  // Group to yearly rows for yearly view
  function groupByYear(monthly) {
    const out = [];
    const years = Math.floor(monthly.length / 12);
    for (let y = 1; y <= years; y++) {
      const s = (y - 1) * 12;
      const e = y * 12 - 1;
      const start = monthly[s].startBalance;
      const end = monthly[e].endBalance;
      const contribs = monthly.slice(s, e + 1).reduce((sum, r) => sum + (r.deposit || 0), 0);
      const interest = monthly.slice(s, e + 1).reduce((sum, r) => sum + (r.interest || 0), 0);
      out.push({ period: y, startBalance: start, contributions: contribs, interest, endBalance: end });
    }
    return out;
  }

  // Inflation transform (display-time only)
  function realValue(nominal, periodIndex, isMonthly) {
    const years = isMonthly ? periodIndex / 12 : periodIndex;
    return nominal / Math.pow(1 + INFL, years);
  }

  // --- Submit ---
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const principal = parseFloat(principalEl.value);
    const mContrib = parseFloat(monthlyContribEl.value);
    const rate = parseFloat(rateEl.value) / 100;
    const years = parseInt(yearsEl.value, 10);
    const comp = (compoundingEl && compoundingEl.value) ? compoundingEl.value : "monthly";
    const rangePct = rangeEl.value ? parseFloat(rangeEl.value) / 100 : 0;

    if ([principal, mContrib, rate, years].some(v => isNaN(v)) || years <= 0) {
      alert("Please fill in all fields correctly.");
      return;
    }

    durationYearsCache = years;
    baseRate = rate;
    rangeValue = Math.max(0, rangePct);
    minRate = Math.max(0, rate - rangeValue);
    maxRate = rate + rangeValue;

    const months = years * 12;

    // Compute base series
    monthlyResults = computeByCompounding(comp, principal, rate, mContrib, months);
    yearlyResults = groupByYear(monthlyResults);

    // Range series
    minMonthlyResults = [];
    minYearlyResults = [];
    maxMonthlyResults = [];
    maxYearlyResults = [];
    if (rangeValue > 0) {
      minMonthlyResults = computeByCompounding(comp, principal, minRate, mContrib, months);
      maxMonthlyResults = computeByCompounding(comp, principal, maxRate, mContrib, months);
      minYearlyResults = groupByYear(minMonthlyResults);
      maxYearlyResults = groupByYear(maxMonthlyResults);
    }

    // Reveal UI
    summary.classList.remove("hidden");
    chartContainer.classList.remove("hidden");
    tableContainer.classList.remove("hidden");

    // Default to yearly view
    currentView = viewSelect.value || "yearly";

    updateSummary();
    updateChart();
    updateTable();
  });

  function computeByCompounding(comp, principal, rate, mContrib, months) {
    switch (comp) {
      case "monthly": return computeMonthly(principal, rate, mContrib, months);
      case "yearly": return computeYearly(principal, rate, mContrib, months);
      case "quarterly": return computePeriodic(principal, rate, mContrib, months, 4);
      case "semiannually": return computePeriodic(principal, rate, mContrib, months, 2);
      case "daily": return computeDailyEffective(principal, rate, mContrib, months);
      default: return computeMonthly(principal, rate, mContrib, months);
    }
  }

  // --- Display helpers ---
  function isRealMode() {
    return displayModeEl && displayModeEl.value === "real";
  }

  function capToDuration(arr, view) {
    if (!durationYearsCache) return arr;
    const limit = (view === "monthly") ? durationYearsCache * 12 : durationYearsCache;
    return arr.slice(0, limit);
  }

  // --- Summary ---
  function updateSummary() {
    const base = yearlyResults;
    if (!base.length) return;
    const nominalEnd = base[base.length - 1].endBalance;
    const years = durationYearsCache;

    const finalDisplay = isRealMode() ? (nominalEnd / Math.pow(1 + INFL, years)) : nominalEnd;
    endingBalanceEl.textContent = "$" + finalDisplay.toFixed(2);
    if (summaryModeLabel) {
      summaryModeLabel.textContent = isRealMode() ? "(Inflation-adjusted, 3%)" : "(Nominal)";
    }

    if (rangeValue > 0 && minYearlyResults.length && maxYearlyResults.length) {
      const minNom = minYearlyResults[minYearlyResults.length - 1].endBalance;
      const maxNom = maxYearlyResults[maxYearlyResults.length - 1].endBalance;
      const minDisp = isRealMode() ? (minNom / Math.pow(1 + INFL, years)) : minNom;
      const maxDisp = isRealMode() ? (maxNom / Math.pow(1 + INFL, years)) : maxNom;

      rangeSummaryEl.textContent =
        `Range: ${(minRate * 100).toFixed(2)}% → $${minDisp.toFixed(2)} • ` +
        `${(baseRate * 100).toFixed(2)}% → $${finalDisplay.toFixed(2)} • ` +
        `${(maxRate * 100).toFixed(2)}% → $${maxDisp.toFixed(2)}`;
    } else {
      rangeSummaryEl.textContent = "";
    }
  }

  // --- Chart ---
  function updateChart() {
    if (chart) chart.destroy();
    const ctx = document.getElementById("balanceChart").getContext("2d");

    const rawBaseAll = (currentView === "monthly") ? monthlyResults : yearlyResults;
    const rawBase = capToDuration(rawBaseAll, currentView);
    const labels = rawBase.map(i => currentView === "monthly" ? `Month ${i.period}` : `Year ${i.period}`);

    const dataBase = rawBase.map(i => {
      const nominal = i.endBalance;
      return isRealMode() ? realValue(nominal, i.period, currentView === "monthly") : nominal;
    });

    const datasets = [{
      label: `Balance ${isRealMode() ? "— Real" : ""}`,
      data: dataBase,
      borderColor: "#3b82f6",
      backgroundColor: "rgba(59,130,246,.15)",
      fill: true,
      tension: 0.15,
      pointRadius: 0
    }];

    if (rangeValue > 0 && minMonthlyResults.length && maxMonthlyResults.length) {
      const lowerAll = (currentView === "monthly") ? minMonthlyResults : minYearlyResults;
      const higherAll = (currentView === "monthly") ? maxMonthlyResults : maxYearlyResults;
      const lower = capToDuration(lowerAll, currentView).map(i =>
        isRealMode() ? realValue(i.endBalance, i.period, currentView === "monthly") : i.endBalance
      );
      const higher = capToDuration(higherAll, currentView).map(i =>
        isRealMode() ? realValue(i.endBalance, i.period, currentView === "monthly") : i.endBalance
      );
      datasets.push({
        label: `Lower (${(minRate * 100).toFixed(2)}%)`,
        data: lower,
        borderColor: "#22c55e",
        fill: false,
        tension: 0.15,
        pointRadius: 0
      });
      datasets.push({
        label: `Higher (${(maxRate * 100).toFixed(2)}%)`,
        data: higher,
        borderColor: "#f59e0b",
        fill: false,
        tension: 0.15,
        pointRadius: 0
      });
    }

    chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { display: datasets.length > 1, position: "top" },
          tooltip: {
            enabled: false,
            external: ({ chart, tooltip }) => {
              if (tooltip.opacity === 0) {
                hoverInfo.textContent = "";
                return;
              }
              const idx = tooltip.dataPoints[0].dataIndex;
              const series = rawBase[idx];
              if (!series) return;

              const isMonthlyView = (currentView === "monthly");
              const dispStart = isRealMode() ? realValue(series.startBalance, series.period, isMonthlyView) : series.startBalance;
              const dispEnd = isRealMode() ? realValue(series.endBalance, series.period, isMonthlyView) : series.endBalance;
              const dispInt = isRealMode() ? realValue(series.interest || 0, series.period, isMonthlyView) : (series.interest || 0);
              const dispCon = isMonthlyView
                ? (isRealMode() ? realValue(series.deposit || 0, series.period, isMonthlyView) : (series.deposit || 0))
                : (isRealMode() ? realValue(series.contributions || 0, series.period, isMonthlyView) : (series.contributions || 0));

              hoverInfo.textContent = `${labels[idx]} • Start: $${dispStart.toFixed(2)} • Contrib: $${dispCon.toFixed(2)} • Interest: $${dispInt.toFixed(2)} • End: $${dispEnd.toFixed(2)}`;
            }
          }
        },
        scales: {
          y: {
            ticks: { callback: v => "$" + Number(v).toLocaleString() },
            title: { display: true, text: isRealMode() ? "Real Balance ($)" : "Balance ($)" }
          }
        }
      }
    });
  }

  // --- Table ---
  function updateTable() {
    const raw = (currentView === "monthly") ? monthlyResults : yearlyResults;
    const data = capToDuration(raw, currentView);

    // headers
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    const trh = document.createElement("tr");
    ["Period", "Starting Balance ($)", "Contributions ($)", "Interest ($)", "Ending Balance ($)"].forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    tableHead.appendChild(trh);

    const isMonthlyView = (currentView === "monthly");
    data.forEach(item => {
      const tr = document.createElement("tr");
      const periodLabel = isMonthlyView ? item.period : item.period; // same number; label shows Month/Year in UI
      const start = isRealMode() ? realValue(item.startBalance, item.period, isMonthlyView) : item.startBalance;
      const end = isRealMode() ? realValue(item.endBalance, item.period, isMonthlyView) : item.endBalance;
      const interest = isRealMode() ? realValue(item.interest || 0, item.period, isMonthlyView) : (item.interest || 0);
      const contrib = isMonthlyView
        ? (isRealMode() ? realValue(item.deposit || 0, item.period, isMonthlyView) : (item.deposit || 0))
        : (isRealMode() ? realValue(item.contributions || 0, item.period, isMonthlyView) : (item.contributions || 0));

      tr.innerHTML = `
        <td>${isMonthlyView ? `Month ${periodLabel}` : `Year ${periodLabel}`}</td>
        <td>${start.toFixed(2)}</td>
        <td>${contrib.toFixed(2)}</td>
        <td>${interest.toFixed(2)}</td>
        <td>${end.toFixed(2)}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // --- Listeners ---
  viewSelect.addEventListener("change", () => {
    currentView = viewSelect.value;
    updateSummary();
    updateChart();
    updateTable();
  });

  if (displayModeEl) {
    displayModeEl.addEventListener("change", () => {
      if (summaryModeLabel) summaryModeLabel.textContent = isRealMode() ? "(Inflation-adjusted, 3%)" : "(Nominal)";
      updateSummary();
      updateChart();
      updateTable();
    });
  }
});