import { Injectable } from '@nestjs/common';

type Segment = {
  kind: string;
  content: string;
  priority: number;
  citations?: Array<{ chunkId: string }>;
};

@Injectable()
export class HenryContextAssembler {
  assemble(
    segments: Segment[],
    maximumTokens = Number(process.env.RAG_MAX_CONTEXT_TOKENS ?? 6000),
  ) {
    const maximumCharacters = maximumTokens * 4;
    let used = 0;
    const included: Segment[] = [];
    for (const segment of [...segments].sort((a, b) => a.priority - b.priority)) {
      const remaining = maximumCharacters - used;
      if (remaining <= 0) break;
      if (segment.content.length <= remaining) {
        included.push(segment);
        used += segment.content.length;
        continue;
      }
      if (segment.citations?.length) continue;
      included.push({ ...segment, content: segment.content.slice(0, remaining) });
      used = maximumCharacters;
    }
    return {
      content: included
        .map((item) => `<${item.kind}>\n${item.content}\n</${item.kind}>`)
        .join('\n\n'),
      included: included.map((item) => item.kind),
      estimatedTokens: Math.ceil(used / 4),
      truncated: included.length < segments.length,
    };
  }
}
