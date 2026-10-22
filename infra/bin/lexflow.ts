import { App } from "aws-cdk-lib";
import { LexflowStack } from "../lib/lexflow-stack.js";

// Values that identify the owner's accounts stay out of the repository: they come from the
// environment of whoever deploys (a terminal, or GitHub Actions variables and secrets).
const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error("Set SUPABASE_URL (the public Supabase project URL) before running CDK.");

const app = new App();
new LexflowStack(app, "Lexflow", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "LexFlow English: web, media and API (see docs/aws-deployment.md)",
  supabaseUrl,
  alertEmail: process.env.ALERT_EMAIL || undefined,
  tags: { project: "lexflow" },
});
