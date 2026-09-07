import { HenryVoiceFormatter } from './henry-voice-formatter';

describe('HenryVoiceFormatter', () => {
  const formatter = new HenryVoiceFormatter();

  it('convierte formato editorial a habla sin alterar cifras ni advertencias', () => {
    const output = formatter.format('## Próximo paso\n\n**Importante:** revise 42 meses.\n\n- No existe garantía.');
    expect(output).toContain('42 meses');
    expect(output).toContain('No existe garantía.');
    expect(output).not.toMatch(/##|\*\*|^- /m);
  });

  it('limita una respuesta oral y ofrece ampliar sin inventar contenido', () => {
    const output = formatter.format(`${'Una explicación segura. '.repeat(80)}`, 'VOICE_SHORT');
    expect(output.length).toBeLessThan(520);
    expect(output).toMatch(/más detalle si quieres/i);
  });
});
