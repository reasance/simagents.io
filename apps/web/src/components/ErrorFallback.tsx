import { formatError } from '../i18n/errors';
import { translateLabel, useLocale, translate } from '../i18n';

import { type ErrorInfo, type ReactNode } from 'react';

/**
 * Props for the ErrorFallback component
 */
export interface ErrorFallbackProps {
  /** The error that was caught */
  error: Error;
  /** React error info with component stack */
  errorInfo?: ErrorInfo | null;
  /** Function to reset the error boundary and retry */
  resetError: () => void;
  /** Optional name for the section that errored */
  sectionName?: string;
  /** Whether to show a compact version */
  compact?: boolean;
}

/**
 * Error icon SVG component
 */
function ErrorIcon({ size = 24 }: { size?: number }): ReactNode {
  useLocale();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-status-error"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * Refresh icon SVG component
 */
function RefreshIcon(): ReactNode {
  useLocale();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

/**
 * Compact error fallback for smaller components
 */
function CompactErrorFallback({ error, resetError, sectionName }: ErrorFallbackProps): ReactNode {
  useLocale();
  return (
    <div className="flex items-center justify-center h-full min-h-[80px] p-4 bg-city-surface/50 rounded-lg border border-status-error/30">
      <div className="flex items-center gap-3">
        <ErrorIcon size={18} />
        <div className="flex flex-col gap-1">
          <span className="text-city-text text-xs font-medium">
            {sectionName ? translate("{section} failed to load", { section: translateLabel(sectionName) }) : translate("Something went wrong")}
          </span>
          <button
            onClick={resetError}
            className="text-city-accent hover:text-city-accent-light text-xs flex items-center gap-1 transition-colors"
          >
            <RefreshIcon />{translate("Retry")}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * ErrorFallback - A user-friendly error display component
 *
 * Displays when an error boundary catches an error, showing:
 * - Error icon and message
 * - Section name (if provided)
 * - Retry button to reset the error boundary
 * - Collapsible technical details for debugging
 *
 * Styled to match the SimAgents dark theme (city-* CSS variables)
 */
export function ErrorFallback({
  error,
  errorInfo,
  resetError,
  sectionName,
  compact = false,
}: ErrorFallbackProps): ReactNode {
  useLocale();
  // Use compact version for smaller components
  if (compact) {
    return (
      <CompactErrorFallback
        error={error}
        errorInfo={errorInfo}
        resetError={resetError}
        sectionName={sectionName}
        compact={compact}
      />
    );
  }

  return (
    <div className="flex items-center justify-center h-full min-h-[200px] p-6 bg-city-surface/50 rounded-lg border border-status-error/30">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        {/* Error icon */}
        <div className="p-3 rounded-full bg-status-error/10 border border-status-error/20">
          <ErrorIcon size={32} />
        </div>

        {/* Error message */}
        <div className="flex flex-col gap-1">
          <h3 className="text-city-text text-sm font-semibold">
            {sectionName ? translate("{section} encountered an error", { section: translateLabel(sectionName) }) : translate("Something went wrong")}
          </h3>
          <p className="text-city-text-muted text-xs">
            {formatError(error)}
          </p>
        </div>

        {/* Retry button */}
        <button
          onClick={resetError}
          className="flex items-center gap-2 px-4 py-2 bg-brass hover:bg-city-accent-light text-night text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshIcon />{translate("Try Again")}</button>

        {/* Technical details (collapsible) */}
        {(error.stack || errorInfo?.componentStack) && (
          <details className="w-full mt-2 text-left">
            <summary className="text-city-text-muted text-xs cursor-pointer hover:text-city-accent transition-colors">{translate("Technical details")}</summary>
            <div className="mt-2 p-3 bg-city-bg/50 rounded-lg border border-city-border/50 overflow-auto max-h-[200px]">
              {error.stack && (
                <div className="mb-3">
                  <p className="text-city-text-muted text-[10px] uppercase tracking-wider mb-1 font-medium">{translate("Error Stack")}</p>
                  <pre className="text-status-error text-[10px] font-mono whitespace-pre-wrap break-words">
                    {error.stack}
                  </pre>
                </div>
              )}
              {errorInfo?.componentStack && (
                <div>
                  <p className="text-city-text-muted text-[10px] uppercase tracking-wider mb-1 font-medium">{translate("Component Stack")}</p>
                  <pre className="text-city-text-muted text-[10px] font-mono whitespace-pre-wrap break-words">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default ErrorFallback;
