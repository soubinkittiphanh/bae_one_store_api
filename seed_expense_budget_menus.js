const db = require('./src/models');

async function seed() {
    try {
        console.log("Seeding Expense & Annual Budget Maintenance menus...");

        // ---------------------------------------------------------------
        // 1. CREATE MENU HEADER: EXPENSE & BUDGET (code length <= 10)
        // ---------------------------------------------------------------
        const [header, headerCreated] = await db.menuHeader.findOrCreate({
            where: { code: 'EXP_BUD' },
            defaults: {
                code: 'EXP_BUD',
                icon: 'mdi-chart-pie',
                name: 'Expense & Budget',
                llname: 'ລາຍຈ່າຍ ແລະ ງົບປະມານ',
                remark: 'Annual expense budget maintenance and basic cash transactions',
                expand: true,
                isActive: true
            }
        });

        if (headerCreated) {
            console.log("Created Menu Header: EXP_BUD");
        } else {
            console.log("Menu Header already exists: EXP_BUD");
            await header.update({
                icon: 'mdi-chart-pie',
                name: 'Expense & Budget',
                llname: 'ລາຍຈ່າຍ ແລະ ງົບປະມານ',
                remark: 'Annual expense budget maintenance and basic cash transactions',
                isActive: true
            });
        }

        // ---------------------------------------------------------------
        // 2. DEFINE MENU LINES
        // ---------------------------------------------------------------
        const menuLines = [
            {
                name: 'Annual Expense Budget',
                llname: 'ແຜນງົບປະມານປະຈຳປີ',
                icon: 'mdi-chart-pie',
                path: '/admin/expenseBudget',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Basic Expense',
                llname: 'ລາຍຈ່າຍພື້ນຖານ (ຈ່າຍເງິນ)',
                icon: 'mdi-cash-minus',
                path: '/admin/expense',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Basic Income',
                llname: 'ລາຍຮັບພື້ນຖານ (ຮັບເງິນ)',
                icon: 'mdi-cash-plus',
                path: '/admin/income',
                target_systems: 'ALL',
                isActive: true
            }
        ];

        // ---------------------------------------------------------------
        // 3. SEED MENU LINES & PIVOT ASSOCIATIONS
        // ---------------------------------------------------------------
        for (let i = 0; i < menuLines.length; i++) {
            const line = menuLines[i];
            const [record, created] = await db.menuLine.findOrCreate({
                where: { path: line.path },
                defaults: line
            });

            if (!created) {
                await record.update(line);
                console.log(`Updated Menu Line: ${line.name} (${line.path})`);
            } else {
                console.log(`Created Menu Line: ${line.name} (${line.path})`);
            }

            // Pivot table MenuHeaderLines
            await db.MenuHeaderLines.findOrCreate({
                where: {
                    menuHeaderId: header.id,
                    menuLineId: record.id
                },
                defaults: {
                    menuHeaderId: header.id,
                    menuLineId: record.id,
                    order: i
                }
            });
        }

        // ---------------------------------------------------------------
        // 4. ATTACH TO ALL USER GROUPS
        // ---------------------------------------------------------------
        const groups = await db.group.findAll();
        console.log(`Attaching Expense & Budget menu to ${groups.length} user groups...`);

        for (const grp of groups) {
            await db.GroupMenuHeader.findOrCreate({
                where: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id
                },
                defaults: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id,
                    order: 85
                }
            });
        }

        console.log("✅ Expense & Budget Menu and Menu Lines seeded successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error seeding Expense & Budget menus:", error);
        process.exit(1);
    }
}

seed();
