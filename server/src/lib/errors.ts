// Az API egységes hibái. Minden hibaválasz formája: { error: { code, message, details? } }
// (fejlesztési terv, 5.1).

/** Az API hibakódjai – az új modulok ezt bővítik. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'ACCOUNT_BLOCKED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'INVALID_UPLOAD'
  | 'UNSUPPORTED_IMAGE'
  | 'IMAGE_TOO_SMALL'
  | 'IMAGE_TOO_LARGE'
  | 'LOW_DETAIL_IMAGE'
  | 'DUPLICATE_EXACT'
  | 'DUPLICATE_SIMILAR'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT_REACHED'
  | 'SERVER_BUSY'
  | 'CHAIN_UNAVAILABLE'
  | 'NOT_PURCHASABLE'
  | 'ALREADY_PURCHASED'
  | 'CHECKOUT_IN_PROGRESS'
  | 'PAYMENT_UNAVAILABLE'
  | 'INVALID_WEBHOOK'
  | 'ALREADY_REVIEWED'
  | 'INTERNAL_ERROR';

/** Egy hibaválasz törzse. */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface AppErrorOptions {
  /** Ennyi másodperc múlva érdemes újrapróbálkozni (Retry-After fejléc) */
  retryAfterSeconds?: number;
}

/** Szándékosan dobott, a kliensnek továbbítható hiba (HTTP-státusszal és hibakóddal). */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
