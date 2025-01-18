import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { BundlingOptions, NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

export const lambdaBundlingOptions: BundlingOptions = {
  // bundle SDK v3 internally, see https://github.com/aws/aws-cdk/issues/25492
  // externalModules: [],
  // favor using ESM over CommonJS (better tree-shaking)
  format: OutputFormat.ESM,
  // aws-sdk is not declaring their esm entry point the correct way, so we need to instruct esbuild to favor the "module" field.
  // see https://github.com/aws/aws-cdk/issues/29310
  mainFields: ['module', 'main'],
  // aws x-ray sdk is not compatible with esm, so we need to simulate require import
  // see https://github.com/aws-powertools/powertools-lambda-typescript/blob/aa94f996f9ecfa4cb0c090757919aca62fab9579/docs/upgrade.md?plain=1#L50 (https://docs.powertools.aws.dev/lambda/typescript/latest/upgrade/#unable-to-use-esm)
  // banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
}


export class OtelLambdaEsmStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const layer = LayerVersion.fromLayerVersionArn(this, 'OtelLayer', 'arn:aws:lambda:eu-central-1:184161586896:layer:opentelemetry-nodejs-0_11_0:1');

    const logGroup = new LogGroup(this, 'OtelLambdaEsmLogGroup', {
      logGroupName: '/aws/lambda/OtelLambdaEsm',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK,
    });
    const lambda = new NodejsFunction(this, 'OtelLambdaEsmFunction', {
      functionName: 'OtelLambdaEsm',
      entry: 'lambda/handler-esm.ts',
      memorySize: 1024,
      runtime: Runtime.NODEJS_22_X,
      logGroup: logGroup,
      layers: [layer],
      bundling: {
        ...lambdaBundlingOptions,
        commandHooks: {
          beforeInstall: () => [],
          beforeBundling: () => [],
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [
              `cp -r ${inputDir}/build/* ${outputDir}`,
              `cp -r ${inputDir}/instrumentation/otel-handler ${outputDir}`,
              `cp -r ${inputDir}/instrumentation/loader.mjs ${outputDir}`,
            ];
          },
        },
        forceDockerBundling: true,
      },
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/var/task/otel-handler",
        OTEL_LOG_LEVEL: 'DEBUG',
        AWS_LAMBDA_RUNTIME_VERBOSE: "3",
        // NODE_DEBUG: "module"
      }
    });
  }
}
