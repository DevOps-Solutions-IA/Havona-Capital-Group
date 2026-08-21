import { Prisma } from '@havona/database';
import { AutomationEventBus } from './automation-event-bus.service';

describe('AutomationEventBus idempotencia concurrente', () => {
  const queue: any = { enqueueOutbox: jest.fn() };
  const input: any = {
    eventId: 'task:overdue:task-id:2030-01-01T00:00:00.000Z',
    type: 'TASK_OVERDUE',
    entityType: 'Task',
    entityId: '00000000-0000-4000-8000-000000000001',
    payload: { taskId: '00000000-0000-4000-8000-000000000001' },
  };

  it('crea evento y outbox en una sola transacción', async () => {
    const created = { id: 'event', eventId: input.eventId };
    const tx = {
      automationEvent: { create: jest.fn().mockResolvedValue(created) },
      domainOutboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox' }) },
    };
    const db: any = {
      automationEvent: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((operation) => operation(tx)),
    };
    const bus = new AutomationEventBus(db, queue);
    await expect(bus.publish(input)).resolves.toEqual({ duplicate: false, event: created });
    expect(tx.domainOutboxEvent.create).toHaveBeenCalled();
    expect(queue.enqueueOutbox).toHaveBeenCalledWith(input.eventId);
  });

  it('trata una colisión P2002 concurrente como entrega duplicada segura', async () => {
    const duplicate = { id: 'existing', eventId: input.eventId };
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: {},
    });
    const db: any = {
      automationEvent: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(duplicate),
      },
      $transaction: jest.fn().mockRejectedValue(error),
    };
    const bus = new AutomationEventBus(db, queue);
    await expect(bus.publish(input)).resolves.toEqual({ duplicate: true, event: duplicate });
  });
});
