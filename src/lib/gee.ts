import ee from '@google/earthengine';

/**
 * Initialize Google Earth Engine with Service Account
 */
export const initGEE = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const clientEmail = process.env.GEE_CLIENT_EMAIL;
    const privateKey = process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const projectId = process.env.GEE_PROJECT_ID;

    if (!clientEmail || !privateKey) {
      return reject(new Error('GEE credentials missing in environment variables'));
    }

    try {
      ee.data.authenticateViaPrivateKey(
        {
          client_email: clientEmail,
          private_key: privateKey,
        },
        () => {
          ee.initialize(
            null,
            null,
            () => {
              console.log('✅ GEE Initialized Successfully');
              resolve();
            },
            (e: any) => {
              console.error('❌ GEE Initialization Failed:', e);
              reject(e);
            },
            null,
            projectId
          );
        },
        (e: any) => {
          console.error('❌ GEE Authentication Failed:', e);
          reject(e);
        }
      );
    } catch (error) {
      console.error('❌ GEE Error:', error);
      reject(error);
    }
  });
};

export default ee;
