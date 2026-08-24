const db = require('./src/models');

async function seed() {
    try {
        console.log("Seeding School Billing Navigation Menus...");
        
        // 1. Create Menu Header
        const [header, headerCreated] = await db.menuHeader.findOrCreate({
            where: { code: 'SCHOOL' },
            defaults: {
                code: 'SCHOOL',
                icon: 'mdi-school-outline',
                name: 'School Billing',
                llname: 'ລະບົບຈັດການຄ່າຮຽນ',
                remark: 'School Fee & Classes Billing System',
                expand: true,
                isActive: true
            }
        });
        
        console.log(headerCreated ? "Created Menu Header: SCHOOL" : "Menu Header already exists: SCHOOL");

        // 2. Define Menu Lines
        const menuLines = [
            {
                name: 'School Invoices',
                llname: 'ໃບບິນຄ່າຮຽນ',
                icon: 'mdi-file-document-outline',
                path: '/admin/school/invoice',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Financial Reports',
                llname: 'ລາຍງານການເງິນ',
                icon: 'mdi-finance',
                path: '/admin/school/report',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Academic & Classes',
                llname: 'ສົກຮຽນ ແລະ ຊັ້ນຮຽນ',
                icon: 'mdi-google-classroom',
                path: '/admin/school/class',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Fee Setup',
                llname: 'ຕັ້ງຄ່າຄ່າທໍານຽມ',
                icon: 'mdi-cash-cog',
                path: '/admin/school/fee-structure',
                target_systems: 'ALL',
                isActive: true
            },
            {
                name: 'Shift Control',
                llname: 'ຈັດການ Shift/ກະລາເງິນ',
                icon: 'mdi-cash-register',
                path: '/admin/school/shift',
                target_systems: 'ALL',
                isActive: true
            }
        ];

        // 3. Create Menu Lines and Associate with Header
        for (const line of menuLines) {
            const [record, created] = await db.menuLine.findOrCreate({
                where: { path: line.path },
                defaults: {
                    name: line.name,
                    llname: line.llname,
                    icon: line.icon,
                    path: line.path,
                    target_systems: line.target_systems,
                    isActive: line.isActive
                }
            });
            if (!created) {
                await record.update({
                    name: line.name,
                    llname: line.llname,
                    icon: line.icon,
                    target_systems: line.target_systems,
                    isActive: line.isActive
                });
                console.log(`Updated Menu Line: ${line.name}`);
            } else {
                console.log(`Created Menu Line: ${line.name}`);
            }

            // Create association in MenuHeaderLines join table
            await db.MenuHeaderLines.findOrCreate({
                where: {
                    menuHeaderId: header.id,
                    menuLineId: record.id
                },
                defaults: {
                    menuHeaderId: header.id,
                    menuLineId: record.id,
                    order: menuLines.indexOf(line) + 1
                }
            });
        }

        // 4. Attach Header to all User Groups
        const groups = await db.group.findAll();
        console.log(`Attaching menu header to ${groups.length} user groups...`);
        
        for (const grp of groups) {
            await db.GroupMenuHeader.findOrCreate({
                where: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id
                },
                defaults: {
                    userGroupId: grp.id,
                    menuHeaderId: header.id,
                    order: 80 
                }
            });
        }
        
        console.log("School menus seeding completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding school menus:", error);
        process.exit(1);
    }
}

seed();
