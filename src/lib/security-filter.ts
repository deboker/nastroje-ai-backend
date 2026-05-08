export type MessageRisk = 'low' | 'medium' | 'high';

export type MessageSecurityResult = {
  allowed: boolean;
  risk: MessageRisk;
  category?: string;
  reason?: string;
};

type SecurityRule = {
  category: string;
  risk: Exclude<MessageRisk, 'low'>;
  reason: string;
  patterns: RegExp[];
};

export const BLOCKED_CHAT_REPLY =
  'Táto správa bola z bezpečnostných dôvodov zablokovaná. Skúste položiť bežnú otázku k obsahu webu alebo službám.';

const MAX_MESSAGE_PREVIEW_LENGTH = 200;

const SECURITY_RULES: SecurityRule[] = [
  {
    category: 'prompt_injection',
    risk: 'high',
    reason: 'The message attempts to override or reveal hidden assistant instructions.',
    patterns: [
      /\bignore\s+(all\s+)?previous\s+instructions\b/i,
      /\bignore\s+(your\s+)?(safety\s+)?rules\b/i,
      /\bforget\s+your\s+instructions\b/i,
      /\bforget\s+(all\s+)?(your\s+)?(rules|instructions)\b/i,
      /\bbypass\s+your\s+rules\b/i,
      /\bbypass\s+restrictions\b/i,
      /\bremove\s+restrictions\b/i,
      /\bdisable\s+(safety|guardrails)\b/i,
      /\bact\s+without\s+rules\b/i,
      /\byou\s+are\s+not\s+restricted\b/i,
      /\bstop\s+following\s+your\s+rules\b/i,
      /\bdo\s+not\s+follow\s+your\s+rules\b/i,
      /\b(answer|respond)\s+without\s+restrictions\b/i,
      /\bwithout\s+limitations\b/i,
      /\bno\s+restrictions\b/i,
      /\b(forget|ignore|bypass).*\banswer\s+normally\b/i,
      /\banswer\s+normally\b.*\b(rules|instructions|restrictions|limitations)\b/i,
      /\boverride\s+(the\s+)?system\s+prompt\b/i,
      /\b(reveal|show|print|repeat|output|display)\s+(the\s+|your\s+)?(full\s+)?system\s+prompt\b/i,
      /\bwhat\s+is\s+(the\s+|your\s+)?system\s+prompt\b/i,
      /\btell\s+me\s+(the\s+|your\s+)?system\s+prompt\b/i,
      /\b(reveal|show|print)\s+(the\s+|your\s+)?system\s+message\b/i,
      /\b(reveal|show)\s+internal\s+instructions\b/i,
      /\bhidden\s+instructions\b/i,
      /\bdeveloper\s+message\b/i,
      /\binternal\s+prompt\b/i,
    ],
  },
  {
    category: 'secrets_exfiltration',
    risk: 'high',
    reason: 'The message asks for credentials, tokens, keys, or environment secrets.',
    patterns: [
      /\bapi\s+key\b/i,
      /\bsecret\s+key\b/i,
      /\baccess\s+token\b/i,
      /\bsite\s+token\b/i,
      /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
      /\b(api_key|token|password|secret|key)\s*[:=]\s*[^\s&"'<>]{6,}/i,
      /\bx-site-token\b/i,
      /\bgroq\s+api\s+key\b/i,
      /\bsupabase\s+key\b/i,
      /\bservice\s+role\s+key\b/i,
      /(^|[\s/])\.env(\b|$)/i,
      /\benvironment\s+variables\b/i,
      /\badmin\s+password\b/i,
      /\bdatabase\s+password\b/i,
    ],
  },
  {
    category: 'wordpress_sensitive_files',
    risk: 'high',
    reason: 'The message asks for sensitive WordPress files or database exports.',
    patterns: [
      /\bwp-config\.php\b/i,
      /\bwp-admin\b/i,
      /\bwp-login\.php\b/i,
      /\bdatabase\s+dump\b/i,
      /\bexport\s+database\b/i,
      /\bphpmyadmin\b/i,
      /\bconfig\s+file\b/i,
    ],
  },
  {
    category: 'malicious_code_or_xss',
    risk: 'high',
    reason: 'The message contains common XSS or browser-execution payload markers.',
    patterns: [
      /<\s*script\b/i,
      /<\s*\/\s*script\s*>/i,
      /\bjavascript\s*:/i,
      /\bonerror\s*=/i,
      /\bonload\s*=/i,
      /\bdocument\.cookie\b/i,
      /\blocalStorage\b/i,
      /\beval\s*\(/i,
      /\balert\s*\(/i,
    ],
  },
  {
    category: 'sql_injection_like',
    risk: 'medium',
    reason: 'The message contains common SQL injection-like payload markers.',
    patterns: [
      /\bunion\s+select\b/i,
      /\bdrop\s+table\b/i,
      /\binsert\s+into\b/i,
      /\bupdate\s+users\s+set\b/i,
      /\bdelete\s+from\b/i,
      /\bor\s+1\s*=\s*1\b/i,
      /'\s*or\s*'1'\s*=\s*'1/i,
      /["']\s*or\s+1\s*=\s*1\s*--/i,
      /\/\*/,
    ],
  },
];

export function checkMessageSecurity(message: string): MessageSecurityResult {
  const normalizedMessage = message.trim();

  for (const rule of SECURITY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedMessage))) {
      return {
        allowed: false,
        risk: rule.risk,
        category: rule.category,
        reason: rule.reason,
      };
    }
  }

  return {
    allowed: true,
    risk: 'low',
  };
}

export function createSafeMessagePreview(message: string): string {
  return redactSecrets(message).replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_PREVIEW_LENGTH);
}

function redactSecrets(message: string): string {
  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(api_key|token|password|secret|key)(\s*[:=]\s*)([^\s&"'<>]{6,})/gi, '$1$2[REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, '[REDACTED]')
    .replace(/\b(ghp_[A-Za-z0-9_]{20,})\b/g, '[REDACTED]')
    .replace(/\b(nsa_[A-Fa-f0-9]{32,})\b/g, '[REDACTED]')
    .replace(/\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');
}
