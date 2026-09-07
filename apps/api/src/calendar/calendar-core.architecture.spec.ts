import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('HAVONA Calendar Core transversal', () => {
  it('no depende de Henry y Henry consume el CalendarService compartido', () => {
    const calendar = readFileSync(join(__dirname, 'calendar.service.ts'), 'utf8');
    const tools = readFileSync(join(__dirname, '..', 'henry', 'henry-tools.service.ts'), 'utf8');
    expect(calendar).not.toMatch(/from ['"].*henry/);
    expect(tools).toContain("import { CalendarService } from '../calendar/calendar.service'");
    expect(tools).toContain('private readonly calendar: CalendarService');
  });
});
