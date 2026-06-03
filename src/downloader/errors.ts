import type { LogFields, Logger } from "./logger.js";

interface ResponseLikeError {
  body: unknown;
  status: number;
  statusText?: string;
}

export function logDebugErrorResponse(
  logger: Logger,
  error: unknown,
  fields: LogFields = {},
): void {
  if (!isResponseLikeError(error)) {
    return;
  }

  logger.debug("api.response.error", "HTTP error response", {
    ...fields,
    body: error.body,
    status: error.status,
    statusText: error.statusText,
  });
}

export async function logDebugResponse(
  logger: Logger,
  response: Response,
  fields: LogFields = {},
): Promise<void> {
  logger.debug("api.response.error", "HTTP error response", {
    ...fields,
    body: await readResponseBody(response),
    status: response.status,
    statusText: response.statusText,
  });
}

function isResponseLikeError(error: unknown): error is ResponseLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "body" in error &&
    "status" in error &&
    typeof error.status === "number"
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  return response
    .clone()
    .json()
    .catch(async () => response.text());
}
