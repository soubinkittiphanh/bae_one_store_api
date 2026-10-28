const db = require('./src/models');

async function seedPlatformMenus() {
  try {
    console.log("=================================================");
    console.log("📋 Seeding Platforms & Social Admin Navigation Menus...");
    console.log("=================================================");

    // 1. Create or Update Menu Header (code length <= 10)
    const [header, headerCreated] = await db.menuHeader.findOrCreate({
      where: { code: 'PLATFORM' },
      defaults: {
        code: 'PLATFORM',
        icon: 'mdi-share-variant-outline',
        name: 'Platforms & Social',
        llname: 'ຊ່ອງທາງເຊື່ອມຕໍ່ (Platforms)',
        remark: 'Multi-platform integration for Facebook, TikTok, Shopee, Lazada and Page Quota Management',
        expand: true,
        isActive: true
      }
    });

    if (headerCreated) {
      console.log("✅ Created Menu Header: PLATFORM");
    } else {
      console.log("ℹ️ Menu Header already exists: PLATFORM. Updating...");
      await header.update({
        icon: 'mdi-share-variant-outline',
        name: 'Platforms & Social',
        llname: 'ຊ່ອງທາງເຊື່ອມຕໍ່ (Platforms)',
        remark: 'Multi-platform integration for Facebook, TikTok, Shopee, Lazada and Page Quota Management',
        expand: true,
        isActive: true
      });
    }

    // 2. Define Menu Lines
    const menuLines = [
      {
        name: 'Connected Pages & Quota',
        llname: 'ຈັດການໜ້າເຊື່ອມຕໍ່ & ໂຄຕ້າ',
        icon: 'mdi-view-grid-plus-outline',
        path: '/admin/platform',
        target_systems: 'ALL',
        isActive: true
      }
    ];

    for (let i = 0; i < menuLines.length; i++) {
      const item = menuLines[i];
      const [line, lineCreated] = await db.menuLine.findOrCreate({
        where: { path: item.path },
        defaults: {
          name: item.name,
          llname: item.llname,
          icon: item.icon,
          path: item.path,
          target_systems: item.target_systems,
          isActive: item.isActive
        }
      });

      if (!lineCreated) {
        await line.update({
          name: item.name,
          llname: item.llname,
          icon: item.icon,
          target_systems: item.target_systems,
          isActive: item.isActive
        });
        console.log(`   ~ Updated Menu Line: ${item.name} (${item.path})`);
      } else {
        console.log(`   + Created Menu Line: ${item.name} (${item.path})`);
      }

      // 3. Associate with MenuHeader in MenuHeaderLines join table
      const [mhl, mhlCreated] = await db.MenuHeaderLines.findOrCreate({
        where: {
          menuHeaderId: header.id,
          menuLineId: line.id
        },
        defaults: {
          menuHeaderId: header.id,
          menuLineId: line.id,
          order: i + 1
        }
      });

      if (!mhlCreated) {
        await mhl.update({ order: i + 1 });
      }
      console.log(`   🔗 Linked MenuLine (ID: ${line.id}) to MenuHeader (ID: ${header.id}) in MenuHeaderLines!`);
    }

    // 4. Attach Menu Header to all User Groups
    const userGroups = await db.group.findAll();
    console.log(`Found ${userGroups.length} user groups to link with PLATFORM header...`);

    for (const group of userGroups) {
      const hasAssociation = await group.hasMenuHeader(header);
      if (!hasAssociation) {
        await group.addMenuHeader(header);
        console.log(`   -> Linked PLATFORM menu header to user group ID: ${group.id} (${group.name || 'Group'})`);
      } else {
        console.log(`   ✓ User group ID: ${group.id} already has PLATFORM header`);
      }
    }

    console.log("\n=================================================");
    console.log("🎉 Platforms & Social Navigation Menus Seeded & Linked Successfully!");
    console.log("=================================================");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding platform menus:", err);
    process.exit(1);
  }
}

seedPlatformMenus();
