import { createContext, useContext, useEffect, useState } from 'react'
import { AUTH_MODE, auth, db } from '../lib/firebase'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

const AuthCtx = createContext(null)

export function AuthProvider({ children }){
  const [user,setUser]=useState(null)
  const [profile,setProfile]=useState(null)
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    if(AUTH_MODE==='dev'){
      const dev = JSON.parse(localStorage.getItem('devUser')||'null')
      setUser(dev)
      setProfile(dev?{name:(dev.email||'dev').split('@')[0], role:(dev.email||'gestor').split('@')[0]}:null)
      setLoading(false)
      return
    }

    let unsubProfile = null
    const unsub = onAuthStateChanged(auth, (u)=>{
      setUser(u)
      if(u){ 
        // Use real-time listener instead of one-time fetch
        // This way, when admin changes permissions, user's profile updates automatically
        unsubProfile = onSnapshot(doc(db,'users', u.uid), (snap) => {
          setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
        })
        setLoading(false)
      } else { 
        setProfile(null)
        setLoading(false)
        if(unsubProfile) unsubProfile()
      }
    })
    
    return ()=>{
      unsub()
      if(unsubProfile) unsubProfile()
    }
  },[])

  const login = async (email,password)=>{
    if(AUTH_MODE==='dev'){ 
      const fake={uid:'dev-'+email,email}
      localStorage.setItem('devUser', JSON.stringify(fake))
      setUser(fake)
      setProfile({name: email.split('@')[0], role: email.split('@')[0]})
      return 
    }
    await signInWithEmailAndPassword(auth, email, password)
  }

  const logout = async ()=>{ 
    if(AUTH_MODE==='dev'){ 
      localStorage.removeItem('devUser')
      setUser(null)
      setProfile(null)
      return 
    } 
    await signOut(auth) 
  }

  return <AuthCtx.Provider value={{user,profile,setProfile,login,logout,loading}}>{children}</AuthCtx.Provider>
}

export const useAuth = ()=> useContext(AuthCtx)
