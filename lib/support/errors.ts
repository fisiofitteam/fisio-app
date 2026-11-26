export class SupportError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
