// Gives or removes the administrator role in the production database.
//
// Usage, from the repository root, with an AWS session (aws login --profile lexflow):
//   AWS_PROFILE=lexflow node infra/scripts/set-role.mjs <email> ADMIN
//   AWS_PROFILE=lexflow node infra/scripts/set-role.mjs <email> USER
//
// The person must have signed in to the app once, which creates their row in "User". The
// connection string is read from SSM (/lexflow/prod/DATABASE_URL) and never printed. The
// change applies on their next request: the admin check reads the role every time.
// See docs/aws-deployment.md, "Roles y administradores".
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import pg from "pg";

const [email, role = "ADMIN"] = process.argv.slice(2);
if (!email || !["ADMIN", "USER"].includes(role)) {
  console.error("Usage: node infra/scripts/set-role.mjs <email> [ADMIN|USER]");
  process.exit(1);
}

const ssm = new SSMClient({ region: process.env.AWS_REGION ?? "us-east-1" });
const { Parameter } = await ssm.send(new GetParameterCommand({ Name: "/lexflow/prod/DATABASE_URL", WithDecryption: true }));
const client = new pg.Client({ connectionString: Parameter.Value });
await client.connect();
try {
  const { rows } = await client.query(`update "User" set role = $2::"UserRole", "updatedAt" = now() where lower(email) = lower($1) returning email, role`, [email, role]);
  if (rows.length === 0) {
    const { rows: [{ users }] } = await client.query(`select count(*)::int as users from "User"`);
    console.error(`No account with that email (${users} accounts in total). Sign in to the app once with it, then run this again.`);
    process.exitCode = 1;
  } else {
    console.log(`${rows[0].email} is now ${rows[0].role}.`);
  }
} finally {
  await client.end();
}
