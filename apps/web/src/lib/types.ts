export type RoleName='SUPER_ADMIN'|'ADMIN'|'GERENTE'|'CONSULTOR';
export interface Permission { id?:string; key:string; description?:string }
export interface Role { id:string; name:RoleName; description?:string; permissions?:Permission[] }
export interface User { id:string; email:string; name:string; isActive:boolean; lastLoginAt?:string|null; roles:Array<Role|RoleName>; permissions:string[]; createdAt?:string }
export interface AuditLog { id:string; action:string; resource?:string; resourceId?:string; actor?:Pick<User,'id'|'email'|'name'>; ipAddress?:string; createdAt:string }
export interface SystemSetting { key:string; value:string|number|boolean|null; description?:string; updatedAt?:string }
export interface Paginated<T>{items:T[];total:number;page:number;pageSize:number}
export interface ApiList<T>{data:T[];meta:{page:number;pageSize:number;total:number}}
