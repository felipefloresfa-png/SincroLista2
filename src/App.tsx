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
  History,
  AlertCircle,
  Clock,
  ChevronRight,
  MoreVertical,
  Star,
  Zap,
  Tag,
  MessageSquare,
  Users,
  Layout,
  ChevronDown,
  UserPlus,
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeItem, getSmartRecommendations, ItemInfo } from './lib/gemini';
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

  return (
    <div className={cn("inline-flex items-center gap-1.5 w-full bg-white border border-border rounded-xl px-3 py-2")}>
      <code className="flex-grow text-[10px] font-mono text-text-main break-all">
        {code}
      </code>
      <button 
        onClick={async () => {
          const success = await copyToClipboard(code);
          if (success) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
          } else {
            alert("Error al copiar. Prueba seleccionando el texto manualmente.");
          }
        }}
        className={cn(
          "p-2 rounded-xl transition-all",
          isCopied ? "bg-green-500 text-white" : "bg-text-main text-white hover:bg-black"
        )}
        title="Copiar Código"
      >
        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [syncedUsers, setSyncedUsers] = useState<UserProfile[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [shoppingMode, setShoppingMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false); // Used for other global loading states if needed
  
  // Dialog State
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    initialValue: string;
    placeholder?: string;
    type?: 'input' | 'confirm';
    onConfirm: (val: string) => void;
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
      limit(10)
    );
    return onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ActivityItem[];
      setActivities(fetched.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0)));
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
      category, 
      familyId: profile.familyId, 
      timestamp: serverTimestamp() 
    });
  };

  const addItem = async (name: string, qty: string = '1', listIdOverride?: string) => {
    const listToUse = listIdOverride || activeListId;
    if (!name.trim() || !profile) {
      addLog("Error: Esperando perfil...");
      return;
    }

    if (!listToUse) {
      addLog("Reparando lista...");
      const newId = await createDefaultList(profile.familyId);
      if (newId) {
        addLog("Re-intentando con ID listo.");
        addItem(name, qty, newId);
      }
      return;
    }
    
    try {
      if (newItemName === name) setIsAdding(true); 
      addLog(`Guardando [${name}]...`);
      
      // MEMORIA DE PASILLOS: Buscamos si este producto ya ha sido categorizado antes por el grupo
      const existingAssignment = items.find(i => i.name.toLowerCase() === name.toLowerCase());
      const historicalAssignment = activities.find(a => a.itemName?.toLowerCase() === name.toLowerCase() && a.category);
      
      let analysis: any;
      if (existingAssignment) {
        addLog("Usando pasillo de la lista actual...");
        analysis = { category: existingAssignment.category, priorityLevel: existingAssignment.priority };
      } else if (historicalAssignment) {
        addLog("Recuperando pasillo del historial...");
        analysis = { category: historicalAssignment.category, priorityLevel: 'medium' };
      }
      
      if (!analysis || !analysis.category || analysis.category === 'Otros' || analysis.category === 'Sin Categoría') {
        addLog(`IA: Analizando "${name}"...`);
        try {
          const analysisPromise = analyzeItem(name);
          const timeoutPromise = new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout (12s)")), 12000));
          analysis = await Promise.race([analysisPromise, timeoutPromise]);
          addLog(`IA Éxito: -> ${analysis.category}`);
        } catch (iaError: any) {
          addLog(`IA Fallo: ${iaError.message || "Error desconocido"}`);
          analysis = { category: 'Otros', priorityLevel: 'medium' };
        }
      }
      
      const itemData = {
        listId: listToUse,
        familyId: profile.familyId,
        name: name.trim(),
        quantity: qty || '1',
        category: analysis.category || 'Otros',
        priority: (analysis.priorityLevel === 'high' ? 'high' : 'medium') as 'high' | 'medium',
        checked: false,
        addedBy: profile.displayName || 'Usuario',
        createdAt: serverTimestamp()
      };

      // MOSTRAR AL INSTANTE (Modo Optimista)
      const tempId = 'temp-item-' + Date.now();
      const visualItem = { id: tempId, ...itemData } as any;
      setItems(prev => {
        // Evitamos duplicados locales si la sincronización es muy rápida
        if (prev.some(i => i.name === name.trim() && i.listId === listToUse)) return prev;
        return [visualItem, ...prev];
      });
      
      const docRef = await addDoc(itemsCollection, itemData);
      addLog(`Nube OK: ${docRef.id.substring(0,5)}`);
      
      logActivity('add', name.trim(), itemData.category);
      
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

  const toggleItem = async (item: GroceryItem) => {
    await updateDoc(doc(db, 'items', item.id), { checked: !item.checked });
    if (!item.checked) logActivity('check', item.name);
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
    logActivity('delete', item.name);
  };

  const clearChecked = async () => {
    const checkedItems = items.filter(i => i.checked);
    const batch = writeBatch(db);
    checkedItems.forEach(i => batch.delete(doc(db, 'items', i.id)));
    await batch.commit();
    logActivity('clear', `${checkedItems.length} productos`);
  };

  const activeCategories = useMemo(() => {
    const cats = new Set(items.map(i => i.category));
    return Array.from(cats).sort();
  }, [items]);

  const activeList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);
  
  const groupedItems = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    items.forEach(item => {
      // In shopping mode, we don't hide items, but we will sort them so checked are at the bottom
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    
    // Sort items within each group: unchecked first
    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => (Number(a.checked) - Number(b.checked)));
    });
    
    return groups;
  }, [items, shoppingMode]);

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
      addLog(`Borrando lista: ${listId}...`);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'lists', listId));
      items.filter(i => i.listId === listId).forEach(item => {
        batch.delete(doc(db, 'items', item.id));
      });
      await batch.commit();
      
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
    />
  );

  return (
    <div className={cn("min-h-[100dvh] bg-bg overflow-x-hidden transition-colors duration-500", shoppingMode && "bg-gray-950")}>
      
      {/* Mobile Header Overlay */}
      <div className={cn(
        "lg:hidden fixed inset-0 z-40 bg-black/60 transition-opacity",
        isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )} onClick={() => setIsSidebarOpen(false)} />

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row min-h-[100dvh] relative">
        
        {/* Sidebar */}
        <aside className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-screen w-[280px] bg-white border-r border-border p-6 transition-transform flex flex-col shrink-0 overflow-y-auto",
          shoppingMode && "lg:opacity-40 lg:pointer-events-none",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-accent rounded-xl grid place-items-center shadow-lg shadow-accent/20">
              <ShoppingBasket className="text-white w-6 h-6" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-text-main">SincroLista</h1>
          </div>

          <div className="flex-grow space-y-8">
            {/* Equipo / Invitación */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
                  <Users className="w-3 h-3" /> Equipo
                </h3>
              </div>
              
              <div className="flex items-center gap-2 mb-4">
                <div className="flex -space-x-2 overflow-hidden">
                  {syncedUsers.map(u => (
                    <img key={u.uid} src={u.photoURL} title={u.displayName} className="inline-block h-8 w-8 rounded-full ring-2 ring-white shadow-sm" />
                  ))}
                </div>
                {syncedUsers.length === 1 && (
                  <span className="text-[10px] font-bold text-accent bg-accent/5 px-2 py-0.5 rounded-full">Tú solo</span>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-tight">Tu código para invitar:</p>
                <CopyCodeComponent code={profile?.familyId || ''} />
                
                <button 
                  onClick={handleJoinFamilyPrompt}
                  className="w-full mt-2 py-2 text-[10px] font-black uppercase tracking-widest text-accent hover:bg-accent/5 rounded-lg transition-all border border-dashed border-accent/20"
                >
                  Unirse a otro grupo
                </button>
              </div>
            </div>

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
                      onClick={() => { setActiveListId(l.id); setIsSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all pr-12",
                        activeListId === l.id ? "bg-accent text-white shadow-md shadow-accent/20" : "hover:bg-gray-50 text-text-secondary"
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

            {/* Activities */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3 flex items-center gap-2">
                <History className="w-3 h-3" /> Actividad
              </h3>
              <div className="space-y-3">
                {activities.map(a => (
                  <div key={a.id} className="text-[11px] leading-tight">
                    <span className="font-bold text-text-main capitalize block">{a.type}</span>
                    <span className="text-text-secondary">{a.itemName}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button onClick={() => auth.signOut()} className="mt-8 flex items-center gap-3 px-3 py-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors font-semibold text-sm">
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </aside>

        {/* Main Content Area */}
        <main className="flex-grow p-4 md:p-8 lg:p-12 space-y-8 min-w-0 pb-32 relative">
          
          {/* Top Bar Mobile */}
          <div className="lg:hidden flex justify-between items-center mb-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-1.5 bg-white border border-border rounded-lg shadow-sm">
              <ListIcon className="w-5 h-5 text-text-main" />
            </button>
            <div className="text-center px-4 leading-tight">
              <h2 className={cn("text-base font-black truncate max-w-[150px]", shoppingMode && "text-white")}>{activeList?.name}</h2>
              <p className="text-[9px] text-accent uppercase font-black tracking-widest">Sincrolista</p>
            </div>
            <button onClick={() => setShoppingMode(!shoppingMode)} className={cn("p-1.5 rounded-lg shadow-sm border border-border", shoppingMode ? "bg-accent text-white" : "bg-white")}>
              <Zap className="w-5 h-5" />
            </button>
          </div>

           <header className="hidden lg:flex items-center justify-between mb-4">
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

          {/* AI Suggestions Bar */}
          {!shoppingMode && (
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
          )}

          {/* Grid of items with better containment */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3 auto-rows-min">
            <AnimatePresence mode="popLayout">
              {(Object.entries(groupedItems) as [string, GroceryItem[]][]).map(([category, catItems]) => (
                <motion.div 
                  layout
                  key={category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={cn(
                    "category-card break-inside-avoid",
                    shoppingMode ? "bg-gray-900 border-gray-800 shadow-none ring-1 ring-white/5" : "bg-white"
                  )}
                >
              <div className="flex items-center gap-2 mb-4 pb-1 border-b border-border/50">
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
                <span className="text-[9px] font-black tabular-nums bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded-md border border-border">{catItems.length}</span>
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
                            description: "Cambia el nombre del producto:",
                            initialValue: item.name,
                            onConfirm: (val) => updateItemName(item, val)
                          });
                        }}
                        onTogglePriority={() => togglePriority(item)}
                        onUpdateCategory={() => {
                          setPromptConfig({
                            isOpen: true,
                            title: `Mover "${item.name}"`,
                            description: "Escribe el nombre del nuevo pasillo:",
                            initialValue: item.category,
                            onConfirm: (val) => updateItemCategory(item, val)
                          });
                        }}
                        onUpdateQty={() => {
                          setPromptConfig({
                            isOpen: true,
                            title: `Cantidad para "${item.name}"`,
                            description: "Cambia la cantidad del producto:",
                            initialValue: item.quantity,
                            onConfirm: (val) => updateItemQty(item, val)
                          });
                        }}
                        shoppingMode={shoppingMode} 
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {items.length === 0 && (
             <div className="py-20 text-center space-y-6">
                <div className="opacity-20">
                  <ShoppingBasket className="w-20 h-20 mx-auto mb-4" />
                  <p className="text-xl font-bold">La lista está vacía</p>
                  <p className="text-sm">Si has agregado productos y no aparecen, intenta recargar.</p>
                </div>
                <button 
                  onClick={async () => {
                    addLog("Probando escritura...");
                    try {
                      const testRef = doc(db, 'test_connection', 'write_test');
                      await setDoc(testRef, { lastTest: serverTimestamp(), user: auth.currentUser?.uid });
                      addLog("✅ EXITO: Escritura permitida.");
                      alert("¡Conexión exitosa! Ahora intenta agregar un producto.");
                    } catch (e: any) {
                      addLog(`❌ FALLO: ${e.code}`);
                      alert(`Error: ${e.code}. Sigue las instrucciones para abrir las reglas.`);
                    }
                  }}
                  className="px-6 py-3 bg-accent text-white rounded-2xl text-xs font-bold hover:bg-accent-dark flex items-center gap-2 mx-auto shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" /> Probar Conexión (Escritura)
                </button>

                <button 
                  onClick={() => {
                    const info = `Project: ${firebaseConfig.projectId}\nAuth: ${auth.currentUser?.uid || 'No user'}\nDBID: ${firebaseConfig.firestoreDatabaseId}\nHost: ${window.location.hostname}`;
                    navigator.clipboard.writeText(info);
                    alert("Configuración copiada. Pégala aquí.");
                  }}
                  className="text-[10px] text-text-secondary underline opacity-70 mt-2 block mx-auto"
                >
                  Diagnóstico Técnico (Copiar Config)
                </button>
                
                {/* Visual logs for in-app debugging */}
                <div className="max-w-xs mx-auto mt-10">
                   <div className="bg-black/90 p-4 rounded-2xl text-left border border-white/10 shadow-2xl">
                    <h4 className="text-[9px] font-black uppercase text-white/40 mb-2 tracking-tighter flex items-center justify-between">
                      Logs de Conexión
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    </h4>
                    <div className="space-y-1">
                      {debugLogs.map((log, i) => (
                        <p key={i} className="text-[10px] font-mono text-green-400/90 break-words leading-tight">{log}</p>
                      ))}
                    </div>
                  </div>
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
        </main>
      </div>

      {/* Custom Dialog / Prompt */}
      {promptConfig.isOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-6">
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
            
            {promptConfig.title.toLowerCase().includes('pasillo') && activeCategories.length > 0 && (
              <div className="mb-6 space-y-2">
                <p className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest">Pasillos actuales</p>
                <div className="flex flex-wrap gap-2">
                  {activeCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => promptConfig.onConfirm(cat)}
                      className="px-3 py-2 bg-gray-50 border border-border rounded-xl text-xs font-bold text-text-main hover:border-accent hover:text-accent transition-all"
                    >
                      {cat}
                    </button>
                  ))}
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
              {promptConfig.type !== 'confirm' && (
                <input 
                  autoFocus
                  name="promptInput"
                  defaultValue={promptConfig.initialValue}
                  placeholder={promptConfig.placeholder || "Escribe aquí..."}
                  className="w-full bg-gray-50 border border-border rounded-2xl px-5 py-4 font-bold text-text-main focus:ring-4 focus:ring-accent/10 focus:border-accent outline-hidden mb-6"
                />
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
          <button 
            onClick={onEdit}
            className="lg:opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-100 text-gray-300 hover:text-text-main rounded-lg transition-all"
            title="Editar nombre"
          >
            <Pencil className="w-3 h-3" />
          </button>
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

function AuthWall({ onLogin, onGoogleLogin, onReset, onDemo, isLoading, status, logs = [] }: { 
  onLogin: (name: string, code?: string) => void, 
  onGoogleLogin: (code?: string) => void,
  onReset: () => void, 
  onDemo: () => void,
  isLoading: boolean, 
  status?: string,
  logs?: string[]
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

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

        {logs.length > 0 && (
          <div className="bg-black/90 p-4 rounded-2xl text-left border border-white/10">
            <h4 className="text-[9px] font-black uppercase text-white/40 mb-2 tracking-tighter">Soporte Técnico (Logs)</h4>
            <div className="space-y-1">
              {logs.map((log, i) => (
                <p key={i} className="text-[10px] font-mono text-green-400 break-words leading-[1.2]">{log}</p>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6 pt-4 border-t border-border/50">
           <div className="flex flex-col gap-2">
              <button 
                onClick={onReset}
                className="text-[10px] font-bold text-text-secondary hover:text-accent flex items-center gap-2 mx-auto"
              >
                <RefreshCw className="w-3 h-3" /> Reiniciar conexión
              </button>
              
              <button 
                onClick={onDemo}
                className="w-full py-3 bg-accent/5 border border-accent/20 rounded-2xl text-[11px] font-bold text-accent hover:bg-accent/10 transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" /> Probar sin Firebase (Modo Demo)
              </button>
           </div>

           <div className="bg-gray-50 p-4 rounded-2xl text-left border border-border">
              <p className="text-[10px] text-text-secondary leading-relaxed">
                ID: <span className="text-text-main font-bold">{firebaseConfig.projectId}</span><br/>
                Host: <span className="text-accent underline break-all">{window.location.hostname}</span>
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
