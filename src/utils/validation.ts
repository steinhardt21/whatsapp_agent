/**
 * Email validation utilities
 */

/**
 * Validates if a string is a properly formatted email address
 * @param email - The email string to validate
 * @returns boolean - true if valid email format, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email regex pattern
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  return emailRegex.test(email.trim());
}

/**
 * Extracts email addresses from a text string
 * @param text - The text to search for email addresses
 * @returns string[] - Array of found email addresses
 */
export function extractEmailsFromText(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  
  return matches ? matches.filter(email => isValidEmail(email)) : [];
}

/**
 * Validates and formats an email address
 * @param email - The email to validate and format
 * @returns string | null - Formatted email if valid, null if invalid
 */
export function validateAndFormatEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const trimmedEmail = email.trim().toLowerCase();
  
  if (isValidEmail(trimmedEmail)) {
    return trimmedEmail;
  }
  
  return null;
}

/**
 * Checks if an email belongs to common domains (for basic filtering)
 * @param email - The email to check
 * @returns boolean - true if from a common domain
 */
export function isCommonEmailDomain(email: string): boolean {
  if (!isValidEmail(email)) {
    return false;
  }

  const commonDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'libero.it', 'alice.it', 'tiscali.it',
    'virgilio.it', 'fastwebnet.it', 'tin.it'
  ];

  const domain = email.split('@')[1]?.toLowerCase();
  return commonDomains.includes(domain);
}
