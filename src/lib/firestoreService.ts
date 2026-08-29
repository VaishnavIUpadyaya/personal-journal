import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebaseClient';
import type { 
  UserProfile, 
  JournalEntry, 
  JournalMessage, 
  GrowthInsight 
} from '../types';
import { sanitizePayload } from './utils';

export class FirestoreService {
  // Sync / Create User Profile
  static async syncUserProfile(user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  }): Promise<UserProfile> {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const now = new Date().toISOString();

    const profileData: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Journaler',
      photoURL: user.photoURL || undefined,
      createdAt: snap.exists() ? (snap.data()?.createdAt || now) : now,
      lastActiveAt: now,
    };

    await setDoc(userRef, sanitizePayload(profileData), { merge: true });
    return profileData;
  }

  // Subscribe to User's Journal Entries in Real-time
  static subscribeEntries(
    userId: string, 
    onSuccess: (entries: JournalEntry[]) => void, 
    onError: (err: Error) => void
  ): () => void {
    if (!userId) {
      return () => {};
    }

    const entriesRef = collection(db, 'users', userId, 'entries');
    const q = query(entriesRef, orderBy('updatedAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const entries: JournalEntry[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<JournalEntry, 'id'>),
        }));
        onSuccess(entries);
      },
      (error) => {
        // Treat permission-denied during auth sign-out as expected lifecycle teardown
        const isPermissionDenied = error.code === 'permission-denied' || 
          error.message?.toLowerCase().includes('insufficient permissions');
        
        if (isPermissionDenied) {
          return;
        }
        console.error('Firestore entries subscription error:', error);
        onError(error);
      }
    );
  }

  // Get Single Entry
  static async getEntry(userId: string, entryId: string): Promise<JournalEntry | null> {
    const entryRef = doc(db, 'users', userId, 'entries', entryId);
    const snap = await getDoc(entryRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<JournalEntry, 'id'>) };
  }

  // Subscribe to Messages inside an Entry in Real-time
  static subscribeMessages(
    userId: string,
    entryId: string,
    onSuccess: (messages: JournalMessage[]) => void,
    onError: (err: Error) => void
  ): () => void {
    if (!userId || !entryId) {
      return () => {};
    }

    const messagesRef = collection(db, 'users', userId, 'entries', entryId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const messages: JournalMessage[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<JournalMessage, 'id'>),
        }));
        onSuccess(messages);
      },
      (error) => {
        const isPermissionDenied = error.code === 'permission-denied' || 
          error.message?.toLowerCase().includes('insufficient permissions');
        
        if (isPermissionDenied) {
          return;
        }
        console.error('Firestore messages subscription error:', error);
        onError(error);
      }
    );
  }

  // Save New Journal Entry + Initial Messages in an atomic batch
  static async createEntryWithMessages(
    userId: string,
    entryData: Omit<JournalEntry, 'id'>,
    userMessage: Omit<JournalMessage, 'id'>,
    modelMessage: Omit<JournalMessage, 'id'>
  ): Promise<JournalEntry> {
    const entryRef = doc(collection(db, 'users', userId, 'entries'));
    const entryId = entryRef.id;

    const userMsgRef = doc(collection(db, 'users', userId, 'entries', entryId, 'messages'));
    const modelMsgRef = doc(collection(db, 'users', userId, 'entries', entryId, 'messages'));

    const batch = writeBatch(db);

    const fullEntry: JournalEntry = {
      id: entryId,
      ...entryData,
    };

    const fullUserMsg: JournalMessage = {
      id: userMsgRef.id,
      entryId,
      ...userMessage,
    };

    const fullModelMsg: JournalMessage = {
      id: modelMsgRef.id,
      entryId,
      ...modelMessage,
    };

    batch.set(entryRef, sanitizePayload(fullEntry));
    batch.set(userMsgRef, sanitizePayload(fullUserMsg));
    batch.set(modelMsgRef, sanitizePayload(fullModelMsg));

    await batch.commit();
    return fullEntry;
  }

  // Add a Turn (User message + Model message) to an Entry
  static async addTurnMessages(
    userId: string,
    entryId: string,
    userMsg: Omit<JournalMessage, 'id'>,
    modelMsg: Omit<JournalMessage, 'id'>,
    newTurnCount: number
  ): Promise<{ userMessage: JournalMessage; modelMessage: JournalMessage }> {
    const entryRef = doc(db, 'users', userId, 'entries', entryId);
    const userMsgRef = doc(collection(db, 'users', userId, 'entries', entryId, 'messages'));
    const modelMsgRef = doc(collection(db, 'users', userId, 'entries', entryId, 'messages'));

    const fullUserMsg: JournalMessage = {
      id: userMsgRef.id,
      entryId,
      ...userMsg,
    };

    const fullModelMsg: JournalMessage = {
      id: modelMsgRef.id,
      entryId,
      ...modelMsg,
    };

    const batch = writeBatch(db);
    batch.set(userMsgRef, sanitizePayload(fullUserMsg));
    batch.set(modelMsgRef, sanitizePayload(fullModelMsg));
    batch.update(entryRef, sanitizePayload({
      turnCount: newTurnCount,
      updatedAt: new Date().toISOString(),
    }));

    await batch.commit();
    return { userMessage: fullUserMsg, modelMessage: fullModelMsg };
  }

  // Update Entry Metadata (e.g. after AI summarization)
  static async updateEntry(
    userId: string,
    entryId: string,
    updates: Partial<JournalEntry>
  ): Promise<void> {
    const entryRef = doc(db, 'users', userId, 'entries', entryId);
    await updateDoc(entryRef, sanitizePayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  }

  // Delete Entry and all its messages
  static async deleteEntry(userId: string, entryId: string): Promise<void> {
    const entryRef = doc(db, 'users', userId, 'entries', entryId);
    const messagesSnap = await getDocs(collection(db, 'users', userId, 'entries', entryId, 'messages'));

    const batch = writeBatch(db);
    messagesSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    batch.delete(entryRef);

    await batch.commit();
  }

  // Subscribe to Growth Insights
  static subscribeInsights(
    userId: string,
    onSuccess: (insights: GrowthInsight[]) => void,
    onError: (err: Error) => void
  ): () => void {
    if (!userId) {
      return () => {};
    }

    const insightsRef = collection(db, 'users', userId, 'insights');
    const q = query(insightsRef, orderBy('generatedAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: GrowthInsight[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<GrowthInsight, 'id'>),
        }));
        onSuccess(list);
      },
      (error) => {
        const isPermissionDenied = error.code === 'permission-denied' || 
          error.message?.toLowerCase().includes('insufficient permissions');
        
        if (isPermissionDenied) {
          return;
        }
        console.error('Firestore insights subscription error:', error);
        onError(error);
      }
    );
  }

  // Save Growth Insight Snapshot
  static async saveGrowthInsight(
    userId: string,
    insight: Omit<GrowthInsight, 'id'>
  ): Promise<GrowthInsight> {
    const insightRef = doc(collection(db, 'users', userId, 'insights'));
    const fullInsight: GrowthInsight = {
      id: insightRef.id,
      ...insight,
    };
    await setDoc(insightRef, sanitizePayload(fullInsight));
    return fullInsight;
  }

  // Fetch entries for Growth Analytics in timeframe (7, 30, or 90 days)
  static async getEntriesInTimeframe(
    userId: string,
    timeframeDays: number
  ): Promise<JournalEntry[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeframeDays);
    const cutoffIso = cutoff.toISOString();

    const entriesRef = collection(db, 'users', userId, 'entries');
    const q = query(
      entriesRef, 
      where('updatedAt', '>=', cutoffIso),
      orderBy('updatedAt', 'desc')
    );

    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<JournalEntry, 'id'>),
    }));
  }

  // Export all user data (entries, messages, insights)
  static async exportAllUserData(userId: string, email: string): Promise<Record<string, unknown>> {
    const entriesSnap = await getDocs(collection(db, 'users', userId, 'entries'));
    const insightsSnap = await getDocs(collection(db, 'users', userId, 'insights'));

    const entriesWithMessages = [];
    for (const entryDoc of entriesSnap.docs) {
      const messagesSnap = await getDocs(
        collection(db, 'users', userId, 'entries', entryDoc.id, 'messages')
      );
      entriesWithMessages.push({
        id: entryDoc.id,
        ...entryDoc.data(),
        messages: messagesSnap.docs.map((m) => ({ id: m.id, ...m.data() })),
      });
    }

    return {
      user: { uid: userId, email },
      exportedAt: new Date().toISOString(),
      entries: entriesWithMessages,
      insights: insightsSnap.docs.map((ins) => ({ id: ins.id, ...ins.data() })),
    };
  }
}
