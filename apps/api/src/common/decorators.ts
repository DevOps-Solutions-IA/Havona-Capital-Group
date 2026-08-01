import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
