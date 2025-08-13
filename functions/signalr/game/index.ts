import { AzureFunction, Context } from '@azure/functions';
import { playCards, passTurn, snapshot } from '../../lib/state';

const trigger: AzureFunction = async function (context: Context): Promise<void> {
  const invocation = context.bindings.invocation as any;
  const target: string = invocation?.target;
  const args = invocation?.arguments || [];
  const connectionContext = invocation?.connectionContext || {};

  if (target === 'play') {
    const { roomId, cards } = args[0] || {};
    await playCards(roomId, connectionContext.connectionId, cards);
    const snap = snapshot(roomId, connectionContext.connectionId);
    context.bindings.signalRMessages = [{ target: 'game:update', arguments: [snap], groupName: roomId }];
  } else if (target === 'pass') {
    const { roomId } = args[0] || {};
    await passTurn(roomId, connectionContext.connectionId);
    const snap = snapshot(roomId, connectionContext.connectionId);
    context.bindings.signalRMessages = [{ target: 'game:update', arguments: [snap], groupName: roomId }];
  }
};

export default trigger;


