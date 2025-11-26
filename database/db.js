/**
 * Database Operations for AutoFlow
 * SQLite (will migrate to Oracle in Week 3)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor(dbPath = process.env.DB_PATH || './autoflow.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    /**
     * Initialize database connection and create tables
     */
    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`📦 Connected to database: ${this.dbPath}`);
                    this.createTables()
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    /**
     * Create all necessary tables
     */
    async createTables() {
        const queries = [
            // Workflows table
            `CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                definition TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Executions table
            `CREATE TABLE IF NOT EXISTS executions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                status TEXT NOT NULL,
                trigger_data TEXT,
                execution_log TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                error_message TEXT,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id)
            )`,

            // Execution steps table (detailed logs)
            `CREATE TABLE IF NOT EXISTS execution_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT NOT NULL,
                step_id TEXT NOT NULL,
                step_type TEXT NOT NULL,
                status TEXT NOT NULL,
                input_data TEXT,
                output_data TEXT,
                error_message TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (execution_id) REFERENCES executions(id)
            )`,

            // Scheduled triggers table
            `CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                cron_expression TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                last_run DATETIME,
                next_run DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id)
            )`,

            // Create indexes for better performance
            `CREATE INDEX IF NOT EXISTS idx_executions_workflow 
             ON executions(workflow_id)`,
            
            `CREATE INDEX IF NOT EXISTS idx_executions_status 
             ON executions(status)`,
            
            `CREATE INDEX IF NOT EXISTS idx_execution_steps_execution 
             ON execution_steps(execution_id)`,
        ];

        for (const query of queries) {
            await this.run(query);
        }

        console.log('✅ Database tables created');
    }

    /**
     * Generic run query (INSERT, UPDATE, DELETE)
     */
    run(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    /**
     * Generic get query (SELECT one row)
     */
    get(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Generic all query (SELECT multiple rows)
     */
    all(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ========================================================================
    // WORKFLOW OPERATIONS
    // ========================================================================

    async createWorkflow(workflow) {
        const query = `
            INSERT INTO workflows (id, name, description, definition)
            VALUES (?, ?, ?, ?)
        `;
        await this.run(query, [
            workflow.id,
            workflow.name,
            workflow.description,
            JSON.stringify(workflow)
        ]);
        return workflow;
    }

    async getWorkflow(id) {
        const query = `SELECT * FROM workflows WHERE id = ?`;
        const row = await this.get(query, [id]);
        if (!row) return null;
        return {
            ...row,
            definition: JSON.parse(row.definition)
        };
    }

    async listWorkflows(filters = {}) {
        let query = `SELECT * FROM workflows`;
        const params = [];
        
        if (filters.is_active !== undefined) {
            query += ` WHERE is_active = ?`;
            params.push(filters.is_active ? 1 : 0);
        }
        
        query += ` ORDER BY created_at DESC`;
        
        const rows = await this.all(query, params);
        return rows.map(row => ({
            ...row,
            definition: JSON.parse(row.definition)
        }));
    }

    async updateWorkflow(id, updates) {
        const query = `
            UPDATE workflows 
            SET name = ?, description = ?, definition = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        await this.run(query, [
            updates.name,
            updates.description,
            JSON.stringify(updates),
            id
        ]);
        return this.getWorkflow(id);
    }

    async deleteWorkflow(id) {
        const query = `DELETE FROM workflows WHERE id = ?`;
        await this.run(query, [id]);
        return true;
    }

    // ========================================================================
    // EXECUTION OPERATIONS
    // ========================================================================

    async createExecution(execution) {
        const query = `
            INSERT INTO executions (id, workflow_id, status, trigger_data)
            VALUES (?, ?, ?, ?)
        `;
        await this.run(query, [
            execution.id,
            execution.workflow_id,
            execution.status,
            JSON.stringify(execution.trigger_data || {})
        ]);
        return execution;
    }

    async updateExecution(id, updates) {
        const fields = [];
        const params = [];

        if (updates.status) {
            fields.push('status = ?');
            params.push(updates.status);
        }
        if (updates.execution_log) {
            fields.push('execution_log = ?');
            params.push(JSON.stringify(updates.execution_log));
        }
        if (updates.error_message) {
            fields.push('error_message = ?');
            params.push(updates.error_message);
        }
        if (updates.completed_at) {
            fields.push('completed_at = ?');
            params.push(updates.completed_at);
        }

        params.push(id);

        const query = `
            UPDATE executions 
            SET ${fields.join(', ')}
            WHERE id = ?
        `;
        
        await this.run(query, params);
        return this.getExecution(id);
    }

    async getExecution(id) {
        const query = `SELECT * FROM executions WHERE id = ?`;
        const row = await this.get(query, [id]);
        if (!row) return null;
        return {
            ...row,
            trigger_data: row.trigger_data ? JSON.parse(row.trigger_data) : null,
            execution_log: row.execution_log ? JSON.parse(row.execution_log) : null
        };
    }

    async listExecutions(filters = {}) {
        let query = `SELECT * FROM executions`;
        const params = [];
        const conditions = [];

        if (filters.workflow_id) {
            conditions.push('workflow_id = ?');
            params.push(filters.workflow_id);
        }
        if (filters.status) {
            conditions.push('status = ?');
            params.push(filters.status);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY started_at DESC LIMIT ?`;
        params.push(filters.limit || 50);

        const rows = await this.all(query, params);
        return rows.map(row => ({
            ...row,
            trigger_data: row.trigger_data ? JSON.parse(row.trigger_data) : null,
            execution_log: row.execution_log ? JSON.parse(row.execution_log) : null
        }));
    }

    // ========================================================================
    // EXECUTION STEPS OPERATIONS
    // ========================================================================

    async createExecutionStep(step) {
        const query = `
            INSERT INTO execution_steps 
            (execution_id, step_id, step_type, status, input_data)
            VALUES (?, ?, ?, ?, ?)
        `;
        const result = await this.run(query, [
            step.execution_id,
            step.step_id,
            step.step_type,
            step.status,
            JSON.stringify(step.input_data || {})
        ]);
        return result.lastID;
    }

    async updateExecutionStep(id, updates) {
        const query = `
            UPDATE execution_steps
            SET status = ?, output_data = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        await this.run(query, [
            updates.status,
            JSON.stringify(updates.output_data || {}),
            updates.error_message || null,
            id
        ]);
    }

    async getExecutionSteps(executionId) {
        const query = `SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY started_at`;
        const rows = await this.all(query, [executionId]);
        return rows.map(row => ({
            ...row,
            input_data: row.input_data ? JSON.parse(row.input_data) : null,
            output_data: row.output_data ? JSON.parse(row.output_data) : null
        }));
    }

    // ========================================================================
    // SCHEDULE OPERATIONS
    // ========================================================================

    async createSchedule(schedule) {
        const query = `
            INSERT INTO schedules (id, workflow_id, cron_expression, next_run)
            VALUES (?, ?, ?, ?)
        `;
        await this.run(query, [
            schedule.id,
            schedule.workflow_id,
            schedule.cron_expression,
            schedule.next_run
        ]);
        return schedule;
    }

    async listSchedules(filters = {}) {
        let query = `SELECT * FROM schedules`;
        const params = [];

        if (filters.is_active !== undefined) {
            query += ` WHERE is_active = ?`;
            params.push(filters.is_active ? 1 : 0);
        }

        const rows = await this.all(query, params);
        return rows;
    }

    async updateSchedule(id, updates) {
        const query = `
            UPDATE schedules
            SET last_run = ?, next_run = ?
            WHERE id = ?
        `;
        await this.run(query, [updates.last_run, updates.next_run, id]);
    }

    async deleteSchedule(id) {
        const query = `DELETE FROM schedules WHERE id = ?`;
        await this.run(query, [id]);
        return true;
    }

    // ========================================================================
    // STATISTICS
    // ========================================================================

    async getStats() {
        const totalWorkflows = await this.get(
            `SELECT COUNT(*) as count FROM workflows WHERE is_active = 1`
        );
        
        const totalExecutions = await this.get(
            `SELECT COUNT(*) as count FROM executions`
        );
        
        const successRate = await this.get(`
            SELECT 
                COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*) as rate
            FROM executions
        `);

        const recentExecutions = await this.all(`
            SELECT status, COUNT(*) as count
            FROM executions
            WHERE started_at > datetime('now', '-7 days')
            GROUP BY status
        `);

        return {
            total_workflows: totalWorkflows.count,
            total_executions: totalExecutions.count,
            success_rate: successRate.rate || 0,
            recent_executions: recentExecutions
        };
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

module.exports = Database;
