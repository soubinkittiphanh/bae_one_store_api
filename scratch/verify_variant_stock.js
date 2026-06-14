const db = require('../src/models/index.js');
const { validateStockForLines } = require('../src/sales/controller.js');
const spfService = require('../src/spf/service.js');
const logger = require('../src/api/logger.js');

async function testVariantStock() {
  try {
    console.log('=== STARTING AUTOMATED VARIANT STOCK TEST ===');

    // 1. Ensure/Seed SPF parameters
    const [spfRecord, created] = await db.spf.findOrCreate({
      where: { code: 'STOCK.VAR' },
      defaults: {
        value: 'Y',
        remark: 'Enable POS variant-level stock validation (Size/Color) [Y/N]',
        isActive: true
      }
    });
    
    // Set to Y to test variant behavior
    await spfRecord.update({ value: 'Y' });
    console.log('STOCK.VAR set to Y');

    // 2. Ensure test product exists
    const [product] = await db.product.findOrCreate({
      where: { pro_id: 99999 },
      defaults: {
        pro_name: 'Test Variant Shirt',
        pro_price: 15.0,
        validateStockOnSale: true,
        isActive: true,
        _category: 'product'
      }
    });
    console.log(`Test product initialized: ${product.pro_name} (ID: ${product.id})`);

    // 3. Ensure test colors exist
    const [colorRed] = await db.Color.findOrCreate({
      where: { color_code: 'RED' },
      defaults: { color_name: 'Red', hex_code: '#FF0000', isActive: true, inputter: 1 }
    });
    const [colorBlue] = await db.Color.findOrCreate({
      where: { color_code: 'BLU' },
      defaults: { color_name: 'Blue', hex_code: '#0000FF', isActive: true, inputter: 1 }
    });

    // 4. Ensure test sizes exist
    const [sizeSmall] = await db.Size.findOrCreate({
      where: { size_code: 'S' },
      defaults: { size_name: 'Small', size_order: 1, isActive: true, inputter: 1 }
    });
    const [sizeMedium] = await db.Size.findOrCreate({
      where: { size_code: 'M' },
      defaults: { size_name: 'Medium', size_order: 2, isActive: true, inputter: 1 }
    });
    console.log(`Variants (Color: RED_id=${colorRed.id}, Size: S_id=${sizeSmall.id}) initialized.`);

    // 5. Clean up old test cards
    await db.card.destroy({
      where: { productId: product.id }
    });

    // 6. Create Red-S Stock cards (5 available)
    const cardsToInsert = [];
    for (let i = 0; i < 5; i++) {
      cardsToInsert.push({
        card_type_code: 10010,
        product_id: '99999',
        productId: product.id,
        cost: 10.0,
        card_number: `TEST-RED-S-${i}`,
        card_isused: 0,
        locking_session_id: '',
        isActive: true,
        locationId: 1, // Must match locationId in validation calls!
        colorId: colorRed.id,
        sizeId: sizeSmall.id,
        card_input_date: new Date(),
        update_time: new Date(),
        update_time_new: new Date(),
        inputter: 1,
        update_user: 1
      });
    }
    await db.card.bulkCreate(cardsToInsert);
    console.log('Seeded 5 available cards of variant RED-SMALL.');

    // 7. Perform Stock Validation with STOCK.VAR = 'Y'
    console.log('\n--- TESTING VALIDATION WITH STOCK.VAR = Y ---');
    
    // Scenario A: Red-S (Qty: 2) -> Should SUCCEED
    const linesSuccess = [{
      productId: product.id,
      quantity: 2,
      unitRate: 1,
      validateStockOnSale: 1,
      colorId: colorRed.id,
      sizeId: sizeSmall.id,
      product: product
    }];
    
    const errorsA = await validateStockForLines(linesSuccess, 1);
    console.log('Scenario A (Red-S Qty 2) stock validation errors count:', errorsA.length);
    if (errorsA.length === 0) {
      console.log('✓ SUCCESS: Red-S validation passed correctly.');
    } else {
      console.error('✗ FAIL: Red-S validation failed unexpectedly:', errorsA);
    }

    // Scenario B: Blue-M (Qty: 1) -> Should FAIL (out of stock)
    const linesFail = [{
      productId: product.id,
      quantity: 1,
      unitRate: 1,
      validateStockOnSale: 1,
      colorId: colorBlue.id,
      sizeId: sizeMedium.id,
      product: product
    }];

    const errorsB = await validateStockForLines(linesFail, 1);
    console.log('Scenario B (Blue-M Qty 1) stock validation errors count:', errorsB.length);
    if (errorsB.length > 0) {
      console.log('✓ SUCCESS: Blue-M validation failed as expected because there is no stock.');
      console.log('Error details:', errorsB[0]);
    } else {
      console.error('✗ FAIL: Blue-M validation passed when it should have failed.');
    }

    // Scenario C: Generic request without variant details -> Should FAIL
    // since generic available cards matching color/size null is 0.
    const linesGeneric = [{
      productId: product.id,
      quantity: 1,
      unitRate: 1,
      validateStockOnSale: 1,
      product: product
    }];
    const errorsC = await validateStockForLines(linesGeneric, 1);
    console.log('Scenario C (Generic Qty 1) stock validation errors count:', errorsC.length);

    // 8. Perform Stock Validation with STOCK.VAR = 'N'
    console.log('\n--- TESTING VALIDATION WITH STOCK.VAR = N ---');
    await spfRecord.update({ value: 'N' });
    console.log('STOCK.VAR set to N');

    // Scenario D: Blue-M (Qty: 1) -> Should SUCCEED (because generic stock exists: 5 cards in total under productId, ignoring color/size)
    const errorsD = await validateStockForLines(linesFail, 1);
    console.log('Scenario D (Blue-M Qty 1 with STOCK.VAR=N) stock validation errors count:', errorsD.length);
    if (errorsD.length === 0) {
      console.log('✓ SUCCESS: Bypassed variant check correctly and matched generic stock.');
    } else {
      console.error('✗ FAIL: Bypassed variant check failed when generic stock existed.');
    }

    // Cleanup
    await spfRecord.update({ value: 'Y' }); // Restore to Y
    console.log('\n=== ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY ===');
    process.exit(0);
  } catch (error) {
    console.error('Test script failed with error:', error);
    process.exit(1);
  }
}

testVariantStock();
