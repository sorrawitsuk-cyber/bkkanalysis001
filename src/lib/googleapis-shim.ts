class UnsupportedGoogleJwt {
  constructor() {
    throw new Error(
      "Earth Engine built-in private-key authentication is disabled; use initGEE().",
    );
  }
}

export const google = {
  auth: {
    JWT: UnsupportedGoogleJwt,
  },
};

const googleApisShim = { google };

export default googleApisShim;
