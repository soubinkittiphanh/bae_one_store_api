const axios = require('axios');

async function testBcelAuth() {
    const url = 'https://bcel.la:8093/onepayservice/authen';
    const payload = {
        username: 'KAISONEMINIMART',
        password: '112233'
    };

    console.log(`Sending POST request to: ${url}`);
    console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);
    console.log('--------------------------------------------');

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log('SUCCESS! Connection and authentication completed.');
        console.log(`HTTP Status: ${response.status} ${response.statusText}`);
        console.log('Response Body:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data && response.data.jwt) {
            console.log('--------------------------------------------');
            console.log('JWT Token successfully received!');
            console.log(`Resolved Merchant ID (MCID): ${response.data.user?.MCID || 'N/A'}`);
            console.log(`Token Expires At: ${response.data.expire || 'N/A'}`);
        } else {
            console.log('Warning: No JWT token found in the response.');
        }

    } catch (error) {
        console.error('ERROR: Authentication request failed.');
        if (error.response) {
            console.error(`HTTP Status: ${error.response.status} ${error.response.statusText}`);
            console.error('Response Data:');
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(`Error message: ${error.message}`);
        }
    }
}

testBcelAuth();
