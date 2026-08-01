'use client';
import { createContext,useCallback,useContext,useEffect,useState } from 'react';
import { api } from './api'; import type { User,RoleName } from './types';
type AuthContextValue={user:User|null;loading:boolean;refresh:()=>Promise<void>;logout:()=>Promise<void>;hasRole:(...roles:RoleName[])=>boolean;can:(permission:string)=>boolean};
const AuthContext=createContext<AuthContextValue|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){const[user,setUser]=useState<User|null>(null);const[loading,setLoading]=useState(true);const refresh=useCallback(async()=>{try{setUser(await api<User>('/auth/me'))}catch{setUser(null)}finally{setLoading(false)}},[]);useEffect(()=>{void refresh()},[refresh]);const logout=async()=>{await api('/auth/logout',{method:'POST'});setUser(null);location.assign('/login')};const hasRole=(...roles:RoleName[])=>Boolean(user?.roles.some(r=>roles.includes(typeof r==='string'?r:r.name)));const can=(permission:string)=>Boolean(user?.permissions.includes(permission)||hasRole('SUPER_ADMIN'));return <AuthContext.Provider value={{user,loading,refresh,logout,hasRole,can}}>{children}</AuthContext.Provider>}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('useAuth debe usarse dentro de AuthProvider');return value}
