export type RoleName='SUPER_ADMIN'|'ADMIN'|'GERENTE'|'CONSULTOR';
export interface Permission { id?:string; key:string; description?:string }
export interface Role { id:string; name:RoleName; description?:string; permissions?:Permission[] }
export interface User { id:string; email:string; name:string; isActive:boolean; lastLoginAt?:string|null; roles:Array<Role|RoleName>; permissions:string[]; createdAt?:string }
export interface AuditLog { id:string; action:string; resource?:string; resourceId?:string; actor?:Pick<User,'id'|'email'|'name'>; ipAddress?:string; createdAt:string }
export interface SystemSetting { key:string; value:string|number|boolean|null; description?:string; updatedAt?:string }
export type ProspectStatus='NEW'|'REVIEWED'|'ARCHIVED';
export interface LeadSource { key:string; name:string }
export interface Consent { id:string; accepted:boolean; privacyVersion:string; acceptedAt:string }
export interface LeadEvent { id:string; type:'CAPTURED'|'RECAPTURED'; landing:string; campaign?:string|null; interest:string; createdAt:string; source?:LeadSource }
export interface Prospect { id:string;name:string;email?:string|null;phone?:string|null;city:string;status:ProspectStatus;landing:string;interest:string;campaign?:string|null;message?:string|null;firstCapturedAt:string;lastCapturedAt:string;source:LeadSource;consents?:Consent[];events?:LeadEvent[];_count?:{events:number;consents:number} }
export interface Paginated<T>{items:T[];total:number;page:number;pageSize:number}
export interface ApiList<T>{data:T[];meta:{page:number;pageSize:number;total:number}}
