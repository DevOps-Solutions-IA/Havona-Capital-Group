import Link from 'next/link';

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    const bold = part.match(/^\*\*(.+)\*\*$/);
    if (bold) return <strong key={index}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && (link[2].startsWith('/') || /^https:\/\/(www\.)?havonacapital\.com(?:\/|$)/.test(link[2]))) return <Link key={index} href={link[2]}>{link[1]}</Link>;
    return part;
  });
}

export function HenryMessageContent({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/).filter(Boolean);
  return <div className="henry-rich-text">{blocks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.every((line) => /^[-*] /.test(line))) return <ul key={index}>{lines.map((line, item) => <li key={item}>{inline(line.slice(2))}</li>)}</ul>;
    if (lines.every((line) => /^\d+[.)] /.test(line))) return <ol key={index}>{lines.map((line, item) => <li key={item}>{inline(line.replace(/^\d+[.)] /, ''))}</li>)}</ol>;
    if (/^#{1,3} /.test(lines[0] ?? '')) return <section key={index}><h3>{inline(lines[0].replace(/^#{1,3} /, ''))}</h3>{lines.slice(1).map((line, item) => <p key={item}>{inline(line)}</p>)}</section>;
    return <p key={index}>{lines.map((line, item) => <span key={item}>{inline(line)}{item < lines.length - 1 && <br />}</span>)}</p>;
  })}</div>;
}
