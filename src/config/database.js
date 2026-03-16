const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharmacy_manager_bf';

    mongoose.set('strictQuery', false);

    mongoose.connection.on('connected', () => logger.info('✅ MongoDB connecté'));
    mongoose.connection.on('error', (err) => logger.error('❌ MongoDB erreur:', err));
    mongoose.connection.on('disconnected', () => logger.warn('⚠️ MongoDB déconnecté'));

    await mongoose.connect(uri);
};

module.exports = connectDB;
