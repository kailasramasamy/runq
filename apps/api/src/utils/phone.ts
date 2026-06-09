/**
 * Reduce any phone input to bare digits, dropping a leading `91` country code
 * so a 10-digit national number is the canonical stored/compared form.
 * Shared by phone-OTP login (resolve user by phone) and web user provisioning
 * (match an employee by phone) so both key off the exact same value.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}
