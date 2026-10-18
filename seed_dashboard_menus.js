const db = require('./src/models');
const { DEFAULT_SHORTCUTS } = require('./src/dashboardMenu/controller');

async function seed() {
    try {
        console.log("🚀 Starting Dashboard Shortcuts synchronization and seeding...");

        // 1. Sync table schema
        console.log("1. Syncing dashboard_menus table schema...");
        await db.dashboardMenu.sync({ alter: true });
        console.log("✅ dashboard_menus table is ready.");

        // 2. Seed default shortcuts
        console.log("2. Checking default dashboard shortcuts...");
        const existingCount = await db.dashboardMenu.count({
            where: { userId: null, userGroupId: null }
        });

        if (existingCount === 0) {
            console.log("Seeding initial 10 default shortcuts...");
            await db.dashboardMenu.bulkCreate(DEFAULT_SHORTCUTS);
            console.log(`✅ Seeded ${DEFAULT_SHORTCUTS.length} default shortcuts.`);
        } else {
            console.log(`ℹ️ Default shortcuts already exist (${existingCount} found).`);
        }

        // 3. Register menuLine for sidebar navigation: /admin/dashboardMenu
        console.log("3. Registering menuLine for /admin/dashboardMenu...");
        const [dashMenuLine, createdLine] = await db.menuLine.findOrCreate({
            where: { path: '/admin/dashboardMenu' },
            defaults: {
                name: 'Dashboard Shortcuts',
                llname: 'ຈັດການເມນູດ່ວນ',
                icon: 'mdi-view-dashboard-edit-outline',
                path: '/admin/dashboardMenu',
                remark: 'Manage and configure dashboard shortcut menu cards',
                target_systems: 'ALL',
                isActive: true
            }
        });

        if (createdLine) {
            console.log("✅ Created menuLine: Dashboard Shortcuts (/admin/dashboardMenu)");
        } else {
            await dashMenuLine.update({
                name: 'Dashboard Shortcuts',
                llname: 'ຈັດການເມນູດ່ວນ',
                icon: 'mdi-view-dashboard-edit-outline',
                isActive: true
            });
            console.log("ℹ️ Updated existing menuLine for /admin/dashboardMenu");
        }

        // 4. Attach menuLine to BRANCH or MODULES menu header if available
        let targetHeader = await db.menuHeader.findOne({
            where: { code: 'BRANCH' }
        });
        if (!targetHeader) {
            targetHeader = await db.menuHeader.findOne({
                where: { code: 'MODULES' }
            });
        }

        if (targetHeader) {
            await db.MenuHeaderLines.findOrCreate({
                where: {
                    menuHeaderId: targetHeader.id,
                    menuLineId: dashMenuLine.id
                },
                defaults: {
                    menuHeaderId: targetHeader.id,
                    menuLineId: dashMenuLine.id,
                    order: 99
                }
            });
            console.log(`✅ Attached Dashboard Shortcuts to Menu Header: ${targetHeader.code}`);
        }

        console.log("🎉 All Dashboard Menu seeds completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error in seed_dashboard_menus:", error);
        process.exit(1);
    }
}

seed();
