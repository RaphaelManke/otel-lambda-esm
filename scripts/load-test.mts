import { invokeColdLambda } from './invokeColdLambda.mjs';

// ...existing code...

function calculatePercentiles(data: number[], percentiles: number[]): number[] {
    data.sort((a, b) => a - b);
    return percentiles.map(p => {
        const index = Math.ceil(p * data.length) - 1;
        return data[index];
    });
}

async function loadTest(functionName: string, invocations: number) {
    const initDurations: number[] = [];

    for (let i = 0; i < invocations; i++) {
        try {
            const { initDuration } = await invokeColdLambda(functionName);
            if (initDuration !== null) {
                initDurations.push(initDuration);
            }
            console.log(`Invocation ${i + 1} of ${functionName} succeeded.`);
        } catch (error) {
            console.error(`Invocation ${i + 1} of ${functionName} failed:`, error);
        }
    }

    if (initDurations.length > 0) {
        const min = Math.min(...initDurations);
        const max = Math.max(...initDurations);
        const percentiles = calculatePercentiles(initDurations, [0.5, 0.75, 0.9, 0.95, 0.99]);

        console.log(`Init Duration Summary for ${functionName}:`);
        console.log(`Min: ${min} ms`);
        console.log(`Max: ${max} ms`);
        console.log(`50th Percentile (Median): ${percentiles[0]} ms`);
        console.log(`75th Percentile: ${percentiles[1]} ms`);
        console.log(`90th Percentile: ${percentiles[2]} ms`);
        console.log(`95th Percentile: ${percentiles[3]} ms`);
        console.log(`99th Percentile: ${percentiles[4]} ms`);
    } else {
        console.log(`No init durations recorded for ${functionName}.`);
    }
}

// Example usage
loadTest('OtelLambdaEsm', 10).then(() => {});
