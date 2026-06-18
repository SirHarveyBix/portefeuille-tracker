import {
  AllocationConfig,
  PortfolioModel,
  SerializedPortfolioModel,
} from "../types";
import { restoreModel, serializeModel } from "./csvParser";

const ALLOCATION_KEY = "pf-alloc-v1";
const MODEL_KEY = "pf-model-v1";

const memoryCache: Record<string, AllocationConfig> = {};
let modelMemoryCache: SerializedPortfolioModel | null = null;

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface PortfolioDocument {
  allocation?: AllocationConfig;
  model?: SerializedPortfolioModel;
  updatedAt?: number;
}

export interface FirebaseInstance {
  auth: {
    signOut: () => Promise<void>;
  };
  database: {
    collection: (name: string) => {
      doc: (id: string) => {
        get: () => Promise<{
          exists: boolean;
          data: () => PortfolioDocument | undefined;
        }>;
        set: (
          data: Partial<PortfolioDocument>,
          options?: { merge: boolean },
        ) => Promise<void>;
      };
    };
  };
  userIdentifier: string;
}

declare global {
  interface Window {
    APP_CONFIG?: {
      FIREBASE?: FirebaseWebConfig;
      OWNER_EMAIL?: string;
      VIX?: {
        source: string;
        proxyUrl?: string;
        apiKey?: string;
      };
    };
    firebase?: {
      apps: { length: number };
      initializeApp: (config: FirebaseWebConfig) => void;
      auth: {
        (): {
          signOut: () => Promise<void>;
          getRedirectResult: () => Promise<{
            user: { uid: string; email: string | null } | null;
          }>;
          onAuthStateChanged: (
            callback: (
              user: { uid: string; email: string | null } | null,
            ) => void,
          ) => () => void;
          signInWithPopup: (provider: unknown) => Promise<unknown>;
          signInWithRedirect: (provider: unknown) => Promise<unknown>;
        };
        GoogleAuthProvider: new () => unknown;
      };
      firestore: () => FirebaseInstance["database"];
    };
  }
}

export type CustomWindow = Window;

export class PortfolioStore {
  private mode: "local" | "firebase" = "local";
  private firebaseInstance: FirebaseInstance | null = null;

  setFirebase(firebaseInstance: FirebaseInstance | null) {
    this.firebaseInstance = firebaseInstance;
    this.mode = firebaseInstance ? "firebase" : "local";
  }

  getMode() {
    return this.mode;
  }

  async loadAllocation(
    seedConfiguration: AllocationConfig,
  ): Promise<AllocationConfig> {
    try {
      return seedConfiguration;
    } catch (error) {
      return memoryCache[ALLOCATION_KEY] || seedConfiguration;
    }
  }

  saveAllocation(configuration: AllocationConfig) {
    if (this.mode === "firebase" && this.firebaseInstance) {
      this.firebaseInstance.database
        .collection("portfolios")
        .doc(this.firebaseInstance.userIdentifier)
        .set(
          {
            allocation: configuration,
            updatedAt: Date.now(),
          },
          { merge: true },
        )
        .catch((error: unknown) =>
          console.warn("Firestore save allocation:", error),
        );
      return;
    }
    try {
      localStorage.setItem(ALLOCATION_KEY, JSON.stringify(configuration));
    } catch (error) {
      memoryCache[ALLOCATION_KEY] = configuration;
    }
  }

  async loadModel(): Promise<PortfolioModel | null> {
    if (this.mode === "firebase" && this.firebaseInstance) {
      try {
        const document = await this.firebaseInstance.database
          .collection("portfolios")
          .doc(this.firebaseInstance.userIdentifier)
          .get();
        const data = document.exists ? document.data() : undefined;
        if (data && data.model) {
          return restoreModel(data.model);
        }
        return null;
      } catch (error) {
        console.warn("Firestore load model:", error);
        try {
          const stored = localStorage.getItem(MODEL_KEY);
          if (stored) return restoreModel(JSON.parse(stored));
        } catch {
          /* empty */
        }
        return null;
      }
    }
    try {
      const storedValue = localStorage.getItem(MODEL_KEY);
      if (storedValue) {
        const parsed: SerializedPortfolioModel = JSON.parse(storedValue);
        return restoreModel(parsed);
      }
      return null;
    } catch (error) {
      return modelMemoryCache ? restoreModel(modelMemoryCache) : null;
    }
  }

  saveModel(model: PortfolioModel) {
    const serialized = serializeModel(model);
    if (this.mode === "firebase" && this.firebaseInstance) {
      this.firebaseInstance.database
        .collection("portfolios")
        .doc(this.firebaseInstance.userIdentifier)
        .set(
          {
            model: serialized,
            updatedAt: Date.now(),
          },
          { merge: true },
        )
        .catch((error: unknown) =>
          console.warn("Firestore save model:", error),
        );
      return;
    }
    try {
      localStorage.setItem(MODEL_KEY, JSON.stringify(serialized));
    } catch (error) {
      modelMemoryCache = serialized;
    }
  }
}

export const store = new PortfolioStore();

export async function resolveFirebaseConfig(): Promise<FirebaseWebConfig | null> {
  try {
    const response = await fetch("/__/firebase/init.json");
    if (response.ok) {
      const jsonResult: unknown = await response.json();
      const isFirebaseConfig = (value: unknown): value is FirebaseWebConfig =>
        !!value && typeof value === "object" && "apiKey" in value;
      if (isFirebaseConfig(jsonResult)) return jsonResult;
    }
  } catch {
    /* empty */
  }

  const windowConfiguration = window.APP_CONFIG || {};
  return windowConfiguration.FIREBASE && windowConfiguration.FIREBASE.apiKey
    ? windowConfiguration.FIREBASE
    : null;
}
