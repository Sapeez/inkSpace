export interface HttpError extends Error {
  status: number;
}

export function httpError(status: number, message: string): HttpError {
  return Object.assign(new Error(message), { status });
}
