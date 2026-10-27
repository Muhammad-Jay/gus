export class SecretRedactor {
  private static readonly PATTERNS = [
    {
      pattern:
        /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/gi,
      replacement: '[PRIVATE KEY REDACTED]',
    },
    {
      pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
      replacement: '[GITHUB TOKEN REDACTED]',
    },
    {
      pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
      replacement: '[API KEY REDACTED]',
    },
    {
      pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
      replacement: '[SLACK TOKEN REDACTED]',
    },
    {
      pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
      replacement: '[AWS ACCESS KEY REDACTED]',
    },
    {
      pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      replacement: '[JWT REDACTED]',
    },
    {
      pattern: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)([^\s/@]+)(@)/gi,
      replacement: '$1***REDACTED***$3',
    },
    {
      pattern:
        /(api[_-]?key|apikey|access[_-]?key(?:[_-]?id)?|secret(?:[_-]?key)?|client[_-]?secret|token|auth[_-]?token|refresh[_-]?token|session[_-]?token|password|passwd|pwd|private[_-]?key|credentials?)["'\s:=]+([^\s"']{8,})/gi,
      replacement: '$1=***REDACTED***',
    },
    {
      pattern: /(Bearer|Authorization)["'\s:=]+([^\s"']{20,})/gi,
      replacement: '$1=***REDACTED***',
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
