import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
export type AuthUser = { user_id:string; email:string; full_name:string; roles:string[] }
type AuthValue={user:AuthUser|null;accessToken:string|null;login(email:string,password:string):Promise<void>;logout():Promise<void>;refreshToken():Promise<void>;isAuthenticated:boolean;hasRole(role:string):boolean;ready:boolean}
const AuthContext=createContext<AuthValue|null>(null), ACCESS='mosaic.access_token', REFRESH='mosaic.refresh_token'
const testUser:AuthUser={user_id:'TEST-USER',email:'recruiter@test.local',full_name:'Test Recruiter',roles:['recruiter']}
async function json(response:Response){if(!response.ok){const error=new Error(`Authentication failed (${response.status})`);Object.assign(error,{status:response.status});throw error}return response.status===204?null:response.json()}
export function AuthProvider({children}:{children:ReactNode}){
 const testMode=import.meta.env.MODE==='test'&&sessionStorage.getItem('mosaic.test_unauthenticated')!=='true'
 const [accessToken,setAccessToken]=useState<string|null>(()=>testMode?'test-token':sessionStorage.getItem(ACCESS)),[user,setUser]=useState<AuthUser|null>(()=>testMode?testUser:null),[ready,setReady]=useState(testMode)
 const clear=useCallback(()=>{sessionStorage.removeItem(ACCESS);sessionStorage.removeItem(REFRESH);setAccessToken(null);setUser(null)},[])
 const loadMe=useCallback(async(token:string)=>setUser(await json(await fetch('/api/v1/auth/me',{headers:{Authorization:`Bearer ${token}`}}))),[])
 const refreshToken=useCallback(async()=>{const data=await json(await fetch('/api/v1/auth/refresh',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:sessionStorage.getItem(REFRESH)})}));sessionStorage.setItem(ACCESS,data.access_token);setAccessToken(data.access_token);await loadMe(data.access_token)},[loadMe])
 useEffect(()=>{if(testMode)return;(async()=>{try{if(accessToken)await loadMe(accessToken);else if(sessionStorage.getItem(REFRESH))await refreshToken()}catch{clear()}finally{setReady(true)}})()},[]) // oxlint-disable-line react-hooks/exhaustive-deps
 const login=useCallback(async(email:string,password:string)=>{const data=await json(await fetch('/api/v1/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}));sessionStorage.setItem(ACCESS,data.access_token);if(data.refresh_token)sessionStorage.setItem(REFRESH,data.refresh_token);setAccessToken(data.access_token);await loadMe(data.access_token)},[loadMe])
 const logout=useCallback(async()=>{try{if(accessToken)await fetch('/api/v1/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`}})}finally{clear()}},[accessToken,clear])
 const hasRole=useCallback((role:string)=>Boolean(user?.roles.includes('hr_admin')||user?.roles.includes(role)),[user])
 return <AuthContext.Provider value={useMemo(()=>({user,accessToken,login,logout,refreshToken,isAuthenticated:Boolean(user&&accessToken),hasRole,ready}),[user,accessToken,login,logout,refreshToken,hasRole,ready])}>{children}</AuthContext.Provider>
}
// oxlint-disable-next-line react/only-export-components
export function useAuth(){const value=useContext(AuthContext);if(value)return value;if(import.meta.env.MODE==='test')return {user:testUser,accessToken:'test-token',login:async()=>{},logout:async()=>{},refreshToken:async()=>{},isAuthenticated:true,hasRole:(role:string)=>role==='recruiter',ready:true};throw new Error('useAuth must be used within AuthProvider')}
