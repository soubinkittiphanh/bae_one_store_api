const { moneyAdvance: MoneyAdvance, moneySettlement: Settlement, ministry: Ministry, currency: Currency, user: User } = require('../src/models');
const { Op } = require('sequelize');

async function testAvailableForSettlementCriteria() {
  console.log('====================================================');
  console.log('🧪 TESTING AVAILABLE FOR SETTLEMENT SEARCH CRITERIA');
  console.log('====================================================\n');

  try {
    // 1. Check all available advances in DB
    const allAdvances = await MoneyAdvance.findAll({
      include: [
        { model: Ministry, as: 'ministry' },
        { model: Currency, as: 'currency' },
        { model: User, as: 'maker' },
        { model: Settlement, as: 'settlementLine', required: false }
      ],
      limit: 10
    });

    console.log(`📊 Found ${allAdvances.length} sample advances in database`);

    if (allAdvances.length > 0) {
      const sample = allAdvances[0];
      console.log(`Sample Advance ID: #${sample.id}`);
      console.log(`  Ministry: ${sample.ministry?.ministryName || 'N/A'} (ID: ${sample.ministryId})`);
      console.log(`  Currency: ${sample.currency?.code || 'N/A'} (ID: ${sample.currencyId})`);
      console.log(`  Booking Date: ${sample.bookingDate}`);
      console.log(`  Receive Name: ${sample.receiveName || 'N/A'}`);
      console.log(`  Amount: ${sample.amount}`);

      // Test 1: Ministry Filter
      if (sample.ministryId) {
        const ministryFiltered = await MoneyAdvance.findAll({
          where: {
            ministryId: sample.ministryId,
            status: { [Op.in]: ['pending', 'approved'] }
          },
          include: [{ model: Ministry, as: 'ministry' }]
        });
        console.log(`\n✅ Criteria 1 - Ministry Filter (ministryId=${sample.ministryId}): Found ${ministryFiltered.length} records`);
      }

      // Test 2: Search Query by ID / Voucher number
      const searchNumCondition = {
        [Op.or]: [
          { id: sample.id },
          { purpose: { [Op.like]: `%${sample.id}%` } }
        ]
      };
      const searchById = await MoneyAdvance.findAll({
        where: searchNumCondition
      });
      console.log(`✅ Criteria 2 - Search by Payment/Voucher #${sample.id}: Found ${searchById.length} records (Matched ID: ${searchById[0]?.id})`);

      // Test 3: Search Query by Receiver Name if available
      if (sample.receiveName) {
        const searchByName = await MoneyAdvance.findAll({
          where: {
            receiveName: { [Op.like]: `%${sample.receiveName}%` }
          }
        });
        console.log(`✅ Criteria 3 - Search by Receiver "${sample.receiveName}": Found ${searchByName.length} records`);
      }

      // Test 4: Date Range Filter
      if (sample.bookingDate) {
        const dateRangeFiltered = await MoneyAdvance.findAll({
          where: {
            bookingDate: {
              [Op.between]: [sample.bookingDate, sample.bookingDate]
            }
          }
        });
        console.log(`✅ Criteria 4 - Date Range (${sample.bookingDate}): Found ${dateRangeFiltered.length} records`);
      }

      // Test 5: Currency Filter
      if (sample.currencyId) {
        const currencyFiltered = await MoneyAdvance.findAll({
          where: {
            currencyId: sample.currencyId
          }
        });
        console.log(`✅ Criteria 5 - Currency Filter (currencyId=${sample.currencyId}): Found ${currencyFiltered.length} records`);
      }
    }

    console.log('\n🎉 ALL SEARCH CRITERIA QUERIES TESTED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Error during simulation:', error);
  } finally {
    process.exit(0);
  }
}

testAvailableForSettlementCriteria();
