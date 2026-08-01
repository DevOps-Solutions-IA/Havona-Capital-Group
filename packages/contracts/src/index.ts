import { z } from 'zod';

export const passwordSchema = z.string().min(12).max(128)
  .regex(/[a-z]/, 'Debe incluir minúscula').regex(/[A-Z]/, 'Debe incluir mayúscula')
  .regex(/[0-9]/, 'Debe incluir número').regex(/[^A-Za-z0-9]/, 'Debe incluir símbolo');
export const loginSchema = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase().trim()), password: z.string().min(1).max(128) });
export const forgotPasswordSchema = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase().trim()) });
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(512), password: passwordSchema });
export const createUserSchema = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase().trim()), name: z.string().trim().min(2).max(120), password: passwordSchema, roleIds: z.array(z.string().uuid()).min(1) });
export const updateUserSchema = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase().trim()).optional(), name: z.string().trim().min(2).max(120).optional() }).refine(v => Object.keys(v).length > 0);
export const userStatusSchema = z.object({ isActive: z.boolean() });
export const userRolesSchema = z.object({ roleIds: z.array(z.string().uuid()).min(1) });
export const adminResetPasswordSchema = z.object({ password: passwordSchema });
export const updateSettingSchema = z.object({ value: z.unknown() });
export type LoginInput = z.infer<typeof loginSchema>;
export type AuthUser = { id: string; email: string; name: string; isActive: boolean; roles: string[]; permissions: string[] };
export type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };
