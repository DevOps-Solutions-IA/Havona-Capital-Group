import { REQUIRED_PERMISSIONS } from '../common/decorators';
import { TrainingController } from './training.controller';

describe('TrainingController RBAC contract', () => {
  const permission = (method: keyof TrainingController) =>
    Reflect.getMetadata(REQUIRED_PERMISSIONS, TrainingController.prototype[method]);

  it('protege todas las operaciones internas, incluida evaluación manual', () => {
    expect(permission('scenarios')).toEqual(['training.read']);
    expect(permission('roleplay')).toEqual(['training.read']);
    expect(permission('respond')).toEqual(['training.read']);
    expect(permission('evaluate')).toEqual(['training.read']);
    expect(permission('manualTranscript')).toEqual(['training.read']);
    expect(permission('plan')).toEqual(['training.read']);
  });

  it('reserva coaching de equipo para training.read_team', () => {
    expect(permission('team')).toEqual(['training.read_team']);
  });
});
