const db = require('./src/models');

async function seed() {
    try {
        console.log("Seeding standard Transaction Codes...");

        const transactionCodes = [
            // ==========================================
            // INCOME CODES
            // ==========================================
            {
                code: 'INC-SALES',
                type: 'INCOME',
                description: 'ລາຍຮັບຈາກການຂາຍສິນຄ້າ (Product Sales Revenue)',
                isActive: true
            },
            {
                code: 'INC-SERVICE',
                type: 'INCOME',
                description: 'ລາຍຮັບຈາກການບໍລິການ (Service Revenue)',
                isActive: true
            },
            {
                code: 'INC-OTHER',
                type: 'INCOME',
                description: 'ລາຍຮັບອື່ນໆ (Other Revenue)',
                isActive: true
            },
            // ==========================================
            // EXPENSE CODES
            // ==========================================
            {
                code: 'EXP-COGS',
                type: 'EXPENSE',
                description: 'ຕົ້ນທຶນຊື້ສິນຄ້າ / ຄ່າຊື້ສິນຄ້າ (Cost of Goods Sold / Purchases)',
                isActive: true
            },
            {
                code: 'EXP-SALARY',
                type: 'EXPENSE',
                description: 'ເງິນເດືອນ ແລະ ສະຫວັດດີການພະນັກງານ (Salaries, Wages & Benefits)',
                isActive: true
            },
            {
                code: 'EXP-RENT',
                type: 'EXPENSE',
                description: 'ຄ່າເຊົ່າສະຖານທີ່ (Rent Expense)',
                isActive: true
            },
            {
                code: 'EXP-UTILITIES',
                type: 'EXPENSE',
                description: 'ຄ່ານ້ຳ, ຄ່າໄຟ ແລະ ຄ່າອິນເຕີເນັດ (Electricity, Water & Internet)',
                isActive: true
            },
            {
                code: 'EXP-OFFICE',
                type: 'EXPENSE',
                description: 'ອຸປະກອນຫ້ອງການ ແລະ ສິ່ງພິມ (Office Supplies & Stationeries)',
                isActive: true
            },
            {
                code: 'EXP-MARKETING',
                type: 'EXPENSE',
                description: 'ຄ່າໂຄສະນາ ແລະ ການຕະຫຼາດ (Marketing & Advertising)',
                isActive: true
            },
            {
                code: 'EXP-REPAIR',
                type: 'EXPENSE',
                description: 'ຄ່າບຳລຸງຮັກສາ ແລະ ສ້ອມແປງ (Maintenance & Repairs)',
                isActive: true
            },
            {
                code: 'EXP-TRAVEL',
                type: 'EXPENSE',
                description: 'ຄ່າເດີນທາງ ແລະ ນ້ຳມັນລົດ (Travel & Fuel Expenses)',
                isActive: true
            },
            {
                code: 'EXP-MISC',
                type: 'EXPENSE',
                description: 'ລາຍຈ່າຍອື່ນໆ (Miscellaneous Expenses)',
                isActive: true
            }
        ];

        for (const tc of transactionCodes) {
            const [record, created] = await db.Transaction.findOrCreate({
                where: { code: tc.code },
                defaults: tc
            });

            if (!created) {
                await record.update(tc);
                console.log(`Updated Transaction Code: ${tc.code}`);
            } else {
                console.log(`Created Transaction Code: ${tc.code}`);
            }
        }

        console.log("Transaction Codes seeded successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding transaction codes:", error);
        process.exit(1);
    }
}

seed();
