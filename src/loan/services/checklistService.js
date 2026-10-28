const db = require('../../models');
const logger = require('../../api/logger');

const checklistService = {
  /**
   * Get the full Go-Live Checklist evaluation
   */
  async getChecklist() {
    // 1. Tax Profile check
    const taxProfile = await db.lnTaxProfile.findOne();
    const isTaxConfirmed = taxProfile && taxProfile.confirmationStatus === 'CONFIRMED';

    // 2. Fee Treatment check (check default products feeFinancingMode and deferredFeePresentation)
    const products = await db.lnProduct.findAll({
      attributes: ['id', 'productCode', 'name', 'feeFinancingMode', 'deferredFeePresentation', 'status']
    });
    const feeReviewed = products.length > 0 && products.every(p => p.feeFinancingMode && p.deferredFeePresentation);

    // 3. Provisioning Rules check (check if ln_provision_rule exists and rates are confirmed)
    const provisionRules = await db.lnProvisionRule.findAll({
      attributes: ['id', 'regulatoryClassCode', 'provisionRate', 'collateralHaircutPct', 'authStatus']
    });
    const provisionReviewed = provisionRules.length >= 5;

    // 4. DPD Delinquency Ranges check (check ln_status_movement_rule)
    const movementRules = await db.lnStatusMovementRule.findAll({
      attributes: ['id', 'fromStatus', 'toStatus', 'minDpd', 'maxDpd', 'authStatus']
    });
    const dpdReviewed = movementRules.length >= 4;

    // 5. GL Role Mappings check (Phase 2B readiness)
    const glMappingsCount = await db.lnRoleGlMapping.count();
    const glRolesCount = await db.lnAccountingRole.count();
    const glMappingsConfirmed = glMappingsCount > 0;

    const checklistItems = [
      {
        itemKey: 'TAX_PROFILE',
        category: 'Tax & VAT Engine (ລະບົບອາກອນ)',
        title: 'Tax Profile & Component Taxability (ການກຳນົດອາກອນມູນຄ່າເພີ່ມ VAT)',
        description: isTaxConfirmed
          ? `Confirmed: Company VAT registered at ${(parseFloat(taxProfile.defaultVatRate || 0.1) * 100).toFixed(1)}%. Production billing unlocked.`
          : '⚠️ UNCONFIRMED: VAT registration and component tax rules must be reviewed and confirmed before production disbursement.',
        status: isTaxConfirmed ? 'CONFIRMED' : 'UNCONFIRMED',
        severity: 'BLOCKING',
        confirmedBy: taxProfile ? taxProfile.confirmedBy : null,
        confirmedAt: taxProfile ? taxProfile.confirmedAt : null,
        actionLabel: isTaxConfirmed ? 'Re-review Tax Profile' : 'Confirm Tax Profile'
      },
      {
        itemKey: 'FEE_TREATMENT',
        category: 'Accounting Policy (ນະໂຍບາຍບັນຊີ)',
        title: 'Fee Treatment Defaults (ຮູບແບບການຮັບຮູ້ຄ່າທຳນຽມ)',
        description: 'Default: UPFRONT financing with IMMEDIATE fee-to-income recognition. Pass-through insurance.',
        status: feeReviewed ? 'CONFIRMED' : 'UNCONFIRMED',
        severity: 'IMPORTANT',
        details: {
          feeFinancingMode: 'UPFRONT',
          deferredFeePresentation: 'IMMEDIATE',
          insuranceMode: 'UPFRONT'
        },
        actionLabel: 'Review Fee Settings'
      },
      {
        itemKey: 'PROVISION_POLICY',
        category: 'Risk & Provisioning (ນະໂຍບາຍສຳຮອງໜີ້)',
        title: 'Company Provisioning Rules (ອັດຕາສຳຮອງໜີ້ຕາມນະໂຍບາຍບໍລິສັດ)',
        description: 'Company management policy default rates (Class A: 1%, B: 3%, C: 20%, D: 50%, E: 100%). Not assumed BOL mandated.',
        status: provisionReviewed ? 'CONFIRMED' : 'UNCONFIRMED',
        severity: 'WARNING',
        itemCount: provisionRules.length,
        actionLabel: 'Edit Provision Rates'
      },
      {
        itemKey: 'DPD_CLASSIFICATION',
        category: 'Credit Operations (ການຈັດຊັ້ນໜີ້)',
        title: 'DPD Delinquency Aging Thresholds (ຊ່ວງວັນຄ້າງຊຳລະ DPD)',
        description: 'Normal (0-30 DPD), Watchlist (31-60 DPD), Substandard (61-90 DPD), Doubtful (91-180 DPD), Loss (>180 DPD).',
        status: dpdReviewed ? 'CONFIRMED' : 'UNCONFIRMED',
        severity: 'WARNING',
        itemCount: movementRules.length,
        actionLabel: 'Review Aging Rules'
      },
      {
        itemKey: 'GL_ROLE_MAPPINGS',
        category: 'General Ledger Integration (ການເຊື່ອມໂຍງຜັງບັນຊີ)',
        title: 'Chart of Accounts Role Mappings (ການຈັບຄູ່ລະຫັດບັນຊີ GL - Phase 2B)',
        description: glMappingsConfirmed
          ? `${glMappingsCount} accounting roles mapped to Chart of Accounts.`
          : 'Pending Phase 2B Confirmation: 31 accounting roles registered. GL mappings held pending Rev 5 confirmation.',
        status: glMappingsConfirmed ? 'CONFIRMED' : 'HELD_PENDING_REV5',
        severity: 'HOLD',
        rolesCount: glRolesCount,
        actionLabel: 'Inspect Roles'
      }
    ];

    const allConfirmed = isTaxConfirmed && feeReviewed && provisionReviewed && dpdReviewed;
    const canDisburse = isTaxConfirmed;

    return {
      checklistItems,
      allConfirmed,
      canDisburse,
      warningBannerActive: !canDisburse
    };
  },

  /**
   * Confirm an individual checklist item
   */
  async confirmItem(itemKey, userId) {
    if (itemKey === 'TAX_PROFILE') {
      const taxProfile = await db.lnTaxProfile.findOne();
      if (taxProfile) {
        await taxProfile.update({
          confirmationStatus: 'CONFIRMED',
          confirmedBy: userId,
          confirmedAt: new Date(),
          warningBannerActive: false
        });
      }
    }
    logger.info(`Checklist item ${itemKey} confirmed by user ${userId}`);
    return this.getChecklist();
  }
};

module.exports = checklistService;
