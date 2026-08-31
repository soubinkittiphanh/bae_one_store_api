const db = require('./src/models');

async function seed() {
    try {
        console.log("Seeding AP (Accounts Payable) & AR (Accounts Receivable) menus...");
        
        // ---------------------------------------------------------------
        // 1. SEED ACCOUNTS PAYABLE (AP) MENU
        // ---------------------------------------------------------------
        const [apHeader, apHeaderCreated] = await db.menuHeader.findOrCreate({
            where: { code: 'AC_AP' },
            defaults: {
                code: 'AC_AP',
                icon: 'mdi-cash-multiple',
                name: 'Accounts Payable (AP)',
                llname: 'ບັນຊີເຈົ້າໜີ້ (AP)',
                remark: 'Accounts Payable & Vendor invoice management',
                expand: true,
                isActive: true
            }
        });
        console.log(apHeaderCreated ? "Created Menu Header: AC_AP" : "Menu Header already exists: AC_AP");

        const apLines = [
            {
                name: 'AP Invoice',
                llname: 'ໃບແຈ້ງໜີ້ຄ້າງຈ່າຍ',
                icon: 'mdi-file-document-outline',
                path: '/admin/accounting/ap/invoice',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'AP Settlement',
                llname: 'ໃບບັນທຶກການຊຳລະ',
                icon: 'mdi-cash-register',
                path: '/admin/accounting/ap/invoiceSettlement',
                target_systems: 'ALL',
                isActive: true
            }
        ];

        for (let i = 0; i < apLines.length; i++) {
            const line = apLines[i];
            const [record, created] = await db.menuLine.findOrCreate({
                where: { path: line.path },
                defaults: line
            });
            if (!created) {
                await record.update(line);
                console.log(`Updated AP Menu Line: ${line.name}`);
            } else {
                console.log(`Created AP Menu Line: ${line.name}`);
            }

            // Create connection in pivot table
            await db.MenuHeaderLines.findOrCreate({
                where: {
                    menuHeaderId: apHeader.id,
                    menuLineId: record.id
                },
                defaults: {
                    menuHeaderId: apHeader.id,
                    menuLineId: record.id,
                    order: i
                }
            });
        }

        // ---------------------------------------------------------------
        // 2. SEED ACCOUNTS RECEIVABLE (AR) MENU
        // ---------------------------------------------------------------
        const [arHeader, arHeaderCreated] = await db.menuHeader.findOrCreate({
            where: { code: 'AC_AR' },
            defaults: {
                code: 'AC_AR',
                icon: 'mdi-cash-check',
                name: 'Accounts Receivable (AR)',
                llname: 'ບັນຊີລູກໜີ້ (AR)',
                remark: 'Accounts Receivable & Customer invoicing',
                expand: true,
                isActive: true
            }
        });
        console.log(arHeaderCreated ? "Created Menu Header: AC_AR" : "Menu Header already exists: AC_AR");

        const arLines = [
            {
                name: 'AR Invoice',
                llname: 'ໃບແຈ້ງໜີ້ລາຍຮັບ',
                icon: 'mdi-file-send-outline',
                path: '/admin/accounting/ar/invoice',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'AR Receive',
                llname: 'ໃບບັນທຶກການຮັບຊຳລະ',
                icon: 'mdi-cash-refund',
                path: '/admin/accounting/ar/receive',
                target_systems: 'ALL',
                isActive: true
            }
        ];

        for (let i = 0; i < arLines.length; i++) {
            const line = arLines[i];
            const [record, created] = await db.menuLine.findOrCreate({
                where: { path: line.path },
                defaults: line
            });
            if (!created) {
                await record.update(line);
                console.log(`Updated AR Menu Line: ${line.name}`);
            } else {
                console.log(`Created AR Menu Line: ${line.name}`);
            }

            // Create connection in pivot table
            await db.MenuHeaderLines.findOrCreate({
                where: {
                    menuHeaderId: arHeader.id,
                    menuLineId: record.id
                },
                defaults: {
                    menuHeaderId: arHeader.id,
                    menuLineId: record.id,
                    order: i
                }
            });
        }

        // ---------------------------------------------------------------
        // 3. ATTACH TO ALL USER GROUPS
        // ---------------------------------------------------------------
        const groups = await db.group.findAll();
        console.log(`Attaching AP and AR menus to ${groups.length} user groups...`);
        
        for (const grp of groups) {
            // Attach AP
            await db.GroupMenuHeader.findOrCreate({
                where: {
                    userGroupId: grp.id,
                    menuHeaderId: apHeader.id
                },
                defaults: {
                    userGroupId: grp.id,
                    menuHeaderId: apHeader.id,
                    order: 99 
                }
            });

            // Attach AR
            await db.GroupMenuHeader.findOrCreate({
                where: {
                    userGroupId: grp.id,
                    menuHeaderId: arHeader.id
                },
                defaults: {
                    userGroupId: grp.id,
                    menuHeaderId: arHeader.id,
                    order: 99 
                }
            });
        }

        console.log("AP & AR Menus seeded successfully with Menu Lines!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding AP/AR menus:", error);
        process.exit(1);
    }
}

seed();
