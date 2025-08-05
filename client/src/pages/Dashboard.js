import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import RegistrarDespesaModal from '../components/modals/RegistrarDespesaModal';
import RegistrarPedidoModal from '../components/modals/RegistrarPedidoModal';
import CriarReceitaModal from '../components/modals/CriarReceitaModal';
import DespesasList from '../components/lists/DespesasList';
import PedidosList from '../components/lists/PedidosList';
import ReceitasList from '../components/lists/ReceitasList';
import EstoqueList from '../components/lists/EstoqueList';

function Dashboard() {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [systemMetrics, setSystemMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [showDespesaModal, setShowDespesaModal] = useState(false);
    const [showPedidoModal, setShowPedidoModal] = useState(false);
    const [showReceitaModal, setShowReceitaModal] = useState(false);
    const [activeTab, setActiveTab] = useState('despesas');

    const functions = getFunctions();

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                window.location.href = '/login';
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const getUserProfileOptimized = httpsCallable(functions, 'getUserProfileOptimized');
            const profileResult = await getUserProfileOptimized();
            setUserProfile(profileResult.data);

            const getSystemMetrics = httpsCallable(functions, 'getSystemMetrics');
            const metricsResult = await getSystemMetrics();
            setSystemMetrics(metricsResult.data);

        } catch (err) {
            console.error("Error fetching data:", err);
            setError('Falha ao carregar os dados. Tente novamente mais tarde.');
        } finally {
            setLoading(false);
        }
    };

    const handleCloseModals = () => {
        setShowDespesaModal(false);
        setShowPedidoModal(false);
        setShowReceitaModal(false);
        fetchData();
    };

    if (loading) {
        return <div>Carregando Dashboard...</div>;
    }

    if (error) {
        return <div>Erro: {error}</div>;
    }

    return (
        <>
            <div className="container mt-4">
                <header className="d-flex justify-content-between align-items-center mb-4">
                    <h2>Dashboard do Gestor</h2>
                    {userProfile && (
                        <div>
                            <strong>{userProfile.displayName}</strong> ({userProfile.plan})
                        </div>
                    )}
                </header>

                <section className="mb-4">
                    <h4>Métricas do Sistema</h4>
                    {systemMetrics ? (
                        <div className="card">
                            <div className="card-body">
                                <p>Status: {systemMetrics.health?.status}</p>
                                <p>Cache Hit Rate: {systemMetrics.cache?.hitRate.toFixed(2)}%</p>
                                <p>Total de Requisições: {systemMetrics.requests?.total}</p>
                            </div>
                        </div>
                    ) : <p>Carregando métricas...</p>}
                </section>

                <section className="mb-4">
                    <h4>Ações Rápidas</h4>
                    <div className="btn-group" role="group">
                        <button type="button" className="btn btn-primary" onClick={() => setShowDespesaModal(true)}>Registrar Despesa</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowPedidoModal(true)}>Registrar Pedido</button>
                        <button type="button" className="btn btn-info" onClick={() => setShowReceitaModal(true)}>Criar Receita</button>
                    </div>
                </section>

                <section>
                    <h4>Seus Dados</h4>
                    <ul className="nav nav-tabs">
                        <li className="nav-item">
                            <button className={`nav-link ${activeTab === 'despesas' ? 'active' : ''}`} onClick={() => setActiveTab('despesas')}>Despesas</button>
                        </li>
                        <li className="nav-item">
                            <button className={`nav-link ${activeTab === 'pedidos' ? 'active' : ''}`} onClick={() => setActiveTab('pedidos')}>Pedidos</button>
                        </li>
                        <li className="nav-item">
                            <button className={`nav-link ${activeTab === 'receitas' ? 'active' : ''}`} onClick={() => setActiveTab('receitas')}>Receitas</button>
                        </li>
                        <li className="nav-item">
                            <button className={`nav-link ${activeTab === 'estoque' ? 'active' : ''}`} onClick={() => setActiveTab('estoque')}>Estoque</button>
                        </li>
                    </ul>
                    <div className="tab-content p-3 border border-top-0">
                        {activeTab === 'despesas' && <DespesasList key={Date.now()} />}
                        {activeTab === 'pedidos' && <PedidosList key={Date.now()} />}
                        {activeTab === 'receitas' && <ReceitasList key={Date.now()} />}
                        {activeTab === 'estoque' && <EstoqueList key={Date.now()} />}
                    </div>
                </section>
            </div>

            <RegistrarDespesaModal show={showDespesaModal} handleClose={handleCloseModals} />
            <RegistrarPedidoModal show={showPedidoModal} handleClose={handleCloseModals} />
            <CriarReceitaModal show={showReceitaModal} handleClose={handleCloseModals} />
        </>
    );
}

export default Dashboard;
