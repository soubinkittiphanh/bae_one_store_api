const db = require('./src/models');
const { Op } = require('sequelize');
const common = require('./src/common');

async function seedBeerlaoAgencyData() {
    console.log("=================================================================");
    console.log("🍺 Starting Beerlao Agency Packaging & Promo Test Data Seeding...");
    console.log("=================================================================");

    try {
        // 1. Ensure Company & Location
        let company = await db.company.findOne();
        if (!company) {
            company = await db.company.create({
                name: 'Beerlao Agency Sole Co., Ltd. (ຕົວແທນຈຳໜ່າຍເບຍລາວ)',
                address: 'Vientiane Capital, Laos',
                tel: '02055599999',
                isActive: true
            });
            console.log("✓ Created Company:", company.name);
        }
        const companyId = company.id || 1;

        let location = await db.location.findOne();
        if (!location) {
            location = await db.location.create({
                name: 'Main Agency Warehouse (ສາງໃຫຍ່ຕົວແທນ)',
                companyId: companyId,
                isActive: true
            });
            console.log("✓ Created Location:", location.name);
        }
        const locationId = location.id || 1;

        // 2. Categories
        const [catBeer] = await db.category.findOrCreate({
            where: { categ_name: 'ເບຍ ແລະ ເຄື່ອງດື່ມ (Beer & Beverages)' },
            defaults: {
                categ_desc: 'Finished beer products sold in returnable cases',
                isActive: true
            }
        });

        const [catPackaging] = await db.category.findOrCreate({
            where: { categ_name: 'ວັດສະດຸບັນຈຸພັນ (Packaging Assets)' },
            defaults: {
                categ_desc: 'Empty crates and glass bottles returnable assets',
                isActive: true
            }
        });
        console.log("✓ Categories configured: Beer & Packaging Assets");

        // 3. Vendor (Lao Brewery Co., Ltd.)
        const [vendorBeerlao] = await db.vendor.findOrCreate({
            where: { name: 'ບໍລິສັດ ເບຍລາວ ຈຳກັດ (Lao Brewery Co., Ltd.)' },
            defaults: {
                tel: '021812001',
                remark: 'Official Beerlao Brewery & Beverage Supplier',
                isActive: true
            }
        });
        console.log("✓ Vendor configured: Lao Brewery Co., Ltd. (ID:", vendorBeerlao.id, ")");

        // Helper to find next available pro_id
        async function getNextProId() {
            const max = await db.product.max('pro_id') || 1000;
            return max + 1;
        }

        // 4. Packaging Asset Products (Empty Crates & Empty Bottles)
        let crateAsset = await db.product.findOne({ where: { barCode: 'PKG-CRATE-BEER' } });
        if (!crateAsset) {
            const nextId = await getNextProId();
            crateAsset = await db.product.create({
                pro_id: nextId,
                pro_name: 'Beerlao Empty Crate (ລັງເປົ່າເບຍລາວ)',
                pro_price: 20000,
                cost_price: 20000,
                barCode: 'PKG-CRATE-BEER',
                isPackagingAsset: true,
                isReturnablePackaging: false,
                _category: 'stock',
                pro_category: catPackaging.categ_id,
                companyId: companyId,
                isActive: true
            });
            console.log("✓ Created Asset: Beerlao Empty Crate (ID:", crateAsset.id, ")");
        } else {
            await crateAsset.update({ isPackagingAsset: true, pro_price: 20000 });
        }

        let bottleAsset = await db.product.findOne({ where: { barCode: 'PKG-BTL-BEER-640' } });
        if (!bottleAsset) {
            const nextId = await getNextProId();
            bottleAsset = await db.product.create({
                pro_id: nextId,
                pro_name: 'Beerlao Empty Glass Bottle 640ml (ແກ້ວເປົ່າ 640ml)',
                pro_price: 2000,
                cost_price: 2000,
                barCode: 'PKG-BTL-BEER-640',
                isPackagingAsset: true,
                isReturnablePackaging: false,
                _category: 'stock',
                pro_category: catPackaging.categ_id,
                companyId: companyId,
                isActive: true
            });
            console.log("✓ Created Asset: Beerlao Empty Glass Bottle (ID:", bottleAsset.id, ")");
        } else {
            await bottleAsset.update({ isPackagingAsset: true, pro_price: 2000 });
        }

        // 5. Finished Beer Cases (Returnable Items)
        const beerCaseDefinitions = [
            {
                name: 'Beerlao Lager Case (12x640ml)',
                price: 180000,
                cost: 165000,
                barcode: 'BEER-LAGER-CASE'
            },
            {
                name: 'Beerlao Dark Case (12x640ml)',
                price: 210000,
                cost: 190000,
                barcode: 'BEER-DARK-CASE'
            },
            {
                name: 'Beerlao Gold Case (12x640ml)',
                price: 220000,
                cost: 200000,
                barcode: 'BEER-GOLD-CASE'
            }
        ];

        const finishedBeerProducts = [];

        for (const def of beerCaseDefinitions) {
            let beerProd = await db.product.findOne({ where: { barCode: def.barcode } });
            if (!beerProd) {
                const nextId = await getNextProId();
                beerProd = await db.product.create({
                    pro_id: nextId,
                    pro_name: def.name,
                    pro_price: def.price,
                    cost_price: def.cost,
                    barCode: def.barcode,
                    isReturnablePackaging: true,
                    isPackagingAsset: false,
                    _category: 'product',
                    pro_category: catBeer.categ_id,
                    companyId: companyId,
                    isActive: true
                });
                console.log(`✓ Created Finished Product: ${def.name} (ID: ${beerProd.id})`);
            } else {
                await beerProd.update({ isReturnablePackaging: true });
            }

            finishedBeerProducts.push(beerProd);

            // 6. Setup Packaging BOM: 1 Case = 1 Crate (20k) + 12 Bottles (2k ea)
            await db.productPackaging.destroy({ where: { productId: beerProd.id } });
            await db.productPackaging.bulkCreate([
                {
                    productId: beerProd.id,
                    packagingProductId: crateAsset.id,
                    quantity: 1,
                    depositPrice: 20000,
                    companyId: companyId,
                    isActive: true
                },
                {
                    productId: beerProd.id,
                    packagingProductId: bottleAsset.id,
                    quantity: 12,
                    depositPrice: 2000,
                    companyId: companyId,
                    isActive: true
                }
            ]);
            console.log(`  └─ Attached Packaging BOM to ${def.name}: 1 Crate (@20k) + 12 Bottles (@2k) = 44,000 LAK Deposit`);
        }

        // 7. Wholesale Clients (Restaurants / Sub-agents)
        const clientDefinitions = [
            {
                name: 'ຮ້ານອາຫານ ສະບາຍດີ',
                company: 'Sabaidee Restaurant (Wholesale Client)',
                telephone: '02055511223',
                credit: 30
            },
            {
                name: 'ຮ້ານ ຄຳໄພ ມິນິມາດ',
                company: 'Khampai Minimart (Sub-Agent)',
                telephone: '02055544556',
                credit: 15
            },
            {
                name: 'ຮ້ານ ດາວເໜືອ ບາ & ຣີສອດ',
                company: 'Dao Neua Bar & Resort',
                telephone: '02055577889',
                credit: 30
            }
        ];

        const seededClients = [];
        for (const def of clientDefinitions) {
            let [client] = await db.client.findOrCreate({
                where: { telephone: def.telephone },
                defaults: {
                    name: def.name,
                    company: def.company,
                    telephone: def.telephone,
                    credit: def.credit,
                    isActive: true
                }
            });
            seededClients.push(client);
            console.log(`✓ Wholesale Client: ${def.company} (ID: ${client.id})`);
        }

        // 8. Seed Customer Packaging Ledger (Historical Debt & Returns)
        const [clientSabaidee, clientKhampai, clientDaoNeua] = seededClients;

        // Clear existing test ledger entries for these clients to ensure clean state
        await db.customerPackagingLedger.destroy({
            where: { clientId: { [Op.in]: seededClients.map(c => c.id) } }
        });

        // Sabaidee: Took 100 cases on Oct 1 (+100 crates, +1200 bottles) -> Returned 70 on Oct 3 (-70 crates, -840 bottles) -> Balance: 30 Crates + 360 Bottles
        await db.customerPackagingLedger.bulkCreate([
            // Oct 01 Delivery
            {
                clientId: clientSabaidee.id,
                packagingProductId: crateAsset.id,
                transactionType: 'DELIVERED_OUT',
                qtyChange: 100,
                balanceAfter: 100,
                depositAmount: 0,
                notes: 'Wholesale Delivery 100 cases #INV-001',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-01 10:00:00')
            },
            {
                clientId: clientSabaidee.id,
                packagingProductId: bottleAsset.id,
                transactionType: 'DELIVERED_OUT',
                qtyChange: 1200,
                balanceAfter: 1200,
                depositAmount: 0,
                notes: 'Wholesale Delivery 1,200 bottles #INV-001',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-01 10:00:00')
            },
            // Oct 03 Return
            {
                clientId: clientSabaidee.id,
                packagingProductId: crateAsset.id,
                transactionType: 'RETURNED_IN',
                qtyChange: -70,
                balanceAfter: 30,
                depositAmount: 0,
                notes: 'Route Empties Pickup from Restaurant',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-03 14:30:00')
            },
            {
                clientId: clientSabaidee.id,
                packagingProductId: bottleAsset.id,
                transactionType: 'RETURNED_IN',
                qtyChange: -840,
                balanceAfter: 360,
                depositAmount: 0,
                notes: 'Route Empties Pickup from Restaurant',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-03 14:30:00')
            },

            // Khampai Minimart: Took 50, Returned 50 -> Balance: 0
            {
                clientId: clientKhampai.id,
                packagingProductId: crateAsset.id,
                transactionType: 'DELIVERED_OUT',
                qtyChange: 50,
                balanceAfter: 50,
                notes: 'Sub-agent delivery 50 cases #INV-002',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-02 09:00:00')
            },
            {
                clientId: clientKhampai.id,
                packagingProductId: crateAsset.id,
                transactionType: 'RETURNED_IN',
                qtyChange: -50,
                balanceAfter: 0,
                notes: 'Sub-agent full empties swap',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-04 11:00:00')
            },

            // Dao Neua Bar: Took 40 cases -> Balance: 40 Crates + 480 Bottles
            {
                clientId: clientDaoNeua.id,
                packagingProductId: crateAsset.id,
                transactionType: 'DELIVERED_OUT',
                qtyChange: 40,
                balanceAfter: 40,
                notes: 'Delivery 40 cases #INV-003',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-04 16:00:00')
            },
            {
                clientId: clientDaoNeua.id,
                packagingProductId: bottleAsset.id,
                transactionType: 'DELIVERED_OUT',
                qtyChange: 480,
                balanceAfter: 480,
                notes: 'Delivery 480 bottles #INV-003',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-10-04 16:00:00')
            }
        ]);
        console.log("✓ Seeded Customer Packaging Ledgers (Sabaidee owes 30 crates, Dao Neua owes 40 crates)");

        // 9. Seed Supplier (Beerlao Factory) Packaging Ledger
        await db.supplierPackagingLedger.destroy({
            where: { vendorId: vendorBeerlao.id }
        });

        await db.supplierPackagingLedger.bulkCreate([
            // Sep 28: Received 1,000 cases from Brewery
            {
                vendorId: vendorBeerlao.id,
                manifestNo: 'REC-2026-001',
                packagingProductId: crateAsset.id,
                transactionType: 'RECEIVED_FULL',
                qtyChange: 1000,
                balanceAfter: 1000,
                notes: 'Received 1,000 cases from Lao Brewery',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-09-28 08:30:00')
            },
            {
                vendorId: vendorBeerlao.id,
                manifestNo: 'REC-2026-001',
                packagingProductId: bottleAsset.id,
                transactionType: 'RECEIVED_FULL',
                qtyChange: 12000,
                balanceAfter: 12000,
                notes: 'Received 12,000 bottles from Lao Brewery',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-09-28 08:30:00')
            },
            // Sep 28: Handed 900 empties to truck driver
            {
                vendorId: vendorBeerlao.id,
                manifestNo: 'TRK-2026-089',
                packagingProductId: crateAsset.id,
                transactionType: 'RETURNED_EMPTY_TRUCK',
                qtyChange: -900,
                balanceAfter: 100,
                notes: 'Returned 900 empty crates to delivery truck driver',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-09-28 09:30:00')
            },
            {
                vendorId: vendorBeerlao.id,
                manifestNo: 'TRK-2026-089',
                packagingProductId: bottleAsset.id,
                transactionType: 'RETURNED_EMPTY_TRUCK',
                qtyChange: -10800,
                balanceAfter: 1200,
                notes: 'Returned 10,800 empty bottles to delivery truck driver',
                userId: 1,
                companyId: companyId,
                createdAt: new Date('2026-09-28 09:30:00')
            }
        ]);
        console.log("✓ Seeded Supplier Packaging Ledger (100 Crates + 1,200 Bottles liability with Beerlao)");

        // 10. Seed Damage / Breakage Logs
        await db.packagingDamageLog.destroy({
            where: { companyId }
        });

        await db.packagingDamageLog.bulkCreate([
            {
                packagingProductId: bottleAsset.id,
                quantity: 12,
                reason: 'WAREHOUSE_DAMAGE',
                notes: 'ແກ້ວແຕກ 12 ໜ່ວຍ ຍ້ອນຕົກຈາກພາເລດໃນສາງ',
                userId: 1,
                locationId: locationId,
                companyId: companyId,
                createdAt: new Date('2026-10-04 15:00:00')
            },
            {
                packagingProductId: crateAsset.id,
                quantity: 2,
                reason: 'DELIVERY_BREAKAGE',
                notes: 'ລັງຊຳລຸດ 2 ລັງ ແຕກຫັກຕອນຂົນສົ່ງ',
                userId: 1,
                locationId: locationId,
                companyId: companyId,
                createdAt: new Date('2026-10-04 15:10:00')
            }
        ]);
        console.log("✓ Seeded Damage Logs (12 Broken Bottles, 2 Damaged Crates)");

        // 11. Seed Inventory Cards in Warehouse
        const cardStockToSeed = [
            { product: finishedBeerProducts[0], count: 50, cost: 165000 },  // 50 Beerlao Lager Cases
            { product: finishedBeerProducts[1], count: 20, cost: 190000 },  // 20 Beerlao Dark Cases
            { product: crateAsset, count: 30, cost: 20000 },                // 30 Empty Crates ready in warehouse
            { product: bottleAsset, count: 360, cost: 2000 }                // 360 Empty Bottles ready in warehouse
        ];

        for (const item of cardStockToSeed) {
            const existingCount = await db.card.count({
                where: {
                    productId: item.product.id,
                    locationId: locationId,
                    card_isused: 0,
                    isActive: true
                }
            });

            const needed = item.count - existingCount;
            if (needed > 0) {
                const newCards = [];
                for (let i = 0; i < needed; i++) {
                    newCards.push({
                        card_type_code: 10010,
                        product_id: item.product.pro_id,
                        productId: item.product.id,
                        card_number: common.generateLockingSessionId(10) + `_${i}`,
                        cost: item.cost,
                        costLCY: item.cost,
                        exchangeRate: 1,
                        card_isused: 0,
                        isActive: true,
                        locationId: locationId,
                        card_input_date: new Date(),
                        update_time: new Date(),
                        update_time_new: new Date(),
                        inputter: 1,
                        update_user: 1
                    });
                }
                await db.card.bulkCreate(newCards);
            }
        }
        console.log("✓ Seeded Physical Warehouse Stock Cards (50 Lager Cases, 20 Dark Cases, 30 Empty Crates, 360 Empty Bottles)");

        console.log("=================================================================");
        console.log("🎉 Beerlao Agency Test Data Seeding Completed Successfully!");
        console.log("=================================================================");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seeding failed with error:", err);
        process.exit(1);
    }
}

seedBeerlaoAgencyData();
