import ee from '@google/earthengine';
import { getServiceAccountAccessToken } from '@/lib/google-service-account';

const GEE_SCOPE = 'https://www.googleapis.com/auth/earthengine';
const TOKEN_REFRESH_SECONDS = 3500;

let geeInitPromise: Promise<void> | null = null;
let geeInitialized = false;

type GeeCredentials = {
  clientEmail: string;
  privateKey: string;
  projectId?: string;
};

function getGeeCredentials(): GeeCredentials {
  const rawServiceAccount = process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (rawServiceAccount) {
    try {
      const serviceAccount = JSON.parse(rawServiceAccount);
      const clientEmail = serviceAccount.client_email;
      const privateKey = serviceAccount.private_key;
      const projectId = serviceAccount.project_id;

      if (typeof clientEmail === 'string' && typeof privateKey === 'string') {
        return {
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          projectId: typeof projectId === 'string' ? projectId : undefined,
        };
      }
    } catch {
      throw new Error('GEE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }

    throw new Error('GEE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }

  const clientEmail = process.env.GEE_CLIENT_EMAIL;
  const privateKey = process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.GEE_PROJECT_ID;

  if (!clientEmail || !privateKey) {
    throw new Error('GEE credentials missing in environment variables');
  }

  return { clientEmail, privateKey, projectId };
}

function getAccessToken(email: string, key: string, retries = 2): Promise<string> {
  return getServiceAccountAccessToken({
    clientEmail: email,
    privateKey: key,
    scope: GEE_SCOPE,
  }).catch(async (error) => {
    if (retries <= 0) {
      throw new Error(`GEE auth failed after retries: ${error?.message ?? error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    return getAccessToken(email, key, retries - 1);
  });
}

/**
 * Initialize Google Earth Engine with Service Account.
 * Uses a Web Crypto JWT to get an access token, then injects it via
 * ee.apiclient.setAuthToken — avoids the OpenSSL legacy key issue
 * that breaks the built-in authenticateViaPrivateKey on Node.js 22+.
 */
export const initGEE = async (): Promise<void> => {
  if (geeInitialized) return;
  if (geeInitPromise) return geeInitPromise;

  geeInitPromise = initializeGEE().catch((error) => {
    geeInitPromise = null;
    geeInitialized = false;
    throw error;
  });

  return geeInitPromise;
};

async function initializeGEE(): Promise<void> {
  const { clientEmail, privateKey, projectId } = getGeeCredentials();

  const token = await getAccessToken(clientEmail, privateKey);

  // Inject token and set up auto-refresh so long-running jobs don't expire
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ee.apiclient as any).setAuthToken('', 'Bearer', token, TOKEN_REFRESH_SECONDS, [], null, false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ee.apiclient as any).setAuthTokenRefresher((_args: any, cb: any) => {
    getAccessToken(clientEmail, privateKey)
      .then((t) => cb({ token_type: 'Bearer', access_token: t, expires_in: TOKEN_REFRESH_SECONDS }))
      .catch((e) => {
        console.error('❌ GEE token refresh failed:', e?.message);
        cb(null); // GEE SDK will surface the error on the next API call
      });
  });

  await new Promise<void>((resolve, reject) => {
    ee.initialize(
      null, null,
      () => { console.log('✅ GEE Initialized Successfully'); resolve(); },
      (e: unknown) => { console.error('❌ GEE Initialization Failed:', e); reject(e); },
      null,
      projectId
    );
  });

  geeInitialized = true;
}

export default ee;
