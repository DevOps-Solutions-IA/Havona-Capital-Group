import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
const inter=Inter({subsets:['latin'],variable:'--font-inter'}); const outfit=Outfit({subsets:['latin'],variable:'--font-outfit'});
export const metadata:Metadata={title:{default:'HAVONA CAPITAL',template:'%s | HAVONA CAPITAL'},description:'Administración segura de HAVONA CAPITAL',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body className={`${inter.variable} ${outfit.variable} font-sans antialiased`}>{children}</body></html>}
