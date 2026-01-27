import { registerOTel } from '@vercel/otel'

// import { registerInstrumentations } from '@opentelemetry/instrumentation'
// import { ConsoleSpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
// import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
// import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'

registerOTel({ serviceName: 'volta' })

// const contextManager = new AsyncLocalStorageContextManager()

// // Create and configure NodeTracerProvider
// const provider = new NodeTracerProvider({
//   spanProcessors: [
//     new SimpleSpanProcessor(new ConsoleSpanExporter())
//   ]
// })

// // Initialize the provider
// provider.register({
//   contextManager
// })

// // register and load instrumentation and old plugins - old plugins will be loaded automatically as previously
// // but instrumentations needs to be added
// registerInstrumentations({
//   instrumentations: [
//     new UndiciInstrumentation()
//   ]
// })
