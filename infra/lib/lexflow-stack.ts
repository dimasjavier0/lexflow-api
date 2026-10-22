import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

const here = path.dirname(fileURLToPath(import.meta.url));
/** The API repository root: its Dockerfile builds the Lambda image. */
const apiRoot = path.join(here, "..", "..");

/** Where the API's secrets live in SSM Parameter Store (loaded at start, see src/lib/load-secrets.ts). */
export const SECRETS_PATH = "/lexflow/prod/";
/** The value CloudFront sends in x-origin-verify. A String, not a SecureString: CloudFormation must read it to configure CloudFront. */
export const ORIGIN_SECRET_PARAMETER = `${SECRETS_PATH}ORIGIN_VERIFY_SECRET`;

const GITHUB_OWNER = "dimasjavier0";
/**
 * GitHub's numeric ids (public), which it now puts in the OIDC subject next to the names, so a
 * deleted repository recreated under the same name cannot take over its deploy role.
 */
const GITHUB_IDS = { owner: 53241749, repositories: { "lexflow-api": 1426028920, "lexflow-web": 1426029064 } } as const;

export type LexflowStackProps = StackProps & {
  /** Public Supabase project URL; the API validates sign-in tokens against it. */
  supabaseUrl: string;
  /** Receives the budget and error alerts. Not stored in the repository. */
  alertEmail?: string;
};

/**
 * Everything LexFlow runs on in AWS: one CloudFront distribution in front of the web bucket,
 * the media bucket and the API Lambda. Design and costs: docs/aws-deployment.md.
 */
export class LexflowStack extends Stack {
  constructor(scope: Construct, id: string, props: LexflowStackProps) {
    super(scope, id, props);

    // ---------- Storage ----------
    const privateBucket = { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true };
    // Built files only: rebuilt on every deploy, so they go with the stack.
    const webBucket = new s3.Bucket(this, "WebBucket", { ...privateBucket, removalPolicy: RemovalPolicy.DESTROY, autoDeleteObjects: true });
    // Images and audio cannot be rebuilt: the bucket stays if the stack is deleted.
    const mediaBucket = new s3.Bucket(this, "MediaBucket", { ...privateBucket, removalPolicy: RemovalPolicy.RETAIN });

    // ---------- API ----------
    const apiLogs = new logs.LogGroup(this, "ApiLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY });
    const api = new lambda.DockerImageFunction(this, "Api", {
      description: "LexFlow API (Express on the Lambda Web Adapter)",
      code: lambda.DockerImageCode.fromImageAsset(apiRoot, { exclude: ["infra", "node_modules", "uploads", "models", "dist", ".git", ".env"] }),
      architecture: lambda.Architecture.X86_64,
      memorySize: 1024,
      // Long admin operations stream their progress, which keeps CloudFront's connection alive.
      timeout: Duration.minutes(5),
      logGroup: apiLogs,
      environment: {
        SSM_SECRETS_PATH: SECRETS_PATH,
        SUPABASE_URL: props.supabaseUrl,
        MEDIA_BUCKET: mediaBucket.bucketName,
        CORS_ORIGINS: "none",
        // CloudFront, then the Function URL, add themselves to X-Forwarded-For.
        TRUST_PROXY_HOPS: "2",
        DATABASE_POOL_MAX: "2",
      },
    });
    mediaBucket.grantReadWrite(api);
    api.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParametersByPath"],
      // The path itself, with or without the trailing slash: GetParametersByPath is authorized against it.
      resources: [this.formatArn({ service: "ssm", resource: "parameter", resourceName: `${SECRETS_PATH.replace(/^\/|\/$/g, "")}*` })],
    }));
    api.addToRolePolicy(new iam.PolicyStatement({
      actions: ["kms:Decrypt"],
      resources: ["*"],
      conditions: { StringEquals: { "kms:ViaService": `ssm.${this.region}.amazonaws.com` } },
    }));
    const apiUrl = api.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE, invokeMode: lambda.InvokeMode.RESPONSE_STREAM });

    // ---------- CloudFront ----------
    const originSecret = ssm.StringParameter.valueForStringParameter(this, ORIGIN_SECRET_PARAMETER);
    const viewerFunction = (name: string, file: string) =>
      new cloudfront.Function(this, name, { runtime: cloudfront.FunctionRuntime.JS_2_0, code: cloudfront.FunctionCode.fromFile({ filePath: path.join(here, "edge", file) }) });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "LexFlow: web, media and API",
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ eventType: cloudfront.FunctionEventType.VIEWER_REQUEST, function: viewerFunction("SpaRoutes", "spa-routes.js") }],
      },
      additionalBehaviors: {
        "/uploads/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(mediaBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
        "/api/*": {
          origin: new origins.FunctionUrlOrigin(apiUrl, { customHeaders: { "x-origin-verify": originSecret }, readTimeout: Duration.seconds(60) }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          functionAssociations: [{ eventType: cloudfront.FunctionEventType.VIEWER_REQUEST, function: viewerFunction("ApiPrefix", "api-prefix.js") }],
        },
      },
    });
    const publicUrl = `https://${distribution.distributionDomainName}`;

    // ---------- Keep-alive ----------
    // Supabase pauses free projects after a week without activity: one real API call a day.
    const keepAlive = new lambda.Function(this, "KeepAlive", {
      description: "Daily request through CloudFront to the API, so the Supabase database stays active",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(`exports.handler = async () => {
  const response = await fetch(process.env.TARGET_URL, { signal: AbortSignal.timeout(30000) });
  console.log("keep-alive", response.status);
  if (!response.ok) throw new Error("keep-alive got " + response.status);
};`),
      timeout: Duration.seconds(45),
      environment: { TARGET_URL: `${publicUrl}/api/collections` },
      logGroup: new logs.LogGroup(this, "KeepAliveLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
    });
    new events.Rule(this, "KeepAliveDaily", { schedule: events.Schedule.rate(Duration.days(1)), targets: [new targets.LambdaFunction(keepAlive, { retryAttempts: 2 })] });

    // ---------- Alerts ----------
    if (props.alertEmail) {
      const alerts = new sns.Topic(this, "Alerts", { displayName: "LexFlow alerts" });
      alerts.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
      new cloudwatch.Alarm(this, "ApiErrors", {
        alarmDescription: "The LexFlow API failed several times in 5 minutes",
        metric: api.metricErrors({ period: Duration.minutes(5), statistic: "Sum" }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cwActions.SnsAction(alerts));

      // Usage before credits, so the alert fires while credits still hide the cost.
      const notify = (notificationType: string, threshold: number) => ({
        notification: { notificationType, comparisonOperator: "GREATER_THAN", threshold, thresholdType: "ABSOLUTE_VALUE" },
        subscribers: [{ subscriptionType: "EMAIL", address: props.alertEmail! }],
      });
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: "lexflow-monthly",
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: 1, unit: "USD" },
          costTypes: { includeCredit: false, includeRefund: false },
        },
        notificationsWithSubscribers: [notify("ACTUAL", 0.5), notify("FORECASTED", 1)],
      });
    }

    // ---------- GitHub Actions (OIDC, no access keys) ----------
    const github = new iam.OidcProviderNative(this, "GitHubOidc", { url: "https://token.actions.githubusercontent.com", clientIds: ["sts.amazonaws.com"] });
    const githubRole = (id: string, repository: keyof typeof GITHUB_IDS.repositories, description: string) =>
      new iam.Role(this, id, {
        description,
        maxSessionDuration: Duration.hours(1),
        assumedBy: new iam.WebIdentityPrincipal(github.oidcProviderArn, {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            // Jobs that declare `environment: production` present this subject instead of the branch;
            // the environment itself only accepts deployments from main (GitHub deployment branch policy).
            "token.actions.githubusercontent.com:sub": `repo:${GITHUB_OWNER}@${GITHUB_IDS.owner}/${repository}@${GITHUB_IDS.repositories[repository]}:environment:production`,
          },
        }),
      });

    const webDeploy = githubRole("WebDeployRole", "lexflow-web", "lexflow-web main: upload the built web and refresh CloudFront");
    webBucket.grantReadWrite(webDeploy);
    webDeploy.addToPolicy(new iam.PolicyStatement({
      actions: ["cloudfront:CreateInvalidation"],
      resources: [this.formatArn({ service: "cloudfront", region: "", resource: "distribution", resourceName: distribution.distributionId })],
    }));

    // cdk deploy from CI works through the bootstrap roles, which hold the real permissions.
    const apiDeploy = githubRole("ApiDeployRole", "lexflow-api", "lexflow-api main: cdk deploy through the CDK bootstrap roles");
    apiDeploy.addToPolicy(new iam.PolicyStatement({
      actions: ["sts:AssumeRole"],
      resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`],
    }));

    // ---------- Outputs ----------
    new CfnOutput(this, "PublicUrl", { value: publicUrl, description: "Where the app is served" });
    new CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new CfnOutput(this, "WebBucketName", { value: webBucket.bucketName });
    new CfnOutput(this, "MediaBucketName", { value: mediaBucket.bucketName });
    new CfnOutput(this, "WebDeployRoleArn", { value: webDeploy.roleArn, description: "GitHub secret AWS_WEB_DEPLOY_ROLE_ARN of lexflow-web" });
    new CfnOutput(this, "ApiDeployRoleArn", { value: apiDeploy.roleArn, description: "GitHub secret AWS_DEPLOY_ROLE_ARN of lexflow-api" });
  }
}
