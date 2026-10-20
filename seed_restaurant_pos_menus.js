const db = require('./src/models');

async function seedRestaurantPosMenus() {
    console.log("=================================================================");
    console.log("🍽️  Starting Restaurant & Cafe POS Menu Seeding...");
    console.log("=================================================================");

    try {
        // ---------------------------------------------------------------------
        // 1. SEED MENU HEADER: REST_POS (Restaurant & Cafe)
        // ---------------------------------------------------------------------
        const headerData = {
            code: 'REST_POS', // Max length 10
            icon: 'mdi-silverware-fork-knife',
            name: 'Restaurant & Cafe',
            llname: 'ຮ້ານອາຫານ & ຄາເຟ່',
            remark: 'Restaurant & Cafe table management, live orders, POS billing, and kitchen routing',
            expand: true,
            isActive: true
        };

        const [header, headerCreated] = await db.menuHeader.findOrCreate({
            where: { code: headerData.code },
            defaults: headerData
        });

        if (!headerCreated) {
            await header.update(headerData);
            console.log(`✓ Updated existing Menu Header: [${headerData.code}] (ID: ${header.id})`);
        } else {
            console.log(`✓ Created new Menu Header: [${headerData.code}] (ID: ${header.id})`);
        }

        // ---------------------------------------------------------------------
        // 2. DEFINE MENU LINES FOR RESTAURANT & CAFE SCREENS
        // ---------------------------------------------------------------------
        const menuLines = [
            {
                name: 'Table Floor & POS',
                llname: 'ແຜນຜັງໂຕະ & ສັ່ງອາຫານ',
                icon: 'mdi-table-chair',
                path: '/admin/cafeTable',
                remark: 'Interactive live floor plan, customer seating, active orders, split billing, and cashier checkout',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Kitchen Display (KDS)',
                llname: 'ຈໍຕິດຕາມລາຍການອາຫານໃນຄົວ',
                icon: 'mdi-chef-hat',
                path: '/admin/restaurant/kitchen',
                remark: 'Kitchen Order Display System (KDS), real-time order queue, cooking status tracking, and kitchen alerts',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Restaurant POS Orders',
                llname: 'ລາຍການບິນຂາຍຮ້ານອາຫານ',
                icon: 'mdi-receipt-text-check',
                path: '/admin/restaurant/ordersFromPos',
                remark: 'Restaurant & Cafe POS orders report, KPI metrics, payment breakdown, and ticket reprint',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Food & Drink Menu',
                llname: 'ເມນູອາຫານ & ສູດອາຫານ',
                icon: 'mdi-food-fork-drink',
                path: '/admin/restaurant/menu',
                remark: 'Food and drink menu items, pricing, options, and recipe ingredient setup',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Table Management',
                llname: 'ຈັດການໂຕະ & ໂຊນ',
                icon: 'mdi-table-furniture',
                path: '/admin/pos/table',
                remark: 'Setup dining tables, seating capacity, table zones, and statuses',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Table Reservations',
                llname: 'ຕາຕະລາງຈອງໂຕະ',
                icon: 'mdi-calendar-clock',
                path: '/admin/reservation',
                remark: 'Manage guest table bookings, schedules, and reservations calendar',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Ticket Management',
                llname: 'ປະຫວັດບິນ & ຍົກເລີກບິນ',
                icon: 'mdi-receipt-text-outline',
                path: '/admin/ticket',
                remark: 'Order ticket history, payment status audit, and ticket cancellation/voids',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Restaurant Promotions',
                llname: 'ໂປຣໂມຊັ່ນຮ້ານອາຫານ',
                icon: 'mdi-tag-multiple',
                path: '/admin/cafe/promotion',
                remark: 'Create and configure restaurant dining discounts and promotions',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Sales By Item Report',
                llname: 'ລາຍງານລາຍລະອຽດບິນຂາຍຕາມສິນຄ້າ',
                icon: 'mdi-chart-box-outline',
                path: '/admin/saleTicketReportDetailByProduct',
                remark: 'Detailed restaurant ticket sales, item breakdown, and payment auditing',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Printer Maintenance',
                llname: 'ຕັ້ງຄ່າເຄື່ອງພິມ (ຄົວ/ບາຣ/ເຄົາເຕີ)',
                icon: 'mdi-printer-pos',
                path: '/admin/printers',
                remark: 'Configure thermal printers for Kitchen, Bar, and Cashier counter',
                target_systems: 'ALL',
                isActive: true
            }
        ];

        // ---------------------------------------------------------------------
        // 3. SEED MENU LINES AND PIVOT ASSOCIATIONS
        // ---------------------------------------------------------------------
        console.log(`\nRegistering ${menuLines.length} Menu Lines under [${header.code}]...`);

        for (let i = 0; i < menuLines.length; i++) {
            const lineData = menuLines[i];
            const sortOrder = i + 1;

            const [record, created] = await db.menuLine.findOrCreate({
                where: { path: lineData.path },
                defaults: lineData
            });

            if (!created) {
                await record.update(lineData);
                console.log(`  ${sortOrder}. Updated Line: ${lineData.name} (${lineData.path})`);
            } else {
                console.log(`  ${sortOrder}. Created Line: ${lineData.name} (${lineData.path})`);
            }

            // Pivot table: MenuHeaderLines
            const [pivot, pivotCreated] = await db.MenuHeaderLines.findOrCreate({
                where: {
                    menuHeaderId: header.id,
                    menuLineId: record.id
                },
                defaults: {
                    menuHeaderId: header.id,
                    menuLineId: record.id,
                    order: sortOrder
                }
            });

            if (!pivotCreated) {
                await pivot.update({ order: sortOrder });
            }
        }

        // ---------------------------------------------------------------------
        // 4. ATTACH TO ALL USER GROUPS (GroupMenuHeader)
        // ---------------------------------------------------------------------
        const groups = await db.group.findAll();
        console.log(`\nAttaching [${header.code}] to ${groups.length} User Groups...`);

        for (const grp of groups) {
            const [grpPivot, grpCreated] = await db.GroupMenuHeader.findOrCreate({
                where: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id
                },
                defaults: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id,
                    order: 3 // Placed right after SALES & POS (order 2)
                }
            });

            if (!grpCreated) {
                await grpPivot.update({ order: 3 });
                console.log(`  ✓ Updated link for Group #${grp.id} (${grp.name}) -> Order: 3`);
            } else {
                console.log(`  ✓ Created link for Group #${grp.id} (${grp.name}) -> Order: 3`);
            }
        }

        console.log("\n=================================================================");
        console.log("🎉 Restaurant & Cafe POS Menus & Lines Seeded Successfully!");
        console.log("=================================================================");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error seeding Restaurant POS menus:", error);
        process.exit(1);
    }
}

seedRestaurantPosMenus();
