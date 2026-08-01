import Link from 'next/link';

type BrandMarkProps={href?:string;className?:string;inverse?:boolean};

export function BrandMark({href='/',className='',inverse=false}:BrandMarkProps){
 const mark=<span className={`brand-lockup ${inverse?'brand-lockup-inverse':''}`}><span className="brand-lockup-main"><strong>HAVONA</strong><i/><span>CAPITAL</span></span><small>GROUP</small></span>;
 return href?<Link href={href} className={className} aria-label="HAVONA CAPITAL GROUP, inicio">{mark}</Link>:<span className={className} aria-label="HAVONA CAPITAL GROUP">{mark}</span>;
}
