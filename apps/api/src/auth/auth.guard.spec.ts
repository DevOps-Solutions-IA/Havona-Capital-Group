import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createOpaqueToken, hashToken } from '@havona/auth';
import { AuthGuard } from './auth.guard';

const context=(request:any)=>({getHandler:()=>undefined,getClass:()=>undefined,switchToHttp:()=>({getRequest:()=>request})}) as any;
describe('AuthGuard',()=>{
 const reflector={getAllAndOverride:jest.fn()} as unknown as Reflector;
 beforeEach(()=>jest.resetAllMocks());
 it('rechaza sesiones ausentes',async()=>{(reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(false);const guard=new AuthGuard(reflector,{authenticate:jest.fn().mockResolvedValue(null)} as any);await expect(guard.canActivate(context({cookies:{},method:'GET',headers:{}}))).rejects.toBeInstanceOf(UnauthorizedException)});
 it('exige CSRF y permisos en mutaciones',async()=>{const csrf=createOpaqueToken();(reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(false).mockReturnValueOnce(['users.update']);const session={csrfHash:hashToken(csrf),user:{permissions:['users.update']}};const guard=new AuthGuard(reflector,{authenticate:jest.fn().mockResolvedValue(session)} as any);await expect(guard.canActivate(context({cookies:{havona_session:'session'},method:'PATCH',headers:{'x-csrf-token':'incorrecto'}}))).rejects.toBeInstanceOf(ForbiddenException)});
 it('autoriza cuando sesión, CSRF y permiso son válidos',async()=>{const csrf=createOpaqueToken();(reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(false).mockReturnValueOnce(['users.update']);const session={csrfHash:hashToken(csrf),user:{permissions:['users.update']}};const guard=new AuthGuard(reflector,{authenticate:jest.fn().mockResolvedValue(session)} as any);await expect(guard.canActivate(context({cookies:{havona_session:'session'},method:'PATCH',headers:{'x-csrf-token':csrf}}))).resolves.toBe(true)});
});
