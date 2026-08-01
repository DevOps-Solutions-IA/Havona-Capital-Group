import {z} from 'zod';
import {api} from './api';

export const PRIVACY_VERSION='2026-08-01';
export const leadSchema=z.object({name:z.string().trim().min(2,'Ingrese su nombre.').max(120),email:z.string().trim().email('Ingrese un correo válido.').max(160).or(z.literal('')),phone:z.string().trim().max(30).refine(value=>!value||/^[+\d][\d\s().-]{6,29}$/.test(value),'Ingrese un teléfono válido.'),city:z.string().trim().min(2,'Ingrese su ciudad.').max(100),message:z.string().trim().max(1000,'El mensaje no puede superar 1.000 caracteres.').optional(),consent:z.literal(true,{errorMap:()=>({message:'Debe autorizar el tratamiento de sus datos.'})}),website:z.string().max(0).optional()}).refine(value=>Boolean(value.email||value.phone),{message:'Ingrese al menos un correo o teléfono.',path:['email']});
export type LeadFormValues=z.infer<typeof leadSchema>;
export type PublicLeadRequest={submissionId:string;name:string;phone?:string;email?:string;city:string;source:'organic'|'campaign'|'referral'|'direct'|'henry-entry';campaign?:string;landing:string;interest:string;message?:string;consent:{accepted:true;privacyVersion:string};website?:string};
type PublicLeadResponse={data:{id:string;status:string};message:string};
export function submitLead(payload:PublicLeadRequest){return api<PublicLeadResponse>('/prospects/public',{method:'POST',body:JSON.stringify(payload)})}
