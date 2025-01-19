import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export class OtelExtensionTraceProvider extends NodeTracerProvider {
  public readonly asyncForceFlush: () => Promise<void>;
  constructor() {
    super();
    this.asyncForceFlush = this.forceFlush.bind(this);
    this.forceFlush = () => {
      console.log('HELLO FROM FORCE FLUSH');
      return Promise.resolve();
    };
  }
}
