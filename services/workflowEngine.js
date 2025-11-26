/**
 * Workflow Execution Engine
 * Handles sequential execution of workflow actions
 */

const { v4: uuidv4 } = require('uuid');
const Database = require('../database/db');
const ActionHandlers = require('./actionHandlers');

class WorkflowEngine {
    constructor() {
        this.db = new Database();
        this.actionHandlers = new ActionHandlers();
    }

    /**
     * Execute a workflow
     * @param {Object} workflow - The workflow definition
     * @param {Object} triggerData - Data from the trigger
     * @returns {Object} - Execution result
     */
    async execute(workflow, triggerData = {}) {
        const executionId = uuidv4();
        
        console.log(`\n🚀 Starting execution: ${executionId}`);
        console.log(`   Workflow: ${workflow.name}`);
        console.log(`   Actions: ${workflow.actions.length}`);

        // Create execution record
        const execution = {
            id: executionId,
            workflow_id: workflow.id,
            status: 'running',
            trigger_data: triggerData
        };

        await this.db.createExecution(execution);

        // Initialize context for variable substitution
        const context = {
            trigger: triggerData,
            workflow: {
                id: workflow.id,
                name: workflow.name
            },
            now: new Date().toISOString(),
            executionId
        };

        const executionLog = [];

        try {
            // Execute each action sequentially
            for (let i = 0; i < workflow.actions.length; i++) {
                const action = workflow.actions[i];
                
                console.log(`\n   ⚙️  Step ${i + 1}/${workflow.actions.length}: ${action.id}`);
                console.log(`      Type: ${action.type}`);

                // Create step record
                const stepDbId = await this.db.createExecutionStep({
                    execution_id: executionId,
                    step_id: action.id,
                    step_type: action.type,
                    status: 'running',
                    input_data: action.config
                });

                try {
                    // Substitute variables in action config
                    const resolvedConfig = this.resolveVariables(action.config, context);
                    
                    // Execute the action
                    const result = await this.executeAction(action.type, resolvedConfig);
                    
                    // Store result in context if output key is specified
                    if (action.output) {
                        context[action.output] = result;
                    }

                    // Update step as successful
                    await this.db.updateExecutionStep(stepDbId, {
                        status: 'completed',
                        output_data: result
                    });

                    executionLog.push({
                        step: action.id,
                        status: 'completed',
                        output: result
                    });

                    console.log(`      ✅ Completed`);

                } catch (error) {
                    console.error(`      ❌ Failed: ${error.message}`);

                    // Update step as failed
                    await this.db.updateExecutionStep(stepDbId, {
                        status: 'failed',
                        error_message: error.message
                    });

                    executionLog.push({
                        step: action.id,
                        status: 'failed',
                        error: error.message
                    });

                    // Stop execution on error
                    throw error;
                }
            }

            // Mark execution as completed
            await this.db.updateExecution(executionId, {
                status: 'completed',
                execution_log: executionLog,
                completed_at: new Date().toISOString()
            });

            console.log(`\n✅ Execution completed: ${executionId}\n`);

            return {
                success: true,
                execution_id: executionId,
                log: executionLog,
                context
            };

        } catch (error) {
            console.error(`\n❌ Execution failed: ${executionId}`);
            console.error(`   Error: ${error.message}\n`);

            // Mark execution as failed
            await this.db.updateExecution(executionId, {
                status: 'failed',
                execution_log: executionLog,
                error_message: error.message,
                completed_at: new Date().toISOString()
            });

            return {
                success: false,
                execution_id: executionId,
                error: error.message,
                log: executionLog
            };
        }
    }

    /**
     * Execute a single action based on its type
     */
    async executeAction(type, config) {
        const handler = this.actionHandlers.getHandler(type);
        
        if (!handler) {
            throw new Error(`Unknown action type: ${type}`);
        }

        return await handler(config);
    }

    /**
     * Resolve variables in config using context
     * Supports {{variable.path}} syntax
     */
    resolveVariables(config, context) {
        if (typeof config === 'string') {
            return this.substituteString(config, context);
        }

        if (Array.isArray(config)) {
            return config.map(item => this.resolveVariables(item, context));
        }

        if (typeof config === 'object' && config !== null) {
            const resolved = {};
            for (const [key, value] of Object.entries(config)) {
                resolved[key] = this.resolveVariables(value, context);
            }
            return resolved;
        }

        return config;
    }

    /**
     * Substitute variables in a string
     * Example: "Hello {{trigger.name}}" with context.trigger.name = "John" -> "Hello John"
     */
    substituteString(str, context) {
        return str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const value = this.getNestedValue(context, path.trim());
            return value !== undefined ? value : match;
        });
    }

    /**
     * Get nested value from object using dot notation
     * Example: getNestedValue({trigger: {name: "John"}}, "trigger.name") -> "John"
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Validate workflow definition
     */
    validateWorkflow(workflow) {
        const errors = [];

        if (!workflow.id) errors.push('Workflow must have an id');
        if (!workflow.name) errors.push('Workflow must have a name');
        if (!workflow.actions || !Array.isArray(workflow.actions)) {
            errors.push('Workflow must have an actions array');
        }

        if (workflow.actions) {
            workflow.actions.forEach((action, i) => {
                if (!action.id) errors.push(`Action ${i} must have an id`);
                if (!action.type) errors.push(`Action ${i} must have a type`);
                if (!action.config) errors.push(`Action ${i} must have config`);
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = WorkflowEngine;



const result = await engine.execute(workflow, triggerData);
console.log(result);

*/

