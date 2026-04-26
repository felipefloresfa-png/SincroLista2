/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  FirebaseUser,
  auth,
  db,
  itemsCollection,
  usersCollection,
  listsCollection,
  activitiesCollection,
  signInAnonymously
} from './lib/firebaseUtils';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { 
  Plus, 
  Check, 
  Trash2, 
  LogOut, 
  Share2, 
  ShoppingBasket,
  RefreshCw,
  List as ListIcon,
  Search,
  Mic,
  History,
  AlertCircle,
  ChevronRight,
  MoreVertical,
  Star,
  Zap,
  Tag,
  MessageSquare,
  Users,
  Link as LinkIcon,
  Layout,
  ChevronDown,
  UserPlus,
  Pencil,
  Copy,
  MessageCircle,
  Mail,
  Menu,
  ArrowRightLeft,
  FolderPlus,
  MapPin,
  Compass,
  AlertTriangle,
  ExternalLink,
  Car,
  Footprints,
  Clock,
  Filter,
  Info,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeItem, getSmartRecommendations, parseVoiceInput, ItemInfo, ParsedVoiceItem } from './lib/gemini';
import { getInstantCategory } from './lib/itemCache';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Utils ---
const generateShortId = () => {
  // Usamos un set de caracteres muy legible (sin O, 0, I, 1)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  // Reducimos a 8 caracteres por defecto como pidió el usuario para que sea súper fácil
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const copyToClipboard = async (text: string) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch (err) {
    return false;
  }
};

const COMMON_CATEGORIES = [
  'Frutas y Verduras',
  'Lácteos y Huevos',
  'Carnicería',
  'Congelados',
  'Panadería',
  'Fiambrería',
  'Abarrotes',
  'Limpieza',
  'Cuidado Personal',
  'Bebidas',
  'Mascotas',
  'Hogar',
  'Otros'
];

// --- Types ---
interface GroceryItem {
  id: string;
  listId: string;
  name: string;
  category: string;
  quantity: string;
  checked: boolean;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
  addedBy: string;
  familyId: string;
  createdAt: any;
}

interface ShoppingList {
  id: string;
  name: string;
  color: string;
  familyId: string;
  isArchived: boolean;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  familyId: string;
  favoriteItems?: string[];
}

interface ActivityItem {
  id: string;
  userId: string;
  type: 'add' | 'check' | 'delete' | 'clear';
  itemName: string;
  category?: string;
  familyId: string;
  timestamp: any;
}

function CopyCodeComponent({ code }: { code: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const [isUrlCopied, setIsUrlCopied] = useState(false);
  
  const invitationUrl = `https://sincro-lista2.vercel.app/?invite=${code}`;
  const shareMessage = `¡Hola! Únete a mi grupo en SincroLista para compartir nuestras listas de compras en tiempo real. Usa este link: ${invitationUrl}`;
  
  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank');
  };

  const shareEmail = () => {
    const url = `mailto:?subject=Invitación a SincroLista&body=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank');
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Invitación a SincroLista',
          text: shareMessage,
          url: invitationUrl
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    }
  };

  const copyUrl = async () => {
    const success = await copyToClipboard(invitationUrl);
    if (success) {
      setIsUrlCopied(true);
      setTimeout(() => setIsUrlCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className={cn("inline-flex items-center gap-1.5 w-full bg-white border border-border rounded-xl px-3 py-2 shadow-xs group")}>
          <div className="flex-grow flex flex-col min-w-0">
            <span className="text-[8px] text-text-secondary uppercase font-black tracking-widest">Código</span>
            <code className="text-[10px] font-mono text-text-main break-all">
              {code}
            </code>
          </div>
          <button 
            onClick={async () => {
              const success = await copyToClipboard(code);
              if (success) {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }
            }}
            className={cn(
              "p-2 rounded-xl transition-all active:scale-95",
              isCopied ? "bg-green-500 text-white" : "bg-text-main text-white hover:bg-black"
            )}
            title="Copiar Código"
          >
            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <button 
          onClick={copyUrl}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 px-3 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
            isUrlCopied ? "bg-green-500 text-white border-green-500" : "bg-white border-border text-text-main hover:bg-gray-50"
          )}
        >
          {isUrlCopied ? (
            <><Check className="w-3.5 h-3.5" /> ¡Enlace Copiado!</>
          ) : (
            <><LinkIcon className="w-3.5 h-3.5" /> Copiar Enlace Directo</>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button 
          onClick={shareWhatsApp}
          className="flex items-center justify-center gap-2 py-2.5 bg-[#25D366] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-sm"
        >
          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
        </button>
        <button 
          onClick={shareEmail}
          className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-sm"
        >
          <Mail className="w-3.5 h-3.5" /> Email
        </button>
      </div>
      
      {navigator.share && (
        <button 
          onClick={shareNative}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-sm"
        >
          <Share2 className="w-3.5 h-3.5" /> Otras opciones
        </button>
      )}
    </div>
  );
}

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

function ToastContainer({ notifications, onDismiss }: { notifications: Notification[], onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[320px] px-4 space-y-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={cn(
              "p-3 rounded-2xl shadow-xl flex items-center gap-3 border pointer-events-auto",
              n.type === 'success' ? "bg-white border-green-100" : 
              n.type === 'error' ? "bg-white border-red-100" : "bg-white border-blue-100"
            )}
            onClick={() => onDismiss(n.id)}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-none",
              n.type === 'success' ? "bg-green-50 text-green-600" : 
              n.type === 'error' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
            )}>
              {n.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
               n.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
            </div>
            <p className="text-xs font-bold text-gray-800 leading-tight">{n.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function VoiceInputButton({ onItemsFound, onStatusChange }: { 
  onItemsFound: (items: ParsedVoiceItem[]) => void,
  onStatusChange?: (msg: string, type: 'info' | 'error' | 'success') => void 
}) {
  const [isListening, setIsListening] = useState(false);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (onStatusChange) onStatusChange("Tu navegador no soporta dictado de voz.", 'error');
      else alert("Tu navegador no soporta dictado de voz. Por favor usa Chrome o Safari.");
      return;
    }

    if (window.self !== window.top) {
      console.warn("[Dictado] Detectado entorno iframe.");
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-CL';
      recognition.continuous = false;
      recognition.interimResults = true; // Activar resultados parciales para mejor UX

      recognition.onstart = () => {
        setIsListening(true);
        if (onStatusChange) onStatusChange("Escuchando...", 'info');
      };

      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognition.onerror = (event: any) => {
        setIsListening(false);
        let errorMsg = "Error al escuchar.";
        if (event.error === 'not-allowed') errorMsg = "Permiso de micrófono denegado.";
        if (event.error === 'network') errorMsg = "Error de red en dictado.";
        if (event.error === 'no-speech') errorMsg = "No se detectó voz.";
        
        if (onStatusChange) onStatusChange(errorMsg, 'error');
        console.error("[Dictado] Error:", event.error);
      };

      recognition.onresult = async (event: any) => {
        const isFinal = event.results[event.results.length - 1].isFinal;
        if (!isFinal) return;

        const transcript = event.results[0][0].transcript;
        if (onStatusChange) onStatusChange(`Procesando: "${transcript}"`, 'info');

        try {
          const parsed = await parseVoiceInput(transcript);
          if (parsed.length > 0) {
            onItemsFound(parsed);
          } else {
            if (onStatusChange) onStatusChange("No se identificaron productos.", 'info');
          }
        } catch (error) {
          if (onStatusChange) onStatusChange("Error al procesar dictado.", 'error');
        }
      };

      recognition.start();
    } catch (err) {
      console.error("[Dictado] Fallo crítico:", err);
      setIsListening(false);
      if (onStatusChange) onStatusChange("Error al iniciar micrófono.", 'error');
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        if (isListening) return;
        startListening();
      }}
      className={cn(
        "p-2 rounded-xl transition-all active:scale-95 flex-none relative",
        isListening ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "bg-gray-100 text-text-secondary hover:bg-black hover:text-white"
      )}
      title="Dictar productos (Ej: necesito leche y dos panes)"
    >
      <Mic className={cn("w-4 h-4", isListening && "animate-bounce")} />
      {isListening && (
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [inviteCodeFromUrl, setInviteCodeFromUrl] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('invite') || params.get('join') || params.get('familyId') || params.get('code') || '';
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'list' | 'stores'>('list');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [syncedUsers, setSyncedUsers] = useState<UserProfile[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [shoppingMode, setShoppingMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false); // Used for other global loading states if needed
  const [isScrolled, setIsScrolled] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      // Usar tanto scrollY como documentElement.scrollTop para máxima compatibilidad
      const scrollPos = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(scrollPos > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Dialog State
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    initialValue: string;
    placeholder?: string;
    type?: 'input' | 'confirm' | 'quantity';
    onConfirm: (val: string) => void;
    onCategorySelect?: (cat: string) => void;
  }>({
    isOpen: false,
    title: '',
    initialValue: '',
    onConfirm: () => {}
  });
  
  // Form States
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');

  const [statusMessage, setStatusMessage] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addLog = (msg: string) => {
    console.log(`[App] ${msg}`);
    setDebugLogs(prev => [...prev.slice(-14), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Auth & Profile
  useEffect(() => {
    addLog("Configurando receptor de autenticación...");
    const keyStatus = process.env.GEMINI_API_KEY ? "Detectada ✅" : "FALTA ❌";
    addLog(`Estado IA: ${keyStatus}`);
    addLog(`Versión: 2.1.3 (AI Stable Build)`);
    
    const unsub = onAuthStateChanged(auth, async (u) => {
      addLog(`Estado Auth: ${u ? 'Sesión activa (' + u.uid.substring(0,5) + '...)' : 'Sin sesión'}`);
      setUser(u);
      
      if (u) {
        setStatusMessage("Sincronizando perfil...");
        try {
          const userDocRef = doc(db, 'users', u.uid);
          // Timeout agresivo para getDoc
          const docPromise = getDoc(userDocRef);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Conexión Firestore lenta")), 3000));
          
          const userDoc = await Promise.race([docPromise, timeoutPromise]) as any;
          
          if (userDoc.exists()) {
            addLog("Perfil encontrado.");
            const data = userDoc.data() as UserProfile;
            
            // AUTO-MIGRACIÓN: Si el código es el viejo (largo), lo actualizamos a 8 caracteres automáticamente
            if (data.familyId && data.familyId.length > 15) {
              const newShortId = generateShortId();
              addLog(`Migrando código largo a nuevo código corto: ${newShortId}`);
              updateDoc(userDocRef, { familyId: newShortId });
              data.familyId = newShortId;
            }
            
            setProfile(data);
          } else {
            addLog("Usuario nuevo (sin perfil en DB).");
            setProfile(null);
          }
        } catch (err: any) {
          addLog(`Aviso: ${err.message || "Usando modo local"}`);
          // Si falla el perfil pero tenemos UID, intentamos recuperar del localStorage
          const cached = localStorage.getItem(`profile_${u.uid}`);
          if (cached) {
            setProfile(JSON.parse(cached));
          }
        }
      } else {
        setProfile(null);
      }
      setIsInitializing(false);
      setStatusMessage('');
    });

    // FAIL-SAFE: Forzamos la carga si Firebase no responde
    const timer = setTimeout(() => {
      setIsInitializing(prev => {
        if (prev) addLog("Activando fail-safe de inicio.");
        return false;
      });
    }, 6000);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []); // Quitamos isInitializing de las dependencias

  const handleDemoMode = useCallback(() => {
    const demoProfile: UserProfile = {
      uid: 'demo-user',
      email: '',
      displayName: 'Usuario Invitado',
      photoURL: `https://ui-avatars.com/api/?name=Demo&background=random&color=fff`,
      familyId: 'demo-family'
    };
    setUser({ uid: 'demo-user' } as any);
    setProfile(demoProfile);
  }, []);

  // Expose it globally so the child component can use it without prop drilling if needed
  useEffect(() => {
    (window as any).enterDemoMode = handleDemoMode;
    return () => { delete (window as any).enterDemoMode; };
  }, [handleDemoMode]);

  const handleLogin = async (displayName: string, inviteCode?: string) => {
    if (!displayName.trim()) return;
    
    try {
      setIsLoggingIn(true);
      setStatusMessage("Conectando con Firebase...");
      addLog("Solicitando sesión segura...");
      
      if (auth.currentUser && !profile) {
        await auth.signOut();
      }

      // Solicitamos sesión con un margen de tiempo más amplio
      const result = await signInAnonymously(auth);
      
      const u = result.user;
      addLog(`Sesión OK (ID: ${u.uid.substring(0,5)})`);
      
      const familyId = inviteCode?.trim() || generateShortId();
      const newProfile: UserProfile = {
        uid: u.uid,
        email: '',
        displayName: displayName.trim(),
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff`,
        familyId: familyId
      };
      
      setStatusMessage("Verificando permisos...");
      // LOGIN OPTIMISTA: Guardamos en state inmediatamente
      setUser(u);
      setProfile(newProfile);
      localStorage.setItem(`profile_${u.uid}`, JSON.stringify(newProfile));

      // Intentamos guardar en Firestore sin bloquear la UI
      addLog("Actualizando perfil en la nube...");
      setDoc(doc(db, 'users', u.uid), newProfile)
        .then(() => addLog("Perfil sincronizado con éxito."))
        .catch(err => {
          addLog(`AVISO: Escritura denegada (${err.code}).`);
          if (err.code === 'permission-denied') {
            addLog("Tip: Abre las reglas en Firebase Console.");
          }
        });
      
    } catch (e: any) {
      addLog(`Fallo: ${e.code || e.message}`);
      let errorMsg = "Error al conectar con Firebase.";
      
      if (e.code === 'auth/operation-not-allowed') {
        errorMsg = "ERROR: Debes habilitar 'Ingreso Anónimo' en tu consola de Firebase (Pestaña Authentication).";
      } else if (e.code === 'auth/unauthorized-domain') {
        errorMsg = "Dominio no autorizado en Firebase.";
      }
      
      alert(errorMsg);
    } finally {
      setIsLoggingIn(false);
      setStatusMessage('');
    }
  };

  const handleResetSession = async () => {
    if (confirm("¿Quieres limpiar los datos de sesión y reintentar desde cero?")) {
      await auth.signOut();
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleGoogleLogin = async (inviteCode?: string) => {
    try {
      setIsLoggingIn(true);
      setStatusMessage("Conectando con Google...");
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      
      addLog(`Google OK: ${u.displayName}`);
      
      const userRef = doc(db, 'users', u.uid);
      const userSnap = await getDoc(userRef);
      
      let finalProfile: UserProfile;
      if (!userSnap.exists()) {
        const familyId = inviteCode?.trim() || generateShortId();
        finalProfile = {
          uid: u.uid,
          email: u.email || '',
          displayName: u.displayName || 'Usuario Google',
          photoURL: u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || 'G')}&background=random&color=fff`,
          familyId: familyId
        };
        await setDoc(userRef, finalProfile);
      } else {
        finalProfile = userSnap.data() as UserProfile;
        // Si el usuario trae un nuevo código de invitación, actualizamos su grupo
        if (inviteCode?.trim() && finalProfile.familyId !== inviteCode.trim()) {
           finalProfile.familyId = inviteCode.trim();
           await updateDoc(userRef, { familyId: finalProfile.familyId });
           addLog("Unido a nuevo grupo.");
        }
      }
      
      setUser(u);
      setProfile(finalProfile);
      localStorage.setItem(`profile_${u.uid}`, JSON.stringify(finalProfile));
      addLog("Sesión recuperada con éxito.");
    } catch (e: any) {
      addLog(`Error Google: ${e.code}`);
      if (e.code === 'auth/operation-not-allowed') {
        alert("Debes habilitar Google en Firebase Console > Authentication > Sign-in method.");
      }
    } finally {
      setIsLoggingIn(false);
      setStatusMessage('');
    }
  };

  // Sync Lists & Family Members
  useEffect(() => {
    if (!profile?.familyId) return;

    // Sync Group Members
    const qUsers = query(usersCollection, where('familyId', '==', profile.familyId));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setSyncedUsers(snapshot.docs.map(d => d.data() as UserProfile));
    });

    // Sync Lists
    addLog("Sincronizando listas...");
    const qLists = query(listsCollection, where('familyId', '==', profile.familyId));
    const unsubLists = onSnapshot(qLists, (snapshot) => {
      addLog(`Listas sincronizadas: ${snapshot.docs.length}`);
      const fetchedLists = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ShoppingList[];
      setLists(fetchedLists);
      if (fetchedLists.length > 0) {
        const id = fetchedLists[0].id;
        addLog(`ID activa establecida: ${id.substring(0,5)}...`);
        setActiveListId(prev => prev && !prev.startsWith('temp-') ? prev : id);
      } else {
        addLog("Nube vacía. Creando lista inicial...");
        createDefaultList(profile.familyId);
      }
      setLoading(false);
    }, (err) => {
      addLog(`Error Listas: ${err.code}`);
      if (err.code === 'permission-denied') {
        addLog("CRÍTICO: Permiso denegado. Revisa tus Reglas en Firebase Console.");
      }
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubLists();
    };
  }, [profile?.familyId]);

  // Sync Items (Explicitly filter by familyId to satisfy security rules and performance)
  useEffect(() => {
    if (!activeListId || !profile?.familyId) {
      if (!activeListId) addLog("Esperando ID de lista activa...");
      if (!profile?.familyId) addLog("Esperando ID de grupo...");
      return;
    }
    
    addLog(`Sincronizando productos de lista: ${activeListId}`);
    const q = query(
      itemsCollection, 
      where('listId', '==', activeListId),
      where('familyId', '==', profile.familyId)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      addLog(`Productos actualizados (${snapshot.docs.length} encontrados)`);
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as GroceryItem[];
      // In-memory sort to avoid index requirement for combined where + orderBy
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setItems(fetched);
    }, (err) => {
      addLog(`Error productos: ${err.code} - ${err.message}`);
      // Si el error es falta de índice, avisamos
      if (err.message.includes('index')) {
        addLog("Error: Se requiere crear un índice en Firebase.");
      }
    });
    
    return unsub;
  }, [activeListId, profile?.familyId]);

  // Sync Activities (Explicitly filter by familyId)
  useEffect(() => {
    if (!profile?.familyId) return;
    const q = query(
      activitiesCollection, 
      where('familyId', '==', profile.familyId),
      // Eliminamos orderBy temporalmente para evitar el error de índice falta
      // Traemos más actividades para tener mejor memoria de categorización
      limit(100)
    );
    return onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ActivityItem[];
      // Ordenamos en memoria para no requerir índice compuesto en Firestore
      const sorted = [...fetched].sort((a, b) => {
        const timeA = a.timestamp?.toMillis?.() || 0;
        const timeB = b.timestamp?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setActivities(sorted);
    });
  }, [profile?.familyId]);

  // AI Recommendations
  const [isFetchingRecs, setIsFetchingRecs] = useState(false);
  const fetchRecommendations = async () => {
    if (isFetchingRecs) return;
    try {
      setIsFetchingRecs(true);
      const history = activities.map(a => a.itemName).filter(Boolean);
      addLog(`IA Recs: Consultando con historial de ${history.length} items...`);
      
      const recsPromise = getSmartRecommendations(history);
      const timeoutPromise = new Promise<string[]>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout (25s)")), 25000)
      );
      
      const recs = await Promise.race([recsPromise, timeoutPromise]);
      setRecommendations(recs);
      addLog(`IA Recs Éxito: ${recs.length} sugerencias`);
    } catch (e: any) {
      addLog(`IA Recs Fallo: ${e.message || "Error desconocido"}`);
    } finally {
      setIsFetchingRecs(false);
    }
  };

  useEffect(() => {
    if (recommendations.length === 0 && !isFetchingRecs) {
      fetchRecommendations();
    }
  }, [activities.length, recommendations.length, isFetchingRecs]);

  const createDefaultList = async (familyId: string) => {
    addLog("Iniciando creación de lista de emergencia...");
    
    const newListData = { 
      name: 'Compras Semanales', 
      color: '#10B981', 
      familyId, 
      isArchived: false, 
      createdAt: serverTimestamp() 
    };

    // OPTIMISMO: Mostramos la lista antes de que Firestore responda
    const tempId = 'temp-list-' + Date.now();
    const tempElement = { id: tempId, ...newListData } as any;
    setLists(prev => prev.length === 0 ? [tempElement] : prev);
    setActiveListId(prev => prev || tempId);

    try {
      const docRef = await addDoc(listsCollection, newListData);
      addLog(`Lista creada en nube con ID: ${docRef.id.substring(0,5)}`);
      setActiveListId(docRef.id);
      return docRef.id;
    } catch (e: any) {
      addLog(`Aviso: Error nube lista (${e.code}). Usando modo local.`);
      return tempId;
    }
  };

  const logActivity = async (type: ActivityItem['type'], itemName: string, category?: string) => {
    if (!profile) return;
    await addDoc(activitiesCollection, { 
      userId: profile.uid, 
      type, 
      itemName, 
      category: category || 'Otros', // Evitar undefined que causa error en Firestore
      familyId: profile.familyId, 
      timestamp: serverTimestamp() 
    });
  };

  const handleVoiceItems = async (parsedItems: ParsedVoiceItem[]) => {
    addLog(`Dictado: Procesando ${parsedItems.length} productos...`);
    addNotification(`Dictado: Procesando ${parsedItems.length} productos...`, 'info');
    for (const item of parsedItems) {
      // Usamos qty especificado o 1 por defecto
      const qty = item.quantity?.toString() || '1';
      // Si el item viene con unidad (ej: "3 litros de leche"), concatenamos al nombre o usamos campo unitario
      const finalName = item.unit ? `${item.name} (${item.unit})` : item.name;
      await addItem(finalName, qty, undefined, true);
    }
    addLog("Dictado completado con éxito.");
    addNotification("¡Productos añadidos con éxito!", 'success');
  };

  const addItem = async (name: string, qty: string = '1', listIdOverride?: string, silent: boolean = false) => {
    const listToUse = listIdOverride || activeListId;
    if (!name.trim() || !profile) {
      addLog("Error: Esperando perfil...");
      return;
    }

    // Capitalizar la primera letra siempre
    const capitalizedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);

    const proceedWithAdd = async (finalName: string, finalQty: string, finalId: string | null) => {
      if (!finalId) {
        addLog("Reparando lista...");
        const newId = await createDefaultList(profile.familyId);
        if (newId) {
          addLog("Re-intentando con ID listo.");
          proceedWithAdd(finalName, finalQty, newId);
        }
        return;
      }
      
      try {
        if (newItemName === name) setIsAdding(true); 
        addLog(`Guardando [${finalName}]...`);
        
        // MEMORIA DE PASILLOS: Buscamos si este producto ya ha sido categorizado antes por el grupo
        const existingAssignment = items.find(i => i.name.toLowerCase() === finalName.toLowerCase());
        const historicalAssignment = activities.find(a => a.itemName?.toLowerCase() === finalName.toLowerCase() && a.category);
        const fastCategory = getInstantCategory(finalName);
        
        let analysis: any;
        if (fastCategory) {
          addLog("Categoría instantánea detectada...");
          analysis = { category: fastCategory.category, priorityLevel: fastCategory.priorityLevel };
        } else if (existingAssignment) {
          addLog("Usando pasillo de la lista actual...");
          analysis = { category: existingAssignment.category, priorityLevel: existingAssignment.priority };
        } else if (historicalAssignment) {
          addLog("Recuperando pasillo del historial...");
          analysis = { category: historicalAssignment.category, priorityLevel: 'medium' };
        }
        
        const itemData = {
          listId: finalId,
          familyId: profile.familyId,
          name: finalName,
          quantity: finalQty || '1',
          category: analysis?.category || 'Otros',
          priority: (analysis?.priorityLevel === 'high' ? 'high' : 'medium') as 'high' | 'medium',
          checked: false,
          addedBy: profile.displayName || 'Usuario',
          createdAt: serverTimestamp()
        };

        // MOSTRAR AL INSTANTE (Modo Optimista local)
        const tempId = 'temp-item-' + Date.now();
        const visualItem = { id: tempId, ...itemData } as any;
        setItems(prev => {
          if (prev.some(i => i.name === finalName && i.listId === finalId)) return prev;
          return [visualItem, ...prev];
        });
        
        // GUARDAR EN NUBE DE INMEDIATO
        const docRef = await addDoc(itemsCollection, itemData);
        if (!silent) addNotification(`${finalName} añadido`, 'success');
        
        // ANALIZAR EN SEGUNDO PLANO SI NO HABÍA CACHÉ
        if (!analysis || analysis.category === 'Otros') {
          (async () => {
            try {
              const result = await analyzeItem(finalName);
              if (result && result.category && result.category !== 'Otros') {
                await updateDoc(doc(db, 'items', docRef.id), { 
                   category: result.category,
                   priority: (result.priorityLevel === 'high' ? 'high' : 'medium')
                });
                console.log(`IA fondo: ${finalName} -> ${result.category}`);
              }
            } catch (bgError) {
              console.error("Error en análisis de fondo:", bgError);
            }
          })();
        }

        addLog(`Nube OK: ${docRef.id.substring(0,5)}`);
        await logActivity('add', finalName, itemData.category);
        
        if (newItemName === name) {
          setNewItemName('');
          setNewItemQty('1');
        }
      } catch (e: any) {
        addLog(`Error nube: ${e.code || 'local'}`);
      } finally {
        setIsAdding(false);
      }
    };

    // SISTEMA DE ALERTA DE DUPLICADOS (Usando diálogo personalizado)
    const isDuplicate = items.some(i => 
      i.name.toLowerCase() === capitalizedName.toLowerCase() && 
      i.listId === listToUse &&
      !i.checked 
    );

    if (isDuplicate) {
      setPromptConfig({
        isOpen: true,
        type: 'confirm',
        title: "Producto Duplicado",
        description: `"${capitalizedName}" ya está en tu lista actual sin marcar. ¿Seguro que quieres agregarlo de todas formas?`,
        initialValue: '',
        onConfirm: () => {
          setPromptConfig(prev => ({ ...prev, isOpen: false }));
          proceedWithAdd(capitalizedName, qty, listToUse);
        }
      });
      return;
    }

    proceedWithAdd(capitalizedName, qty, listToUse);
  };

  const toggleItem = async (item: GroceryItem) => {
    await updateDoc(doc(db, 'items', item.id), { checked: !item.checked });
    if (!item.checked) await logActivity('check', item.name);
  };

  const updateItemCategory = async (item: GroceryItem, newCategory: string) => {
    if (!newCategory || !newCategory.trim()) {
      setPromptConfig(prev => ({ ...prev, isOpen: false }));
      return;
    }
    await updateDoc(doc(db, 'items', item.id), { category: newCategory.trim() });
    setPromptConfig(prev => ({ ...prev, isOpen: false }));
  };

  const updateItemName = async (item: GroceryItem, newName: string) => {
    if (!newName || !newName.trim()) {
      setPromptConfig(prev => ({ ...prev, isOpen: false }));
      return;
    }
    await updateDoc(doc(db, 'items', item.id), { name: newName.trim() });
    setPromptConfig(prev => ({ ...prev, isOpen: false }));
  };

  const updateItemQty = async (item: GroceryItem, newQty: string) => {
    if (!newQty || !newQty.trim()) {
      setPromptConfig(prev => ({ ...prev, isOpen: false }));
      return;
    }
    await updateDoc(doc(db, 'items', item.id), { quantity: newQty.trim() });
    setPromptConfig(prev => ({ ...prev, isOpen: false }));
  };

  const renameCategory = async (oldCategory: string, newName: string) => {
    if (!newName || !newName.trim() || newName === oldCategory) {
      setPromptConfig(prev => ({ ...prev, isOpen: false }));
      return;
    }
    
    const batch = writeBatch(db);
    items
      .filter(item => item.category === oldCategory)
      .forEach(item => {
        batch.update(doc(db, 'items', item.id), { category: newName.trim() });
      });
    await batch.commit();
    setPromptConfig(prev => ({ ...prev, isOpen: false }));
  };

  const togglePriority = async (item: GroceryItem) => {
    const newPriority = item.priority === 'high' ? 'medium' : 'high';
    await updateDoc(doc(db, 'items', item.id), { priority: newPriority });
  };

  const deleteItem = async (item: GroceryItem) => {
    await deleteDoc(doc(db, 'items', item.id));
    await logActivity('delete', item.name);
  };

  const clearChecked = async () => {
    const checkedItems = items.filter(i => i.checked);
    const batch = writeBatch(db);
    checkedItems.forEach(i => batch.delete(doc(db, 'items', i.id)));
    await batch.commit();
    await logActivity('clear', `${checkedItems.length} productos`);
  };

  const activeCategories = useMemo(() => {
    const cats = new Set(items.map(i => i.category));
    return Array.from(cats).sort();
  }, [items]);

  const activeList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);
  
  const groupedItems = useMemo(() => {
    const filtered = items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groups: Record<string, GroceryItem[]> = {};
    filtered.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    
    // Sort items within each group: unchecked first
    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => (Number(a.checked) - Number(b.checked)));
    });
    
    // Sort groups: groups with pending items first, then alphabet
    return Object.fromEntries(
      Object.entries(groups).sort(([catA, itemsA], [catB, itemsB]) => {
        const pendingA = itemsA.some(i => !i.checked) ? 0 : 1;
        const pendingB = itemsB.some(i => !i.checked) ? 0 : 1;
        if (pendingA !== pendingB) return pendingA - pendingB;
        return catA.localeCompare(catB);
      })
    );
  }, [items, searchQuery]);

  const createNewList = async (name: string) => {
    if (!name.trim() || !profile) return;
    try {
      addLog(`Creando lista: ${name}...`);
      const newListData = { 
        name: name.trim(), 
        color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][Math.floor(Math.random() * 5)], 
        familyId: profile.familyId, 
        isArchived: false, 
        createdAt: serverTimestamp() 
      };
      const docRef = await addDoc(listsCollection, newListData);
      setActiveListId(docRef.id);
      addLog("Lista creada con éxito.");
      setPromptConfig(prev => ({ ...prev, isOpen: false }));
    } catch (e: any) {
      addLog(`Error al crear lista: ${e.code}`);
      alert("No se pudo crear la lista. Revisa tu conexión.");
    }
  };

  const joinFamily = async (code?: string) => {
    const familyCode = code || '';
    if (familyCode && profile) {
      try {
        addLog(`Uniéndose a grupo: ${familyCode.substring(0,5)}...`);
        await updateDoc(doc(db, 'users', profile.uid), { familyId: familyCode.trim() });
        setProfile(prev => prev ? { ...prev, familyId: familyCode.trim() } : null);
        setActiveListId(null); // Reset to allow first list of new family to be selected
        addLog("Éxito: ID de grupo actualizado.");
        setPromptConfig(prev => ({ ...prev, isOpen: false }));
      } catch (e: any) {
        addLog(`Error al unirse: ${e.code}`);
        alert("No se pudo actualizar el ID. Revisa tu conexión.");
      }
    }
  };

  const handleCreateListPrompt = () => {
    setPromptConfig({
      isOpen: true,
      title: 'Nueva Lista',
      description: 'Dile un nombre a tu nueva lista de compras grupal.',
      initialValue: '',
      placeholder: 'Ej: Compras del Mes, Asado, Limpieza...',
      onConfirm: (val) => createNewList(val)
    });
  };

  const deleteList = async (listId: string) => {
    try {
      const listName = lists.find(l => l.id === listId)?.name || 'una lista';
      addLog(`Borrando lista: ${listId}...`);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'lists', listId));
      items.filter(i => i.listId === listId).forEach(item => {
        batch.delete(doc(db, 'items', item.id));
      });
      await batch.commit();
      
      await logActivity('delete', `Lista: ${listName}`);
      
      if (activeListId === listId) {
        setActiveListId(lists.find(l => l.id !== listId)?.id || null);
      }
      addLog("Lista borrada con éxito.");
      setPromptConfig(prev => ({ ...prev, isOpen: false }));
    } catch (e: any) {
      addLog(`Error al borrar lista: ${e.code}`);
    }
  };

  const handleConfirmDeleteList = (list: ShoppingList) => {
    if (lists.length <= 1) {
      alert("No puedes borrar tu única lista.");
      return;
    }
    setPromptConfig({
      isOpen: true,
      title: '¿Eliminar lista?',
      description: `Esto borrará permanentemente "${list.name}" y todos sus productos.`,
      initialValue: '',
      type: 'confirm',
      onConfirm: () => deleteList(list.id)
    });
  };

  const handleRenameListPrompt = (list: ShoppingList) => {
    setPromptConfig({
      isOpen: true,
      title: 'Editar Nombre',
      description: `Cambia el nombre de "${list.name}"`,
      initialValue: list.name,
      onConfirm: async (val) => {
        if (!val.trim() || val === list.name) {
          setPromptConfig(prev => ({ ...prev, isOpen: false }));
          return;
        }
        await updateDoc(doc(db, 'lists', list.id), { name: val.trim() });
        setPromptConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleJoinFamilyPrompt = () => {
    setPromptConfig({
      isOpen: true,
      title: 'Unirse a otro grupo',
      description: 'Pega aquí el código que te pasó tu pareja para compartir la misma lista.',
      initialValue: '',
      placeholder: 'Ej: ABC123DEF...',
      onConfirm: (val) => joinFamily(val)
    });
  };

  useEffect(() => {
    if (promptConfig.isOpen && promptConfig.type === 'quantity') {
      setTimeout(() => {
        const select = document.getElementsByName('promptInput')[0] as HTMLSelectElement;
        if (select && select.showPicker) {
          try {
            select.showPicker();
          } catch (e) {
            console.log('showPicker not supported or blocked', e);
          }
        }
      }, 300);
    }
  }, [promptConfig.isOpen, promptConfig.type]);

  if (isInitializing) return (
    <div className="min-h-screen grid place-items-center bg-bg text-center">
      <div className="space-y-4">
        <RefreshCw className="animate-spin text-accent mx-auto w-10 h-10" />
        <p className="text-text-secondary font-medium">{statusMessage || "Iniciando SincroLista..."}</p>
      </div>
    </div>
  );

  if (!user || !profile) return (
    <AuthWall 
      onLogin={handleLogin} 
      onGoogleLogin={(code) => handleGoogleLogin(code)}
      onReset={handleResetSession} 
      isLoading={isLoggingIn} 
      status={statusMessage}
      logs={debugLogs}
      onDemo={handleDemoMode}
      initialInviteCode={inviteCodeFromUrl}
    />
  );

  return (
    <div className={cn("min-h-[100dvh] bg-bg transition-colors duration-500", shoppingMode && "bg-gray-950")}>
      
      {/* Mobile Header Overlay */}
      <div className={cn(
        "lg:hidden fixed inset-0 z-[200] bg-black/60 transition-opacity",
        isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )} onClick={() => setIsSidebarOpen(false)} />

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row min-h-[100dvh] relative">
        
        {/* Sidebar */}
        <aside className={cn(
          "fixed lg:sticky top-0 left-0 z-[210] h-[100dvh] w-[280px] bg-white border-r border-border p-6 transition-transform flex flex-col shrink-0 overflow-y-auto scrollbar-hide",
          shoppingMode && "lg:opacity-40 lg:pointer-events-none",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-accent rounded-xl grid place-items-center shadow-lg shadow-accent/20">
              <ShoppingBasket className="text-white w-6 h-6" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-text-main">SincroLista</h1>
          </div>

          <div className="flex-grow space-y-8 pb-4">
            {/* List Selector */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-2">
                  <Layout className="w-3 h-3" /> Mis Listas
                </h3>
                <button 
                  onClick={handleCreateListPrompt} 
                  className="text-accent p-1 hover:bg-accent-light rounded-md transition-colors"
                  title="Nueva Lista"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {lists.map(l => (
                  <div key={l.id} className="group/list relative">
                    <button 
                      onClick={() => { setActiveListId(l.id); setCurrentView('list'); setIsSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all pr-12",
                        currentView === 'list' && activeListId === l.id ? "bg-accent text-white shadow-md shadow-accent/20" : "hover:bg-gray-50 text-text-secondary"
                      )}
                    >
                      <div className={cn("w-2 h-2 rounded-full shrink-0", activeListId === l.id ? "bg-white" : "")} style={{ backgroundColor: activeListId === l.id ? undefined : l.color }} />
                      <span className="text-sm font-semibold truncate">{l.name}</span>
                    </button>
                    
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/list:opacity-100 transition-opacity">
                      <button 
                         onClick={(e) => { e.stopPropagation(); handleRenameListPrompt(l); }}
                         className={cn("p-1.5 rounded-lg transition-colors", activeListId === l.id ? "text-white/70 hover:text-white hover:bg-white/10" : "text-gray-300 hover:text-accent hover:bg-accent/5")}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button 
                         onClick={(e) => { e.stopPropagation(); handleConfirmDeleteList(l); }}
                         className={cn("p-1.5 rounded-lg transition-colors", activeListId === l.id ? "text-white/70 hover:text-red-200 hover:bg-red-400/20" : "text-gray-300 hover:text-red-500 hover:bg-red-50")}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Explora */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3 flex items-center gap-2">
                <Compass className="w-3 h-3" /> Explorar
              </h3>
              <div className="space-y-1">
                <button 
                  onClick={() => { setCurrentView('stores'); setActiveListId(null); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                    currentView === 'stores' ? "bg-accent text-white shadow-md shadow-accent/20" : "hover:bg-gray-50 text-text-secondary"
                  )}
                >
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm font-semibold">Supermercados</span>
                </button>
              </div>
            </div>

            {/* Activities */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3 flex items-center gap-2">
                <History className="w-3 h-3" /> Actividad
              </h3>
              <div className="space-y-4 max-h-[300px] overflow-y-auto scrollbar-hide pr-2">
                {activities.slice(0, 10).map(a => {
                  const user = syncedUsers.find(u => u.uid === a.userId);
                  const userName = user?.uid === profile?.uid ? 'Tú' : (user?.displayName.split(' ')[0] || 'Alguien');
                  const date = a.timestamp?.toDate ? a.timestamp.toDate() : (a.timestamp ? new Date(a.timestamp) : null);
                  const timeStr = date ? date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
                  const dateStr = date ? date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '';
                  
                  const labels: any = { add: 'Agregó', check: 'Marcó', delete: 'Eliminó', clear: 'Limpió' };

                  return (
                    <div key={a.id} className="text-[11px] leading-tight flex flex-col space-y-0.5 border-l-2 border-accent/10 hover:border-accent/30 pl-3 transition-colors py-0.5">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-text-main text-[10px] uppercase tracking-tighter">
                          {labels[a.type] || a.type}
                        </span>
                        <span className="text-[8px] text-text-secondary font-mono">
                          {dateStr} {timeStr}
                        </span>
                      </div>
                      <div className="text-text-secondary truncate font-medium">{a.itemName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {user?.photoURL && <img src={user.photoURL} className="w-3 h-3 rounded-full border border-gray-100" />}
                        <span className="text-[9px] font-black text-accent uppercase tracking-widest">
                          {userName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-2 pb-8">
            <button 
              onClick={() => { setIsSettingsOpen(true); setIsSidebarOpen(false); }} 
              className="w-full flex items-center gap-3 px-3 py-2.5 text-text-secondary hover:bg-gray-50 rounded-xl transition-colors font-semibold text-sm group"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 border border-border">
                <img src={profile?.photoURL} className="w-full h-full object-cover" />
              </div>
              <div className="flex-grow text-left">
                <p className="leading-none text-text-main">Mi Perfil</p>
                <p className="text-[10px] text-text-secondary mt-0.5">Configuración</p>
              </div>
              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-grow min-w-0 relative overflow-visible">
          
          {currentView === 'stores' ? (
            <StoresView onOpenMenu={() => setIsSidebarOpen(true)} />
          ) : (
            <>
              {/* Header & Search Persistent - Sticky on Mobile */}
              <div className={cn(
                "sticky top-0 z-[100] transition-all duration-300 lg:static lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:mx-0 lg:border-none",
                isScrolled 
                  ? "bg-white/95 backdrop-blur-md p-3 px-4 border-b border-border shadow-md -mx-4 md:-mx-8" 
                  : "bg-transparent p-4 md:p-8 lg:p-12 pb-6"
              )}>
            {/* Top Bar Mobile (Hides on scroll to save space) */}
            <motion.div 
               animate={{ 
                 height: isScrolled ? 0 : 'auto', 
                 opacity: isScrolled ? 0 : 1,
                 marginBottom: isScrolled ? 0 : 16,
                 scale: isScrolled ? 0.95 : 1
               }}
               className="lg:hidden flex items-center justify-between gap-2 overflow-hidden transition-all duration-300 transform-gpu"
            >
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-white border border-border rounded-xl shadow-sm active:scale-95 transition-all">
                <Menu className="w-5 h-5 text-text-main" />
              </button>
              <div className="flex-grow text-center px-2 leading-tight">
                <h2 className={cn("text-base font-black truncate", shoppingMode && "text-white")}>{activeList?.name}</h2>
                <p className="text-[9px] text-accent uppercase font-black tracking-widest">Sincrolista</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShoppingMode(!shoppingMode)} className={cn("p-2 rounded-xl shadow-sm border transition-all active:scale-95", shoppingMode ? "bg-accent text-white border-accent" : "bg-white border-border text-text-secondary")}>
                  <Zap className="w-5 h-5" />
                </button>
              </div>
            </motion.div>

            <header className="hidden lg:flex items-center justify-between mb-8">
              <div className="flex flex-col">
                <h2 className={cn("text-3xl font-black tracking-tighter transition-colors", shoppingMode ? "text-white" : "text-text-main")}>
                  {activeList?.name || 'Cargando...'}
                </h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex -space-x-1 mr-2">
                     {syncedUsers.map(u => (
                       <img 
                         key={u.uid} 
                         src={u.photoURL} 
                         title={u.displayName}
                         className="w-5 h-5 rounded-full border-2 border-white shadow-sm ring-1 ring-black/5" 
                       />
                     ))}
                  </div>
                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">
                    {syncedUsers.length} en línea
                  </span>
                  <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="ml-2 p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-text-secondary"
                    title="Configuración de Equipo"
                  >
                    <Users className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setShoppingMode(!shoppingMode)}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg active:scale-95",
                  shoppingMode 
                    ? "bg-white border border-border text-text-main hover:bg-gray-50 shadow-black/5" 
                    : "bg-accent text-white shadow-accent/40"
                )}
              >
                <Zap className={cn("w-3.5 h-3.5", shoppingMode ? "text-accent fill-accent" : "fill-current")} />
                {shoppingMode ? 'Terminar' : 'Modo Tienda'}
              </button>
            </header>

            {/* In-header Search bar for persistence */}
            <div className="flex items-center gap-2 w-full max-w-2xl mx-auto">
              <div className="relative group flex-grow">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-accent transition-all">
                  <Search className="w-4 h-4" />
                </div>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      addItem(searchQuery);
                      setSearchQuery('');
                    }
                  }}
                  placeholder="Busca o agrega productos..."
                  className="w-full h-11 bg-white border border-border rounded-2xl pl-11 pr-4 font-bold text-sm text-text-main placeholder:text-gray-400 focus:ring-4 focus:ring-accent/10 focus:border-accent outline-none transition-all shadow-sm shadow-black/5"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                  >
                    <Plus className="w-4 h-4 rotate-45" strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 md:p-8 lg:p-12 pt-0 space-y-8 pb-32">

          {/* Shopping Progress Bar */}
          {shoppingMode && items.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2 lg:mt-4"
            >
              <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-widest text-gray-400">
                <span>Progreso de compra</span>
                <span>{Math.round((items.filter(i => i.checked).length / items.length) * 100)}%</span>
              </div>
              <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(items.filter(i => i.checked).length / items.length) * 100}%` }}
                  className="h-full bg-accent"
                />
              </div>
            </motion.div>
          )}

          {/* Suggestions Bar */}
          <div className="space-y-4">
            {!shoppingMode && (
            <motion.div 
               animate={{ height: searchQuery ? 0 : 'auto', opacity: searchQuery ? 0 : 1, marginBottom: searchQuery ? 0 : 16 }}
               className="overflow-hidden"
            >
              <div className="space-y-2">

              <div className="flex items-center justify-between text-text-secondary">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 text-accent" />
                  <p className="text-[10px] font-black uppercase tracking-widest leading-none">
                    {activities.length < 5 
                      ? "Sugerencias:" 
                      : "Suele comprar:"}
                  </p>
                </div>
                {recommendations.length === 0 && !isFetchingRecs && (
                  <button 
                    onClick={() => fetchRecommendations()}
                    className="text-[9px] font-bold text-accent hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className={cn("w-2.5 h-2.5", isFetchingRecs && "animate-spin")} /> Reintentar
                  </button>
                )}
              </div>
              
              {recommendations.length > 0 ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex overflow-x-auto gap-1.5 pb-1 scrollbar-none">
                  <AnimatePresence mode="popLayout">
                    {recommendations.slice(0, 8).map(rec => (
                      <motion.button 
                        key={rec}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => {
                          addItem(rec);
                          setRecommendations(prev => prev.filter(r => r !== rec));
                        }}
                        className="shrink-0 bg-white border border-border px-3 py-1.5 rounded-lg text-[10px] font-bold text-text-main hover:border-accent hover:text-accent hover:bg-accent/5 transition-all flex items-center gap-1.5 shadow-xs active:scale-95"
                      >
                        <Plus className="w-3 h-3" /> {rec}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </motion.div>
              ) : (
                isFetchingRecs && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-2 h-2 rounded-full bg-accent animate-ping" />
                    <span className="text-[10px] text-gray-400 font-medium italic">Consultando a la IA...</span>
                  </div>
                )
              )}
            </div>
          </motion.div>
          )}
        </div>

        {/* Grid of items with better containment */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3 auto-rows-min">
            <AnimatePresence mode="popLayout">
              {(Object.entries(groupedItems) as [string, GroceryItem[]][]).map(([category, catItems]) => {
                const isCompleted = catItems.length > 0 && catItems.every(i => i.checked);
                
                return (
                  <motion.div 
                    layout
                    key={category}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={cn(
                      "category-card break-inside-avoid transition-all duration-500",
                      shoppingMode ? "bg-gray-900 border-gray-800 shadow-none ring-1 ring-white/5" : "bg-white",
                      isCompleted && "opacity-60 saturate-50 grayscale-[0.3]"
                    )}
                  >
                <div className="flex items-center justify-between mb-4 pb-1 border-b border-border/50">
                  <button 
                    onClick={() => {
                      setPromptConfig({
                        isOpen: true,
                        title: `Renombrar Pasillo`,
                        description: `Estás renombrando "${category}". Esto moverá todos sus productos al nuevo pasillo.`,
                        initialValue: category,
                        onConfirm: (val) => renameCategory(category, val)
                      });
                    }}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  >
                     <Tag className={cn("w-3 h-3", shoppingMode ? "text-accent" : "text-text-secondary")} />
                     <h4 className={cn("text-[10px] font-black uppercase tracking-widest", shoppingMode ? "text-gray-400" : "text-text-secondary")}>{category}</h4>
                  </button>
                  <div className="flex items-center gap-2">
                    {isCompleted && (
                      <span className="text-[8px] font-black text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-md uppercase tracking-widest animate-in fade-in slide-in-from-right-1">
                        ¡Listo!
                      </span>
                    )}
                    <span className="text-[9px] font-black tabular-nums bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded-md border border-border">{catItems.length}</span>
                  </div>
                </div>
                  <div className="space-y-1">
                    {catItems.map(item => (
                      <ItemRow 
                        key={item.id} 
                        item={item} 
                        onToggle={() => toggleItem(item)} 
                        onDelete={() => deleteItem(item)} 
                        onEdit={() => {
                          setPromptConfig({
                            isOpen: true,
                            title: `Editar "${item.name}"`,
                            description: "Cambia el nombre o mueve a otro pasillo:",
                            initialValue: item.name,
                            onConfirm: (val) => updateItemName(item, val),
                            onCategorySelect: (cat) => updateItemCategory(item, cat)
                          });
                        }}
                        onTogglePriority={() => togglePriority(item)}
                        onUpdateCategory={() => {}} // Not used anymore but kept for prop consistency if needed
                        onUpdateQty={() => {
                          setPromptConfig({
                            isOpen: true,
                            title: `Cantidad para "${item.name}"`,
                            description: "Cambia la cantidad del producto:",
                            initialValue: item.quantity,
                            type: 'quantity',
                            onConfirm: (val) => updateItemQty(item, val)
                          });
                        }}
                        shoppingMode={shoppingMode} 
                      />
                    ))}
                  </div>
                </motion.div>
              )})}
            </AnimatePresence>
          </div>

          {items.length === 0 && (
              <div className="py-24 text-center space-y-4">
                <div className="opacity-30">
                  <ShoppingBasket className="w-16 h-16 mx-auto mb-4 text-accent" />
                  <p className="text-lg font-black text-text-main">La lista está vacía</p>
                  <p className="text-xs text-text-secondary font-medium">Agrega productos usando el campo de abajo</p>
                </div>
              </div>
          )}

          {/* Sticky Input Area inside Main for proper centering */}
          {!shoppingMode && (
            <div className="fixed bottom-0 left-0 lg:left-[280px] right-0 p-3 lg:p-6 z-40 flex justify-center pointer-events-none pb-[env(safe-area-inset-bottom,12px)]">
              <div className="w-full max-w-xl pointer-events-auto">
                 <form 
                   onSubmit={(e) => { e.preventDefault(); addItem(newItemName, newItemQty); }}
                   className={cn(
                     "bg-white/95 backdrop-blur-2xl border border-border shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] rounded-3xl p-1.5 flex items-center gap-2 ring-1 ring-black/5 transition-all focus-within:ring-accent/30 focus-within:ring-4",
                     isAdding && "ring-pulse"
                   )}
                 >
                   <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 border border-border/50">
                      {isAdding ? <RefreshCw className="w-4 h-4 text-accent animate-spin" /> : <Plus className="w-4 h-4 text-gray-400" />}
                   </div>
                   <input 
                     value={newItemName}
                     onChange={e => setNewItemName(e.target.value)}
                     placeholder="¿Qué Falta?"
                     className="flex-grow min-w-0 bg-transparent border-none outline-none px-2 text-sm font-bold text-text-main placeholder:text-gray-400 placeholder:font-medium"
                     disabled={isAdding}
                   />
                   <VoiceInputButton onItemsFound={handleVoiceItems} onStatusChange={(msg, type) => addNotification(msg, type)} />
                   <div className="flex items-center bg-gray-100 rounded-xl px-2 py-1.5 border border-border/50 shrink-0 relative transition-colors focus-within:bg-gray-200">
                     <span className="text-[8px] font-black text-gray-400 uppercase mr-1 hidden min-[400px]:inline">Cant</span>
                     <div className="relative flex items-center">
                       <select 
                         value={newItemQty}
                         onChange={e => setNewItemQty(e.target.value)}
                         className="bg-transparent border-none font-black text-xs outline-none text-text-main cursor-pointer appearance-none pr-4 py-0"
                         disabled={isAdding}
                       >
                         {[1,2,3,4,5,6,7,8,9,10].map(n => (
                           <option key={n} value={String(n)}>{n}</option>
                         ))}
                       </select>
                       <ChevronDown className="w-3 h-3 text-gray-400 absolute right-0 pointer-events-none" />
                     </div>
                   </div>
                   <button 
                     type="submit"
                     disabled={!newItemName.trim() || isAdding}
                     className="bg-accent text-white p-3 rounded-2xl hover:scale-[1.05] active:scale-[0.95] transition-all shadow-lg shadow-accent/40 disabled:opacity-50 disabled:grayscale disabled:scale-100"
                   >
                     <Check className="w-5 h-5" strokeWidth={3} />
                   </button>
                 </form>
              </div>
            </div>
          )}
          </div>
        </>
      )}
    </main>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <motion.div 
             initial={{ opacity: 0 }} 
             animate={{ opacity: 1 }} 
             exit={{ opacity: 0 }}
             onClick={() => setIsSettingsOpen(false)}
             className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
          >
            <div className="p-6 pb-0 flex items-center justify-between">
              <h2 className="text-xl font-black tracking-tight text-text-main">Configuración</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 hover:bg-gray-50 rounded-xl transition-colors"
                title="Cerrar"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8 scrollbar-none">
              {/* Profile Header */}
              <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-border">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-200 shadow-lg ring-4 ring-white shrink-0">
                  <img src={profile?.photoURL} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-text-main leading-none">{profile?.displayName}</h3>
                  <p className="text-xs text-text-secondary font-medium mt-1.5 flex items-center gap-1.5">
                    {profile?.email ? profile.email : "Invitado"}
                  </p>
                </div>
              </div>

              {/* Equipo Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
                    <Users className="w-3 h-3" /> Equipo Actual
                  </h4>
                  {syncedUsers.length === 1 && (
                    <span className="text-[9px] font-black text-accent bg-accent/5 px-2 py-0.5 rounded-full uppercase">Tú solo</span>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {syncedUsers.map(u => (
                    <div key={u.uid} className="flex items-center gap-2 bg-white border border-border rounded-xl px-2.5 py-1.5 shadow-xs">
                      <img src={u.photoURL} className="h-5 w-5 rounded-full border border-gray-100 ring-1 ring-black/5" />
                      <span className="text-[10px] font-bold text-text-main truncate max-w-[100px]">{u.displayName}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-accent/5 border border-dashed border-accent/20 rounded-2xl p-5 space-y-4">
                  <p className="text-[10px] font-black text-accent uppercase tracking-widest text-center">Invitar a alguien</p>
                  <CopyCodeComponent code={profile?.familyId || ''} />
                  <p className="text-[10px] text-text-secondary text-center leading-relaxed px-4">
                    Comparte este código para que otra persona vea tus mismas listas en tiempo real.
                  </p>

                  <div className="pt-2">
                    <button 
                      onClick={() => { setIsSettingsOpen(false); handleJoinFamilyPrompt(); }}
                      className="w-full py-3 bg-white border border-border text-[11px] font-black uppercase tracking-widest text-text-main hover:bg-gray-50 rounded-xl transition-all shadow-xs active:scale-95"
                    >
                      Unirse a otro grupo
                    </button>
                  </div>
                </div>
              </div>

              {/* Account Actions */}
              <div className="pt-4 border-t border-border space-y-4">
                <button 
                  onClick={() => auth.signOut()} 
                  className="w-full flex items-center justify-center gap-3 py-4 text-red-500 bg-red-50 hover:bg-red-100 rounded-2xl transition-colors font-black text-xs uppercase tracking-widest"
                >
                  <LogOut className="w-4 h-4" /> Cerrar Sesión
                </button>
                <div className="text-center space-y-1">
                   <p className="text-[9px] text-text-secondary font-black uppercase tracking-tighter">SincroLista Stabilized Build</p>
                   <p className="text-[8px] text-text-secondary/50 font-mono italic">v2.1.3 • AI Powered</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Custom Dialog / Prompt */}
      {promptConfig.isOpen && (
        <div className="fixed inset-0 z-[300] grid place-items-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setPromptConfig(prev => ({ ...prev, isOpen: false }))}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[32px] p-8 w-full max-w-sm relative z-10 shadow-2xl border border-border"
          >
            <h3 className="text-xl font-black text-text-main mb-2">{promptConfig.title}</h3>
            {promptConfig.description && <p className="text-xs font-semibold text-text-secondary mb-6">{promptConfig.description}</p>}
            
            {(promptConfig.title.toLowerCase().includes('pasillo') || promptConfig.onCategorySelect) && (
              <div className="mb-6 space-y-2">
                <div className="relative">
                  <button 
                    onClick={() => setShowCategories(!showCategories)}
                    className="w-full flex items-center justify-between p-3.5 bg-gray-50 border border-border rounded-xl text-[13px] font-bold text-text-main hover:border-accent transition-all group shadow-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <ArrowRightLeft className="w-4 h-4 text-accent" />
                      <span>Cambiar a otro pasillo...</span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-text-secondary transition-transform duration-300", showCategories && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {showCategories && (
                      <>
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-40 bg-transparent"
                          onClick={() => setShowCategories(false)}
                        />
                        <motion.div 
                          initial={{ height: 0, opacity: 0, scale: 0.95 }}
                          animate={{ height: "auto", opacity: 1, scale: 1 }}
                          exit={{ height: 0, opacity: 0, scale: 0.95 }}
                          className="absolute left-0 right-0 top-full mt-2 z-50 bg-white border border-border rounded-2xl shadow-xl overflow-hidden origin-top"
                        >
                          <div className="max-h-[300px] overflow-y-auto scrollbar-hide py-2">
                            {/* Pasillos Activos */}
                            {activeCategories.filter(c => c !== 'Otros' && c !== 'Otro').length > 0 && (
                              <div className="px-2 pb-1">
                                <p className="px-3 py-2 text-[10px] font-black uppercase text-text-secondary tracking-widest opacity-40">Pasillos en esta lista</p>
                                {activeCategories.filter(c => c !== 'Otros' && c !== 'Otro').map(cat => (
                                  <button
                                    key={cat}
                                    type="button"
                                    onClick={() => {
                                      if (promptConfig.onCategorySelect) {
                                        promptConfig.onCategorySelect(cat);
                                        setPromptConfig(prev => ({ ...prev, isOpen: false }));
                                        setShowCategories(false);
                                      } else {
                                        promptConfig.onConfirm(cat);
                                        setShowCategories(false);
                                      }
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/5 transition-colors text-[13px] font-bold text-text-main rounded-xl group"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent/20 group-hover:bg-accent" />
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Pasillos Sugeridos */}
                            <div className="px-2 pt-1 border-t border-border mt-1">
                              <p className="px-3 py-2 text-[10px] font-black uppercase text-text-secondary tracking-widest opacity-40">Sugerencias (Nuevo)</p>
                              {COMMON_CATEGORIES.filter(c => !activeCategories.includes(c) && c !== 'Otros' && c !== 'Otro').map(cat => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => {
                                    if (promptConfig.onCategorySelect) {
                                      promptConfig.onCategorySelect(cat);
                                      setPromptConfig(prev => ({ ...prev, isOpen: false }));
                                      setShowCategories(false);
                                    } else {
                                      promptConfig.onConfirm(cat);
                                      setShowCategories(false);
                                    }
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/5 transition-colors text-[13px] font-bold text-text-main rounded-xl group"
                                >
                                  <FolderPlus className="w-4 h-4 text-accent/40 group-hover:text-accent" />
                                  {cat}
                                </button>
                              ))}

                              {/* Opción Otro para escribir personalizado */}
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCategories(false);
                                  // Cerramos el prompt actual y abrimos uno nuevo para el pasillo
                                  const currentOnCategorySelect = promptConfig.onCategorySelect;
                                  const currentOnConfirm = promptConfig.onConfirm;
                                  
                                  // Pequeño delay para que la animación de cierre del dropdown no interfiera
                                  setTimeout(() => {
                                    setPromptConfig({
                                      isOpen: true,
                                      title: "Nuevo Pasillo",
                                      description: "Escribe el nombre del pasillo personalizado:",
                                      initialValue: "",
                                      onConfirm: (customCat) => {
                                        if (customCat.trim()) {
                                          if (currentOnCategorySelect) {
                                            currentOnCategorySelect(customCat.trim());
                                          } else {
                                            currentOnConfirm(customCat.trim());
                                          }
                                        }
                                      }
                                    });
                                  }, 100);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/5 transition-colors text-[13px] font-bold text-accent rounded-xl group mt-1 bg-accent/5"
                              >
                                <Plus className="w-4 h-4" />
                                <span>Otro (Escribir pasillo...)</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <form onSubmit={(e) => {
              e.preventDefault();
              if (promptConfig.type === 'confirm') {
                promptConfig.onConfirm('');
              } else {
                const input = (e.target as any).elements.promptInput;
                promptConfig.onConfirm(input.value);
              }
            }}>
              {promptConfig.type === 'quantity' ? (
                <div className="flex items-center justify-center bg-gray-50 border border-border rounded-2xl p-6 mb-8 shadow-inner relative">
                  <span className="text-[10px] font-black text-gray-400 uppercase mr-4 tracking-widest">Seleccionar</span>
                  <div className="relative flex items-center group">
                    <select 
                      autoFocus
                      name="promptInput"
                      defaultValue={promptConfig.initialValue}
                      className="bg-transparent border-none font-black text-4xl outline-none text-accent cursor-pointer appearance-none pr-10 py-1 transition-all"
                    >
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <option key={n} value={String(n)} className="text-text-main text-lg">{n}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-6 h-6 text-accent absolute right-0 pointer-events-none group-hover:scale-110 transition-transform" />
                  </div>
                </div>
              ) : (
                promptConfig.type !== 'confirm' && (
                  <input 
                    autoFocus
                    name="promptInput"
                    defaultValue={promptConfig.initialValue}
                    placeholder={promptConfig.placeholder || "Escribe aquí..."}
                    className="w-full bg-gray-50 border border-border rounded-2xl px-5 py-4 font-bold text-text-main focus:ring-4 focus:ring-accent/10 focus:border-accent outline-hidden mb-6"
                  />
                )
              )}
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setPromptConfig(prev => ({ ...prev, isOpen: false }))}
                  className="flex-grow py-4 px-6 rounded-2xl font-bold bg-gray-100 text-text-secondary hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-grow py-4 px-6 rounded-2xl font-bold bg-accent text-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-accent/30"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <style>{`
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      
      <ToastContainer 
        notifications={notifications} 
        onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} 
      />
    </div>
  );
}

// --- Subcomponents ---

interface ItemRowProps {
  key?: string;
  item: GroceryItem;
  onToggle: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onEdit: () => void | Promise<void>;
  onUpdateQty: () => void | Promise<void>;
  onTogglePriority: () => void | Promise<void>;
  onUpdateCategory: () => void | Promise<void>;
  shoppingMode: boolean;
}

function ItemRow({ item, onToggle, onDelete, onEdit, onUpdateQty, onTogglePriority, onUpdateCategory, shoppingMode }: ItemRowProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 p-1.5 rounded-xl transition-all grow group relative",
      item.checked && !shoppingMode && "opacity-40 grayscale-[0.5]",
      shoppingMode ? "hover:bg-gray-800/50" : "hover:bg-gray-50/80"
    )}>
      <button 
        onClick={onToggle}
        className={cn(
          "w-6 h-6 border-2 rounded-lg flex items-center justify-center transition-all shrink-0 shadow-sm",
          item.checked ? "bg-accent border-accent text-white" : shoppingMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
        )}
      >
        {item.checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      </button>
      
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-1.5">
          <button 
            onClick={onUpdateCategory}
            className={cn(
              "text-sm font-bold leading-tight truncate transition-all text-left block",
              item.checked && !shoppingMode && "line-through decoration-2",
              shoppingMode ? (item.checked ? "text-gray-600 line-through" : "text-gray-100") : "text-text-main"
            )}
          >
            {item.name}
          </button>
          <button 
            onClick={onTogglePriority}
            className="shrink-0 p-0.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {item.priority === 'high' && !item.checked ? (
              <AlertCircle className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-gray-200 opacity-0 group-hover:opacity-100" />
            )}
          </button>
        </div>
        {item.notes && <p className="text-[9px] text-text-secondary mt-0.5">{item.notes}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!shoppingMode && (
          <div className="flex items-center gap-0.5 animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={onEdit}
              className="lg:opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-100 border border-transparent hover:border-border text-gray-300 hover:text-text-main rounded-lg transition-all"
              title="Editar"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
        <button 
          onClick={onUpdateQty}
          className={cn(
            "text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest tabular-nums border hover:scale-105 active:scale-95 transition-all",
            shoppingMode ? "bg-gray-800 text-gray-400 border-gray-700" : "bg-white text-text-secondary border-border shadow-xs hover:border-accent hover:text-accent"
          )}
        >
          {item.quantity}
        </button>
        {!shoppingMode && (
          <button 
            onClick={onDelete}
            className="lg:opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-red-300 hover:text-red-500 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function AuthWall({ onLogin, onGoogleLogin, onReset, onDemo, isLoading, status, logs = [], initialInviteCode = '' }: { 
  onLogin: (name: string, code?: string) => void, 
  onGoogleLogin: (code?: string) => void,
  onReset: () => void, 
  onDemo: () => void,
  isLoading: boolean, 
  status?: string,
  logs?: string[],
  initialInviteCode?: string
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialInviteCode);
  const [showCodeInput, setShowCodeInput] = useState(!!initialInviteCode);

  return (
    <div className="min-h-screen bg-bg grid place-items-center p-6 text-center">
      <div className="max-w-sm w-full space-y-8">
        <div className="w-20 h-20 bg-accent rounded-3xl grid place-items-center shadow-2xl shadow-accent/20 rotate-6 mx-auto mb-6">
          <ShoppingBasket className="text-white w-10 h-10" />
        </div>
        
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight text-text-main leading-tight">Tu Supermercado,<br/>Sincronizado.</h1>
            <p className="text-text-secondary font-medium px-4">Gestiona las compras del hogar con tu pareja sin complicaciones técnicas.</p>
          </div>

        <form 
          onSubmit={(e) => { e.preventDefault(); onLogin(name, code); }}
          className="bg-white p-8 rounded-[32px] shadow-2xl border border-border space-y-6"
        >
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-1">Tu Nombre</label>
            <input 
              required
              disabled={isLoading}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Sofía o Carlos"
              className="w-full bg-gray-50 border border-border rounded-2xl px-5 py-4 font-bold text-text-main focus:ring-4 focus:ring-accent/10 focus:border-accent outline-hidden transition-all disabled:opacity-50"
            />
          </div>

          {showCodeInput ? (
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-1">ID de Grupo (Opcional)</label>
              <input 
                disabled={isLoading}
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Pega el código aquí si ya tienen uno"
                className="w-full bg-gray-50 border border-border rounded-2xl px-5 py-4 font-bold text-text-main focus:ring-4 focus:ring-accent/10 focus:border-accent outline-hidden transition-all disabled:opacity-50"
              />
              <p className="text-[10px] text-text-secondary mt-2 px-1">Si no tienes código, deja este campo vacío para crear un grupo nuevo.</p>
            </div>
          ) : (
            <button 
              type="button"
              disabled={isLoading}
              onClick={() => setShowCodeInput(true)}
              className="w-full py-2 text-[11px] font-black uppercase tracking-widest text-accent hover:text-accent-dark transition-colors disabled:opacity-50"
            >
              ¿Tienes un código de invitación?
            </button>
          )}

          <div className="space-y-3">
            <button 
              type="button"
              onClick={() => onGoogleLogin(code)}
              disabled={isLoading}
              className="w-full bg-text-main text-white py-4 px-6 rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-black/10 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Entrar con Google (Recomendado)
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
              <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest"><span className="bg-white px-2 text-text-secondary">O entrar como invitado</span></div>
            </div>

            <button 
              type="submit"
              disabled={!name.trim() || isLoading}
              className="w-full bg-white border border-border text-text-secondary py-3 px-6 rounded-2xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>Comenzar sin cuenta <ChevronRight className="w-4 h-4" /></>
              )}
            </button>

            {status && <p className="text-[10px] font-bold text-accent animate-pulse">{status}</p>}
          </div>
        </form>

        <div className="pt-4 border-t border-border/50">
          <button 
            onClick={onReset}
            className="text-[10px] font-bold text-text-secondary hover:text-accent flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-3 h-3" /> Reiniciar conexión
          </button>
        </div>
      </div>
    </div>
  );
}

const BIG_CHAINS = ['Lider', 'Jumbo', 'Santa Isabel', 'Unimarc', 'Tottus', 'Acuenta', 'Mayorista 10', 'Erbi', 'Oxxo', 'Ok Market'];

function StoresView({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [allStores, setAllStores] = useState<any[]>([]);
  const [filteredStores, setFilteredStores] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'big_chain' | 'others'>('all');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getTravelTime = (distanceKm: number, mode: 'car' | 'walking') => {
    // Factor de circuidad: En ciudad, la ruta real suele ser significativamente más larga que la línea recta.
    // Caminando: ~80% más (cruces, calles no directas). Auto: ~50% más.
    const circuityFactor = mode === 'car' ? 1.5 : 1.8; 
    const adjustedDist = distanceKm * circuityFactor;
    
    // Peatón: 4km/h (ritmo normal de ciudad). Auto: 22km/h (promedio urbano con semáforos).
    const speed = mode === 'car' ? 22 : 4; 
    const time = (adjustedDist / speed) * 60;
    
    // Tiempos fijos de "arranque" (semáforos, buscar entrada, etc)
    const padding = mode === 'car' ? 3 : 1;
    return Math.max(Math.round(time + padding), 1);
  };

  const getStoreCategory = (name: string, brand: string) => {
    const searchStr = (name + ' ' + brand).toLowerCase();
    const bigChainMatch = BIG_CHAINS.find(c => searchStr.includes(c.toLowerCase()));
    return bigChainMatch ? { category: 'big_chain' as const, brandName: bigChainMatch } : { category: 'others' as const, brandName: null };
  };

  const getStoreIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('lider')) return '🛒';
    if (n.includes('jumbo')) return '🐘';
    if (n.includes('santa isabel')) return '🚩';
    if (n.includes('unimarc')) return '🔴';
    if (n.includes('tottus')) return '🍏';
    if (n.includes('acuenta')) return '💰';
    if (n.includes('mayorista 10')) return '📦';
    if (n.includes('erbi') || n.includes('oxxo') || n.includes('ok market')) return '🏪';
    return '🏠';
  };

  const checkIsOpen = (openingHours?: string) => {
    if (!openingHours) return true;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const timeRanges = openingHours.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g);
    if (timeRanges) {
      return timeRanges.some(range => {
        const [startStr, endStr] = range.split('-').map(t => t.trim());
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        const start = sh * 60 + sm;
        const end = eh * 60 + em;
        return currentMinutes >= start && currentMinutes <= end;
      });
    }
    return true; 
  };

  useEffect(() => {
    let result = allStores;
    if (selectedCategory === 'big_chain') {
       result = result.filter(s => s.isBigChain);
       if (selectedBrand) {
         result = result.filter(s => s.brandName === selectedBrand);
       }
    } else if (selectedCategory === 'others') {
       result = result.filter(s => !s.isBigChain);
    }

    if (showOnlyOpen) {
      result = result.filter(s => s.isOpen);
    }
    setFilteredStores(result);
  }, [selectedCategory, selectedBrand, showOnlyOpen, allStores]);

  const fetchStores = async (latitude: number, longitude: number) => {
    try {
      addNotification("Conexión con satélites establecida. Buscando locales...", 'info');
      const query = `[out:json];nwr["shop"~"supermarket|convenience|grocery"](around:5000,${latitude},${longitude});out center;`;
      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter'
      ];
      
      let response: Response | null = null;
      let lastError: any = null;

      for (const url of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          response = await fetch(`${url}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) break;
        } catch (e) {
          lastError = e;
          continue;
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error("Los servidores de mapas están saturados.");
      }

      const data = await response.json();
      
      if (!data.elements || data.elements.length === 0) {
        setAllStores([]);
        setLoading(false);
        setError("No encontramos supermercados cerca de tu ubicación actual (5km).");
        return;
      }

      const processedStores = data.elements.map((el: any) => {
        try {
          const lat = el.lat || el.center?.lat;
          const lon = el.lon || el.center?.lon;
          
          if (!lat || !lon) return null;

          const dist = calculateDistance(latitude, longitude, lat, lon);
          const tags = el.tags || {};
          const hours = tags.opening_hours;
          const isOpen = hours ? checkIsOpen(hours) : true;
          const displayHours = hours || "08:30-21:00";
          const name = tags.name || tags.brand || tags.operator || "Almacén";
          const brand = tags.brand || tags.operator || "";
          const catInfo = getStoreCategory(name, brand);

          return {
            id: el.id,
            name: name,
            brandName: catInfo.brandName,
            isBigChain: catInfo.category === 'big_chain',
            lat: lat,
            lon: lon,
            distance: dist,
            openingHours: displayHours,
            carTime: getTravelTime(dist, 'car'),
            walkTime: getTravelTime(dist, 'walking'),
            icon: getStoreIcon(name),
            isOpen
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean).sort((a: any, b: any) => a.distance - b.distance);

      setAllStores(processedStores.slice(0, 50));
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error("Error fetching stores:", err);
      setError("Error de Red: El servicio de mapas no responde. Revisa tu internet o intenta de nuevo.");
      setLoading(false);
    }
  };

  const initLocation = () => {
    setLoading(true);
    setError(null);
    setAllStores([]);
    
    // Timeout global para evitar carga infinita
    const globalTimeout = setTimeout(() => {
      if (loading) {
        setError("La búsqueda de GPS está tardando demasiado. Prueba moviéndote o verifica los permisos.");
        setLoading(false);
      }
    }, 30000);

    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización");
      setLoading(false);
      clearTimeout(globalTimeout);
      return;
    }

    const tryGetPosition = (highAccuracy: boolean) => {
      const options = {
        enableHighAccuracy: highAccuracy,
        timeout: 10000, 
        maximumAge: highAccuracy ? 0 : 300000 // Aumentamos age para baja precisión
      };

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(globalTimeout);
          const { latitude, longitude } = pos.coords;
          setCoords({ latitude, longitude });
          fetchStores(latitude, longitude);
        },
        (err) => {
          console.error(`Geolocation error (highAccuracy=${highAccuracy}):`, err);
          
          if (highAccuracy) {
            console.log("Reintentando con precisión normal...");
            addNotification("Buscando con señal de red...", 'info');
            tryGetPosition(false);
            return;
          }

          clearTimeout(globalTimeout);
          let msg = "No pudimos obtener tu ubicación.";
          if (err.code === 1) msg = "Acceso Denegado: Permite el uso de tu ubicación en los ajustes del navegador.";
          if (err.code === 2) msg = "Ubicación No Disponible: El GPS no tiene señal. Prueba cerca de una ventana o en la terraza.";
          if (err.code === 3) msg = "Tiempo Agotado: La señal GPS es muy débil. Asegúrate de tener el GPS activado.";
          
          setError(msg);
          setLoading(false);
        },
        options
      );
    };

    tryGetPosition(true);
  };

  useEffect(() => {
    initLocation();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh] space-y-6">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-accent/10 rounded-full" />
        <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
      </div>
      <div className="space-y-2">
        <p className="text-text-main font-black text-xl tracking-tight">Escaneando el área</p>
        <p className="text-text-secondary text-sm font-medium italic">Obteniendo tu ubicación y buscando locales...</p>
        <p className="text-[10px] text-gray-400 max-w-[200px] mx-auto leading-tight mt-4">
          Si este proceso demora demasiado, asegúrate de tener el GPS activado y haber concedido permisos.
        </p>
        <button 
          onClick={() => {
            setAllStores([]);
            setLoading(false);
            setError("Búsqueda omitida. Puedes usar la lista sin ubicación o intentar de nuevo más tarde.");
          }}
          className="mt-6 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-accent border border-accent/20 rounded-xl hover:bg-accent/5 transition-all"
        >
          Omitir y continuar sin GPS
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 lg:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onOpenMenu}
              className="lg:hidden p-2.5 bg-white border border-border rounded-xl shadow-sm active:scale-95 transition-all"
            >
              <Menu className="w-5 h-5 text-text-main" />
            </button>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-accent/10 rounded-xl grid place-items-center sm:w-12 sm:h-12">
                  <MapPin className="w-5 h-5 text-accent sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-text-main leading-tight">Cerca de ti</h2>
                  <p className="text-[10px] sm:text-xs text-text-secondary font-medium italic">Encuentra suministros al instante</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Uber Style Filters */}
        <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          <button
             onClick={() => { setSelectedCategory('all'); setSelectedBrand(null); }}
             className={cn(
               "flex-none px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
               selectedCategory === 'all' && !showOnlyOpen ? "bg-black text-white" : "bg-gray-100 text-black hover:bg-gray-200"
             )}
          >
            <span>🛍️</span> Todos
          </button>

          <button 
            onClick={() => setShowOnlyOpen(!showOnlyOpen)}
            className={cn(
              "flex-none px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 border-2",
              showOnlyOpen ? "bg-green-600 text-white border-green-600" : "bg-gray-100 text-black border-transparent hover:bg-gray-200"
            )}
          >
            <span>🕒</span> Abierto
          </button>

          <div className="flex-none w-[1px] bg-gray-200 mx-1" />

          <button
             onClick={() => { setSelectedCategory('big_chain'); setSelectedBrand(null); }}
             className={cn(
               "flex-none px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
               selectedCategory === 'big_chain' && !selectedBrand ? "bg-black text-white" : "bg-gray-100 text-black hover:bg-gray-200"
             )}
          >
            <span>🛒</span> Súper
          </button>

          <button
             onClick={() => { setSelectedCategory('others'); setSelectedBrand(null); }}
             className={cn(
               "flex-none px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
               selectedCategory === 'others' ? "bg-black text-white" : "bg-gray-100 text-black hover:bg-gray-200"
             )}
          >
            <span>🏠</span> Otros
          </button>

          <div className="flex-none w-[1px] bg-gray-200 mx-1" />

          {BIG_CHAINS.map(brand => (
            <button
               key={brand}
               onClick={() => { 
                 setSelectedCategory('big_chain'); 
                 setSelectedBrand(selectedBrand === brand ? null : brand); 
               }}
               className={cn(
                 "flex-none px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                 selectedBrand === brand ? "bg-accent text-white" : "bg-gray-100 text-black hover:bg-gray-200"
               )}
            >
              {brand}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-100 p-8 rounded-[2rem] text-center space-y-4 shadow-xl shadow-red-100/20 max-w-lg mx-auto mt-12">
          <div className="w-16 h-16 bg-red-100 rounded-full grid place-items-center mx-auto text-red-500">
             <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-black text-red-950">Ubicación No Disponible</h3>
            <p className="text-red-700 font-bold text-sm">{error}</p>
          </div>
          <p className="text-xs text-red-600/70 leading-relaxed">
            Para ver los locales cercanos necesitamos acceso a tu ubicación. 
            Por favor, activa el GPS en tu dispositivo o permite el acceso en tu navegador y recarga la página.
          </p>
          <button 
            onClick={() => initLocation()}
            className="w-full py-3 bg-red-500 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-red-500/30 active:scale-95 transition-all"
          >
            Reintentar Acceso
          </button>
        </div>
      ) : filteredStores.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-[3rem] border border-dashed border-border animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-border shadow-sm">
             <Filter className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-text-main font-bold">No hay resultados para este filtro</p>
          <p className="text-text-secondary text-xs italic mt-1">Prueba quitando filtros o cambiando de marca</p>
          <button onClick={() => { setSelectedBrand(null); setShowOnlyOpen(false); }} className="mt-4 text-accent font-black text-xs uppercase tracking-widest underline decoration-2 underline-offset-4">Limpiar todo</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredStores.map((store, i) => (
            <motion.a
               key={store.id}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.02 }}
               href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`}
               target="_blank"
               rel="noopener noreferrer"
               className="bg-white border border-border p-4 rounded-2xl group hover:border-black transition-all active:scale-[0.98] flex flex-col gap-4 text-left shadow-soft relative overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 bg-gray-50 border border-border rounded-xl flex-none flex items-center justify-center text-2xl group-hover:bg-white transition-colors">
                    {store.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-text-main group-hover:text-black transition-colors tracking-tight truncate">
                      {store.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1 text-text-secondary">
                        <Car className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-bold">{store.carTime} min</span>
                      </div>
                      <div className="flex items-center gap-1 text-text-secondary">
                        <Footprints className="w-3 h-3 text-orange-500" />
                        <span className="text-[10px] font-bold">{store.walkTime} min</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-md text-[10px] font-bold text-gray-500 flex-none group-hover:bg-white transition-colors">
                  {store.distance < 1 ? `${(store.distance * 1000).toFixed(0)}m` : `${store.distance.toFixed(1)}km`}
                </div>
              </div>

              <div className="mt-auto pt-3 border-t border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", store.isOpen ? "bg-green-500" : "bg-red-500")} />
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
                    {store.isOpen ? 'Abierto' : 'Cerrado'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-gray-400 group-hover:text-gray-600 transition-colors">
                    {store.openingHours}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-black transition-colors" />
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      )}

      {/* FOOTER DE INFORMACIÓN */}
      <div className="mt-8 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-start gap-4">
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-none">
          <Info className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Aviso de Estimación</p>
          <p className="text-[11px] text-blue-700 mt-1 leading-relaxed">
            Las distancias y tiempos son una <strong>estimación basada en el trayecto promedio</strong>. 
            Factores como semáforos, obras o barreras geográficas pueden variar el tiempo real. 
            Haz clic en un local para ver la ruta exacta y el tráfico en Google Maps.
          </p>
        </div>
      </div>
    </div>
  );
}
