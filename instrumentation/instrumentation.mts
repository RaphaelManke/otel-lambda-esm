import { diag, DiagConsoleLogger } from '@opentelemetry/api'
import { getEnv } from '@opentelemetry/core'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda'
import { responseHook } from './extension-client.mjs'
import { OtelExtensionTraceProvider } from './OtelExtensionTraceProvider.mjs'

const logLevel = getEnv().OTEL_LOG_LEVEL
diag.setLogger(new DiagConsoleLogger(), logLevel)

const tracerProvider = new OtelExtensionTraceProvider()

const instrumentations = [
  new AwsLambdaInstrumentation({
    requestHook: () => {
      console.log('REQUEST HOOK')
    },

    responseHook: async () => {
      console.log('RESPONSE HOOK')
      await responseHook(tracerProvider)
    }
  })
]

tracerProvider.addSpanProcessor(new BatchSpanProcessor(new ConsoleSpanExporter()))

registerInstrumentations({
  instrumentations,
  tracerProvider,
})