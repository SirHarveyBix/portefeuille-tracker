import React from "react";

export interface FirebaseUser {
  email: string | null;
}

export interface FirebaseAuthInstance {
  signOut: () => Promise<void>;
  signInWithPopup: (provider: unknown) => Promise<unknown>;
  signInWithRedirect: (provider: unknown) => Promise<unknown>;
}

interface AuthHeaderProps {
  user: FirebaseUser | null;
  authInstance: FirebaseAuthInstance | null;
  mode: "local" | "firebase";
}

export const AuthHeader: React.FC<AuthHeaderProps> = ({
  user,
  authInstance,
  mode,
}) => {
  const handleSignOut = () => {
    if (authInstance) {
      authInstance
        .signOut()
        .catch((error: unknown) => console.error("Sign out error:", error));
    }
  };

  return (
    <>
      {mode === "firebase" && user ? (
        <div id="account" className="account" style={{ display: "flex" }}>
          <span className="acc-email">{user.email || "connecté"}</span>
          <button className="acc-out" onClick={handleSignOut}>
            Déconnexion
          </button>
        </div>
      ) : (
        <div
          id="account"
          className="account"
          style={{ display: "flex", opacity: 0.7 }}
        >
          <span className="acc-email" style={{ fontSize: "11px" }}>
            Stockage Local (Hors ligne)
          </span>
        </div>
      )}
    </>
  );
};
