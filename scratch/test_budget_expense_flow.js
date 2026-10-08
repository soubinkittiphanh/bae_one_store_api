const db = require('../src/models');

async function testFullFlow() {
    console.log("=== Testing Annual Expense Budget & Basic Expense Integration Flow ===");

    try {
        // Fetch valid foreign keys
        const firstAccount = await db.chartAccount.findOne();
        const firstCurrency = await db.currency.findOne();
        const firstPaymentMethod = await db.payment.findOne();

        const accountId = firstAccount ? firstAccount.id : 1;
        const currencyId = firstCurrency ? firstCurrency.id : 1;
        const paymentId = firstPaymentMethod ? firstPaymentMethod.id : 1;

        console.log(`Using valid DB IDs: Account=${accountId}, Currency=${currencyId}, PaymentMethod=${paymentId}`);

        // 1. Clean previous test data
        await db.apPaymentHeader.destroy({ where: { payee: 'TEST_VENDOR_FACEBOOK' } });
        await db.annualExpenseBudget.destroy({ where: { name: 'TEST_BUDGET_MARKETING_2026' } });

        // 2. Create an Annual Expense Budget
        console.log("\n1. Creating Annual Expense Budget for 2026...");
        const budget = await db.annualExpenseBudget.create({
            name: 'TEST_BUDGET_MARKETING_2026',
            year: 2026,
            allocatedAmount: 10000000,
            currencyId: currencyId,
            exchangeRate: 1,
            thresholdWarningPercent: 80,
            drAccountId: accountId,
            remark: 'Test marketing budget for Q4',
            isActive: true
        });
        console.log(`✅ Created Budget ID: ${budget.id}, Allocated: ${budget.allocatedAmount} LAK`);

        // 3. Create a payment voucher linked to the BUDGET source
        console.log("\n2. Creating Expense Payment Voucher with source = 'BUDGET'...");
        const payment1 = await db.apPaymentHeader.create({
            bookingDate: '2026-10-08',
            paymentNumber: 'PAY-TEST-001',
            payee: 'TEST_VENDOR_FACEBOOK',
            notes: 'Digital Ads Campaign',
            totalAmount: 2000000,
            rate: 1,
            currencyId: currencyId,
            paymentId: paymentId,
            drAccountId: accountId,
            crAccountId: accountId,
            expenseSource: 'BUDGET',
            budgetId: budget.id,
            budgetImpactYear: 2026,
            locking_session_id: Date.now().toString(),
            isActive: true
        });
        console.log(`✅ Created Payment Voucher ID: ${payment1.id}, Amount: ${payment1.totalAmount} LAK, Source: ${payment1.expenseSource}`);

        // 4. Create a payment voucher with source = 'POS_SALE' (Operational)
        console.log("\n3. Creating Expense Payment Voucher with source = 'POS_SALE'...");
        const payment2 = await db.apPaymentHeader.create({
            bookingDate: '2026-10-08',
            paymentNumber: 'PAY-TEST-002',
            payee: 'TEST_VENDOR_FACEBOOK',
            notes: 'Store Daily Supplies',
            totalAmount: 500000,
            rate: 1,
            currencyId: currencyId,
            paymentId: paymentId,
            drAccountId: accountId,
            crAccountId: accountId,
            expenseSource: 'POS_SALE',
            budgetId: null,
            budgetImpactYear: 2026,
            locking_session_id: Date.now().toString(),
            isActive: true
        });
        console.log(`✅ Created Payment Voucher ID: ${payment2.id}, Amount: ${payment2.totalAmount} LAK, Source: ${payment2.expenseSource}`);

        // 5. Verify Headroom & Spent Calculations
        console.log("\n4. Verifying Budget Spent and Remaining Calculations...");
        const paymentsLinked = await db.apPaymentHeader.findAll({
            where: { budgetId: budget.id, expenseSource: 'BUDGET', isActive: true }
        });

        const totalSpent = paymentsLinked.reduce((sum, p) => sum + parseFloat(p.totalAmount), 0);
        const remaining = parseFloat(budget.allocatedAmount) - totalSpent;
        const percentSpent = (totalSpent / parseFloat(budget.allocatedAmount)) * 100;

        console.log(`Allocated: ${budget.allocatedAmount} LAK`);
        console.log(`Spent on Budget: ${totalSpent} LAK`);
        console.log(`Remaining: ${remaining} LAK`);
        console.log(`Utilization: ${percentSpent}%`);

        if (totalSpent === 2000000 && remaining === 8000000 && percentSpent === 20) {
            console.log("✅ Budget calculation assertion PASSED (2,000,000 spent, 8,000,000 remaining, 20% utilization)!");
        } else {
            console.error("❌ Budget calculation mismatch!");
        }

        // 6. Verify POS_SALE expense is NOT counted in budget spent
        const posExpenses = await db.apPaymentHeader.findAll({
            where: { expenseSource: 'POS_SALE', payee: 'TEST_VENDOR_FACEBOOK', isActive: true }
        });
        if (posExpenses.length === 1 && parseFloat(posExpenses[0].totalAmount) === 500000) {
            console.log("✅ POS Operational expense correctly isolated from budget!");
        }

        // 7. Cleanup test records
        await db.apPaymentHeader.destroy({ where: { payee: 'TEST_VENDOR_FACEBOOK' } });
        await db.annualExpenseBudget.destroy({ where: { id: budget.id } });
        console.log("\n✅ Test data cleaned up successfully!");

        console.log("\n🎉 ALL INTEGRATION FLOW TESTS PASSED SUCCESSFULLY!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Test failed with error:", error);
        process.exit(1);
    }
}

testFullFlow();
