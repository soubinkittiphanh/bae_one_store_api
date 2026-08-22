const axios = require('axios');

async function testBcelQR() {
    const authUrl = 'https://bcel.la:8093/onepayservice/authen';
    const qrUrl = 'https://bcel.la:8093/onepayservice/genonepayqr';
    
    const credentials = {
        username: 'KAISONEMINIMART',
        password: '112233'
    };

    console.log('1. Authenticating...');
    try {
        const authResponse = await axios.post(authUrl, credentials, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (!authResponse.data || !authResponse.data.jwt) {
            throw new Error(`Authentication response missing JWT: ${JSON.stringify(authResponse.data)}`);
        }

        const token = authResponse.data.jwt;
        const mcid = authResponse.data.user?.MCID;
        console.log(`✓ Authenticated successfully! Resolved MCID: ${mcid}`);

        console.log('\n2. Generating Dynamic QR Code...');
        const billNumber = `TEST-${Date.now()}`;
        const payload = {
            amount: '5000', // 5,000 LAK
            uuid: billNumber,
            invoiceid: billNumber,
            desc: 'Test Dynamic QR Generation',
            expire: 10, // 10 minutes
            terminalid: 'ONEPAYPOS'
        };

        console.log(`Sending Payload: ${JSON.stringify(payload, null, 2)}`);

        const qrResponse = await axios.post(qrUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            timeout: 15000
        });

        console.log('\nResponse received:');
        console.log(JSON.stringify(qrResponse.data, null, 2));

        if (qrResponse.data && qrResponse.data.result === 0) {
            console.log('\n✓ SUCCESS! BCEL Dynamic QR Code Generated!');
            console.log('QR Code String:');
            console.log(qrResponse.data.data?.qrc);
        } else {
            console.log('\n✗ FAILED to generate QR code:');
            console.log(qrResponse.data?.message || 'Unknown response format');
        }

    } catch (error) {
        console.error('\n✗ ERROR occurred during integration test:');
        if (error.response) {
            console.error(`HTTP Status: ${error.response.status} ${error.response.statusText}`);
            console.error('Response Data:');
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(`Error message: ${error.message}`);
        }
    }
}

testBcelQR();
