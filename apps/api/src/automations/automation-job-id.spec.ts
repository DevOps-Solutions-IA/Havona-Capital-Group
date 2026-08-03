import { toBullMqJobId } from './automation-job-id';

describe('toBullMqJobId', () => {
  it.each(['outbox-prospect:assigned:prospect-id:assignment-id', 'event:with:multiple:colons'])(
    'elimina separadores no admitidos de %s',
    (input) => {
      expect(toBullMqJobId(input)).not.toContain(':');
    },
  );

  it('produce un identificador determinístico', () => {
    const input = 'outbox-prospect:assigned:prospect-id:assignment-id';
    expect(toBullMqJobId(input)).toBe(toBullMqJobId(input));
  });

  it('añade un hash estable para evitar colisiones triviales', () => {
    expect(toBullMqJobId('event:a:b')).not.toBe(toBullMqJobId('event-a-b'));
    expect(toBullMqJobId('event:a:b')).not.toBe(toBullMqJobId('event:a-b'));
  });

  it('conserva identificadores ya válidos y limita la longitud', () => {
    expect(toBullMqJobId('execution-uuid-1')).toBe('execution-uuid-1');
    expect(toBullMqJobId(`outbox:${'segment'.repeat(40)}`)).toHaveLength(128);
  });
});
