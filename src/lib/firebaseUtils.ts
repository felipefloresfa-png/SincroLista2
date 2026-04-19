import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signInAnonymously,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { auth, db, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signInAnonymously };
export type { FirebaseUser };

export const usersCollection = collection(db, 'users');
export const itemsCollection = collection(db, 'items');
export const familiesCollection = collection(db, 'families');
export const listsCollection = collection(db, 'lists');
export const activitiesCollection = collection(db, 'activities');
