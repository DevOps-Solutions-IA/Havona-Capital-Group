import { Body,Controller,Get,HttpCode,Post,Req,Res } from '@nestjs/common';import { Response } from 'express';
import { CSRF_COOKIE,SESSION_COOKIE } from '@havona/auth';import { forgotPasswordSchema,loginSchema,resetPasswordSchema } from '@havona/contracts';
import { Public } from '../common/decorators';import { ZodPipe } from '../common/zod.pipe';import { AuthService } from './auth.service';
const context=(req:any)=>({actorUserId:req.auth?.user.id,ipAddress:req.ip,userAgent:req.headers['user-agent']});
@Controller('auth') export class AuthController {constructor(private readonly auth:AuthService){}
 @Public() @Post('login') async login(@Body(new ZodPipe(loginSchema)) body:any,@Req() req:any,@Res({passthrough:true}) res:Response){const result=await this.auth.login(body.email,body.password,context(req));const secure=process.env.NODE_ENV==='production';res.cookie(SESSION_COOKIE,result.token,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:12*3600000});res.cookie(CSRF_COOKIE,result.csrf,{httpOnly:false,secure,sameSite:'strict',path:'/',maxAge:12*3600000});return {user:result.user};}
 @Post('logout') @HttpCode(204) async logout(@Req() req:any,@Res({passthrough:true}) res:Response){await this.auth.logout(req.auth.sessionId,req.auth.user.id,context(req));res.clearCookie(SESSION_COOKIE,{path:'/'});res.clearCookie(CSRF_COOKIE,{path:'/'});}
 @Get('me') me(@Req() req:any){return req.auth.user;}
 @Public() @Post('forgot-password') @HttpCode(202) forgot(@Body(new ZodPipe(forgotPasswordSchema)) body:any,@Req() req:any){return this.auth.forgotPassword(body.email,context(req));}
 @Public() @Post('reset-password') @HttpCode(204) reset(@Body(new ZodPipe(resetPasswordSchema)) body:any,@Req() req:any){return this.auth.resetPassword(body.token,body.password,context(req));}
}
