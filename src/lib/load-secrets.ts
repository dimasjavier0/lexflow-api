import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Copies the SecureString parameters under `SSM_SECRETS_PATH` (e.g. /lexflow/prod/) into
 * process.env, named after the last part of each parameter. Production keeps its secrets
 * there instead of in Lambda environment variables; without the path nothing is loaded and
 * the .env file is used, as in local development.
 */
export async function loadSecrets(): Promise<void> {
  const secretsPath = process.env.SSM_SECRETS_PATH;
  if (!secretsPath) return;

  const ssm = new SSMClient({});
  let nextToken: string | undefined;
  let loaded = 0;
  do {
    const page = await ssm.send(new GetParametersByPathCommand({ Path: secretsPath, WithDecryption: true, NextToken: nextToken }));
    for (const parameter of page.Parameters ?? []) {
      const name = parameter.Name?.split("/").pop();
      if (name && parameter.Value !== undefined) {
        process.env[name] = parameter.Value;
        loaded += 1;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);
  console.info(`Loaded ${loaded} secrets from ${secretsPath}`);
}
