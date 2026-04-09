import { createHash, randomBytes } from 'node:crypto';

export class TokenService {
  static generateSiteToken(): string {
    return `nsa_${randomBytes(24).toString('hex')}`;
  }

  static generatePublicSiteKey(): string {
    return `nsa_pub_${randomBytes(16).toString('hex')}`;
  }

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
