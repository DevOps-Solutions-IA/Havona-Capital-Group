import { Injectable } from '@nestjs/common';

export type VoiceDetail = 'VOICE_SHORT' | 'VOICE_STANDARD' | 'VOICE_DETAILED';

@Injectable()
export class HenryVoiceFormatter {
  format(input: string, detail: VoiceDetail = 'VOICE_STANDARD') {
    const plain = input
      .replace(/```[\s\S]*?```/g, ' contenido técnico omitido para lectura oral ')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/[*_`>|]/g, '')
      .replace(/^\s*[-+]\s+/gm, '')
      .replace(/^\s*\d+[.)]\s+/gm, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const limit = detail === 'VOICE_SHORT' ? 420 : detail === 'VOICE_DETAILED' ? 1800 : 900;
    if (plain.length <= limit) return plain;
    const boundary = plain.lastIndexOf('.', limit);
    const clipped = plain.slice(0, boundary > limit * .6 ? boundary + 1 : limit).trim();
    return `${clipped} Puedo explicarte el resto con más detalle si quieres.`;
  }
}
