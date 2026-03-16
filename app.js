const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const logger = require('./src/config/logger');

const app = express();

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        process.env.MOBILE_URL || 'http://localhost:5000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Global rate limiter: 100 req/min per IP
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, message: 'Trop de requêtes. Réessayez dans une minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Stricter limiter for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

// ─── Parsing Middleware ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ────────────────────────────────────────────────────────────────
app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Swagger Docs ────────────────────────────────────────────────────────────
try {
    const swaggerSpec = require('./src/config/swagger');
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} catch (e) {
    logger.warn('Swagger config not found, skipping docs.');
}

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./src/routes/authRoutes'));
app.use('/api/users', require('./src/routes/userRoutes'));
app.use('/api/medicines', require('./src/routes/medicineRoutes'));
app.use('/api/lots', require('./src/routes/lotRoutes'));
app.use('/api/stock', require('./src/routes/stockRoutes'));
app.use('/api/sales', require('./src/routes/saleRoutes'));
app.use('/api/alerts', require('./src/routes/alertRoutes'));
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));
app.use('/api/reports', require('./src/routes/reportRoutes'));
app.use('/api/activity', require('./src/routes/activityRoutes'));
app.use('/api/commandes', require('./src/routes/commandeRoutes'));

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'PharmacyManager BF API is running', timestamp: new Date() });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} introuvable.` });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

    if (err.name === 'ValidationError') {
        return res.status(400).json({ success: false, message: 'Données invalides', errors: err.errors });
    }
    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'ID invalide' });
    }
    if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'Cette entrée existe déjà' });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Erreur interne du serveur',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

module.exports = app;
