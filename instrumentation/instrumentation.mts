import { diag, DiagConsoleLogger } from '@opentelemetry/api'
import { getEnv } from '@opentelemetry/core'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';


const logLevel = getEnv().OTEL_LOG_LEVEL
diag.setLogger(new DiagConsoleLogger(), logLevel)

const instrumentations = [
  new AwsLambdaInstrumentation({
    requestHook: () => {
      console.log('HELLO FROM REQUEST HOOK')
    },
    responseHook: () => {
      console.log('HELLO FROM RESPONSE HOOK')
    },

  }),
]

const tracerProvider = new NodeTracerProvider()
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()))

registerInstrumentations({
  instrumentations,
  tracerProvider,
})