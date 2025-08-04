import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import GerenciarEstoqueModal from '../modals/GerenciarEstoqueModal';

function EstoqueList() {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);

    const functions = getFunctions();

    useEffect(() => {
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        setLoading(true);
        setError(null);
        try {
            const getInventoryFunc = httpsCallable(functions, 'getInventory');
            const result = await getInventoryFunc();
            setInventory(result.data.inventory);
        } catch (err) {
            console.error("Error fetching inventory:", err);
            setError('Falha ao carregar o estoque.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddItem = () => {
        setCurrentItem(null);
        setShowModal(true);
    };

    const handleEditItem = (item) => {
        setCurrentItem(item);
        setShowModal(true);
    };

    const handleDeleteItem = async (itemId) => {
        if (window.confirm('Tem certeza que deseja excluir este item do estoque?')) {
            try {
                const deleteInventoryItem = httpsCallable(functions, 'deleteInventoryItem');
                await deleteInventoryItem({ itemId });
                fetchInventory(); // Refresh list
            } catch (err) {
                console.error("Error deleting item:", err);
                setError('Falha ao excluir o item.');
            }
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setCurrentItem(null);
    };

    const handleSaveItem = () => {
        fetchInventory(); // Refresh list after save
        handleCloseModal();
    };

    if (loading) {
        return <div>Carregando estoque...</div>;
    }

    if (error) {
        return <div>Erro: {error}</div>;
    }

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h3>Seu Estoque</h3>
                <button className="btn btn-success" onClick={handleAddItem}>Adicionar Item</button>
            </div>
            {inventory.length === 0 ? (
                <p>Nenhum item no estoque ainda.</p>
            ) : (
                <table className="table table-striped">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Quantidade</th>
                            <th>Unidade</th>
                            <th>Alerta de Estoque Baixo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {inventory.map((item) => (
                            <tr key={item.id} className={item.quantity <= item.lowStockThreshold ? 'table-danger' : ''}>
                                <td>{item.name}</td>
                                <td>{item.quantity}</td>
                                <td>{item.unit}</td>
                                <td>{item.lowStockThreshold}</td>
                                <td>
                                    <button className="btn btn-sm btn-outline-primary me-2" onClick={() => handleEditItem(item)}>Editar</button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteItem(item.id)}>Excluir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <GerenciarEstoqueModal show={showModal} handleClose={handleCloseModal} item={currentItem} onSave={handleSaveItem} />
        </div>
    );
}

export default EstoqueList;
