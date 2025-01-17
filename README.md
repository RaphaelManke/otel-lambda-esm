# AWS Lambda function NodeJS with OTEL in ESM

This is a reproduction repo with a minimal setup for a NodeJS function instrumented with OpenTelemetry.

All code is loaded as ESM. 

Depending on the bundeling flag in [esbuild.ts](./esbuild.ts) the instrumentation works or not.

Works
```ts
    bundle: false,
```

Fails
```
    bundle: true,
```

## Useful commands

* `npm run deploy`  deploy this stack to your default AWS account/region
