const defineLoanAssociations = (models) => {
  const {
    lnProductCategory,
    lnProduct,
    lnProductCurrency,
    lnComponent,
    lnProductComponent,
    lnWaterfallRule,
    lnUde,
    lnProductUde,
    lnRateIndex,
    lnRateIndexValue,
    lnRateTier,
    lnHolidayCalendar,
    lnHolidayDate,
    lnFeeMaster,
    lnTaxMaster,
    lnRegulatoryClass,
    lnStatusMaster,
    lnStatusMovementRule,
    lnStatusCureRule,
    lnProvisionRule,
    lnProvisionLedger,
    lnApprovalMatrix,
    lnApprovalLog,
    lnDocumentChecklist,
    lnApplicationDocument,
    lnAccountingRole,
    lnAmountTag,
    lnEventMaster,
    lnAccountingEntryRule,
    lnRoleGlMapping,
    lnGlBatch,
    lnCollateralMaster,
    lnCollateralVehicle,
    lnLoanCollateral,
    lnApplication,
    lnGuarantor,
    lnAccount,
    lnAccountParamSnapshot,
    lnAccountUde,
    lnAccountBalance,
    lnSchedule,
    lnScheduleComponent,
    lnAccrualLedger,
    lnTransaction,
    lnTransactionAllocation,
    lnJournalPosting,
    lnStatusHistory,
    lnAmendmentHistory,
    // External models
    currency,
    chartAccount,
    client,
    cifCustomer,
    saleHeader,
    user
  } = models;

  // Product Category & Product
  lnProduct.belongsTo(lnProductCategory, { foreignKey: 'categoryId', as: 'category' });
  lnProductCategory.hasMany(lnProduct, { foreignKey: 'categoryId', as: 'products' });

  // Product Currencies
  lnProduct.hasMany(lnProductCurrency, { foreignKey: 'productId', as: 'allowedCurrencies' });
  lnProductCurrency.belongsTo(lnProduct, { foreignKey: 'productId', as: 'product' });
  if (currency) {
    lnProductCurrency.belongsTo(currency, { foreignKey: 'currencyId', as: 'currency' });
  }

  // Product Components
  lnProduct.hasMany(lnProductComponent, { foreignKey: 'productId', as: 'components' });
  lnProductComponent.belongsTo(lnProduct, { foreignKey: 'productId', as: 'product' });
  lnProductComponent.belongsTo(lnComponent, { foreignKey: 'componentId', as: 'componentMaster' });
  lnProductComponent.hasMany(lnRateTier, { foreignKey: 'productComponentId', as: 'rateTiers' });

  // Product UDEs
  lnProduct.hasMany(lnProductUde, { foreignKey: 'productId', as: 'udes' });
  lnProductUde.belongsTo(lnProduct, { foreignKey: 'productId', as: 'product' });

  // Rate Index Values
  lnRateIndex.hasMany(lnRateIndexValue, { foreignKey: 'rateIndexId', as: 'values' });
  lnRateIndexValue.belongsTo(lnRateIndex, { foreignKey: 'rateIndexId', as: 'rateIndex' });

  // Waterfall Rules
  lnProduct.hasMany(lnWaterfallRule, { foreignKey: 'productId', as: 'waterfallRules' });
  lnWaterfallRule.belongsTo(lnProduct, { foreignKey: 'productId', as: 'product' });
  lnWaterfallRule.belongsTo(lnComponent, { foreignKey: 'componentId', as: 'component' });

  // Holiday Calendar
  lnHolidayCalendar.hasMany(lnHolidayDate, { foreignKey: 'calendarId', as: 'dates' });
  lnHolidayDate.belongsTo(lnHolidayCalendar, { foreignKey: 'calendarId', as: 'calendar' });

  // Fee & Tax Masters linked to Component
  lnFeeMaster.belongsTo(lnComponent, { foreignKey: 'componentId', as: 'component' });
  lnTaxMaster.belongsTo(lnComponent, { foreignKey: 'componentId', as: 'component' });

  // Status & Regulatory
  lnStatusMaster.belongsTo(lnRegulatoryClass, { foreignKey: 'regulatoryClassCode', targetKey: 'classCode', as: 'regulatoryClass' });
  lnProvisionRule.belongsTo(lnRegulatoryClass, { foreignKey: 'regulatoryClassCode', targetKey: 'classCode', as: 'regulatoryClass' });

  // Document Checklist
  lnProduct.hasMany(lnDocumentChecklist, { foreignKey: 'productId', as: 'documentChecklist' });

  // Collateral & Vehicle
  lnCollateralMaster.hasOne(lnCollateralVehicle, { foreignKey: 'collateralId', as: 'vehicleDetails' });
  lnCollateralVehicle.belongsTo(lnCollateralMaster, { foreignKey: 'collateralId', as: 'collateral' });

  // Application
  lnApplication.belongsTo(lnProduct, { foreignKey: 'productId', as: 'product' });
  lnApplication.hasMany(lnGuarantor, { foreignKey: 'applicationId', as: 'guarantors' });
  lnApplication.hasMany(lnApplicationDocument, { foreignKey: 'applicationId', as: 'documents' });
  if (currency) lnApplication.belongsTo(currency, { foreignKey: 'currencyId', as: 'currency' });
  if (saleHeader) lnApplication.belongsTo(saleHeader, { foreignKey: 'vehicleSaleHeaderId', as: 'vehicleSale' });
  if (client) lnApplication.belongsTo(client, { foreignKey: 'customerId', as: 'client' });

  // Loan Account
  lnAccount.belongsTo(lnApplication, { foreignKey: 'applicationId', as: 'application' });
  lnAccount.belongsTo(lnProduct, { foreignKey: 'productId', as: 'product' });
  lnAccount.hasOne(lnAccountParamSnapshot, { foreignKey: 'loanAccountId', as: 'paramSnapshot' });
  lnAccount.hasMany(lnAccountUde, { foreignKey: 'loanAccountId', as: 'accountUdes' });
  lnAccount.hasMany(lnAccountBalance, { foreignKey: 'loanAccountId', as: 'balances' });
  lnAccount.hasMany(lnSchedule, { foreignKey: 'loanAccountId', as: 'schedules' });
  lnAccount.hasMany(lnTransaction, { foreignKey: 'loanAccountId', as: 'transactions' });
  lnAccount.hasMany(lnLoanCollateral, { foreignKey: 'loanAccountId', as: 'pledgedCollaterals' });
  lnLoanCollateral.belongsTo(lnCollateralMaster, { foreignKey: 'collateralId', as: 'collateral' });
  if (currency) lnAccount.belongsTo(currency, { foreignKey: 'currencyId', as: 'currency' });
  if (saleHeader) lnAccount.belongsTo(saleHeader, { foreignKey: 'saleHeaderId', as: 'vehicleSale' });

  // Schedule & Schedule Components
  lnSchedule.belongsTo(lnAccount, { foreignKey: 'loanAccountId', as: 'account' });
  lnSchedule.hasMany(lnScheduleComponent, { foreignKey: 'scheduleId', as: 'components' });
  lnScheduleComponent.belongsTo(lnSchedule, { foreignKey: 'scheduleId', as: 'schedule' });
  lnScheduleComponent.belongsTo(lnComponent, { foreignKey: 'componentId', as: 'component' });

  // Account Balances
  lnAccountBalance.belongsTo(lnAccount, { foreignKey: 'loanAccountId', as: 'account' });
  lnAccountBalance.belongsTo(lnComponent, { foreignKey: 'componentId', as: 'component' });

  // Transactions & Allocations
  lnTransaction.belongsTo(lnAccount, { foreignKey: 'loanAccountId', as: 'account' });
  lnTransaction.hasMany(lnTransactionAllocation, { foreignKey: 'transactionId', as: 'allocations' });
  lnTransactionAllocation.belongsTo(lnTransaction, { foreignKey: 'transactionId', as: 'transaction' });
  lnTransactionAllocation.belongsTo(lnScheduleComponent, { foreignKey: 'scheduleComponentId', as: 'scheduleComponent' });

  // Journal Postings & GL Mapping
  lnJournalPosting.belongsTo(lnTransaction, { foreignKey: 'transactionId', as: 'transaction' });
  if (chartAccount) {
    lnJournalPosting.belongsTo(chartAccount, { foreignKey: 'chartAccountId', as: 'chartAccount' });
    lnRoleGlMapping.belongsTo(chartAccount, { foreignKey: 'chartAccountId', as: 'chartAccount' });
  }

  // Provision Ledger
  lnProvisionLedger.belongsTo(lnAccount, { foreignKey: 'loanAccountId', as: 'account' });

  // Accrual Ledger
  lnAccrualLedger.belongsTo(lnAccount, { foreignKey: 'loanAccountId', as: 'account' });
  lnAccrualLedger.belongsTo(lnComponent, { foreignKey: 'componentId', as: 'component' });
};

module.exports = (sequelize, DataTypes) => {
  const lookupModels = require('./lookup')(sequelize, DataTypes);
  const taxProfileModels = require('./taxProfile')(sequelize, DataTypes);
  const productModels = require('./product')(sequelize, DataTypes);
  const udeModels = require('./ude')(sequelize, DataTypes);
  const calendarModels = require('./calendar')(sequelize, DataTypes);
  const statusModels = require('./status')(sequelize, DataTypes);
  const governanceModels = require('./governance')(sequelize, DataTypes);
  const accountingSetupModels = require('./accountingSetup')(sequelize, DataTypes);
  const collateralModels = require('./collateral')(sequelize, DataTypes);
  const applicationModels = require('./application')(sequelize, DataTypes);
  const accountModels = require('./account')(sequelize, DataTypes);
  const scheduleModels = require('./schedule')(sequelize, DataTypes);
  const transactionModels = require('./transaction')(sequelize, DataTypes);
  const systemModels = require('./system')(sequelize, DataTypes);

  const allLoanModels = {
    ...lookupModels,
    ...taxProfileModels,
    ...productModels,
    ...udeModels,
    ...calendarModels,
    ...statusModels,
    ...governanceModels,
    ...accountingSetupModels,
    ...collateralModels,
    ...applicationModels,
    ...accountModels,
    ...scheduleModels,
    ...transactionModels,
    ...systemModels
  };

  return {
    models: allLoanModels,
    defineLoanAssociations
  };
};
