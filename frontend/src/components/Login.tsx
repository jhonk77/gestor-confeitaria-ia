import React, { useState } from "react";
import { auth, googleProvider } from "../firebase";
import { signInWithPopup } from "firebase/auth";

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await signInWithPopup(auth, googleProvider);
      onLoginSuccess();
    } catch (error) {
      setError("Erro ao fazer login. Tente novamente.");
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-4">
            Gestor de Confeitaria IA
          </h1>
          <p className="text-gray-300 text-lg">
            Gerencie sua confeitaria com inteligência artificial
          </p>
        </div>

        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Bem-vindo de volta</h2>
            <p className="text-gray-400">Faça login para acessar seu dashboard</p>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-white text-gray-900 font-semibold py-3 px-4 rounded-lg flex items-center justify-center hover:bg-gray-100 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
            ) : (
              <>
                <img
                  src="https://developers.google.com/identity/images/g-logo.png"
                  alt="Google logo"
                  className="w-5 h-5 mr-3"
                />
                Entrar com Google
              </>
            )}
          </button>

          <p className="text-center text-gray-400 text-sm mt-4">
            Ao fazer login, você concorda com nossos termos de uso
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
