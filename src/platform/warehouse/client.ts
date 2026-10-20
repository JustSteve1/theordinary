import { BigQuery } from "@google-cloud/bigquery";
import { ExternalAccountClient, GoogleAuth, Impersonated } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

const LOCATION = "europe-west2";

let cached: BigQuery | null = null;

export function warehouseEnabled() {
  const location = process.env.BQ_LOCATION?.trim();
  if (location && location !== LOCATION) {
    throw new Error(`Warehouse location must be ${LOCATION}.`);
  }
  if (!location || !process.env.GCP_PROJECT_ID?.trim()) {
    return false;
  }
  if (process.env.VERCEL) {
    return Boolean(
      process.env.GCP_PROJECT_NUMBER &&
        process.env.GCP_SERVICE_ACCOUNT_EMAIL &&
        process.env.GCP_WORKLOAD_IDENTITY_POOL_ID &&
        process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    );
  }
  return true;
}

export async function warehouse() {
  if (!warehouseEnabled()) {
    throw new Error("Warehouse is not configured.");
  }
  if (!cached) {
    cached = new BigQuery({
      projectId: process.env.GCP_PROJECT_ID,
      location: LOCATION,
      authClient: await authClient(),
    });
  }
  return cached;
}

async function authClient() {
  if (process.env.VERCEL) {
    const projectNumber = process.env.GCP_PROJECT_NUMBER;
    const pool = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
    const provider = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
    const email = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
    const client = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: () => getVercelOidcToken(),
      },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    if (!client) {
      throw new Error("Vercel could not build a Google auth client.");
    }
    return client;
  }

  const source = await new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  }).getClient();
  const target = process.env.WAREHOUSE_IMPERSONATE?.trim();
  if (!target) {
    return source;
  }
  return new Impersonated({
    sourceClient: source,
    targetPrincipal: target,
    lifetime: 3600,
    delegates: [],
    targetScopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
}

export function warehouseLocation() {
  return LOCATION;
}
