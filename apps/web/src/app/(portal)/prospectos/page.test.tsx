import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import ProspectsPage from './page';

const apiMock=vi.fn();
vi.mock('@/lib/api',()=>({api:(...args:unknown[])=>apiMock(...args),messageOf:(error:unknown)=>error instanceof Error?error.message:'Error'}));

const prospect={id:'ef14be5b-9e10-4bd5-8a91-c242581eb21e',name:'Laura Torres',email:'laura@example.com',phone:'+57 300 000 0000',city:'Bogotá',status:'NEW',landing:'pension',interest:'pension',campaign:null,firstCapturedAt:'2026-08-01T10:00:00.000Z',lastCapturedAt:'2026-08-01T10:00:00.000Z',source:{key:'organic',name:'Orgánico'},_count:{events:1,consents:1}};

describe('Bandeja de prospectos',()=>{
 beforeEach(()=>{apiMock.mockReset();apiMock.mockImplementation((path:string)=>path.startsWith('/prospects?')?Promise.resolve({data:[prospect],meta:{page:1,pageSize:100,total:1}}):Promise.resolve({...prospect,consents:[{id:'consent-1',accepted:true,privacyVersion:'2026-08-01',acceptedAt:'2026-08-01T10:00:00.000Z'}],events:[{id:'event-1',type:'CAPTURED',landing:'pension',interest:'pension',createdAt:'2026-08-01T10:00:00.000Z'}]}))});
 it('lista capturas reales y abre consentimiento e historial',async()=>{render(<ProspectsPage/>);expect(await screen.findByText('Laura Torres')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Ver detalle'}));expect(await screen.findByText('Política 2026-08-01', {exact:false})).toBeInTheDocument();expect(screen.getByText('Captado')).toBeInTheDocument();expect(apiMock).toHaveBeenCalledWith(`/prospects/${prospect.id}`)});
});
