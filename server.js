require('dotenv').config();
const logger = require('./src/config/logger');

// ─── Validate required env vars before anything else ─────────────────────────
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI'];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
    logger.error('JWT_SECRET must be at least 32 characters');
    process.exit(1);
}
if (process.env.JWT_REFRESH_SECRET.length < 32) {
    logger.error('JWT_REFRESH_SECRET must be at least 32 characters');
    process.exit(1);
}

const app = require('./app');
const connectDB = require('./src/config/database');
const { startCronJobs } = require('./src/services/cronService');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

let server;

// Connect to MongoDB then start server
connectDB().then(() => {
    server = app.listen(PORT, HOST, () => {
        logger.info(`PharmacyManager BF API running at http://${HOST}:${PORT}`);
        logger.info(`Swagger docs: http://${HOST}:${PORT}/api/docs`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Start cron jobs (expiration alerts, etc.)
    startCronJobs();
}).catch((err) => {
    logger.error('Failed to connect to MongoDB:', err);
    process.exit(1);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
const mongoose = require('mongoose');

const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    if (server) {
        server.close(() => {
            logger.info('HTTP server closed');
        });
    }
    try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
    } catch (err) {
        logger.error('Error closing MongoDB connection:', err);
    }
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
