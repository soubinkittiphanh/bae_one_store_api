const db = require('../src/models/index.js');

async function run() {
  try {
    console.log('Querying categories...');
    const categories = await db.category.findAll({ limit: 10 });
    console.log('Categories:', categories.map(c => c.toJSON()));

    console.log('Querying main categories...');
    const mainCategories = await db.mainCategory.findAll({ limit: 10 });
    console.log('Main Categories:', mainCategories.map(mc => mc.toJSON()));

    console.log('Querying products...');
    const products = await db.product.findAll({ limit: 5 });
    console.log('Products:', products.map(p => p.toJSON()));

    console.log('Querying images...');
    const images = await db.image.findAll({ limit: 5 });
    console.log('Images:', images.map(i => i.toJSON()));

    process.exit(0);
  } catch (error) {
    console.error('Error running check:', error);
    process.exit(1);
  }
}

run();
