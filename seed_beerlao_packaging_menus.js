const db = require('./src/models');

async function seedBeerlaoPackagingMenus() {
    console.log("=================================================================");
    console.log("🍺 Starting Beerlao Packaging Menus Seeding (Headers & Lines)...");
    console.log("=================================================================");

    try {
        // ---------------------------------------------------------------------
        // 1. SEED MENU HEADER: PKG_MGMT (Returnable Packaging & Empties)
        // ---------------------------------------------------------------------
        const [pkgHeader, headerCreated] = await db.menuHeader.findOrCreate({
            where: { code: 'PKG_MGMT' },
            defaults: {
                code: 'PKG_MGMT',
                icon: 'mdi-package-variant-closed',
                name: 'Returnable Packaging & Empties',
                llname: 'ລະບົບບັນຈຸພັນ ແລະ ລັງ-ແກ້ວ',
                remark: 'Beerlao Agency Returnable Crates, Glass Bottles & Golden Matrix System',
                expand: true,
                isActive: true
            }
        });

        if (!headerCreated) {
            await pkgHeader.update({
                icon: 'mdi-package-variant-closed',
                name: 'Returnable Packaging & Empties',
                llname: 'ລະບົບບັນຈຸພັນ ແລະ ລັງ-ແກ້ວ',
                remark: 'Beerlao Agency Returnable Crates, Glass Bottles & Golden Matrix System',
                expand: true,
                isActive: true
            });
            console.log("✓ Updated existing Menu Header: [PKG_MGMT]");
        } else {
            console.log("✓ Created new Menu Header: [PKG_MGMT] (ID:", pkgHeader.id, ")");
        }

        // ---------------------------------------------------------------------
        // 2. DEFINE MENU LINES FOR PACKAGING & EMPTIES SCREENS
        // ---------------------------------------------------------------------
        const packagingLines = [
            {
                name: 'Master Packaging Matrix',
                llname: 'ຕາຕະລາງດຸນດ່ຽງບັນຈຸພັນລວມ',
                icon: 'mdi-scale-balance',
                path: '/admin/report/masterPackagingMatrix',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Customer Packaging Debt',
                llname: 'ໜີ້ສິນບັນຈຸພັນລູກຄ້າ',
                icon: 'mdi-account-cash-outline',
                path: '/admin/report/customerPackaging',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Stock Receiving & FOC',
                llname: 'ຮັບສິນຄ້າ ແລະ ເບຍແຖມ',
                icon: 'mdi-truck-delivery-outline',
                path: '/admin/receiving',
                target_systems: 'ALL',
                isActive: true
            }
        ];

        // ---------------------------------------------------------------------
        // 3. SEED MENU LINES & LINK VIA MenuHeaderLines PIVOT TABLE
        // ---------------------------------------------------------------------
        for (let i = 0; i < packagingLines.length; i++) {
            const lineData = packagingLines[i];
            const [lineRecord, lineCreated] = await db.menuLine.findOrCreate({
                where: { path: lineData.path },
                defaults: lineData
            });

            if (!lineCreated) {
                await lineRecord.update(lineData);
                console.log(`✓ Updated Menu Line: [${lineData.name}] (${lineData.path})`);
            } else {
                console.log(`✓ Created Menu Line: [${lineData.name}] (ID: ${lineRecord.id})`);
            }

            // Link to PKG_MGMT Header
            await db.MenuHeaderLines.findOrCreate({
                where: {
                    menuHeaderId: pkgHeader.id,
                    menuLineId: lineRecord.id
                },
                defaults: {
                    menuHeaderId: pkgHeader.id,
                    menuLineId: lineRecord.id,
                    order: i + 1
                }
            });
            console.log(`  └─ Linked to [PKG_MGMT] Header (Order: ${i + 1})`);
        }

        // ---------------------------------------------------------------------
        // 4. ALSO LINK REPORT SCREENS TO 'REPORTS' HEADER (IF EXISTS)
        // ---------------------------------------------------------------------
        const reportsHeader = await db.menuHeader.findOne({
            where: { code: 'REPORTS' }
        });

        if (reportsHeader) {
            const reportPaths = [
                '/admin/report/masterPackagingMatrix',
                '/admin/report/customerPackaging'
            ];

            for (let i = 0; i < reportPaths.length; i++) {
                const p = reportPaths[i];
                const lineRecord = await db.menuLine.findOne({ where: { path: p } });
                if (lineRecord) {
                    await db.MenuHeaderLines.findOrCreate({
                        where: {
                            menuHeaderId: reportsHeader.id,
                            menuLineId: lineRecord.id
                        },
                        defaults: {
                            menuHeaderId: reportsHeader.id,
                            menuLineId: lineRecord.id,
                            order: 80 + i
                        }
                    });
                    console.log(`  └─ Linked [${lineRecord.name}] to [REPORTS] Header as well`);
                }
            }
        }

        // ---------------------------------------------------------------------
        // 5. ATTACH PKG_MGMT HEADER TO ALL USER GROUPS (ROLES)
        // ---------------------------------------------------------------------
        const allGroups = await db.group.findAll();
        console.log(`\nAttaching PKG_MGMT Header to ${allGroups.length} User Group(s)...`);

        for (const grp of allGroups) {
            await db.GroupMenuHeader.findOrCreate({
                where: {
                    userGroupId: grp.id,
                    menuHeaderId: pkgHeader.id
                },
                defaults: {
                    userGroupId: grp.id,
                    menuHeaderId: pkgHeader.id,
                    order: 14
                }
            });
            console.log(`✓ Attached to Group: [${grp.groupName || grp.name || grp.id}]`);
        }

        // ---------------------------------------------------------------------
        // 6. SEED SYSTEM PARAMETERS (SPF) FOR BEERLAO AGENCY PACKAGING
        // ---------------------------------------------------------------------
        const packagingSpfParams = [
            {
                code: 'PKG_BEERLAO_ENABLED',
                value: 'Y',
                remark: 'Enable Beerlao Agency Returnable Packaging & Deposit Engine (Y/N)'
            },
            {
                code: 'PKG_DEFAULT_CRATE_DEPOSIT',
                value: '20000',
                remark: 'Default deposit rate for Beerlao Empty Crate (LAK)'
            },
            {
                code: 'PKG_DEFAULT_BOTTLE_DEPOSIT',
                value: '2000',
                remark: 'Default deposit rate for Beerlao Empty Bottle 640ml (LAK)'
            }
        ];

        console.log("\nConfiguring SPF Parameters for Beerlao Agency...");
        for (const param of packagingSpfParams) {
            const [spfRecord, spfCreated] = await db.spf.findOrCreate({
                where: { code: param.code },
                defaults: param
            });

            if (!spfCreated) {
                await spfRecord.update(param);
                console.log(`✓ Updated SPF: ${param.code} = ${param.value}`);
            } else {
                console.log(`✓ Created SPF: ${param.code} = ${param.value}`);
            }
        }

        console.log("=================================================================");
        console.log("🎉 Beerlao Packaging Menus & Lines Seeded Successfully!");
        console.log("=================================================================");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error seeding packaging menus:", error);
        process.exit(1);
    }
}

seedBeerlaoPackagingMenus();
