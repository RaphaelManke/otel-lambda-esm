import { Lambda } from "@aws-sdk/client-lambda";
import { scheduler } from "timers/promises";

const client = new Lambda({});
export async function invokeColdLambda(functionName: string): Promise<{initDuration: number | null, logs: string}> {
    const timestamp = new Date().toISOString();
    
    // Update the Lambda function configuration to ensure it is cold
    await client.updateFunctionConfiguration({
        FunctionName: functionName,
        Description: `Updated at ${timestamp}`
    });

    // Wait for the function to be updated and the change be propagated
    await scheduler.wait(1_000);

    // Invoke the Lambda function
    const invokeResponse = await client.invoke({
        FunctionName: functionName,
        LogType: "Tail"
    });

    // Return the logs of the invocation
    const logs = Buffer.from(invokeResponse.LogResult!, 'base64').toString('utf-8');
    
    // Extract the init duration from the logs
    const initDurationMatch = logs.match(/Init Duration: ([\d.]+) ms/);
    const initDuration = initDurationMatch ? parseFloat(initDurationMatch[1]) : null;

    console.log(`Init Duration: ${initDuration} ms`);
    return {initDuration, logs};
}
