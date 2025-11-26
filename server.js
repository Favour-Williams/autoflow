/**
 * AutoFlow - AI-Powered Workflow Automation
 * Main Express Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import controllers
const workflowController = require('./controllers/workflowController');
const executionController = require('./controllers/executionController');
const triggerController = require('./controllers/triggerController');

// Import services
const TriggerManager = require('./services/triggerManager');
const Database = require('./database/db');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Workflow routes
app.get('/api/workflows', workflowController.listWorkflows);
app.get('/api/workflows/:id', workflowController.getWorkflow);
app.post('/api/workflows', workflowController.createWorkflow);
app.put('/api/workflows/:id', workflowController.updateWorkflow);
app.delete('/api/workflows/:id', workflowController.deleteWorkflow);

// Execution routes
app.post('/api/workflows/:id/execute', executionController.executeWorkflow);
app.get('/api/executions', executionController.listExecutions);
app.get('/api/executions/:id', executionController.getExecution);

// Trigger routes
app.post('/api/triggers/webhook/:workflowId', triggerController.handleWebhook);
app.get('/api/triggers/schedules', triggerController.listSchedules);
app.post('/api/triggers/schedules', triggerController.createSchedule);
app.delete('/api/triggers/schedules/:id', triggerController.deleteSchedule);

// Statistics
app.get('/api/stats', async (req, res) => {
    try {
        const db = new Database();
        const stats = await db.getStats();
        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Serve main UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

async function initializeServer() {
    try {
        // Initialize database
        console.log('🗄️  Initializing database...');
        const db = new Database();
        await db.init();
        console.log('✅ Database ready');

        // Initialize trigger manager
        console.log('⏰ Initializing trigger manager...');
        const triggerManager = new TriggerManager();
        await triggerManager.init();
        console.log('✅ Trigger manager ready');

        // Start server
        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 AutoFlow Server Started');
            console.log('='.repeat(60));
            console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   Port: ${PORT}`);
            console.log(`   URL: http://localhost:${PORT}`);
            console.log(`   API: http://localhost:${PORT}/api`);
            console.log(`   Health: http://localhost:${PORT}/health`);
            console.log('='.repeat(60) + '\n');
        });

    } catch (error) {
        console.error('❌ Failed to initialize server:', error);
        process.exit(1);
    }
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    console.log('\n⏹️  SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n⏹️  SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

// Start the server
initializeServer();

module.exports = app;
