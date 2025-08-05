import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function GerenciarEstoqueModal({ show, handleClose, item, onSave }) {
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('unidades');
    const [lowStockThreshold, setLowStockThreshold] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const functions = getFunctions();
    const isEditMode = item != null;

    useEffect(() => {
        if (show && item) {
            setName(item.name);
            setQuantity(item.quantity);
            setUnit(item.unit);
            setLowStockThreshold(item.lowStockThreshold);
        } else {
            // Reset form when modal is opened for a new item
            setName('');
            setQuantity('');
            setUnit('unidades');
            setLowStockThreshold('');
        }
    }, [item, show]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isEditMode) {
                const updateInventoryItem = httpsCallable(functions, 'updateInventoryItem');
                await updateInventoryItem({ 
                    itemId: item.id,
                    name,
                    quantity: Number(quantity),
                    unit,
                    lowStockThreshold: Number(lowStockThreshold)
                });
            } else {
                const addInventoryItem = httpsCallable(functions, 'addInventoryItem');
                await addInventoryItem({ 
                    name,
                    quantity: Number(quantity),
                    unit,
                    lowStockThreshold: Number(lowStockThreshold)
                });
            }
            onSave(); // Callback to refresh the list
            handleClose();
        } catch (err) {
            console.error("Error saving inventory item:", err);
            setError('Falha ao salvar o item. Verifique os dados e tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    if (!show) {
        return null;
    }

    return (
        <div className="modal show d-block" tabIndex="-1">
            <div className="modal-dialog">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">{isEditMode ? 'Editar Item' : 'Adicionar Item ao Estoque'}</h5>
                        <button type="button" className="btn-close" onClick={handleClose}></button>
                    </div>
                    <div className="modal-body">
                        {error && <div className="alert alert-danger">{error}</div>}
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label className="form-label">Nome do Item</label>
                                <input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className="row">
                                <div className="col-md-6 mb-3">
                                    <label className="form-label">Quantidade</label>
                                    <input type="number" className="form-control" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                                </div>
                                <div className="col-md-6 mb-3">
                                    <label className="form-label">Unidade</label>
                                    <select className="form-select" value={unit} onChange={(e) => setUnit(e.target.value)} required>
                                        <option value="unidades">Unidades</option>
                                        <option value="kg">Kg</option>
                                        <option value="g">g</option>
                                        <option value="litros">Litros</option>
                                        <option value="ml">ml</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Alerta de Estoque Baixo</label>
                                <input type="number" className="form-control" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} placeholder="Ex: 10" required />
                                <div className="form-text">O sistema irá alertá-lo quando a quantidade for igual ou inferior a este valor.</div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default GerenciarEstoqueModal;
