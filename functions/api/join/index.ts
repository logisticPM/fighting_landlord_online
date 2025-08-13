import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { ensureRoomAndAddPlayer, snapshot } from '../../lib/state';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  const { roomId, userId, connectionId } = req.body || {};
  try {
    const { id, seat } = ensureRoomAndAddPlayer(roomId, userId, connectionId);
    const snap = snapshot(id, connectionId);
    context.bindings.signalRGroupActions = [{ action: 'add', groupName: id, connectionId }];
    context.bindings.signalRMessages = [{ target: 'room:update', arguments: [snap], groupName: id }];
    context.res = { status: 200, body: { ok: true, roomId: id, seat } };
  } catch (e: any) {
    context.res = { status: 400, body: { ok: false, error: e?.message || 'join failed' } };
  }
};

export default httpTrigger;


