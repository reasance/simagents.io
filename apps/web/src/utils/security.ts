/**
 * Security utilities for sanitizing and validating untrusted data.
 *
 * These utilities protect against:
 * - XSS via LLM-generated content
 * - UI spoofing attacks
 * - DoS via large payloads
 */

import { isRosterProvider } from '@simagents/shared';

// =============================================================================
// Constants
// =============================================================================

/** Maximum length for displayed text content */
export const MAX_TEXT_LENGTH = 500;

/** Maximum length for reasoning text */
export const MAX_REASONING_LENGTH = 1000;

/** Maximum length for JSON payload display */
export const MAX_PAYLOAD_VALUE_LENGTH = 200;

/** Allowed event types for filtering */
export const VALID_ACTION_TYPES = [
  'agent_move',
  'agent_work',
  'agent_sleep',
  'agent_buy',
  'agent_consume',
  'agent_gather',
  'agent_trade',
  'agent_harm',
  'agent_steal',
  'agent_deceive',
  'agent_share_info',
  'agent_moved',
  'agent_worked',
  'agent_sleeping',
  'agent_bought',
  'agent_consumed',
  'tick_end',
  'tick_start',
  'needs_updated',
  'balance_changed',
  'agent_died',
] as const;

/** Keys to exclude from payload display */
export const EXCLUDED_PAYLOAD_KEYS = [
  'reasoning',
  'usedFallback',
  'processingTimeMs',
] as const;

// =============================================================================
// Text Sanitization
// =============================================================================

/**
 * Removes or escapes potentially dangerous Unicode control characters.
 * Prevents UI spoofing via bidirectional text or zero-width characters.
 */
export function stripControlCharacters(text: string): string {
  // Remove:
  // - Bidirectional override characters (U+202A-U+202E)
  // - Zero-width characters (U+200B-U+200F, U+FEFF)
  // - Other control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex -- Deliberately strip control characters.
  return text.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/**
 * Truncates text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Sanitizes LLM-generated text content for safe display.
 *
 * - Strips control characters
 * - Truncates to max length
 * - Trims whitespace
 */
export function sanitizeText(
  text: string | undefined | null,
  maxLength: number = MAX_TEXT_LENGTH
): string {
  if (!text || typeof text !== 'string') return '';

  const cleaned = stripControlCharacters(text.trim());
  return truncate(cleaned, maxLength);
}

/**
 * Sanitizes reasoning text from LLM responses.
 */
export function sanitizeReasoning(reasoning: string | undefined | null): string {
  return sanitizeText(reasoning, MAX_REASONING_LENGTH);
}

// =============================================================================
// Type Guards & Validation
// =============================================================================

/**
 * Type guard for position objects.
 */
export function isPosition(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    typeof (value as { x: unknown }).x === 'number' &&
    typeof (value as { y: unknown }).y === 'number'
  );
}

/**
 * Validates that an LLM type is a catalog provider (including decision models) or a baseline.
 */
export function isValidLlmType(type: string): boolean {
  return isRosterProvider(type.toLowerCase());
}

/**
 * Validates that an event type is from the known list.
 */
export function isValidEventType(type: string): boolean {
  return VALID_ACTION_TYPES.includes(type as typeof VALID_ACTION_TYPES[number]);
}

// =============================================================================
// Numeric Validation
// =============================================================================

/**
 * Clamps a numeric value to a valid percentage range (0-100).
 * Safe for use in CSS width/height styles.
 */
export function clampPercent(value: number | undefined | null): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Clamps a numeric value to a valid range.
 */
export function clampNumber(
  value: number | undefined | null,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// Payload Handling
// =============================================================================

/**
 * Safely stringifies a value for display.
 * Truncates long strings and handles nested objects.
 */
export function safeStringify(value: unknown, maxLength: number = MAX_PAYLOAD_VALUE_LENGTH): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') {
    return truncate(value, maxLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return truncate(json, maxLength);
    } catch {
      return '[object]';
    }
  }

  return String(value).slice(0, maxLength);
}

/**
 * Filters payload entries to only display safe, non-excluded keys.
 */
export function filterPayloadEntries(
  payload: Record<string, unknown> | undefined | null
): Array<[string, string]> {
  if (!payload || typeof payload !== 'object') return [];

  return Object.entries(payload)
    .filter(([key]) => !EXCLUDED_PAYLOAD_KEYS.includes(key as typeof EXCLUDED_PAYLOAD_KEYS[number]))
    .map(([key, value]) => [key, safeStringify(value)]);
}
