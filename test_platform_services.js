const { sequelize } = require('./src/models/database');
const db = require('./src/models');
const { encryptToken, decryptToken } = require('./src/platform/tokenHelper');
const accountController = require('./src/platform/account/controller');

async function runTests() {
  console.log('===========================================================');
  console.log('🧪 Starting Multi-Platform & Quota Backend Automated Tests');
  console.log('===========================================================');

  try {
    // 1. Verify models loaded in Sequelize
    console.log('\n[TEST 1] Verifying Model Registration...');
    if (!db.platform) throw new Error('db.platform model not registered!');
    if (!db.platformAccount) throw new Error('db.platformAccount model not registered!');
    console.log('✅ Both db.platform and db.platformAccount registered successfully.');

    // 2. Query Master Platforms
    console.log('\n[TEST 2] Querying Master Platforms Catalog...');
    const platforms = await db.platform.findAll({ where: { isActive: true }, raw: true });
    console.log(`Found ${platforms.length} active platforms:`);
    platforms.forEach(p => console.log(`   - [${p.code}] ${p.name} (${p.category}) Chat:${p.hasChat} OrderSync:${p.hasOrderSync}`));
    if (platforms.length === 0) throw new Error('No platforms found in database!');
    console.log('✅ Master platforms queried successfully.');

    // 3. Test Token Encryption & Decryption
    console.log('\n[TEST 3] Testing Token AES-256 Encryption & Decryption...');
    const rawToken = 'EAAK1234567890MetaPageAccessTokenSecretValue';
    const encrypted = encryptToken(rawToken);
    console.log(`   Raw:       ${rawToken}`);
    console.log(`   Encrypted: ${encrypted}`);
    const decrypted = decryptToken(encrypted);
    console.log(`   Decrypted: ${decrypted}`);
    if (decrypted !== rawToken) throw new Error('Decryption mismatch!');
    console.log('✅ Token encryption & decryption working perfectly.');

    // 4. Test Merchant Account Connection & Page Quota Enforcement
    console.log('\n[TEST 4] Testing Merchant Account Connection & Page Quota Limit...');
    const fbPlatform = platforms.find(p => p.code === 'facebook');
    const tiktokPlatform = platforms.find(p => p.code === 'tiktok');
    const shopeePlatform = platforms.find(p => p.code === 'shopee');

    const testCompanyId = 9999; // Test company ID

    // Clean up any test records
    await db.platformAccount.destroy({ where: { companyId: testCompanyId } });

    // Mock Req/Res for Connect Account #1 (FB Page)
    console.log('Connecting Account 1 (Facebook Page)...');
    let res1Data = null;
    await accountController.connectAccount(
      {
        body: {
          companyId: testCompanyId,
          platformId: fbPlatform.id,
          externalAccountId: 'fb_page_1001',
          accountName: 'My Facebook Store',
          accessToken: 'EAATestToken_FB_1001',
          isChatEnabled: true
        }
      },
      {
        status: (code) => ({
          json: (data) => { res1Data = { code, data }; }
        })
      }
    );
    console.log(`   Response: status=${res1Data.code}, message="${res1Data.data.message}"`);
    if (res1Data.code !== 201) throw new Error('Failed to connect Account 1');

    // Connect Account #2 (TikTok Account)
    console.log('Connecting Account 2 (TikTok Account)...');
    let res2Data = null;
    await accountController.connectAccount(
      {
        body: {
          companyId: testCompanyId,
          platformId: tiktokPlatform.id,
          externalAccountId: 'tiktok_seller_2002',
          accountName: 'My TikTok Shop',
          accessToken: 'TikTokAccessToken_2002',
          refreshToken: 'TikTokRefreshToken_2002'
        }
      },
      {
        status: (code) => ({
          json: (data) => { res2Data = { code, data }; }
        })
      }
    );
    console.log(`   Response: status=${res2Data.code}, message="${res2Data.data.message}"`);
    if (res2Data.code !== 201) throw new Error('Failed to connect Account 2');

    // Attempt Account #3 (Should FAIL due to default quota of 2!)
    console.log('Connecting Account 3 (Shopee) - Expecting QUOTA BLOCK (403)...');
    let res3Data = null;
    await accountController.connectAccount(
      {
        body: {
          companyId: testCompanyId,
          platformId: shopeePlatform.id,
          externalAccountId: 'shopee_shop_3003',
          accountName: 'My Shopee Mall'
        }
      },
      {
        status: (code) => ({
          json: (data) => { res3Data = { code, data }; }
        })
      }
    );
    console.log(`   Response: status=${res3Data.code}, code=${res3Data.data.code}, message="${res3Data.data.message}"`);
    if (res3Data.code !== 403 || res3Data.data.code !== 'PAGE_LIMIT_REACHED') {
      throw new Error(`Expected 403 PAGE_LIMIT_REACHED, got status ${res3Data.code}`);
    }
    console.log('✅ Page quota enforcement working! 3rd account successfully blocked.');

    // 5. Test Decrypted Token Retrieval for Internal Webhook / Send API
    console.log('\n[TEST 5] Testing Decrypted Token Retrieval for Webhooks...');
    const decryptedAccount = await accountController.getDecryptedToken(fbPlatform.id, 'fb_page_1001');
    console.log('Retrieved account for webhook:', {
      companyId: decryptedAccount.companyId,
      accountName: decryptedAccount.accountName,
      accessToken: decryptedAccount.accessToken
    });
    if (decryptedAccount.accessToken !== 'EAATestToken_FB_1001') {
      throw new Error('Retrieved decrypted token did not match original!');
    }
    console.log('✅ Decrypted token retrieved successfully for Webhook handlers.');

    // Clean up test records
    await db.platformAccount.destroy({ where: { companyId: testCompanyId } });
    console.log('\nCleaned up test records.');

    console.log('\n===========================================================');
    console.log('🎉 ALL BACKEND PLATFORM & QUOTA TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
