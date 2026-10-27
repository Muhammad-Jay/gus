import { describe, expect, it } from 'vitest';
import { SecretRedactor } from '../../../src/application/services/secret-redactor.service';

describe('SecretRedactor', () => {
  const redactor = new SecretRedactor();

  it('redacts assigned secrets and common token formats', () => {
    const input = [
      'password = "supersecretvalue"',
      'AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP',
      'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'api_key=sk-proj-abcdefghijklmnopqrstuvwxyz',
      'https://user:supersecret@example.com/repo',
    ].join('\n');

    const output = redactor.redact(input);

    expect(output).not.toContain('supersecretvalue');
    expect(output).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(output).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(output).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz');
    expect(output).not.toContain('user:supersecret@');
    expect(output).toContain('***REDACTED***');
  });

  it('redacts private keys and JSON web tokens', () => {
    const privateKey =
      '-----BEGIN OPENSSH PRIVATE KEY-----\nsecretmaterial\n-----END OPENSSH PRIVATE KEY-----';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz';

    expect(redactor.redact(privateKey)).toBe('[PRIVATE KEY REDACTED]');
    expect(redactor.redact(jwt)).toBe('[JWT REDACTED]');
  });

  it('leaves ordinary text untouched', () => {
    const text = 'feat: add a commit message template\nNo credentials here.';
    expect(redactor.redact(text)).toBe(text);
  });
});
