import type { Config } from 'tailwindcss';
export default { content:['./src/**/*.{ts,tsx}','../../packages/ui/src/**/*.{ts,tsx}'],theme:{extend:{colors:{brand:{50:'#EAF4FF',100:'#D6EAFE',500:'#1478D4',700:'#0A3D73',800:'#071A33'},gold:'#C9A86A'},fontFamily:{sans:['var(--font-inter)'],display:['var(--font-outfit)']},boxShadow:{card:'0 12px 35px rgba(7,26,51,.07)'}}},plugins:[]} satisfies Config;
