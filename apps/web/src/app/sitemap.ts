import type {MetadataRoute} from 'next';
import {publicPages} from '@/lib/public-pages';
export default function sitemap():MetadataRoute.Sitemap{const base=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');return['','henry','privacidad',...publicPages.map(page=>page.slug)].map(path=>({url:`${base}/${path}`,changeFrequency:path?'monthly':'weekly',priority:path?.includes('privacidad')?.5:path?.length?.8:1}))}
