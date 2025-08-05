import React from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

interface MainAppProps {
  onLogout: () => void;
}

const MainApp: React.FC<MainAppProps> = ({ onLogout }) => {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-white">Dashboard Gestor IA</h1>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Dashboard Cards */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h3 className="text-xl font-semibold mb-2">Resumo do Mês</h3>
            <p className="text-gray-400">Visualize suas vendas e lucros</p>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h3 className="text-xl font-semibold mb-2">Produtos</h3>
            <p className="text-gray-400">Gerencie seus produtos e preços</p>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h3 className="text-xl font-semibold mb-2">Pedidos</h3>
            <p className="text-gray-400">Acompanhe seus pedidos</p>
          </div>
        </div>

        {/* Welcome Section */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6 shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Bem-vindo ao Gestor de Confeitaria IA!</h2>
          <p className="text-gray-300">
            Seu dashboard está pronto. Em breve, você terá acesso a todas as funcionalidades
            inteligentes para gerenciar sua confeitaria.
          </p>
        </div>
      </main>
    </div>
  );
};

export default MainApp;
