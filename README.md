# AWS Lambda function NodeJS with OTEL in ESM

This is a reproduction repo with a minimal setup for a NodeJS function instrumented with OpenTelemetry.

All code is loaded as ESM. 

## Useful commands

* `npm run deploy`  deploy this stack to your default AWS account/region

## Problem description

Running OpenTelemetry (OTel) instrumentation in NodeJs is traditionally done by the auto-instrumentation provided through the OpenTelemetry [auto instrumentation](https://opentelemetry.io/docs/zero-code/js/) project. 
This instrumentation is good enough when instrumenting long-running server applications, e.g., in a docker container. These applications do not care much about the cold start time. 
(Cold start time in this context is the time between a new instance of the application starting and being able to serve the first request.)

### Why cold start matters in an AWS Lambda function

The cold start time can become a serious problem when you try to instrument an AWS Lambda function. 
In this scenario, a new instance of the application (in the AWS Lambda case, a sandbox executing an exported handler function) is started when there is no active lambda function available. This can be one of the following cases: 
a) The last invocation is too far in the past, so all functions have been shut down already, 
b) there are warm functions, but they are all serving requests at the moment, so to handle the incoming request, a new instance is spawned, or 
c) there was an update to the function (e.g., new code or configuration update), so all requests need to use the new version of the lambda. 

In the cases of a cold start, this can increase the response time dramatically. In Lambdas that are handling async workloads (e.g., consuming a Queue), this is less of a problem than in Lambdas that serve customer-facing REST API endpoints.

### OpenTelemetry instrumentation of a NodeJS application

To understand why the OpenTelemetry instrumentation adds additional latency to the cold start, let's understand the process of instrumenting a NodeJS application first. 

The OTel instrumentation consists of different components that have to be instantiated and initialized before the actual application is started. This is because the OTel Instrumentation tries to patch your application at startup time. This means all the instrumentations and mechanisms to intercept the application code need to be loaded as the first thing in the Node process.

For instrumentations that cannot use runtime-provided capabilities like the [NodeJS diagnostic channel](https://nodejs.org/api/diagnostics_channel.html), an interception mechanism is used. This mechanism depends on the module type of the application. 
For CommonJS applications, the [require-in-the-middle](https://github.com/elastic/require-in-the-middle) library is used, and for ESModule applications, the [import-in-the-middle](https://github.com/nodejs/import-in-the-middle) is used. 

As part of an [OTel instrumentation](https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/packages/opentelemetry-instrumentation/src/platform/node/instrumentation.ts), you don't need to care about that much and just provide a `patch` function which contains the code to add your instrumentation and specify which files or modules should be patched. 

To load all the instrumentations and other configs like exporters (implementations that process the collected data and forward it to a target), a built-in mechanism of NodeJS is used. 
The NodeJS runtime offers a `--require` flag where you can specify a module to be loaded before the actual application is loaded. 
With this mechanism, the OTel instrumentation code is typically loaded, and because this mechanism waits for the loading to complete before moving on, it ensures the instrumentation is fully loaded and initialized to be ready to patch the application code. 

After the instrumentation code is loaded, the actual application code is loaded. At this point in time, the registered and enabled instrumentations can hook into the loading process of a file or module and apply the patch. For CommonJS modules, this patching simply means redefining attributes of the loaded module (require-in-the-middle). For ESModules, that process is more complex and hooks into the file loading process, parsing an abstract syntax tree (AST) to determine the export names and then modifying the JS source code (adding getter and setter to the module, so that the module can be modified at runtime) before loading it into the NodeJS process. 

With this in mind, all the time spent by the instrumentation code loading and patching is thereby added to the cold start time. 

### OpenTelemetry Instrumentation in an AWS Lambda function

To add OTel instrumentation to an AWS Lambda function, it is typically done by adding one or more Lambda layers to your Lambda function. 
These layers typically have runtime (node, python, ...) specific instrumentation code and an OpenTelemetry collector. 

The instrumentation code is used to instrument the application code, and the collector is used to offload the OTel data to the respective Observability backends. 

Using the collector enables the users to send OTel data to different backends without having to implement it in every (runtime) language. This can be the case when you want to use an OTel instrumentation but still want to send the data to Amazon X-Ray. But maybe one day you decide to switch the backend and now want to send data to Datadog (which does not offer an OTLP (the OTel data transport protocol/format) endpoint) or any other provider that has an OTLP endpoint. In this case, there is only one implementation needed no matter which language the data is sent from. Once the data is received by the collector, it can be exported. You can also use the collector to send data to multiple backends in parallel, e.g., X-Ray and a third-party solution. 

Currently, there are two main projects that offer this kind of setup:
    
  - [OpenTelemetry Lambda](https://github.com/open-telemetry/opentelemetry-lambda)
  - [Amazon Distribution for OpenTelemetry (ADOT)](https://aws-otel.github.io/docs/getting-started/lambda)

Technically, the ADOT project is based on the OTel Lambda projects with a [slightly adjusted config](https://github.com/aws-observability/aws-otel-lambda/blob/main/nodejs/wrapper-adot/src/adot-extension.ts) of the instrumentation and a collector supporting only OTLP and X-Ray as exporters. 

### Lifecycle of a Lambda with OTel layers 

Since both projects use the same way of setting up a Lambda function with the layers, the following is described based on the [OpenTelemetry Lambda](https://github.com/open-telemetry/opentelemetry-lambda) code. 

#### Add the Layers

First of all, the relevant lambda layers need to be added to the lambda function. The layers are public and can be directly added to the Lambda by referencing the ARN of the layer. The correct layer ARNs can be found on the [releases page](https://github.com/open-telemetry/opentelemetry-lambda/releases).

#### Increased cold start due to OTel collector

Once both layers (collector and runtime-specific instrumentation) are added (without any other change to the Lambda config), you will immediately notice an increase in the cold start times. 

The root cause for this behavior is the way the OTel collector is started within the Lambda function. 
The collector is started as a [Lambda Extension](https://docs.aws.amazon.com/lambda/latest/dg/lambda-extensions.html). 

This means the collector is running in a separate process next to the one the Lambda handler code is executed in. 
This orchestration is done by the Lambda runtime.

When a new Lambda instance is spawned, the runtime downloads the handler code as well as all the lambda layers. The handler code is extracted into `/var/task`, whereas the layers are extracted into `/opt`. 

After the extraction of all the assets, the runtime checks if there are any executables in the `/opt/extensions` folder. 
If there are any executables, the runtime starts to wait for all the extensions to be registered before continuing to load the handler code. 

To register an extension, the Lambda runtime provides an [HTTP endpoint](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html#runtimes-extensions-registration-api) `POST /register` which must be called with the filename of the executable in the `/opt/extensions` folder. The endpoint then returns an extension id which is dynamic for each Lambda instance. 

The OTel collector is an extension; therefore, the layer for the collector contains an executable in the `/opt/extensions` folder.
This executable is a GO application that includes the OTel collector as well as a [lifecycle implementation](https://github.com/open-telemetry/opentelemetry-lambda/blob/main/collector/internal/lifecycle/manager.go) to interact with the Lambda runtime. 

Knowing this, the first thing the collector does is call the `/register` endpoint. This allows the runtime to continue with the initialization of the runtime. The delay of the executable before calling the register endpoint is the first potential delay which can add cold start time. 

Now the runtime starts loading the handler code. Technically, it starts the runtime [interface client for the respective runtime](https://github.com/aws/aws-lambda-nodejs-runtime-interface-client) (RIC) first, which then mounts the `handler` function.

In this phase, the second part of the cold start is added. First of all, the node executable needs to be mounted and loaded (~100 ms), then the RIC nodejs script is loaded and executed (~20 ms), and then the handler js file is loaded and the code outside the handler is executed (the load and init time depends on the size and code executed in the handler js file).

After all the code is loaded, the RIC signals the runtime that it is ready to accept the next invocation by making an HTTP call to the runtime endpoint `GET /next`. 

In parallel, the collector runs its initialization, and once the collector is ready as well, it calls the `GET /next` endpoint as well and signals that it is ready for the next invocation. 

Since the collector and the runtime are initialized in parallel, it is a good thing in theory, but it also brings some caveats with it. 
First of all, the Lambda runtime provides 1 vCPU during the init phase if your memory config is less than 1780mb. That means both the collector initialization and the node runtime init share one core of CPU to do the work. This means the inits are affecting each other. Let's say the collector is using 100% of the CPU for init, then the collector is initialized first but still has to wait for the node runtime to init. That means in the end it makes no big difference if the inits are done in parallel or not as long as you only have one vCPU available. 

Coming back to the noticeable increase in cold start is due to the additional compute used to initialize the collector and a potential delay for the register call of the extension registration. 

#### Increased cold start due to OTel runtime instrumentation

Although the layer for the runtime-specific instrumentation is already added to the Lambda, the provided code isn't loaded at all. 
To do that, the OTel layer uses the [wrapper script capability](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-modify.html#runtime-wrapper) of the Lambda runtime. 

To configure the usage of the OTel instrumentation, the Lambda needs to configure the `AWS_LAMBDA_EXEC_WRAPPER` environment variable and set the value to `/opt/otel-handler`, which is a [bash script](https://github.com/open-telemetry/opentelemetry-lambda/blob/main/nodejs/packages/layer/scripts/otel-handler) in the lambda layer for the runtime-specific instrumentation. 

The wrapper script does two main things. 
First, it adds two modules to be loaded prior to the lambda handler. 
The first module is a loader script that checks if the handler code is CommonJS or ESModule. If it's ESModule, it registers the `import-in-the-middle` module loader, which makes it possible for the OTel instrumentation to patch ESModule modules later. 
This module loader will intercept each import and modify the loaded modules to be patchable afterward. Each file that is loaded after the register call will be analyzed, parsed, and rewritten.
If it's a CommonJS handler, the loader script does nothing. 
The second Node Option that is added using the wrapper script is the actual OTel instrumentation. This registers the instrumentations and all the other relevant OTel things. 

After these `NODE_OPTIONS` are defined, the wrapper script determines some OTEL-related environment variables, like defining the service name and which propagators are used. 

Finally, the wrapper script calls the actual node command which loads the RIC and the handler code. 

This is the final part of the added cold start time. Depending on the handler type, the `import-in-the-middle` module is loaded additionally to the instrumentation code. 

#### Other files in the instrumentation layer

The last step of understanding the cold start time of the OTel instrumentation is looking at the rest of the files in the layer. 
It is noticeable that the layer also has a `node_modules` folder. 

The reason for that is that the instrumentation file is not bundled. So all the imports in the instrumentation need lookups and loading files from the `node_modules` folder.