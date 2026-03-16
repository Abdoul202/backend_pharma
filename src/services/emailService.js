const nodemailer = require('nodemailer');
const User = require('../models/User');
const logger = require('../config/logger');

const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
};

const sendAlertEmail = async (alert, medicine) => {
    try {
        if (!process.env.EMAIL_USER) return; // Skip if not configured

        const admins = await User.find({ role: 'admin', actif: true }).select('email nom');
        if (admins.length === 0) return;

        const transporter = createTransporter();
        const subject = alert.type === 'stock_bas'
            ? `⚠️ Stock bas — ${medicine.nom}`
            : `🗓️ Expiration proche — ${medicine.nom}`;

        await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'PharmacyManager BF <no-reply@pharmacy.bf>',
            to: admins.map(a => a.email).join(', '),
            subject,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: ${alert.type === 'stock_bas' ? '#e74c3c' : '#f39c12'};">
            ${subject}
          </h2>
          <p>${alert.message}</p>
          <p><strong>Médicament:</strong> ${medicine.nom} (${medicine.forme})</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <hr/>
          <small>PharmacyManager BF — Notification automatique</small>
        </div>
      `,
        });

        alert.emailEnvoye = true;
        await alert.save();
        logger.info(`Alert email sent for ${medicine.nom}`);
    } catch (err) {
        logger.error('sendAlertEmail error:', err.message);
    }
};

module.exports = { sendAlertEmail };
