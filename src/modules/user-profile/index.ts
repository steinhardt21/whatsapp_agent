/**
 * User Profile System - Main Export
 * 
 * Exports all user profile functionality for use throughout the application
 */

export * from './types.js';
export * from './manager.js';

// Re-export the singleton instance function for convenience
export { getUserProfileManager } from './manager.js';
