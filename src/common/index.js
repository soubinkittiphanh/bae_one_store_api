
const internalCommunicationResponse = {
    mti: '',
    msg: '',
    key: '',
}

const generateLockingSessionId = () => {
    const lockingSessionId = Date.now() + generateRandomStringAndNumber(5)
    return lockingSessionId
}



const generateRandomStringAndNumber = (length) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;

    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    const randomNumber = Math.floor(Math.random() * 1000);

    return result + randomNumber;
}
// javascript
// Get current date
const getBetweenDateInCurrentMonth = () => {
    let currentDate = new Date();

    // Get the beginning of the current month
    let beginningOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 2);

    // Get the last day of the current month
    let lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // Format the dates as strings
    let beginningOfMonthString = beginningOfMonth.toISOString().substring(0, 10);
    let lastDayOfMonthString = lastDayOfMonth.toISOString().substring(0, 10);

    // Print the dates
    console.log("Beginning of month 1: " + beginningOfMonthString);
    console.log("Last day of month 1: " + lastDayOfMonthString);

    return {
        beginningOfMonthString,
        lastDayOfMonthString
    }

}


module.exports = { 
    getBetweenDateInCurrentMonth, 
    internalCommunicationResponse,
    generateLockingSessionId };