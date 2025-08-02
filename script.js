document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('calcForm');
    const summary = document.getElementById('summary');
    const endingBalanceEl = document.getElementById('endingBalance');
    const viewToggle = document.getElementById('viewToggle');
    const viewSelect = document.getElementById('viewSelect');
    const chartContainer = document.getElementById('chart-container');
    const tableContainer = document.getElementById('table-container');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const hoverInfo = document.getElementById('hoverInfo');

    let monthlyResults = [];
    let yearlyResults = [];
    let currentView = 'monthly';
    let chart;

    // Variables for storing results when an interest rate range is specified
    let minMonthlyResults = [];
    let minYearlyResults = [];
    let maxMonthlyResults = [];
    let maxYearlyResults = [];
    // Store the base interest rate and range (as decimals)
    let interestRateValue = 0;
    let rangeValue = 0;
    let minRateValue = 0;
    let maxRateValue = 0;

    // Handle form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        // Retrieve and parse input values
        const principal = parseFloat(document.getElementById('principal').value);
        const monthlyContribution = parseFloat(document.getElementById('monthlyContribution').value);
        const interestRate = parseFloat(document.getElementById('interestRate').value) / 100;
        const durationYears = parseInt(document.getElementById('durationYears').value);
        const compounding = document.querySelector('input[name="compounding"]:checked').value;

        // Parse interest rate range (optional)
        const interestRangeInput = document.getElementById('interestRange').value;
        let rangePercent = parseFloat(interestRangeInput);
        if (isNaN(rangePercent) || rangePercent < 0) {
            rangePercent = 0;
        }
        // Store the base interest rate and range globally (as decimals)
        rangeValue = rangePercent / 100;
        interestRateValue = interestRate;

        // Validate inputs
        if (isNaN(principal) || isNaN(monthlyContribution) || isNaN(interestRate) || isNaN(durationYears)) {
            alert('Please fill in all fields with valid numbers.');
            return;
        }
        if (durationYears <= 0) {
            alert('Duration must be at least 1 year.');
            return;
        }

        const months = durationYears * 12;
        // Compute base results based on compounding frequency
        if (compounding === 'monthly') {
            monthlyResults = computeMonthly(principal, interestRate, monthlyContribution, months);
        } else {
            monthlyResults = computeYearly(principal, interestRate, monthlyContribution, months);
        }
        yearlyResults = groupByYear(monthlyResults);

        // Reset range result arrays
        minMonthlyResults = [];
        minYearlyResults = [];
        maxMonthlyResults = [];
        maxYearlyResults = [];
        minRateValue = 0;
        maxRateValue = 0;
        // If a range is specified, compute results for lower and higher rates
        if (rangeValue > 0) {
            // Determine the lower and higher interest rates (ensuring non-negative values)
            minRateValue = Math.max(interestRate - rangeValue, 0);
            maxRateValue = interestRate + rangeValue;
            if (compounding === 'monthly') {
                minMonthlyResults = computeMonthly(principal, minRateValue, monthlyContribution, months);
                maxMonthlyResults = computeMonthly(principal, maxRateValue, monthlyContribution, months);
            } else {
                minMonthlyResults = computeYearly(principal, minRateValue, monthlyContribution, months);
                maxMonthlyResults = computeYearly(principal, maxRateValue, monthlyContribution, months);
            }
            // Convert monthly results into yearly aggregates for the range datasets
            minYearlyResults = groupByYear(minMonthlyResults);
            maxYearlyResults = groupByYear(maxMonthlyResults);
        }

        // Update summary with the final balance for the base rate
        const finalBalance = monthlyResults[monthlyResults.length - 1].endBalance;
        endingBalanceEl.textContent = '$' + finalBalance.toFixed(2);
        summary.classList.remove('hidden');

        // Update range summary text under the main summary
        const rangeSummaryEl = document.getElementById('rangeSummary');
        if (rangeValue > 0) {
            const finalMin = minMonthlyResults[minMonthlyResults.length - 1].endBalance;
            const finalMax = maxMonthlyResults[maxMonthlyResults.length - 1].endBalance;
            rangeSummaryEl.textContent = `At ${(minRateValue*100).toFixed(2)}%: $${finalMin.toFixed(2)} | At ${(maxRateValue*100).toFixed(2)}%: $${finalMax.toFixed(2)}`;
        } else {
            rangeSummaryEl.textContent = '';
        }

        // Reveal view toggle, chart and table sections
        viewToggle.classList.remove('hidden');
        chartContainer.classList.remove('hidden');
        tableContainer.classList.remove('hidden');

        // Set the current view based on selector and update chart/table
        currentView = viewSelect.value;
        updateChart();
        updateTable();
    });

    // Change view (monthly/yearly)
    viewSelect.addEventListener('change', function() {
        currentView = this.value;
        updateChart();
        updateTable();
    });

    /**
     * Compute results for monthly compounding.
     * Contributions are added at the beginning of the month and interest is applied monthly.
     */
    function computeMonthly(principal, rate, monthlyContribution, months) {
        const results = [];
        let balance = principal;
        for (let m = 1; m <= months; m++) {
            const startBalance = balance;
            const deposit = monthlyContribution;
            // Deposit at the beginning of the period
            const preInterestBalance = startBalance + deposit;
            const interest = preInterestBalance * (rate / 12);
            const endBalance = preInterestBalance + interest;
            results.push({
                period: m,
                startBalance: startBalance,
                deposit: deposit,
                interest: interest,
                endBalance: endBalance
            });
            balance = endBalance;
        }
        return results;
    }

    /**
     * Compute results for yearly compounding.
     * Contributions are added monthly but interest is applied only at the end of each year.
     */
    function computeYearly(principal, rate, monthlyContribution, months) {
        const results = [];
        let balance = principal;
        for (let m = 1; m <= months; m++) {
            const startBalance = balance;
            const deposit = monthlyContribution;
            let endBalance = startBalance + deposit;
            let interest = 0;
            // Apply interest only at the end of each year
            if (m % 12 === 0) {
                interest = endBalance * rate;
                endBalance += interest;
            }
            results.push({
                period: m,
                startBalance: startBalance,
                deposit: deposit,
                interest: interest,
                endBalance: endBalance
            });
            balance = endBalance;
        }
        return results;
    }

    /**
     * Aggregate monthly results into yearly results.
     * Sums contributions and interest for each year and records start and end balances.
     */
    function groupByYear(monthlyResults) {
        const yearly = [];
        const monthsInYear = 12;
        for (let i = 0; i < monthlyResults.length; i++) {
            if ((i + 1) % monthsInYear === 0) {
                const yearIndex = (i + 1) / monthsInYear;
                const startIdx = i - (monthsInYear - 1);
                const startBalance = monthlyResults[startIdx].startBalance;
                let contributions = 0;
                let interestSum = 0;
                for (let j = startIdx; j <= i; j++) {
                    contributions += monthlyResults[j].deposit;
                    interestSum += monthlyResults[j].interest;
                }
                const endBalance = monthlyResults[i].endBalance;
                yearly.push({
                    period: yearIndex,
                    startBalance: startBalance,
                    contributions: contributions,
                    interest: interestSum,
                    endBalance: endBalance
                });
            }
        }
        return yearly;
    }

    /**
     * Render the chart using Chart.js based on the current view.
     */
    function updateChart() {
        // Destroy existing chart instance to avoid duplication
        if (chart) {
            chart.destroy();
        }
        const ctx = document.getElementById('balanceChart').getContext('2d');
        // Base data for labels (always derived from base results)
        const baseData = currentView === 'monthly' ? monthlyResults : yearlyResults;
        const labels = baseData.map(item => currentView === 'monthly' ? 'M' + item.period : 'Year ' + item.period);
        // Build datasets dynamically
        const datasets = [];
        // Base dataset
        datasets.push({
            label: `Base Rate (${(interestRateValue*100).toFixed(2)}%)`,
            data: baseData.map(item => item.endBalance),
            fill: false,
            borderColor: '#007BFF',
            tension: 0.1,
            pointRadius: 3,
            pointHoverRadius: 6
        });
        // Range datasets if range specified
        if (rangeValue > 0) {
            const lowerData = currentView === 'monthly' ? minMonthlyResults : minYearlyResults;
            datasets.push({
                label: `Lower Rate (${(minRateValue*100).toFixed(2)}%)`,
                data: lowerData.map(item => item.endBalance),
                fill: false,
                borderColor: '#28a745',
                tension: 0.1,
                pointRadius: 3,
                pointHoverRadius: 6
            });
            const higherData = currentView === 'monthly' ? maxMonthlyResults : maxYearlyResults;
            datasets.push({
                label: `Higher Rate (${(maxRateValue*100).toFixed(2)}%)`,
                data: higherData.map(item => item.endBalance),
                fill: false,
                borderColor: '#ffc107',
                tension: 0.1,
                pointRadius: 3,
                pointHoverRadius: 6
            });
        }
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        // Show legend only if more than one dataset
                        display: datasets.length > 1,
                        position: 'top'
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest',
                    axis: 'x'
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: currentView === 'monthly' ? 'Month' : 'Year'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Balance ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                // Custom hover handler to display detailed info
                onHover: (event) => {
                    const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
                    if (points.length) {
                        const point = points[0];
                        const datasetIndex = point.datasetIndex;
                        const idx = point.index;
                        let info;
                        let labelPrefix;
                        if (datasetIndex === 0) {
                            info = currentView === 'monthly' ? monthlyResults[idx] : yearlyResults[idx];
                            labelPrefix = `Base Rate (${(interestRateValue*100).toFixed(2)}%)`;
                        } else if (datasetIndex === 1 && rangeValue > 0) {
                            info = currentView === 'monthly' ? minMonthlyResults[idx] : minYearlyResults[idx];
                            labelPrefix = `Lower Rate (${(minRateValue*100).toFixed(2)}%)`;
                        } else if (datasetIndex === 2 && rangeValue > 0) {
                            info = currentView === 'monthly' ? maxMonthlyResults[idx] : maxYearlyResults[idx];
                            labelPrefix = `Higher Rate (${(maxRateValue*100).toFixed(2)}%)`;
                        }
                        let contribValue;
                        if (currentView === 'monthly') {
                            contribValue = info.deposit;
                        } else {
                            contribValue = info.contributions;
                        }
                        hoverInfo.textContent =
                            `${labelPrefix} | ` +
                            (currentView === 'monthly' ? 'Month ' + info.period : 'Year ' + info.period) +
                            ' | Start: $' + info.startBalance.toFixed(2) +
                            ' | Contrib.: $' + contribValue.toFixed(2) +
                            ' | Interest: $' + info.interest.toFixed(2) +
                            ' | End: $' + info.endBalance.toFixed(2);
                    } else {
                        hoverInfo.textContent = '';
                    }
                }
            }
        });
    }

    /**
     * Populate the results table based on the current view.
     */
    function updateTable() {
        const dataArray = currentView === 'monthly' ? monthlyResults : yearlyResults;
        // Clear existing table contents
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';
        // Create header row
        const headerRow = document.createElement('tr');
        const headers = [
            currentView === 'monthly' ? 'Month' : 'Year',
            'Starting Balance ($)',
            'Contributions ($)',
            'Interest ($)',
            'Ending Balance ($)'
        ];
        headers.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        tableHead.appendChild(headerRow);
        // Populate rows
        dataArray.forEach(item => {
            const tr = document.createElement('tr');
            // Period
            const periodCell = document.createElement('td');
            periodCell.textContent = item.period;
            tr.appendChild(periodCell);
            // Starting balance
            const startCell = document.createElement('td');
            startCell.textContent = item.startBalance.toFixed(2);
            tr.appendChild(startCell);
            // Contributions
            const contribCell = document.createElement('td');
            const contribValue = currentView === 'monthly' ? item.deposit : item.contributions;
            contribCell.textContent = contribValue.toFixed(2);
            tr.appendChild(contribCell);
            // Interest
            const interestCell = document.createElement('td');
            interestCell.textContent = item.interest.toFixed(2);
            tr.appendChild(interestCell);
            // Ending balance
            const endCell = document.createElement('td');
            endCell.textContent = item.endBalance.toFixed(2);
            tr.appendChild(endCell);
            tableBody.appendChild(tr);
        });
    }
});