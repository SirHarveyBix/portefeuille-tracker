import React, { useState, useEffect, useRef } from "react";
import { AllocationConfig, PortfolioModel } from "./types";
import { resolveFirebaseConfig, store } from "./utils/storage";
import { restoreModel } from "./utils/csvParser";
import { fetchVixFromServer } from "./utils/marketVix";
import { OverviewTab } from "./components/OverviewTab";
import { ConstellationTab } from "./components/ConstellationTab";
import { AllocationTab } from "./components/AllocationTab";
import { CSVUploader } from "./components/CSVUploader";
import {
  AuthHeader,
  FirebaseUser,
  FirebaseAuthInstance,
} from "./components/AuthHeader";

export const APP_VERSION = "2.2.0";

const ALLOCATION_SEED: AllocationConfig = {
  monthly: 100,
  core: [
    { name: "MSCI ACWI", amount: 800, target: 50, band: 5 },
    { name: "Thématique 1", amount: 240, target: 15, band: 5 },
    { name: "Thématique 2", amount: 240, target: 15, band: 5 },
    { name: "Thématique 3", amount: 160, target: 10, band: 5 },
    { name: "Or physique", amount: 160, target: 10, band: 5 },
  ],
  sat: [
    { name: "Argent", amount: 40, target: 2, band: 5 },
    { name: "Bitcoin", amount: 160, target: 10, band: 5 },
  ],
  aliases: {},
  vix: 0,
  vixTimestamp: 0,
  vixDate: "",
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "overview" | "constellation" | "allocation"
  >("overview");
  const [model, setModel] = useState<PortfolioModel | null>(null);
  const [allocation, setAllocation] =
    useState<AllocationConfig>(ALLOCATION_SEED);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Authentication states
  const [storageMode, setStorageMode] = useState<"local" | "firebase">("local");
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseAuth, setFirebaseAuth] = useState<FirebaseAuthInstance | null>(
    null,
  );
  const [isGated, setIsGated] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);

  const vixAutoFetchedRef = useRef(false);

  const firebaseGlobal = window.firebase;
  const configEmail = window.APP_CONFIG?.OWNER_EMAIL || "";

  // 1. Initialise Firebase Auth and Storage mode
  useEffect(() => {
    let active = true;
    let unsubscribeAuth: (() => void) | null = null;

    async function initLocalMode() {
      setStorageMode("local");
      const localAllocation = await store.loadAllocation(ALLOCATION_SEED);
      const localModel = await store.loadModel();
      if (active) {
        setAllocation(localAllocation);
        if (localModel) {
          setModel(localModel);
          setLoadedFileName("Portfolio");
          setFromCache(true);
        }
        setIsInitializing(false);
      }
    }

    async function init() {
      if (typeof firebaseGlobal === "undefined") {
        await initLocalMode();
        return;
      }

      const firebaseConfiguration = await resolveFirebaseConfig();
      if (!firebaseConfiguration) {
        await initLocalMode();
        return;
      }

      // Initialize Firebase SDK
      try {
        if (!firebaseGlobal.apps.length) {
          firebaseGlobal.initializeApp(firebaseConfiguration);
        }
        const auth = firebaseGlobal.auth();
        const databaseInstance = firebaseGlobal.firestore();
        setFirebaseAuth(auth);

        auth.getRedirectResult().catch((redirectError: unknown) => {
          console.warn("Firebase redirect result error:", redirectError);
        });

        unsubscribeAuth = auth.onAuthStateChanged(
          async (user: { uid: string; email: string | null } | null) => {
            if (!active) return;
            if (!user) {
              store.setFirebase(null);
              setStorageMode("local");
              setFirebaseUser(null);
              setIsGated(true);
              setIsInitializing(false);
              return;
            }

            try {
              // Email check BEFORE arming the store — prevents unauthorized UID in store
              if (configEmail && user.email && user.email !== configEmail) {
                throw new Error("Compte non autorisé.");
              }

              store.setFirebase({
                auth,
                database: databaseInstance,
                userIdentifier: user.uid,
              });
              setStorageMode("firebase");

              const document = await databaseInstance
                .collection("portfolios")
                .doc(user.uid)
                .get();

              const data = document.exists ? document.data() : undefined;

              let databaseAllocation: AllocationConfig;
              if (data?.allocation) {
                databaseAllocation = data.allocation;
              } else {
                databaseAllocation = ALLOCATION_SEED;
              }

              // Model: Firestore → localStorage (migration V1) → null
              let databaseModel: PortfolioModel | null = null;
              if (data?.model) {
                databaseModel = restoreModel(data.model);
              }
              if (!databaseModel) {
                try {
                  const lsModelRaw = localStorage.getItem("pf-model-v1");
                  if (lsModelRaw) {
                    databaseModel = restoreModel(JSON.parse(lsModelRaw));
                  }
                } catch {
                  /* empty */
                }
              }

              setAllocation(databaseAllocation);
              if (databaseModel) {
                setModel(databaseModel);
                setLoadedFileName("Portfolio (Cloud)");
                setFromCache(true);
              }
              setFirebaseUser(user);
              setIsGated(false);
            } catch (error: unknown) {
              store.setFirebase(null);
              setStorageMode("local");
              const errorMessage = error instanceof Error ? error.message : "";
              setAuthErrorMessage(
                errorMessage === "Compte non autorisé."
                  ? "Compte non autorisé. Seul le propriétaire peut accéder à ce tableau de bord."
                  : "Erreur d'accès à la base de données Cloud.",
              );
              setIsGated(true);
              await auth.signOut().catch(() => {});
            }
            setIsInitializing(false);
          },
        );
      } catch (error) {
        console.error("Firebase init error:", error);
        setStorageMode("local");
        setIsInitializing(false);
      }
    }

    init();

    return () => {
      active = false;
      unsubscribeAuth?.();
    };
  }, []);

  // 2. VIX auto-fetch au niveau session — s'exécute une seule fois après init
  useEffect(() => {
    if (isInitializing || vixAutoFetchedRef.current) return;
    vixAutoFetchedRef.current = true;
    const vixConfig = window.APP_CONFIG?.VIX || { source: "convextrade" };
    if (!vixConfig.source || vixConfig.source === "off") return;
    const isStale =
      !allocation.vixTimestamp ||
      Date.now() - allocation.vixTimestamp > 6 * 3600 * 1000;
    if (!isStale) return;
    fetchVixFromServer(vixConfig)
      .then((result) => {
        const vixTs = Date.now();
        setAllocation((current) => {
          const updated: AllocationConfig = {
            ...current,
            vix: result.vix,
            vixTimestamp: vixTs,
            vixDate: result.date,
          };
          store.saveAllocation(updated);
          return updated;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitializing]);

  const handleModelLoaded = (newModel: PortfolioModel, fileName: string) => {
    setModel(newModel);
    setLoadedFileName(fileName);
    setFromCache(false);
    store.saveModel(newModel);
  };

  const handleAllocationChange = (newAllocation: AllocationConfig) => {
    setAllocation(newAllocation);
    store.saveAllocation(newAllocation);
  };

  const handleResetAllocation = () => {
    handleAllocationChange(JSON.parse(JSON.stringify(ALLOCATION_SEED)));
  };

  const handleAliasChange = (csvName: string, allocName: string) => {
    const nextAliases = { ...allocation.aliases, [csvName]: allocName };
    handleAllocationChange({ ...allocation, aliases: nextAliases });
  };

  const handleSignIn = () => {
    if (firebaseAuth && firebaseGlobal) {
      const provider = new firebaseGlobal.auth.GoogleAuthProvider();
      firebaseAuth.signInWithPopup(provider).catch((error: unknown) => {
        const hasCode = (value: unknown): value is { code: string } =>
          !!value && typeof value === "object" && "code" in value;
        const code = hasCode(error) ? error.code : undefined;
        if (
          code === "auth/popup-blocked" ||
          code === "auth/operation-not-supported-in-this-environment" ||
          code === "auth/cancelled-popup-request"
        ) {
          firebaseAuth.signInWithRedirect(provider);
        } else {
          setAuthErrorMessage("Échec de connexion. Réessaie.");
        }
      });
    }
  };

  if (isInitializing) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: "14px",
          fontFamily: "var(--font-sans)",
        }}
      >
        Initialisation de l'application…
      </div>
    );
  }

  // Render Auth Gate if locked
  if (isGated) {
    return (
      <div id="authgate" className="overlay open">
        <div className="modal authmodal">
          <h2>Suivi de portefeuille</h2>
          <p>Connexion sécurisée requise.</p>
          <button id="ag-btn" className="gbtn" onClick={handleSignIn}>
            Se connecter avec Google
          </button>
          {authErrorMessage && (
            <p id="ag-msg" className="ag-msg">
              {authErrorMessage}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <p className="eyebrow">DCA &amp; rééquilibrage</p>
          <h1>Suivi de portefeuille</h1>
        </div>
        <div className="head-right">
          <AuthHeader
            user={firebaseUser}
            authInstance={firebaseAuth}
            mode={storageMode}
          />
          <CSVUploader
            onModelLoaded={handleModelLoaded}
            loadedFileName={loadedFileName}
            fromCache={fromCache}
          />
        </div>
      </header>

      <nav id="tabs" className="tabs" role="tablist">
        <button
          className={activeTab === "overview" ? "active" : ""}
          onClick={() => setActiveTab("overview")}
          aria-selected={activeTab === "overview" ? "true" : "false"}
          aria-controls="tab-overview"
          role="tab"
        >
          <span className="ti">▦</span>
          <span className="tlabel">Vue d'ensemble</span>
        </button>
        <button
          className={activeTab === "constellation" ? "active" : ""}
          onClick={() => setActiveTab("constellation")}
          aria-selected={activeTab === "constellation" ? "true" : "false"}
          aria-controls="tab-constellation"
          role="tab"
        >
          <span className="ti">✦</span>
          <span className="tlabel">Constellation</span>
        </button>
        <button
          className={activeTab === "allocation" ? "active" : ""}
          onClick={() => setActiveTab("allocation")}
          aria-selected={activeTab === "allocation" ? "true" : "false"}
          aria-controls="tab-allocation"
          role="tab"
        >
          <span className="ti">◎</span>
          <span className="tlabel">Allocation</span>
        </button>
      </nav>

      {activeTab === "overview" && (
        <section className="tab-panel active" id="tab-overview" role="tabpanel">
          {model ? (
            <OverviewTab model={model} />
          ) : (
            <div id="ov-empty" className="empty-state">
              <div className="es-ic">▦</div>
              <h3>Aucune donnée chargée</h3>
              <p>
                Charge ton export de transactions (CSV). Il est analysé
                directement dans ton navigateur.
              </p>
            </div>
          )}
        </section>
      )}

      {activeTab === "constellation" && (
        <section
          className="tab-panel active"
          id="tab-constellation"
          role="tabpanel"
        >
          {model ? (
            <ConstellationTab
              model={model}
              allocation={allocation}
              onAliasChange={handleAliasChange}
            />
          ) : (
            <div id="const-empty" className="empty-state">
              <div className="es-ic">✦</div>
              <h3>La constellation s'affiche après chargement</h3>
              <p>
                Chaque instrument devient une bulle dont la taille reflète le
                montant investi.
              </p>
            </div>
          )}
        </section>
      )}

      {activeTab === "allocation" && (
        <section
          className="tab-panel active"
          id="tab-allocation"
          role="tabpanel"
        >
          <AllocationTab
            allocation={allocation}
            onAllocationChange={handleAllocationChange}
            onReset={handleResetAllocation}
          />
        </section>
      )}

      <footer>
        Le CSV reste sur l'appareil · seules les valeurs d'allocation sont
        conservées
        <span id="verbtn" className="verbtn">
          v{APP_VERSION}
        </span>
      </footer>
    </div>
  );
};
