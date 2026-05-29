import ee from '@google/earthengine';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { google } = require('googleapis');

const GEE_SCOPE = 'https://www.googleapis.com/auth/earthengine';

function getAccessToken(email: string, key: string, retries = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const jwtAuth = new google.auth.JWT(email, null, key, [GEE_SCOPE]);
    jwtAuth.getAccessToken((err: any, token: string | null) => {
      if (err || !token) {
        if (retries > 0) {
          // Short delay before retry to handle transient Google OAuth failures
          setTimeout(() => getAccessToken(email, key, retries - 1).then(resolve).catch(reject), 500);
        } else {
          reject(new Error(`GEE auth failed after retries: ${err?.message ?? 'No token returned'}`));
        }
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Initialize Google Earth Engine with Service Account.
 * Uses googleapis JWT to get an access token, then injects it via
 * ee.apiclient.setAuthToken — avoids the OpenSSL legacy key issue
 * that breaks the built-in authenticateViaPrivateKey on Node.js 22+.
 */
export const initGEE = async (): Promise<void> => {
  const clientEmail = process.env.GEE_CLIENT_EMAIL;
  const privateKey = process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.GEE_PROJECT_ID;

  if (!clientEmail || !privateKey) {
    throw new Error('GEE credentials missing in environment variables');
  }

  const token = await getAccessToken(clientEmail, privateKey);

  // Inject token and set up auto-refresh so long-running jobs don't expire
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ee.apiclient as any).setAuthToken('', 'Bearer', token, 3500, [], null, false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ee.apiclient as any).setAuthTokenRefresher((_args: any, cb: any) => {
    getAccessToken(clientEmail, privateKey)
      .then((t) => cb({ token_type: 'Bearer', access_token: t, expires_in: 3500 }))
      .catch((e) => {
        console.error('❌ GEE token refresh failed:', e?.message);
        cb(null); // GEE SDK will surface the error on the next API call
      });
  });

  await new Promise<void>((resolve, reject) => {
    ee.initialize(
      null, null,
      () => { console.log('✅ GEE Initialized Successfully'); resolve(); },
      (e: any) => { console.error('❌ GEE Initialization Failed:', e); reject(e); },
      null,
      projectId
    );
  });
};

export default ee;
