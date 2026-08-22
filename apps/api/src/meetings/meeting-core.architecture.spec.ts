import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('HAVONA Meet Core transversal', () => {
  it('no depende de Henry y Henry consume MeetingService', () => {
    const core = readFileSync(join(__dirname, 'meeting.service.ts'), 'utf8'),
      tools = readFileSync(join(__dirname, '..', 'henry', 'henry-tools.service.ts'), 'utf8');
    expect(core).not.toMatch(/from ['"].*henry/);
    expect(tools).toContain("import { MeetingService } from '../meetings/meeting.service'");
    expect(tools).toContain('private readonly meetings: MeetingService');
  });
  it('Calendar propaga reprogramación y cancelación al core compartido', () => {
    const calendar = readFileSync(join(__dirname, '..', 'calendar', 'calendar.service.ts'), 'utf8');
    expect(calendar).toContain('meetings.rescheduleFromCalendar');
    expect(calendar).toContain('meetings.cancelFromCalendar');
  });
});
