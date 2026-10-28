/**
 * Phase 2A Master Data Seed Script
 * Strictly Idempotent. Zero seeding of ln_accounting_entry_rule or ln_role_gl_mapping (Phase 2B).
 */
process.env.NO_SYNC = 'true';
const db = require('./src/models');
const logger = require('./src/api/logger');

async function seedPhase2A() {
  console.log('--- Starting Phase 2A Idempotent Master Seeding ---');

  try {
    // 1. Lookups
    console.log('Seeding 10 Lookup Tables...');
    const loanTypes = [
      { code: 'HIRE_PURCHASE', name: 'Hire Purchase / Vehicle Financing (ເຊົ່າຊື້ລົດ)', description: 'Vehicle financing for car dealerships with invoice settlement' },
      { code: 'PERSONAL_LOAN', name: 'Personal Consumer Loan (ສິນເຊື່ອບຸກຄົນ)', description: 'General personal loan' },
      { code: 'MORTGAGE', name: 'Mortgage Loan (ສິນເຊື່ອທີ່ດິນ-ທີ່ຢູ່ອາໄສ)', description: 'Real estate backed term loan' },
      { code: 'BUSINESS_LOAN', name: 'SME Business Loan (ສິນເຊື່ອທຸລະກິດ SME)', description: 'Commercial business term loan' }
    ];
    for (const item of loanTypes) {
      await db.lnLookupLoanType.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const frequencies = [
      { code: 'MONTHLY', name: 'Monthly (ລາຍເດືອນ)', daysInterval: 30, periodsPerYear: 12.0 },
      { code: 'BI_WEEKLY', name: 'Bi-Weekly (ທຸກ 2 ອາທິດ)', daysInterval: 14, periodsPerYear: 26.0 },
      { code: 'WEEKLY', name: 'Weekly (ລາຍອາທິດ)', daysInterval: 7, periodsPerYear: 52.0 },
      { code: 'DAILY', name: 'Daily (ລາຍວັນ)', daysInterval: 1, periodsPerYear: 365.0 },
      { code: 'QUARTERLY', name: 'Quarterly (ລາຍໄຕມາດ)', daysInterval: 90, periodsPerYear: 4.0 },
      { code: 'SEMI_ANNUALLY', name: 'Semi-Annually (ທຸກ 6 ເດືອນ)', daysInterval: 180, periodsPerYear: 2.0 },
      { code: 'ANNUALLY', name: 'Annually (ລາຍປີ)', daysInterval: 365, periodsPerYear: 1.0 },
      { code: 'BULLET', name: 'Bullet / At Maturity (ຈ່າຍຄັ້ງດຽວເມື່ອໝົດກຳນົດ)', daysInterval: 365, periodsPerYear: 1.0 }
    ];
    for (const item of frequencies) {
      await db.lnLookupFrequency.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const disbTargets = [
      { code: 'SALE_INVOICE_SETTLEMENT', name: 'Direct Sale Invoice Settlement (ຕັດຊຳລະໃບຮັບເງິນຂາຍລົດ)', description: 'Credits sale receivable directly, financing the vehicle sale' },
      { code: 'CUSTOMER_ACCOUNT', name: 'Customer Deposit Account / Wallet (ໂອນເຂົ້າບັນຊີເງິນຝາກລູກຄ້າ)', description: 'Credits customer internal wallet or deposit account' },
      { code: 'CASH_DESK', name: 'Cash Payout at Counter (ຈ່າຍເງິນສົດໜ້າເຄົາເຕີ)', description: 'Disburses cash directly from drawer' },
      { code: 'EXTERNAL_BANK_TRANSFER', name: 'External Bank Transfer (ໂອນຜ່ານທະນາຄານພາຍນອກ)', description: 'Disburses funds via external bank remittance' }
    ];
    for (const item of disbTargets) {
      await db.lnLookupDisbursementTarget.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const holidayHandlings = [
      { code: 'NEXT_WORKING_DAY', name: 'Next Working Day (ເລື່ອນໄປມື້ລັດຖະການຖັດໄປ)', description: 'Move schedule to next working business day' },
      { code: 'PREV_WORKING_DAY', name: 'Previous Working Day (ເລື່ອນມາກ່ອນມື້ພັກ)', description: 'Move schedule to previous working day' },
      { code: 'EXACT_DATE', name: 'Exact Date (ຕາມວັນທີເດີມ ບໍ່ເລື່ອນ)', description: 'Keep schedule on exact calendar date regardless of holidays' }
    ];
    for (const item of holidayHandlings) {
      await db.lnLookupHolidayHandling.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const dayCounts = [
      { code: '30_360', name: '30 / 360 (Bond Basis)', daysInYear: 360, description: 'Assumes 30 days per month and 360 days per year' },
      { code: 'ACTUAL_360', name: 'Actual / 360 (Money Market)', daysInYear: 360, description: 'Actual days between dates over 360 day base' },
      { code: 'ACTUAL_365', name: 'Actual / 365 (Standard Lao)', daysInYear: 365, description: 'Actual calendar days over 365 day base' },
      { code: 'ACTUAL_ACTUAL', name: 'Actual / Actual (Leap Aware)', daysInYear: 366, description: 'Actual calendar days including leap year adjustments' }
    ];
    for (const item of dayCounts) {
      await db.lnLookupDayCount.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const rebateMethods = [
      { code: 'RULE_OF_78', name: 'Rule of 78 (ສູດ 78 ສຳລັບ Flat Rate)', description: 'Sum-of-digits rebate calculation standard for hire-purchase' },
      { code: 'ACTUARIAL_PRO_RATA', name: 'Actuarial Pro-Rata (ຕາມອັດຕາສ່ວນແທ້ຈິງ)', description: 'Exact proportional interest rebate' },
      { code: 'NONE', name: 'No Rebate (ບໍ່ມີການຄືນດອກເບ້ຍ)', description: 'Prepayment retains 100% of precomputed interest' }
    ];
    for (const item of rebateMethods) {
      await db.lnLookupRebateMethod.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const accrualMethods = [
      { code: 'DAILY_OUTSTANDING', name: 'Daily Outstanding Balance (ຄິດໄລ່ລາຍວັນຕາມຍອດຍົກມາ)', description: 'EOD accrual calculated on current principal balance' },
      { code: 'MONTHLY_FLAT', name: 'Monthly Flat Installment (ຄິດໄລ່ສະເລ່ຍລາຍເດືອນ)', description: 'Precomputed interest distributed equally across installments' },
      { code: 'UPFRONT_SIMPLE', name: 'Upfront Simple Accrual (ຄິດໄລ່ທັງໝົດລ່ວງໜ້າ)', description: 'Simple interest booked at loan inception' }
    ];
    for (const item of accrualMethods) {
      await db.lnLookupAccrualMethod.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const collateralTypes = [
      { code: 'VEHICLE', name: 'Vehicle / Automobile (ຍານພາຫະນະ/ລົດ)', description: 'Car, truck, motorcycle, or construction vehicle with chassis/engine/plate numbers' },
      { code: 'REAL_ESTATE', name: 'Real Estate / Land Title (ທີ່ດິນ-ສິ່ງປຸກສ້າງ)', description: 'Land deed or residential/commercial property' },
      { code: 'GOLD_JEWELRY', name: 'Gold / Precious Metals (ຄຳ/ເຄື່ອງປະດັບ)', description: 'Gold bullion, bars, or fine jewelry' },
      { code: 'DEPOSIT_PLEDGE', name: 'Deposit Pledge / Lien (ເງິນຝາກຄ້ຳປະກັນ)', description: 'Fixed deposit pledged against credit facility' },
      { code: 'GUARANTOR', name: 'Personal / Corporate Guarantor (ບຸກຄົນຄ້ຳປະກັນ)', description: 'Third-party joint liability guarantee' }
    ];
    for (const item of collateralTypes) {
      await db.lnLookupCollateralType.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const loanPurposes = [
      { code: 'VEHICLE_PURCHASE', name: 'Vehicle Purchase / Hire Purchase (ຊື້ລົດ/ເຊົ່າຊື້)', description: 'Financing motor vehicle from dealership' },
      { code: 'WORKING_CAPITAL', name: 'Working Capital (ທຶນໝູນວຽນ)', description: 'Business liquidity or inventory finance' },
      { code: 'ASSET_ACQUISITION', name: 'Asset Acquisition (ຊື້ຊັບສິນ)', description: 'Machinery or equipment acquisition' },
      { code: 'DEBT_CONSOLIDATION', name: 'Debt Consolidation (ລວມໜີ້)', description: 'Refinancing external liabilities' }
    ];
    for (const item of loanPurposes) {
      await db.lnLookupLoanPurpose.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    const feePresentations = [
      { code: 'IMMEDIATE', name: 'Immediate Income Recognition (ຮັບຮູ້ລາຍຮັບທັນທີ)', description: 'Upfront fee credited directly to FEE_INCOME upon charge' },
      { code: 'LIABILITY', name: 'Deferred Fee Liability (ພັກໄວ້ໃນໜີ້ສິນລໍຖ້າຕັດຈ່າຍ)', description: 'Fee credited to DEFERRED_FEE_LIABILITY and amortized over loan tenor' },
      { code: 'CONTRA_ASSET_NET', name: 'Contra-Asset Net Amortization (ຕັດທອນມູນຄ່າເງິນກູ້ - IFRS 9)', description: 'Fee offsets loan principal via UNAMORTIZED_FEE_CONTRA (Advanced EIR mode)' }
    ];
    for (const item of feePresentations) {
      await db.lnLookupDeferredFeePresentation.findOrCreate({ where: { code: item.code }, defaults: item });
    }

    // 2. Master UDEs
    console.log('Seeding Master UDEs...');
    const udes = [
      { udeCode: 'INTEREST_RATE', name: 'Standard Interest Rate (ອັດຕາດອກເບ້ຍມາດຕະຖານ)', dataType: 'RATE', description: 'Base annual lending rate' },
      { udeCode: 'SPREAD', name: 'Margin Spread (ສ່ວນต่างດອກເບ້ຍ)', dataType: 'RATE', description: 'Margin added above index rate' },
      { udeCode: 'DOWN_PAYMENT_PCT', name: 'Minimum Down Payment % (ເປີເຊັນເງິນດາວຂັ້ນຕ່ຳ)', dataType: 'RATE', description: 'Minimum down payment proportion' },
      { udeCode: 'LTV_RATIO', name: 'Maximum Loan to Value Ratio (ອັດຕາສ່ວນສິນເຊື່ອຕໍ່ມູນຄ່າຊັບສິນ)', dataType: 'RATE', description: 'Maximum financed amount divided by vehicle value' },
      { udeCode: 'GRACE_DAYS', name: 'Payment Grace Period Days (ຈຳນວນມື້ຜ່ອນຜັນ)', dataType: 'NUMBER', description: 'Days before late penalty applies' },
      { udeCode: 'PENALTY_RATE', name: 'Overdue Penalty Rate (ອັດຕາຄ່າປັບໄໝຊັກຊ້າ)', dataType: 'RATE', description: 'Annual or daily penalty applied on overdue installments' },
      { udeCode: 'PENALTY_CAP_PCT', name: 'Maximum Penalty Cap % (ເພດານຄ່າປັບໄໝສູງສຸດ %)', dataType: 'RATE', description: 'Maximum cumulative penalty as % of principal' }
    ];
    for (const u of udes) {
      await db.lnUde.findOrCreate({ where: { udeCode: u.udeCode }, defaults: u });
    }

    // 3. Tax Profile (Seeded from existing POS tax table)
    console.log('Seeding Tax Profile...');
    const defaultTax = await db.tax.findOne({ where: { isDefault: true, isActive: true } });
    const configuredRate = defaultTax ? parseFloat(defaultTax.rate) : 0.100000;
    const taxCode = defaultTax ? defaultTax.code : 'LTAX';

    let taxProfile = await db.lnTaxProfile.findOne();
    if (!taxProfile) {
      taxProfile = await db.lnTaxProfile.create({
        companyVatRegistered: true,
        confirmationStatus: 'UNCONFIRMED',
        defaultVatRate: configuredRate,
        warningBannerActive: true,
        notes: `Seeded default VAT configuration from POS tax master (${taxCode}: ${(configuredRate * 100).toFixed(1)}%). Requires management confirmation.`
      });
      console.log(`Created default ln_tax_profile: rate = ${(configuredRate * 100).toFixed(1)}%, status = UNCONFIRMED`);
    } else {
      console.log(`ln_tax_profile already exists with status = ${taxProfile.confirmationStatus}`);
    }

    // Seed Tax Master entry
    await db.lnTaxMaster.findOrCreate({
      where: { taxCode: taxCode },
      defaults: {
        taxCode: taxCode,
        taxRate: configuredRate,
        accountingRoleCode: 'TAX_PAYABLE',
        effectiveFrom: '2025-01-01',
        authStatus: 'AUTHORIZED'
      }
    });

    // 4. Components
    console.log('Seeding Components...');
    const components = [
      {
        componentCode: 'PRINCIPAL',
        name: 'Loan Principal Balance (ເງິນຕົ້ນສິນເຊື່ອ)',
        componentType: 'PRINCIPAL',
        calculationBasis: 'SANCTIONED_AMOUNT',
        liquidationMode: 'AUTO',
        allowPrepay: true,
        isTaxable: false,
        taxInclusive: false,
        taxPointEvent: 'DISB',
        authStatus: 'AUTHORIZED'
      },
      {
        componentCode: 'INTEREST',
        name: 'Normal Loan Interest (ດອກເບ້ຍປົກກະຕິ)',
        componentType: 'INTEREST',
        calculationBasis: 'OUTSTANDING_PRINCIPAL',
        liquidationMode: 'AUTO',
        allowPrepay: true,
        isTaxable: false, // Starting default: interest non-taxable
        taxInclusive: false,
        taxPointEvent: 'BILL',
        authStatus: 'AUTHORIZED'
      },
      {
        componentCode: 'PENALTY',
        name: 'Late Payment Penalty (ຄ່າປັບໄໝຊັກຊ້າ)',
        componentType: 'PENALTY',
        calculationBasis: 'OVERDUE_AMOUNT',
        liquidationMode: 'AUTO',
        allowPrepay: true,
        isTaxable: false, // Starting default: penalty non-taxable
        taxInclusive: false,
        taxPointEvent: 'BILL',
        authStatus: 'AUTHORIZED'
      },
      {
        componentCode: 'PROCESSING_FEE',
        name: 'Loan Processing Fee (ຄ່າທຳນຽມດຳເນີນເອກະສານສິນເຊື່ອ)',
        componentType: 'FEE',
        calculationBasis: 'SANCTIONED_AMOUNT',
        liquidationMode: 'AUTO',
        allowPrepay: true,
        isTaxable: true, // Starting default: fees taxable
        taxCode: taxCode,
        taxInclusive: false,
        taxPointEvent: 'DISB',
        authStatus: 'AUTHORIZED'
      },
      {
        componentCode: 'DOCUMENTATION_FEE',
        name: 'Contract & Registration Fee (ຄ່າທຳນຽມສັນຍາ ແລະ ທະບຽນລົດ)',
        componentType: 'FEE',
        calculationBasis: 'FLAT_AMOUNT',
        liquidationMode: 'AUTO',
        allowPrepay: true,
        isTaxable: true,
        taxCode: taxCode,
        taxInclusive: false,
        taxPointEvent: 'DISB',
        authStatus: 'AUTHORIZED'
      },
      {
        componentCode: 'INSURANCE_PREMIUM',
        name: 'Vehicle Insurance Pass-Through (ຄ່າປະກັນໄພລົດສົ່ງຕໍ່)',
        componentType: 'INSURANCE',
        calculationBasis: 'FLAT_AMOUNT',
        liquidationMode: 'MANUAL',
        allowPrepay: false,
        isTaxable: false, // Pass-through insurance non-taxable
        taxInclusive: false,
        taxPointEvent: 'DISB',
        authStatus: 'AUTHORIZED'
      },
      {
        componentCode: 'PREPAYMENT_PENALTY',
        name: 'Early Settlement Fee (ຄ່າທຳນຽມປິດສັນຍາກ່ອນກຳນົດ)',
        componentType: 'FEE',
        calculationBasis: 'OUTSTANDING_PRINCIPAL',
        liquidationMode: 'AUTO',
        allowPrepay: true,
        isTaxable: true,
        taxCode: taxCode,
        taxInclusive: false,
        taxPointEvent: 'DISB',
        authStatus: 'AUTHORIZED'
      },
      {
        componentCode: 'REPOSSESSION_EXPENSE',
        name: 'Vehicle Repossession Expense (ຄ່າໃຊ້ຈ່າຍຍຶດ ແລະ ຮັກສາລົດ)',
        componentType: 'FEE',
        calculationBasis: 'FLAT_AMOUNT',
        liquidationMode: 'MANUAL',
        allowPrepay: false,
        isTaxable: false,
        taxInclusive: false,
        taxPointEvent: 'DISB',
        authStatus: 'AUTHORIZED'
      }
    ];

    const compMap = {};
    for (const c of components) {
      const [rec] = await db.lnComponent.findOrCreate({ where: { componentCode: c.componentCode }, defaults: c });
      compMap[c.componentCode] = rec.id;
    }

    // 5. Product Category & Default Car Loan Products
    console.log('Seeding Product Category and Car Loan Products...');
    const [cat] = await db.lnProductCategory.findOrCreate({
      where: { code: 'VEHICLE_FINANCING' },
      defaults: {
        code: 'VEHICLE_FINANCING',
        name: 'Vehicle Hire Purchase (ສິນເຊື່ອເຊົ່າຊື້ຍານພາຫະນະ)',
        description: 'Auto loan and hire purchase financing for car dealerships',
        authStatus: 'AUTHORIZED'
      }
    });

    const products = [
      {
        productCode: 'CAR-LOAN-DB',
        name: 'Car Loan - Declining Balance (ສິນເຊື່ອລົດ - ດອກເບ້ຍຫຼຸດຕົ້ນຫຼຸດດອກ)',
        version: 1,
        categoryId: cat.id,
        effectiveDate: '2025-01-01',
        loanTypeCode: 'HIRE_PURCHASE',
        minAmount: 5000000.0,
        maxAmount: 2000000000.0,
        minTenorMonths: 6,
        maxTenorMonths: 84,
        minInterestRate: 0.050000,
        maxInterestRate: 0.360000,
        minDownPaymentPct: 0.200000,
        maxLtvPct: 0.800000,
        disbursementTargetCode: 'SALE_INVOICE_SETTLEMENT',
        feeFinancingMode: 'UPFRONT',
        deferredFeePresentation: 'IMMEDIATE',
        earlySettlementRebateMethod: 'RULE_OF_78',
        accrualMethodCode: 'DAILY_OUTSTANDING',
        dayCountCode: '30_360',
        defaultFrequencyCode: 'MONTHLY',
        holidayHandlingCode: 'NEXT_WORKING_DAY',
        partialPrepayOption: 'REDUCE_INSTALLMENT',
        overpaymentTreatment: 'CUSTOMER_ADVANCE',
        oldestInstallmentFirst: true,
        requireCollateral: true,
        requireGuarantor: false,
        authStatus: 'AUTHORIZED',
        status: 'ACTIVE'
      },
      {
        productCode: 'CAR-LOAN-FLAT',
        name: 'Car Loan - Flat Rate Installment (ສິນເຊື່ອລົດ - ດອກເບ້ຍຄົງທີ່ Flat Rate)',
        version: 1,
        categoryId: cat.id,
        effectiveDate: '2025-01-01',
        loanTypeCode: 'HIRE_PURCHASE',
        minAmount: 5000000.0,
        maxAmount: 1500000000.0,
        minTenorMonths: 6,
        maxTenorMonths: 60,
        minInterestRate: 0.040000,
        maxInterestRate: 0.250000,
        minDownPaymentPct: 0.250000,
        maxLtvPct: 0.750000,
        disbursementTargetCode: 'SALE_INVOICE_SETTLEMENT',
        feeFinancingMode: 'UPFRONT',
        deferredFeePresentation: 'IMMEDIATE',
        earlySettlementRebateMethod: 'RULE_OF_78',
        accrualMethodCode: 'MONTHLY_FLAT',
        dayCountCode: '30_360',
        defaultFrequencyCode: 'MONTHLY',
        holidayHandlingCode: 'NEXT_WORKING_DAY',
        partialPrepayOption: 'REDUCE_INSTALLMENT',
        overpaymentTreatment: 'CUSTOMER_ADVANCE',
        oldestInstallmentFirst: true,
        requireCollateral: true,
        requireGuarantor: false,
        authStatus: 'AUTHORIZED',
        status: 'ACTIVE'
      },
      {
        productCode: 'CAR-LOAN-BALLOON',
        name: 'Car Loan - Balloon Payment (ສິນເຊື່ອລົດ - ງວດທ້າຍ Balloon)',
        version: 1,
        categoryId: cat.id,
        effectiveDate: '2025-01-01',
        loanTypeCode: 'HIRE_PURCHASE',
        minAmount: 10000000.0,
        maxAmount: 3000000000.0,
        minTenorMonths: 12,
        maxTenorMonths: 72,
        minInterestRate: 0.060000,
        maxInterestRate: 0.300000,
        minDownPaymentPct: 0.200000,
        maxLtvPct: 0.800000,
        disbursementTargetCode: 'SALE_INVOICE_SETTLEMENT',
        feeFinancingMode: 'UPFRONT',
        deferredFeePresentation: 'IMMEDIATE',
        earlySettlementRebateMethod: 'RULE_OF_78',
        accrualMethodCode: 'DAILY_OUTSTANDING',
        dayCountCode: '30_360',
        defaultFrequencyCode: 'MONTHLY',
        holidayHandlingCode: 'NEXT_WORKING_DAY',
        partialPrepayOption: 'REDUCE_INSTALLMENT',
        overpaymentTreatment: 'CUSTOMER_ADVANCE',
        oldestInstallmentFirst: true,
        requireCollateral: true,
        requireGuarantor: false,
        authStatus: 'AUTHORIZED',
        status: 'ACTIVE'
      }
    ];

    // Get default system currencies
    const defaultCurrencies = await db.currency.findAll({ limit: 3 });

    for (const p of products) {
      const [prod, created] = await db.lnProduct.findOrCreate({
        where: { productCode: p.productCode, version: p.version },
        defaults: p
      });

      // Bind currencies
      if (defaultCurrencies && defaultCurrencies.length > 0) {
        for (let i = 0; i < defaultCurrencies.length; i++) {
          await db.lnProductCurrency.findOrCreate({
            where: { productId: prod.id, currencyId: defaultCurrencies[i].id },
            defaults: { productId: prod.id, currencyId: defaultCurrencies[i].id, isDefault: i === 0 }
          });
        }
      }

      // Bind Product Components
      const prodComponents = [
        { componentId: compMap['PRINCIPAL'], formulaCode: 'STANDARD_PRINCIPAL', defaultValue: 0, minValue: 0, maxValue: 10000000000, timing: 'INSTALLMENT' },
        { componentId: compMap['INTEREST'], formulaCode: 'STANDARD_ANNUITY_INTEREST', defaultValue: 0.12, minValue: 0.05, maxValue: 0.36, timing: 'INSTALLMENT' },
        { componentId: compMap['PENALTY'], formulaCode: 'LATE_OVERDUE_DAILY', defaultValue: 0.18, minValue: 0.05, maxValue: 0.36, timing: 'INSTALLMENT' },
        { componentId: compMap['PROCESSING_FEE'], formulaCode: 'UPFRONT_PCT', defaultValue: 0.01, minValue: 0.0, maxValue: 0.05, timing: 'UPFRONT_COLLECTED' },
        { componentId: compMap['DOCUMENTATION_FEE'], formulaCode: 'FIXED_CONTRACT_FEE', defaultValue: 300000, minValue: 0, maxValue: 2000000, timing: 'UPFRONT_COLLECTED' }
      ];

      for (const pc of prodComponents) {
        await db.lnProductComponent.findOrCreate({
          where: { productId: prod.id, componentId: pc.componentId },
          defaults: { productId: prod.id, ...pc, authStatus: 'AUTHORIZED' }
        });
      }

      // Bind Waterfall Rules (Standard priority: Penalty -> Fees -> Interest -> Principal)
      const waterfallPriority = [
        { priority: 1, compCode: 'PENALTY' },
        { priority: 2, compCode: 'PROCESSING_FEE' },
        { priority: 3, compCode: 'DOCUMENTATION_FEE' },
        { priority: 4, compCode: 'INTEREST' },
        { priority: 5, compCode: 'PRINCIPAL' }
      ];
      for (const wf of waterfallPriority) {
        if (compMap[wf.compCode]) {
          await db.lnWaterfallRule.findOrCreate({
            where: { productId: prod.id, accountStatus: 'NORMAL', componentId: compMap[wf.compCode] },
            defaults: {
              productId: prod.id,
              accountStatus: 'NORMAL',
              priorityOrder: wf.priority,
              componentId: compMap[wf.compCode],
              authStatus: 'AUTHORIZED'
            }
          });
        }
      }

      // Bind Product UDEs
      const prodUdes = [
        { udeCode: 'INTEREST_RATE', defaultValue: 0.12, minValue: 0.05, maxValue: 0.36, isAmendableAtAccount: true },
        { udeCode: 'DOWN_PAYMENT_PCT', defaultValue: 0.20, minValue: 0.10, maxValue: 0.90, isAmendableAtAccount: true },
        { udeCode: 'GRACE_DAYS', defaultValue: 3, minValue: 0, maxValue: 15, isAmendableAtAccount: false },
        { udeCode: 'PENALTY_RATE', defaultValue: 0.18, minValue: 0.05, maxValue: 0.36, isAmendableAtAccount: false },
        { udeCode: 'PENALTY_CAP_PCT', defaultValue: 0.20, minValue: 0.05, maxValue: 0.50, isAmendableAtAccount: false }
      ];
      for (const pu of prodUdes) {
        await db.lnProductUde.findOrCreate({
          where: { productId: prod.id, udeCode: pu.udeCode },
          defaults: { productId: prod.id, ...pu, authStatus: 'AUTHORIZED' }
        });
      }
    }

    // 6. Regulatory Classes & Provisioning Rules (Company Policy by Default)
    console.log('Seeding Regulatory Classes & Company Provisioning Rules...');
    const regClasses = [
      { classCode: 'CLASS_A', name: 'Class A: Performing / Normal (ໜີ້ປົກກະຕິ 0-30 ວັນ)', glQualifier: 'NORMAL' },
      { classCode: 'CLASS_B', name: 'Class B: Special Mention (ໜີ້ຕ້ອງເອົາໃຈໃສ່ພິເສດ 31-60 ວັນ)', glQualifier: 'WATCHLIST' },
      { classCode: 'CLASS_C', name: 'Class C: Substandard (ໜີ້ຕ່ຳກວ່າມາດຕະຖານ 61-90 ວັນ)', glQualifier: 'NPL' },
      { classCode: 'CLASS_D', name: 'Class D: Doubtful (ໜີ້ສົງໄສ 91-180 ວັນ)', glQualifier: 'NPL' },
      { classCode: 'CLASS_E', name: 'Class E: Loss (ໜີ້ສູນ/ເສຍ > 180 ວັນ)', glQualifier: 'LOSS' }
    ];
    for (const rc of regClasses) {
      await db.lnRegulatoryClass.findOrCreate({
        where: { classCode: rc.classCode },
        defaults: { ...rc, authStatus: 'AUTHORIZED' }
      });
    }

    const defaultProvisions = [
      { regulatoryClassCode: 'CLASS_A', provisionRate: 0.010000, collateralHaircutPct: 0.300000, provisionBase: 'NET_EXPOSURE' },
      { regulatoryClassCode: 'CLASS_B', provisionRate: 0.030000, collateralHaircutPct: 0.300000, provisionBase: 'NET_EXPOSURE' },
      { regulatoryClassCode: 'CLASS_C', provisionRate: 0.200000, collateralHaircutPct: 0.300000, provisionBase: 'NET_EXPOSURE' },
      { regulatoryClassCode: 'CLASS_D', provisionRate: 0.500000, collateralHaircutPct: 0.300000, provisionBase: 'NET_EXPOSURE' },
      { regulatoryClassCode: 'CLASS_E', provisionRate: 1.000000, collateralHaircutPct: 0.300000, provisionBase: 'NET_EXPOSURE' }
    ];
    for (const dp of defaultProvisions) {
      await db.lnProvisionRule.findOrCreate({
        where: { regulatoryClassCode: dp.regulatoryClassCode, productId: null, categoryId: null },
        defaults: {
          ...dp,
          effectiveFrom: '2025-01-01',
          authStatus: 'AUTHORIZED'
        }
      });
    }

    // Status Master
    const statuses = [
      { statusCode: 'NORMAL', name: 'Normal Performing (ສະຖານະປົກກະຕິ)', regulatoryClassCode: 'CLASS_A', interestTreatment: 'CONTINUE_ACCRUAL', penaltyTreatment: 'ACCRUE' },
      { statusCode: 'WATCHLIST', name: 'Watchlist / Special Mention (ຕິດຕາມພິເສດ)', regulatoryClassCode: 'CLASS_B', interestTreatment: 'CONTINUE_ACCRUAL', penaltyTreatment: 'ACCRUE' },
      { statusCode: 'SUBSTANDARD', name: 'Substandard (ຕ່ຳກວ່າມາດຕະຖານ)', regulatoryClassCode: 'CLASS_C', interestTreatment: 'SUSPEND_ACCRUAL', penaltyTreatment: 'ACCRUE' },
      { statusCode: 'DOUBTFUL', name: 'Doubtful (ສົງໄສ)', regulatoryClassCode: 'CLASS_D', interestTreatment: 'SUSPEND_ACCRUAL', penaltyTreatment: 'MEMO_ONLY' },
      { statusCode: 'LOSS', name: 'Loss (ສູນ/ເສຍ)', regulatoryClassCode: 'CLASS_E', interestTreatment: 'STOP_ACCRUAL', penaltyTreatment: 'STOP_ACCRUAL' },
      { statusCode: 'WRITTEN_OFF', name: 'Written-Off (ຕັດໜີ້ສູນອອກຈາກບັນຊີ)', regulatoryClassCode: 'CLASS_E', interestTreatment: 'STOP_ACCRUAL', penaltyTreatment: 'STOP_ACCRUAL' },
      { statusCode: 'REPOSSESSED', name: 'Vehicle Repossessed (ຍຶດລົດແລ້ວ)', regulatoryClassCode: 'CLASS_E', interestTreatment: 'STOP_ACCRUAL', penaltyTreatment: 'STOP_ACCRUAL' },
      { statusCode: 'CLOSED', name: 'Closed / Paid Off (ປິດສັນຍາແລ້ວ)', regulatoryClassCode: 'CLASS_A', interestTreatment: 'STOP_ACCRUAL', penaltyTreatment: 'STOP_ACCRUAL' }
    ];
    for (const sm of statuses) {
      await db.lnStatusMaster.findOrCreate({
        where: { statusCode: sm.statusCode },
        defaults: { ...sm, authStatus: 'AUTHORIZED' }
      });
    }

    // Status Movement Rules (DPD thresholds)
    const movements = [
      { fromStatus: 'NORMAL', toStatus: 'WATCHLIST', minDpd: 31, maxDpd: 60 },
      { fromStatus: 'WATCHLIST', toStatus: 'SUBSTANDARD', minDpd: 61, maxDpd: 90 },
      { fromStatus: 'SUBSTANDARD', toStatus: 'DOUBTFUL', minDpd: 91, maxDpd: 180 },
      { fromStatus: 'DOUBTFUL', toStatus: 'LOSS', minDpd: 181, maxDpd: 99999 }
    ];
    for (const mv of movements) {
      await db.lnStatusMovementRule.findOrCreate({
        where: { fromStatus: mv.fromStatus, toStatus: mv.toStatus },
        defaults: { ...mv, effectiveFrom: '2025-01-01', authStatus: 'AUTHORIZED' }
      });
    }

    // 7. Accounting Roles, Amount Tags & Event Master (METADATA ONLY - NO ENTRY RULES!)
    console.log('Seeding Master Accounting Roles, Amount Tags and Event Catalog...');
    const roles = [
      { roleCode: 'LOAN_PRINCIPAL_CURRENT', name: 'Current Performing Loan Principal', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'LOAN_PRINCIPAL_WATCHLIST', name: 'Special Mention Loan Principal', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'LOAN_PRINCIPAL_SUBSTANDARD', name: 'Substandard Loan Principal', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'LOAN_PRINCIPAL_DOUBTFUL', name: 'Doubtful Loan Principal', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'LOAN_PRINCIPAL_LOSS', name: 'Loss Loan Principal', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'INTEREST_RECEIVABLE', name: 'Accrued Loan Interest Receivable', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'PENALTY_RECEIVABLE', name: 'Billed Penalty Receivable', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'FEE_RECEIVABLE', name: 'Billed Fee Receivable', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'INSURANCE_RECEIVABLE', name: 'Billed Insurance Receivable', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'REPOSSESSED_ASSET', name: 'Repossessed Vehicle Inventory Asset', expectedType: 'Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'SALE_RECEIVABLE', name: 'Vehicle POS Sale Trade Receivable', expectedType: 'Asset', resolverType: 'SYSTEM_PARAM' },
      { roleCode: 'LOAN_LOSS_PROVISION', name: 'Allowance for Loan Losses (Contra-Asset)', expectedType: 'Contra-Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'SUSPENDED_INTEREST', name: 'Suspended Interest (Contra-Asset)', expectedType: 'Contra-Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'UNAMORTIZED_FEE_CONTRA', name: 'Unamortized Processing Fee (Contra-Asset)', expectedType: 'Contra-Asset', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'TAX_PAYABLE', name: 'Value Added Tax (VAT) Output Payable', expectedType: 'Liability', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'INSURANCE_PAYABLE', name: 'Insurance Premium Pass-Through Payable', expectedType: 'Liability', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'CUSTOMER_ADVANCE', name: 'Customer Excess Advance Payment Liability', expectedType: 'Liability', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'CUSTOMER_DEPOSIT_ACCOUNT', name: 'Customer Wallet / Deposit Balance', expectedType: 'Liability', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'INTEREST_INCOME', name: 'Loan Interest Income', expectedType: 'Revenue', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'PENALTY_INCOME', name: 'Late Penalty Income', expectedType: 'Revenue', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'FEE_INCOME', name: 'Origination & Documentation Fee Income', expectedType: 'Revenue', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'GAIN_ON_REPOSSESSED_ASSET', name: 'Gain on Resale of Repossessed Vehicle', expectedType: 'Revenue', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'BAD_DEBT_RECOVERY', name: 'Recovery of Written-off Loan Income', expectedType: 'Revenue', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'PROVISION_EXPENSE', name: 'Loan Loss Provision Expense', expectedType: 'Expense', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'LOAN_LOSS_SHORTFALL', name: 'Unprovisioned Write-Off Shortfall Expense', expectedType: 'Expense', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'PENALTY_WAIVER_EXPENSE', name: 'Waived Penalty Expense', expectedType: 'Expense', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'FEE_WAIVER_EXPENSE', name: 'Waived Loan Fee Expense', expectedType: 'Expense', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'LOSS_ON_REPOSSESSED_ASSET', name: 'Loss on Resale of Repossessed Vehicle', expectedType: 'Expense', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'CASH_BANK', name: 'Cash on Hand or Bank Drawer', expectedType: 'Asset', resolverType: 'BANK_ACCOUNT' },
      { roleCode: 'WRITTEN_OFF_MEMO_DR', name: 'Written-Off Loan Off-Balance Memo Asset', expectedType: 'Off-Balance', resolverType: 'MAPPING_TABLE' },
      { roleCode: 'WRITTEN_OFF_MEMO_CR', name: 'Written-Off Loan Off-Balance Memo Contra', expectedType: 'Off-Balance', resolverType: 'MAPPING_TABLE' }
    ];
    for (const r of roles) {
      await db.lnAccountingRole.findOrCreate({
        where: { roleCode: r.roleCode },
        defaults: { ...r, authStatus: 'AUTHORIZED' }
      });
    }

    const amountTags = [
      { tagCode: 'PRINCIPAL_DISBURSED', name: 'Disbursed Principal Amount' },
      { tagCode: 'FEE_AMOUNT', name: 'Fee Base Amount' },
      { tagCode: 'TAX_AMOUNT', name: 'Value Added Tax (VAT) Amount' },
      { tagCode: 'INSURANCE_AMOUNT', name: 'Insurance Premium Amount' },
      { tagCode: 'DISBURSED_NET', name: 'Net Disbursed Funds Amount' },
      { tagCode: 'INTEREST_ACCRUED', name: 'Accrued Interest Amount' },
      { tagCode: 'INTEREST_PAID', name: 'Liquidated Interest Amount' },
      { tagCode: 'PRINCIPAL_PAID', name: 'Liquidated Principal Amount' },
      { tagCode: 'PENALTY_PAID', name: 'Liquidated Penalty Amount' },
      { tagCode: 'FEE_PAID', name: 'Liquidated Fee Amount' },
      { tagCode: 'TAX_PAID', name: 'Liquidated Tax Amount' },
      { tagCode: 'OVERPAYMENT_ADVANCE', name: 'Excess Overpayment Amount' },
      { tagCode: 'PREPAY_PENALTY', name: 'Early Settlement Penalty Fee' },
      { tagCode: 'REPOSSESSION_BOOK_VAL', name: 'Book Value Transferred to Repossessed Asset' },
      { tagCode: 'REPOSSESSION_PROCEEDS', name: 'Gross Sale Proceeds of Repossessed Asset' },
      { tagCode: 'REPOSSESSION_GAIN', name: 'Net Gain on Resale of Repossessed Vehicle' },
      { tagCode: 'REPOSSESSION_LOSS', name: 'Net Loss on Resale of Repossessed Vehicle' },
      { tagCode: 'WRITEOFF_PRINCIPAL', name: 'Principal Written Off' },
      { tagCode: 'PROVISION_REVERSED', name: 'Provision Reserve Consumed or Released' },
      { tagCode: 'WRITEOFF_SHORTFALL', name: 'Write-off Shortfall Not Covered by Reserve' },
      { tagCode: 'WAIVED_AMOUNT', name: 'Waived Interest or Fee Amount' }
    ];
    for (const at of amountTags) {
      await db.lnAmountTag.findOrCreate({
        where: { tagCode: at.tagCode },
        defaults: at
      });
    }

    const events = [
      { eventCode: 'DISB', name: 'Loan Disbursement (ການເບີກຈ່າຍເງິນກູ້)', description: 'Disbursement of approved credit facility' },
      { eventCode: 'ACCR', name: 'Interest Accrual (ການຄິດໄລ່ດອກເບ້ຍຄ້າງຮັບ)', description: 'EOD accrual of interest receivable' },
      { eventCode: 'LIQD', name: 'Repayment Liquidation (ການຊຳລະເງິນກູ້)', description: 'Customer installment collection' },
      { eventCode: 'LIQD_SUSP', name: 'Suspended Interest Liquidation (ການຊຳລະດອກເບ້ຍພັກ)', description: 'Liquidation of non-performing suspended interest' },
      { eventCode: 'BILL_NON_CAP', name: 'Service Billing Non-Capitalized (ການຮຽກເກັບຄ່າທຳນຽມ)', description: 'Ad-hoc or service fee billing' },
      { eventCode: 'PREPAY', name: 'Early Settlement Prepayment (ການປິດສັນຍາກ່ອນກຳນົດ)', description: 'Full payoff and early contract termination' },
      { eventCode: 'VEH_REPOSSESS', name: 'Vehicle Repossession (ການຍຶດຊັບສິນລົດ)', description: 'Transfer defaulted principal to repossessed asset inventory' },
      { eventCode: 'VEH_DISPOSE', name: 'Disposal of Repossessed Vehicle (ການຂາຍຊັບສິນລົດຍຶດ)', description: 'Auction or resale of repossessed vehicle' },
      { eventCode: 'PROV', name: 'Loan Loss Provisioning (ການຕັ້ງຄັງສຳຮອງໜີ້ເສຍ)', description: 'Monthly or EOD adjustment of provision reserve' },
      { eventCode: 'WRITEOFF', name: 'Loan Write-Off (ການຕັດໜີ້ສູນ)', description: 'De-recognition of uncollectible loan from balance sheet' },
      { eventCode: 'WAIVE', name: 'Fee or Penalty Waiver (ການຍົກເວັ້ນຄ່າທຳນຽມ/ຄ່າປັບໄໝ)', description: 'Waiving uncollected fees, penalties, or interest' },
      { eventCode: 'REVERSAL', name: 'Transaction Reversal (ການຍົກເລີກທຸລະກຳ)', description: 'Canceling and reversing a previously posted loan transaction' }
    ];
    for (const ev of events) {
      await db.lnEventMaster.findOrCreate({
        where: { eventCode: ev.eventCode },
        defaults: ev
      });
    }

    // 8. Numbering Sequences & Batch Jobs & System Date
    console.log('Seeding Numbering Sequences, System Date & Batch Jobs...');
    const sequences = [
      { sequenceCode: 'LOAN_ACCOUNT', prefix: 'LN', nextNumber: 1, paddingLength: 5, formatPattern: '{PREFIX}-{YEAR}{MONTH}-{NUMBER}' },
      { sequenceCode: 'LOAN_APPLICATION', prefix: 'APP', nextNumber: 1, paddingLength: 5, formatPattern: '{PREFIX}-{YEAR}{MONTH}-{NUMBER}' },
      { sequenceCode: 'COLLATERAL_VEHICLE', prefix: 'VEH', nextNumber: 1, paddingLength: 5, formatPattern: '{PREFIX}-{YEAR}{MONTH}-{NUMBER}' },
      { sequenceCode: 'LOAN_TRANSACTION', prefix: 'TXN', nextNumber: 1, paddingLength: 6, formatPattern: '{PREFIX}-{YEAR}{MONTH}-{NUMBER}' }
    ];
    for (const seq of sequences) {
      await db.lnNumberingSequence.findOrCreate({
        where: { sequenceCode: seq.sequenceCode },
        defaults: seq
      });
    }

    // Initialize System Date if not present
    const today = new Date().toISOString().slice(0, 10);
    await db.lnSystemDate.findOrCreate({
      where: { branchId: 1 },
      defaults: {
        branchId: 1,
        currentBusinessDate: today,
        prevBusinessDate: today,
        nextBusinessDate: today,
        periodLockDate: today,
        status: 'OPEN'
      }
    });

    const batchJobs = [
      { jobCode: 'EOD_ACCRUAL', name: 'Daily Interest Accrual (ຄິດໄລ່ດອກເບ້ຍລາຍວັນ)', executionOrder: 1, isEnabled: true },
      { jobCode: 'EOD_PENALTY_CALC', name: 'Late Penalty Calculation (ຄິດໄລ່ຄ່າປັບໄໝຊັກຊ້າ)', executionOrder: 2, isEnabled: true },
      { jobCode: 'EOD_STATUS_CLASSIFICATION', name: 'Status & DPD Classification (ຈັດຊັ້ນໜີ້ ແລະ ວັນຄ້າງຊຳລະ)', executionOrder: 3, isEnabled: true },
      { jobCode: 'EOD_PROVISION_CALC', name: 'Loan Loss Provisioning (ຄິດໄລ່ເງິນສຳຮອງໜີ້ເສຍ)', executionOrder: 4, isEnabled: true }
    ];
    for (const bj of batchJobs) {
      await db.lnBatchJob.findOrCreate({
        where: { jobCode: bj.jobCode },
        defaults: bj
      });
    }

    console.log('--- Phase 2A Seeding Completed Successfully! ---');
    console.log('NOTE: ln_accounting_entry_rule and ln_role_gl_mapping were intentionally NOT seeded (Phase 2B hold preserved).');
    process.exit(0);
  } catch (err) {
    console.error('Phase 2A Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase2A();
