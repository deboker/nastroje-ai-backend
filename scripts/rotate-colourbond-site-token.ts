/**
 * Developer-only token rotation script for the existing Colourbond.cz site.
 *
 * Run with: npm run rotate:colourbond-token
 * Requires backend/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { supabase } from '../src/lib/supabase.js';
import { TokenService } from '../src/services/token-service.js';

const COLOURBOND_PUBLIC_SITE_KEY = 'colourbond-cz';

async function main() {
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id,public_site_key')
    .eq('public_site_key', COLOURBOND_PUBLIC_SITE_KEY)
    .maybeSingle();

  if (siteError) throw siteError;
  if (!site) {
    throw new Error(`No site exists with public_site_key ${COLOURBOND_PUBLIC_SITE_KEY}.`);
  }

  const privateSiteToken = TokenService.generateSiteToken();
  const apiKeyHash = TokenService.hashToken(privateSiteToken);

  const { error: updateError } = await supabase
    .from('sites')
    .update({ api_key_hash: apiKeyHash })
    .eq('id', site.id)
    .eq('public_site_key', COLOURBOND_PUBLIC_SITE_KEY);

  if (updateError) throw updateError;

  console.warn('IMPORTANT: The previous Colourbond site token is now invalid.');
  console.warn('Copy the new token immediately into the PrestaShop PHP proxy.');
  console.warn('Do not commit the token to Git, JavaScript, a template, or any public file.');
  console.log('New private Colourbond site token (shown once):');
  console.log(privateSiteToken);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
