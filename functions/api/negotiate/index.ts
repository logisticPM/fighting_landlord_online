import { AzureFunction, Context, HttpRequest } from '@azure/functions';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  const connectionInfo = context.bindings.connectionInfo;
  context.res = { status: 200, body: connectionInfo };
};

export default httpTrigger;


