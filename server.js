require('dotenv').config();
const app = require('./app');
const connectDB = require('./src/config/database');
const logger = require('./src/config/logger');
const { startCronJobs } = require('./src/services/cronService');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Connect to MongoDB then start server
connectDB().then(() => {
    app.listen(PORT, HOST, () => {
        logger.info(`🚀 PharmacyManager BF API running at http://${HOST}:${PORT}`);
        logger.info(`📚 Swagger docs: http://${HOST}:${PORT}/api/docs`);
        logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });

    // Start cron jobs (expiration alerts, etc.)
    startCronJobs();
}).catch((err) => {
    logger.error('Failed to connect to MongoDB:', err);
    process.exit(1);
});
