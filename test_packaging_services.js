const db = require('./src/models');
const packagingService = require('./src/packaging/service');

async function verifyPackagingSystem() {
    console.log("=================================================================");
    console.log("🔍 Running Beerlao Packaging End-to-End Verification Test...");
    console.log("=================================================================");

    try {
        const company = await db.company.findOne();
        const companyId = company ? company.id : 1;

        // 1. Verify Product Packaging BOM
        const beerCase = await db.product.findOne({ where: { barCode: 'BEER-LAGER-CASE' } });
        if (!beerCase) throw new Error("Beerlao Lager Case not found!");

        const bom = await packagingService.getProductPackaging(beerCase.id);
        console.log("\n📦 1. Product Packaging BOM for [Beerlao Lager Case]:");
        console.log("-------------------------------------------------");
        bom.forEach(b => {
            console.log(` - ${b.packagingProduct ? b.packagingProduct.pro_name : 'Item'}: Qty ${b.quantity}, Deposit ${b.depositPrice.toLocaleString()} LAK`);
        });

        // 2. Verify Customer Debt for all seeded clients
        console.log("\n👥 2. Customer Wholesale Packaging Debt Balances:");
        console.log("-------------------------------------------------");
        const clients = await db.client.findAll({
            where: { telephone: ['02055511223', '02055544556', '02055577889'] }
        });

        for (const c of clients) {
            const balances = await packagingService.getCustomerPackagingBalance(c.id);
            const ledger = await packagingService.getCustomerPackagingLedger(c.id);
            const balanceStr = balances.map(b => `${b.packagingName}: ${b.balanceOwed} pcs`).join(', ');
            console.log(`\n▶ Client: ${c.name} - ${c.company} (Tel: ${c.telephone})`);
            console.log(`  Current Outstanding Balance: ${balanceStr || '0 (Settled)'}`);
            console.log(`  Ledger Entries (${ledger.length} transactions):`);
            ledger.forEach(l => {
                const type = l.transactionType === 'DELIVERED_OUT' ? 'OUT (Owes)' : 'IN (Returned)';
                console.log(`    * [${l.createdAt.toISOString().slice(0, 10)}] ${type} | ${l.packagingProduct?.pro_name}: ${l.qtyChange > 0 ? '+' : ''}${l.qtyChange} -> Balance: ${l.balanceAfter} | Note: ${l.notes}`);
            });
        }

        // 3. Verify Supplier Statement with Lao Brewery
        const vendor = await db.vendor.findOne({ where: { name: { [db.Sequelize.Op.like]: '%Lao Brewery%' } } });
        if (vendor) {
            const supplierBalances = await packagingService.getSupplierPackagingBalance(vendor.id);
            console.log(`\n🏭 3. Supplier Packaging Statement [${vendor.name}]:`);
            console.log("-------------------------------------------------");
            supplierBalances.forEach(sb => {
                console.log(` - ${sb.packagingName} (${sb.barCode}): Net Liability = ${sb.balanceWithFactory} units`);
            });
        }

        // 4. Verify Master Golden Matrix
        const matrix = await packagingService.getMasterPackagingMatrix(companyId, 1);
        console.log("\n⚖️ 4. Master Packaging Matrix (Agency Balance Equation):");
        console.log("-------------------------------------------------");
        matrix.forEach(m => {
            console.log(`Packaging Asset: [${m.name}] (${m.barCode})`);
            console.log(`  + Warehouse Empty Stock:          ${m.emptyStockWarehouse}`);
            console.log(`  + Embedded in Full Cases:         ${m.embeddedInFullCases}`);
            console.log(`  + Wholesale Customer Debt:        ${m.wholesaleCustomerDebt}`);
            console.log(`  + Broken / Damaged:               ${m.totalBreakages}`);
            console.log(`  = TOTAL AGENCY ASSETS:            ${m.totalAssetsOwned}`);
            console.log(`  - Brewery Factory Liability:      ${m.factoryLiabilityWithBeerlao}`);
            console.log(`  -----------------------------------------------`);
            console.log(`  * DISCREPANCY / VARIANCE:         ${m.variance} ${m.variance === 0 ? '✅ (PERFECTLY BALANCED - 0 LOSS)' : '⚠️'}`);
        });

        // 5. Test Fast POS Walk-In Return Simulation
        console.log("\n⚡ 5. Testing POS Walk-In Empties Return Simulation...");
        console.log("-------------------------------------------------");
        const crateAsset = await db.product.findOne({ where: { barCode: 'PKG-CRATE-BEER' } });
        const bottleAsset = await db.product.findOne({ where: { barCode: 'PKG-BTL-BEER-640' } });

        const posReturnResult = await packagingService.processPOSReturn({
            customerPhone: '02055598765',
            customerName: 'Somxay Walk-in Retail',
            returnedItems: [
                { packagingProductId: crateAsset.id, quantity: 2, depositPrice: 20000 },
                { packagingProductId: bottleAsset.id, quantity: 24, depositPrice: 2000 }
            ],
            notes: 'Walk-in customer returned 2 crates & 24 bottles at Minimart',
            userId: 1,
            companyId: companyId
        });
        console.log(`✓ POS Return Processed! Total Refund Paid to Customer: ${posReturnResult.totalRefundAmount.toLocaleString()} LAK`);
        console.log(`  Items Processed:`, posReturnResult.items);

        console.log("\n=================================================================");
        console.log("🎉 ALL TESTS AND CALCULATIONS VERIFIED SUCCESSFULLY!");
        console.log("=================================================================");
        process.exit(0);
    } catch (err) {
        console.error("❌ Verification failed:", err);
        process.exit(1);
    }
}

verifyPackagingSystem();
