import * as fs from 'node:fs/promises';

export const doesFileExist = async (pathToFile: string): Promise<boolean> => {
  try {
    await fs.access(pathToFile);
    return true;
  } catch {
    return false;
  }
};
export async function fetchNextEvent(extensionId: string): Promise<void> {
  const runtimeApi = process.env.AWS_LAMBDA_RUNTIME_API!;
  const url = `http://${runtimeApi}/2020-01-01/extension/event/next`;

  const nextEvent = await fetch(url, {
    headers: {
      'Lambda-Extension-Identifier': extensionId,
    },
  });
  if (!nextEvent.ok) {
    console.error('Failed to fetch next event');
    throw new Error('Failed to fetch next event');
  }
  console.debug('Next event', await nextEvent.text());
}


export const responseHook = async (tracerProvider: { asyncForceFlush : ()=> Promise<void>}) => {
  // Check if the otel-extension is present
  const fileExists = await doesFileExist('/opt/extensions/otel-extension')
      
  // If the extension is not present, call the force flush method.
  // This is needed because the TRaceProvider was overridden to not flush on forceFlush.
  // Otherwise the trace data would not be flushed in within this lambda invocation.
  if (!fileExists) {
    console.log('NO EXTENSION FOUND - FORCE FLUSH')
    await tracerProvider.asyncForceFlush()
    return
  } 

  // Delay the fetchNextEvent call to ensure the lambda runtime interface (RIC) has processed the response
  setTimeout(async () => {
      // try to read the extensionID from the file in /tmp/otel-extension-id.txt
      console.log('EXTENSION FOUND - FORCE FLUSH')          
      await tracerProvider.asyncForceFlush()

      console.log('FORCE FLUSH AFTER FLUSH')
      const extensionId = await fs.readFile('/tmp/otel-extension-id.txt', 'utf-8')

      if (!extensionId) {
        throw new Error('Extension ID not found - cannot fetch next event')
      }
      console.log('FORCE FLUSH AFTER READ FILE')
      await fetchNextEvent(extensionId)
    }, 0)
  }