import { invokeColdLambda } from "./invokeColdLambda.mjs";

invokeColdLambda('OtelLambdaEsm').then(({logs}) => {
    console.log(logs);
    process.exit(0);
});