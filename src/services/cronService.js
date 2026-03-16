const cron = require('node-cron');
const { checkExpirationAlerts } = require('./alertService');
const logger = require('../config/logger');

const startCronJobs = () => {
    // Every day at 6:00 AM: check for expiring lots and auto-retire expired ones
    cron.schedule('0 6 * * *', async () => {
        logger.info('⏰ Cron: Vérification des dates d\'expiration...');
        await checkExpirationAlerts();
        logger.info('✅ Cron: Vérification terminée');
    }, {
        scheduled: true,
        timezone: 'Africa/Ouagadougou',
    });

    logger.info('🕐 Cron jobs démarrés (timezone: Africa/Ouagadougou)');
};

module.exports = { startCronJobs };
