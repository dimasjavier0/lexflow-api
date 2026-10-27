// Points a maintenance script at production: loads the API's secrets from SSM Parameter Store
// (DATABASE_URL, PIXABAY_API_KEY…) into process.env, the same way the Lambda does when it starts.
// Import the API's modules only after awaiting this: some of them read the environment as they load.
// Needs an AWS session (aws login --profile lexflow) plus MEDIA_BUCKET and PUBLIC_BASE_URL, which are
// outputs of the Lexflow stack.
export async function useProduction(): Promise<{ publicBaseUrl: string }> {
  for (const name of ["MEDIA_BUCKET", "PUBLIC_BASE_URL"]) {
    if (!process.env[name]) throw new Error(`Set ${name} (an output of the Lexflow stack) before running this script.`);
  }
  process.env.SSM_SECRETS_PATH ??= "/lexflow/prod/";
  const { loadSecrets } = await import("../../../src/lib/load-secrets.js");
  await loadSecrets();
  return { publicBaseUrl: process.env.PUBLIC_BASE_URL!.replace(/\/$/, "") };
}
