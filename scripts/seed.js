require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const seed = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is required. Set it in .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
        console.log('Admin already exists. Skipping seed to avoid data loss.');
        console.log(`Existing admin: ${existingAdmin.email}`);
        await mongoose.connection.close();
        process.exit(0);
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@pharmacy.bf';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';

    const admin = await User.create({
        nom: 'Administrateur Principal',
        email: adminEmail,
        passwordHash: adminPassword,
        role: 'admin',
        actif: true,
    });

    console.log('\nSeed termine avec succes!');
    console.log(`Admin cree: ${admin.email}`);
    console.log("Connectez-vous en tant qu'admin pour creer les pharmaciens et caissiers.");

    await mongoose.connection.close();
    process.exit(0);
};

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
