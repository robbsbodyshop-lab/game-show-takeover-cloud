export type DataErrorCode =
  'not_authenticated' | 'not_found' | 'forbidden' | 'unavailable' | 'invalid_response' | 'unknown';

/** Unexpected failure in the data layer. Expected outcomes are modelled as result values instead. */
export class DataError extends Error {
  readonly code: DataErrorCode;

  constructor(code: DataErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DataError';
    this.code = code;
  }
}
