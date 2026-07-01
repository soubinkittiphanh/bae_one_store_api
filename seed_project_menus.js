const db = require('./src/models');

async function seed() {
    try {
        console.log("Seeding Project Accounting menu...");
        
        // 1. Create Menu Header
        const [header, headerCreated] = await db.menuHeader.findOrCreate({
            where: { code: 'AC_PROJ' },
            defaults: {
                code: 'AC_PROJ',
                icon: 'mdi-folder-account-outline',
                name: 'Project Accounting',
                llname: 'ຈັດການງົບປະມານໂຄງການ',
                remark: 'ADB/Donor Project budget management',
                expand: true,
                isActive: true
            }
        });
        
        console.log(headerCreated ? "Created Menu Header: AC_PROJ" : "Menu Header already exists: AC_PROJ");

        // 2. Define Menu Lines
        const menuLines = [
            {
                name: 'Project & Budget',
                llname: 'ຈັດການໂຄງການ ແລະ ງົບປະມານ',
                icon: 'mdi-folder-account-outline',
                path: '/admin/accounting/project',
                target_systems: 'ALL',
                isActive: true,
                menuHeaderId: header.id
            },
            {
                name: 'Contracts & Commitments',
                llname: 'ສັນຍາ ແລະ ພັນທະຜູກພັນ',
                icon: 'mdi-file-document-edit-outline',
                path: '/admin/accounting/project/contracts',
                target_systems: 'ALL',
                isActive: true,
                menuHeaderId: header.id
            },
            {
                name: 'Progress Claims & IPCs',
                llname: 'ໃບແຈ້ງໜີ້ ແລະ ໃບຢັ້ງຢືນຜົນງານ',
                icon: 'mdi-file-percent-outline',
                path: '/admin/accounting/project/invoices',
                target_systems: 'ALL',
                isActive: true,
                menuHeaderId: header.id
            },
            {
                name: 'Withdrawal Applications',
                llname: 'ໃບຖອນເງິນ ADB (WA)',
                icon: 'mdi-file-cabinet',
                path: '/admin/accounting/project/wa',
                target_systems: 'ALL',
                isActive: true,
                menuHeaderId: header.id
            }
        ];

        // 3. Create Menu Lines
        for (const line of menuLines) {
            const [record, created] = await db.menuLine.findOrCreate({
                where: { path: line.path },
                defaults: line
            });
            if (!created) {
                await record.update(line);
                console.log(`Updated Menu Line: ${line.name}`);
            } else {
                console.log(`Created Menu Line: ${line.name}`);
            }
        }

        // 4. Attach to all User Groups
        const groups = await db.group.findAll();
        console.log(`Attaching menu to ${groups.length} user groups...`);
        
        for (const grp of groups) {
            await db.GroupMenuHeader.findOrCreate({
                where: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id
                },
                defaults: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id,
                    order: 99 
                }
            });
        }
        
        // 5. Seed SPF configurations to enable GL integration globally
        const spfParams = [
            { code: 'AC_AP_GL_ENABLE', value: 'Y', remark: 'Enable General Ledger mapping for AP (Y/N)' },
            { code: 'AC_AR_GL_ENABLE', value: 'Y', remark: 'Enable General Ledger mapping for AR (Y/N)' }
        ];

        for (const param of spfParams) {
            const [record, created] = await db.spf.findOrCreate({
                where: { code: param.code },
                defaults: param
            });
            if (!created) {
                await record.update(param);
                console.log(`Updated SPF: ${param.code}`);
            } else {
                console.log(`Created SPF: ${param.code}`);
            }
        }

        console.log("Seeding complete successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding menus:", error);
        process.exit(1);
    }
}

seed();
