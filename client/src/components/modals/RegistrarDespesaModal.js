import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function RegistrarDespesaModal({ show, handleClose, expense, onSave }) {
    const [data, setData] = useState('');
    const [tipo, setTipo] = useState('');
    const [valor, setValor] = useState('');
    const [fornecedor, setFornecedor] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const functions = getFunctions();
    const isEditMode = expense != null;

    useEffect(() => {
        if (show && expense) {
            setData(expense.date);
            setTipo(expense.type);
            setValor(expense.value);
            setFornecedor(expense.supplier);
            setDescription(expense.description || '');
            setCategory(expense.category || '');
        } else if (show) {
            // Reset form when modal is opened for a new item
            setData('');
            setTipo('');
            setValor('');
            setFornecedor('');
            setDescription('');
            setCategory('');
        }
    }, [expense, show]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const expenseData = {
                data,
                tipo,
                valor: parseFloat(valor),
                fornecedor,
                description,
                category
            };

            if (isEditMode) {
                const updateExpense = httpsCallable(functions, 'updateExpense');
                await updateExpense({ expenseId: expense.id, ...expenseData });
            } else {
                const registrarDespesa = httpsCallable(functions, 'registrarDespesa');
                await registrarDespesa(expenseData);
            }
            onSave(); // Callback to refresh the list
            handleClose(); // Close modal on success
        } catch (err) {
            console.error("Error saving expense:", err);
            setError('Falha ao salvar a despesa. Verifique os dados e tente novamente.');
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
                        <h5 className="modal-title">{isEditMode ? 'Editar Despesa' : 'Registrar Nova Despesa'}</h5>
                        <button type="button" className="btn-close" onClick={handleClose}></button>
                    </div>
                    <div className="modal-body">
                        {error && <div className="alert alert-danger">{error}</div>}
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor="data" className="form-label">Data</label>
                                <input type="date" className="form-control" id="data" value={data} onChange={(e) => setData(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="tipo" className="form-label">Tipo</label>
                                <input type="text" className="form-control" id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex: Ingredientes, Embalagens" required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="valor" className="form-label">Valor</label>
                                <input type="number" className="form-control" id="valor" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00" required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="fornecedor" className="form-label">Fornecedor</label>
                                <input type="text" className="form-control" id="fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Ex: Mercado Local" />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="description" className="form-label">Descrição</label>
                                <textarea className="form-control" id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows="3"></textarea>
                            </div>
                            <div className="mb-3">
                                <label htmlFor="category" className="form-label">Categoria</label>
                                <input type="text" className="form-control" id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Matéria-prima, Frete" />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Salvando...' : 'Salvar Despesa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RegistrarDespesaModal;
