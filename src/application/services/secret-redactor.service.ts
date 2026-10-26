export class SecretRedactor {
  private static readonly PATTERNS = [
    {
      pattern: /(api[_-]?key|apikey|secret|token|password|passwd|pwd)["'\s:=]+([^\s"']{8,})/gi,
      replacement: '$1=***REDACTED***',
    },
    {
      pattern: /(Bearer|Authorization)["'\s:=]+([^\s"']{20,})/gi,
      replacement: '$1=***REDACTED***',
    },
    {
      pattern:
        /(-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (RSA |EC |OPENSSH )?PRIVATE KEY-----)/gi,
      replacement: '[PRIVATE KEY REDACTED]',
    },
    {
      pattern:
        /(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521)\s+[A-Za-z0-9+/=]{100,}/gi,
      replacement: '[SSH KEY REDACTED]',
    },
    {
      pattern: /[A-Za-z0-9+/]{40,}={0,2}/g,
      replacement: '[POSSIBLE SECRET REDACTED]',
    },
  ];

  redact(text: string): string {
    let result = text;
    for (const { pattern, replacement } of SecretRedactor.PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }
}
